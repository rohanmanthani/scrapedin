import { setInterval as setIntervalSafe, clearInterval as clearIntervalSafe } from "node:timers";
import { appConfig } from "../config.js";
import { logger } from "../logger.js";
import type { AutomationSettings, SearchTask, SearchTaskType } from "../types.js";
import { LinkedInNavigatorClient } from "../linkedin/LinkedInNavigatorClient.js";
import { AccountFollowersScraper } from "../linkedin/AccountFollowersScraper.js";
import { PostEngagementScraper } from "../linkedin/PostEngagementScraper.js";
import { AutomationSettingsService } from "../services/AutomationSettingsService.js";
import { SearchTaskService } from "../services/SearchTaskService.js";
import { SearchPresetService } from "../services/SearchPresetService.js";
import { LeadService } from "../services/LeadService.js";

const isWithinQuietHours = (settings: AutomationSettings, now = new Date()): boolean => {
  if (!settings.respectQuietHours || !settings.quietHours) {
    return false;
  }
  const { startHour, endHour } = settings.quietHours;
  const hour = now.getHours();
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
};

const SUPPORTED_TASK_TYPES = new Set<SearchTaskType>([
  "sales_navigator",
  "account_followers",
  "post_engagement"
]);

const pickQueueableTasks = (
  tasks: SearchTask[],
  limit: number,
  activeTaskIds: Set<string>
): SearchTask[] => {
  if (limit <= 0) {
    return [];
  }
  return tasks
    .filter(
      (task) =>
        SUPPORTED_TASK_TYPES.has(task.type ?? "sales_navigator") &&
        task.status !== "draft" &&
        (task.status === "pending" || task.status === "queued") &&
        (!task.scheduledFor || new Date(task.scheduledFor) <= new Date())
    )
    .filter((task) => !activeTaskIds.has(task.id))
    .sort((a, b) => {
      const aTime = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0;
      const bTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0;
      return aTime - bTime;
    })
    .slice(0, limit);
};

const isToday = (iso?: string): boolean => {
  if (!iso) {
    return false;
  }
  const value = new Date(iso);
  const now = new Date();
  return (
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate()
  );
};

type TickOptions = {
  bypassQuietHours?: boolean;
  bypassDailyLimits?: boolean;
};

export class AutomationController {
  private timer?: NodeJS.Timeout;
  private processing = false;
  private readonly activeTaskIds = new Set<string>();
  private readonly supportedTaskTypes: Set<SearchTaskType> = SUPPORTED_TASK_TYPES;
  private pendingTickOptions?: TickOptions;

  constructor(
    private readonly automationSettings: AutomationSettingsService,
    private readonly taskService: SearchTaskService,
    private readonly presetService: SearchPresetService,
    private readonly leadService: LeadService
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setIntervalSafe(() => {
      this.queueTick();
    }, appConfig.backgroundTickMs);
    this.queueTick();
    logger.info("Automation controller started");
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearIntervalSafe(this.timer);
    this.timer = undefined;
    logger.info("Automation controller stopped");
  }

  runNow(options?: TickOptions): void {
    if (!this.timer) {
      this.start();
    }
    this.queueTick(options);
  }

  private queueTick(options?: TickOptions): void {
    if (options) {
      this.pendingTickOptions = this.mergeTickOptions(this.pendingTickOptions, options);
    }
    if (this.processing) {
      if (!options && this.pendingTickOptions) {
        // already scheduled by existing pending options.
        return;
      }
      this.pendingTickOptions = this.mergeTickOptions(this.pendingTickOptions, options ?? {});
      return;
    }
    const nextOptions = this.mergeTickOptions(undefined, options ?? this.pendingTickOptions);
    this.pendingTickOptions = undefined;
    void this.tick(nextOptions);
  }

