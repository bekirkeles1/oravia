const MESSAGING_VERTICAL_CAPABILITIES = [
  "getTreatmentInfo",
  "buildTreatmentAnswer",
  "evaluateHandoff",
  "createDoctorAvailabilityReply",
  "doctorDirectory.resolveTreatmentName",
  "doctorAvailability.findDayInMessage",
  "doctorAvailability.findAvailableDoctorsByTreatmentAndDay",
  "treatmentDurationRules.resolveSlotDurationMinutes",
  "appointmentPurposeRules.inferAppointmentPurpose",
];

function listAssistantVerticalCapabilities() {
  return [...MESSAGING_VERTICAL_CAPABILITIES];
}

function getMissingVerticalCapabilities(
  vertical,
  requiredCapabilities = MESSAGING_VERTICAL_CAPABILITIES
) {
  return requiredCapabilities.filter(
    (capability) => typeof getNestedValue(vertical, capability) !== "function"
  );
}

function assertVerticalCapabilities(
  vertical,
  requiredCapabilities = MESSAGING_VERTICAL_CAPABILITIES
) {
  const missingCapabilities = getMissingVerticalCapabilities(
    vertical,
    requiredCapabilities
  );

  if (missingCapabilities.length > 0) {
    const verticalId = vertical?.id || "unknown";
    throw new Error(
      `Assistant vertical "${verticalId}" is missing required capabilities: ${missingCapabilities.join(
        ", "
      )}`
    );
  }

  return true;
}

function getNestedValue(value, path) {
  return String(path)
    .split(".")
    .reduce((currentValue, pathPart) => currentValue?.[pathPart], value);
}

module.exports = {
  MESSAGING_VERTICAL_CAPABILITIES,
  assertVerticalCapabilities,
  getMissingVerticalCapabilities,
  listAssistantVerticalCapabilities,
};
