const {
  runAppointmentReviewDecisionComparison,
} = require("./secretaryAppointmentReviewDecisionComparisonOrchestrator");
const {
  collectPathCodes,
  buildAppointmentReviewResolutionGuidance,
} = require("../secretary/appointmentReviewResolutionGuidanceContract");

const RESOLUTION_GUIDANCE_PREVIEW_MODE = "validation_only";
const RESOLUTION_GUIDANCE_PREVIEW_TYPE = "resolution_guidance_preview";

const INFRASTRUCTURE_FAILURE_CODES = Object.freeze([
  "trusted_review_context_failed",
  "post_preview_review_context_failed",
  "controlled_action_validation_failed",
  "verified_actor_context_failed",
  "appointment_review_context_resolution_failed",
  "verified_actor_context_resolution_failed",
  "idempotency_context_resolution_failed",
  "execution_policy_context_resolution_failed",
  "missing_verified_actor_resolver",
  "missing_review_context_resolver",
  "missing_idempotency_context_resolver",
  "missing_execution_policy_resolver",
  "decision_comparison_branch_failed",
  "review_not_found",
  "controlled_action_dependencies_failed",
]);

const RESOLUTION_GUIDANCE_PREVIEW_SAFETY_FIELDS = Object.freeze({
  mock: true,
  dryRun: true,
  resolutionGuidancePreview: true,
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
  guidancePersisted: false,
  summaryPersisted: false,
  messageSent: false,
  taskAssigned: false,
});

async function runAppointmentReviewResolutionGuidancePreview(
  input,
  contracts = {}
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectGuidancePreview({
      code: "invalid_resolution_guidance_preview_input",
      reason:
        "Appointment review resolution guidance preview input must be an object.",
    });
  }

  const reviewId = normalizeText(input.reviewId);

  if (!reviewId) {
    return rejectGuidancePreview({
      code: "missing_review_id",
      reason:
        "reviewId is required for appointment review resolution guidance preview.",
    });
  }

  const adapter =
    input.routeRuntimeAdapter || input.appointmentReviewRouteRuntimeAdapter;

  if (
    !adapter ||
    typeof adapter !== "object" ||
    Array.isArray(adapter) ||
    typeof adapter.getControlledActionDependencies !== "function"
  ) {
    return rejectGuidancePreview({
      reviewId,
      code: "missing_resolution_guidance_runtime_adapter",
      reason:
        "A route runtime adapter is required for resolution guidance preview.",
    });
  }

  let dependencies;

  try {
    dependencies = adapter.getControlledActionDependencies();
  } catch {
    return rejectGuidancePreview({
      reviewId,
      code: "controlled_action_dependencies_failed",
      reason: "Controlled action dependencies failed safely.",
    });
  }

  const dependencyIssue = validateDependencies(dependencies);

  if (dependencyIssue) {
    return rejectGuidancePreview({
      reviewId,
      code: dependencyIssue.code,
      reason: dependencyIssue.reason,
    });
  }

  let comparisonResult;

  try {
    comparisonResult = await runAppointmentReviewDecisionComparison(
      {
        reviewId,
        dependencies,
      },
      contracts.comparisonContracts
    );
  } catch {
    return rejectGuidancePreview({
      reviewId,
      code: "resolution_guidance_comparison_failed",
      reason: "Decision comparison failed safely before guidance was created.",
    });
  }

  if (!comparisonResult || typeof comparisonResult !== "object") {
    return rejectGuidancePreview({
      reviewId,
      code: "resolution_guidance_comparison_malformed",
      reason: "Decision comparison returned malformed output safely.",
    });
  }

  if (comparisonResult.code === "review_not_found") {
    return rejectGuidancePreview({
      reviewId,
      code: "review_not_found",
      reason: "Appointment review item was not found.",
    });
  }

  if (comparisonResult.accepted !== true) {
    return rejectGuidancePreview({
      reviewId,
      code: "resolution_guidance_comparison_rejected",
      reason: "Decision comparison did not complete, so no guidance was created.",
    });
  }

  const infrastructureCode = findInfrastructureFailureCode(comparisonResult);

  if (infrastructureCode) {
    return rejectGuidancePreview({
      reviewId,
      trustedCurrentState: comparisonResult.trustedCurrentState,
      observedReviewVersion: comparisonResult.observedReviewVersion,
      code: "resolution_guidance_infrastructure_failed",
      reason:
        "Infrastructure context failed safely and was not converted into resolution guidance.",
      infrastructureCode,
    });
  }

  const createResolutionGuidance =
    contracts.createResolutionGuidance ||
    buildAppointmentReviewResolutionGuidance;
  let guidance;

  try {
    guidance = createResolutionGuidance(comparisonResult);
  } catch {
    return rejectGuidancePreview({
      reviewId,
      trustedCurrentState: comparisonResult.trustedCurrentState,
      observedReviewVersion: comparisonResult.observedReviewVersion,
      code: "resolution_guidance_mapper_failed",
      reason: "Resolution guidance mapping failed safely.",
    });
  }

  if (!guidance || guidance.accepted !== true) {
    return rejectGuidancePreview({
      reviewId,
      trustedCurrentState: comparisonResult.trustedCurrentState,
      observedReviewVersion: comparisonResult.observedReviewVersion,
      code: "resolution_guidance_mapper_rejected",
      reason: "Resolution guidance mapper rejected the comparison safely.",
    });
  }

  return freezeClone({
    accepted: true,
    guidancePreviewPassed: true,
    guidancePreviewBlocked: false,
    mode: RESOLUTION_GUIDANCE_PREVIEW_MODE,
    preview: RESOLUTION_GUIDANCE_PREVIEW_TYPE,
    code: "resolution_guidance_preview_completed",
    reason: null,
    reviewId,
    trustedCurrentState: guidance.trustedCurrentState,
    observedReviewVersion: guidance.observedReviewVersion,
    readiness: guidance.readiness,
    approve: guidance.approve,
    reject: guidance.reject,
    internalFollowUpSummary: guidance.internalFollowUpSummary,
    ...createSafetyFields(),
  });
}

