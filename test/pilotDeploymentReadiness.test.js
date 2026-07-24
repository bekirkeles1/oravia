const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const { createAuthRuntime } = require("../src/auth/authRepositoryFactory");
const { createUserWithPassword } = require("../src/auth/authService");
const { validateMutationOrigin } = require("../src/auth/routeAuth");
const { createSqlitePersistenceProvider } = require("../src/persistence/sqliteProvider");
const { validateProductionRuntimeConfig } = require("../src/ops/productionConfig");
const { getLivenessStatus, getReadinessStatus } = require("../src/ops/healthReadiness");
const { createStructuredLogger } = require("../src/ops/structuredLogger");
const { applySecurityHeaders } = require("../src/ops/securityHeaders");
const readyRoute = require("../app/api/health/ready/route");
const liveRoute = require("../app/api/health/live/route");

const SECRET = "synthetic-secret-value-with-enough-length";
const CHANNEL_KEY = "synthetic-channel-identity-key-with-enough-length";

function createTemp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `oravia-pilot-${label}-`));
  return {
    dir,
    databasePath: path.join(dir, "oravia.sqlite"),
    backupPath: path.join(dir, "backup.sqlite"),
  };
}

function cleanup(temp) {
  if (temp?.dir && fs.existsSync(temp.dir)) {
    fs.rmSync(temp.dir, { recursive: true, force: true });
  }
}

