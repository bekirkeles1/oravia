const {
  ACTION_INTENT_BY_ACTION,
  STATE_TRANSITION_EVENT_BY_ACTION,
  SUPPORTED_DECISION_ACTIONS,
} = require("./secretaryAppointmentReviewDecisionPreviewOrchestrator");
const {
  handleAppointmentReviewControlledActionValidation,
} = require("./secretaryAppointmentReviewControlledActionValidationHandler");
const {
  validateAppointmentReviewActionIntent,
} = require("../secretary/appointmentReviewActionIntentContract");
const {
  transitionAppointmentReviewActionIntentState,
} = require("../secretary/appointmentReviewActionIntentStateMachine");
const {
  constructAppointmentReviewDecisionExecutionReceipt,
} = require("../secretary/appointmentReviewDecisionExecutionReceipt");

const EXECUTION_CONFIRMATION = "apply_in_memory";
const EXECUTION_SERVICE_CODE = Object.freeze({
  APPLIED: "appointment_review_decision_execution_applied",
  REPLAY: "appointment_review_decision_execution_matching_replay",
  BLOCKED: "appointment_review_decision_execution_blocked",
  CONFLICT: "appointment_review_decision_execution_conflict",
  NOT_FOUND: "appointment_review_decision_execution_review_not_found",
  INTERNAL_ERROR: "appointment_review_decision_execution_failed_safely",
});

