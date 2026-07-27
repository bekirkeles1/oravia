"use client";

import { useEffect, useState } from "react";

export default function OperationsStatusPanel() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch("/api/operations/status")
      .then((response) => response.json())
      .then((body) => setStatus(body))
      .catch(() =>
        setStatus({
          accepted: false,
          code: "operations_status_unavailable",
        })
      );
  }, []);

  if (!status || status.accepted === false) {
    return null;
  }

  const items = [
    ["Environment", status.environment],
    ["Storage", status.storage?.mode],
    ["Database", status.database?.ready ? "ready" : "not ready"],
    ["Schema", status.database?.migrationsCurrent ? "current" : "not current"],
    ["Backup", status.backup?.ready ? "ready" : "not ready"],
    ["WhatsApp", status.providers?.whatsapp?.providerMode || "mock"],
    [
      "Google Calendar",
      status.providers?.googleCalendar?.configurationComplete
        ? status.providers.googleCalendar.mode
        : "incomplete",
    ],
    [
      "Webhook URL",
      status.publicEndpoints?.webhookCallbackConfigured ? "configured" : "not configured",
    ],
    [
      "Secure Cookies",
      status.security?.secureSessionCookies ? "enabled" : "disabled",
    ],
    [
      "Reminder Engine",
      status.reminders?.config?.engineEnabled ? "enabled" : "disabled",
    ],
    [
      "Reminder Scheduler",
      status.reminders?.config?.schedulerEnabled ? "enabled" : "disabled",
    ],
    ["Reminder Pending", String(status.reminders?.pendingCount ?? 0)],
    ["Reminder Failed", String(status.reminders?.failedCount ?? 0)],
    ["Reminder Ambiguous", String(status.reminders?.ambiguousCount ?? 0)],
    [
      "Empty Slot Engine",
      status.emptySlots?.config?.engineEnabled ? "enabled" : "disabled",
    ],
    ["Empty Slot Open", String(status.emptySlots?.openCount ?? 0)],
    ["Empty Slot Filled", String(status.emptySlots?.filledCount ?? 0)],
  ];

  return (
    <section className="technical-section" aria-labelledby="operations-status-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Pilot operations</p>
          <h2 id="operations-status-title">Deployment Status</h2>
        </div>
      </div>

      <div className="system-status-grid">
        {items.map(([label, value]) => (
          <article className="system-status-item" key={label}>
            <span>{label}</span>
            <strong className="system-status-badge neutral">{value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
