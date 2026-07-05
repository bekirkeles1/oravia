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

module.exports = {
  getCalendarProvider
};
