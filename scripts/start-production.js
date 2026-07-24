#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { validateProductionRuntimeConfig } = require("../src/ops/productionConfig");
const { createStructuredLogger } = require("../src/ops/structuredLogger");
const { resolveServerStorageConfig, STORAGE_MODES } = require("../src/persistence/storageConfig");
const { createSqlitePersistenceProvider } = require("../src/persistence/sqliteProvider");

const logger = createStructuredLogger();

function main() {
  const startedAt = Date.now();
  const validation = validateProductionRuntimeConfig(process.env, {
    createDataDirectory: true,
  });

  if (!validation.accepted) {
    logger.error("startup_config_invalid", {
      operation: "startup",
      result: "blocked",
      errors: validation.errors,
    });
    process.exit(1);
  }

  const storage = resolveServerStorageConfig();
  let provider;
  let lockPath = "";

  try {
    if (storage.storageMode === STORAGE_MODES.SQLITE) {
      provider = createSqlitePersistenceProvider({
        databasePath: storage.databasePath,
        clinicId: storage.clinicId,
      });
      lockPath = `${storage.databasePath}.oravia-server.lock`;
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
        { flag: "w" }
      );
      provider.close();
      provider = null;
    }
  } catch (error) {
    logger.error("startup_sqlite_failed", {
      operation: "startup",
      result: "blocked",
      code: error.code || "sqlite_startup_failed",
    });
    provider?.close?.();
    removeLock(lockPath);
    process.exit(1);
  }

  logger.info("startup_ready", {
    operation: "startup",
    result: "ready",
    durationMs: Date.now() - startedAt,
    storageMode: storage.storageMode,
  });

  const serverPath = resolveServerPath();
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
      PORT: process.env.PORT || "3000",
    },
    stdio: "inherit",
  });

  const shutdown = (signal) => {
    logger.info("shutdown_requested", {
      operation: "shutdown",
      result: "closing",
      signal,
    });
    child.kill(signal);
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  child.on("exit", (code, signal) => {
    removeLock(lockPath);
    logger.info("shutdown_complete", {
      operation: "shutdown",
      result: code === 0 || signal ? "closed" : "failed",
      code: Number.isInteger(code) ? code : null,
      signal: signal || "",
    });
    process.exit(code || 0);
  });
}

function resolveServerPath() {
  const standalone = path.resolve(process.cwd(), "server.js");
  if (fs.existsSync(standalone)) {
    return standalone;
  }

  const nextStandalone = path.resolve(process.cwd(), ".next/standalone/server.js");
  if (fs.existsSync(nextStandalone)) {
    return nextStandalone;
  }

  throw new Error("Next standalone server output is missing. Run npm run build first.");
}

function removeLock(lockPath) {
  if (!lockPath) {
    return;
  }
  try {
    fs.rmSync(lockPath, { force: true });
  } catch {}
}

main();