const EXECUTION_SAFETY_FIELDS = Object.freeze({
  mock: true,
  dryRun: false,
  decisionExecution: true,
  validationOnly: false,
  controlledHandlingOnly: true,
  executionMode: "in_memory_demo",
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

async function applyAppointmentReviewDecision(input) {
  const inputIssue = validateExecutionInput(input);

  if (inputIssue.code) {
    return rejectExecution(inputIssue);
  }

  const {
    reviewId,
    action,
    expectedReviewVersion,
    idempotencyKey,
    confirmation,
    dependencies,
    idempotencyStore,
    applyReviewControlledActionStateTransition,
  } = inputIssue.value;
  const actionIntent = ACTION_INTENT_BY_ACTION[action];
  const requestId = `decision_execution_${reviewId}_${action}_${idempotencyKey}`;
  const clientFingerprint = buildClientFingerprint({
    reviewId,
    action,
    expectedReviewVersion,
    idempotencyKey,
  });
  const priorExecutionObservation = idempotencyStore.observe(idempotencyKey);

  if (priorExecutionObservation) {
    if (priorExecutionObservation.requestFingerprint === clientFingerprint) {
      const storedResult = idempotencyStore.getResult(idempotencyKey);

      if (storedResult) {
        return freezeClone({
          ...storedResult,
          accepted: true,
          applied: false,
          matchingReplay: true,
          idempotencyStatus: "matching_replay",
          code: EXECUTION_SERVICE_CODE.REPLAY,
          receipt: {
            ...storedResult.receipt,
            matchingReplay: true,
            idempotencyStatus: "matching_replay",
            reviewStateChanged: false,
            repositoryVersionChanged: false,
          },
          reviewStateChanged: false,
          repositoryVersionChanged: false,
          replayedResultOnly: true,
          ...createSafetyFields(),
        });
      }
    }

    return rejectExecution({
      code: "idempotency_key_conflict",
      reason:
        "idempotencyKey was previously used for a different execution request.",
      reviewId,
      action,
      actionIntent,
      conflict: true,
    });
  }

  const actionIntentResult = validateAppointmentReviewActionIntent({
    reviewId,
    actionIntent,
    actorRole: "secretary",
    reason: "Controlled in-memory decision execution.",
  });

  if (!actionIntentResult || actionIntentResult.status !== "ok") {
    return rejectExecution({
      code: resultCode(actionIntentResult, "action_intent_rejected"),
      reason: resultReason(
        actionIntentResult,
        "Action intent validation blocked execution."
      ),
      reviewId,
      action,
      actionIntent,
      blocked: true,
    });
  }

  let trustedContext;

  try {
    trustedContext = await dependencies.resolveAppointmentReviewContext(
      Object.freeze({ reviewId })
    );
  } catch (error) {
    if (error && error.code === "appointment_review_snapshot_not_found") {
      return rejectExecution({
        code: EXECUTION_SERVICE_CODE.NOT_FOUND,
        reason: "Appointment review item was not found.",
        reviewId,
        action,
        actionIntent,
        notFound: true,
      });
    }

    return rejectExecution({
      code: "trusted_review_context_failed",
      reason: "Trusted review context resolution failed safely.",
      reviewId,
      action,
      actionIntent,
      internal: true,
    });
  }

  const trustedCurrentState = normalizeText(trustedContext.currentState);
  const observedReviewVersion = trustedContext.observedReviewVersion;

  if (observedReviewVersion !== expectedReviewVersion) {
    return rejectExecution({
      code: "review_version_conflict",
      reason:
        "expectedReviewVersion must match the current trusted review version.",
      reviewId,
      action,
      actionIntent,
      trustedCurrentState,
      observedReviewVersion,
      expectedReviewVersion,
      conflict: true,
    });
  }

  const stateTransitionResult = transitionAppointmentReviewActionIntentState({
    currentState: trustedCurrentState,
    event: STATE_TRANSITION_EVENT_BY_ACTION[action],
  });

  if (!stateTransitionResult || stateTransitionResult.accepted !== true) {
    return rejectExecution({
      code: resultCode(stateTransitionResult, "state_transition_blocked"),
      reason: resultReason(
        stateTransitionResult,
        "State transition contract blocked execution."
      ),
      reviewId,
      action,
      actionIntent,
      trustedCurrentState,
      observedReviewVersion,
      expectedReviewVersion,
      blocked: true,
    });
  }

  let validationResult;

  try {
    validationResult = await handleAppointmentReviewControlledActionValidation({
      method: "POST",
      reviewId,
      body: {
        actionIntent,
        requestId,
        idempotencyKey,
        expectedReviewVersion,
      },
      dependencies,
    });
  } catch {
    return rejectExecution({
      code: "controlled_action_validation_failed",
      reason: "Controlled action validation failed safely.",
      reviewId,
      action,
      actionIntent,
      internal: true,
    });
  }

  if (!validationResult || validationResult.accepted !== true) {
    return rejectExecution({
      code: resultCode(validationResult, "controlled_action_validation_blocked"),
      reason: resultReason(
        validationResult,
        "Controlled action validation blocked execution."
      ),
      reviewId,
      action,
      actionIntent,
      trustedCurrentState,
      observedReviewVersion,
      expectedReviewVersion,
      blocked: true,
      validationCode: normalizeText(validationResult?.code),
    });
  }

  let mutationResult;

  try {
    mutationResult = await applyReviewControlledActionStateTransition({
      reviewId,
      expectedState: trustedCurrentState,
      expectedVersion: expectedReviewVersion,
      nextState: stateTransitionResult.nextState,
    });
  } catch {
    return rejectExecution({
      code: "repository_mutation_failed",
      reason: "Repository state transition failed safely.",
      reviewId,
      action,
      actionIntent,
      internal: true,
    });
  }

  if (!mutationResult || mutationResult.status !== "ok") {
    return rejectExecution({
      code: mutationResult?.error?.code || EXECUTION_SERVICE_CODE.CONFLICT,
      reason:
        mutationResult?.error?.message ||
        "Repository compare-and-set rejected the execution.",
      reviewId,
      action,
      actionIntent,
      trustedCurrentState,
      observedReviewVersion,
      expectedReviewVersion,
      conflict: mutationResult?.status === "conflict",
    });
  }

  const receiptResult = constructAppointmentReviewDecisionExecutionReceipt({
    reviewId,
    action,
    actionIntent,
    previousState: mutationResult.previousState,
    nextState: mutationResult.nextState,
    previousReviewVersion: mutationResult.previousReviewVersion,
    nextReviewVersion: mutationResult.nextReviewVersion,
    repositoryVersion: mutationResult.reviewSnapshot.version,
    idempotencyStatus: "new_request",
    matchingReplay: false,
    reviewStateChanged: true,
    repositoryVersionChanged: true,
  });

  if (!receiptResult || receiptResult.accepted !== true) {
    return rejectExecution({
      code: resultCode(receiptResult, "execution_receipt_failed"),
      reason: resultReason(
        receiptResult,
        "Execution receipt assembly failed safely."
      ),
      reviewId,
      action,
      actionIntent,
      internal: true,
    });
  }

  const result = freezeClone({
    accepted: true,
    applied: true,
    matchingReplay: false,
    replayedResultOnly: false,
    idempotencyStatus: "new_request",
    code: EXECUTION_SERVICE_CODE.APPLIED,
    reviewId,
    action,
    actionIntent,
    confirmation,
    previousState: mutationResult.previousState,
    resultingState: mutationResult.nextState,
    previousReviewVersion: mutationResult.previousReviewVersion,
    resultingReviewVersion: mutationResult.nextReviewVersion,
    resultingRepositoryVersion: mutationResult.reviewSnapshot.version,
    reviewStateChanged: true,
    repositoryVersionChanged: true,
    receipt: receiptResult,
    review: mutationResult.reviewSnapshot.review,
    ...createSafetyFields(),
  });
  const storeResult = idempotencyStore.storeResult({
    idempotencyKey,
    requestFingerprint: clientFingerprint,
    result,
  });

  if (!storeResult || storeResult.accepted !== true) {
    return rejectExecution({
      code: resultCode(storeResult, "idempotency_store_failed"),
      reason: resultReason(
        storeResult,
        "Execution idempotency store failed safely."
      ),
      reviewId,
      action,
      actionIntent,
      internal: true,
    });
  }

  return result;
}

function validateExecutionInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      code: "invalid_execution_input",
      reason: "Appointment review decision execution input must be an object.",
    };
  }

  const reviewId = normalizeText(input.reviewId);
  const action = normalizeText(input.action);
  const idempotencyKey = normalizeText(input.idempotencyKey);
  const confirmation = normalizeText(input.confirmation);

  if (!reviewId) {
    return {
      code: "missing_review_id",
      reason: "reviewId is required.",
    };
  }

  if (!SUPPORTED_DECISION_ACTIONS.includes(action)) {
    return {
      code: action ? "unsupported_decision_action" : "missing_decision_action",
      reason: "Decision execution action must be approve or reject.",
      reviewId,
      action,
    };
  }

  if (
    !Number.isSafeInteger(input.expectedReviewVersion) ||
    input.expectedReviewVersion < 1
  ) {
    return {
      code: "invalid_expected_review_version",
      reason: "expectedReviewVersion must be a positive safe integer.",
      reviewId,
      action,
      actionIntent: ACTION_INTENT_BY_ACTION[action],
    };
  }

  if (!idempotencyKey || idempotencyKey.length > 128) {
    return {
      code: idempotencyKey
        ? "invalid_idempotency_key"
        : "missing_idempotency_key",
      reason:
        "idempotencyKey is required and must be 128 characters or fewer.",
      reviewId,
      action,
      actionIntent: ACTION_INTENT_BY_ACTION[action],
    };
  }

  if (!/^[A-Za-z0-9:_-]+$/.test(idempotencyKey)) {
    return {
      code: "invalid_idempotency_key",
      reason:
        "idempotencyKey may contain only letters, numbers, hyphen, underscore, and colon.",
      reviewId,
      action,
      actionIntent: ACTION_INTENT_BY_ACTION[action],
    };
  }

  if (confirmation !== EXECUTION_CONFIRMATION) {
    return {
      code: "missing_execution_confirmation",
      reason: "Explicit in-memory execution confirmation is required.",
      reviewId,
      action,
      actionIntent: ACTION_INTENT_BY_ACTION[action],
    };
  }

  if (!hasExecutionDependencies(input.dependencies)) {
    return {
      code: "missing_execution_dependencies",
      reason: "Execution dependencies are required.",
      reviewId,
      action,
      actionIntent: ACTION_INTENT_BY_ACTION[action],
    };
  }

  if (!input.idempotencyStore || typeof input.idempotencyStore !== "object") {
    return {
      code: "missing_execution_idempotency_store",
      reason: "Execution idempotency store is required.",
      reviewId,
      action,
      actionIntent: ACTION_INTENT_BY_ACTION[action],
    };
  }

  if (
    typeof input.idempotencyStore.observe !== "function" ||
    typeof input.idempotencyStore.getResult !== "function" ||
    typeof input.idempotencyStore.storeResult !== "function"
  ) {
    return {
      code: "invalid_execution_idempotency_store",
      reason: "Execution idempotency store contract is invalid.",
      reviewId,
      action,
      actionIntent: ACTION_INTENT_BY_ACTION[action],
    };
  }

  if (typeof input.applyReviewControlledActionStateTransition !== "function") {
    return {
      code: "missing_repository_state_transition_capability",
      reason: "Repository state transition capability is required.",
      reviewId,
      action,
      actionIntent: ACTION_INTENT_BY_ACTION[action],
    };
  }

  return {
    value: {
      reviewId,
      action,
      expectedReviewVersion: input.expectedReviewVersion,
      idempotencyKey,
      confirmation,
      dependencies: input.dependencies,
      idempotencyStore: input.idempotencyStore,
      applyReviewControlledActionStateTransition:
        input.applyReviewControlledActionStateTransition,
    },
  };
}

