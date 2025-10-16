import { Router } from "express";
import { asyncHandler } from "./utils.js";
import { SearchPresetService } from "../services/SearchPresetService.js";
import { SearchTaskService } from "../services/SearchTaskService.js";
import { AutomationSettingsService } from "../services/AutomationSettingsService.js";

export const createSearchPresetRouter = (
  searchPresetService: SearchPresetService,
  taskService: SearchTaskService,
  settingsService: AutomationSettingsService
): Router => {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const presets = await searchPresetService.list();
      res.json(presets);
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const preset = await searchPresetService.create(req.body);
      res.status(201).json(preset);
    })
  );

  router.put(
    "/:presetId",
    asyncHandler(async (req, res) => {
      const preset = await searchPresetService.update(req.params.presetId, req.body);
      res.json(preset);
    })
  );

  router.post(
    "/:presetId/duplicate",
    asyncHandler(async (req, res) => {
      const preset = await searchPresetService.duplicate(req.params.presetId);
      res.status(201).json(preset);
    })
  );

  router.delete(
    "/:presetId",
    asyncHandler(async (req, res) => {
      await searchPresetService.delete(req.params.presetId);
      res.status(204).send();
    })
  );

  router.post(
    "/:presetId/run",
    asyncHandler(async (req, res) => {
      const settings = await settingsService.get();
      const scheduledFor = req.body?.scheduledFor ? new Date(req.body.scheduledFor) : undefined;
      const task = await taskService.queue(req.params.presetId, settings, scheduledFor);
      res.status(202).json(task);
    })
  );

  return router;
};

