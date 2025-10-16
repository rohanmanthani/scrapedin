import { useEffect, useMemo, useState } from "react";
import { LeadTable } from "./components/LeadTable";
import { SettingsPage } from "./components/SettingsPage";
import { OnboardingModal } from "./components/OnboardingModal";
import { useSettings } from "./hooks/useSettings";
import faviconUrl from "./assets/favicon.svg?url";
import { AutomationDashboard } from "./components/automation/AutomationDashboard";

type ActiveView = "automation" | "leads" | "settings";

const mainNav: Array<{ id: ActiveView; label: string; icon: string }> = [
  { id: "automation", label: "Automations", icon: "⚙️" },
  { id: "leads", label: "Leads", icon: "📇" },
  { id: "settings", label: "Settings", icon: "🛠" }
];

const App = () => {
  const [activeView, setActiveView] = useState<ActiveView>("automation");
  const { data: settings, isLoading: loadingSettings } = useSettings();
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dismissedOnboarding, setDismissedOnboarding] = useState(false);

  const showOnboarding = useMemo(() => {
    if (loadingSettings || !settings) {
      return false;
    }
    const needsSetup = !settings.sessionCookie || !settings.openAIApiKey;
    if (!needsSetup) {
      return false;
    }
    return !dismissedOnboarding;
  }, [loadingSettings, settings, dismissedOnboarding]);

  useEffect(() => {
    if (!loadingSettings && settings?.sessionCookie && settings?.openAIApiKey && dismissedOnboarding) {
      setDismissedOnboarding(false);
    }
  }, [loadingSettings, settings?.sessionCookie, settings?.openAIApiKey, dismissedOnboarding]);

const viewMeta = useMemo<
  Record<
    ActiveView,
    {
      title: string;
      description: string;
      render: (ctx: { onOpenSettings: () => void }) => JSX.Element;
    }
  >
>(
    () => ({
      automation: {
        title: "Automations",
        description:
          "Draft new scraping jobs, review their settings, and kick off runs when you're ready.",
        render: ({ onOpenSettings }) => <AutomationDashboard onOpenSettings={onOpenSettings} />
      },
      leads: {
        title: "Lead Vault",
        description:
          "Inspect enriched leads captured by automations, trigger email discovery, and export to CSV.",
        render: () => <LeadTable />
      },
      settings: {
        title: "Settings & API Keys",
        description:
          "Manage LinkedIn authentication, choose your AI model and automation modes, and tune guardrails.",
        render: () => <SettingsPage />
      }
    }),
    []
  );

  const activeMeta = viewMeta[activeView];

  return (
    <div className="app">
      <aside className={`app__sidebar${isSidebarCollapsed ? " app__sidebar--collapsed" : ""}`}>
        <div className="app__brand">
          <img src={faviconUrl} alt="ScrapedIn" className="app__brand-logo" />
          {!isSidebarCollapsed && <strong>ScrapedIn</strong>}
        </div>
        <nav className="app__nav">
          <div className="app__nav-section">
            {mainNav.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`app__nav-button${activeView === item.id ? " app__nav-button--active" : ""}`}
                onClick={() => setActiveView(item.id)}
                aria-label={item.label}
                title={isSidebarCollapsed ? item.label : undefined}
              >
                <span className="icon" aria-hidden>
                  {item.icon}
                </span>
                {!isSidebarCollapsed && <span>{item.label}</span>}
              </button>
            ))}
          </div>
        </nav>
        <footer className="app__footer">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {isSidebarCollapsed ? "›" : "‹"}
          </button>
          {!isSidebarCollapsed && <span className="app__version">v0.1.0</span>}
        </footer>
      </aside>
      <main className="app__content">
        <header className="page-header">
          <h1>{activeMeta.title}</h1>
          <p>{activeMeta.description}</p>
        </header>
        <div className="page-body">
          {activeMeta.render({
            onOpenSettings: () => setActiveView("settings")
          })}
        </div>
      </main>
      <OnboardingModal
        settings={settings}
        isOpen={showOnboarding}
        onClose={() => setDismissedOnboarding(true)}
        onNavigateToSettings={() => {
          setSidebarCollapsed(false);
          setActiveView("settings");
        }}
      />
    </div>
  );
};

export default App;
