import type { ICPProfile, SearchPreset } from "../types.js";
import { searchPresetSchema } from "../schemas.js";
import { AppStateRepository } from "../repositories/AppStateRepository.js";
import { ICPService } from "./ICPService.js";

const updateSchema = searchPresetSchema.partial();

const mergeICPWithFilters = (icp: ICPProfile, preset: SearchPreset): SearchPreset => {
  return {
    ...preset,
    filters: {
      ...preset.filters,
      keywords: Array.from(new Set([...preset.filters.keywords, ...icp.keywords])),
      excludedKeywords: Array.from(new Set([...preset.filters.excludedKeywords, ...icp.excludedKeywords])),
      industries: Array.from(new Set([...preset.filters.industries, ...icp.industries])),
      geographies: Array.from(new Set([...preset.filters.geographies, ...icp.geographies])),
      companyHeadquarters: Array.from(new Set([...preset.filters.companyHeadquarters, ...icp.geographies])),
      functions: Array.from(new Set([...preset.filters.functions, ...icp.personas])),
      seniorities: preset.filters.seniorities.length
        ? preset.filters.seniorities
        : (icp.seniorities as SearchPreset["filters"]["seniorities"]),
      currentJobTitles: preset.filters.currentJobTitles.length
        ? preset.filters.currentJobTitles
        : Array.from(new Set([...icp.idealTitles])),
      personas: Array.from(new Set([...preset.filters.personas, ...icp.personas])),
      companyHeadcount: {
        ...icp.companyHeadcount,
        ...preset.filters.companyHeadcount
      },
      companyRevenue: {
        ...icp.companyRevenue,
        ...preset.filters.companyRevenue
      }
    }
  };
};

export class SearchPresetService {
  constructor(
    private readonly repository: AppStateRepository,
    private readonly icpService: ICPService
  ) {}

  async list(): Promise<SearchPreset[]> {
    return this.repository.listSearchPresets();
  }

  async get(presetId: string): Promise<SearchPreset | undefined> {
    return this.repository.findSearchPreset(presetId);
  }

  async create(payload: unknown): Promise<SearchPreset> {
    const parsed = searchPresetSchema.parse(payload);
    const basePreset = await this.repository.createSearchPreset(parsed);

    if (!parsed.linkedICP) {
      return basePreset;
    }

    const icp = await this.icpService.getProfile();
    const merged = mergeICPWithFilters(icp, basePreset);
    return this.repository.updateSearchPreset(basePreset.id, () => merged);
  }

  async update(presetId: string, payload: unknown): Promise<SearchPreset> {
    const parsed = updateSchema.parse(payload);
    const existing = await this.repository.findSearchPreset(presetId);
    if (!existing) {
      throw new Error(`Preset ${presetId} not found`);
    }
    const merged: SearchPreset = {
      ...existing,
      ...parsed,
      filters: {
        ...existing.filters,
        ...(parsed.filters ?? {})
      },
      updatedAt: new Date().toISOString()
    };

    if (merged.linkedICP) {
      const icp = await this.icpService.getProfile();
      return this.repository.updateSearchPreset(presetId, () => mergeICPWithFilters(icp, merged));
    }

    return this.repository.updateSearchPreset(presetId, () => merged);
  }

  async duplicate(presetId: string): Promise<SearchPreset> {
    const preset = await this.repository.findSearchPreset(presetId);
    if (!preset) {
      throw new Error(`Preset ${presetId} not found`);
    }
    const { id: _, createdAt: __, updatedAt: ___, ...rest } = preset;
    return this.repository.createSearchPreset({
      ...rest,
      name: `${preset.name} Copy`
    });
  }

  async delete(presetId: string): Promise<void> {
    await this.repository.deleteSearchPreset(presetId);
  }

  async recordSuccessfulRun(presetId: string, resultCount: number): Promise<void> {
    await this.repository.updateSearchPreset(presetId, (preset) => ({
      ...preset,
      lastRunAt: new Date().toISOString(),
      lastResultCount: resultCount
    }));
  }
}
