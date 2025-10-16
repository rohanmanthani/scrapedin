import type { FC } from "react";

interface AutomationStatusBadgeProps {
  isEnabled?: boolean;
  isLoading?: boolean;
  onOpenSettings?: () => void;
}

export const AutomationStatusBadge: FC<AutomationStatusBadgeProps> = ({
  isEnabled = false,
  isLoading = false,
  onOpenSettings
}) => {
  const automationStatusClass = `automation-status__light ${
    isEnabled ? "automation-status__light--active" : "automation-status__light--paused"
  }`;

  const label = isLoading ? "Checking status..." : isEnabled ? "Automation armed" : "Automation paused";

  if (!onOpenSettings) {
    return (
      <span className="automation-status-badge">
        <span className={automationStatusClass} aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="automation-status-badge"
      onClick={onOpenSettings}
      title="Manage automation in Settings"
    >
      <span className={automationStatusClass} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
};
