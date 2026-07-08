const assert = require("node:assert/strict");
const test = require("node:test");

const {
  clearVerticalRegistryForTests,
  getActiveVertical,
  listVerticals,
  registerVertical,
  resolveVertical,
  setActiveVertical,
} = require("../src/assistant/verticalRegistry");
const { dentalVertical } = require("../src/verticals/dental/dentalVertical");
const { generateSlotProposals } = require("../src/messaging/slotProposal");

test.beforeEach(() => {
  clearVerticalRegistryForTests();
});

test("registry can register and resolve the dental vertical", () => {
  registerVertical(dentalVertical);

  assert.equal(resolveVertical("dental"), dentalVertical);
  assert.equal(resolveVertical("unknown"), null);
  assert.deepEqual(
    listVerticals().map((vertical) => vertical.id),
    ["dental"]
  );
});

test("registry can mark the dental vertical as active", () => {
  registerVertical({
    id: "test",
    name: "Test vertical",
  });
  registerVertical(dentalVertical, { active: true });

  assert.equal(getActiveVertical(), dentalVertical);
  assert.equal(setActiveVertical("test").id, "test");
  assert.throws(() => setActiveVertical("missing"), /Unknown assistant vertical/);
});

test("active dental vertical exposes expected dental capabilities", () => {
  registerVertical(dentalVertical, { active: true });

  const activeVertical = getActiveVertical();
  const treatment = activeVertical.getTreatmentInfo("implant");
  const handoff = activeVertical.evaluateHandoff("Yüzüm şişti ve dişim kanıyor.");
  const doctors = activeVertical.doctorDirectory.findDoctorsByTreatment("implant");
  const availability =
    activeVertical.doctorAvailability.findAvailableDoctorsByTreatmentAndDay(
      "implant",
      "Çarşamba"
    );
  const duration =
    activeVertical.treatmentDurationRules.getTreatmentDurationMinutes(
      "implant",
      "procedure"
    );

  assert.equal(activeVertical.id, "dental");
  assert.equal(treatment.display_name, "İmplant");
  assert.equal(handoff.requires_handoff, true);
  assert.equal(doctors[0].id, "dr-ayse-demir");
  assert.equal(availability[0].day, "wednesday");
  assert.equal(duration, 120);
  assert.equal(
    activeVertical.appointmentPurposeRules.getAppointmentPurposeLabel(
      "initial_consultation"
    ),
    "İlk muayene / değerlendirme"
  );
});

test("slot proposal behavior remains available through the existing messaging path", () => {
  registerVertical(dentalVertical, { active: true });

  const result = generateSlotProposals({
    message: "İmplant yaptırmak istiyorum, çarşamba müsait slot var mı?",
    maxSlots: 3,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.treatment, "implant");
  assert.equal(result.appointmentPurpose, "initial_consultation");
  assert.equal(result.durationMinutes, 30);
  assert.deepEqual(
    result.proposals.map((proposal) => proposal.time),
    ["10:00", "10:30", "11:00"]
  );
});
