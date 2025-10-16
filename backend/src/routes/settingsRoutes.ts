import { Router } from "express";
import { asyncHandler } from "./utils.js";
import { AutomationSettingsService } from "../services/AutomationSettingsService.js";
import { fetchLinkedInSessionCookie } from "../linkedin/fetchLinkedInCookie.js";
import type { AutomationController } from "../automation/AutomationController.js";

export const createSettingsRouter = (
  settingsService: AutomationSettingsService,
  automationController?: AutomationController
): Router => {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const settings = await settingsService.get();
      res.json(settings);
    })
  );

  router.put(
    "/",
    asyncHandler(async (req, res) => {
      const previous = await settingsService.get();
      const settings = await settingsService.update(req.body);
      if (automationController && previous.enabled !== settings.enabled) {
        if (settings.enabled) {
          automationController.start();
        } else {
          automationController.stop();
        }
      }
      res.json(settings);
    })
  );

  router.post(
    "/fetch-cookie",
    asyncHandler(async (_req, res) => {
      const settings = await settingsService.get();
      try {
        const sessionCookie = await fetchLinkedInSessionCookie(settings.chromeUserDataDir);
        await settingsService.update({
          ...settings,
          sessionCookie
        });
        res.json({ sessionCookie, mode: settings.chromeUserDataDir ? "profile" : "interactive" });
      } catch (profileError) {
        const sessionCookie = await fetchLinkedInSessionCookie(undefined);
        await settingsService.update({
          ...settings,
          sessionCookie
        });
        res.json({ sessionCookie, mode: "interactive" });
      }
    })
  );

  return router;
};
