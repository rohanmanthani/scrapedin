import http from "node:http";
import { appConfig } from "./config.js";
import { logger } from "./logger.js";
import { FileStore } from "./utils/FileStore.js";
import { AppStateRepository } from "./repositories/AppStateRepository.js";
import { ICPService } from "./services/ICPService.js";
import { AutomationSettingsService } from "./services/AutomationSettingsService.js";
import { SearchPresetService } from "./services/SearchPresetService.js";
import { SearchTaskService } from "./services/SearchTaskService.js";
import { LeadService } from "./services/LeadService.js";
import { LeadEnrichmentService } from "./services/LeadEnrichmentService.js";
import { WorkflowService } from "./services/WorkflowService.js";
import { createServer } from "./server.js";
import { AutomationController } from "./automation/AutomationController.js";

const shutdownSignals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

const bootstrap = async (): Promise<void> => {
  const fileStore = new FileStore(appConfig.stateFile);
  await fileStore.init();

  const repository = new AppStateRepository(fileStore);
  const icpService = new ICPService(repository);
  const settingsService = new AutomationSettingsService(repository);
  const searchPresetService = new SearchPresetService(repository, icpService);
  const taskService = new SearchTaskService(repository);
  const leadEnrichmentService = new LeadEnrichmentService();
  const leadService = new LeadService(repository, settingsService, leadEnrichmentService);
  const workflowService = new WorkflowService(settingsService, icpService, searchPresetService, taskService);

  const automationController = new AutomationController(
    settingsService,
    taskService,
    searchPresetService,
    leadService
  );

  const app = createServer({
    icpService,
    searchPresetService,
    leadService,
    settingsService,
    taskService,
    workflowService,
    automationController
  });

  const server = app.listen(appConfig.port, appConfig.host, () => {
    logger.info({ port: appConfig.port }, "API server listening");
  }) as http.Server;

  const settings = await settingsService.get();
  if (settings.autoStartOnBoot) {
    automationController.start();
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Received shutdown signal");
    automationController.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(0);
  };

  shutdownSignals.forEach((signal) => {
    process.on(signal, () => {
      void shutdown(signal);
    });
  });
};

bootstrap().catch((error) => {
  logger.error({ err: error }, "Failed to bootstrap backend");
  process.exit(1);
});
