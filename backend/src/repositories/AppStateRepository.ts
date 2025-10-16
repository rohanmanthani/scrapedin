import { randomUUID } from "node:crypto";
import {
  type AppState,
  type AutomationSettings,
  type ICPProfile,
  type LeadRecord,
  type SearchPreset,
  type SearchTask,
  DEFAULT_APP_STATE,
  DEFAULT_AUTOMATION_SETTINGS
} from "../types.js";
import { FileStore } from "../utils/FileStore.js";

interface CreatePresetInput extends Omit<SearchPreset, "id" | "createdAt" | "updatedAt"> {}

export class AppStateRepository {
  constructor(private readonly store: FileStore) {}

  async getState(): Promise<AppState> {
    return this.store.read();
  }

  async reset(): Promise<void> {
    await this.store.write(DEFAULT_APP_STATE);
  }

  async getICP(): Promise<ICPProfile> {
    const state = await this.getState();
    return state.icp;
  }

  async saveICP(icp: ICPProfile): Promise<ICPProfile> {
    return this.store.update(async (state) => {
      const nextState: AppState = { ...state, icp };
      return [nextState, icp];
    });
  }

  async listSearchPresets(): Promise<SearchPreset[]> {
    const state = await this.getState();
    return state.searchPresets;
  }

  async findSearchPreset(presetId: string): Promise<SearchPreset | undefined> {
    const state = await this.getState();
    return state.searchPresets.find((preset) => preset.id === presetId);
  }

  async createSearchPreset(input: CreatePresetInput): Promise<SearchPreset> {
    const now = new Date().toISOString();
    const newPreset: SearchPreset = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      linkedICP: input.linkedICP,
      filters: input.filters,
      createdAt: now,
      updatedAt: now,
      lastRunAt: undefined,
      lastResultCount: undefined,
      pageLimit: input.pageLimit
    };

    return this.store.update(async (state) => {
      const nextState: AppState = {
        ...state,
        searchPresets: [...state.searchPresets, newPreset]
      };
      return [nextState, newPreset];
    });
  }

  async updateSearchPreset(presetId: string, updater: (prev: SearchPreset) => SearchPreset): Promise<SearchPreset> {
    return this.store.update(async (state) => {
      const index = state.searchPresets.findIndex((preset) => preset.id === presetId);
      if (index === -1) {
        throw new Error(`Preset ${presetId} not found`);
      }
      const prevPreset = state.searchPresets[index];
      const updatedPreset = { ...updater(prevPreset), id: presetId, updatedAt: new Date().toISOString() };
      const nextState: AppState = {
        ...state,
        searchPresets: [
          ...state.searchPresets.slice(0, index),
          updatedPreset,
          ...state.searchPresets.slice(index + 1)
        ]
      };
      return [nextState, updatedPreset];
    });
  }

  async deleteSearchPreset(presetId: string): Promise<void> {
    await this.store.update(async (state) => {
      const nextState: AppState = {
        ...state,
        searchPresets: state.searchPresets.filter((preset) => preset.id !== presetId)
      };
      return [nextState, undefined];
    });
  }

  async listTasks(): Promise<SearchTask[]> {
    const state = await this.getState();
    return state.tasks;
  }

  async saveTask(task: SearchTask): Promise<SearchTask> {
    return this.store.update(async (state) => {
      const existingIndex = state.tasks.findIndex((t) => t.id === task.id);
      const tasks =
        existingIndex === -1
          ? [...state.tasks, task]
          : [
              ...state.tasks.slice(0, existingIndex),
              task,
              ...state.tasks.slice(existingIndex + 1)
            ];
      const nextState: AppState = { ...state, tasks };
      return [nextState, task];
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.store.update(async (state) => {
      const nextState: AppState = { ...state, tasks: state.tasks.filter((task) => task.id !== taskId) };
      return [nextState, undefined];
    });
  }

  async appendLeads(leads: LeadRecord[]): Promise<LeadRecord[]> {
    return this.store.update(async (state) => {
      const dedupe = new Map<string, LeadRecord>();
      [...state.leads, ...leads].forEach((lead) => {
        dedupe.set(lead.profileUrl.toLowerCase(), lead);
      });
      const nextState: AppState = {
        ...state,
        leads: Array.from(dedupe.values())
      };
      return [nextState, leads];
    });
  }

  async listLeads(): Promise<LeadRecord[]> {
    const state = await this.getState();
    return state.leads;
  }

  async updateLead(leadId: string, updater: (lead: LeadRecord) => LeadRecord): Promise<LeadRecord> {
    return this.store.update(async (state) => {
      const index = state.leads.findIndex((lead) => lead.id === leadId);
      if (index === -1) {
        throw new Error(`Lead ${leadId} not found`);
      }
      const previous = state.leads[index];
      const updated = updater(previous);
      const nextState: AppState = {
        ...state,
        leads: [...state.leads.slice(0, index), updated, ...state.leads.slice(index + 1)]
      };
      return [nextState, updated];
    });
  }

  async getAutomationSettings(): Promise<AutomationSettings> {
    const state = await this.getState();
    return {
      ...DEFAULT_AUTOMATION_SETTINGS,
      ...state.automationSettings
    };
  }

  async saveAutomationSettings(settings: AutomationSettings): Promise<AutomationSettings> {
    return this.store.update(async (state) => {
      const nextState: AppState = {
        ...state,
        automationSettings: settings
      };
      return [nextState, settings];
    });
  }
}
