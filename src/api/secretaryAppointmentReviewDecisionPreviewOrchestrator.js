const {
  validateAppointmentReviewActionIntent,
} = require("../secretary/appointmentReviewActionIntentContract");
const {
  validateAppointmentReviewActionPreconditions,
} = require("../secretary/appointmentReviewActionPreconditionsContract");
const {
  transitionAppointmentReviewActionIntentState,
} = require("../secretary/appointmentReviewActionIntentStateMachine");
const {
  handleAppointmentReviewControlledActionValidation,
} = require("./secretaryAppointmentReviewControlledActionValidationHandler");
const {
  constructAppointmentReviewValidationDecisionReceipt,
} = require("../secretary/appointmentReviewValidationDecisionReceiptContract");

const SUPPORTED_DECISION_ACTIONS = Object.freeze(["approve", "reject"]);

const ACTION_INTENT_BY_ACTION = Object.freeze({
  approve: "approve_intent",
  reject: "reject_intent",
});

const STATE_TRANSITION_EVENT_BY_ACTION = Object.freeze({
  approve: "require_clinic_review",
  reject: "reject_action_intent",
});

const DECISION_PREVIEW_STAGES = Object.freeze({
  TRUSTED_REVIEW_CONTEXT: "trusted_review_context",
  ACTION_INTENT: "action_intent",
  PRECONDITIONS: "preconditions",
  STATE_TRANSITION: "state_transition",
  CONTROLLED_ACTION_VALIDATION: "controlled_action_validation",
  VALIDATION_DECISION_RECEIPT: "validation_decision_receipt",
});

const SAFETY_FIELDS = Object.freeze({
  dryRun: true,
  decisionPreview: true,
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
  reviewMutated: false,
  reviewStateChanged: false,
  repositoryVersionChanged: false,
});

const DEFAULT_CONTRACTS = Object.freeze({
  validateActionIntent: validateAppointmentReviewActionIntent,
  validatePreconditions: validateAppointmentReviewActionPreconditions,
  transitionState: transitionAppointmentReviewActionIntentState,
  runValidationHandler: handleAppointmentReviewControlledActionValidation,
  constructValidationReceipt: constructAppointmentReviewValidationDecisionReceipt,
});

