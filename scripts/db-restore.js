#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { MIGRATIONS } = require("../src/persistence/sqliteMigrations");
const { resolveServerStorageConfig, STORAGE_MODES } = require("../src/persistence/storageConfig");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = resolveServerStorageConfig();

  if (!config.accepted || config.storageMode !== STORAGE_MODES.SQLITE) {
    fail("sqlite_restore_requires_configured_sqlite_storage");
    return;
  }

  const inputPath = args.input ? path.resolve(String(args.input)) : "";
  if (!inputPath || !fs.existsSync(inputPath)) {
    fail("sqlite_restore_input_missing");
    return;
  }

  const validation = validateBackup(inputPath);
  if (!validation.accepted) {
    fail(validation.code);
    return;
  }

  if (args.confirm !== true) {
    console.log(
      JSON.stringify({
        accepted: false,
        code: "sqlite_restore_confirmation_required",
        validBackup: true,
      })
    );
    process.exitCode = 1;
    return;
  }

  if (isServerLockPresent(config.databasePath) && args.ignoreActiveServer !== true) {
    fail("sqlite_restore_refuses_active_server");
    return;
  }

  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const safetyBackup = `${config.databasePath}.pre-restore-${Date.now()}.sqlite`;

  try {
    if (fs.existsSync(config.databasePath)) {
      fs.copyFileSync(config.databasePath, safetyBackup, fs.constants.COPYFILE_EXCL);
    }
    fs.copyFileSync(inputPath, config.databasePath);
    console.log(
      JSON.stringify({
        accepted: true,
        code: "sqlite_restore_completed",
        schemaVersion: validation.schemaVersion,
        safetyBackupCreated: fs.existsSync(safetyBackup),
      })
    );
  } catch {
    fail("sqlite_restore_failed");
  }
}

function validateBackup(inputPath) {
  let database;
  try {
    const { DatabaseSync } = loadNodeSqlite();
    database = new DatabaseSync(inputPath);
    const row = database
      .prepare("SELECT MAX(version) AS version FROM schema_migrations")
      .get();
    const schemaVersion = Number(row?.version || 0);
    const expected = MIGRATIONS.at(-1).version;
    if (schemaVersion !== expected) {
      return { accepted: false, code: "sqlite_restore_incompatible_schema" };
    }
    database.prepare("PRAGMA integrity_check").get();
    return { accepted: true, schemaVersion };
  } catch {
    return { accepted: false, code: "sqlite_restore_malformed_backup" };
  } finally {
    database?.close?.();
  }
}

function isServerLockPresent(databasePath) {
  return fs.existsSync(`${databasePath}.oravia-server.lock`);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === "--confirm") {
      parsed.confirm = true;
      continue;
    }
    if (item === "--ignore-active-server") {
      parsed.ignoreActiveServer = true;
      continue;
    }
    if (item.startsWith("--")) {
      parsed[item.slice(2)] = args[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function fail(code) {
  console.error(JSON.stringify({ accepted: false, code }));
  process.exitCode = 1;
}

function loadNodeSqlite() {
  const runtimeRequire = eval("require");
  return runtimeRequire("node:sqlite");
}

main();
