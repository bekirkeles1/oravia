const MIGRATIONS = Object.freeze([
  Object.freeze({
    version: 1,
    name: "durable_single_clinic_foundation",
    statements: Object.freeze([
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS clinics (
        clinic_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS repository_metadata (
        clinic_id TEXT NOT NULL,
        repository_name TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, repository_name),
        FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id)
      )`,
      `CREATE TABLE IF NOT EXISTS conversation_states (
        clinic_id TEXT NOT NULL,
        state_key TEXT NOT NULL,
        channel TEXT NOT NULL,
        source_identity TEXT NOT NULL,
        appointment_flow_state_json TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, state_key),
        FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id)
      )`,
      `CREATE TABLE IF NOT EXISTS appointment_reviews (
        clinic_id TEXT NOT NULL,
        review_id TEXT NOT NULL,
        review_json TEXT NOT NULL,
        review_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, review_id),
        FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id)
      )`,
      `CREATE TABLE IF NOT EXISTS appointments (
        clinic_id TEXT NOT NULL,
        appointment_id TEXT NOT NULL,
        source_review_id TEXT NOT NULL,
        appointment_json TEXT NOT NULL,
        appointment_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, appointment_id),
        UNIQUE (clinic_id, source_review_id),
        FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id)
      )`,
      `CREATE TABLE IF NOT EXISTS operation_idempotency (
        clinic_id TEXT NOT NULL,
        operation_kind TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, operation_kind, idempotency_key),
        FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id)
      )`,
    ]),
  }),
  Object.freeze({
    version: 2,
    name: "internal_authentication_foundation",
    statements: Object.freeze([
      `CREATE TABLE IF NOT EXISTS auth_users (
        clinic_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        active INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, user_id),
        UNIQUE (clinic_id, username),
        FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id)
      )`,
      `CREATE TABLE IF NOT EXISTS auth_sessions (
        clinic_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, session_id),
        FOREIGN KEY (clinic_id, user_id) REFERENCES auth_users(clinic_id, user_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
        ON auth_sessions (clinic_id, user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
        ON auth_sessions (expires_at)`,
    ]),
  }),
]);

function runSqliteMigrations(database) {
  assertDatabase(database);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA busy_timeout = 5000");

  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const appliedRows = database
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all();
  const appliedVersions = new Set(appliedRows.map((row) => row.version));
  const latestKnownVersion = MIGRATIONS.at(-1).version;
  const unknown = Array.from(appliedVersions).filter(
    (version) => version > latestKnownVersion
  );

  if (unknown.length) {
    throw createPersistenceError(
      "sqlite_schema_version_mismatch",
      "SQLite database schema version is newer than this application."
    );
  }

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    database.exec("BEGIN IMMEDIATE");

    try {
      for (const statement of migration.statements) {
        database.exec(statement);
      }

      database
        .prepare(
          `INSERT INTO schema_migrations (version, name, applied_at)
           VALUES (?, ?, ?)`
        )
        .run(migration.version, migration.name, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw createPersistenceError(
        "sqlite_migration_failed",
        "SQLite migration failed safely.",
        error
      );
    }
  }

  return Object.freeze({
    accepted: true,
    currentSchemaVersion: latestKnownVersion,
    migrationCount: MIGRATIONS.length,
  });
}

function assertDatabase(database) {
  if (!database || typeof database.exec !== "function") {
    throw createPersistenceError(
      "invalid_sqlite_database",
      "SQLite database handle is invalid."
    );
  }
}

function createPersistenceError(code, reason, cause) {
  const error = new Error(reason);
  error.code = code;
  error.safeReason = reason;
  error.cause = cause;
  return error;
}

module.exports = {
  MIGRATIONS,
  runSqliteMigrations,
};
