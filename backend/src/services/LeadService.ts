import type { LeadRecord } from "../types.js";
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

  async exportAsCsv(): Promise<string> {
    const leads = await this.list();
    const headers: (keyof LeadRecord)[] = [
      "fullName",
      "title",
      "taskName",
      "companyName",
      "inferredCompanyName",
      "inferredCompanyDomain",
      "email",
      "emailVerificationStatus",
      "profileUrl",
      "salesNavigatorUrl",
      "headline",
      "location",
      "connectionDegree",
      "capturedAt"
    ];
    const rows = leads.map((lead) =>
      headers
        .map((header) => {
          const value = lead[header];
          if (value == null) {
            return "";
          }
          const asString = String(value).replace(/"/g, '""');
          return `"${asString}"`;
        })
        .join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }

  async enrichPendingEmails(): Promise<LeadRecord[]> {
    const settings = await this.settingsService.get();
    if (!settings.openAIApiKey) {
      throw new Error("OpenAI API key is not configured in settings");
    }

    const leads = await this.repository.listLeads();
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
}
