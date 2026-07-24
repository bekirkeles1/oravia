const {
  freezeClone,
  parseJsonValue,
  stringifyJson,
} = require("./sqliteJson");

function createSqliteOperationIdempotencyStore({
  persistenceProvider,
  operationKind,
}) {
  const database = persistenceProvider.getDatabase();
  const clinicId = persistenceProvider.getClinicId();
  const safeOperationKind = normalizeOperationKind(operationKind);

  if (!safeOperationKind) {
    throw new TypeError("operationKind is required for durable idempotency.");
  }

  return Object.freeze({
    storeType: "sqlite_operation_idempotency_store_v1",
    storage: "sqlite",
    durablePersistence: true,
    databasePersisted: true,
    observe(idempotencyKey) {
      const key = normalizeText(idempotencyKey);

      if (!key) {
        return null;
      }

      const row = database
        .prepare(
          `SELECT idempotency_key, request_fingerprint
           FROM operation_idempotency
           WHERE clinic_id = ? AND operation_kind = ? AND idempotency_key = ?`
        )
        .get(clinicId, safeOperationKind, key);

      return row
        ? freezeClone({
            idempotencyKey: row.idempotency_key,
            requestFingerprint: row.request_fingerprint,
          })
        : null;
    },
    getResult(idempotencyKey) {
      const key = normalizeText(idempotencyKey);

      if (!key) {
        return null;
      }

      const row = database
        .prepare(
          `SELECT result_json
           FROM operation_idempotency
           WHERE clinic_id = ? AND operation_kind = ? AND idempotency_key = ?`
        )
        .get(clinicId, safeOperationKind, key);

      if (!row || !row.result_json) {
        return null;
      }

      const result = parseJsonValue(row.result_json);
      return result && typeof result === "object" ? freezeClone(result) : null;
    },
    reserveResult({ idempotencyKey, requestFingerprint }) {
      const key = normalizeText(idempotencyKey);
      const fingerprint = normalizeText(requestFingerprint);

      if (!key || !fingerprint) {
        return rejectStore("invalid_idempotency_store_input");
      }

      const existing = findRecord(database, clinicId, safeOperationKind, key);

      if (existing) {
        if (existing.request_fingerprint !== fingerprint) {
          return rejectStore("idempotency_key_conflict");
        }

        return freezeClone({
          accepted: true,
          reserved: false,
          matchingReplay: true,
          code: "idempotency_result_already_reserved",
        });
      }

      const now = new Date().toISOString();
      database
        .prepare(
          `INSERT INTO operation_idempotency (
            clinic_id, operation_kind, idempotency_key,
            request_fingerprint, result_json, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, NULL, ?, ?)`
        )
        .run(clinicId, safeOperationKind, key, fingerprint, now, now);

      return freezeClone({
        accepted: true,
        reserved: true,
        matchingReplay: false,
        code: "idempotency_result_reserved",
      });
    },
    storeResult({ idempotencyKey, requestFingerprint, result }) {
      const key = normalizeText(idempotencyKey);
      const fingerprint = normalizeText(requestFingerprint);

      if (!key || !fingerprint || !result || typeof result !== "object") {
        return rejectStore("invalid_idempotency_store_input");
      }

      const existing = findRecord(database, clinicId, safeOperationKind, key);
      const now = new Date().toISOString();

      if (existing) {
        if (existing.request_fingerprint !== fingerprint) {
          return rejectStore("idempotency_key_conflict");
        }

        if (existing.result_json) {
          return freezeClone({
            accepted: true,
            stored: false,
            matchingReplay: true,
            code: "idempotency_result_already_stored",
          });
        }

        database
          .prepare(
            `UPDATE operation_idempotency
             SET result_json = ?, updated_at = ?
             WHERE clinic_id = ? AND operation_kind = ? AND idempotency_key = ?`
          )
          .run(stringifyJson(result), now, clinicId, safeOperationKind, key);

        return freezeClone({
          accepted: true,
          stored: true,
          matchingReplay: false,
          code: "idempotency_result_stored",
        });
      }

      database
        .prepare(
          `INSERT INTO operation_idempotency (
            clinic_id, operation_kind, idempotency_key,
            request_fingerprint, result_json, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          clinicId,
          safeOperationKind,
          key,
          fingerprint,
          stringifyJson(result),
          now,
          now
        );

      return freezeClone({
        accepted: true,
        stored: true,
        matchingReplay: false,
        code: "idempotency_result_stored",
      });
    },
  });
}

function findRecord(database, clinicId, operationKind, idempotencyKey) {
  return database
    .prepare(
      `SELECT request_fingerprint, result_json
       FROM operation_idempotency
       WHERE clinic_id = ? AND operation_kind = ? AND idempotency_key = ?`
    )
    .get(clinicId, operationKind, idempotencyKey);
}

function rejectStore(code) {
  return freezeClone({
    accepted: false,
    code,
    reason: "Execution idempotency store input is invalid.",
  });
}

function normalizeOperationKind(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  createSqliteOperationIdempotencyStore,
};