async function runAppointmentReviewDecisionPreview(input, contracts = {}) {
  const activeContracts = { ...DEFAULT_CONTRACTS, ...contracts };

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return blockPreview({
      code: "invalid_decision_preview_input",
      reason:
        "Appointment review decision preview input must be an object.",
      blockingStage: null,
    });
  }

  const reviewId = normalizeText(input.reviewId);
  const action = normalizeText(input.action);

  if (!reviewId) {
    return blockPreview({
      code: "missing_review_id",
      reason: "reviewId is required for appointment review decision preview.",
      blockingStage: null,
    });
  }

  if (!SUPPORTED_DECISION_ACTIONS.includes(action)) {
    return blockPreview({
      reviewId,
      action,
      code: action ? "unsupported_decision_action" : "missing_decision_action",
      reason: "Decision preview action must be approve or reject.",
      blockingStage: DECISION_PREVIEW_STAGES.ACTION_INTENT,
    });
  }

  const dependenciesIssue = validateDependencies(input.dependencies);

  if (dependenciesIssue) {
    return blockPreview({
      reviewId,
      action,
      actionIntent: ACTION_INTENT_BY_ACTION[action],
      code: dependenciesIssue.code,
      reason: dependenciesIssue.reason,
      blockingStage: DECISION_PREVIEW_STAGES.TRUSTED_REVIEW_CONTEXT,
    });
  }

  const actionIntent = ACTION_INTENT_BY_ACTION[action];
  const requestId =
    normalizeText(input.requestId) ||
    `decision_preview_${reviewId}_${action}`;
  const idempotencyKey =
    normalizeText(input.idempotencyKey) ||
    `decision_preview_${reviewId}_${action}_key`;

  let reviewContext;

  try {
    reviewContext = await input.dependencies.resolveAppointmentReviewContext(
      Object.freeze({ reviewId })
    );
  } catch (error) {
    if (error && error.code === "appointment_review_snapshot_not_found") {
      return blockPreview({
        reviewId,
        action,
        actionIntent,
        code: "review_not_found",
        reason: "Appointment review item was not found.",
        blockingStage: DECISION_PREVIEW_STAGES.TRUSTED_REVIEW_CONTEXT,
      });
    }

    return blockPreview({
      reviewId,
      action,
      actionIntent,
      code: "trusted_review_context_failed",
      reason: "Trusted review context resolution failed safely.",
      blockingStage: DECISION_PREVIEW_STAGES.TRUSTED_REVIEW_CONTEXT,
    });
  }

  const trustedContextIssue = validateTrustedReviewContext(reviewContext, reviewId);

  if (trustedContextIssue) {
    return blockPreview({
      reviewId,
      action,
      actionIntent,
      code: trustedContextIssue.code,
      reason: trustedContextIssue.reason,
      blockingStage: DECISION_PREVIEW_STAGES.TRUSTED_REVIEW_CONTEXT,
    });
  }

  const trustedCurrentState = normalizeText(reviewContext.currentState);
  const observedReviewVersion = reviewContext.observedReviewVersion;
  const trustedReviewContext = freezeClone({
    reviewId,
    currentState: trustedCurrentState,
    observedReviewVersion,
  });

  const actionIntentResult = activeContracts.validateActionIntent({
    reviewId,
    actionIntent,
    actorRole: "secretary",
    reason: "Decision preview action intent validation only.",
  });

  if (!isAcceptedActionIntent(actionIntentResult)) {
    return blockPreview({
      reviewId,
      action,
      actionIntent,
      trustedReviewContext,
      code: resultCode(actionIntentResult, "action_intent_rejected"),
      reason: resultReason(
        actionIntentResult,
        "Action intent validation blocked the decision preview."
      ),
      blockingStage: DECISION_PREVIEW_STAGES.ACTION_INTENT,
      actionIntentResult,
    });
  }

  let actorContext;

  try {
    actorContext = await input.dependencies.resolveVerifiedActorContext(
      Object.freeze({ reviewId, actionIntent, requestId })
    );
  } catch {
    return blockPreview({
      reviewId,
      action,
      actionIntent,
      trustedReviewContext,
      code: "verified_actor_context_failed",
      reason: "Verified actor context resolution failed safely.",
      blockingStage: DECISION_PREVIEW_STAGES.PRECONDITIONS,
      actionIntentResult,
    });
  }

  const preconditionsResult = activeContracts.validatePreconditions({
    reviewId,
    actionIntent,
    currentState: trustedCurrentState,
    actor: {
      actorId: normalizeText(actorContext && actorContext.actorId),
      role: normalizeText(actorContext && actorContext.role),
    },
    requestId,
  });

  if (!preconditionsResult || preconditionsResult.accepted !== true) {
    return blockPreview({
      reviewId,
      action,
      actionIntent,
      trustedReviewContext,
      code: resultCode(preconditionsResult, "preconditions_blocked"),
      reason: resultReason(
        preconditionsResult,
        "Controlled-action preconditions blocked the decision preview."
      ),
      blockingStage: DECISION_PREVIEW_STAGES.PRECONDITIONS,
      actionIntentResult,
      preconditionsResult,
    });
  }

  const stateTransitionResult = activeContracts.transitionState({
    currentState: trustedCurrentState,
    event: STATE_TRANSITION_EVENT_BY_ACTION[action],
  });

  if (!stateTransitionResult || stateTransitionResult.accepted !== true) {
    return blockPreview({
      reviewId,
      action,
      actionIntent,
      trustedReviewContext,
      code: resultCode(stateTransitionResult, "state_transition_blocked"),
      reason: resultReason(
        stateTransitionResult,
        "State transition preview blocked the decision preview."
      ),
      blockingStage: DECISION_PREVIEW_STAGES.STATE_TRANSITION,
      actionIntentResult,
      preconditionsResult,
      stateTransitionResult,
    });
  }

  const validationBody = Object.freeze({
    actionIntent,
    requestId,
    idempotencyKey,
    expectedReviewVersion: observedReviewVersion,
  });
  let validationResult;

  try {
    validationResult = await activeContracts.runValidationHandler({
      method: "POST",
      reviewId,
      body: validationBody,
      dependencies: input.dependencies,
    });
  } catch {
    return blockPreview({
      reviewId,
      action,
      actionIntent,
      trustedReviewContext,
      code: "controlled_action_validation_failed",
      reason: "Controlled-action validation failed safely.",
      blockingStage: DECISION_PREVIEW_STAGES.CONTROLLED_ACTION_VALIDATION,
      actionIntentResult,
      preconditionsResult,
      stateTransitionResult,
    });
  }

  if (!validationResult || validationResult.accepted !== true) {
    return blockPreview({
      reviewId,
      action,
      actionIntent,
      trustedReviewContext,
      code: resultCode(validationResult, "controlled_action_validation_blocked"),
      reason: resultReason(
        validationResult,
        "Controlled-action validation blocked the decision preview."
      ),
      blockingStage: DECISION_PREVIEW_STAGES.CONTROLLED_ACTION_VALIDATION,
      actionIntentResult,
      preconditionsResult,
      stateTransitionResult,
      validationResult: summarizeValidationResult(validationResult),
    });
  }

  let receiptResult;

  try {
    receiptResult = activeContracts.constructValidationReceipt({
      handlerResult: validationResult,
    });
  } catch {
    return blockPreview({
      reviewId,
      action,
      actionIntent,
      trustedReviewContext,
      code: "validation_decision_receipt_failed",
      reason: "Validation decision receipt assembly failed safely.",
      blockingStage: DECISION_PREVIEW_STAGES.VALIDATION_DECISION_RECEIPT,
      actionIntentResult,
      preconditionsResult,
      stateTransitionResult,
      validationResult: summarizeValidationResult(validationResult),
    });
  }

  if (!receiptResult || receiptResult.accepted !== true) {
    return blockPreview({
      reviewId,
      action,
      actionIntent,
      trustedReviewContext,
      code: resultCode(receiptResult, "validation_decision_receipt_blocked"),
      reason: resultReason(
        receiptResult,
        "Validation decision receipt assembly blocked the decision preview."
      ),
      blockingStage: DECISION_PREVIEW_STAGES.VALIDATION_DECISION_RECEIPT,
      actionIntentResult,
      preconditionsResult,
      stateTransitionResult,
      validationResult: summarizeValidationResult(validationResult),
      receiptResult,
    });
  }

  let postReviewContext;

  try {
    postReviewContext = await input.dependencies.resolveAppointmentReviewContext(
      Object.freeze({ reviewId })
    );
  } catch {
    return blockPreview({
      reviewId,
      action,
      actionIntent,
      trustedReviewContext,
      code: "post_preview_review_context_failed",
      reason: "Post-preview review context verification failed safely.",
      blockingStage: DECISION_PREVIEW_STAGES.VALIDATION_DECISION_RECEIPT,
      actionIntentResult,
      preconditionsResult,
      stateTransitionResult,
      validationResult: summarizeValidationResult(validationResult),
    });
  }

  if (
    !postReviewContext ||
    normalizeText(postReviewContext.currentState) !== trustedCurrentState ||
    postReviewContext.observedReviewVersion !== observedReviewVersion
  ) {
    return blockPreview({
      reviewId,
      action,
      actionIntent,
      trustedReviewContext,
      code: "review_context_changed_after_preview",
      reason:
        "Review state or repository version changed during decision preview.",
      blockingStage: DECISION_PREVIEW_STAGES.VALIDATION_DECISION_RECEIPT,
      actionIntentResult,
      preconditionsResult,
      stateTransitionResult,
      validationResult: summarizeValidationResult(validationResult),
    });
  }

  return freezeClone({
    accepted: true,
    previewPassed: true,
    previewBlocked: false,
    completedStage: DECISION_PREVIEW_STAGES.VALIDATION_DECISION_RECEIPT,
    blockingStage: null,
    code: "decision_preview_passed",
    reason: null,
    reviewId,
    action,
    actionIntent,
    trustedCurrentState,
    observedReviewVersion,
    projectedNextState: stateTransitionResult.nextState,
    actionIntentResult,
    preconditionsResult,
    stateTransitionResult,
    validationResult: summarizeValidationResult(validationResult),
    validationReceipt: receiptResult.validationReceipt,
    receiptOutcome: receiptResult.validationReceipt.outcome,
    ...createSafetyFields(),
  });
}