function withEnv(env, work) {
  const previous = {};
  const names = new Set([
    ...Object.keys(env),
    "NODE_ENV",
    "ORAVIA_RUNTIME_ENV",
    "ORAVIA_PUBLIC_BASE_URL",
    "ORAVIA_TRUSTED_ORIGIN",
    "ORAVIA_AUTH_REQUIRED",
    "ORAVIA_SESSION_COOKIE_SECURE",
    "ORAVIA_SESSION_SECRET",
    "ORAVIA_STORAGE_MODE",
    "ORAVIA_SQLITE_DATABASE_PATH",
    "ORAVIA_CLINIC_ID",
    "ORAVIA_WHATSAPP_CHANNEL_IDENTITY_KEY",
    "ORAVIA_WHATSAPP_PROVIDER_MODE",
    "ORAVIA_TRUST_PROXY_HEADERS",
    "CALENDAR_PROVIDER",
    "ORAVIA_CALENDAR_PROVIDER",
    "GOOGLE_SERVICE_ACCOUNT_KEY_PATH",
    "GOOGLE_CALENDAR_ID",
  ]);

  for (const name of names) {
    previous[name] = process.env[name];
    if (env[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = env[name];
    }
  }

  return Promise.resolve()
    .then(work)
    .finally(() => {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    });
}

function productionEnv(temp, overrides = {}) {
  return {
    NODE_ENV: "production",
    ORAVIA_RUNTIME_ENV: "production",
    ORAVIA_PUBLIC_BASE_URL: "https://pilot.example.test",
    ORAVIA_TRUSTED_ORIGIN: "https://pilot.example.test",
    ORAVIA_AUTH_REQUIRED: "true",
    ORAVIA_SESSION_COOKIE_SECURE: "true",
    ORAVIA_SESSION_SECRET: SECRET,
    ORAVIA_STORAGE_MODE: "sqlite",
    ORAVIA_SQLITE_DATABASE_PATH: temp.databasePath,
    ORAVIA_CLINIC_ID: "clinic_pilot_test",
    ORAVIA_WHATSAPP_CHANNEL_IDENTITY_KEY: CHANNEL_KEY,
    ORAVIA_WHATSAPP_PROVIDER_MODE: "mock",
    CALENDAR_PROVIDER: "mock",
    ...overrides,
  };
}

test("production config fails closed for missing core values and real provider downgrade", () => {
  const temp = createTemp("config");
  try {
    const missingBase = validateProductionRuntimeConfig(
      productionEnv(temp, { ORAVIA_PUBLIC_BASE_URL: "" })
    );
    assert.equal(missingBase.accepted, false);
    assert.match(missingBase.errors.join(","), /missing_production_base_url/);

    const invalidOrigin = validateProductionRuntimeConfig(
      productionEnv(temp, { ORAVIA_TRUSTED_ORIGIN: "http://pilot.example.test" })
    );
    assert.equal(invalidOrigin.accepted, false);
    assert.match(invalidOrigin.errors.join(","), /invalid_trusted_origin/);

    const insecureCookie = validateProductionRuntimeConfig(
      productionEnv(temp, { ORAVIA_SESSION_COOKIE_SECURE: "false" })
    );
    assert.equal(insecureCookie.accepted, false);
    assert.match(
      insecureCookie.errors.join(","),
      /insecure_production_cookie_configuration/
    );

    const realProviderIncomplete = validateProductionRuntimeConfig(
      productionEnv(temp, { ORAVIA_WHATSAPP_PROVIDER_MODE: "meta_cloud" })
    );
    assert.equal(realProviderIncomplete.accepted, false);
    assert.match(
      realProviderIncomplete.errors.join(","),
      /incomplete_meta_whatsapp_config/
    );
  } finally {
    cleanup(temp);
  }
});

test("readiness validates sqlite migrations and health responses remain secret-free", async () => {
  const temp = createTemp("ready");
  try {
    await withEnv(productionEnv(temp), async () => {
      const readiness = getReadinessStatus();
      assert.equal(readiness.accepted, true);
      assert.equal(readiness.checks.databaseReady, true);
      assert.equal(readiness.schema.current, readiness.schema.expected);

      const response = await readyRoute.GET(
        new Request("https://pilot.example.test/api/health/ready", {
          headers: { "x-oravia-correlation-id": "pilot-ready-0001" },
        })
      );
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-oravia-correlation-id"), "pilot-ready-0001");
      assert.equal(JSON.stringify(body).includes(temp.databasePath), false);
      assert.equal(JSON.stringify(body).includes(SECRET), false);

      const live = await liveRoute.GET(
        new Request("https://pilot.example.test/api/health/live")
      );
      const liveBody = await live.json();
      assert.equal(live.status, 200);
      assert.equal(liveBody.status, "live");
      assert.equal(JSON.stringify(liveBody).includes("sqlite"), false);
    });
  } finally {
    cleanup(temp);
  }
});

test("readiness reports database failure and newer schema safely", async () => {
  const temp = createTemp("ready-fail");
  try {
    const blockedParent = path.join(temp.dir, "not-a-directory");
    fs.writeFileSync(blockedParent, "x");
    const unavailable = validateProductionRuntimeConfig(
      productionEnv(temp, {
        ORAVIA_SQLITE_DATABASE_PATH: path.join(
          blockedParent,
          "child",
          "oravia.sqlite"
        ),
      }),
      { createDataDirectory: false }
    );
    assert.equal(unavailable.accepted, false);
    assert.match(unavailable.errors.join(","), /unavailable_sqlite_path/);

    const db = new DatabaseSync(temp.databasePath);
    db.exec(
      "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"
    );
    db.prepare(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
    ).run(999, "future", new Date().toISOString());
    db.close();

    await withEnv(productionEnv(temp), async () => {
      const readiness = getReadinessStatus();
      assert.equal(readiness.accepted, false);
      assert.equal(readiness.checks.databaseReady, false);
      assert.equal(JSON.stringify(readiness).includes(temp.databasePath), false);
    });
  } finally {
    cleanup(temp);
  }
});

test("production mutation origin rejects spoofed and invalid forwarded hosts", async () => {
  const temp = createTemp("origin");
  try {
    await withEnv(productionEnv(temp, { ORAVIA_TRUST_PROXY_HEADERS: "true" }), () => {
      const validProxy = validateMutationOrigin(
        new Request("http://127.0.0.1/api/secretary/doctors/availability", {
          method: "PATCH",
          headers: {
            origin: "https://pilot.example.test",
            host: "127.0.0.1",
            "x-forwarded-host": "pilot.example.test",
            "x-forwarded-proto": "https",
          },
        })
      );
      assert.equal(validProxy.accepted, true);

      const spoofed = validateMutationOrigin(
        new Request("http://127.0.0.1/api/secretary/doctors/availability", {
          method: "PATCH",
          headers: {
            origin: "https://pilot.example.test",
            host: "127.0.0.1",
            "x-forwarded-host": "evil.example.test",
            "x-forwarded-proto": "https",
          },
        })
      );
      assert.equal(spoofed.accepted, false);
      assert.equal(spoofed.body.code, "invalid_origin");
    });
  } finally {
    cleanup(temp);
  }
});

test("backup refuses collisions and restore validates confirmation schema and malformed input", async () => {
  const temp = createTemp("backup");
  try {
    await withEnv(productionEnv(temp), () => {
      const runtime = createAuthRuntime({});
      try {
        const created = createUserWithPassword({
          repository: runtime.repository,
          user: {
            clinicId: runtime.clinicId,
            username: "pilot-manager",
            displayName: "Pilot Manager",
            role: "manager",
            password: "synthetic-password",
          },
        });
        assert.equal(created.status, "ok");
      } finally {
        runtime.close();
      }

      const backup = spawnSync(
        process.execPath,
        ["scripts/db-backup.js", "--output", temp.backupPath],
        { cwd: process.cwd(), env: process.env, encoding: "utf8" }
      );
      assert.equal(backup.status, 0, backup.stderr);
      assert.equal(fs.existsSync(temp.backupPath), true);

      const collision = spawnSync(
        process.execPath,
        ["scripts/db-backup.js", "--output", temp.backupPath],
        { cwd: process.cwd(), env: process.env, encoding: "utf8" }
      );
      assert.notEqual(collision.status, 0);
      assert.match(collision.stderr, /sqlite_backup_output_collision/);

      const noConfirm = spawnSync(
        process.execPath,
        ["scripts/db-restore.js", "--input", temp.backupPath],
        { cwd: process.cwd(), env: process.env, encoding: "utf8" }
      );
      assert.notEqual(noConfirm.status, 0);
      assert.match(noConfirm.stdout, /sqlite_restore_confirmation_required/);

      const malformedPath = path.join(temp.dir, "malformed.sqlite");
      fs.writeFileSync(malformedPath, "not sqlite");
      const malformed = spawnSync(
        process.execPath,
        ["scripts/db-restore.js", "--input", malformedPath, "--confirm"],
        { cwd: process.cwd(), env: process.env, encoding: "utf8" }
      );
      assert.notEqual(malformed.status, 0);
      assert.match(malformed.stderr, /sqlite_restore_malformed_backup/);

      const oldSchemaPath = path.join(temp.dir, "old.sqlite");
      const oldDb = new DatabaseSync(oldSchemaPath);
      oldDb.exec(
        "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"
      );
      oldDb.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
      ).run(1, "old", new Date().toISOString());
      oldDb.close();
      const incompatible = spawnSync(
        process.execPath,
        ["scripts/db-restore.js", "--input", oldSchemaPath, "--confirm"],
        { cwd: process.cwd(), env: process.env, encoding: "utf8" }
      );
      assert.notEqual(incompatible.status, 0);
      assert.match(incompatible.stderr, /sqlite_restore_incompatible_schema/);
    });
  } finally {
    cleanup(temp);
  }
});

