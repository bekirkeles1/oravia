const {
  DECISION_COMPARISON_ACTIONS,
  evaluateAppointmentReviewDecisionComparison,
} = require("./secretaryAppointmentReviewDecisionComparisonOrchestrator");

const QUEUE_READINESS_MODE = "validation_only";
const QUEUE_READINESS_TYPE = "queue_decision_readiness_preview";
const QUEUE_READINESS_CLASSIFICATIONS = Object.freeze({
  BOTH_PATHS_AVAILABLE: "both_paths_available",
  APPROVE_PATH_ONLY: "approve_path_only",
  REJECT_PATH_ONLY: "reject_path_only",
  BOTH_PATHS_BLOCKED: "both_paths_blocked",
});

const QUEUE_READINESS_SAFETY_FIELDS = Object.freeze({
  mock: true,
  dryRun: true,
  queueReadinessPreview: true,
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
  queueMutated: false,
  queueCountChanged: false,
});

async function runAppointmentReviewQueueReadinessPreview(input, contracts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectQueueReadiness({
      code: "invalid_queue_readiness_input",
      reason:
        "Appointment review queue readiness preview input must be an object.",
    });
  }

  const adapterIssue = validateRouteRuntimeAdapter(input.routeRuntimeAdapter);

  if (adapterIssue) {
    return rejectQueueReadiness(adapterIssue);
  }

  let reviews;

  try {
    reviews = input.routeRuntimeAdapter.listAppointmentReviews();
  } catch {
    return rejectQueueReadiness({
      code: "queue_list_failed",
      reason: "Appointment review queue list resolution failed safely.",
    });
  }

  if (!Array.isArray(reviews)) {
    return rejectQueueReadiness({
      code: "invalid_queue_list",
      reason: "Appointment review queue list must be an array.",
    });
  }

  if (reviews.length === 0) {
    return createQueueReadinessSuccess([]);
  }

  let dependencies;

  try {
    dependencies = input.routeRuntimeAdapter.getControlledActionDependencies();
  } catch {
    return rejectQueueReadiness({
      code: "controlled_action_dependencies_failed",
      reason:
        "Controlled-action dependency resolution failed safely for queue readiness preview.",
    });
  }

  const dependenciesIssue = validateControlledActionDependencies(dependencies);

  if (dependenciesIssue) {
    return rejectQueueReadiness(dependenciesIssue);
  }

  const items = [];

  try {
    for (const review of reviews) {
      const reviewId = normalizeText(review && review.id);

      if (!reviewId) {
        return rejectQueueReadiness({
          code: "invalid_queue_review",
          reason: "Every queued appointment review must include a review id.",
        });
      }

      const trustedReviewContext =
        await dependencies.resolveAppointmentReviewContext(
          Object.freeze({ reviewId })
        );
      const trustedContextIssue = validateTrustedReviewContext(
        trustedReviewContext,
        reviewId
      );

      if (trustedContextIssue) {
        return rejectQueueReadiness(trustedContextIssue);
      }

      const comparisonResult = await evaluateAppointmentReviewDecisionComparison(
        {
          reviewId,
          dependencies,
          trustedReviewContext,
          requestMetadataPrefix: "queue_readiness",
        },
        contracts
      );

      if (
        !comparisonResult ||
        comparisonResult.accepted !== true ||
        !comparisonResult.paths ||
        typeof comparisonResult.paths !== "object"
      ) {
        return rejectQueueReadiness({
          code: "queue_readiness_comparison_failed",
          reason:
            "Decision comparison failed safely while scanning queue readiness.",
        });
      }

      items.push(createQueueReadinessItem(comparisonResult));
    }
  } catch {
    return rejectQueueReadiness({
      code: "queue_readiness_evaluation_failed",
      reason: "Queue readiness evaluation failed safely.",
    });
  }

  return createQueueReadinessSuccess(items);
}

function createQueueReadinessItem(comparisonResult) {
  const approvePath = comparisonResult.paths.approve;
  const rejectPath = comparisonResult.paths.reject;
  const readiness = classifyReadiness({ approvePath, rejectPath });

  return freezeClone({
    reviewId: comparisonResult.reviewId,
    trustedCurrentState: comparisonResult.trustedCurrentState,
    observedReviewVersion: comparisonResult.observedReviewVersion,
    readiness,
    approve: createPathProjection(approvePath),
    reject: createPathProjection(rejectPath),
    ...createSafetyFields(),
  });
}

