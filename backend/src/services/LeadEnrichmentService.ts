import { AiService } from "./AiService.js";
import type { LeadRecord } from "../types.js";
import { verifyEmailAddress } from "../utils/emailVerifier.js";

const sanitizeName = (value: string | undefined): string => {
  if (!value) {
    return "";
  }
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const extractFirstAndLastName = (fullName: string): { first?: string; last?: string } => {
  const parts = sanitizeName(fullName).split(" ").filter(Boolean);
  if (!parts.length) {
    return {};
  }
  if (parts.length === 1) {
    return { first: parts[0] };
  }
  return { first: parts[0], last: parts[parts.length - 1] };
};

const domainFromUrl = (url?: string): string | undefined => {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return undefined;
  }
};

const buildEmailCandidates = (first?: string, last?: string, domain?: string): string[] => {
  if (!domain) {
    return [];
  }

  const normalizedDomain = domain.toLowerCase();
  const safe = (value?: string) => value?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  const firstSafe = safe(first);
  const lastSafe = safe(last);

  const candidates = new Set<string>();
  if (firstSafe && lastSafe) {
    candidates.add(`${firstSafe}.${lastSafe}@${normalizedDomain}`);
    candidates.add(`${firstSafe}${lastSafe}@${normalizedDomain}`);
    candidates.add(`${firstSafe[0]}${lastSafe}@${normalizedDomain}`);
    candidates.add(`${firstSafe}.${lastSafe[0]}@${normalizedDomain}`);
  }
  if (firstSafe) {
    candidates.add(`${firstSafe}@${normalizedDomain}`);
    if (lastSafe) {
      candidates.add(`${firstSafe[0]}${lastSafe[0]}@${normalizedDomain}`);
    }
  }
  if (lastSafe) {
    candidates.add(`${lastSafe}@${normalizedDomain}`);
  }

  return Array.from(candidates);
};

export interface EmailEnrichmentResult {
  lead: LeadRecord;
  changed: boolean;
}

export class LeadEnrichmentService {
  async enrichLead(lead: LeadRecord, ai: AiService): Promise<EmailEnrichmentResult> {
    let inferredCompanyName = lead.companyName ?? lead.inferredCompanyName;
    let inferredCompanyDomain = lead.inferredCompanyDomain ?? domainFromUrl(lead.companyUrl);

    if (!inferredCompanyName || !inferredCompanyDomain) {
      try {
        const aiResult = await ai.inferCompanyDetails(lead);
        if (!inferredCompanyName && aiResult.companyName) {
          inferredCompanyName = aiResult.companyName;
        }
        if (!inferredCompanyDomain && aiResult.companyDomain) {
          inferredCompanyDomain = aiResult.companyDomain.replace(/^https?:\/\//, "");
        }
      } catch {
        // fall back silently if AI enrichment fails
      }
    }

    const { first, last } = extractFirstAndLastName(lead.fullName);
    const emailCandidates = buildEmailCandidates(first, last, inferredCompanyDomain);

    let selectedEmail: string | undefined;
    let verificationStatus: LeadRecord["emailVerificationStatus"] = "not_found";

    for (const candidate of emailCandidates) {
      try {
        const result = await verifyEmailAddress(candidate);
        if (result === "valid") {
          selectedEmail = candidate;
          verificationStatus = "valid";
          break;
        }
        if (result === "invalid") {
          verificationStatus = "invalid";
        } else {
          if (verificationStatus !== "invalid") {
            verificationStatus = "unknown";
          }
        }
      } catch {
        if (verificationStatus !== "invalid") {
          verificationStatus = "unknown";
        }
      }
    }

    const finalStatus: LeadRecord["emailVerificationStatus"] =
      selectedEmail != null
        ? verificationStatus
        : emailCandidates.length === 0
        ? "not_found"
        : verificationStatus;

    const enriched: LeadRecord = {
      ...lead,
      inferredCompanyName,
      inferredCompanyDomain,
      email: selectedEmail,
      emailVerificationStatus: finalStatus
    };

    return {
      lead: enriched,
      changed:
        lead.inferredCompanyName !== enriched.inferredCompanyName ||
        lead.inferredCompanyDomain !== enriched.inferredCompanyDomain ||
        lead.email !== enriched.email ||
        lead.emailVerificationStatus !== enriched.emailVerificationStatus
    };
  }
}
