#!/usr/bin/env node

const { loadEnvFile } = require("../src/config/env");
const {
  createAppointmentReviewActiveRouteRuntimeCompositionRoot,
} = require("../src/secretary/appointmentReviewRouteRuntimeCompositionRoot");
const { resolveEmptySlotConfig } = require("../src/emptySlots/emptySlotConfig");

async function main() {
  loadEnvFile();
  const config = resolveEmptySlotConfig(process.env);
  if (!config.accepted) {
    printSafe({ accepted: false, code: config.code, errors: config.errors });
    process.exit(1);
  }
  const root = createAppointmentReviewActiveRouteRuntimeCompositionRoot({});
  try {
    const result = await root.getRouteRuntimeAdapter().runEmptySlotCycle({
      manualDispatch: true,
    });
    printSafe({
      accepted: result.accepted === true,
      code: result.code,
      expiredOffers: result.expired?.expiredOffers || 0,
      expiredOpportunities: result.expired?.expiredOpportunities || 0,
      automaticOutreachEnabled: config.automaticOutreachEnabled,
      providerMode: config.providerMode,
    });
    process.exit(result.accepted === false ? 1 : 0);
  } catch {
    printSafe({ accepted: false, code: "empty_slot_run_once_failed" });
    process.exit(1);
  } finally {
    root.close();
  }
}

function printSafe(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main();
