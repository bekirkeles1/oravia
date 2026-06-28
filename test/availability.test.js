const assert = require("node:assert/strict");
const test = require("node:test");

const { getDemoAvailableSlots } = require("../src/appointments/availability");
const { runDemoAvailabilityFlow } = require("../src/appointments/demoAvailabilityFlow");
const { demoClinic, demoDoctor } = require("../src/demo/demoData");

test("returns demo clinic slots without creating an appointment", () => {
  const now = new Date("2026-06-28T09:00:00.000Z");
  const slots = getDemoAvailableSlots({ now });

  assert.equal(slots.length, 3);

  for (const slot of slots) {
    assert.equal(slot.timezone, "Europe/Istanbul");
    assert.equal(slot.duration_minutes, 30);
    assert.ok(new Date(slot.start_at).getTime() > now.getTime());
    assert.ok(new Date(slot.end_at).getTime() > new Date(slot.start_at).getTime());
  }
});

test("runs the Sprint 3 local appointment availability flow", () => {
  const result = runDemoAvailabilityFlow(
    "Merhaba, implant için randevu almak istiyorum.",
    { now: new Date("2026-06-28T09:00:00.000Z") }
  );

  assert.equal(result.intent, "appointment_request");
  assert.equal(result.treatment_interest, "implant");
  assert.deepEqual(result.clinic, {
    name: demoClinic.name,
    timezone: demoClinic.timezone,
    address: demoClinic.address
  });
  assert.deepEqual(result.doctor, {
    name: demoDoctor.name,
    specialty: demoDoctor.specialty,
    appointment_duration_minutes: demoDoctor.appointment_duration_minutes
  });
  assert.equal(result.available_slots.length, 3);
  assert.ok(result.reply.includes(result.available_slots[0].display_label));
});