  private mergeTickOptions(current: TickOptions | undefined, incoming?: TickOptions): TickOptions | undefined {
    if (!current && !incoming) {
      return undefined;
    }
    if (!current) {
      return incoming;
    }
    if (!incoming) {
      return current;
    }
    return {
      bypassQuietHours: Boolean(current.bypassQuietHours || incoming.bypassQuietHours),
      bypassDailyLimits: Boolean(current.bypassDailyLimits || incoming.bypassDailyLimits)
    };
  }

  private async tick(options?: TickOptions): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      const settings = await this.automationSettings.get();
      const maxConcurrent = Math.max(settings.concurrentSearches ?? 1, 1);
      if (!settings.enabled && !options?.bypassDailyLimits) {
        return;
      }
      if (!options?.bypassQuietHours && isWithinQuietHours(settings)) {
        logger.debug("Skipped automation tick because quiet hours are active");
        return;
      }

      const tasks = await this.taskService.list();
      const successfulToday = tasks.filter((task) => task.status === "succeeded" && isToday(task.completedAt)).length;
      if (!options?.bypassDailyLimits && settings.dailySearchLimit > 0 && successfulToday >= settings.dailySearchLimit) {
        logger.debug("Daily search limit reached; skipping automation tick");
        return;
      }

      const leads = await this.leadService.list();
      const leadsToday = leads.filter((lead) => isToday(lead.capturedAt)).length;
      if (!options?.bypassDailyLimits && settings.dailyLeadCap > 0 && leadsToday >= settings.dailyLeadCap) {
        logger.debug("Daily lead cap reached; skipping automation tick");
        return;
      }

      const availableSlots = Math.max(maxConcurrent - this.activeTaskIds.size, 0);
      if (availableSlots <= 0) {
        logger.debug("All concurrent automation slots are busy");
        return;
      }

      const queueable = pickQueueableTasks(tasks, availableSlots, this.activeTaskIds);
      if (queueable.length === 0) {
        return;
      }

