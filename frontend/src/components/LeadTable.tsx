import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadExperience, LeadRecord, LeadRecordRaw } from "../types";
import { apiClient } from "../api/client";

const numberFormatter = new Intl.NumberFormat();

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

const readNumber = (record: Record<string, unknown> | undefined, key: string): number | undefined => {
  if (!record) {
    return undefined;
  }
  const value = record[key];
  return typeof value === "number" ? value : undefined;
};

const truncate = (value: string, limit = 120): string => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit).trim()}…`;
};

const collectAdditionalLocations = (
  baseLocation: string | undefined,
  profileRecord: Record<string, unknown> | undefined,
  experiences?: LeadExperience[],
  previousCompanies?: LeadExperience[]
): string[] => {
  const normalizedBase = baseLocation?.trim().toLowerCase() ?? "";
  const locations = new Set<string>();
  const addLocation = (value?: string) => {
    if (!value) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    if (normalizedBase && trimmed.toLowerCase() === normalizedBase) {
      return;
    }
    locations.add(trimmed);
  };
  addLocation(readString(profileRecord, "location"));
  experiences?.forEach((experience) => addLocation(experience.location));
  previousCompanies?.forEach((experience) => addLocation(experience.location));
  return Array.from(locations);
};

export const LeadTable = () => {
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const formatStatus = (status?: LeadRecord["emailVerificationStatus"]) => {
    if (!status) {
      return "Not available";
    }
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

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
                <th>Profile</th>
                <th>Company</th>
                <th>Contact</th>
                <th>Locations</th>
                <th>Connections</th>
                <th>Education</th>
                <th>Experience</th>
                <th>Automation</th>
                <th>Source</th>
                <th>Captured</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
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
                    {(() => {
                      const raw = (lead.raw ?? {}) as LeadRecordRaw;
                      const profileRecord = asRecord(raw.profile);
                      const profileImageUrl = raw.profileImageUrl ?? readString(profileRecord, "profileImageUrl");
                      const headline = lead.headline ?? readString(profileRecord, "headline");
                      const initials = lead.fullName
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part.charAt(0).toUpperCase())
                        .join("");
                      return (
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
                            {headline && <span className="muted">{headline}</span>}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const raw = (lead.raw ?? {}) as LeadRecordRaw;
                      const profileRecord = asRecord(raw.profile);
                      const companyDomain = lead.inferredCompanyDomain;
                      const currentStart = raw.currentCompanyStartedAt ?? readString(profileRecord, "currentCompanyStartedAt");
                      return (
                        <div className="lead-company">
                          <div>{lead.companyName ?? lead.inferredCompanyName ?? "—"}</div>
                          {lead.title && <div className="muted">{lead.title}</div>}
                          {companyDomain && <small className="muted">{companyDomain}</small>}
                          {lead.companyUrl && (
                            <small className="muted">{lead.companyUrl}</small>
                          )}
                          {currentStart && <small className="muted">Since: {currentStart}</small>}
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const raw = (lead.raw ?? {}) as LeadRecordRaw;
                      const phoneNumbers = raw.phoneNumbers ?? [];
                      const birthday = raw.birthday;
                      return (
                        <div className="lead-contact">
                          {lead.email ? (
                            <div>
                              <span>{lead.email}</span>
                              <small className="muted">
                                Status: {formatStatus(lead.emailVerificationStatus ?? "valid")}
                              </small>
                            </div>
                          ) : (
                            <div>
                              <span className="muted">Email not available</span>
                              <small className="muted">Status: {formatStatus(lead.emailVerificationStatus)}</small>
                            </div>
                          )}
                          {phoneNumbers.length > 0 && (
                            <div>
                              <span className="lead-contact__label">Phone:</span>
                              <span>{phoneNumbers.join(" | ")}</span>
                            </div>
                          )}
                          {birthday && (
                            <div>
                              <span className="lead-contact__label">Birthday:</span>
                              <span>{birthday}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const raw = (lead.raw ?? {}) as LeadRecordRaw;
                      const profileRecord = asRecord(raw.profile);
                      const baseLocation = lead.location ?? readString(profileRecord, "location");
                      const additionalLocations = collectAdditionalLocations(
                        baseLocation,
                        profileRecord,
                        raw.experiences,
                        raw.previousCompanies
                      );
                      return (
                        <div className="lead-locations">
                          <div>{baseLocation ?? "—"}</div>
                          {additionalLocations.length > 0 && (
                            <ul className="table-list">
                              {additionalLocations.map((location) => (
                                <li key={location}>
                                  <small className="muted">{location}</small>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const raw = (lead.raw ?? {}) as LeadRecordRaw;
                      const profileRecord = asRecord(raw.profile);
                      const connectionsText =
                        lead.connectionsText ?? raw.connectionsText ?? readString(profileRecord, "connectionsText") ??
                        readString(profileRecord, "connections");
                      const connectionCount =
                        lead.connectionCount ?? raw.connectionCount ?? readNumber(profileRecord, "connectionCount");
                      const followersText =
                        lead.followersText ?? raw.followersText ?? readString(profileRecord, "followersText") ??
                        readString(profileRecord, "followers");
                      const followerCount =
                        lead.followerCount ?? raw.followerCount ?? readNumber(profileRecord, "followerCount");
                      const connectionLabel = connectionsText
                        ? connectionsText
                        : typeof connectionCount === "number"
                        ? `${numberFormatter.format(connectionCount)} connections`
                        : "—";
                      return (
                        <div className="lead-connections">
                          <div>{connectionLabel}</div>
                          {lead.connectionDegree && (
                            <small className="muted">Degree: {lead.connectionDegree}</small>
                          )}
                          {(followersText || typeof followerCount === "number") && (
                            <small className="muted">
                              {followersText ?? `${numberFormatter.format(followerCount ?? 0)} followers`}
                            </small>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const raw = (lead.raw ?? {}) as LeadRecordRaw;
                      const education = (raw.education ?? [])
                        .filter((entry) => Boolean(entry.school || entry.degree || entry.fieldOfStudy))
                        .slice(0, 3);
                      if (!education.length) {
                        return <span className="muted">—</span>;
                      }
                      return (
                        <ul className="table-list">
                          {education.map((entry, index) => {
                            const key = `${entry.school ?? "education"}-${index}`;
                            const details = [entry.degree, entry.fieldOfStudy]
                              .filter((value): value is string => Boolean(value))
                              .join(" • ");
                            return (
                              <li key={key}>
                                {entry.school && <div>{entry.school}</div>}
                                {details && <small className="muted">{details}</small>}
                                {entry.dateRangeText && <small className="muted">{entry.dateRangeText}</small>}
                              </li>
                            );
                          })}
                        </ul>
                      );
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const raw = (lead.raw ?? {}) as LeadRecordRaw;
                      const experiencesSource = raw.previousCompanies?.length
                        ? raw.previousCompanies
                        : raw.experiences;
                      const experiences = (experiencesSource ?? [])
                        .filter((experience) => Boolean(experience.title || experience.company))
                        .slice(0, 3);
                      if (!experiences.length) {
                        return <span className="muted">—</span>;
                      }
                      return (
                        <ul className="table-list">
                          {experiences.map((experience, index) => {
                            const key = `${experience.company ?? "experience"}-${index}`;
                            const header = [experience.title, experience.company]
                              .filter((value): value is string => Boolean(value))
                              .join(" @ ");
                            return (
                              <li key={key}>
                                {header && <div>{header}</div>}
                                {experience.location && <small className="muted">{experience.location}</small>}
                                {experience.dateRangeText && (
                                  <small className="muted">{experience.dateRangeText}</small>
                                )}
                                {experience.description && (
                                  <small className="muted">{truncate(experience.description)}</small>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      );
                    })()}
                  </td>
                  <td>{lead.taskName ?? "—"}</td>
                  <td>
                    {(() => {
                      const raw = (lead.raw ?? {}) as LeadRecordRaw;
                      const source = typeof raw.source === "string" ? raw.source.replace(/_/g, " ") : undefined;
                      const leadListName = raw.leadListName;
                      return (
                        <div className="lead-source">
                          <div>{source ?? "—"}</div>
                          {leadListName && <small className="muted">List: {leadListName}</small>}
                        </div>
                      );
                    })()}
                  </td>
                  <td>{new Date(lead.capturedAt).toLocaleString()}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
