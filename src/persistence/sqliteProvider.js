const fs = require("node:fs");
const path = require("node:path");

const { runSqliteMigrations } = require("./sqliteMigrations");

function createSqlitePersistenceProvider({ databasePath, clinicId }) {
  const safePath = normalizeDatabasePath(databasePath);
  const safeClinicId = normalizeClinicId(clinicId);

  if (!safePath) {
    throw createPersistenceError(
      "invalid_sqlite_database_path",
      "SQLite database path is invalid."
    );
  }

  if (!safeClinicId) {
    throw createPersistenceError(
      "invalid_sqlite_clinic_id",
      "SQLite clinic id is invalid."
    );
  }

  fs.mkdirSync(path.dirname(safePath), { recursive: true });

  let database;
  let closed = false;

  try {
    const { DatabaseSync } = loadNodeSqlite();
    database = new DatabaseSync(safePath);
    configureSqliteConnection(database);
    runSqliteMigrations(database);
    database
      .prepare(
        `INSERT INTO clinics (clinic_id, created_at, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(clinic_id) DO UPDATE SET updated_at = excluded.updated_at`
      )
      .run(safeClinicId, now(), now());
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch {}
    }

    throw createPersistenceError(
      error.code || "sqlite_open_failed",
      "SQLite persistence initialization failed safely.",
      error
    );
  }

  return Object.freeze({
    providerType: "sqlite_persistence_provider_v1",
    storageMode: "sqlite",
    durablePersistence: true,
    databasePersisted: true,
    clinicId: safeClinicId,
    getClinicId() {
      return safeClinicId;
    },
    getDatabase() {
      assertOpen();
      return database;
    },
    withTransaction(work) {
      assertOpen();

      if (typeof work !== "function") {
        throw createPersistenceError(
          "invalid_sqlite_transaction_work",
          "SQLite transaction work must be a function."
        );
      }

      database.exec("BEGIN IMMEDIATE");

      try {
        const result = work();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          database.exec("ROLLBACK");
        } catch {}
        throw error;
      }
    },
    async withTransactionAsync(work) {
      assertOpen();

      if (typeof work !== "function") {
        throw createPersistenceError(
          "invalid_sqlite_transaction_work",
          "SQLite transaction work must be a function."
        );
      }

      database.exec("BEGIN IMMEDIATE");

      try {
        const result = await work();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          database.exec("ROLLBACK");
        } catch {}
        throw error;
      }
    },
    close() {
      if (!closed) {
        closed = true;
        database.close();
      }
    },
  });

  function assertOpen() {
    if (closed) {
      throw createPersistenceError(
        "sqlite_database_closed",
        "SQLite database is already closed."
      );
    }
  }
}

function configureSqliteConnection(database) {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec("PRAGMA busy_timeout = 5000");
}

function normalizeDatabasePath(value) {
  const databasePath = String(value || "").trim();

  if (!databasePath || databasePath.includes("\0")) {
    return "";
  }

  return path.resolve(databasePath);
}

function normalizeClinicId(value) {
  const clinicId = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return clinicId && clinicId.length <= 80 ? clinicId : "";
}

function now() {
  return new Date().toISOString();
}

function createPersistenceError(code, reason, cause) {
  const error = new Error(reason);
  error.code = code;
  error.safeReason = reason;
  error.cause = cause;
  return error;
}

function loadNodeSqlite() {
  const runtimeRequire = eval("require");
  return runtimeRequire("node:sqlite");
}

module.exports = {
  configureSqliteConnection,
  createSqlitePersistenceProvider,
};
