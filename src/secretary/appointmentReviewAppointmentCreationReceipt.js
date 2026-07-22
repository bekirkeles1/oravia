const RECEIPT_KIND = "appointment_review_appointment_creation_receipt_v1";

const RECEIPT_SAFETY_FIELDS = Object.freeze({
  appointmentCreation: true,
  appointmentCreated: true,
  storage: "in_memory",
  persistence: "not_persisted",
  durablePersistence: false,
  calendarWritten: false,
  calendarEventCreated: false,
  messageSent: false,
  emailSent: false,
  whatsappSent: false,
  databasePersisted: false,
  externalCallPerformed: false,
});

function constructAppointmentReviewAppointmentCreationReceipt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectReceipt(
      "invalid_appointment_creation_receipt_input",
      "Appointment creation receipt input must be an object."
    );
  }

  const appointment = input.appointment;
  const reviewId = normalizeText(input.reviewId);

  if (
    !reviewId ||
    !appointment ||
    typeof appointment !== "object" ||
    !normalizeText(appointment.id)
  ) {
    return rejectReceipt(
      "invalid_appointment_creation_receipt_identifiers",
      "Appointment creation receipt requires review and appointment identifiers."
    );
  }

  if (
    !Number.isSafeInteger(input.resultingReviewVersion) ||
    !Number.isSafeInteger(input.appointmentRepositoryVersion) ||
    !Number.isSafeInteger(input.reviewRepositoryVersion)
  ) {
    return rejectReceipt(
      "invalid_appointment_creation_receipt_versions",
      "Appointment creation receipt requires safe integer versions."
    );
  }

  return freezeClone({
    accepted: true,
    receiptKind: RECEIPT_KIND,
    code: "appointment_review_appointment_creation_receipt_created",
    appointmentId: normalizeText(appointment.id),
    sourceReviewId: reviewId,
    doctor: appointment.doctor,
    startAt: normalizeText(appointment.startAt),
    endAt: normalizeText(appointment.endAt),
    durationMinutes: appointment.durationMinutes,
    appointmentPurpose: normalizeText(appointment.appointmentPurpose),
    appointmentPurposeLabel: normalizeText(appointment.appointmentPurposeLabel),
    resultingReviewState: normalizeText(input.resultingReviewState),
    resultingReviewVersion: input.resultingReviewVersion,
    appointmentRepositoryVersion: input.appointmentRepositoryVersion,
    reviewRepositoryVersion: input.reviewRepositoryVersion,
    idempotencyStatus: normalizeText(input.idempotencyStatus) || "new_request",
    matchingReplay: input.matchingReplay === true,
    ...RECEIPT_SAFETY_FIELDS,
  });
}

function rejectReceipt(code, reason) {
  return freezeClone({
    accepted: false,
    receiptKind: RECEIPT_KIND,
    code,
    reason,
    appointmentCreated: false,
    storage: "in_memory",
    persistence: "not_persisted",
    durablePersistence: false,
    calendarWritten: false,
    calendarEventCreated: false,
    messageSent: false,
    emailSent: false,
    whatsappSent: false,
    databasePersisted: false,
    externalCallPerformed: false,
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function freezeClone(value) {
  return deepFreeze(cloneValue(value));
}

function cloneValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return value;
}

module.exports = {
  RECEIPT_KIND,
  constructAppointmentReviewAppointmentCreationReceipt,
};
