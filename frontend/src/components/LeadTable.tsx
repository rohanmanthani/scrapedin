import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadRecord } from "../types";
import { apiClient } from "../api/client";

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
  const enrichMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ updated: number }>("/leads/enrich");
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
    const response = await apiClient.get("/leads/export", { responseType: "blob" });
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
            onClick={() => enrichMutation.mutate()}
            disabled={enrichMutation.isLoading}
          >
            {enrichMutation.isLoading ? "Fetching emails..." : "Fetch Emails"}
          </button>
          <button className="button button--secondary" onClick={downloadCsv}>
            Export CSV
          </button>
        </div>
      </div>
      {isLoading ? (
        <p>Loading leads...</p>
      ) : !leads?.length ? (
        <p>No leads collected yet. Run Step 2 automations to start scraping prospects.</p>
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
                <th>Name</th>
                <th>Title</th>
                <th>Automation</th>
                <th>Source</th>
                <th>Company</th>
                <th>Email</th>
                <th>Location</th>
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
                    <strong>{lead.fullName}</strong>
                  </td>
                  <td>{lead.title}</td>
                  <td>{lead.taskName ?? "—"}</td>
                  <td>
                    {lead.raw?.source && typeof lead.raw.source === "string"
                      ? lead.raw.source.replace(/_/g, " ")
                      : "—"}
                  </td>
                  <td>
                    <div>{lead.companyName ?? lead.inferredCompanyName ?? "—"}</div>
                    {lead.inferredCompanyDomain && (
                      <small className="muted">{lead.inferredCompanyDomain}</small>
                    )}
                  </td>
                  <td>
                    {lead.email ? (
                      <>
                        <div>{lead.email}</div>
                        <small className="muted">Status: {formatStatus(lead.emailVerificationStatus ?? "valid")}</small>
                      </>
                    ) : (
                      <span className="muted">Status: {formatStatus(lead.emailVerificationStatus)}</span>
                    )}
                  </td>
                  <td>{lead.location}</td>
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
