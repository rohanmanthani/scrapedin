import type { AutomationSettings } from "../types.js";
import { automationSettingsSchema } from "../schemas.js";
import { AppStateRepository } from "../repositories/AppStateRepository.js";

export class AutomationSettingsService {
  constructor(private readonly repository: AppStateRepository) {}

  async get(): Promise<AutomationSettings> {
    return this.repository.getAutomationSettings();
  }

  async update(payload: unknown): Promise<AutomationSettings> {
    const parsed = automationSettingsSchema.parse(payload);
    return this.repository.saveAutomationSettings(parsed);
  }
}

