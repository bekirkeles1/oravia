const { createMockCalendarProvider } = require("./mockCalendarProvider");
const {
  createGoogleServiceAccountCalendarProvider
} = require("./googleServiceAccountCalendarProvider");

function getCalendarProvider(
  providerName =
    process.env.CALENDAR_PROVIDER ||
    process.env.ORAVIA_CALENDAR_PROVIDER ||
    "mock"
) {
  if (providerName === "mock") {
    return createMockCalendarProvider();
  }

  if (providerName === "google_service_account") {
    return createGoogleServiceAccountCalendarProvider();
  }

  throw new Error(
    `Unsupported calendar provider "${providerName}". Supported providers: mock, google_service_account.`
  );
}

function resolveCalendarProviderConfig(env = process.env) {
  const provider = String(
    env.CALENDAR_PROVIDER || env.ORAVIA_CALENDAR_PROVIDER || "mock"
  )
    .trim()
    .toLowerCase();

  if (provider === "mock") {
    return Object.freeze({
      accepted: true,
      provider: "mock",
      configurationComplete: true,
    });
  }

  if (provider === "google_service_account") {
    const keyConfigured = Boolean(
      String(env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || "").trim()
    );
    const calendarConfigured = Boolean(String(env.GOOGLE_CALENDAR_ID || "").trim());

    return Object.freeze({
      accepted: keyConfigured && calendarConfigured,
      provider: "google_service_account",
      configurationComplete: keyConfigured && calendarConfigured,
      keyPathConfigured: keyConfigured,
      calendarIdConfigured: calendarConfigured,
    });
  }

  return Object.freeze({
    accepted: false,
    provider: "invalid",
    configurationComplete: false,
  });
}

module.exports = {
  getCalendarProvider,
  resolveCalendarProviderConfig
};
