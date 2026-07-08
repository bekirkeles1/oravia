const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertVerticalCapabilities,
  getMissingVerticalCapabilities,
  listAssistantVerticalCapabilities,
} = require("../src/assistant/verticalContract");
const { dentalVertical } = require("../src/verticals/dental/dentalVertical");

test("lists the assistant vertical capabilities used by messaging", () => {
  assert.deepEqual(listAssistantVerticalCapabilities(), [
    "getTreatmentInfo",
    "buildTreatmentAnswer",
    "evaluateHandoff",
    "createDoctorAvailabilityReply",
    "doctorDirectory.resolveTreatmentName",
    "doctorAvailability.findDayInMessage",
    "doctorAvailability.findAvailableDoctorsByTreatmentAndDay",
    "treatmentDurationRules.resolveSlotDurationMinutes",
    "appointmentPurposeRules.inferAppointmentPurpose",
  ]);
});

test("dental vertical satisfies current messaging capabilities", () => {
  assert.deepEqual(getMissingVerticalCapabilities(dentalVertical), []);
  assert.equal(assertVerticalCapabilities(dentalVertical), true);
});

test("incomplete verticals report missing capabilities clearly", () => {
  const incompleteVertical = {
    id: "incomplete",
    name: "Incomplete vertical",
    evaluateHandoff() {},
    doctorDirectory: {},
  };

  assert.deepEqual(getMissingVerticalCapabilities(incompleteVertical), [
    "getTreatmentInfo",
    "buildTreatmentAnswer",
    "createDoctorAvailabilityReply",
    "doctorDirectory.resolveTreatmentName",
    "doctorAvailability.findDayInMessage",
    "doctorAvailability.findAvailableDoctorsByTreatmentAndDay",
    "treatmentDurationRules.resolveSlotDurationMinutes",
    "appointmentPurposeRules.inferAppointmentPurpose",
  ]);
});

test("assertVerticalCapabilities throws a useful error for missing capabilities", () => {
  const incompleteVertical = {
    id: "partial",
    name: "Partial vertical",
    getTreatmentInfo() {},
  };

  assert.throws(
    () =>
      assertVerticalCapabilities(incompleteVertical, [
        "getTreatmentInfo",
        "evaluateHandoff",
        "doctorDirectory.resolveTreatmentName",
      ]),
    /Assistant vertical "partial" is missing required capabilities: evaluateHandoff, doctorDirectory\.resolveTreatmentName/
  );
});

test("valid fake verticals can pass with a smaller required capability list", () => {
  const fakeVertical = {
    id: "fake",
    name: "Fake vertical",
    evaluateHandoff() {},
    doctorDirectory: {
      resolveTreatmentName() {},
    },
  };

  assert.deepEqual(
    getMissingVerticalCapabilities(fakeVertical, [
      "evaluateHandoff",
      "doctorDirectory.resolveTreatmentName",
    ]),
    []
  );
  assert.equal(
    assertVerticalCapabilities(fakeVertical, [
      "evaluateHandoff",
      "doctorDirectory.resolveTreatmentName",
    ]),
    true
  );
});
