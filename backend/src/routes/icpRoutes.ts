import { Router } from "express";
import { asyncHandler } from "./utils.js";
import { ICPService } from "../services/ICPService.js";
import { AutomationSettingsService } from "../services/AutomationSettingsService.js";
import { AiService } from "../services/AiService.js";

export const createIcpRouter = (
  icpService: ICPService,
  settingsService: AutomationSettingsService
): Router => {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const profile = await icpService.getProfile();
      res.json(profile);
    })
  );

  router.post(
    "/generate",
    asyncHandler(async (req, res) => {
      const { instructions } = req.body ?? {};
      if (typeof instructions !== "string" || !instructions.trim()) {
        res.status(400).json({ error: "instructions must be a non-empty string" });
        return;
      }

      const settings = await settingsService.get();
      if (!settings.openAIApiKey) {
        res.status(400).json({ error: "OpenAI API key not configured. Add it in settings first." });
        return;
      }

      const ai = new AiService(settings.openAIApiKey, settings.openAIModel ?? "gpt-5-mini");
      const currentProfile = await icpService.getProfile();
      const generated = await ai.generateICP(instructions, currentProfile);
      res.json(generated);
    })
  );

  router.put(
    "/",
    asyncHandler(async (req, res) => {
      const profile = await icpService.updateProfile(req.body);
      res.json(profile);
    })
  );

  return router;
};
