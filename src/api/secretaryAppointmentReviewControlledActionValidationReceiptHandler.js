const {
  handleAppointmentReviewControlledActionValidation,
} = require("./secretaryAppointmentReviewControlledActionValidationHandler");
const {
  constructAppointmentReviewValidationDecisionReceipt,
} = require("../secretary/appointmentReviewValidationDecisionReceiptContract");

const RECEIPT_HANDLER_CODES = Object.freeze({
  COMPLETED: "controlled_action_validation_receipt_handler_completed",
  INVALID_INPUT: "invalid_input",
  INVALID_VALIDATION_HANDLER_RESULT: "invalid_validation_handler_result",
  UNSAFE_VALIDATION_HANDLER_RESULT: "unsafe_validation_handler_result",
  VALIDATION_RECEIPT_CONSTRUCTION_FAILED:
    "validation_receipt_construction_failed",
  UNEXPECTED_RECEIPT_HANDLER_RESULT: "unexpected_receipt_handler_result",
  UNSAFE_EXECUTION_FLAGS: "unsafe_execution_flags",
});

const UNSAFE_EXECUTION_FIELDS = Object.freeze([
  "executionEnabled",
  "executorAvailable",
  "executionAvailable",
  "executionRequested",
  "actionPerformed",
  "commandDispatched",
  "commandPersisted",
  "receiptPersisted",
  "bookingCreated",
  "calendarChecked",
  "appointmentCreated",
  "calendarEventCreated",
  "databasePersisted",
  "reviewFound",
  "persisted",
  "previousActionExecuted",
]);

const RECEIPT_HANDLER_SAFETY_FIELDS = Object.freeze({
  receiptHandlerChecked: true,
  validationOnly: true,
  controlledHandlingOnly: true,
  executionEnabled: false,
  executorAvailable: false,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  commandDispatched: false,
  commandPersisted: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
});

const DEFAULT_CONTRACTS = Object.freeze({
  runValidationHandler: handleAppointmentReviewControlledActionValidation,
  constructValidationReceipt: constructAppointmentReviewValidationDecisionReceipt,
});

async function handleAppointmentReviewControlledActionValidationReceipt(input) {
  return handleAppointmentReviewControlledActionValidationReceiptWithContracts(
    input,
    DEFAULT_CONTRACTS
  );
}

async function handleAppointmentReviewControlledActionValidationReceiptWithContracts(
  input,
  contracts = DEFAULT_CONTRACTS
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectReceiptHandler({
      code: RECEIPT_HANDLER_CODES.INVALID_INPUT,
      reason:
        "Appointment review controlled action validation receipt handler input must be an object.",
    });
  }

  const activeContracts = { ...DEFAULT_CONTRACTS, ...contracts };
  let handlerResult;

  try {
    handlerResult = await activeContracts.runValidationHandler({
      method: input.method,
      reviewId: input.reviewId,
      body: input.body,
      dependencies: input.dependencies,
    });
  } catch {
    return rejectReceiptHandler({
      code: RECEIPT_HANDLER_CODES.UNEXPECTED_RECEIPT_HANDLER_RESULT,
      reason: "Controlled action validation handler failed safely.",
    });
  }

  const handlerResultIssue = validateValidationHandlerResult(handlerResult);

  if (handlerResultIssue) {
    return rejectReceiptHandler(handlerResultIssue);
  }

  let receiptResult;

  try {
    receiptResult = activeContracts.constructValidationReceipt({
      handlerResult,
    });
  } catch {
    return rejectReceiptHandler({
      code: RECEIPT_HANDLER_CODES.VALIDATION_RECEIPT_CONSTRUCTION_FAILED,
      reason: "Validation receipt construction failed safely.",
    });
  }

  if (
    !receiptResult ||
    typeof receiptResult !== "object" ||
    Array.isArray(receiptResult)
  ) {
    return rejectReceiptHandler({
      code: RECEIPT_HANDLER_CODES.VALIDATION_RECEIPT_CONSTRUCTION_FAILED,
      reason: "Validation receipt contract returned malformed output.",
    });
  }

  const unsafeReceiptField = findUnsafeTrueField(receiptResult);

  if (unsafeReceiptField) {
    return rejectReceiptHandler({
      code:
        unsafeReceiptField === "executionEnabled"
          ? RECEIPT_HANDLER_CODES.UNSAFE_EXECUTION_FLAGS
          : RECEIPT_HANDLER_CODES.VALIDATION_RECEIPT_CONSTRUCTION_FAILED,
      reason: `Validation receipt contract returned unsafe ${unsafeReceiptField}.`,
    });
  }

  if (findUnsafePersistence(receiptResult)) {
    return rejectReceiptHandler({
      code: RECEIPT_HANDLER_CODES.VALIDATION_RECEIPT_CONSTRUCTION_FAILED,
      reason: "Validation receipt contract must remain not_persisted.",
    });
  }

  if (
    receiptResult.accepted !== true ||
    receiptResult.validationReceiptConstructed !== true ||
    !receiptResult.validationReceipt ||
    typeof receiptResult.validationReceipt !== "object" ||
    Array.isArray(receiptResult.validationReceipt)
  ) {
    return rejectReceiptHandler({
      code: RECEIPT_HANDLER_CODES.VALIDATION_RECEIPT_CONSTRUCTION_FAILED,
      reason:
        normalizeText(receiptResult.reason) ||
        "Validation receipt construction was rejected.",
      receiptConstructionCode: normalizeText(receiptResult.code),
    });
  }

  const validationReceipt = deepFreezeClone(receiptResult.validationReceipt);
  const defensiveHandlerResult = deepFreezeClone(handlerResult);

  return Object.freeze({
    accepted: true,
    receiptHandlerCompleted: true,
    validationReceiptConstructed: true,
    reviewId: normalizeText(handlerResult.reviewId),
    handlerResult: defensiveHandlerResult,
    validationReceipt,
    receiptOutcome: normalizeText(validationReceipt.outcome),
    code: RECEIPT_HANDLER_CODES.COMPLETED,
    ...createSafetyFields(),
  });
}

