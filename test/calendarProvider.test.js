const assert = require("node:assert/strict");
const test = require("node:test");

const { getCalendarProvider } = require("../src/calendar/calendarProvider");
const { demoClinic, demoDoctor } = require("../src/demo/demoData");

test("mock calendar provider returns demo slots and creates fake calendar events", () => {
  const provider = getCalendarProvider("mock");
  const slots = provider.getAvailableSlots({
    clinic: demoClinic,
    doctor: demoDoctor,
    now: new Date("2026-06-28T09:00:00.000Z"),
    limit: 2
  });
  const event = provider.createCalendarEvent({
    clinic: demoClinic,
    doctor: demoDoctor,
    patient: { id: "patient_demo" },
    treatmentInterest: "implant",
    selectedSlot: slots[0]
  });

  assert.equal(provider.name, "mock");
  assert.equal(slots.length, 2);
  assert.equal(event.calendar_provider, "mock");
  assert.equal(event.calendar_event_id, `mock_calendar_event_${slots[0].id}`);
  assert.equal(event.start_time, slots[0].start_at);
  assert.equal(event.end_time, slots[0].end_at);
});
