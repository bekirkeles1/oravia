"use client";

import { useEffect, useState } from "react";

export default function EmptySlotOperationsPanel() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const response = await fetch("/api/secretary/empty-slots");
      const body = await response.json();
      if (!response.ok || body.accepted === false) throw new Error(body.code);
      setState(body);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "empty_slot_state_unavailable");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function runAction(kind, url, body) {
    if (!window.confirm("Bu empty-slot operasyonu sunucuda calistirilacak. Devam edilsin mi?")) return;
    setBusy(kind);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json();
      if (!response.ok || payload.accepted === false) {
        throw new Error(payload.code || payload.result?.code || "empty_slot_operation_failed");
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "empty_slot_operation_failed");
    } finally {
      setBusy("");
    }
  }

  if (!state && !error) return null;
  const config = state?.config || {};
  const counts = state?.summary?.counts || {};
  const selected = Array.isArray(state?.opportunities) ? state.opportunities[0] : null;

  return (
    <section className="technical-section" aria-labelledby="empty-slots-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Empty slot filling</p>
          <h2 id="empty-slots-title">Empty Slot Operations</h2>
        </div>
        <span className="status-pill">{config.engineEnabled ? "enabled" : "disabled"}</span>
      </div>
      {error ? <p className="manual-form-error">{error}</p> : null}
      <div className="system-status-grid">
        <Item label="Auto Opportunities" value={config.automaticOpportunityCreationEnabled ? "enabled" : "disabled"} />
        <Item label="Auto Outreach" value={config.automaticOutreachEnabled ? "enabled" : "disabled"} />
        <Item label="Open" value={String(counts.open || 0)} />
        <Item label="In Progress" value={String(counts.outreach_in_progress || 0)} />
        <Item label="Filled" value={String(counts.filled || 0)} />
        <Item label="Expired" value={String(counts.expired || 0)} />
        <Item label="Wave Limit" value={String(config.maxCandidatesPerWave || 0)} />
        <Item label="Provider" value={config.providerMode || "mock"} />
      </div>
      {selected ? (
        <div className="role-card">
          <h3>Selected opportunity</h3>
          <p>{selected.doctorName || selected.doctorId} · {selected.slotStartAt}</p>
          <small>{selected.status}</small>
        </div>
      ) : null}
      <div className="workspace-actions">
        <button disabled={Boolean(busy)} onClick={() => runAction("reconcile", "/api/secretary/empty-slots/reconcile")} type="button">
          Reconcile Opportunities
        </button>
        <button disabled={Boolean(busy)} onClick={() => runAction("run", "/api/secretary/empty-slots/run-once")} type="button">
          Process Empty Slots
        </button>
        {selected ? (
          <>
            <button disabled={Boolean(busy)} onClick={() => runAction("preview", "/api/secretary/empty-slots/preview", { opportunityId: selected.opportunityId })} type="button">
              Preview Candidates
            </button>
            <button disabled={Boolean(busy)} onClick={() => runAction("launch", "/api/secretary/empty-slots/launch-wave", { opportunityId: selected.opportunityId, expectedOpportunityVersion: selected.opportunityVersion })} type="button">
              Launch Offer Wave
            </button>
            <button disabled={Boolean(busy)} onClick={() => runAction("cancel", "/api/secretary/empty-slots/cancel", { opportunityId: selected.opportunityId })} type="button">
              Cancel Opportunity
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}

function Item({ label, value }) {
  return (
    <article className="system-status-item">
      <span>{label}</span>
      <strong className="system-status-badge neutral">{value}</strong>
    </article>
  );
}