test("restore rolls database back to backup state without exposing contents", async () => {
  const temp = createTemp("restore-smoke");
  try {
    await withEnv(productionEnv(temp), () => {
      let runtime = createAuthRuntime({});
      try {
        createUserWithPassword({
          repository: runtime.repository,
          user: {
            clinicId: runtime.clinicId,
            username: "before-backup",
            displayName: "Before Backup",
            role: "manager",
            password: "synthetic-password",
          },
        });
      } finally {
        runtime.close();
      }

      const backup = spawnSync(
        process.execPath,
        ["scripts/db-backup.js", "--output", temp.backupPath],
        { cwd: process.cwd(), env: process.env, encoding: "utf8" }
      );
      assert.equal(backup.status, 0, backup.stderr);

      runtime = createAuthRuntime({});
      try {
        createUserWithPassword({
          repository: runtime.repository,
          user: {
            clinicId: runtime.clinicId,
            username: "after-backup",
            displayName: "After Backup",
            role: "manager",
            password: "synthetic-password",
          },
        });
      } finally {
        runtime.close();
      }

      const restore = spawnSync(
        process.execPath,
        ["scripts/db-restore.js", "--input", temp.backupPath, "--confirm"],
        { cwd: process.cwd(), env: process.env, encoding: "utf8" }
      );
      assert.equal(restore.status, 0, restore.stderr);
      assert.equal(restore.stdout.includes("before-backup"), false);

      runtime = createAuthRuntime({});
      try {
        assert.ok(
          runtime.repository.findUserByUsername({
            clinicId: runtime.clinicId,
            username: "before-backup",
          })
        );
        assert.equal(
          runtime.repository.findUserByUsername({
            clinicId: runtime.clinicId,
            username: "after-backup",
          }),
          null
        );
      } finally {
        runtime.close();
      }
    });
  } finally {
    cleanup(temp);
  }
});

