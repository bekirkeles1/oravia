const RECEIPT_KIND = "appointment_confirmation_dispatch_receipt_v1";

const RECEIPT_SAFETY_FIELDS = Object.freeze({
  confirmationDispatch: true,
  storage: "in_memory",
  appointmentPersistence: "not_persisted",
  durableAppointmentPersistence: false,
  confirmationMessageLinked: true,
  providerDispatchAccepted: true,
  realPatientDelivery: false,
  messageSent: true,
  whatsappSent: false,
  emailSent: false,
  smsSent: false,
  calendarWritten: false,
  calendarEventCreated: false,
  databasePersisted: false,
});

function constructAppointmentConfirmationDispatchReceipt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectReceipt(
      "invalid_confirmation_dispatch_receipt_input",
      "Confirmation dispatch receipt input must be an object."
    );
  }

  const appointment = input.appointment;
  const appointmentId = normalizeText(input.appointmentId || appointment?.id);
  const provider = normalizeText(input.provider);
  const providerMessageId = normalizeText(input.providerMessageId);
  const maskedDestinationLabel = normalizeText(input.maskedDestinationLabel);

  if (!appointmentId || !provider || !providerMessageId || !maskedDestinationLabel) {
    return rejectReceipt(
      "invalid_confirmation_dispatch_receipt_identifiers",
      "Confirmation dispatch receipt requires safe appointment, provider, and destination identifiers."
    );
  }

  if (
    !Number.isSafeInteger(input.previousAppointmentVersion) ||
    !Number.isSafeInteger(input.resultingAppointmentVersion) ||
    !Number.isSafeInteger(input.appointmentRepositoryVersion)
  ) {
    return rejectReceipt(
      "invalid_confirmation_dispatch_receipt_versions",
      "Confirmation dispatch receipt requires safe integer versions."
    );
  }

  return freezeClone({
    accepted: true,
    receiptKind: RECEIPT_KIND,
    code: "appointment_confirmation_dispatch_receipt_created",
    appointmentId,
    sourceReviewId: normalizeText(input.sourceReviewId || appointment?.sourceReviewId),
    provider,
    providerMessageId,
    maskedDestinationLabel,
    startAt: normalizeText(input.startAt || appointment?.startAt),
    endAt: normalizeText(input.endAt || appointment?.endAt),
    previousAppointmentVersion: input.previousAppointmentVersion,
    resultingAppointmentVersion: input.resultingAppointmentVersion,
    appointmentRepositoryVersion: input.appointmentRepositoryVersion,
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
    confirmationMessageLinked: false,
    providerDispatchAccepted: false,
    realPatientDelivery: false,
    storage: "in_memory",
    appointmentPersistence: "not_persisted",
    durableAppointmentPersistence: false,
    messageSent: false,
    whatsappSent: false,
    emailSent: false,
    smsSent: false,
    calendarWritten: false,
    calendarEventCreated: false,
    databasePersisted: false,
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
  constructAppointmentConfirmationDispatchReceipt,
};
