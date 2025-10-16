export type Range = {
  min?: number;
  max?: number;
};

export interface ICPProfile {
  idealTitles: string[];
  seniorities: string[];
  industries: string[];
  companyHeadcount: Range;
  companyRevenue: Range;
  geographies: string[];
  keywords: string[];
  excludedKeywords: string[];
  personas: string[];
  notes?: string;
}

export type SalesNavSeniority =
  | "OWNER"
  | "PARTNER"
  | "CXO"
  | "VP"
  | "DIRECTOR"
  | "MANAGER"
  | "SENIOR"
  | "ENTRY";

export interface SearchFilters {
  keywords: string[];
  excludedKeywords: string[];
  industries: string[];
  companyHeadcount: Range;
  companyRevenue: Range;
  geographies: string[];
  companyHeadquarters: string[];
  seniorities: SalesNavSeniority[];
  functions: string[];
  currentCompanies: string[];
  pastCompanies: string[];
  currentJobTitles: string[];
  pastJobTitles: string[];
  yearsInCurrentCompany: Range;
  yearsInCurrentPosition: Range;
  yearsOfExperience: Range;
  companyTypes: string[];
  groups: string[];
  schools: string[];
  profileLanguages: string[];
  connectionsOf: string[];
  accountLists: string[];
  leadLists: string[];
  personas: string[];
  firstName?: string;
  lastName?: string;
  postedInPastDays?: number;
  changedJobsInPastDays?: number;
  followingYourCompany?: boolean;
  sharedExperiences?: boolean;
  teamLinkIntroductions?: boolean;
  viewedYourProfile?: boolean;
  pastCustomer?: boolean;
  pastColleague?: boolean;
  buyerIntent?: boolean;
  peopleInCRM?: boolean;
  peopleInteractedWith?: boolean;
  savedLeadsAndAccounts?: boolean;
  relationship?: "1" | "2" | "3" | "group" | "teamlink";
}

export interface SearchPreset {
  id: string;
  name: string;
  description?: string;
  linkedICP?: boolean;
  filters: SearchFilters;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastResultCount?: number;
  pageLimit?: number;
}

export type TaskStatus = "draft" | "pending" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type AutomationModeId = "ultra_safe" | "safe" | "balanced" | "aggressive";

export type SearchTaskType = "sales_navigator" | "account_followers" | "post_engagement";

export interface SearchTaskPayload {
  icpPrompt?: string;
  accountUrls?: string[];
  postUrls?: string[];
  scrapeReactions?: boolean;
  scrapeCommenters?: boolean;
  targetLeadListName?: string;
}

export interface SearchTask {
  id: string;
  type: SearchTaskType;
  presetId?: string;
  status: TaskStatus;
  createdAt: string;
  scheduledFor?: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  name?: string;
  resultLeadIds: string[];
  settingsSnapshot: AutomationSettings;
  payload?: SearchTaskPayload;
}

export interface LeadRecord {
  id: string;
  presetId: string;
  profileUrl: string;
  salesNavigatorUrl?: string;
  fullName: string;
  headline?: string;
  title?: string;
  companyName?: string;
  companyUrl?: string;
  location?: string;
  connectionDegree?: string;
  capturedAt: string;
  raw: Record<string, unknown>;
  inferredCompanyName?: string;
  inferredCompanyDomain?: string;
  email?: string;
  emailVerificationStatus?: "pending" | "valid" | "invalid" | "unknown" | "not_found";
  taskName?: string;
}

export interface AutomationSettings {
  enabled: boolean;
  headless: boolean;
  randomizeDelays: boolean;
  minDelayMs: number;
  maxDelayMs: number;
  pageTimeoutMs: number;
  dailySearchLimit: number;
  dailyLeadCap: number;
  sessionCookie?: string;
  chromeExecutablePath?: string;
  chromeUserDataDir?: string;
  concurrentSearches: number;
  respectQuietHours: boolean;
  quietHours?: {
    startHour: number;
    endHour: number;
  };
  autoStartOnBoot: boolean;
  resultsPerPage: number;
  retryAttempts: number;
  retryBackoffMs: number;
  openAIApiKey?: string;
  openAIModel: string;
  automationModes: AutomationModeId[];
}

export interface AppState {
  icp: ICPProfile;
  searchPresets: SearchPreset[];
  tasks: SearchTask[];
  leads: LeadRecord[];
  automationSettings: AutomationSettings;
}

export const DEFAULT_ICP: ICPProfile = {
  idealTitles: [],
  seniorities: [],
  industries: [],
  companyHeadcount: {},
  companyRevenue: {},
  geographies: [],
  keywords: [],
  excludedKeywords: [],
  personas: [],
  notes: ""
};

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  enabled: false,
  headless: true,
  randomizeDelays: true,
  minDelayMs: 4000,
  maxDelayMs: 9000,
  pageTimeoutMs: 45000,
  dailySearchLimit: 30,
  dailyLeadCap: 200,
  concurrentSearches: 1,
  respectQuietHours: true,
  quietHours: {
    startHour: 20,
    endHour: 7
  },
  autoStartOnBoot: false,
  resultsPerPage: 25,
  retryAttempts: 2,
  retryBackoffMs: 8000,
  openAIModel: "gpt-5-mini",
  automationModes: ["ultra_safe", "safe", "balanced", "aggressive"]
};

export const DEFAULT_APP_STATE: AppState = {
  icp: DEFAULT_ICP,
  searchPresets: [],
  tasks: [],
  leads: [],
  automationSettings: DEFAULT_AUTOMATION_SETTINGS
};
