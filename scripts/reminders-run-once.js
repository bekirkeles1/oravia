#!/usr/bin/env node

const { loadEnvFile } = require("../src/config/env");
const {
  createAppointmentReviewActiveRouteRuntimeCompositionRoot,
} = require("../src/secretary/appointmentReviewRouteRuntimeCompositionRoot");
const { resolveReminderConfig } = require("../src/reminders/reminderConfig");

async function main() {
  loadEnvFile();
  const config = resolveReminderConfig(process.env);
  if (!config.accepted) {
    printSafe({
      accepted: false,
      code: config.code,
      errors: config.errors,
      providerCalled: false,
    });
    process.exit(1);
  }

  const root = createAppointmentReviewActiveRouteRuntimeCompositionRoot({});
  try {
    const runtime = root.getRouteRuntimeAdapter();
    const result = await runtime.runAppointmentReminderCycle({
      manualDispatch: true,
    });
    printSafe({
      accepted: result.accepted === true,
      code: result.code,
      claimedCount: result.claimedCount || 0,
      processedCount: result.processedCount || 0,
      resultCounts: result.resultCounts || {},
      automaticDispatchEnabled: config.automaticDispatchEnabled,
      providerMode: config.providerMode,
    });
    process.exit(result.accepted === false ? 1 : 0);
  } catch {
    printSafe({
      accepted: false,
      code: "appointment_reminder_run_once_failed",
      providerCalled: false,
    });
    process.exit(1);
  } finally {
    root.close();
  }
}

function printSafe(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main();
