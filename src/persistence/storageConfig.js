const path = require("node:path");

const STORAGE_MODES = Object.freeze({
  IN_MEMORY: "in_memory",
  SQLITE: "sqlite",
});

const DEFAULT_CLINIC_ID = "oravia_demo_clinic";

function resolveServerStorageConfig(options = {}) {
  const mode = normalizeStorageMode(
    options.storageMode ||
      process.env.ORAVIA_STORAGE_MODE ||
      process.env.ORAVIA_APPOINTMENT_REVIEW_STORAGE_MODE ||
      STORAGE_MODES.IN_MEMORY
  );
  const clinicId = normalizeClinicId(
    options.clinicId || process.env.ORAVIA_CLINIC_ID || DEFAULT_CLINIC_ID
  );

  if (!mode) {
    return rejectConfig(
      "invalid_storage_mode",
      "Configured storage mode is invalid."
    );
  }

  if (!clinicId) {
    return rejectConfig(
      "invalid_clinic_id",
      "Configured clinic id is invalid."
    );
  }

  if (mode === STORAGE_MODES.IN_MEMORY) {
    return Object.freeze({
      accepted: true,
      storageMode: mode,
      clinicId,
      durablePersistence: false,
      databasePersisted: false,
    });
  }

  const databasePath = normalizeDatabasePath(
    options.databasePath || process.env.ORAVIA_SQLITE_DATABASE_PATH
  );

  if (!databasePath) {
    return rejectConfig(
      "missing_sqlite_database_path",
      "SQLite storage requires a configured database path."
    );
  }

  return Object.freeze({
    accepted: true,
    storageMode: mode,
    clinicId,
    databasePath,
    durablePersistence: true,
    databasePersisted: true,
  });
}

function normalizeStorageMode(value) {
  const mode = String(value || "").trim().toLowerCase();

  return Object.values(STORAGE_MODES).includes(mode) ? mode : "";
}

function normalizeClinicId(value) {
  const clinicId = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return clinicId && clinicId.length <= 80 ? clinicId : "";
}

function normalizeDatabasePath(value) {
  const databasePath = String(value || "").trim();

  if (!databasePath || databasePath.includes("\0")) {
    return "";
  }

  return path.resolve(databasePath);
}

function rejectConfig(code, reason) {
  return Object.freeze({
    accepted: false,
    code,
    reason,
    durablePersistence: false,
    databasePersisted: false,
  });
}

module.exports = {
  DEFAULT_CLINIC_ID,
  STORAGE_MODES,
  resolveServerStorageConfig,
};
