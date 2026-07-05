const { loadEnvFile } = require("../src/config/env");
const { getCalendarProvider } = require("../src/calendar/calendarProvider");
const { demoClinic, demoDoctor } = require("../src/demo/demoData");

loadEnvFile();

async function main() {
  const provider = getCalendarProvider("google_service_account");

  await provider.checkCalendarAccess();

  const start = new Date(Date.now() + 10 * 60 * 1000);
  const end = new Date(start.getTime() + 10 * 60 * 1000);
  const event = await provider.createCalendarEvent({
    clinic: demoClinic,
    doctor: demoDoctor,
    patient: {
      id: "service_account_test"
    },
    treatmentInterest: "service account test",
    selectedSlot: {
      id: `service_account_test_${start.getTime()}`,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      timezone: demoClinic.timezone,
      display_label: "Oravia Service Account Test"
    },
    summary: "Oravia Service Account Test"
  });

  console.log(`Created Google Calendar event ID: ${event.calendar_event_id}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
