const VALIDATION_RECEIPT_TYPE =
  "appointment_review_controlled_action_validation_receipt_v1";
const VALIDATION_RECEIPT_SCHEMA_VERSION = 1;

const RECEIPT_OUTCOMES = Object.freeze({
  VALIDATION_PASSED: "validation_passed",
  MATCHING_REPLAY: "matching_replay",
  VALIDATION_REJECTED: "validation_rejected",
});

const RECEIPT_CODES = Object.freeze({
  CONSTRUCTED: "controlled_action_validation_receipt_constructed",
  INVALID_INPUT: "invalid_input",
  MISSING_HANDLER_RESULT: "missing_handler_result",
  INVALID_HANDLER_RESULT: "invalid_handler_result",
  UNSAFE_HANDLER_RESULT: "unsafe_handler_result",
  UNSUPPORTED_HANDLER_OUTCOME: "unsupported_handler_outcome",
  INVALID_PIPELINE_RESULT: "invalid_pipeline_result",
  INVALID_STAGE_SUMMARY: "invalid_stage_summary",
  MISSING_REVIEW_ID: "missing_review_id",
  INVALID_CORRELATION_METADATA: "invalid_correlation_metadata",
  UNSAFE_EXECUTION_FLAGS: "unsafe_execution_flags",
});

const STAGE_KEYS = Object.freeze([
  "preconditions",
  "authorization",
  "idempotencyAndVersionGuard",
  "commandEnvelope",
  "executionPolicy",
]);

const ALLOWED_STAGE_STATUSES = Object.freeze([
  "accepted",
  "rejected",
  "matching_replay",
  "not_run",
]);

const TEXT_CORRELATION_FIELDS = Object.freeze([
  "reviewId",
  "actionIntent",
  "actorId",
  "actorRole",
  "requestId",
  "idempotencyKey",
  "requestFingerprint",
  "requiredPermission",
]);

const VERSION_CORRELATION_FIELDS = Object.freeze([
  "expectedReviewVersion",
  "observedReviewVersion",
]);

const UNSAFE_TRUE_FIELDS = Object.freeze([
  "executionEnabled",
  "executorAvailable",
  "executionAvailable",
  "executionRequested",
  "actionPerformed",
  "commandDispatched",
  "commandPersisted",
  "bookingCreated",
  "calendarChecked",
  "appointmentCreated",
  "calendarEventCreated",
  "databasePersisted",
  "reviewFound",
  "persisted",
  "previousActionExecuted",
]);

