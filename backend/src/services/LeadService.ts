import type { LeadEducation, LeadExperience, LeadRecord } from "../types.js";
import { AppStateRepository } from "../repositories/AppStateRepository.js";
import { AutomationSettingsService } from "./AutomationSettingsService.js";
import { LeadEnrichmentService } from "./LeadEnrichmentService.js";
import { AiService } from "./AiService.js";

export class LeadService {
  constructor(
    private readonly repository: AppStateRepository,
    private readonly settingsService: AutomationSettingsService,
    private readonly enrichmentService: LeadEnrichmentService
  ) {}

  async list(): Promise<LeadRecord[]> {
    return this.repository.listLeads();
  }

  async append(leads: LeadRecord[]): Promise<LeadRecord[]> {
    return this.repository.appendLeads(leads);
  }

  async delete(ids: string[]): Promise<void> {
    await this.repository.deleteLeads(ids);
  }

  async exportAsCsv(ids?: string[]): Promise<string> {
    const leads = this.filterLeads(await this.list(), ids);
    const formatEducation = (entries?: LeadEducation[]): string => {
      if (!entries?.length) {
        return "";
      }
      return entries
        .map((entry) => {
          const components = [
            entry.school,
            [entry.degree, entry.fieldOfStudy].filter(Boolean).join(", "),
            entry.dateRangeText
          ]
            .filter((component) => Boolean(component))
            .join(" | ");
          return components;
        })
        .filter(Boolean)
        .join(" || ");
    };

    const formatExperiences = (experiences?: LeadExperience[]): string => {
      if (!experiences?.length) {
        return "";
      }
      return experiences
        .map((experience) => {
          const range = experience.dateRangeText ?? [experience.startDate, experience.endDate].filter(Boolean).join(" - ");
          const pieces = [
            [experience.title, experience.company].filter(Boolean).join(" @ "),
            experience.location,
            range
          ]
            .filter((piece) => Boolean(piece))
            .join(" | ");
          const description = experience.description?.replace(/\s+/g, " ").trim();
          return description ? `${pieces}${pieces ? " — " : ""}${description}` : pieces;
        })
        .filter(Boolean)
        .join(" || ");
    };

    const getProfileImageUrl = (lead: LeadRecord): string | undefined => {
      if (typeof lead.raw.profileImageUrl === "string" && lead.raw.profileImageUrl) {
        return lead.raw.profileImageUrl;
      }
      const profile = lead.raw.profile;
      if (profile && typeof profile === "object") {
        const nested = (profile as { profileImageUrl?: string }).profileImageUrl;
        if (typeof nested === "string" && nested) {
          return nested;
        }
      }
      return undefined;
    };

    const collectAdditionalLocations = (lead: LeadRecord): string[] => {
      const locations = new Set<string>();
      const addLocation = (value?: string) => {
        if (!value) {
          return;
        }
        const trimmed = value.trim();
        if (trimmed && trimmed.toLowerCase() !== (lead.location ?? "").trim().toLowerCase()) {
          locations.add(trimmed);
        }
      };
      const profile = lead.raw.profile;
      if (profile && typeof profile === "object") {
        const profileLocation = (profile as { location?: string }).location;
        if (typeof profileLocation === "string") {
          addLocation(profileLocation);
        }
      }
      lead.raw.experiences?.forEach((experience) => addLocation(experience.location));
      lead.raw.previousCompanies?.forEach((experience) => addLocation(experience.location));
      return Array.from(locations);
    };

    const columns: { header: string; value: (lead: LeadRecord) => string }[] = [
      { header: "fullName", value: (lead) => lead.fullName ?? "" },
      { header: "headline", value: (lead) => lead.headline ?? "" },
      { header: "title", value: (lead) => lead.title ?? "" },
      { header: "companyName", value: (lead) => lead.companyName ?? "" },
      { header: "companyUrl", value: (lead) => lead.companyUrl ?? "" },
      { header: "inferredCompanyName", value: (lead) => lead.inferredCompanyName ?? "" },
      { header: "inferredCompanyDomain", value: (lead) => lead.inferredCompanyDomain ?? "" },
      { header: "email", value: (lead) => lead.email ?? "" },
      {
        header: "emailVerificationStatus",
        value: (lead) => lead.emailVerificationStatus ?? ""
      },
      {
        header: "phoneNumbers",
        value: (lead) => lead.raw.phoneNumbers?.join(" | ") ?? ""
      },
      { header: "birthday", value: (lead) => lead.raw.birthday ?? "" },
      {
        header: "connectionsText",
        value: (lead) => lead.connectionsText ?? lead.raw.connectionsText ?? ""
      },
      {
        header: "connectionCount",
        value: (lead) => {
          const count = lead.connectionCount ?? lead.raw.connectionCount;
          return typeof count === "number" ? String(count) : "";
        }
      },
      {
        header: "followersText",
        value: (lead) => lead.followersText ?? lead.raw.followersText ?? ""
      },
      {
        header: "followerCount",
        value: (lead) => {
          const count = lead.followerCount ?? lead.raw.followerCount;
          return typeof count === "number" ? String(count) : "";
        }
      },
      { header: "location", value: (lead) => lead.location ?? "" },
      {
        header: "additionalLocations",
        value: (lead) => collectAdditionalLocations(lead).join(" | ")
      },
      { header: "connectionDegree", value: (lead) => lead.connectionDegree ?? "" },
      { header: "taskName", value: (lead) => lead.taskName ?? "" },
      { header: "profileUrl", value: (lead) => lead.profileUrl },
      { header: "salesNavigatorUrl", value: (lead) => lead.salesNavigatorUrl ?? "" },
      { header: "capturedAt", value: (lead) => lead.capturedAt },
      { header: "source", value: (lead) => lead.raw.source ?? "" },
      { header: "leadListName", value: (lead) => lead.raw.leadListName ?? "" },
      {
        header: "currentCompanyStartedAt",
        value: (lead) => lead.raw.currentCompanyStartedAt ?? ""
      },
      {
        header: "education",
        value: (lead) => formatEducation(lead.raw.education)
      },
      {
        header: "previousExperience",
        value: (lead) => formatExperiences(lead.raw.previousCompanies)
      },
      {
        header: "allExperience",
        value: (lead) => formatExperiences(lead.raw.experiences)
      },
      {
        header: "profileImageUrl",
        value: (lead) => getProfileImageUrl(lead) ?? ""
      },
      {
        header: "connectionsSummary",
        value: (lead) => {
          const summary = lead.connectionsText ?? lead.raw.connectionsText;
          const count = lead.connectionCount ?? lead.raw.connectionCount;
          if (summary) {
            return summary;
          }
          if (typeof count === "number") {
            return `${count} connections`;
          }
          return "";
        }
      },
      {
        header: "followersSummary",
        value: (lead) => {
          const summary = lead.followersText ?? lead.raw.followersText;
          const count = lead.followerCount ?? lead.raw.followerCount;
          if (summary) {
            return summary;
          }
          if (typeof count === "number") {
            return `${count} followers`;
          }
          return "";
        }
      }
    ];

    const headerRow = columns.map((column) => column.header).join(",");
    const rows = leads.map((lead) =>
      columns
        .map((column) => {
          const value = column.value(lead);
          const normalized = value.replace(/"/g, '""');
          return `"${normalized}"`;
        })
        .join(",")
    );
    return [headerRow, ...rows].join("\n");
  }

  async enrichPendingEmails(ids?: string[]): Promise<LeadRecord[]> {
    const settings = await this.settingsService.get();
    if (!settings.openAIApiKey) {
      throw new Error("OpenAI API key is not configured in settings");
    }

    const leads = this.filterLeads(await this.repository.listLeads(), ids);
    const ai = new AiService(settings.openAIApiKey, settings.openAIModel ?? "gpt-5-mini");
    const updated: LeadRecord[] = [];
    for (const lead of leads) {
      if (lead.emailVerificationStatus === "valid" && lead.email) {
        continue;
      }
      const enrichment = await this.enrichmentService.enrichLead(lead, ai);
      if (enrichment.changed) {
        const saved = await this.repository.updateLead(lead.id, () => enrichment.lead);
        updated.push(saved);
      }
    }

    return updated;
  }

  private filterLeads(leads: LeadRecord[], ids?: string[]): LeadRecord[] {
    if (!ids?.length) {
      return leads;
    }

    const idSet = new Set(ids);
    return leads.filter((lead) => idSet.has(lead.id));
  }
}
