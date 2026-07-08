const assert = require("node:assert/strict");
const test = require("node:test");

const {
  clearVerticalRegistryForTests,
  getActiveVertical,
  registerVertical,
} = require("../src/assistant/verticalRegistry");
const {
  getActiveAssistantVertical,
  getDefaultAssistantVertical,
} = require("../src/assistant/defaultVertical");
const { planMessagingReply } = require("../src/messaging/replyPlanner");

test.beforeEach(() => {
  clearVerticalRegistryForTests();
});

test("default assistant vertical resolver registers dental for Oravia", () => {
  const defaultVertical = getDefaultAssistantVertical();

  assert.equal(defaultVertical.id, "dental");
  assert.equal(defaultVertical.name, "Dental clinic");
  assert.equal(getActiveVertical(), defaultVertical);
  assert.equal(getActiveAssistantVertical(), defaultVertical);
});

test("default assistant vertical does not replace an explicitly active vertical", () => {
  const validFakeVertical = createValidFakeVertical();

  registerVertical(validFakeVertical, { active: true });

  assert.equal(getDefaultAssistantVertical().id, "dental");
  assert.equal(getActiveAssistantVertical(), validFakeVertical);
});

test("active assistant vertical is contract-validated before use", () => {
  const incompleteVertical = {
    id: "incomplete",
    name: "Incomplete vertical",
  };

  registerVertical(incompleteVertical, { active: true });

  assert.equal(getDefaultAssistantVertical().id, "dental");
  assert.equal(getActiveVertical(), incompleteVertical);
  assert.throws(
    () => getActiveAssistantVertical(),
    /Assistant vertical "incomplete" is missing required capabilities:/
  );
});

test("registry can still register simple fake verticals without immediate failure", () => {
  const incompleteVertical = {
    id: "simple",
    name: "Simple vertical",
  };

  assert.equal(registerVertical(incompleteVertical), incompleteVertical);
  assert.equal(getActiveVertical(), incompleteVertical);
});

test("reply planner works through the default app vertical", () => {
  const result = planMessagingReply({
    message: "İmplant nedir, bilgi alabilir miyim?",
    classification: {
      intent: "unknown_intent",
      requires_handoff: true,
      reply:
        "Merhaba, sizi daha doğru yönlendirebilmem için mesajınızı klinik ekibimize aktaracağım.",
    },
  });

  assert.equal(result.intent, "treatment_info");
  assert.equal(result.requires_handoff, false);
  assert.equal(result.treatment_id, "implant");
  assert.match(result.reply_draft, /eksik dişlerin yerine/);
});

function createValidFakeVertical() {
  return {
    id: "fake",
    name: "Fake vertical",
    getTreatmentInfo() {},
    buildTreatmentAnswer() {},
    evaluateHandoff() {},
    createDoctorAvailabilityReply() {},
    doctorDirectory: {
      resolveTreatmentName() {},
    },
    doctorAvailability: {
      findDayInMessage() {},
      findAvailableDoctorsByTreatmentAndDay() {},
    },
    treatmentDurationRules: {
      resolveSlotDurationMinutes() {},
    },
    appointmentPurposeRules: {
      inferAppointmentPurpose() {},
    },
  };
}
