const RECEIPT_KIND = "appointment_calendar_sync_receipt_v1";

const RECEIPT_SAFETY_FIELDS = Object.freeze({
  calendarSync: true,
  storage: "in_memory",
  appointmentPersistence: "not_persisted",
  durableAppointmentPersistence: false,
  appointmentCalendarLinkRecorded: true,
  calendarWritten: true,
  externalEventCreated: true,
  messageSent: false,
  emailSent: false,
  whatsappSent: false,
  databasePersisted: false,
});

function constructAppointmentCalendarSyncReceipt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectReceipt(
      "invalid_calendar_sync_receipt_input",
      "Calendar sync receipt input must be an object."
    );
  }

  const appointment = input.appointment;
  const appointmentId = normalizeText(input.appointmentId || appointment?.id);
  const provider = normalizeText(input.provider);
  const providerEventId = normalizeText(input.providerEventId);

  if (!appointmentId || !provider || !providerEventId) {
    return rejectReceipt(
      "invalid_calendar_sync_receipt_identifiers",
      "Calendar sync receipt requires appointment and provider identifiers."
    );
  }

  if (
    !Number.isSafeInteger(input.previousAppointmentVersion) ||
    !Number.isSafeInteger(input.resultingAppointmentVersion) ||
    !Number.isSafeInteger(input.appointmentRepositoryVersion)
  ) {
    return rejectReceipt(
      "invalid_calendar_sync_receipt_versions",
      "Calendar sync receipt requires safe integer versions."
    );
  }

  return freezeClone({
    accepted: true,
    receiptKind: RECEIPT_KIND,
    code: "appointment_calendar_sync_receipt_created",
    appointmentId,
    sourceReviewId: normalizeText(input.sourceReviewId),
    provider,
    providerEventId,
    startAt: normalizeText(input.startAt || appointment?.startAt),
    endAt: normalizeText(input.endAt || appointment?.endAt),
    previousAppointmentVersion: input.previousAppointmentVersion,
    resultingAppointmentVersion: input.resultingAppointmentVersion,
    appointmentRepositoryVersion: input.appointmentRepositoryVersion,
    calendarExternalPersistence:
      input.calendarExternalPersistence === true,
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
    appointmentCalendarLinkRecorded: false,
    calendarWritten: false,
    externalEventCreated: false,
    storage: "in_memory",
    appointmentPersistence: "not_persisted",
    durableAppointmentPersistence: false,
    messageSent: false,
    emailSent: false,
    whatsappSent: false,
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
  constructAppointmentCalendarSyncReceipt,
};
