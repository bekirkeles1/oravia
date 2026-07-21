const {
  evaluateAppointmentReviewDecisionPreview,
  SUPPORTED_DECISION_ACTIONS,
} = require("./secretaryAppointmentReviewDecisionPreviewOrchestrator");

const DECISION_COMPARISON_MODE = "validation_only";
const DECISION_COMPARISON_TYPE = "decision_paths";
const DECISION_COMPARISON_ACTIONS = Object.freeze([...SUPPORTED_DECISION_ACTIONS]);

const DECISION_COMPARISON_SAFETY_FIELDS = Object.freeze({
  dryRun: true,
  decisionComparison: true,
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

async function runAppointmentReviewDecisionComparison(input, contracts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectComparison({
      code: "invalid_decision_comparison_input",
      reason:
        "Appointment review decision comparison input must be an object.",
    });
  }

  const reviewId = normalizeText(input.reviewId);

  if (!reviewId) {
    return rejectComparison({
      code: "missing_review_id",
      reason:
        "reviewId is required for appointment review decision comparison.",
    });
  }

  const dependenciesIssue = validateDependencies(input.dependencies);

  if (dependenciesIssue) {
    return rejectComparison({
      reviewId,
      code: dependenciesIssue.code,
      reason: dependenciesIssue.reason,
    });
  }

  let trustedReviewContext;

  try {
    trustedReviewContext = await input.dependencies.resolveAppointmentReviewContext(
      Object.freeze({ reviewId })
    );
  } catch (error) {
    if (error && error.code === "appointment_review_snapshot_not_found") {
      return rejectComparison({
        reviewId,
        code: "review_not_found",
        reason: "Appointment review item was not found.",
      });
    }

    return rejectComparison({
      reviewId,
      code: "trusted_review_context_failed",
      reason: "Trusted review context resolution failed safely.",
    });
  }

  const trustedContextIssue = validateTrustedReviewContext(
    trustedReviewContext,
    reviewId
  );

  if (trustedContextIssue) {
    return rejectComparison({
      reviewId,
      code: trustedContextIssue.code,
      reason: trustedContextIssue.reason,
    });
  }

  const trustedContext = freezeClone({
    contextType: normalizeText(trustedReviewContext.contextType),
    contextSource: normalizeText(trustedReviewContext.contextSource),
    reviewId,
    currentState: normalizeText(trustedReviewContext.currentState),
    observedReviewVersion: trustedReviewContext.observedReviewVersion,
  });

  return evaluateAppointmentReviewDecisionComparison(
    {
      reviewId,
      dependencies: input.dependencies,
      trustedReviewContext: trustedContext,
      requestMetadataPrefix: "decision_comparison",
    },
    contracts
  );
}

async function evaluateAppointmentReviewDecisionComparison(input, contracts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectComparison({
      code: "invalid_decision_comparison_input",
      reason:
        "Appointment review decision comparison input must be an object.",
    });
  }

  const reviewId = normalizeText(input.reviewId);

  if (!reviewId) {
    return rejectComparison({
      code: "missing_review_id",
      reason:
        "reviewId is required for appointment review decision comparison.",
    });
  }

  const dependenciesIssue = validateDependencies(input.dependencies);

  if (dependenciesIssue) {
    return rejectComparison({
      reviewId,
      code: dependenciesIssue.code,
      reason: dependenciesIssue.reason,
    });
  }

  const trustedContextIssue = validateTrustedReviewContext(
    input.trustedReviewContext,
    reviewId
  );

  if (trustedContextIssue) {
    return rejectComparison({
      reviewId,
      code: trustedContextIssue.code,
      reason: trustedContextIssue.reason,
    });
  }

  const trustedContext = freezeClone({
    contextType: normalizeText(input.trustedReviewContext.contextType),
    contextSource: normalizeText(input.trustedReviewContext.contextSource),
    reviewId,
    currentState: normalizeText(input.trustedReviewContext.currentState),
    observedReviewVersion: input.trustedReviewContext.observedReviewVersion,
  });
  const branchValidationDependencies = createTrustedReviewContextDependencies({
    dependencies: input.dependencies,
    trustedReviewContext: trustedContext,
  });
  const requestMetadataPrefix =
    normalizeText(input.requestMetadataPrefix) || "decision_comparison";
  const paths = {};

  try {
    for (const action of DECISION_COMPARISON_ACTIONS) {
      const branchResult = await evaluateAppointmentReviewDecisionPreview({
        reviewId,
        action,
        dependencies: input.dependencies,
        validationDependencies: branchValidationDependencies,
        trustedReviewContext: trustedContext,
        requestId: `${requestMetadataPrefix}_${reviewId}_${action}`,
        idempotencyKey: `${requestMetadataPrefix}_${reviewId}_${action}_key`,
        contracts,
        verifyPostPreviewContext: false,
      });

      paths[action] = createPathSummary(branchResult);
    }
  } catch {
    return rejectComparison({
      reviewId,
      trustedReviewContext: trustedContext,
      code: "decision_comparison_branch_failed",
      reason: "Decision comparison branch evaluation failed safely.",
    });
  }

  return freezeClone({
    accepted: true,
    comparisonPassed: true,
    comparisonBlocked: false,
    mode: DECISION_COMPARISON_MODE,
    comparison: DECISION_COMPARISON_TYPE,
    code: "decision_comparison_completed",
    reason: null,
    reviewId,
    trustedCurrentState: trustedContext.currentState,
    observedReviewVersion: trustedContext.observedReviewVersion,
    actions: [...DECISION_COMPARISON_ACTIONS],
    paths,
    ...createSafetyFields(),
  });
}

