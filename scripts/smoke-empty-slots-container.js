#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

function main() {
  const dockerfile = fs.readFileSync("Dockerfile", "utf8");
  assert.match(dockerfile, /scripts\/empty-slots-run-once\.js/);
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
  safePrint({ accepted: true, code: "empty_slot_container_command_smoke_ok" });
}

function safePrint(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main();
