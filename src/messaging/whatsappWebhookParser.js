const crypto = require("node:crypto");

function parseWhatsAppWebhookPayload(payload, config) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return reject("malformed_whatsapp_webhook_payload");
  }

  if (payload.object !== "whatsapp_business_account") {
    return reject("unsupported_whatsapp_webhook_object");
  }

  const changes = Array.isArray(payload.entry)
    ? payload.entry.flatMap((entry) => (Array.isArray(entry.changes) ? entry.changes : []))
    : [];
  const events = [];

  for (const change of changes) {
    const value = change?.value || {};
    const businessPhoneNumberId = normalizeText(value.metadata?.phone_number_id);

    if (businessPhoneNumberId !== config.phoneNumberId) {
      events.push({
        accepted: false,
        code: "unknown_business_phone_number",
        businessPhoneNumberId,
      });
      continue;
    }

    for (const message of Array.isArray(value.messages) ? value.messages : []) {
      events.push(parseMessageEvent({ message, value, businessPhoneNumberId }));
    }

    for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
      events.push(parseStatusEvent({ status, businessPhoneNumberId }));
    }
  }

  return Object.freeze({
    accepted: true,
    events: events.map((event) => Object.freeze(event)),
  });
}

function parseMessageEvent({ message, value, businessPhoneNumberId }) {
  const providerEventId = normalizeText(message.id);
  const sender = normalizeText(message.from);
  const messageType = normalizeText(message.type);
  const timestamp = normalizeTimestamp(message.timestamp);

  if (!providerEventId || !sender || !messageType) {
    return {
      accepted: false,
      code: "malformed_whatsapp_message_event",
      businessPhoneNumberId,
    };
  }

  if (messageType !== "text") {
    return {
      accepted: true,
      eventKind: "message",
      supported: false,
      providerEventId,
      businessPhoneNumberId,
      sender,
      messageType,
      timestamp,
      eventFingerprint: fingerprint({ providerEventId, sender, messageType }),
    };
  }

  const text = normalizeText(message.text?.body);

  if (!text) {
    return {
      accepted: false,
      code: "malformed_whatsapp_text_message",
      providerEventId,
      businessPhoneNumberId,
    };
  }

  return {
    accepted: true,
    eventKind: "message",
    supported: true,
    providerEventId,
    businessPhoneNumberId,
    sender,
    messageType,
    text,
    timestamp,
    eventFingerprint: fingerprint({
      providerEventId,
      sender,
      messageType,
      text,
    }),
    conversationReference: `whatsapp:${providerEventId}`,
  };
}

function parseStatusEvent({ status, businessPhoneNumberId }) {
  const providerMessageId = normalizeText(status.id);
  const providerStatus = normalizeText(status.status).toLowerCase();
  const timestamp = normalizeTimestamp(status.timestamp);

  if (!providerMessageId || !providerStatus) {
    return {
      accepted: false,
      code: "malformed_whatsapp_status_event",
      businessPhoneNumberId,
    };
  }

  return {
    accepted: true,
    eventKind: "status",
    providerMessageId,
    providerStatus,
    businessPhoneNumberId,
    timestamp,
    eventFingerprint: fingerprint({
      providerMessageId,
      providerStatus,
      timestamp,
    }),
    safeFailure: status.errors?.[0]
      ? {
          code: normalizeText(status.errors[0].code),
          title: normalizeText(status.errors[0].title),
        }
      : null,
  };
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}

function normalizeTimestamp(value) {
  const numeric = Number.parseInt(String(value || ""), 10);
  if (Number.isSafeInteger(numeric) && numeric > 0) {
    return new Date(numeric * 1000).toISOString();
  }
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function reject(code) {
  return Object.freeze({
    accepted: false,
    code,
    reason: "WhatsApp webhook payload is invalid.",
  });
}

module.exports = {
  parseWhatsAppWebhookPayload,
};
