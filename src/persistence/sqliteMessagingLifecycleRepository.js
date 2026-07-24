const crypto = require("node:crypto");

const {
  canAdvanceStatus,
  getStatusRank,
  normalizeWhatsAppStatus,
} = require("../messaging/whatsappStatusLifecycle");
const {
  freezeClone,
  parseJsonObject,
  stringifyJson,
} = require("./sqliteJson");

function createSqliteMessagingLifecycleRepository({ persistenceProvider }) {
  const database = persistenceProvider.getDatabase();
  const clinicId = persistenceProvider.getClinicId();

  return Object.freeze({
    repositoryType: "sqlite_messaging_lifecycle_repository_v1",
    storage: "sqlite",
    durablePersistence: true,
    databasePersisted: true,
    upsertChannelIdentity(input) {
      const now = new Date().toISOString();
      const value = validateIdentity(input);
      if (!value.accepted) return value;

      database
        .prepare(
          `INSERT INTO messaging_channel_identities (
            clinic_id, provider, business_phone_number_id, lookup_hash,
            encrypted_identity_json, masked_label, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(clinic_id, provider, business_phone_number_id, lookup_hash)
          DO UPDATE SET updated_at = excluded.updated_at`
        )
        .run(
          clinicId,
          value.provider,
          value.businessPhoneNumberId,
          value.lookupHash,
          stringifyJson(value.encryptedIdentity),
          value.maskedLabel,
          now,
          now
        );

      return freezeClone({
        accepted: true,
        lookupHash: value.lookupHash,
        maskedLabel: value.maskedLabel,
      });
    },
    getChannelIdentity({ provider, businessPhoneNumberId, lookupHash }) {
      const row = database
        .prepare(
          `SELECT encrypted_identity_json, masked_label
           FROM messaging_channel_identities
           WHERE clinic_id = ? AND provider = ? AND business_phone_number_id = ?
             AND lookup_hash = ?`
        )
        .get(
          clinicId,
          normalizeText(provider),
          normalizeText(businessPhoneNumberId),
          normalizeText(lookupHash)
        );

      if (!row) return null;

      return freezeClone({
        encryptedIdentity: parseJsonObject(row.encrypted_identity_json),
        maskedLabel: row.masked_label,
      });
    },
    reserveInboundEvent(input) {
      const value = validateInboundEvent(input);
      if (!value.accepted) return value;

      const existing = database
        .prepare(
          `SELECT event_fingerprint, safe_result_json
           FROM messaging_inbound_events
           WHERE clinic_id = ? AND provider = ? AND provider_event_id = ?`
        )
        .get(clinicId, value.provider, value.providerEventId);

      if (existing) {
        if (existing.event_fingerprint !== value.eventFingerprint) {
          return reject("inbound_provider_event_conflict", { conflict: true });
        }

        return freezeClone({
          accepted: true,
          duplicate: true,
          safeResult: parseJsonObject(existing.safe_result_json),
        });
      }

      const now = new Date().toISOString();
      database
        .prepare(
          `INSERT INTO messaging_inbound_events (
            clinic_id, provider, provider_event_id, business_phone_number_id,
            sender_lookup_hash, message_type, processing_status,
            conversation_reference, safe_result_json, event_fingerprint,
            received_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
        )
        .run(
          clinicId,
          value.provider,
          value.providerEventId,
          value.businessPhoneNumberId,
          value.senderLookupHash,
          value.messageType,
          "reserved",
          value.conversationReference,
          value.eventFingerprint,
          now,
          now
        );

      return freezeClone({ accepted: true, duplicate: false });
    },
    completeInboundEvent(input) {
      const provider = normalizeText(input?.provider);
      const providerEventId = normalizeText(input?.providerEventId);
      const safeResult = sanitizeResult(input?.safeResult);

      if (!provider || !providerEventId) {
        return reject("invalid_inbound_completion");
      }

      database
        .prepare(
          `UPDATE messaging_inbound_events
           SET processing_status = ?, safe_result_json = ?, updated_at = ?
           WHERE clinic_id = ? AND provider = ? AND provider_event_id = ?`
        )
        .run(
          safeResult.processingStatus || "processed",
          stringifyJson(safeResult),
          new Date().toISOString(),
          clinicId,
          provider,
          providerEventId
        );

      return freezeClone({ accepted: true, safeResult });
    },
    recordOutboundAccepted(input) {
      const value = validateOutbound(input);
      if (!value.accepted) return value;

      const now = new Date().toISOString();
      const internalMessageId =
        value.internalMessageId ||
        `msg_${crypto.randomBytes(12).toString("base64url")}`;

      database
        .prepare(
          `INSERT INTO messaging_outbound_messages (
            clinic_id, internal_message_id, provider, provider_message_id,
            direction, operation_kind, appointment_id, conversation_reference,
            content_fingerprint, destination_lookup_hash, provider_status,
            status_rank, safe_failure_json, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
        )
        .run(
          clinicId,
          internalMessageId,
          value.provider,
          value.providerMessageId,
          value.direction,
          value.operationKind,
          value.appointmentId,
          value.conversationReference,
          value.contentFingerprint,
          value.destinationLookupHash,
          "accepted",
          getStatusRank("accepted"),
          now,
          now
        );

      return freezeClone({
        accepted: true,
        internalMessageId,
        providerMessageId: value.providerMessageId,
        providerStatus: "accepted",
      });
    },
    applyStatusEvent(input) {
      const value = validateStatusEvent(input);
      if (!value.accepted) return value;

      const existingEvent = database
        .prepare(
          `SELECT event_fingerprint
           FROM messaging_status_events
           WHERE clinic_id = ? AND provider = ? AND provider_message_id = ?
             AND event_fingerprint = ?`
        )
        .get(
          clinicId,
          value.provider,
          value.providerMessageId,
          value.eventFingerprint
        );

      if (existingEvent) {
        return freezeClone({ accepted: true, duplicate: true, updated: false });
      }

      const outbound = database
        .prepare(
          `SELECT internal_message_id, provider_status
           FROM messaging_outbound_messages
           WHERE clinic_id = ? AND provider = ? AND provider_message_id = ?`
        )
        .get(clinicId, value.provider, value.providerMessageId);

      const now = new Date().toISOString();
      database
        .prepare(
          `INSERT INTO messaging_status_events (
            clinic_id, provider, provider_message_id, provider_status,
            event_fingerprint, safe_failure_json, received_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          clinicId,
          value.provider,
          value.providerMessageId,
          value.providerStatus,
          value.eventFingerprint,
          stringifyJson(value.safeFailure),
          now
        );

      if (!outbound) {
        return freezeClone({
          accepted: true,
          unknownProviderMessage: true,
          updated: false,
        });
      }

      if (!canAdvanceStatus(outbound.provider_status, value.providerStatus)) {
        return freezeClone({
          accepted: true,
          ignoredRegression: true,
          updated: false,
          providerStatus: outbound.provider_status,
        });
      }

      database
        .prepare(
          `UPDATE messaging_outbound_messages
           SET provider_status = ?, status_rank = ?, safe_failure_json = ?,
               updated_at = ?
           WHERE clinic_id = ? AND internal_message_id = ?`
        )
        .run(
          value.providerStatus,
          getStatusRank(value.providerStatus),
          stringifyJson(value.safeFailure),
          now,
          clinicId,
          outbound.internal_message_id
        );

      return freezeClone({
        accepted: true,
        updated: true,
        providerStatus: value.providerStatus,
      });
    },
    getLatestSummary() {
      const inbound = database
        .prepare(
          `SELECT processing_status, message_type, updated_at
           FROM messaging_inbound_events
           WHERE clinic_id = ?
           ORDER BY updated_at DESC
           LIMIT 1`
        )
        .get(clinicId);
      const outbound = database
        .prepare(
          `SELECT provider, provider_status, operation_kind, updated_at
           FROM messaging_outbound_messages
           WHERE clinic_id = ?
           ORDER BY updated_at DESC
           LIMIT 1`
        )
        .get(clinicId);

      return freezeClone({
        inbound: inbound
          ? {
              processingStatus: inbound.processing_status,
              messageType: inbound.message_type,
              updatedAt: inbound.updated_at,
            }
          : null,
        outbound: outbound
          ? {
              provider: outbound.provider,
              providerStatus: outbound.provider_status,
              operationKind: outbound.operation_kind,
              updatedAt: outbound.updated_at,
            }
          : null,
      });
    },
  });
}

function validateIdentity(input) {
  const provider = normalizeText(input?.provider);
  const businessPhoneNumberId = normalizeText(input?.businessPhoneNumberId);
  const lookupHash = normalizeText(input?.lookupHash);
  const encryptedIdentity = input?.encryptedIdentity;
  const maskedLabel = normalizeText(input?.maskedLabel);
  if (!provider || !businessPhoneNumberId || !lookupHash || !encryptedIdentity || !maskedLabel) {
    return reject("invalid_channel_identity_record");
  }
  return { accepted: true, provider, businessPhoneNumberId, lookupHash, encryptedIdentity, maskedLabel };
}

function validateInboundEvent(input) {
  const value = {
    provider: normalizeText(input?.provider),
    providerEventId: normalizeText(input?.providerEventId),
    businessPhoneNumberId: normalizeText(input?.businessPhoneNumberId),
    senderLookupHash: normalizeText(input?.senderLookupHash),
    messageType: normalizeText(input?.messageType),
    conversationReference: normalizeText(input?.conversationReference),
    eventFingerprint: normalizeText(input?.eventFingerprint),
  };
  return value.provider && value.providerEventId && value.businessPhoneNumberId && value.messageType && value.eventFingerprint
    ? { accepted: true, ...value }
    : reject("invalid_inbound_event_record");
}

function validateOutbound(input) {
  const value = {
    internalMessageId: normalizeText(input?.internalMessageId),
    provider: normalizeText(input?.provider),
    providerMessageId: normalizeText(input?.providerMessageId),
    direction: normalizeText(input?.direction || "outbound"),
    operationKind: normalizeText(input?.operationKind),
    appointmentId: normalizeText(input?.appointmentId),
    conversationReference: normalizeText(input?.conversationReference),
    contentFingerprint: normalizeText(input?.contentFingerprint),
    destinationLookupHash: normalizeText(input?.destinationLookupHash),
  };
  return value.provider && value.providerMessageId && value.direction && value.operationKind && value.contentFingerprint
    ? { accepted: true, ...value }
    : reject("invalid_outbound_message_record");
}

function validateStatusEvent(input) {
  const providerStatus = normalizeWhatsAppStatus(input?.providerStatus);
  const value = {
    provider: normalizeText(input?.provider),
    providerMessageId: normalizeText(input?.providerMessageId),
    providerStatus,
    eventFingerprint: normalizeText(input?.eventFingerprint),
    safeFailure: sanitizeFailure(input?.safeFailure),
  };
  return value.provider && value.providerMessageId && value.providerStatus && value.eventFingerprint
    ? { accepted: true, ...value }
    : reject("invalid_status_event_record");
}

function sanitizeResult(result) {
  return result && typeof result === "object" && !Array.isArray(result)
    ? {
        processingStatus: normalizeText(result.processingStatus || "processed"),
        code: normalizeText(result.code),
        intent: normalizeText(result.intent),
        replyDispatched: result.replyDispatched === true,
        duplicate: result.duplicate === true,
      }
    : { processingStatus: "processed" };
}

function sanitizeFailure(failure) {
  return failure && typeof failure === "object" && !Array.isArray(failure)
    ? {
        code: normalizeText(failure.code),
        title: normalizeText(failure.title).slice(0, 120),
      }
    : null;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function reject(code, extra = {}) {
  return freezeClone({
    accepted: false,
    code,
    reason: "Messaging lifecycle repository operation failed safely.",
    ...extra,
  });
}

module.exports = {
  createSqliteMessagingLifecycleRepository,
};