function blockPreview({
  reviewId = "",
  action = "",
  actionIntent = "",
  trustedReviewContext = null,
  code,
  reason,
  blockingStage,
  actionIntentResult,
  preconditionsResult,
  stateTransitionResult,
  validationResult,
  receiptResult,
}) {
  const result = {
    accepted: false,
    previewPassed: false,
    previewBlocked: true,
    completedStage: null,
    blockingStage,
    code,
    reason,
    reviewId: normalizeText(reviewId) || null,
    action: normalizeText(action) || null,
    actionIntent: normalizeText(actionIntent) || null,
    trustedCurrentState: trustedReviewContext
      ? trustedReviewContext.currentState
      : null,
    observedReviewVersion: trustedReviewContext
      ? trustedReviewContext.observedReviewVersion
      : null,
    projectedNextState: stateTransitionResult?.accepted === true
      ? stateTransitionResult.nextState
      : null,
    actionIntentResult,
    preconditionsResult,
    stateTransitionResult,
    validationResult,
    validationReceipt: null,
    receiptOutcome: null,
    receiptResult,
    ...createSafetyFields(),
  };

  return freezeClone(removeUndefined(result));
}

function validateDependencies(dependencies) {
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
    return {
      code: "missing_decision_preview_dependencies",
      reason: "Decision preview dependencies are required.",
    };
  }

  const required = [
    "resolveAppointmentReviewContext",
    "resolveVerifiedActorContext",
    "resolveIdempotencyContext",
    "resolveExecutionPolicyContext",
  ];
  const missing = required.find((name) => typeof dependencies[name] !== "function");

  if (missing) {
    return {
      code: "missing_decision_preview_dependency",
      reason: `${missing} dependency must be a function.`,
    };
  }

  return null;
}

