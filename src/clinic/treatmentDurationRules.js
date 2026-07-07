const { resolveTreatmentName } = require("./doctorDirectory");

const DEFAULT_TREATMENT_DURATION_MINUTES = 30;

const TREATMENT_DURATION_RULES = {
  "genel muayene": 30,
  dolgu: 45,
  "diş çekimi": 45,
  "diş taşı temizliği": 60,
  "diş beyazlatma": 60,
  "kanal tedavisi": 90,
  implant: 120,
  ortodonti: 45,
};

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return fallback;
  }

  return number;
}

function listTreatmentDurationRules() {
  return Object.entries(TREATMENT_DURATION_RULES).map(
    ([treatment, durationMinutes]) => ({
      treatment,
      durationMinutes,
      source: "mock",
    })
  );
}

function getTreatmentDurationMinutes(treatmentName) {
  const resolvedTreatmentName = resolveTreatmentName(treatmentName);

  if (!resolvedTreatmentName) {
    return DEFAULT_TREATMENT_DURATION_MINUTES;
  }

  return (
    TREATMENT_DURATION_RULES[resolvedTreatmentName] ||
    DEFAULT_TREATMENT_DURATION_MINUTES
  );
}

function resolveSlotDurationMinutes(input = {}) {
  const explicitDuration = Number(input.durationMinutes);

  if (isPositiveInteger(explicitDuration)) {
    return explicitDuration;
  }

  return getTreatmentDurationMinutes(input.treatmentName || input.message);
}

module.exports = {
  DEFAULT_TREATMENT_DURATION_MINUTES,
  TREATMENT_DURATION_RULES,
  getTreatmentDurationMinutes,
  listTreatmentDurationRules,
  normalizePositiveInteger,
  resolveSlotDurationMinutes,
};
