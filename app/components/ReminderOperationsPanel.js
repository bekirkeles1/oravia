"use client";

import { useEffect, useState } from "react";

export default function ReminderOperationsPanel() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const response = await fetch("/api/secretary/reminders");
      const body = await response.json();
      if (!response.ok || body.accepted === false) {
        throw new Error(body.code || "reminder_state_unavailable");
      }
      setState(body);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "reminder_state_unavailable");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function runAction(kind, url, body) {
    if (!window.confirm("Bu reminder operasyonu sunucuda calistirilacak. Devam edilsin mi?")) {
      return;
    }
    setBusy(kind);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json();
      if (!response.ok || payload.accepted === false) {
        throw new Error(payload.code || payload.result?.code || "reminder_operation_failed");
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "reminder_operation_failed");
    } finally {
      setBusy("");
    }
  }

  if (!state && !error) return null;

  const summary = state?.summary || {};
  const counts = summary.counts || {};
  const config = state?.config || {};
  const failedJobs = Array.isArray(state?.jobs)
    ? state.jobs.filter((job) => job.retryEligible).slice(0, 3)
    : [];

  return (
    <section className="technical-section" aria-labelledby="reminders-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Appointment reminders</p>
          <h2 id="reminders-title">Reminder Operations</h2>
        </div>
        <span className="status-pill">{config.engineEnabled ? "enabled" : "disabled"}</span>
      </div>

      {error ? <p className="manual-form-error">{error}</p> : null}

      <div className="system-status-grid">
        <ReminderItem label="Scheduler" value={config.schedulerEnabled ? "enabled" : "disabled"} />
        <ReminderItem label="Provider" value={config.providerMode || "mock"} />
        <ReminderItem label="Offsets" value={(config.offsetsMinutes || []).join(", ") || "none"} />
        <ReminderItem label="Pending" value={String(counts.pending || 0)} />
        <ReminderItem label="Dispatched" value={String(counts.dispatched || 0)} />
        <ReminderItem label="Failed" value={String(counts.failed || 0)} />
        <ReminderItem label="Skipped/Cancelled" value={String((counts.skipped || 0) + (counts.cancelled || 0))} />
        <ReminderItem label="Ambiguous" value={String(counts.ambiguous || 0)} />
        <ReminderItem label="Next due" value={summary.nextDueAt || "none"} />
      </div>

      <div className="workspace-actions">
        <button disabled={Boolean(busy)} onClick={() => runAction("reconcile", "/api/secretary/reminders/reconcile")} type="button">
          Reconcile Reminders
        </button>
        <button disabled={Boolean(busy)} onClick={() => runAction("run", "/api/secretary/reminders/run-once")} type="button">
          Process Due Reminders
        </button>
        {failedJobs.map((job) => (
          <button
            disabled={Boolean(busy)}
            key={job.reminderJobId}
            onClick={() =>
              runAction("retry", "/api/secretary/reminders/retry", {
                reminderJobId: job.reminderJobId,
              })
            }
            type="button"
          >
            Retry Failed Reminder
          </button>
        ))}
      </div>
    </section>
  );
}

function ReminderItem({ label, value }) {
  return (
    <article className="system-status-item">
      <span>{label}</span>
      <strong className="system-status-badge neutral">{value}</strong>
    </article>
  );
}