function validateTrustedReviewContext(reviewContext, reviewId) {
  if (!reviewContext || typeof reviewContext !== "object" || Array.isArray(reviewContext)) {
    return {
      code: "invalid_trusted_review_context",
      reason: "Trusted review context must be an object.",
    };
  }

  if (normalizeText(reviewContext.reviewId) !== reviewId) {
    return {
      code: "trusted_review_id_mismatch",
      reason: "Trusted review context reviewId must match the request reviewId.",
    };
  }

  if (!normalizeText(reviewContext.currentState)) {
    return {
      code: "missing_trusted_current_state",
      reason: "Trusted review context currentState is required.",
    };
  }

  if (
    !Number.isSafeInteger(reviewContext.observedReviewVersion) ||
    reviewContext.observedReviewVersion < 1
  ) {
    return {
      code: "invalid_observed_review_version",
      reason: "Trusted observedReviewVersion must be a positive safe integer.",
    };
  }

  return null;
}

function isAcceptedActionIntent(result) {
  return Boolean(result && result.status === "ok");
}

function summarizeValidationResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return result;
  }

  return freezeClone({
    accepted: result.accepted === true,
    handlerCompleted: result.handlerCompleted === true,
    matchingReplay: result.matchingReplay === true,
    replayExistingResultOnly: result.replayExistingResultOnly === true,
    eligibleForExecutorBoundary: result.eligibleForExecutorBoundary === true,
    failedStage: normalizeNullableText(result.failedStage),
    code: normalizeText(result.code),
    reason: normalizeNullableText(result.reason),
    reviewId: normalizeText(result.reviewId),
    pipelineCode: normalizeNullableText(result.pipelineResult?.code),
    pipelineStages: result.pipelineResult?.stages || null,
    ...createSafetyFields(),
  });
}

function resultCode(result, fallback) {
  return normalizeText(result?.code || result?.error?.code) || fallback;
}

function resultReason(result, fallback) {
  return normalizeText(result?.reason || result?.error?.message) || fallback;
}

function createSafetyFields() {
  return { ...SAFETY_FIELDS };
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);

  return normalized || null;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function removeUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined)
  );
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
  ACTION_INTENT_BY_ACTION,
  DECISION_PREVIEW_STAGES,
  STATE_TRANSITION_EVENT_BY_ACTION,
  SUPPORTED_DECISION_ACTIONS,
  runAppointmentReviewDecisionPreview,
};
