const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_TREATMENT_DURATION_MINUTES,
  getTreatmentDurationMinutes,
  listTreatmentDurationRules,
  normalizePositiveInteger,
  resolveSlotDurationMinutes,
} = require("../src/clinic/treatmentDurationRules");

test("lists mock treatment duration rules", () => {
  const rules = listTreatmentDurationRules();

  assert.ok(rules.length >= 8);
  assert.ok(rules.every((rule) => rule.source === "mock"));
  assert.ok(rules.every((rule) => Number.isInteger(rule.durationMinutes)));
  assert.ok(rules.every((rule) => rule.durationMinutes > 0));
});

test("returns treatment-specific appointment durations", () => {
  assert.equal(getTreatmentDurationMinutes("diş taşı temizliği"), 60);
  assert.equal(getTreatmentDurationMinutes("dis tasi temizligi"), 60);
  assert.equal(getTreatmentDurationMinutes("implant"), 120);
  assert.equal(getTreatmentDurationMinutes("kanal tedavisi"), 90);
  assert.equal(getTreatmentDurationMinutes("dolgu"), 45);
  assert.equal(getTreatmentDurationMinutes("genel muayene"), 30);
});

test("falls back to default duration for unknown treatments", () => {
  assert.equal(
    getTreatmentDurationMinutes("bilinmeyen tedavi"),
    DEFAULT_TREATMENT_DURATION_MINUTES
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

test("resolveSlotDurationMinutes derives duration from patient message", () => {
  assert.equal(
    resolveSlotDurationMinutes({
      message: "Diş taşı temizliği için cumartesi slot var mı?",
    }),
    60
  );

  assert.equal(
    resolveSlotDurationMinutes({
      message: "İmplant için çarşamba slot var mı?",
    }),
    120
  );
});

test("normalizePositiveInteger rejects unsafe duration values", () => {
  assert.equal(normalizePositiveInteger(60, 30), 60);
  assert.equal(normalizePositiveInteger("45", 30), 45);
  assert.equal(normalizePositiveInteger(0, 30), 30);
  assert.equal(normalizePositiveInteger(-10, 30), 30);
  assert.equal(normalizePositiveInteger("bad", 30), 30);
});
