const RECEIPT_KIND = "appointment_review_decision_execution_receipt_v1";
const EXECUTION_MODE = "in_memory_demo";

const RECEIPT_SAFETY_FIELDS = Object.freeze({
  decisionExecution: true,
  executionReceipt: true,
  validationOnly: false,
  controlledHandlingOnly: true,
  executionMode: EXECUTION_MODE,
  storage: "in_memory",
  durablePersistence: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  calendarWritten: false,
  messageSent: false,
  emailSent: false,
  whatsappSent: false,
  databasePersisted: false,
  externalCallPerformed: false,
});

function constructAppointmentReviewDecisionExecutionReceipt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectReceipt(
      "invalid_execution_receipt_input",
      "Execution receipt input must be an object."
    );
  }

  const reviewId = normalizeText(input.reviewId);
  const action = normalizeText(input.action);
  const previousState = normalizeText(input.previousState);
  const nextState = normalizeText(input.nextState);

  if (!reviewId || !action || !previousState || !nextState) {
    return rejectReceipt(
      "invalid_execution_receipt_identifiers",
      "Execution receipt requires review, action, and state identifiers."
    );
  }

  if (
    !Number.isSafeInteger(input.previousReviewVersion) ||
    !Number.isSafeInteger(input.nextReviewVersion) ||
    !Number.isSafeInteger(input.repositoryVersion)
  ) {
    return rejectReceipt(
      "invalid_execution_receipt_versions",
      "Execution receipt requires safe integer versions."
    );
  }

  return freezeClone({
    accepted: true,
    receiptKind: RECEIPT_KIND,
    code: "appointment_review_decision_execution_receipt_created",
    reviewId,
    action,
    actionIntent: normalizeText(input.actionIntent),
    previousState,
    resultingState: nextState,
    previousReviewVersion: input.previousReviewVersion,
    resultingReviewVersion: input.nextReviewVersion,
    resultingRepositoryVersion: input.repositoryVersion,
    idempotencyStatus: normalizeText(input.idempotencyStatus) || "new_request",
    matchingReplay: input.matchingReplay === true,
    reviewStateChanged: input.reviewStateChanged === true,
    repositoryVersionChanged: input.repositoryVersionChanged === true,
    ...RECEIPT_SAFETY_FIELDS,
  });
}

function rejectReceipt(code, reason) {
  return freezeClone({
    accepted: false,
    code,
    reason,
    receiptKind: RECEIPT_KIND,
    reviewStateChanged: false,
    repositoryVersionChanged: false,
    ...RECEIPT_SAFETY_FIELDS,
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
  EXECUTION_MODE,
  RECEIPT_KIND,
  constructAppointmentReviewDecisionExecutionReceipt,
};