const RECEIPT_SAFETY_FIELDS = Object.freeze({
  validationReceiptChecked: true,
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

function constructAppointmentReviewValidationDecisionReceipt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectReceipt({
      code: RECEIPT_CODES.INVALID_INPUT,
      reason:
        "Appointment review validation decision receipt input must be an object.",
    });
  }

  const { handlerResult } = input;

  if (!handlerResult) {
    return rejectReceipt({
      code: RECEIPT_CODES.MISSING_HANDLER_RESULT,
      reason: "handlerResult is required.",
    });
  }

  if (typeof handlerResult !== "object" || Array.isArray(handlerResult)) {
    return rejectReceipt({
      code: RECEIPT_CODES.INVALID_HANDLER_RESULT,
      reason: "handlerResult must be an object.",
    });
  }

  if (handlerResult.handlerChecked !== true) {
    return rejectReceipt({
      code: RECEIPT_CODES.INVALID_HANDLER_RESULT,
      reason: "handlerResult.handlerChecked must be true.",
    });
  }

  const unsafeField = findUnsafeTrueField(handlerResult);

  if (unsafeField) {
    return rejectReceipt({
      code:
        unsafeField === "executionEnabled"
          ? RECEIPT_CODES.UNSAFE_EXECUTION_FLAGS
          : RECEIPT_CODES.UNSAFE_HANDLER_RESULT,
      reason: `handlerResult must not claim unsafe ${unsafeField}.`,
    });
  }

  const unsafePersistence = findUnsafePersistence(handlerResult);

  if (unsafePersistence) {
    return rejectReceipt({
      code: RECEIPT_CODES.UNSAFE_HANDLER_RESULT,
      reason: "handlerResult persistence must remain not_persisted.",
    });
  }

  const correlationResult = buildCorrelation(handlerResult);

  if (!correlationResult.accepted) {
    return rejectReceipt({
      code: correlationResult.code,
      reason: correlationResult.reason,
    });
  }

  const reviewId = normalizeText(handlerResult.reviewId);

  if (!reviewId) {
    return rejectReceipt({
      code: RECEIPT_CODES.MISSING_REVIEW_ID,
      reason: "A safe reviewId is required to construct a validation receipt.",
    });
  }

  const pipelineResult = handlerResult.pipelineResult;
  const stageResult = buildStageSummaries(pipelineResult);

  if (!stageResult.accepted) {
    return rejectReceipt({
      code: stageResult.code,
      reason: stageResult.reason,
    });
  }

  const outcomeResult = resolveOutcome(handlerResult, pipelineResult);

  if (!outcomeResult.accepted) {
    return rejectReceipt({
      code: outcomeResult.code,
      reason: outcomeResult.reason,
    });
  }

  const validationReceipt = freezeReceipt({
    receiptType: VALIDATION_RECEIPT_TYPE,
    schemaVersion: VALIDATION_RECEIPT_SCHEMA_VERSION,
    outcome: outcomeResult.outcome,
    reviewId,
    handlerCode: normalizeText(handlerResult.code),
    handlerCompleted: handlerResult.handlerCompleted === true,
    failedStage: normalizeNullableText(handlerResult.failedStage),
    matchingReplay: handlerResult.matchingReplay === true,
    replayExistingResultOnly: handlerResult.replayExistingResultOnly === true,
    eligibleForExecutorBoundary:
      handlerResult.eligibleForExecutorBoundary === true,
    pipelineCode: normalizeNullableText(pipelineResult && pipelineResult.code),
    reason: normalizeNullableText(handlerResult.reason),
    stages: freezeStages(stageResult.stages),
    correlation: Object.freeze({ ...correlationResult.correlation }),
  });

  return Object.freeze({
    accepted: true,
    validationReceiptConstructed: true,
    code: RECEIPT_CODES.CONSTRUCTED,
    validationReceipt,
    ...createSafetyFields(),
  });
}

