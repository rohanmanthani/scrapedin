import { z } from "zod";
import { DEFAULT_AUTOMATION_SETTINGS, DEFAULT_ICP } from "./types.js";

export const rangeSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional()
  })
  .refine((val) => {
    if (val.min !== undefined && val.max !== undefined) {
      return val.min <= val.max;
    }
    return true;
  }, "min must be less than max");

export const icpSchema = z.object({
  idealTitles: z.array(z.string()).default(DEFAULT_ICP.idealTitles),
  seniorities: z.array(z.string()).default(DEFAULT_ICP.seniorities),
  industries: z.array(z.string()).default(DEFAULT_ICP.industries),
  companyHeadcount: rangeSchema.default(DEFAULT_ICP.companyHeadcount),
  companyRevenue: rangeSchema.default(DEFAULT_ICP.companyRevenue),
  geographies: z.array(z.string()).default(DEFAULT_ICP.geographies),
  keywords: z.array(z.string()).default(DEFAULT_ICP.keywords),
  excludedKeywords: z.array(z.string()).default(DEFAULT_ICP.excludedKeywords),
  personas: z.array(z.string()).default(DEFAULT_ICP.personas),
  notes: z.string().optional()
});

const seniorityValues = [
  "OWNER",
  "PARTNER",
  "CXO",
  "VP",
  "DIRECTOR",
  "MANAGER",
  "SENIOR",
  "ENTRY"
] as const;

export const searchFiltersSchema = z.object({
  keywords: z.array(z.string()).default([]),
  excludedKeywords: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  companyHeadcount: rangeSchema.default({}),
  companyRevenue: rangeSchema.default({}),
  geographies: z.array(z.string()).default([]),
  companyHeadquarters: z.array(z.string()).default([]),
  seniorities: z.array(z.enum(seniorityValues)).default([]),
  functions: z.array(z.string()).default([]),
  currentCompanies: z.array(z.string()).default([]),
  pastCompanies: z.array(z.string()).default([]),
  currentJobTitles: z.array(z.string()).default([]),
  pastJobTitles: z.array(z.string()).default([]),
  yearsInCurrentCompany: rangeSchema.default({}),
  yearsInCurrentPosition: rangeSchema.default({}),
  yearsOfExperience: rangeSchema.default({}),
  companyTypes: z.array(z.string()).default([]),
  groups: z.array(z.string()).default([]),
  schools: z.array(z.string()).default([]),
  profileLanguages: z.array(z.string()).default([]),
  connectionsOf: z.array(z.string()).default([]),
  accountLists: z.array(z.string()).default([]),
  leadLists: z.array(z.string()).default([]),
  personas: z.array(z.string()).default([]),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  postedInPastDays: z.number().int().nonnegative().optional(),
  changedJobsInPastDays: z.number().int().positive().optional(),
  followingYourCompany: z.boolean().optional(),
  sharedExperiences: z.boolean().optional(),
  teamLinkIntroductions: z.boolean().optional(),
  viewedYourProfile: z.boolean().optional(),
  pastCustomer: z.boolean().optional(),
  pastColleague: z.boolean().optional(),
  buyerIntent: z.boolean().optional(),
  peopleInCRM: z.boolean().optional(),
  peopleInteractedWith: z.boolean().optional(),
  savedLeadsAndAccounts: z.boolean().optional(),
  relationship: z.enum(["1", "2", "3", "group", "teamlink"]).optional()
});

export const searchPresetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  linkedICP: z.boolean().default(false),
  filters: searchFiltersSchema,
  pageLimit: z.number().int().positive().max(40).optional()
});

export const automationSettingsSchema = z
  .object({
    enabled: z.boolean(),
    headless: z.boolean(),
    randomizeDelays: z.boolean(),
    minDelayMs: z.number().int().nonnegative(),
    maxDelayMs: z.number().int().nonnegative(),
    pageTimeoutMs: z.number().int().positive(),
    dailySearchLimit: z.number().int().nonnegative(),
    dailyLeadCap: z.number().int().nonnegative(),
    sessionCookie: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim();
        return trimmed ? trimmed : undefined;
      }),
    chromeExecutablePath: z.string().optional(),
    chromeUserDataDir: z.string().optional(),
    concurrentSearches: z.number().int().positive(),
    respectQuietHours: z.boolean(),
    quietHours: z
      .object({
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(0).max(23)
      })
      .optional(),
    autoStartOnBoot: z.boolean(),
    resultsPerPage: z.number().int().positive(),
    retryAttempts: z.number().int().nonnegative(),
    retryBackoffMs: z.number().int().nonnegative(),
    openAIApiKey: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim();
        return trimmed ? trimmed : undefined;
      }),
    openAIModel: z.string().default(DEFAULT_AUTOMATION_SETTINGS.openAIModel)
    ,
    automationModes: z
      .array(z.enum(["ultra_safe", "safe", "balanced", "aggressive"]))
      .default(DEFAULT_AUTOMATION_SETTINGS.automationModes)
  })
  .superRefine((val, ctx) => {
    if (val.minDelayMs > val.maxDelayMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minDelayMs"],
        message: "minDelayMs must be less than or equal to maxDelayMs"
      });
    }
  })
  .default(DEFAULT_AUTOMATION_SETTINGS);
