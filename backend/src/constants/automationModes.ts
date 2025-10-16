import type { AutomationModeId, SearchPreset } from "../types.js";

export interface AutomationModeDefinition {
  id: AutomationModeId;
  name: string;
  description: string;
  preset: Pick<SearchPreset, "filters" | "pageLimit" | "linkedICP" | "description" | "name">;
}

const baseFilters = (): SearchPreset["filters"] => ({
  keywords: [],
  excludedKeywords: [],
  industries: [],
  companyHeadcount: {},
  companyRevenue: {},
  geographies: [],
  companyHeadquarters: [],
  seniorities: [],
  functions: [],
  currentCompanies: [],
  pastCompanies: [],
  currentJobTitles: [],
  pastJobTitles: [],
  yearsInCurrentCompany: {},
  yearsInCurrentPosition: {},
  yearsOfExperience: {},
  companyTypes: [],
  groups: [],
  schools: [],
  profileLanguages: [],
  connectionsOf: [],
  accountLists: [],
  leadLists: [],
  personas: [],
  firstName: undefined,
  lastName: undefined,
  postedInPastDays: undefined,
  changedJobsInPastDays: undefined,
  followingYourCompany: undefined,
  sharedExperiences: undefined,
  teamLinkIntroductions: undefined,
  viewedYourProfile: undefined,
  pastCustomer: undefined,
  pastColleague: undefined,
  buyerIntent: undefined,
  peopleInCRM: undefined,
  peopleInteractedWith: undefined,
  savedLeadsAndAccounts: undefined,
  relationship: undefined
});

export const AUTOMATION_MODES: AutomationModeDefinition[] = [
  {
    id: "ultra_safe",
    name: "Ultra Safe",
    description: "Slow crawl focused on 1st-degree networks and recent activity.",
    preset: {
      name: "Ultra Safe Recon",
      description: "Tight filters leaning on 1st degree connections captured in the last 14 days.",
      linkedICP: true,
      pageLimit: 1,
      filters: {
        ...baseFilters(),
        postedInPastDays: 14,
        relationship: "1"
      }
    }
  },
  {
    id: "safe",
    name: "Safety First",
    description: "Moderate pace emphasizing warm relationships and fresh posts.",
    preset: {
      name: "Safety First Sweep",
      description: "Prioritizes 1st & 2nd degree connections captured in the last 30 days.",
      linkedICP: true,
      pageLimit: 2,
      filters: {
        ...baseFilters(),
        postedInPastDays: 30,
        relationship: "2"
      }
    }
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Balanced mix of reach and caution across 1st–3rd degree prospects.",
    preset: {
      name: "Balanced Expansion",
      description: "Blends ICP filters with wider relationship reach for steady prospecting.",
      linkedICP: true,
      pageLimit: 4,
      filters: {
        ...baseFilters(),
        postedInPastDays: 60,
        relationship: "3"
      }
    }
  },
  {
    id: "aggressive",
    name: "Aggressive",
    description: "Max coverage run with higher page limits and broad relationship reach.",
    preset: {
      name: "Aggressive Expansion",
      description: "Pushes across 3rd degree networks with a deeper page crawl.",
      linkedICP: true,
      pageLimit: 6,
      filters: {
        ...baseFilters(),
        postedInPastDays: undefined,
        relationship: undefined
      }
    }
  }
];

export const getAutomationMode = (modeId: AutomationModeId): AutomationModeDefinition | undefined =>
  AUTOMATION_MODES.find((mode) => mode.id === modeId);