function resolveOutcome(handlerResult, pipelineResult) {
  if (typeof handlerResult.accepted !== "boolean") {
    return {
      accepted: false,
      code: RECEIPT_CODES.INVALID_HANDLER_RESULT,
      reason: "handlerResult.accepted must be a boolean.",
    };
  }

  if (typeof handlerResult.handlerCompleted !== "boolean") {
    return {
      accepted: false,
      code: RECEIPT_CODES.INVALID_HANDLER_RESULT,
      reason: "handlerResult.handlerCompleted must be a boolean.",
    };
  }

  if (handlerResult.accepted === false || handlerResult.handlerCompleted === false) {
    return {
      accepted: true,
      outcome: RECEIPT_OUTCOMES.VALIDATION_REJECTED,
    };
  }

  if (
    handlerResult.accepted === true &&
    handlerResult.handlerCompleted === true &&
    handlerResult.matchingReplay === true &&
    handlerResult.replayExistingResultOnly === true &&
    handlerResult.eligibleForExecutorBoundary === false
  ) {
    if (!isValidPipelineResult(pipelineResult)) {
      return invalidPipelineResult();
    }

    if (
      pipelineResult.accepted !== true ||
      pipelineResult.pipelineCompleted !== true ||
      pipelineResult.matchingReplay !== true ||
      pipelineResult.replayExistingResultOnly !== true ||
      pipelineResult.eligibleForExecutorBoundary !== false
    ) {
      return {
        accepted: false,
        code: RECEIPT_CODES.UNSUPPORTED_HANDLER_OUTCOME,
        reason: "Matching replay handler result does not match pipeline outcome.",
      };
    }

    return {
      accepted: true,
      outcome: RECEIPT_OUTCOMES.MATCHING_REPLAY,
    };
  }

  if (
    handlerResult.accepted === true &&
    handlerResult.handlerCompleted === true &&
    handlerResult.matchingReplay === false &&
    handlerResult.replayExistingResultOnly === false &&
    handlerResult.eligibleForExecutorBoundary === true
  ) {
    if (!isValidPipelineResult(pipelineResult)) {
      return invalidPipelineResult();
    }

    if (
      pipelineResult.accepted !== true ||
      pipelineResult.pipelineCompleted !== true ||
      pipelineResult.matchingReplay !== false ||
      pipelineResult.replayExistingResultOnly !== false ||
      pipelineResult.eligibleForExecutorBoundary !== true
    ) {
      return {
        accepted: false,
        code: RECEIPT_CODES.UNSUPPORTED_HANDLER_OUTCOME,
        reason: "Accepted handler result does not match a completed pipeline.",
      };
    }

    return {
      accepted: true,
      outcome: RECEIPT_OUTCOMES.VALIDATION_PASSED,
    };
  }

  return {
    accepted: false,
    code: RECEIPT_CODES.UNSUPPORTED_HANDLER_OUTCOME,
    reason: "handlerResult does not represent a supported receipt outcome.",
  };
}

function isValidPipelineResult(pipelineResult) {
  return (
    pipelineResult &&
    typeof pipelineResult === "object" &&
    !Array.isArray(pipelineResult) &&
    typeof pipelineResult.accepted === "boolean" &&
    typeof pipelineResult.pipelineCompleted === "boolean"
  );
}

function invalidPipelineResult() {
  return {
    accepted: false,
    code: RECEIPT_CODES.INVALID_PIPELINE_RESULT,
    reason: "A valid pipelineResult is required for completed handler outcomes.",
  };
}

function buildStageSummaries(pipelineResult) {
  const stages = {};

  if (!pipelineResult || typeof pipelineResult !== "object") {
    return {
      accepted: true,
      stages,
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(pipelineResult, "stages") &&
    (!pipelineResult.stages ||
      typeof pipelineResult.stages !== "object" ||
      Array.isArray(pipelineResult.stages))
  ) {
    return {
      accepted: false,
      code: RECEIPT_CODES.INVALID_STAGE_SUMMARY,
      reason: "pipelineResult.stages must be an object when provided.",
    };
  }

  if (!pipelineResult.stages) {
    return {
      accepted: true,
      stages,
    };
  }

  for (const stageKey of STAGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(pipelineResult.stages, stageKey)) {
      continue;
    }

    const stage = pipelineResult.stages[stageKey];

    if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
      return {
        accepted: false,
        code: RECEIPT_CODES.INVALID_STAGE_SUMMARY,
        reason: `${stageKey} stage summary must be an object.`,
      };
    }

    const status = normalizeText(stage.status);

    if (!ALLOWED_STAGE_STATUSES.includes(status)) {
      return {
        accepted: false,
        code: RECEIPT_CODES.INVALID_STAGE_SUMMARY,
        reason: `${stageKey} stage summary has unsupported status.`,
      };
    }

    const summary = { status };
    const code = normalizeText(stage.code);

    if (code) {
      summary.code = code;
    }

    stages[stageKey] = Object.freeze(summary);
  }

  return {
    accepted: true,
    stages,
  };
}