      queueable.forEach((task) => {
        this.startTask(task);
      });
    } catch (error) {
      logger.error({ err: error }, "Automation tick failed");
    } finally {
      this.processing = false;
      if (this.pendingTickOptions) {
        const nextOptions = this.pendingTickOptions;
        this.pendingTickOptions = undefined;
        this.queueTick(nextOptions);
      }
    }
  }

  private startTask(task: SearchTask): void {
    this.activeTaskIds.add(task.id);
    void this.executeTask(task)
      .catch((error) => {
        logger.error({ err: error, taskId: task.id }, "Automation task execution failed");
      })
      .finally(() => {
        this.activeTaskIds.delete(task.id);
        // Trigger another tick to fill freed slot.
        void this.tick();
      });
  }

  private async executeTask(task: SearchTask): Promise<void> {
    const type = (task.type ?? "sales_navigator") as SearchTaskType;
    if (!this.supportedTaskTypes.has(type)) {
      logger.warn({ taskId: task.id, type }, "Skipping unsupported automation task type");
      return;
    }

    switch (type) {
      case "sales_navigator":
        await this.executeSalesNavigatorTask(task);
        break;
      case "account_followers":
        await this.executeAccountFollowersTask(task);
        break;
      case "post_engagement":
        await this.executePostEngagementTask(task);
        break;
      default:
        logger.warn({ taskId: task.id, type }, "Unhandled task type encountered by automation controller");
    }
  }

  private async executeSalesNavigatorTask(task: SearchTask): Promise<void> {
    if (!task.presetId) {
      logger.warn({ taskId: task.id }, "Sales Navigator task missing preset reference");
      return;
    }
    logger.info({ taskId: task.id, presetId: task.presetId }, "Running search automation task");
    const preset = await this.presetService.get(task.presetId);
    if (!preset) {
      logger.warn({ taskId: task.id }, "Preset not found for task");
      await this.taskService.updateStatus(task.id, "failed", {
        errorMessage: "Preset not found",
        completedAt: new Date().toISOString()
      });
      return;
    }

    const client = new LinkedInNavigatorClient(task.settingsSnapshot);
    await this.taskService.updateStatus(task.id, "running", { startedAt: new Date().toISOString() });

    try {
      const leads = await client.runSearch(preset, task.name);
      await this.leadService.append(leads);
      await this.presetService.recordSuccessfulRun(preset.id, leads.length);
      await this.taskService.updateStatus(task.id, "succeeded", {
        completedAt: new Date().toISOString(),
        resultLeadIds: leads.map((lead) => lead.id)
      });
    } catch (error) {
      logger.error({ err: error, taskId: task.id }, "Search task failed");
      await this.taskService.updateStatus(task.id, "failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });
    } finally {
      await client.dispose();
    }
  }

  private async executeAccountFollowersTask(task: SearchTask): Promise<void> {
    const payload = task.payload ?? {};
    const accountUrls = payload.accountUrls ?? [];
    if (!accountUrls.length) {
      logger.warn({ taskId: task.id }, "Account follower task missing URLs");
      await this.taskService.updateStatus(task.id, "failed", {
        errorMessage: "No account URLs provided",
        completedAt: new Date().toISOString()
      });
      return;
    }

    const scraper = new AccountFollowersScraper(task.settingsSnapshot);
    await this.taskService.updateStatus(task.id, "running", { startedAt: new Date().toISOString() });

    try {
      const leads = await scraper.scrape({
        taskId: task.id,
        taskName: task.name,
        accountUrls,
        leadListName: payload.targetLeadListName,
        maxProfiles: this.settingsResultCap(task)
      });
      if (leads.length) {
        await this.leadService.append(leads);
      }
      await this.taskService.updateStatus(task.id, "succeeded", {
        completedAt: new Date().toISOString(),
        resultLeadIds: leads.map((lead) => lead.id)
      });
    } catch (error) {
      logger.error({ err: error, taskId: task.id }, "Account follower task failed");
      await this.taskService.updateStatus(task.id, "failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });
    } finally {
      await scraper.dispose();
    }
  }

  private async executePostEngagementTask(task: SearchTask): Promise<void> {
    const payload = task.payload ?? {};
    const postUrls = payload.postUrls ?? [];
    const scrapeReactions = Boolean(payload.scrapeReactions);
    const scrapeCommenters = Boolean(payload.scrapeCommenters);
    if (!postUrls.length) {
      logger.warn({ taskId: task.id }, "Post engagement task missing post URLs");
      await this.taskService.updateStatus(task.id, "failed", {
        errorMessage: "No post URLs provided",
        completedAt: new Date().toISOString()
      });
      return;
    }
    if (!scrapeReactions && !scrapeCommenters) {
      logger.warn({ taskId: task.id }, "Post engagement task missing engagement targets");
      await this.taskService.updateStatus(task.id, "failed", {
        errorMessage: "Select at least one engagement type",
        completedAt: new Date().toISOString()
      });
      return;
    }

    const scraper = new PostEngagementScraper(task.settingsSnapshot);
    await this.taskService.updateStatus(task.id, "running", { startedAt: new Date().toISOString() });

    try {
      const leads = await scraper.scrape({
        taskId: task.id,
        taskName: task.name,
        postUrls,
        scrapeReactions,
        scrapeCommenters,
        leadListName: payload.targetLeadListName,
        maxProfiles: this.settingsResultCap(task)
      });
      if (leads.length) {
        await this.leadService.append(leads);
      }
      await this.taskService.updateStatus(task.id, "succeeded", {
        completedAt: new Date().toISOString(),
        resultLeadIds: leads.map((lead) => lead.id)
      });
    } catch (error) {
      logger.error({ err: error, taskId: task.id }, "Post engagement task failed");
      await this.taskService.updateStatus(task.id, "failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });
    } finally {
      await scraper.dispose();
    }
  }

  private settingsResultCap(task: SearchTask): number | undefined {
    const configured = task.settingsSnapshot?.resultsPerPage ?? 0;
    return configured > 0 ? configured : undefined;
  }
}
