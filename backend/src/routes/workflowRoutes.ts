import { Router } from "express";
import { AUTOMATION_MODES } from "../constants/automationModes.js";
import type { AutomationModeId } from "../types.js";
import { WorkflowService } from "../services/WorkflowService.js";
import { asyncHandler } from "./utils.js";

const normalizeModes = (modes: unknown): AutomationModeId[] | undefined => {
  if (!Array.isArray(modes)) {
    return undefined;
  }
  return modes.filter((mode): mode is AutomationModeId =>
    typeof mode === "string" && AUTOMATION_MODES.some((definition) => definition.id === mode)
  );
};

export const createWorkflowRouter = (workflowService: WorkflowService): Router => {
  const router = Router();

  router.get(
    "/modes",
    (_req, res) => {
      res.json(AUTOMATION_MODES);
    }
  );

  router.post(
    "/auto-plan",
    asyncHandler(async (req, res) => {
      const { instructions, modes, commandName } = req.body ?? {};
      const normalizedModes = normalizeModes(modes);
      const plan = await workflowService.autoPlan({
        instructions,
        modes: normalizedModes,
        commandName: typeof commandName === "string" ? commandName : undefined
      });
      res.json(plan);
    })
  );

  return router;
};
