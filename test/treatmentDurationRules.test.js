const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_TREATMENT_DURATION_MINUTES,
  getTreatmentDurationMinutes,
  listTreatmentDurationRules,
  normalizePositiveInteger,
  resolveSlotDurationMinutes,
} = require("../src/clinic/treatmentDurationRules");

test("lists mock treatment duration rules by appointment purpose", () => {
  const rules = listTreatmentDurationRules();

  assert.ok(rules.length >= 16);
  assert.ok(rules.every((rule) => rule.source === "mock"));
  assert.ok(rules.every((rule) => rule.appointmentPurpose));
  assert.ok(rules.every((rule) => Number.isInteger(rule.durationMinutes)));
  assert.ok(rules.every((rule) => rule.durationMinutes > 0));
});

test("uses initial consultation duration for first-time patient treatment requests", () => {
  assert.equal(getTreatmentDurationMinutes("implant", "initial_consultation"), 30);
  assert.equal(
    getTreatmentDurationMinutes("kanal tedavisi", "initial_consultation"),
    30
  );
  assert.equal(getTreatmentDurationMinutes("dolgu", "initial_consultation"), 30);
  assert.equal(
    getTreatmentDurationMinutes("diş taşı temizliği", "initial_consultation"),
    60
  );
});

test("uses procedure duration for controlled treatment procedure bookings", () => {
  assert.equal(getTreatmentDurationMinutes("implant", "procedure"), 120);
  assert.equal(getTreatmentDurationMinutes("kanal tedavisi", "procedure"), 90);
  assert.equal(getTreatmentDurationMinutes("dolgu", "procedure"), 45);
  assert.equal(
    getTreatmentDurationMinutes("diş taşı temizliği", "procedure"),
    60
  );
});

test("falls back to default duration for unknown treatments", () => {
  assert.equal(
    getTreatmentDurationMinutes("bilinmeyen tedavi", "procedure"),
    DEFAULT_TREATMENT_DURATION_MINUTES
  );
});

test("resolveSlotDurationMinutes defaults WhatsApp-style implant request to consultation duration", () => {
  assert.equal(
    resolveSlotDurationMinutes({
      message: "İmplant yaptırmak istiyorum, çarşamba müsait misiniz?",
    }),
    30
  );
});

test("resolveSlotDurationMinutes supports controlled procedure override", () => {
  assert.equal(
    resolveSlotDurationMinutes({
      treatmentName: "implant",
      appointmentPurpose: "procedure",
    }),
    120
  );
});

test("resolveSlotDurationMinutes prefers explicit safe duration overrides", () => {
  assert.equal(
    resolveSlotDurationMinutes({
      message: "İmplant için çarşamba slot var mı?",
      durationMinutes: 75,
    }),
    75
  );
});

test("normalizePositiveInteger rejects unsafe duration values", () => {
  assert.equal(normalizePositiveInteger(60, 30), 60);
  assert.equal(normalizePositiveInteger("45", 30), 45);
  assert.equal(normalizePositiveInteger(0, 30), 30);
  assert.equal(normalizePositiveInteger(-10, 30), 30);
  assert.equal(normalizePositiveInteger("bad", 30), 30);
});
