import { AUTOMATION_MODES, type AutomationModeDefinition, getAutomationMode } from "../constants/automationModes.js";
import type { AutomationModeId, ICPProfile, SearchPreset, SearchTask } from "../types.js";
import { AutomationSettingsService } from "./AutomationSettingsService.js";
import { ICPService } from "./ICPService.js";
import { SearchPresetService } from "./SearchPresetService.js";
import { SearchTaskService } from "./SearchTaskService.js";
import { AiService } from "./AiService.js";

interface AutoPlanInput {
  instructions: string;
  modes?: AutomationModeId[];
  commandName?: string;
}

interface AutoPlanResult {
  icp: ICPProfile;
  presets: SearchPreset[];
  tasks: SearchTask[];
  modes: AutomationModeDefinition[];
}

export class WorkflowService {
  constructor(
    private readonly settingsService: AutomationSettingsService,
    private readonly icpService: ICPService,
    private readonly presetService: SearchPresetService,
    private readonly taskService: SearchTaskService
  ) {}

  async autoPlan(input: AutoPlanInput): Promise<AutoPlanResult> {
    const trimmedInstructions = input.instructions?.trim();
    if (!trimmedInstructions) {
      throw new Error("Instructions are required to bootstrap automation");
    }

    const settings = await this.settingsService.get();
    if (!settings.openAIApiKey) {
      throw new Error("OpenAI API key is not configured. Add it in settings before running automation.");
    }

    const modeSelection = input.modes && input.modes.length > 0 ? input.modes : settings.automationModes;
    const selectedModeDefinitions = this.resolveModes(modeSelection);
    if (selectedModeDefinitions.length === 0) {
      throw new Error("No automation modes enabled. Adjust settings before generating commands.");
    }
    const primaryMode = selectedModeDefinitions[0];
    const ai = new AiService(settings.openAIApiKey, settings.openAIModel ?? "gpt-5-mini");
    const existingProfile = await this.icpService.getProfile();
    const generatedProfile = await ai.generateICP(trimmedInstructions, existingProfile);
    const savedProfile = await this.icpService.updateProfile(generatedProfile);

    let presets = await this.presetService.list();
    const createdPresets: SearchPreset[] = [];
    const queuedTasks: SearchTask[] = [];

    const presetName = input.commandName?.trim() ?? primaryMode.preset.name;
    const existingPreset = presets.find((preset) => preset.name === presetName);
    let preset: SearchPreset;
    if (existingPreset) {
      preset = await this.presetService.update(existingPreset.id, {
        description: primaryMode.preset.description,
        linkedICP: primaryMode.preset.linkedICP,
        pageLimit: primaryMode.preset.pageLimit,
        filters: primaryMode.preset.filters
      });
      presets = presets.map((candidate) => (candidate.id === preset.id ? preset : candidate));
    } else {
      preset = await this.presetService.create({
        ...primaryMode.preset,
        name: presetName
      });
      presets = [...presets, preset];
    }
    createdPresets.push(preset);

    const taskName = input.commandName?.trim() ?? preset.name;
    const task = await this.taskService.createDraft(preset.id, settings, taskName, {
      icpPrompt: trimmedInstructions
    });
    queuedTasks.push(task);

    return {
      icp: savedProfile,
      presets: createdPresets,
      tasks: queuedTasks,
      modes: [primaryMode]
    };
  }

  private resolveModes(modes?: AutomationModeId[]): AutomationModeDefinition[] {
    if (!modes || modes.length === 0) {
      return AUTOMATION_MODES;
    }
    const resolved = modes
      .map((modeId) => getAutomationMode(modeId))
      .filter((mode): mode is AutomationModeDefinition => mode != null);

    if (resolved.length === 0) {
      return AUTOMATION_MODES;
    }

    return resolved;
  }
}