function createPathProjection(path) {
  return freezeClone({
    outcome: normalizeText(path && path.outcome) || "blocked",
    completedStage: normalizeNullableText(path && path.completedStage),
    blockingStage: normalizeNullableText(path && path.blockingStage),
    stoppedAt: normalizeNullableText(path && path.stoppedAt),
    projectedNextState: normalizeNullableText(path && path.projectedNextState),
    reason: normalizeNullableText(path && path.reason),
    code: normalizeNullableText(path && path.code),
    receiptOutcome: normalizeNullableText(path && path.receiptOutcome),
    ...createSafetyFields(),
  });
}

function classifyReadiness({ approvePath, rejectPath }) {
  const approvePassed = approvePath && approvePath.outcome === "passed";
  const rejectPassed = rejectPath && rejectPath.outcome === "passed";

  if (approvePassed && rejectPassed) {
    return QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_AVAILABLE;
  }

  if (approvePassed) {
    return QUEUE_READINESS_CLASSIFICATIONS.APPROVE_PATH_ONLY;
  }

  if (rejectPassed) {
    return QUEUE_READINESS_CLASSIFICATIONS.REJECT_PATH_ONLY;
  }

  return QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_BLOCKED;
}

function createQueueReadinessSuccess(items) {
  const safeItems = Array.isArray(items) ? items.map((item) => freezeClone(item)) : [];

  return freezeClone({
    accepted: true,
    queueReadinessPassed: true,
    queueReadinessBlocked: false,
    mode: QUEUE_READINESS_MODE,
    preview: QUEUE_READINESS_TYPE,
    code: "queue_readiness_preview_completed",
    reason: null,
    summary: createSummary(safeItems),
    items: safeItems,
    ...createSafetyFields(),
  });
}

function rejectQueueReadiness({ code, reason }) {
  return freezeClone({
    accepted: false,
    queueReadinessPassed: false,
    queueReadinessBlocked: true,
    mode: QUEUE_READINESS_MODE,
    preview: QUEUE_READINESS_TYPE,
    code,
    reason,
    summary: null,
    items: null,
    ...createSafetyFields(),
  });
}

function createSummary(items) {
  const initial = {
    totalReviewsScanned: items.length,
    bothPathsAvailable: 0,
    approvePathOnly: 0,
    rejectPathOnly: 0,
    bothPathsBlocked: 0,
  };

  for (const item of items) {
    if (item.readiness === QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_AVAILABLE) {
      initial.bothPathsAvailable += 1;
    }

    if (item.readiness === QUEUE_READINESS_CLASSIFICATIONS.APPROVE_PATH_ONLY) {
      initial.approvePathOnly += 1;
    }

    if (item.readiness === QUEUE_READINESS_CLASSIFICATIONS.REJECT_PATH_ONLY) {
      initial.rejectPathOnly += 1;
    }

    if (item.readiness === QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_BLOCKED) {
      initial.bothPathsBlocked += 1;
    }
  }

  return freezeClone(initial);
}

function validateRouteRuntimeAdapter(routeRuntimeAdapter) {
  if (
    !routeRuntimeAdapter ||
    typeof routeRuntimeAdapter !== "object" ||
    Array.isArray(routeRuntimeAdapter)
  ) {
    return {
      code: "missing_queue_readiness_route_runtime_adapter",
      reason: "Queue readiness preview requires a route runtime adapter.",
    };
  }

  if (typeof routeRuntimeAdapter.listAppointmentReviews !== "function") {
    return {
      code: "missing_queue_list_capability",
      reason: "Route runtime adapter must provide listAppointmentReviews.",
    };
  }

  if (typeof routeRuntimeAdapter.getControlledActionDependencies !== "function") {
    return {
      code: "missing_controlled_action_dependencies_capability",
      reason:
        "Route runtime adapter must provide getControlledActionDependencies.",
    };
  }

  return null;
}

function validateControlledActionDependencies(dependencies) {
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
    return {
      code: "missing_queue_readiness_dependencies",
      reason: "Queue readiness preview dependencies are required.",
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
      code: "missing_queue_readiness_dependency",
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
      reason: "Trusted review context reviewId must match queued reviewId.",
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
  return { ...QUEUE_READINESS_SAFETY_FIELDS };
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
  QUEUE_READINESS_CLASSIFICATIONS,
  QUEUE_READINESS_MODE,
  QUEUE_READINESS_TYPE,
  classifyReadiness,
  runAppointmentReviewQueueReadinessPreview,
};
