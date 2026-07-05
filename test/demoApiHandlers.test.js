const assert = require("node:assert/strict");
const test = require("node:test");

const {
  handleDemoAppointment,
  handleDemoAvailability,
  handleDemoClassify
} = require("../src/api/demoApiHandlers");

const sampleMessage = "Merhaba, implant için randevu almak istiyorum.";

test("demo classify API handler validates missing message", () => {
  const result = handleDemoClassify({});

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "message is required.");
});

test("demo classify API handler returns local classifier result", () => {
  const result = handleDemoClassify({
    message: sampleMessage
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.result.intent, "appointment_request");
  assert.equal(result.body.result.confidence, 0.9);
  assert.equal(result.body.result.extracted_data.treatment_interest, "implant");
});

test("demo availability API handler returns mock clinic, doctor, and slots", () => {
  const result = handleDemoAvailability({
    message: sampleMessage
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.clinic.name, "Oravia Demo Dental Clinic");
  assert.equal(result.body.doctor.name, "Dr. Demo Dentist");
  assert.equal(result.body.calendar_provider, "mock");
  assert.equal(result.body.available_slots.length, 3);
  assert.equal(result.body.intent, "appointment_request");
});

test("demo appointment API handler dynamically selects an offered mock slot", () => {
  const result = handleDemoAppointment({
    message: sampleMessage
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.selected_slot.id, "demo_2026-07-06_1400");
  assert.equal(result.body.appointment.status, "confirmed");
  assert.equal(result.body.appointment.created_by, "ai");
  assert.equal(result.body.appointment.calendar_provider, "mock");
  assert.match(
    result.body.appointment.calendar_event_id,
    /^mock_calendar_event_demo_2026-07-06_1400$/
  );
});

test("demo appointment API handler accepts selected_slot_id", () => {
  const result = handleDemoAppointment({
    message: sampleMessage,
    selected_slot_id: "demo_2026-07-06_1600"
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.selected_slot.id, "demo_2026-07-06_1600");
  assert.equal(
    result.body.appointment.calendar_event_id,
    "mock_calendar_event_demo_2026-07-06_1600"
  );
});

test("demo appointment API handler rejects invalid selected_slot_id", () => {
  const result = handleDemoAppointment({
    message: sampleMessage,
    selected_slot_id: "not_an_offered_slot"
  });

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error,
    "selected_slot_id does not match an offered demo slot."
  );
  assert.deepEqual(result.body.available_slot_ids, [
    "demo_2026-07-06_1000",
    "demo_2026-07-06_1400",
    "demo_2026-07-06_1600"
  ]);
});
