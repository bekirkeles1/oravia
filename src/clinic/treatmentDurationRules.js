const { resolveTreatmentName } = require("./doctorDirectory");
const {
  INITIAL_CONSULTATION,
  PROCEDURE,
  inferAppointmentPurpose,
  normalizeAppointmentPurpose,
} = require("./appointmentPurposeRules");

const DEFAULT_TREATMENT_DURATION_MINUTES = 30;

const TREATMENT_DURATION_RULES = {
  [INITIAL_CONSULTATION]: {
    "genel muayene": 30,
    implant: 30,
    ortodonti: 30,
    "kanal tedavisi": 30,
    "diş çekimi": 30,
    dolgu: 30,
    "diş taşı temizliği": 60,
    "diş beyazlatma": 45,
  },
  [PROCEDURE]: {
    "genel muayene": 30,
    implant: 120,
    ortodonti: 45,
    "kanal tedavisi": 90,
    "diş çekimi": 45,
    dolgu: 45,
    "diş taşı temizliği": 60,
    "diş beyazlatma": 60,
  },
};

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return fallback;
  }

  return number;
}

function listTreatmentDurationRules() {
  return Object.entries(TREATMENT_DURATION_RULES).flatMap(
    ([appointmentPurpose, rules]) =>
      Object.entries(rules).map(([treatment, durationMinutes]) => ({
        treatment,
        appointmentPurpose,
        durationMinutes,
        source: "mock",
      }))
  );
}

function getTreatmentDurationMinutes(treatmentName, appointmentPurpose) {
  const resolvedTreatmentName = resolveTreatmentName(treatmentName);
  const resolvedAppointmentPurpose =
    normalizeAppointmentPurpose(appointmentPurpose);

  if (!resolvedTreatmentName) {
    return DEFAULT_TREATMENT_DURATION_MINUTES;
  }

  return (
    TREATMENT_DURATION_RULES[resolvedAppointmentPurpose]?.[
      resolvedTreatmentName
    ] || DEFAULT_TREATMENT_DURATION_MINUTES
  );
}

function resolveSlotDurationMinutes(input = {}) {
  const explicitDuration = Number(input.durationMinutes);

  if (Number.isInteger(explicitDuration) && explicitDuration > 0) {
    return explicitDuration;
  }

  const appointmentPurpose = inferAppointmentPurpose({
    message: input.message,
    appointmentPurpose: input.appointmentPurpose,
  });

  return getTreatmentDurationMinutes(
    input.treatmentName || input.message,
    appointmentPurpose
  );
}

module.exports = {
  DEFAULT_TREATMENT_DURATION_MINUTES,
  TREATMENT_DURATION_RULES,
  getTreatmentDurationMinutes,
  listTreatmentDurationRules,
  normalizePositiveInteger,
  resolveSlotDurationMinutes,
};
