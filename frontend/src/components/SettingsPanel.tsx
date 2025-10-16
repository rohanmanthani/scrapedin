import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutomationModeDefinition, AutomationModeId, AutomationSettings } from "../types";
import { apiClient } from "../api/client";
import { useSettings } from "../hooks/useSettings";

export const SettingsPanel = () => {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const [draft, setDraft] = useState<AutomationSettings | null>(null);
  const [cookieStatus, setCookieStatus] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { data: modes } = useQuery({
    queryKey: ["workflow-modes"],
    queryFn: async () => {
      const { data } = await apiClient.get<AutomationModeDefinition[]>("/workflow/modes");
      return data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: AutomationSettings) => {
      const { data } = await apiClient.put<AutomationSettings>("/settings", payload);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    }
  });

  const workingSettings = draft ?? settings;

  const updateField = <K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) => {
    setDraft((prev) => {
      const base = prev ?? settings;
      if (!base) {
        return prev;
      }
      return { ...base, [key]: value };
    });
  };

  const fetchCookieMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ sessionCookie: string; mode?: string }>("/settings/fetch-cookie", {});
      return data;
    },
    onSuccess: (data) => {
      setCookieStatus(
        data.mode === "profile"
          ? "LinkedIn cookie fetched from the configured Chrome profile."
          : "LinkedIn cookie captured. A browser window may have opened so you could sign in; it's safe to close it now."
      );
      setDraft((prev) => {
        const base = prev ?? settings;
        if (!base) {
          return prev;
        }
        return { ...base, sessionCookie: data.sessionCookie };
      });
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Unable to fetch cookie. Double-check your profile path.";
      setCookieStatus(message);
    }
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workingSettings) {
      return;
    }
    mutation.mutate(workingSettings);
  };

  if (isLoading || !workingSettings) {
    return <div className="panel">Loading automation settings...</div>;
  }

  const selectedModes = workingSettings.automationModes ?? [];

  const toggleMode = (modeId: AutomationModeId) => {
    const next = selectedModes.includes(modeId)
      ? selectedModes.filter((id) => id !== modeId)
      : [...selectedModes, modeId];

    if (next.length === 0) {
      return;
    }
    updateField("automationModes", next);
  };

  return (
    <div className="panel">
      <h2>Setup Essentials</h2>
      <p>Provide the minimum details needed to connect to LinkedIn and power AI workflows.</p>
      <form onSubmit={handleSubmit} className="settings-form">
        <section className="settings-section">
          <h3>LinkedIn Access</h3>
          <div className="input-group">
            <label htmlFor="settings-profile">
              Chrome user data directory (optional)
              <span className="tooltip" data-tooltip="Reuse your existing Chrome profile so we can capture the cookie silently.">?</span>
            </label>
            <input
              id="settings-profile"
              value={workingSettings.chromeUserDataDir ?? ""}
              onChange={(event) => updateField("chromeUserDataDir", event.target.value)}
              placeholder="~/Library/Application Support/Google/Chrome/Profile 1"
            />
          </div>
          <div className="input-group">
            <label htmlFor="settings-session">
              LinkedIn session cookie (li_at)
              <span className="tooltip" data-tooltip="Paste the li_at cookie or let us fetch it automatically.">?</span>
            </label>
            <textarea
              id="settings-session"
              rows={2}
              value={workingSettings.sessionCookie ?? ""}
              onChange={(event) => updateField("sessionCookie", event.target.value)}
              placeholder="Paste manually or click Fetch if you prefer automation."
              autoComplete="off"
            />
            <div className="fetch-cookie-row">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setCookieStatus("If a Chromium window opens, log into LinkedIn and wait a moment.");
                  fetchCookieMutation.mutate();
                }}
                disabled={fetchCookieMutation.isLoading}
              >
                {fetchCookieMutation.isLoading ? "Fetching..." : "Fetch LinkedIn Cookie"}
              </button>
              <span className="hint">Reuses your profile if available, otherwise opens a temporary window for sign-in.</span>
            </div>
            {cookieStatus && (
              <small className={fetchCookieMutation.isError ? "text-error" : "text-success"}>{cookieStatus}</small>
            )}
          </div>
        </section>

        <section className="settings-section">
          <h3>AI Credentials</h3>
          <div className="input-group">
            <label htmlFor="settings-openai-key">
              OpenAI API key
              <span className="tooltip" data-tooltip="Stored locally to generate ICPs, presets, and enrichment.">?</span>
            </label>
            <input
              id="settings-openai-key"
              type="password"
              value={workingSettings.openAIApiKey ?? ""}
              onChange={(event) => updateField("openAIApiKey", event.target.value)}
              placeholder="sk-..."
              autoComplete="off"
            />
          </div>
          <div className="input-group">
            <label htmlFor="settings-openai-model">
              Preferred model
              <span className="tooltip" data-tooltip="Pick any model your key can access.">?</span>
            </label>
            <select
              id="settings-openai-model"
              value={workingSettings.openAIModel}
              onChange={(event) => updateField("openAIModel", event.target.value)}
            >
              <option value="gpt-5-mini">gpt-5-mini</option>
              <option value="gpt-5-pro">gpt-5-pro</option>
              <option value="gpt-4.1-mini">gpt-4.1-mini</option>
              <option value="gpt-4.1">gpt-4.1</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
            </select>
          </div>
        </section>

        <section className="settings-section">
          <h3>Automation Toggle</h3>
          <div className="input-group inline">
            <label>
              <input
                type="checkbox"
                checked={workingSettings.enabled}
                onChange={(event) => updateField("enabled", event.target.checked)}
              />{" "}
              Enable background automation
            </label>
            <span className="muted">When enabled, queued searches run automatically with your guardrails.</span>
          </div>
        </section>

        <section className="settings-section">
          <h3>Automation Modes</h3>
          {modes ? (
            <div className="mode-toggle-group">
              {modes.map((mode) => {
                const isActive = selectedModes.includes(mode.id);
                return (
                  <button
                    key={mode.id}
                    type="button"
                    className={`mode-toggle${isActive ? " mode-toggle--active" : ""}`}
                    onClick={() => toggleMode(mode.id)}
                  >
                    <span className="mode-toggle__name">{mode.name}</span>
                    <span className="mode-toggle__description">{mode.description}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="muted">Loading modes...</span>
          )}
        </section>

        <div className="settings-advanced">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setShowAdvanced((prev) => !prev)}
          >
            {showAdvanced ? "Hide advanced guardrails" : "Show advanced guardrails"}
          </button>
          {showAdvanced && (
            <div className="settings-advanced__content">
              <div className="grid grid--two">
                <div className="input-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={workingSettings.headless}
                      onChange={(event) => updateField("headless", event.target.checked)}
                    />{" "}
                    Run headless (hidden browser)
                  </label>
                </div>
                <div className="input-group">
                  <label>Delay between actions (ms)</label>
                  <div style={{ display: "flex", gap: 12 }}>
                    <input
                      type="number"
                      min={0}
                      value={workingSettings.minDelayMs}
                      onChange={(event) => updateField("minDelayMs", Number(event.target.value))}
                    />
                    <input
                      type="number"
                      min={0}
                      value={workingSettings.maxDelayMs}
                      onChange={(event) => updateField("maxDelayMs", Number(event.target.value))}
                    />
                  </div>
                </div>
                <div className="input-group">
                  <label htmlFor="settings-daily-limit">Daily search limit</label>
                  <input
                    id="settings-daily-limit"
                    type="number"
                    min={0}
                    value={workingSettings.dailySearchLimit}
                    onChange={(event) => updateField("dailySearchLimit", Number(event.target.value))}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="settings-lead-cap">Daily lead capture cap</label>
                  <input
                    id="settings-lead-cap"
                    type="number"
                    min={0}
                    value={workingSettings.dailyLeadCap}
                    onChange={(event) => updateField("dailyLeadCap", Number(event.target.value))}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="settings-concurrent">Concurrent searches</label>
                  <input
                    id="settings-concurrent"
                    type="number"
                    min={1}
                    max={10}
                    value={workingSettings.concurrentSearches}
                    onChange={(event) => updateField("concurrentSearches", Number(event.target.value))}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="settings-results">Results per page</label>
                  <input
                    id="settings-results"
                    type="number"
                    min={10}
                    max={40}
                    value={workingSettings.resultsPerPage}
                    onChange={(event) => updateField("resultsPerPage", Number(event.target.value))}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="settings-chrome">Chrome executable path</label>
                  <input
                    id="settings-chrome"
                    value={workingSettings.chromeExecutablePath ?? ""}
                    onChange={(event) => updateField("chromeExecutablePath", event.target.value)}
                    placeholder="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
                  />
                </div>
                <div className="input-group" style={{ gridColumn: "1 / span 2" }}>
                  <label>Quiet hours (local time)</label>
                  <div style={{ display: "flex", gap: 12 }}>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={workingSettings.quietHours?.startHour ?? 20}
                      onChange={(event) =>
                        updateField("quietHours", {
                          startHour: Number(event.target.value),
                          endHour: workingSettings.quietHours?.endHour ?? 7
                        })
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={workingSettings.quietHours?.endHour ?? 7}
                      onChange={(event) =>
                        updateField("quietHours", {
                          startHour: workingSettings.quietHours?.startHour ?? 20,
                          endHour: Number(event.target.value)
                        })
                      }
                    />
                  </div>
                  <small>Automation waits during quiet hours to minimize account risk.</small>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="settings-actions">
          <button className="button" type="submit" disabled={mutation.isLoading}>
            {mutation.isLoading ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
};
