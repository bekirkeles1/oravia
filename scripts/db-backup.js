#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { resolveServerStorageConfig, STORAGE_MODES } = require("../src/persistence/storageConfig");
const { createSqlitePersistenceProvider } = require("../src/persistence/sqliteProvider");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = resolveServerStorageConfig();

  if (!config.accepted || config.storageMode !== STORAGE_MODES.SQLITE) {
    fail("sqlite_backup_requires_configured_sqlite_storage");
    return;
  }

  const outputPath = resolveOutputPath(args, config.databasePath);
  if (!outputPath) {
    fail("sqlite_backup_output_required");
    return;
  }

  if (fs.existsSync(outputPath) && args.overwrite !== true) {
    fail("sqlite_backup_output_collision");
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  let provider;
  try {
    provider = createSqlitePersistenceProvider({
      databasePath: config.databasePath,
      clinicId: config.clinicId,
    });
    const database = provider.getDatabase();
    database.exec("PRAGMA wal_checkpoint(FULL)");
    const backup = database.serialize();
    fs.writeFileSync(outputPath, backup, { flag: args.overwrite ? "w" : "wx" });
    console.log(
      JSON.stringify({
        accepted: true,
        code: "sqlite_backup_created",
        output: maskBasename(outputPath),
      })
    );
  } catch (error) {
    fail(error.code || "sqlite_backup_failed");
  } finally {
    provider?.close?.();
  }
}

function resolveOutputPath(args, databasePath) {
  if (args.output) {
    return path.resolve(String(args.output));
  }

  const backupDir = path.resolve(
    String(process.env.ORAVIA_SQLITE_BACKUP_DIR || path.join(path.dirname(databasePath), "backups"))
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(backupDir, `oravia-${stamp}.sqlite`);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === "--overwrite") {
      parsed.overwrite = true;
      continue;
    }
    if (item.startsWith("--")) {
      parsed[item.slice(2)] = args[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function maskBasename(filePath) {
  return path.basename(filePath);
}

function fail(code) {
  console.error(JSON.stringify({ accepted: false, code }));
  process.exitCode = 1;
}

main();
