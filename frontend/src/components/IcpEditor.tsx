import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutoPlanResponse, ICPProfile } from "../types";
import { apiClient } from "../api/client";

export const IcpEditor = () => {
  const queryClient = useQueryClient();
  const { data: profile, isLoading, error, refetch } = useQuery({
    queryKey: ["icp"],
    queryFn: async () => {
      const { data } = await apiClient.get<ICPProfile>("/icp");
      return data;
    }
  });

  const [commandName, setCommandName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<AutoPlanResponse>("/workflow/auto-plan", {
        instructions: prompt,
        commandName: commandName.trim() || undefined
      });
      return data;
    },
    onSuccess: (result) => {
      setAutomationMessage(
        `Draft automation created using the ${result.modes[0]?.name ?? "selected"} profile. Review it in Step 2.`
      );
      setPrompt("");
      void queryClient.invalidateQueries({ queryKey: ["icp"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["search-presets"] });
    }
  });

  if (isLoading && !profile) {
    return <div className="panel">Loading...</div>;
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Step 1 · New Command</h2>
        <p>
          Describe the market segment you want ScrapedIn to pursue. We will generate ICP filters and create draft
          automations for each enabled mode.
        </p>
        <div className="input-group">
          <label htmlFor="command-name">Command name (optional)</label>
          <input
            id="command-name"
            value={commandName}
            onChange={(event) => setCommandName(event.target.value)}
            placeholder="e.g., HR SaaS expansion"
          />
        </div>
        <div className="input-group">
          <label htmlFor="command-prompt">Instructions</label>
          <textarea
            id="command-prompt"
            rows={4}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              setAutomationMessage(null);
            }}
            placeholder="Describe personas, industries, geographies, and keywords for the search."
          />
        </div>
        <div className="ai-helper__actions">
          <button
            type="button"
            className="button"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isLoading || !prompt.trim()}
          >
            {generateMutation.isLoading ? "Generating..." : "Generate Draft Automations"}
          </button>
          {generateMutation.isError && (
            <span className="text-error">
              {(generateMutation.error instanceof Error && generateMutation.error.message) ||
                "Generation failed. Check your settings and try again."}
            </span>
          )}
          {automationMessage && <span className="text-success">{automationMessage}</span>}
        </div>
      </section>

      {error ? (
        <div className="panel alert alert--error">
          <div>Could not load the current ICP. {error instanceof Error ? error.message : null}</div>
          <button type="button" className="button button--secondary" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {profile && (
        <section className="panel">
          <h2>Latest ICP Snapshot</h2>
          <div className="icp-summary-grid">
            <div>
              <h3>Titles</h3>
              <p>{profile.idealTitles.join(", ") || "—"}</p>
            </div>
            <div>
              <h3>Industries</h3>
              <p>{profile.industries.join(", ") || "—"}</p>
            </div>
            <div>
              <h3>Keywords</h3>
              <p>{profile.keywords.join(", ") || "—"}</p>
            </div>
            <div>
              <h3>Geographies</h3>
              <p>{profile.geographies.join(", ") || "—"}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
