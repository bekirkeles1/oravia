const {
  cloneValue,
  freezeClone,
  parseJsonObject,
  stringifyJson,
} = require("./sqliteJson");

function createSqliteConversationStateStore({ persistenceProvider }) {
  const database = persistenceProvider.getDatabase();
  const clinicId = persistenceProvider.getClinicId();

  return Object.freeze({
    storage: "sqlite",
    durablePersistence: true,
    databasePersisted: true,
    getAppointmentFlowState(key) {
      const stateKey = normalizeKey(key);

      if (!stateKey) {
        return null;
      }

      const row = database
        .prepare(
          `SELECT appointment_flow_state_json
           FROM conversation_states
           WHERE clinic_id = ? AND state_key = ?`
        )
        .get(clinicId, stateKey);

      if (!row) {
        return null;
      }

      const parsed = parseJsonObject(row.appointment_flow_state_json);
      return parsed ? freezeClone(parsed) : null;
    },
    setAppointmentFlowState(key, state) {
      const stateKey = normalizeKey(key);

      if (!stateKey || !state || typeof state !== "object" || Array.isArray(state)) {
        return null;
      }

      const now = new Date().toISOString();
      const [channel, sourceIdentity] = splitStateKey(stateKey);
      const current = database
        .prepare(
          `SELECT version FROM conversation_states
           WHERE clinic_id = ? AND state_key = ?`
        )
        .get(clinicId, stateKey);
      const nextVersion = current ? current.version + 1 : 1;

      database
        .prepare(
          `INSERT INTO conversation_states (
            clinic_id, state_key, channel, source_identity,
            appointment_flow_state_json, version, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(clinic_id, state_key) DO UPDATE SET
            appointment_flow_state_json = excluded.appointment_flow_state_json,
            version = excluded.version,
            updated_at = excluded.updated_at`
        )
        .run(
          clinicId,
          stateKey,
          channel,
          sourceIdentity,
          stringifyJson(state),
          nextVersion,
          now
        );

      return freezeClone(state);
    },
    clearAppointmentFlowState(key) {
      const stateKey = normalizeKey(key);

      if (!stateKey) {
        return false;
      }

      const result = database
        .prepare(
          `DELETE FROM conversation_states
           WHERE clinic_id = ? AND state_key = ?`
        )
        .run(clinicId, stateKey);

      return result.changes > 0;
    },
  });
}

function normalizeKey(value) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

function splitStateKey(key) {
  const separatorIndex = key.indexOf(":");

  if (separatorIndex < 0) {
    return ["unknown", key];
  }

  return [key.slice(0, separatorIndex), key.slice(separatorIndex + 1)];
}

module.exports = {
  createSqliteConversationStateStore,
};