function createTrustedReviewContextDependencies({
  dependencies,
  trustedReviewContext,
}) {
  return Object.freeze({
    resolveAppointmentReviewContext(input) {
      const requestedReviewId = normalizeText(input && input.reviewId);

      if (requestedReviewId !== trustedReviewContext.reviewId) {
        throw Object.freeze({
          code: "trusted_review_id_mismatch",
          reason: "Trusted review context reviewId must match branch reviewId.",
        });
      }

      return trustedReviewContext;
    },
    resolveVerifiedActorContext(input) {
      return dependencies.resolveVerifiedActorContext(input);
    },
    resolveIdempotencyContext(input) {
      return dependencies.resolveIdempotencyContext(input);
    },
    resolveExecutionPolicyContext(input) {
      return dependencies.resolveExecutionPolicyContext(input);
    },
  });
}

function createPathSummary(branchResult) {
  const outcome = branchResult?.accepted === true ? "passed" : "blocked";

  return freezeClone({
    outcome,
    accepted: branchResult?.accepted === true,
    previewPassed: branchResult?.previewPassed === true,
    previewBlocked: branchResult?.previewBlocked === true,
    action: normalizeText(branchResult?.action),
    actionIntent: normalizeText(branchResult?.actionIntent),
    trustedCurrentState: normalizeText(branchResult?.trustedCurrentState),
    observedReviewVersion: Number.isSafeInteger(
      branchResult?.observedReviewVersion
    )
      ? branchResult.observedReviewVersion
      : null,
    completedStage: normalizeNullableText(branchResult?.completedStage),
    blockingStage: normalizeNullableText(branchResult?.blockingStage),
    stoppedAt:
      normalizeNullableText(branchResult?.blockingStage) ||
      normalizeNullableText(branchResult?.completedStage),
    code: normalizeText(branchResult?.code),
    reason: normalizeNullableText(branchResult?.reason),
    projectedNextState: normalizeNullableText(branchResult?.projectedNextState),
    receiptOutcome: normalizeNullableText(branchResult?.receiptOutcome),
    validationReceiptAssembled: Boolean(branchResult?.validationReceipt),
    validationResult: branchResult?.validationResult || null,
    stateTransitionResult: branchResult?.stateTransitionResult || null,
    ...createSafetyFields(),
  });
}

function rejectComparison({
  reviewId = "",
  trustedReviewContext = null,
  code,
  reason,
}) {
  return freezeClone({
    accepted: false,
    comparisonPassed: false,
    comparisonBlocked: true,
    mode: DECISION_COMPARISON_MODE,
    comparison: DECISION_COMPARISON_TYPE,
    code,
    reason,
    reviewId: normalizeText(reviewId) || null,
    trustedCurrentState: trustedReviewContext
      ? trustedReviewContext.currentState
      : null,
    observedReviewVersion: trustedReviewContext
      ? trustedReviewContext.observedReviewVersion
      : null,
    actions: [...DECISION_COMPARISON_ACTIONS],
    paths: null,
    ...createSafetyFields(),
  });
}

function validateDependencies(dependencies) {
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
    return {
      code: "missing_decision_comparison_dependencies",
      reason: "Decision comparison dependencies are required.",
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
      code: "missing_decision_comparison_dependency",
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

function createSafetyFields() {
  return { ...DECISION_COMPARISON_SAFETY_FIELDS };
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);

  return normalized || null;
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
  DECISION_COMPARISON_ACTIONS,
  DECISION_COMPARISON_MODE,
  DECISION_COMPARISON_TYPE,
  evaluateAppointmentReviewDecisionComparison,
  runAppointmentReviewDecisionComparison,
};
