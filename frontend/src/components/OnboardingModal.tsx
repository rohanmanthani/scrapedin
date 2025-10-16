import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AutomationSettings } from "../types";
import { apiClient } from "../api/client";

interface OnboardingModalProps {
  settings?: AutomationSettings;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToSettings: () => void;
}

export const OnboardingModal = ({ settings, isOpen, onClose, onNavigateToSettings }: OnboardingModalProps) => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ sessionCookie: string }>("/settings/fetch-cookie", {});
      return data;
    },
    onSuccess: (data) => {
      if (!settings) {
        void queryClient.invalidateQueries({ queryKey: ["settings"] });
        return;
      }
      const next: AutomationSettings = { ...settings, sessionCookie: data.sessionCookie };
      void queryClient.setQueryData(["settings"], next);
    }
  });

  const needsLinkedIn = !settings?.sessionCookie;
  const needsOpenAI = !settings?.openAIApiKey;

  const steps = useMemo(() => {
    const list = [] as Array<{
      title: string;
      description: string;
      action?: () => void;
      cta?: string;
      loading?: boolean;
    }>;
    if (needsLinkedIn) {
      list.push({
        title: "Connect LinkedIn",
        description:
          "Click the button to reuse your browser profile or sign in once. We capture and store the li_at cookie locally.",
        action: () => {
          if (!mutation.isLoading) {
            mutation.mutate();
          }
        },
        cta: mutation.isLoading ? "Fetching..." : "Fetch LinkedIn Cookie",
        loading: mutation.isLoading
      });
    }
    if (needsOpenAI) {
      list.push({
        title: "Add OpenAI Key",
        description: "Paste your OpenAI API key in Settings so GPT can generate ICPs and enrich leads.",
        action: () => {
          onNavigateToSettings();
          onClose();
        },
        cta: "Open Settings"
      });
    }
    return list;
  }, [needsLinkedIn, needsOpenAI, mutation, onClose, onNavigateToSettings]);

  if (!isOpen || (!needsLinkedIn && !needsOpenAI)) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <header className="modal__header">
          <h2>Welcome to ScrapedIn</h2>
          <p>Before you start, connect LinkedIn and add your AI key so automation can run end-to-end.</p>
        </header>
        <div className="modal__body">
          <ol className="modal__steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <div className="modal__step-index">{index + 1}</div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  {step.action && step.cta && (
                    <button
                      type="button"
                      className="button"
                      onClick={step.action}
                      disabled={step.loading}
                    >
                      {step.cta}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
        <footer className="modal__footer">
          <button type="button" className="button button--secondary" onClick={onClose} disabled={mutation.isLoading}>
            {needsOpenAI ? "I'll add it manually" : "Done"}
          </button>
        </footer>
      </div>
    </div>
  );
};
