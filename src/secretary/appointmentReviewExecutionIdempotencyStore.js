const STORE_TYPE = "appointment_review_execution_idempotency_store_v1";
const STORAGE = "in_memory";

function createInMemoryAppointmentReviewExecutionIdempotencyStore() {
  const records = new Map();

  return Object.freeze({
    storeType: STORE_TYPE,
    storage: STORAGE,
    durablePersistence: false,
    observe(idempotencyKey) {
      const key = normalizeText(idempotencyKey);

      if (!key || !records.has(key)) {
        return null;
      }

      const record = records.get(key);

      return freezeClone({
        idempotencyKey: record.idempotencyKey,
        requestFingerprint: record.requestFingerprint,
      });
    },
    getResult(idempotencyKey) {
      const key = normalizeText(idempotencyKey);

      if (!key || !records.has(key)) {
        return null;
      }

      return freezeClone(records.get(key).result);
    },
    storeResult({ idempotencyKey, requestFingerprint, result }) {
      const key = normalizeText(idempotencyKey);
      const fingerprint = normalizeText(requestFingerprint);

      if (!key || !fingerprint || !result || typeof result !== "object") {
        return freezeClone({
          accepted: false,
          code: "invalid_idempotency_store_input",
          reason: "Execution idempotency store input is invalid.",
        });
      }

      if (records.has(key)) {
        const existing = records.get(key);

        if (existing.requestFingerprint !== fingerprint) {
          return freezeClone({
            accepted: false,
            code: "idempotency_key_conflict",
            reason:
              "idempotencyKey was previously used for a different execution request.",
          });
        }

        return freezeClone({
          accepted: true,
          stored: false,
          matchingReplay: true,
          code: "idempotency_result_already_stored",
        });
      }

      records.set(
        key,
        freezeClone({
          idempotencyKey: key,
          requestFingerprint: fingerprint,
          result,
        })
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

function normalizeText(value) {
  return String(value || "").trim();
}

function freezeClone(value) {
  return deepFreeze(cloneValue(value));
}

function cloneValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return value;
}

module.exports = {
  STORE_TYPE,
  createInMemoryAppointmentReviewExecutionIdempotencyStore,
};
