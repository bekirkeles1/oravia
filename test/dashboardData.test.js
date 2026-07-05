const assert = require("node:assert/strict");
const test = require("node:test");

const { getDemoDashboardData } = require("../src/dashboard/demoDashboardData");

test("dashboard simulator uses local classifier and mock availability only", () => {
  const dashboard = getDemoDashboardData();
  const simulator = dashboard.simulator;
  const appointment = dashboard.appointments[0];

  assert.equal(dashboard.productName, "Oravia Dental Receptionist");
  assert.equal(appointment.startDisplayLabel, "6 Temmuz Pazartesi 14:00");
  assert.equal(appointment.endDisplayLabel, "14:30");
  assert.equal(
    simulator.label,
    "Demo API mode — no real patient data, no real calendar event"
  );
  assert.equal(
    simulator.patientMessage,
    "Merhaba, implant için randevu almak istiyorum."
  );
  assert.equal(simulator.intent, "appointment_request");
  assert.equal(simulator.confidence, 0.9);
  assert.equal(simulator.treatmentInterest, "implant");
  assert.equal(simulator.requiresHandoff, false);
  assert.equal(
    simulator.patientMessageSummary,
    "Hasta implant için randevu almak istiyor."
  );
  assert.equal(simulator.calendarProvider, "mock");
  assert.equal(simulator.availableSlots.length, 3);
  assert.equal(simulator.availableSlots[0].timeRangeLabel, "10:00 to 10:30");
  assert.match(simulator.reply, /uygun randevu seçenekleri/);
});
