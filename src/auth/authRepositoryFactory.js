const {
  STORAGE_MODES,
  resolveServerStorageConfig,
} = require("../persistence/storageConfig");
const {
  createSqlitePersistenceProvider,
} = require("../persistence/sqliteProvider");
const {
  createInMemoryAuthRepository,
  createSqliteAuthRepository,
} = require("./authRepositories");

function createAuthRuntime(options = {}) {
  const config = resolveServerStorageConfig(options);

  if (!config.accepted) {
    throw createAuthError(config.code, config.reason);
  }

  if (config.storageMode === STORAGE_MODES.SQLITE) {
    const persistenceProvider = createSqlitePersistenceProvider({
      databasePath: config.databasePath,
      clinicId: config.clinicId,
    });

    return Object.freeze({
      storageMode: "sqlite",
      clinicId: config.clinicId,
      repository: createSqliteAuthRepository({ persistenceProvider }),
      close() {
        persistenceProvider.close();
      },
    });
  }

  return Object.freeze({
    storageMode: "in_memory",
    clinicId: config.clinicId,
    repository: createInMemoryAuthRepository({ clinicId: config.clinicId }),
    close() {},
  });
}

function createAuthError(code, reason) {
  const error = new Error(reason);
  error.code = code;
  error.safeReason = reason;
  return error;
}

module.exports = {
  createAuthRuntime,
};