test("structured logging redacts credentials identities and patient-like values", () => {
  const records = [];
  const logger = createStructuredLogger({
    level: "debug",
    sink: (line) => records.push(line),
  });

  logger.info("provider_result", {
    correlationId: "pilot-log-0001",
    accessToken: "synthetic-access-token-value",
    phone: "+905550001122",
    messageBody: "Synthetic clinical text",
    provider: "meta_cloud",
    result: "failed",
  });

  const line = records[0];
  assert.match(line, /pilot-log-0001/);
  assert.match(line, /meta_cloud/);
  assert.equal(line.includes("synthetic-access-token-value"), false);
  assert.equal(line.includes("+905550001122"), false);
  assert.equal(line.includes("Synthetic clinical text"), false);
});

test("security middleware sets production-safe headers", () => {
  const headers = new Headers();
  applySecurityHeaders(headers, {
    NODE_ENV: "production",
    ORAVIA_PUBLIC_BASE_URL: "https://pilot.example.test",
  });
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.match(headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(headers.get("permissions-policy"), /camera=\(\)/);
  assert.match(headers.get("strict-transport-security"), /max-age=/);
});

test("container startup command fails closed without required production core config", () => {
  const result = spawnSync(process.execPath, ["scripts/start-production.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      ORAVIA_RUNTIME_ENV: "production",
      ORAVIA_PUBLIC_BASE_URL: "",
      ORAVIA_AUTH_REQUIRED: "false",
    },
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /startup_config_invalid/);
  assert.equal((result.stdout + result.stderr).includes(SECRET), false);
});

test("sqlite restart preserves committed state and WAL files stay beside database", () => {
  const temp = createTemp("restart");
  try {
    let provider = createSqlitePersistenceProvider({
      databasePath: temp.databasePath,
      clinicId: "clinic_restart_test",
    });
    provider
      .getDatabase()
      .prepare(
        "INSERT INTO repository_metadata (clinic_id, repository_name, version, updated_at) VALUES (?, ?, ?, ?)"
      )
      .run("clinic_restart_test", "pilot_restart", 1, new Date().toISOString());
    provider.close();

    provider = createSqlitePersistenceProvider({
      databasePath: temp.databasePath,
      clinicId: "clinic_restart_test",
    });
    const row = provider
      .getDatabase()
      .prepare(
        "SELECT version FROM repository_metadata WHERE clinic_id = ? AND repository_name = ?"
      )
      .get("clinic_restart_test", "pilot_restart");
    assert.equal(row.version, 1);
    assert.equal(fs.existsSync(`${temp.databasePath}-wal`), true);
    provider.close();
  } finally {
    cleanup(temp);
  }
});