function validateValidationHandlerResult(handlerResult) {
  if (
    !handlerResult ||
    typeof handlerResult !== "object" ||
    Array.isArray(handlerResult)
  ) {
    return {
      code: RECEIPT_HANDLER_CODES.INVALID_VALIDATION_HANDLER_RESULT,
      reason: "Controlled action validation handler returned malformed output.",
    };
  }

  if (typeof handlerResult.accepted !== "boolean") {
    return {
      code: RECEIPT_HANDLER_CODES.INVALID_VALIDATION_HANDLER_RESULT,
      reason: "Controlled action validation handler result must include accepted boolean.",
    };
  }

  if (handlerResult.handlerChecked !== true) {
    return {
      code: RECEIPT_HANDLER_CODES.INVALID_VALIDATION_HANDLER_RESULT,
      reason: "Controlled action validation handler result must be checked.",
    };
  }

  const unsafeField = findUnsafeTrueField(handlerResult);

  if (unsafeField) {
    return {
      code:
        unsafeField === "executionEnabled"
          ? RECEIPT_HANDLER_CODES.UNSAFE_EXECUTION_FLAGS
          : RECEIPT_HANDLER_CODES.UNSAFE_VALIDATION_HANDLER_RESULT,
      reason: `Controlled action validation handler result must not claim unsafe ${unsafeField}.`,
    };
  }

  if (findUnsafePersistence(handlerResult)) {
    return {
      code: RECEIPT_HANDLER_CODES.UNSAFE_VALIDATION_HANDLER_RESULT,
      reason:
        "Controlled action validation handler result must remain not_persisted.",
    };
  }

  return null;
}

function rejectReceiptHandler({ code, reason, receiptConstructionCode = "" }) {
  const result = {
    accepted: false,
    receiptHandlerCompleted: false,
    validationReceiptConstructed: false,
    validationReceipt: null,
    receiptOutcome: null,
    code,
    reason,
    ...createSafetyFields(),
  };

  if (receiptConstructionCode) {
    result.receiptConstructionCode = receiptConstructionCode;
  }

  return Object.freeze(result);
}

function findUnsafeTrueField(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findUnsafeTrueField(item);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (UNSAFE_EXECUTION_FIELDS.includes(fieldName) && fieldValue === true) {
      return fieldName;
    }

    const nested = findUnsafeTrueField(fieldValue);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function findUnsafePersistence(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(findUnsafePersistence);
  }

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (fieldName === "persistence" && normalizeText(fieldValue) !== "not_persisted") {
      return true;
    }

    if (fieldValue && typeof fieldValue === "object" && findUnsafePersistence(fieldValue)) {
      return true;
    }
  }

  return false;
}

function deepFreezeClone(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreezeClone));
  }

  const clone = {};

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    clone[fieldName] = deepFreezeClone(fieldValue);
  }

  return Object.freeze(clone);
}

function createSafetyFields() {
  return { ...RECEIPT_HANDLER_SAFETY_FIELDS };
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  RECEIPT_HANDLER_CODES,
  RECEIPT_HANDLER_SAFETY_FIELDS,
  UNSAFE_EXECUTION_FIELDS,
  handleAppointmentReviewControlledActionValidationReceipt,
  handleAppointmentReviewControlledActionValidationReceiptWithContracts,
};
