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

test("returns a clarification when the selected time is not an offered slot", () => {
  const result = runDemoAppointmentFlow(
    {
      initialMessage: "Merhaba, implant için randevu almak istiyorum.",
      selectionMessage: "29 Haziran 15:00 uygun."
    },
    { now: new Date("2026-06-28T09:00:00.000Z") }
  );

  assert.equal(result.selected_slot, null);
  assert.equal(result.appointment, null);
  assert.match(result.confirmation_message, /eşleştiremedim/);
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
