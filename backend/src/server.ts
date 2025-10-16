import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { appConfig } from "./config.js";
import { createIcpRouter } from "./routes/icpRoutes.js";
import { createSearchPresetRouter } from "./routes/searchPresetRoutes.js";
import { createLeadRouter } from "./routes/leadRoutes.js";
import { createSettingsRouter } from "./routes/settingsRoutes.js";
import { createTaskRouter } from "./routes/taskRoutes.js";
import { createWorkflowRouter } from "./routes/workflowRoutes.js";
import { logger } from "./logger.js";
import { ICPService } from "./services/ICPService.js";
import { SearchPresetService } from "./services/SearchPresetService.js";
import { LeadService } from "./services/LeadService.js";
import { AutomationSettingsService } from "./services/AutomationSettingsService.js";
import { SearchTaskService } from "./services/SearchTaskService.js";
import type { WorkflowService } from "./services/WorkflowService.js";
import type { AutomationController } from "./automation/AutomationController.js";

export interface ServerDependencies {
  icpService: ICPService;
  searchPresetService: SearchPresetService;
  leadService: LeadService;
  settingsService: AutomationSettingsService;
  taskService: SearchTaskService;
  workflowService: WorkflowService;
  automationController: AutomationController;
}

export const createServer = (deps: ServerDependencies): Express => {
  const app = express();

  app.use(
    cors({
      origin: appConfig.corsOrigins,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/icp", createIcpRouter(deps.icpService, deps.settingsService));
  app.use(
    "/api/search-presets",
    createSearchPresetRouter(deps.searchPresetService, deps.taskService, deps.settingsService)
  );
  app.use("/api/leads", createLeadRouter(deps.leadService));
  app.use("/api/settings", createSettingsRouter(deps.settingsService, deps.automationController));
  app.use("/api/tasks", createTaskRouter(deps.taskService, deps.settingsService, deps.automationController));
  app.use("/api/workflow", createWorkflowRouter(deps.workflowService));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Request failed");
    const message = err instanceof Error ? err.message : "Internal Server Error";
    res.status(400).json({ error: message });
  });

  return app;
};