function hasExecutionDependencies(dependencies) {
  return Boolean(
    dependencies &&
      typeof dependencies === "object" &&
      !Array.isArray(dependencies) &&
      typeof dependencies.resolveVerifiedActorContext === "function" &&
      typeof dependencies.resolveAppointmentReviewContext === "function" &&
      typeof dependencies.resolveIdempotencyContext === "function" &&
      typeof dependencies.resolveExecutionPolicyContext === "function"
  );
}

function rejectExecution({
  code,
  reason,
  reviewId = "",
  action = "",
  actionIntent = "",
  trustedCurrentState = "",
  observedReviewVersion = null,
  expectedReviewVersion = null,
  blocked = false,
  conflict = false,
  notFound = false,
  internal = false,
  validationCode = "",
}) {
  return freezeClone({
    accepted: false,
    applied: false,
    matchingReplay: false,
    replayedResultOnly: false,
    blocked: blocked === true,
    conflict: conflict === true,
    notFound: notFound === true,
    internal: internal === true,
    code,
    reason,
    reviewId: normalizeText(reviewId) || null,
    action: normalizeText(action) || null,
    actionIntent: normalizeText(actionIntent) || null,
    trustedCurrentState: normalizeText(trustedCurrentState) || null,
    observedReviewVersion,
    expectedReviewVersion,
    validationCode: normalizeText(validationCode) || null,
    reviewStateChanged: false,
    repositoryVersionChanged: false,
    receipt: null,
    review: null,
    ...createSafetyFields(),
  });
}

function buildClientFingerprint({
  reviewId,
  action,
  expectedReviewVersion,
  idempotencyKey,
}) {
  return [
    `reviewId:${reviewId}`,
    `action:${action}`,
    `expectedReviewVersion:${expectedReviewVersion}`,
    `idempotencyKey:${idempotencyKey}`,
  ].join("|");
}

function resultCode(result, fallback) {
  return normalizeText(result?.code || result?.error?.code) || fallback;
}

function resultReason(result, fallback) {
  return normalizeText(result?.reason || result?.error?.message) || fallback;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function createSafetyFields() {
  return { ...EXECUTION_SAFETY_FIELDS };
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
  EXECUTION_CONFIRMATION,
  EXECUTION_SERVICE_CODE,
  applyAppointmentReviewDecision,
};
