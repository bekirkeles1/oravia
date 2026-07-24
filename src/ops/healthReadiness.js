const { MIGRATIONS } = require("../persistence/sqliteMigrations");
const { createSqlitePersistenceProvider } = require("../persistence/sqliteProvider");
const { resolveServerStorageConfig, STORAGE_MODES } = require("../persistence/storageConfig");
const { validateProductionRuntimeConfig } = require("./productionConfig");

function getLivenessStatus() {
  return Object.freeze({
    accepted: true,
    status: "live",
  });
}

function getReadinessStatus(options = {}) {
  const env = options.env || process.env;
  const config = validateProductionRuntimeConfig(env, {
    createDataDirectory: options.createDataDirectory !== false,
  });

  if (!config.accepted) {
    return reject("runtime_config_invalid", {
      configValid: false,
      errors: config.errors,
    });
  }

  const storage = resolveServerStorageConfig({
    storageMode: env.ORAVIA_STORAGE_MODE,
    databasePath: env.ORAVIA_SQLITE_DATABASE_PATH,
    clinicId: env.ORAVIA_CLINIC_ID,
  });

  if (!storage.accepted) {
    return reject("storage_config_invalid", { configValid: true });
  }

  if (storage.storageMode !== STORAGE_MODES.SQLITE) {
    return Object.freeze({
      accepted: true,
      status: "ready",
      checks: Object.freeze({
        configValid: true,
        storageMode: storage.storageMode,
        databaseReady: true,
        migrationsCurrent: true,
        clinicReady: true,
      }),
      operations: Object.freeze({
        backupReady: false,
      }),
    });
  }

  let provider;
  try {
    provider = createSqlitePersistenceProvider({
      databasePath: storage.databasePath,
      clinicId: storage.clinicId,
    });
    const database = provider.getDatabase();
    const migration = database
      .prepare("SELECT MAX(version) AS version FROM schema_migrations")
      .get();
    const clinic = database
      .prepare("SELECT 1 AS ok FROM clinics WHERE clinic_id = ?")
      .get(storage.clinicId);
    const currentSchemaVersion = Number(migration?.version || 0);
    const expectedSchemaVersion = MIGRATIONS.at(-1).version;

    if (currentSchemaVersion !== expectedSchemaVersion || !clinic) {
      return reject("sqlite_readiness_failed", {
        configValid: true,
        databaseReady: true,
        migrationsCurrent: currentSchemaVersion === expectedSchemaVersion,
        clinicReady: Boolean(clinic),
      });
    }

    return Object.freeze({
      accepted: true,
      status: "ready",
      checks: Object.freeze({
        configValid: true,
        storageMode: storage.storageMode,
        databaseReady: true,
        migrationsCurrent: true,
        clinicReady: true,
      }),
      schema: Object.freeze({
        current: currentSchemaVersion,
        expected: expectedSchemaVersion,
      }),
      operations: Object.freeze({
        backupReady: true,
      }),
      providers: config.summary.providers,
    });
  } catch (error) {
    return reject(error.code || "sqlite_readiness_failed", {
      configValid: true,
      databaseReady: false,
      migrationsCurrent: false,
      clinicReady: false,
    });
  } finally {
    provider?.close?.();
  }
}

function reject(code, checks) {
  return Object.freeze({
    accepted: false,
    status: "not_ready",
    code,
    checks: Object.freeze({
      configValid: checks.configValid === true,
      databaseReady: checks.databaseReady === true,
      migrationsCurrent: checks.migrationsCurrent === true,
      clinicReady: checks.clinicReady === true,
    }),
  });
}

module.exports = {
  getLivenessStatus,
  getReadinessStatus,
};