function buildCorrelation(handlerResult) {
  const sources = collectCorrelationSources(handlerResult);
  const correlation = {};

  for (const fieldName of TEXT_CORRELATION_FIELDS) {
    for (const source of sources) {
      if (
        Object.prototype.hasOwnProperty.call(source, fieldName) &&
        source[fieldName] &&
        typeof source[fieldName] === "object"
      ) {
        return {
          accepted: false,
          code: RECEIPT_CODES.INVALID_CORRELATION_METADATA,
          reason: `${fieldName} correlation metadata must be scalar text.`,
        };
      }

      const value = normalizeText(source[fieldName]);

      if (value) {
        correlation[fieldName] = value;
        break;
      }
    }
  }

  for (const fieldName of VERSION_CORRELATION_FIELDS) {
    for (const source of sources) {
      if (!Object.prototype.hasOwnProperty.call(source, fieldName)) {
        continue;
      }

      if (!Number.isSafeInteger(source[fieldName]) || source[fieldName] < 1) {
        return {
          accepted: false,
          code: RECEIPT_CODES.INVALID_CORRELATION_METADATA,
          reason: `${fieldName} correlation metadata must be a positive safe integer.`,
        };
      }

      correlation[fieldName] = source[fieldName];
      break;
    }
  }

  return {
    accepted: true,
    correlation,
  };
}

function collectCorrelationSources(handlerResult) {
  const pipelineResult =
    handlerResult.pipelineResult &&
    typeof handlerResult.pipelineResult === "object" &&
    !Array.isArray(handlerResult.pipelineResult)
      ? handlerResult.pipelineResult
      : {};
  const commandEnvelope =
    pipelineResult.commandEnvelope &&
    typeof pipelineResult.commandEnvelope === "object" &&
    !Array.isArray(pipelineResult.commandEnvelope)
      ? pipelineResult.commandEnvelope
      : {};
  const commandActor =
    commandEnvelope.actor &&
    typeof commandEnvelope.actor === "object" &&
    !Array.isArray(commandEnvelope.actor)
      ? commandEnvelope.actor
      : {};
  const authorizationResult =
    pipelineResult.authorizationResult &&
    typeof pipelineResult.authorizationResult === "object" &&
    !Array.isArray(pipelineResult.authorizationResult)
      ? pipelineResult.authorizationResult
      : {};
  const guardResult =
    pipelineResult.guardResult &&
    typeof pipelineResult.guardResult === "object" &&
    !Array.isArray(pipelineResult.guardResult)
      ? pipelineResult.guardResult
      : {};
  const executionPolicyResult =
    pipelineResult.executionPolicyResult &&
    typeof pipelineResult.executionPolicyResult === "object" &&
    !Array.isArray(pipelineResult.executionPolicyResult)
      ? pipelineResult.executionPolicyResult
      : {};

  return [
    handlerResult,
    pipelineResult,
    commandEnvelope,
    commandActor,
    authorizationResult,
    guardResult,
    executionPolicyResult,
  ];
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
    if (UNSAFE_TRUE_FIELDS.includes(fieldName) && fieldValue === true) {
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

function freezeStages(stages) {
  return Object.freeze({ ...stages });
}

function freezeReceipt(receipt) {
  return Object.freeze(receipt);
}

function rejectReceipt({ code, reason }) {
  return Object.freeze({
    accepted: false,
    validationReceiptConstructed: false,
    validationReceipt: null,
    code,
    reason,
    ...createSafetyFields(),
  });
}

function createSafetyFields() {
  return { ...RECEIPT_SAFETY_FIELDS };
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);

  return normalized || null;
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  ALLOWED_STAGE_STATUSES,
  RECEIPT_CODES,
  RECEIPT_OUTCOMES,
  RECEIPT_SAFETY_FIELDS,
  STAGE_KEYS,
  UNSAFE_TRUE_FIELDS,
  VALIDATION_RECEIPT_SCHEMA_VERSION,
  VALIDATION_RECEIPT_TYPE,
  constructAppointmentReviewValidationDecisionReceipt,
};