function validateDependencies(dependencies) {
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
    return {
      code: "missing_resolution_guidance_dependencies",
      reason: "Resolution guidance dependencies are required.",
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
      code: "missing_resolution_guidance_dependency",
      reason: `${missing} dependency must be a function.`,
    };
  }

  return null;
}

function findInfrastructureFailureCode(comparisonResult) {
  const pathCodes = [
    ...collectPathCodes(comparisonResult.paths?.approve),
    ...collectPathCodes(comparisonResult.paths?.reject),
  ];

  return pathCodes.find((code) => INFRASTRUCTURE_FAILURE_CODES.includes(code)) || null;
}

function rejectGuidancePreview({
  reviewId = "",
  trustedCurrentState = null,
  observedReviewVersion = null,
  code,
  reason,
  infrastructureCode = null,
}) {
  return freezeClone({
    accepted: false,
    guidancePreviewPassed: false,
    guidancePreviewBlocked: true,
    mode: RESOLUTION_GUIDANCE_PREVIEW_MODE,
    preview: RESOLUTION_GUIDANCE_PREVIEW_TYPE,
    code,
    reason,
    reviewId: normalizeText(reviewId) || null,
    trustedCurrentState: normalizeText(trustedCurrentState) || null,
    observedReviewVersion: Number.isSafeInteger(observedReviewVersion)
      ? observedReviewVersion
      : null,
    readiness: null,
    approve: null,
    reject: null,
    internalFollowUpSummary: null,
    infrastructureCode,
    ...createSafetyFields(),
  });
}

function createSafetyFields() {
  return { ...RESOLUTION_GUIDANCE_PREVIEW_SAFETY_FIELDS };
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
  INFRASTRUCTURE_FAILURE_CODES,
  RESOLUTION_GUIDANCE_PREVIEW_MODE,
  RESOLUTION_GUIDANCE_PREVIEW_TYPE,
  runAppointmentReviewResolutionGuidancePreview,
};
