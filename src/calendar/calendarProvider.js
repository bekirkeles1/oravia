const { createMockCalendarProvider } = require("./mockCalendarProvider");

function getCalendarProvider(
  providerName = process.env.ORAVIA_CALENDAR_PROVIDER || "mock"
) {
  if (providerName === "mock") {
    return createMockCalendarProvider();
  }

  throw new Error(
    `Unsupported calendar provider "${providerName}". Supported providers: mock.`
  );
}

module.exports = {
  getCalendarProvider
};
