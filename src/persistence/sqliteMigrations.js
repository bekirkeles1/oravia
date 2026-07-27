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
  Object.freeze({
    version: 3,
    name: "whatsapp_cloud_lifecycle_foundation",
    statements: Object.freeze([
      `CREATE TABLE IF NOT EXISTS messaging_channel_identities (
        clinic_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        business_phone_number_id TEXT NOT NULL,
        lookup_hash TEXT NOT NULL,
        encrypted_identity_json TEXT NOT NULL,
        masked_label TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, provider, business_phone_number_id, lookup_hash),
        FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id)
      )`,
      `CREATE TABLE IF NOT EXISTS messaging_inbound_events (
        clinic_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_event_id TEXT NOT NULL,
        business_phone_number_id TEXT NOT NULL,
        sender_lookup_hash TEXT,
        message_type TEXT NOT NULL,
        processing_status TEXT NOT NULL,
        conversation_reference TEXT,
        safe_result_json TEXT,
        event_fingerprint TEXT NOT NULL,
        received_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, provider, provider_event_id),
        FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id)
      )`,
      `CREATE TABLE IF NOT EXISTS messaging_outbound_messages (
        clinic_id TEXT NOT NULL,
        internal_message_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_message_id TEXT,
        direction TEXT NOT NULL,
        operation_kind TEXT NOT NULL,
        appointment_id TEXT,
        conversation_reference TEXT,
        content_fingerprint TEXT NOT NULL,
        destination_lookup_hash TEXT,
        provider_status TEXT NOT NULL,
        status_rank INTEGER NOT NULL,
        safe_failure_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, internal_message_id),
        UNIQUE (clinic_id, provider, provider_message_id),
        FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id)
      )`,
      `CREATE TABLE IF NOT EXISTS messaging_status_events (
        clinic_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_message_id TEXT NOT NULL,
        provider_status TEXT NOT NULL,
        event_fingerprint TEXT NOT NULL,
        safe_failure_json TEXT,
        received_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, provider, provider_message_id, event_fingerprint),
        FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_messaging_outbound_provider_status
        ON messaging_outbound_messages (clinic_id, provider, provider_status)`,
      `CREATE INDEX IF NOT EXISTS idx_messaging_inbound_sender
        ON messaging_inbound_events (clinic_id, provider, sender_lookup_hash)`,
    ]),
  }),
  Object.freeze({
    version: 4,
    name: "appointment_change_lifecycle_history",
    statements: Object.freeze([
      `CREATE TABLE IF NOT EXISTS appointment_lifecycle_events (
        clinic_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        appointment_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        previous_appointment_version INTEGER NOT NULL,
        resulting_appointment_version INTEGER NOT NULL,
        event_json TEXT NOT NULL,
        created_sequence INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, event_id),
        UNIQUE (clinic_id, appointment_id, created_sequence),
        FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id),
        FOREIGN KEY (clinic_id, appointment_id) REFERENCES appointments(clinic_id, appointment_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_appointment_lifecycle_events_appointment
        ON appointment_lifecycle_events (clinic_id, appointment_id, created_sequence)`,
    ]),
  }),
  Object.freeze({
    version: 5,
    name: "appointment_reminder_jobs",
    statements: Object.freeze([
      `CREATE TABLE IF NOT EXISTS appointment_reminder_jobs (
        clinic_id TEXT NOT NULL,
        reminder_job_id TEXT NOT NULL,
        appointment_id TEXT NOT NULL,
        appointment_version INTEGER NOT NULL,
        offset_identifier TEXT NOT NULL,
        offset_minutes INTEGER NOT NULL,
        scheduled_dispatch_at TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL,
        operation_fingerprint TEXT NOT NULL,
        provider_message_reference TEXT,
        outbound_lifecycle_reference TEXT,
        safe_failure_category TEXT,
        result_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (clinic_id, reminder_job_id),
        UNIQUE (clinic_id, appointment_id, appointment_version, offset_minutes),
        FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id),
        FOREIGN KEY (clinic_id, appointment_id) REFERENCES appointments(clinic_id, appointment_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_appointment_reminder_jobs_due
        ON appointment_reminder_jobs (clinic_id, status, scheduled_dispatch_at)`,
      `CREATE INDEX IF NOT EXISTS idx_appointment_reminder_jobs_appointment
        ON appointment_reminder_jobs (clinic_id, appointment_id, appointment_version)`,
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
