import type { LeadExperience, LeadRecord, LeadRecordRaw } from "../types.js";
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
    const asRecord = (value: unknown): Record<string, unknown> | undefined => {
      if (value && typeof value === "object") {
        return value as Record<string, unknown>;
      }
      return undefined;
    };

    const readString = (
      record: Record<string, unknown> | undefined,
      key: string
    ): string | undefined => {
      if (!record) {
        return undefined;
      }
      const value = record[key];
      if (typeof value !== "string") {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    };

    const getProfileRecord = (lead: LeadRecord): Record<string, unknown> | undefined => {
      const raw = lead.raw as LeadRecordRaw | undefined;
      return asRecord(raw?.profile);
    };

    const getProfileImageUrl = (lead: LeadRecord): string | undefined => {
      const raw = lead.raw as LeadRecordRaw | undefined;
      const rawImage = raw?.profileImageUrl;
      if (typeof rawImage === "string") {
        const trimmed = rawImage.trim();
        if (trimmed) {
          return trimmed;
        }
      }
      return readString(getProfileRecord(lead), "profileImageUrl");
    };

    const getHeadline = (lead: LeadRecord): string | undefined => {
      return lead.headline ?? readString(getProfileRecord(lead), "headline");
    };

    const getBirthday = (lead: LeadRecord): string | undefined => {
      const raw = lead.raw as LeadRecordRaw | undefined;
      const fromRaw = raw?.birthday;
      if (typeof fromRaw === "string") {
        const trimmed = fromRaw.trim();
        if (trimmed) {
          return trimmed;
        }
      }
      return readString(getProfileRecord(lead), "birthday");
    };

    const getLocation = (lead: LeadRecord): string | undefined => {
      const location = lead.location?.trim();
      if (location) {
        return location;
      }
      return readString(getProfileRecord(lead), "location");
    };

    const getPhoneNumbers = (lead: LeadRecord): string[] => {
      const raw = lead.raw as LeadRecordRaw | undefined;
      return (
        raw?.phoneNumbers
          ?.map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value): value is string => Boolean(value)) ?? []
      );
    };

    const collectExperiences = (lead: LeadRecord): LeadExperience[] => {
      const raw = lead.raw as LeadRecordRaw | undefined;
      if (!raw) {
        return [];
      }
      return [...(raw.previousCompanies ?? []), ...(raw.experiences ?? [])].filter((experience) =>
        Boolean(experience.title || experience.company)
      );
    };

    const formatExperiences = (experiences: LeadExperience[]): string => {
      if (!experiences.length) {
        return "";
      }
      return experiences
        .map((experience) => {
          const range =
            experience.dateRangeText ??
            [experience.startDate, experience.endDate].filter(Boolean).join(" - ");
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

    const columns: { header: string; value: (lead: LeadRecord) => string }[] = [
      { header: "fullName", value: (lead) => lead.fullName ?? "" },
      { header: "profileUrl", value: (lead) => lead.profileUrl ?? "" },
      { header: "profileImageUrl", value: (lead) => getProfileImageUrl(lead) ?? "" },
      { header: "headline", value: (lead) => getHeadline(lead) ?? "" },
      { header: "email", value: (lead) => lead.email ?? "" },
      { header: "birthday", value: (lead) => getBirthday(lead) ?? "" },
      { header: "location", value: (lead) => getLocation(lead) ?? "" },
      {
        header: "phoneNumbers",
        value: (lead) => getPhoneNumbers(lead).join(" | ")
      },
      { header: "currentTitle", value: (lead) => lead.title ?? "" },
      { header: "currentCompany", value: (lead) => lead.companyName ?? "" },
      { header: "companyLinkedInUrl", value: (lead) => lead.companyUrl ?? "" },
      {
        header: "experiences",
        value: (lead) => formatExperiences(collectExperiences(lead))
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
