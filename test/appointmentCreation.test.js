const assert = require("node:assert/strict");
const test = require("node:test");

const {
  matchSelectedSlot,
  runDemoAppointmentFlow
} = require("../src/appointments/appointmentCreation");

test("creates a local appointment only after a valid offered slot is selected", () => {
  const result = runDemoAppointmentFlow(
    {
      initialMessage: "Merhaba, implant için randevu almak istiyorum.",
      selectionMessage: "29 Haziran 14:00 uygun."
    },
    { now: new Date("2026-06-28T09:00:00.000Z") }
  );

  assert.equal(result.initial_message_classification.intent, "appointment_request");
  assert.equal(result.initial_message_classification.treatment_interest, "implant");
  assert.equal(result.available_slots.length, 3);
  assert.equal(result.selected_slot.id, "demo_2026-06-29_1400");
  assert.equal(result.appointment.id, "appointment_demo_2026-06-29_1400");
  assert.equal(result.appointment.status, "confirmed");
  assert.equal(result.appointment.created_by, "ai");
  assert.equal(result.appointment.calendar_provider, "mock");
  assert.equal(
    result.appointment.calendar_event_id,
    "mock_calendar_event_demo_2026-06-29_1400"
  );
  assert.equal(result.appointment.treatment_interest, "implant");
  assert.equal(result.appointment.start_time, "2026-06-29T14:00:00+03:00");
  assert.equal(result.appointment.end_time, "2026-06-29T14:30:00+03:00");
  assert.equal(result.confirmation_message, result.appointment.confirmation_message);
});

test("uses a dynamically offered slot when no explicit selection is provided", () => {
  const result = runDemoAppointmentFlow(
    {
      initialMessage: "Merhaba, implant için randevu almak istiyorum."
    },
    { now: new Date("2026-06-29T15:00:00.000Z") }
  );

  assert.equal(result.selected_slot.id, "demo_2026-06-30_1400");
  assert.equal(result.appointment.status, "confirmed");
  assert.equal(result.appointment.calendar_provider, "mock");
  assert.match(result.appointment.calendar_event_id, /mock_calendar_event_demo_2026-06-30_1400/);
});

test("creates an appointment with an async Google-shaped calendar provider", async () => {
  let createdEventInput = null;
  const mockGoogleCalendarProvider = {
    name: "google_service_account",
    getAvailableSlots() {
      return Promise.resolve([
        {
          id: "demo_2026-07-07_1000",
          start_at: "2026-07-07T10:00:00+03:00",
          end_at: "2026-07-07T10:30:00+03:00",
          timezone: "Europe/Istanbul",
          duration_minutes: 30,
          display_label: "7 Temmuz Sali 10:00"
        },
        {
          id: "demo_2026-07-07_1400",
          start_at: "2026-07-07T14:00:00+03:00",
          end_at: "2026-07-07T14:30:00+03:00",
          timezone: "Europe/Istanbul",
          duration_minutes: 30,
          display_label: "7 Temmuz Sali 14:00"
        }
      ]);
    },
    createCalendarEvent(eventInput) {
      createdEventInput = eventInput;

      return Promise.resolve({
        calendar_provider: "google_service_account",
        calendar_event_id: "google_calendar_event_456",
        start_time: eventInput.selectedSlot.start_at,
        end_time: eventInput.selectedSlot.end_at
      });
    }
  };
  const result = await runDemoAppointmentFlow(
    {
      initialMessage: "Merhaba, implant için randevu almak istiyorum.",
      selectionMessage: ""
    },
    {
      calendarProvider: mockGoogleCalendarProvider
    }
  );

  assert.equal(result.initial_message_classification.intent, "appointment_request");
  assert.equal(result.available_slots.length, 2);
  assert.equal(result.selected_slot.id, "demo_2026-07-07_1400");
  assert.equal(createdEventInput.selectedSlot.id, result.selected_slot.id);
  assert.equal(result.appointment.status, "confirmed");
  assert.equal(result.appointment.created_by, "ai");
  assert.equal(result.appointment.calendar_provider, "google_service_account");
  assert.equal(result.appointment.calendar_event_id, "google_calendar_event_456");
});

test("falls back to an offered slot when the selection message does not match", () => {
  const result = runDemoAppointmentFlow(
    {
      initialMessage: "Merhaba, implant için randevu almak istiyorum.",
      selectionMessage: "29 Haziran 15:00 uygun."
    },
    { now: new Date("2026-06-28T09:00:00.000Z") }
  );

  assert.equal(result.selected_slot.id, "demo_2026-06-29_1400");
  assert.equal(result.appointment.status, "confirmed");
  assert.equal(result.appointment.calendar_provider, "mock");
  assert.match(result.appointment.calendar_event_id, /mock_calendar_event_demo_2026-06-29_1400/);
});

test("requires both date and time to match an offered slot", () => {
  const slots = [
    {
      id: "demo_2026-06-29_1400",
      start_at: "2026-06-29T14:00:00+03:00"
    }
  ];

  assert.equal(matchSelectedSlot("14:00 uygun.", slots), null);
  assert.equal(matchSelectedSlot("29 Haziran 14:00 uygun.", slots).id, slots[0].id);
});
