import { randomUUID } from "node:crypto";
import type { AutomationSettings, SearchTask, SearchTaskPayload, TaskStatus } from "../types.js";
import { AppStateRepository } from "../repositories/AppStateRepository.js";

const nowIso = () => new Date().toISOString();

export class SearchTaskService {
  constructor(private readonly repository: AppStateRepository) {}

  async list(): Promise<SearchTask[]> {
    const tasks = await this.repository.listTasks();
    return tasks.map((task) => this.withDefaults(task));
  }

  private withDefaults(task: SearchTask): SearchTask {
    return {
      ...task,
      type: task.type ?? "sales_navigator",
      presetId: task.presetId,
      payload: task.payload ?? {}
    };
  }

  async createDraft(
    presetId: string,
    settings: AutomationSettings,
    name?: string,
    payload?: SearchTaskPayload
  ): Promise<SearchTask> {
    const task: SearchTask = {
      id: randomUUID(),
      type: "sales_navigator",
      presetId,
      status: "draft",
      createdAt: nowIso(),
      name,
      resultLeadIds: [],
      settingsSnapshot: settings,
      payload
    };
    return this.withDefaults(await this.repository.saveTask(task));
  }

  async queue(presetId: string, settings: AutomationSettings, scheduledFor?: Date): Promise<SearchTask> {
    const task: SearchTask = {
      id: randomUUID(),
      type: "sales_navigator",
      presetId,
      status: "pending",
      createdAt: nowIso(),
      scheduledFor: (scheduledFor ?? new Date()).toISOString(),
      settingsSnapshot: settings,
      name: undefined,
      resultLeadIds: [],
      payload: undefined
    };
    return this.withDefaults(await this.repository.saveTask(task));
  }

  async createAccountsTask(
    settings: AutomationSettings,
    input: { name?: string; accountUrls: string[]; targetLeadListName?: string }
  ): Promise<SearchTask> {
    const task: SearchTask = {
      id: randomUUID(),
      type: "account_followers",
      status: "draft",
      createdAt: nowIso(),
      name: input.name ?? "Account Followers",
      resultLeadIds: [],
      settingsSnapshot: settings,
      payload: {
        accountUrls: input.accountUrls,
        targetLeadListName: input.targetLeadListName
      }
    };
    return this.withDefaults(await this.repository.saveTask(task));
  }

  async createPostTask(
    settings: AutomationSettings,
    input: {
      name?: string;
      postUrls: string[];
      scrapeReactions: boolean;
      scrapeCommenters: boolean;
      targetLeadListName?: string;
    }
  ): Promise<SearchTask> {
    const task: SearchTask = {
      id: randomUUID(),
      type: "post_engagement",
      status: "draft",
      createdAt: nowIso(),
      name: input.name ?? "Post Engagement",
      resultLeadIds: [],
      settingsSnapshot: settings,
      payload: {
        postUrls: input.postUrls,
        scrapeReactions: input.scrapeReactions,
        scrapeCommenters: input.scrapeCommenters,
        targetLeadListName: input.targetLeadListName
      }
    };
    return this.withDefaults(await this.repository.saveTask(task));
  }

  async createProfileTask(
    settings: AutomationSettings,
    input: { name?: string; profileUrls: string[]; targetLeadListName?: string }
  ): Promise<SearchTask> {
    const task: SearchTask = {
      id: randomUUID(),
      type: "profile_scrape",
      status: "draft",
      createdAt: nowIso(),
      name: input.name ?? "Profile List",
      resultLeadIds: [],
      settingsSnapshot: settings,
      payload: {
        profileUrls: input.profileUrls,
        targetLeadListName: input.targetLeadListName
      }
    };
    return this.withDefaults(await this.repository.saveTask(task));
  }

  async update(taskId: string, patch: Partial<SearchTask>): Promise<SearchTask> {
    const tasks = await this.repository.listTasks();
    const existing = tasks.find((task) => task.id === taskId);
    if (!existing) {
      throw new Error(`Task ${taskId} not found`);
    }
    const updated: SearchTask = {
      ...existing,
      ...patch
    };
    const saved = await this.repository.saveTask(updated);
    return this.withDefaults(saved);
  }

  async updateStatus(taskId: string, status: TaskStatus, updates: Partial<SearchTask> = {}): Promise<SearchTask> {
    const tasks = await this.repository.listTasks();
    const existing = tasks.find((task) => task.id === taskId);
    if (!existing) {
      throw new Error(`Task ${taskId} not found`);
    }
    const updated: SearchTask = {
      ...existing,
      ...updates,
      status
    };
    if (status === "draft") {
      updated.scheduledFor = undefined;
      updated.startedAt = undefined;
      updated.completedAt = undefined;
      updated.errorMessage = undefined;
      updated.resultLeadIds = [];
    } else if (status === "pending" || status === "queued") {
      updated.scheduledFor = updates.scheduledFor ?? existing.scheduledFor ?? nowIso();
      updated.startedAt = undefined;
      updated.completedAt = undefined;
      updated.errorMessage = undefined;
      updated.resultLeadIds = [];
    }
    const saved = await this.repository.saveTask(updated);
    return this.withDefaults(saved);
  }

  async delete(taskId: string): Promise<void> {
    await this.repository.deleteTask(taskId);
  }
}
