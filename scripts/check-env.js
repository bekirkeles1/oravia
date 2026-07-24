const fs = require("node:fs");
const path = require("node:path");

const { loadEnvFile } = require("../src/config/env");
const {
  WHATSAPP_PROVIDER_MODES,
  resolveWhatsAppConfig,
} = require("../src/messaging/whatsappConfig");
const {
  validateProductionRuntimeConfig,
} = require("../src/ops/productionConfig");

const SUPPORTED_CALENDAR_PROVIDERS = new Set([
  "mock",
  "google_service_account"
]);

const envResult = loadEnvFile();
const errors = [];

function main() {
  printCheck(
    envResult.loaded,
    `.env loaded`,
    ".env was not found. Create it locally from .env.example; do not commit it."
  );

  const calendarProvider = process.env.CALENDAR_PROVIDER;

  if (!calendarProvider) {
    addError(
      "CALENDAR_PROVIDER is required. Use CALENDAR_PROVIDER=mock or CALENDAR_PROVIDER=google_service_account."
    );
  } else if (!SUPPORTED_CALENDAR_PROVIDERS.has(calendarProvider)) {
    addError(
      `Unsupported CALENDAR_PROVIDER "${calendarProvider}". Supported values: mock, google_service_account.`
    );
  } else {
    console.log(`OK: CALENDAR_PROVIDER=${calendarProvider}`);
  }

  if (calendarProvider === "google_service_account") {
    validateGoogleServiceAccountEnv();
  } else if (calendarProvider === "mock") {
    console.log("OK: Google Calendar credentials are not required for mock.");
  }

  validateWhatsAppEnv();
  validateProductionEnv();

  if (errors.length > 0) {
    console.error("\nEnvironment check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\nEnvironment check passed.");
}

function validateProductionEnv() {
  const config = validateProductionRuntimeConfig(process.env, {
    createDataDirectory: false,
  });

  if (config.production && !config.accepted) {
    throw new Error(
      `Production runtime configuration is incomplete. Missing or invalid: ${config.errors.join(", ")}.`
    );
  }

  if (config.production) {
    console.log("OK: production runtime configuration is complete.");
  }
}

function validateWhatsAppEnv() {
  const config = resolveWhatsAppConfig();

  if (config.providerMode === WHATSAPP_PROVIDER_MODES.MOCK) {
    console.log("OK: ORAVIA_WHATSAPP_PROVIDER_MODE=mock");
    return;
  }

  if (!config.configurationComplete) {
    addError(
      `Meta WhatsApp configuration is incomplete. Missing: ${config.missing.join(", ")}.`
    );
    return;
  }

  console.log("OK: ORAVIA_WHATSAPP_PROVIDER_MODE=meta_cloud");
  console.log("OK: Meta WhatsApp secrets are configured without printing values.");
}

function validateGoogleServiceAccountEnv() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!keyPath) {
    addError(
      "GOOGLE_SERVICE_ACCOUNT_KEY_PATH is required when CALENDAR_PROVIDER=google_service_account."
    );
  } else if (!fs.existsSync(path.resolve(keyPath))) {
    addError(
      "GOOGLE_SERVICE_ACCOUNT_KEY_PATH points to a file that does not exist."
    );
  } else {
    console.log("OK: GOOGLE_SERVICE_ACCOUNT_KEY_PATH is set and the file exists.");
  }

  if (!calendarId) {
    addError(
      "GOOGLE_CALENDAR_ID is required when CALENDAR_PROVIDER=google_service_account."
    );
  } else {
    console.log("OK: GOOGLE_CALENDAR_ID is set.");
  }
}

function printCheck(condition, successMessage, failureMessage) {
  if (condition) {
    console.log(`OK: ${successMessage}`);
    return;
  }

  addError(failureMessage);
}

function addError(message) {
  errors.push(message);
}

main();
