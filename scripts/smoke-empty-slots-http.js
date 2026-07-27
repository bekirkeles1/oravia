#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const stateRoute = require("../app/api/secretary/empty-slots/route");
const runOnceRoute = require("../app/api/secretary/empty-slots/run-once/route");

const previous = captureEnv();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "oravia-empty-slot-http-"));

main().catch(() => {
  safePrint({ accepted: false, code: "empty_slot_http_smoke_failed" });
  process.exit(1);
}).finally(() => {
  restoreEnv(previous);
  fs.rmSync(temp, { recursive: true, force: true });
});

async function main() {
  Object.assign(process.env, {
    ORAVIA_STORAGE_MODE: "sqlite",
    ORAVIA_SQLITE_DATABASE_PATH: path.join(temp, "oravia.sqlite"),
    ORAVIA_CLINIC_ID: "clinic_http_smoke",
    ORAVIA_AUTH_REQUIRED: "false",
    ORAVIA_EMPTY_SLOT_ENGINE_ENABLED: "true",
    ORAVIA_WHATSAPP_PROVIDER_MODE: "mock",
  });
  const state = await stateRoute.GET(new Request("http://localhost/api/secretary/empty-slots"));
  assert.equal(state.status, 200);
  const stateBody = await state.json();
  assert.equal(stateBody.accepted, true);
  assert.equal(stateBody.config.engineEnabled, true);

  const runOnce = await runOnceRoute.POST(new Request("http://localhost/api/secretary/empty-slots/run-once", {
    method: "POST",
    headers: { origin: "http://localhost" },
  }));
  assert.equal(runOnce.status, 200);
  const runBody = await runOnce.json();
  assert.equal(runBody.accepted, true);
  safePrint({ accepted: true, code: "empty_slot_http_smoke_ok" });
}

function captureEnv() {
  const keys = [
    "ORAVIA_STORAGE_MODE",
    "ORAVIA_SQLITE_DATABASE_PATH",
    "ORAVIA_CLINIC_ID",
    "ORAVIA_AUTH_REQUIRED",
    "ORAVIA_EMPTY_SLOT_ENGINE_ENABLED",
    "ORAVIA_WHATSAPP_PROVIDER_MODE",
  ];
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function safePrint(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
