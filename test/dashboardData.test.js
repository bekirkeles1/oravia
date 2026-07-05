const assert = require("node:assert/strict");
const test = require("node:test");

const { getDemoDashboardData } = require("../src/dashboard/demoDashboardData");

test("dashboard simulator uses local classifier and mock availability only", () => {
  const dashboard = getDemoDashboardData();
  const simulator = dashboard.simulator;

  assert.equal(dashboard.productName, "Oravia Dental Receptionist");
  assert.equal(simulator.label, "Demo simulator — no real patient data");
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
  assert.match(simulator.reply, /uygun randevu seçenekleri/);
});
