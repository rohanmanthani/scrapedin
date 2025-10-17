import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadExperience, LeadRecord, LeadRecordRaw } from "../types";
import { apiClient } from "../api/client";

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return undefined;
};

const readString = (record: Record<string, unknown> | undefined, key: string): string | undefined => {
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

const truncate = (value: string, limit = 120): string => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit).trim()}…`;
};

const getProfileImageUrl = (lead: LeadRecord, profileRecord: Record<string, unknown> | undefined) => {
  const rawProfileImageUrl = (lead.raw as LeadRecordRaw | undefined)?.profileImageUrl;
  if (typeof rawProfileImageUrl === "string" && rawProfileImageUrl.trim()) {
    return rawProfileImageUrl.trim();
  }

  const nested = readString(profileRecord, "profileImageUrl");
  return nested ?? undefined;
};

const collectExperiences = (raw: LeadRecordRaw | undefined): LeadExperience[] => {
  if (!raw) {
    return [];
  }

  const experiences = [...(raw.previousCompanies ?? []), ...(raw.experiences ?? [])];
  return experiences.filter((experience) => Boolean(experience.title || experience.company));
};

export const LeadTable = () => {
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const queryClient = useQueryClient();
  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data } = await apiClient.get<LeadRecord[]>("/leads");
      return data;
    },
    refetchInterval: 30_000
  });
  const enrichMutation = useMutation<{ updated: number }, unknown, string[] | undefined>({
    mutationFn: async (ids) => {
      const payload = ids?.length ? { ids } : undefined;
      const { data } = await apiClient.post<{ updated: number }>("/leads/enrich", payload);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
    }
  });

  useEffect(() => {
    if (!leads?.length) {
      setSelectedLeadIds([]);
      return;
    }
    setSelectedLeadIds((previous) => previous.filter((id) => leads.some((lead) => lead.id === id)));
  }, [leads]);

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds((previous) => {
      if (previous.includes(leadId)) {
        return previous.filter((id) => id !== leadId);
      }
      return [...previous, leadId];
    });
  };

  const selectAll = (checked: boolean) => {
    if (!leads?.length) {
      setSelectedLeadIds([]);
      return;
    }
    setSelectedLeadIds(checked ? leads.map((lead) => lead.id) : []);
  };

  const deleteMutation = useMutation<void, unknown, string[]>({
    mutationFn: async (ids: string[]) => {
      await apiClient.delete("/leads", { data: { ids } });
    },
    onSuccess: () => {
      setSelectedLeadIds([]);
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
    }
  });

  const selectedCount = selectedLeadIds.length;
  const totalLeads = leads?.length ?? 0;
  const allSelected = totalLeads > 0 && selectedLeadIds.length === totalLeads;

  const downloadCsv = async () => {
    const query = selectedLeadIds.length
      ? `?ids=${selectedLeadIds.map((id) => encodeURIComponent(id)).join(",")}`
      : "";
    const response = await apiClient.get(`/leads/export${query}`, {
      responseType: "blob"
    });
    const blob = new Blob([response.data], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "leads.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="lead-table">
      <div className="lead-table__toolbar">
        <div className="lead-table__meta">
          <p className="lead-table__count">{leads?.length ?? 0} saved profiles</p>
          {enrichMutation.isSuccess && (
            <small className="text-success">
              Email enrichment complete. Updated {enrichMutation.data?.updated ?? 0} leads.
            </small>
          )}
          {enrichMutation.isError && (
            <small className="text-error">
              {(enrichMutation.error instanceof Error && enrichMutation.error.message) ||
                "Email enrichment failed. Check your OpenAI settings."}
            </small>
          )}
          {deleteMutation.isSuccess && (
            <small className="text-success">
              Deleted {deleteMutation.variables?.length ?? 0} leads.
            </small>
          )}
          {deleteMutation.isError && (
            <small className="text-error">
              {(deleteMutation.error instanceof Error && deleteMutation.error.message) ||
                "Failed to delete selected leads."}
            </small>
          )}
        </div>
        <div className="lead-table__actions">
          <button
            className="button button--danger"
            onClick={() => {
              if (selectedCount) {
                deleteMutation.mutate(selectedLeadIds);
              }
            }}
            disabled={!selectedCount || deleteMutation.isLoading}
          >
            {deleteMutation.isLoading
              ? "Deleting..."
              : selectedCount
                ? `Delete Selected (${selectedCount})`
                : "Delete Selected"}
          </button>
          <button
            className="button"
            onClick={() =>
              enrichMutation.mutate(selectedLeadIds.length ? [...selectedLeadIds] : undefined)
            }
            disabled={enrichMutation.isLoading}
          >
            {enrichMutation.isLoading
              ? "Fetching emails..."
              : selectedCount
                ? `Fetch Emails (${selectedCount})`
                : "Fetch Emails"}
          </button>
          <button className="button button--secondary" onClick={downloadCsv}>
            {selectedCount ? `Export Selected (${selectedCount})` : "Export CSV"}
          </button>
        </div>
      </div>
      {isLoading ? (
        <p>Loading leads...</p>
      ) : !leads?.length ? (
        <p>No leads collected yet.</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all leads"
                    checked={allSelected}
                    onChange={(event) => selectAll(event.target.checked)}
                  />
                </th>
                <th>Full Name</th>
                <th>LinkedIn Profile URL</th>
                <th>Profile Photo URL</th>
                <th>Headline</th>
                <th>Email</th>
                <th>Birthday</th>
                <th>Location</th>
                <th>Phone Number</th>
                <th>Current Title</th>
                <th>Current Company</th>
                <th>Experiences</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const raw = (lead.raw ?? {}) as LeadRecordRaw;
                const profileRecord = asRecord(raw.profile);
                const profileImageUrl = getProfileImageUrl(lead, profileRecord);
                const headline = lead.headline ?? readString(profileRecord, "headline");
                const birthday = raw.birthday ?? readString(profileRecord, "birthday");
                const location = lead.location ?? readString(profileRecord, "location");
                const phoneNumbers = raw.phoneNumbers ?? [];
                const experiences = collectExperiences(raw);
                const initials = lead.fullName
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part.charAt(0).toUpperCase())
                  .join("");

                return (
                  <tr key={lead.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${lead.fullName}`}
                        checked={selectedLeadIds.includes(lead.id)}
                        onChange={() => toggleLeadSelection(lead.id)}
                      />
                    </td>
                    <td>
                      <div className="lead-profile">
                        {profileImageUrl ? (
                          <img
                            src={profileImageUrl}
                            alt={lead.fullName}
                            className="lead-profile__avatar"
                            loading="lazy"
                          />
                        ) : (
                          <div className="lead-profile__avatar lead-profile__avatar--placeholder">
                            {initials || "?"}
                          </div>
                        )}
                        <div className="lead-profile__details">
                          <strong>{lead.fullName}</strong>
                        </div>
                      </div>
                    </td>
                    <td>
                      {lead.profileUrl ? (
                        <a href={lead.profileUrl} target="_blank" rel="noreferrer">
                          {lead.profileUrl}
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {profileImageUrl ? (
                        <a href={profileImageUrl} target="_blank" rel="noreferrer">
                          {profileImageUrl}
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{headline ?? <span className="muted">—</span>}</td>
                    <td>{lead.email ?? <span className="muted">—</span>}</td>
                    <td>{birthday ?? <span className="muted">—</span>}</td>
                    <td>{location ?? <span className="muted">—</span>}</td>
                    <td>{phoneNumbers.length ? phoneNumbers.join(" | ") : <span className="muted">—</span>}</td>
                    <td>{lead.title ?? <span className="muted">—</span>}</td>
                    <td>{lead.companyName ?? <span className="muted">—</span>}</td>
                    <td>
                      {experiences.length ? (
                        <ul className="table-list">
                          {experiences.map((experience, index) => {
                            const key = `${experience.company ?? "experience"}-${index}`;
                            const header = [experience.title, experience.company]
                              .filter((value): value is string => Boolean(value))
                              .join(" @ ");
                            const details = [experience.location, experience.dateRangeText]
                              .filter((value): value is string => Boolean(value))
                              .join(" • ");
                            return (
                              <li key={key}>
                                {header && <div>{header}</div>}
                                {details && <small className="muted">{details}</small>}
                                {experience.description && (
                                  <small className="muted">{truncate(experience.description)}</small>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <a
                        href={lead.salesNavigatorUrl ?? lead.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="button button--secondary"
                      >
                        Open
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
