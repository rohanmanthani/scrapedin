import { Router } from "express";
import { asyncHandler } from "./utils.js";
import { SearchTaskService } from "../services/SearchTaskService.js";
import { AutomationSettingsService } from "../services/AutomationSettingsService.js";
import type { AutomationController } from "../automation/AutomationController.js";
import type { SearchTask } from "../types.js";

export const createTaskRouter = (
  taskService: SearchTaskService,
  settingsService: AutomationSettingsService,
  automationController?: AutomationController
): Router => {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const tasks = await taskService.list();
      res.json(tasks);
    })
  );

  router.post(
    "/accounts",
    asyncHandler(async (req, res) => {
      const { accountUrls, name, leadListName } = req.body ?? {};
      if (!Array.isArray(accountUrls) || accountUrls.length === 0) {
        res.status(400).json({ error: "accountUrls must be a non-empty array" });
        return;
      }
      const trimmed = accountUrls
        .map((url: unknown) => (typeof url === "string" ? url.trim() : ""))
        .filter((url: string) => url.length > 0);
      if (trimmed.length === 0) {
        res.status(400).json({ error: "accountUrls must include at least one valid URL" });
        return;
      }
      const settings = await settingsService.get();
      const task = await taskService.createAccountsTask(settings, {
        name,
        accountUrls: trimmed,
        targetLeadListName: typeof leadListName === "string" ? leadListName.trim() || undefined : undefined
      });
      res.status(201).json(task);
    })
  );

  router.post(
    "/posts",
    asyncHandler(async (req, res) => {
      const { postUrls, scrapeReactions, scrapeCommenters, name, leadListName } = req.body ?? {};
      if (!Array.isArray(postUrls) || postUrls.length === 0) {
        res.status(400).json({ error: "postUrls must be a non-empty array" });
        return;
      }
      const trimmed = postUrls
        .map((url: unknown) => (typeof url === "string" ? url.trim() : ""))
        .filter((url: string) => url.length > 0);
      if (trimmed.length === 0) {
        res.status(400).json({ error: "postUrls must include at least one valid URL" });
        return;
      }
      const reactionsFlag = Boolean(scrapeReactions);
      const commentsFlag = Boolean(scrapeCommenters);
      if (!reactionsFlag && !commentsFlag) {
        res.status(400).json({ error: "Select at least one engagement type to scrape" });
        return;
      }
      const settings = await settingsService.get();
      const task = await taskService.createPostTask(settings, {
        name,
        postUrls: trimmed,
        scrapeReactions: reactionsFlag,
        scrapeCommenters: commentsFlag,
        targetLeadListName: typeof leadListName === "string" ? leadListName.trim() || undefined : undefined
      });
      res.status(201).json(task);
    })
  );

  router.patch(
    "/:taskId",
    asyncHandler(async (req, res) => {
      const { name, status, scheduledFor } = req.body ?? {};
      let task;
      if (status) {
        if ((status === "pending" || status === "queued") && automationController) {
          const currentSettings = await settingsService.get();
          if (!currentSettings.enabled) {
            await settingsService.update({
              ...currentSettings,
              enabled: true
            });
            automationController.start();
          }
          automationController.runNow({ bypassQuietHours: true });
        }
        const updates: Partial<SearchTask> = {};
        if (typeof name === "string") {
          updates.name = name;
        }
        if (typeof scheduledFor === "string") {
          updates.scheduledFor = scheduledFor;
        }
        task = await taskService.updateStatus(req.params.taskId, status, updates);
      } else if (name || scheduledFor) {
        task = await taskService.update(req.params.taskId, {
          ...(name ? { name } : {}),
          ...(scheduledFor ? { scheduledFor } : {})
        });
      } else {
        res.status(400).json({ error: "No valid fields provided" });
        return;
      }
      res.json(task);
    })
  );

  router.delete(
    "/:taskId",
    asyncHandler(async (req, res) => {
      await taskService.delete(req.params.taskId);
      res.status(204).send();
    })
  );

  return router;
};
