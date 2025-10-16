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

export type TaskStatus =
  | "draft"
  | "pending"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

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
  type?: SearchTaskType;
  presetId?: string;
  status: TaskStatus;
  createdAt: string;
  scheduledFor?: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  resultLeadIds?: string[];
  settingsSnapshot?: AutomationSettings;
  name?: string;
  payload?: SearchTaskPayload;
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

export interface LeadRecord {
  id: string;
  presetId: string;
  profileUrl: string;
  salesNavigatorUrl?: string;
  fullName: string;
  title?: string;
  companyName?: string;
  headline?: string;
  location?: string;
  connectionDegree?: string;
  capturedAt: string;
  inferredCompanyName?: string;
  inferredCompanyDomain?: string;
  email?: string;
  emailVerificationStatus?: "pending" | "valid" | "invalid" | "unknown" | "not_found";
  taskName?: string;
}

export type AutomationModeId = "ultra_safe" | "safe" | "balanced" | "aggressive";

export interface AutomationModeDefinition {
  id: AutomationModeId;
  name: string;
  description: string;
  preset: {
    name: string;
    description?: string;
    linkedICP?: boolean;
    pageLimit?: number;
    filters: SearchFilters;
  };
}

export interface AutoPlanResponse {
  icp: ICPProfile;
  presets: SearchPreset[];
  tasks: SearchTask[];
  modes: AutomationModeDefinition[];
}
