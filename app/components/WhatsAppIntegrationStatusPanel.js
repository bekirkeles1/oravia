"use client";

import { useEffect, useState } from "react";

export default function WhatsAppIntegrationStatusPanel() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let active = true;

    fetch("/api/integrations/whatsapp/status")
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload?.authorized !== false) {
          setStatus(payload);
        }
      })
      .catch(() => {
        if (active) {
          setStatus(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!status || status.accepted === false) {
    return null;
  }

  return (
    <section className="technical-section" aria-labelledby="whatsapp-status-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Integration</p>
          <h2 id="whatsapp-status-title">WhatsApp Cloud Status</h2>
        </div>
      </div>

      <div className="system-status-grid">
        <article className="system-status-item">
          <span>Provider</span>
          <strong className="system-status-badge ready">
            {status.providerMode}
          </strong>
        </article>
        <article className="system-status-item">
          <span>Configuration</span>
          <strong className="system-status-badge ready">
            {status.configurationComplete ? "complete" : "incomplete"}
          </strong>
        </article>
        <article className="system-status-item">
          <span>Business phone</span>
          <strong className="system-status-badge ready">
            {status.phoneNumberIdMasked || "mock"}
          </strong>
        </article>
        <article className="system-status-item">
          <span>Auto reply</span>
          <strong className="system-status-badge ready">
            {status.autoReplyMode}
          </strong>
        </article>
        <article className="system-status-item">
          <span>Latest inbound</span>
          <strong className="system-status-badge ready">
            {status.latest?.inbound?.processingStatus || "none"}
          </strong>
        </article>
        <article className="system-status-item">
          <span>Latest outbound</span>
          <strong className="system-status-badge ready">
            {status.latest?.outbound?.providerStatus || "none"}
          </strong>
        </article>
      </div>
    </section>
  );
}
