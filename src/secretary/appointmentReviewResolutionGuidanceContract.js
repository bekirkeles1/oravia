const RESOLUTION_GUIDANCE_MODE = "validation_only";
const RESOLUTION_GUIDANCE_TYPE = "appointment_review_resolution_guidance_v1";

const GUIDANCE_CATEGORIES = Object.freeze({
  NO_ADDITIONAL_VALIDATION_CHECK: "no_additional_validation_check",
  REQUEST_CORRECTION_REQUIRED: "request_correction_required",
  REVIEW_STATE_CHECK_REQUIRED: "review_state_check_required",
  REFRESH_REVIEW_REQUIRED: "refresh_review_required",
  ACTOR_VERIFICATION_REQUIRED: "actor_verification_required",
  IDEMPOTENCY_REVIEW_REQUIRED: "idempotency_review_required",
  EXECUTION_POLICY_REVIEW_REQUIRED: "execution_policy_review_required",
  MANUAL_INTERNAL_REVIEW_REQUIRED: "manual_internal_review_required",
});

const READINESS_CLASSIFICATIONS = Object.freeze({
  BOTH_PATHS_AVAILABLE: "both_paths_available",
  APPROVE_PATH_ONLY: "approve_path_only",
  REJECT_PATH_ONLY: "reject_path_only",
  BOTH_PATHS_BLOCKED: "both_paths_blocked",
});

const REQUEST_CODES = Object.freeze([
  "invalid_input",
  "invalid_decision_preview_input",
  "missing_review_id",
  "missing_decision_action",
  "unsupported_decision_action",
  "unsupported_action_intent",
  "missing_request_id",
  "unsafe_execution_flags",
]);

const REVIEW_STATE_CODES = Object.freeze([
  "unsupported_current_state",
  "state_transition_blocked",
  "invalid_transition",
  "unknown_state",
  "unknown_event",
  "terminal_state_transition_rejected",
]);

const VERSION_CODES = Object.freeze([
  "review_version_conflict",
  "review_version_not_matched",
  "review_context_changed_after_preview",
  "invalid_expected_review_version",
  "invalid_observed_review_version",
]);

const ACTOR_CODES = Object.freeze([
  "missing_actor",
  "missing_actor_id",
  "missing_verified_actor_context",
  "authentication_not_verified",
  "authorization_not_verified",
  "authorization_not_accepted",
  "unsupported_actor_role",
  "invalid_actor_context_type",
  "unsupported_verification_source",
  "required_permission_missing",
  "required_permission_mismatch",
  "actor_id_mismatch",
  "actor_role_mismatch",
  "invalid_authorization_result",
  "preconditions_not_accepted",
]);

const IDEMPOTENCY_CODES = Object.freeze([
  "missing_idempotency_key",
  "invalid_idempotency_key",
  "invalid_prior_idempotency_observation",
  "matching_idempotent_replay",
  "idempotency_key_conflict",
  "idempotency_conflict_not_eligible",
  "replay_not_eligible_for_new_command",
]);

const EXECUTION_POLICY_CODES = Object.freeze([
  "execution_policy_stage_rejected",
  "command_envelope_not_accepted",
  "command_envelope_not_constructed",
  "missing_execution_policy_context",
  "execution_must_remain_disabled",
  "action_not_allowed_by_policy",
  "state_not_allowed_by_policy",
  "invalid_policy_type",
  "unsupported_policy_version",
  "unsupported_policy_source",
  "unsupported_policy_mode",
  "controlled_action_execution_policy_rejected",
]);

const SAFETY_FIELDS = Object.freeze({
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

function buildAppointmentReviewResolutionGuidance(comparisonResult) {
  if (!isValidComparisonResult(comparisonResult)) {
    return rejectResolutionGuidance({
      code: "invalid_decision_comparison_result",
      reason:
        "A safe accepted decision comparison result is required for resolution guidance.",
    });
  }

  const approveGuidance = createBranchGuidance(
    comparisonResult.paths.approve,
    "approve"
  );
  const rejectBranchGuidance = createBranchGuidance(
    comparisonResult.paths.reject,
    "reject"
  );
  const readiness = classifyReadiness({
    approvePath: comparisonResult.paths.approve,
    rejectPath: comparisonResult.paths.reject,
  });
  const guidance = {
    accepted: true,
    guidanceGenerated: true,
    mode: RESOLUTION_GUIDANCE_MODE,
    guidanceType: RESOLUTION_GUIDANCE_TYPE,
    code: "resolution_guidance_preview_completed",
    reason: null,
    reviewId: normalizeText(comparisonResult.reviewId),
    trustedCurrentState: normalizeText(comparisonResult.trustedCurrentState),
    observedReviewVersion: comparisonResult.observedReviewVersion,
    readiness,
    approve: approveGuidance,
    reject: rejectBranchGuidance,
    internalFollowUpSummary: createInternalFollowUpSummary({
      comparisonResult,
      readiness,
      approveGuidance,
      rejectGuidance: rejectBranchGuidance,
    }),
    ...createSafetyFields(),
  };

  return freezeClone(guidance);
}

function createBranchGuidance(path, action) {
  const outcome = normalizeText(path && path.outcome);
  const completedStage = normalizeNullableText(path && path.completedStage);
  const blockingStage = normalizeNullableText(path && path.blockingStage);
  const reasonCode = chooseReasonCode(path);

  if (outcome === "passed") {
    return freezeClone({
      action,
      branchOutcome: "passed",
      completedStage,
      blockingStage: null,
      reasonCode: null,
      category: GUIDANCE_CATEGORIES.NO_ADDITIONAL_VALIDATION_CHECK,
      explanation:
        "No validation blocker was found in the current dry-run. The action has not been executed.",
      requiredCheck: "none",
      checklist: [
        "Confirm this is still the selected review before taking any separate operational step.",
        "Keep execution disabled until a controlled execution boundary exists.",
        "Do not treat this preview as approval, rejection, booking, or persistence.",
      ],
      escalationCategory: "none",
      rerunAfterVerification: false,
      ...createSafetyFields(),
    });
  }

  const mapping = resolveGuidanceMapping(reasonCode, blockingStage);

  return freezeClone({
    action,
    branchOutcome: "blocked",
    completedStage,
    blockingStage,
    reasonCode,
    category: mapping.category,
    explanation: mapping.explanation,
    requiredCheck: mapping.requiredCheck,
    checklist: mapping.checklist,
    escalationCategory: mapping.escalationCategory,
    rerunAfterVerification: mapping.rerunAfterVerification,
    ...createSafetyFields(),
  });
}

function resolveGuidanceMapping(reasonCode, blockingStage) {
  if (REQUEST_CODES.includes(reasonCode)) {
    return {
      category: GUIDANCE_CATEGORIES.REQUEST_CORRECTION_REQUIRED,
      explanation:
        "The preview input or action metadata is not structurally ready for this dry-run path.",
      requiredCheck: "request_metadata",
      checklist: [
        "Verify the selected review id is present.",
        "Verify the action metadata is one of the supported dry-run actions.",
        "Rerun the preview only after the request metadata is corrected.",
      ],
      escalationCategory: "internal_request_review",
      rerunAfterVerification: true,
    };
  }

  if (REVIEW_STATE_CODES.includes(reasonCode) || blockingStage === "state_transition") {
    return {
      category: GUIDANCE_CATEGORIES.REVIEW_STATE_CHECK_REQUIRED,
      explanation:
        "The trusted current review state blocks this dry-run path.",
      requiredCheck: "trusted_review_state",
      checklist: [
        "Refresh the selected review details from the server boundary.",
        "Verify the trusted current state shown in this preview.",
        "Do not manually override the review state from this preview.",
      ],
      escalationCategory: "internal_state_review",
      rerunAfterVerification: true,
    };
  }

  if (VERSION_CODES.includes(reasonCode)) {
    return {
      category: GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED,
      explanation:
        "The observed review version no longer matches the expected validation context.",
      requiredCheck: "trusted_review_version",
      checklist: [
        "Refresh the appointment review queue or selected review details.",
        "Confirm the latest observed review version from the server boundary.",
        "Rerun the preview after the refreshed context is visible.",
      ],
      escalationCategory: "internal_version_review",
      rerunAfterVerification: true,
    };
  }

  if (ACTOR_CODES.includes(reasonCode)) {
    return {
      category: GUIDANCE_CATEGORIES.ACTOR_VERIFICATION_REQUIRED,
      explanation:
        "The internal actor verification or authorization context is not ready for this dry-run path.",
      requiredCheck: "internal_actor_verification",
      checklist: [
        "Verify the internal secretary actor context for the preview boundary.",
        "Confirm the required controlled-action permission is present in the safe context.",
        "Do not treat this preview as production authentication or authorization.",
      ],
      escalationCategory: "internal_actor_review",
      rerunAfterVerification: true,
    };
  }

  if (IDEMPOTENCY_CODES.includes(reasonCode)) {
    return {
      category: GUIDANCE_CATEGORIES.IDEMPOTENCY_REVIEW_REQUIRED,
      explanation:
        "The safe idempotency or replay context requires internal review before rerunning this path.",
      requiredCheck: "idempotency_context",
      checklist: [
        "Review the existing safe idempotency or replay condition.",
        "Do not create or persist a new idempotency record from this preview.",
        "Rerun only after the existing condition is understood.",
      ],
      escalationCategory: "internal_idempotency_review",
      rerunAfterVerification: true,
    };
  }

  if (EXECUTION_POLICY_CODES.includes(reasonCode) || blockingStage === "controlled_action_validation") {
    return {
      category: GUIDANCE_CATEGORIES.EXECUTION_POLICY_REVIEW_REQUIRED,
      explanation:
        "The controlled-action validation boundary requires execution-policy review while execution remains disabled.",
      requiredCheck: "execution_policy_context",
      checklist: [
        "Verify the validation-only execution policy context.",
        "Confirm execution remains disabled and no executor is available.",
        "Do not bypass policy or execute from this preview.",
      ],
      escalationCategory: "internal_policy_review",
      rerunAfterVerification: true,
    };
  }

  return {
    category: GUIDANCE_CATEGORIES.MANUAL_INTERNAL_REVIEW_REQUIRED,
    explanation:
      "Manual internal review is required before rerunning the preview.",
    requiredCheck: "manual_internal_review",
    checklist: [
      "Review the safe reason code and blocking stage.",
      "Do not infer a specific operational cause from this preview.",
      "Rerun only after internal review confirms the next validation step.",
    ],
    escalationCategory: "manual_internal_review",
    rerunAfterVerification: true,
  };
}

function createInternalFollowUpSummary({
  comparisonResult,
  readiness,
  approveGuidance,
  rejectGuidance,
}) {
  return [
    `Review ${normalizeText(comparisonResult.reviewId)} is in trusted state ${normalizeText(
      comparisonResult.trustedCurrentState
    )}.`,
    `Observed review version: ${comparisonResult.observedReviewVersion}.`,
    `Readiness classification: ${readiness}.`,
    `Approve path outcome: ${approveGuidance.branchOutcome}; required check: ${approveGuidance.requiredCheck}.`,
    `Reject path outcome: ${rejectGuidance.branchOutcome}; required check: ${rejectGuidance.requiredCheck}.`,
    "Execution remains disabled. No action was performed.",
    "Nothing was persisted, sent, assigned, booked, or written to calendar.",
    "Review state and repository version were not changed by this preview.",
  ].join("\n");
}

function classifyReadiness({ approvePath, rejectPath }) {
  const approvePassed = approvePath && approvePath.outcome === "passed";
  const rejectPassed = rejectPath && rejectPath.outcome === "passed";

  if (approvePassed && rejectPassed) {
    return READINESS_CLASSIFICATIONS.BOTH_PATHS_AVAILABLE;
  }

  if (approvePassed) {
    return READINESS_CLASSIFICATIONS.APPROVE_PATH_ONLY;
  }

  if (rejectPassed) {
    return READINESS_CLASSIFICATIONS.REJECT_PATH_ONLY;
  }

  return READINESS_CLASSIFICATIONS.BOTH_PATHS_BLOCKED;
}

function chooseReasonCode(path) {
  const codes = collectPathCodes(path);
  const specificCode = codes.find(isSpecificGuidanceCode);

  return specificCode || codes[0] || null;
}

function isSpecificGuidanceCode(code) {
  return (
    REQUEST_CODES.includes(code) ||
    REVIEW_STATE_CODES.includes(code) ||
    VERSION_CODES.includes(code) ||
    ACTOR_CODES.includes(code) ||
    IDEMPOTENCY_CODES.includes(code) ||
    EXECUTION_POLICY_CODES.includes(code)
  );
}

function collectPathCodes(path) {
  if (!path || typeof path !== "object") {
    return [];
  }

  const codes = [
    normalizeText(path.code),
    normalizeText(path.stateTransitionResult?.code),
    normalizeText(path.validationResult?.code),
    normalizeText(path.validationResult?.pipelineCode),
  ];
  const pipelineStages = path.validationResult?.pipelineStages;

  if (pipelineStages && typeof pipelineStages === "object") {
    for (const stage of Object.values(pipelineStages)) {
      const stageCode = normalizeText(stage && stage.code);

      if (stageCode) {
        codes.push(stageCode);
      }
    }
  }

  return codes.filter(Boolean);
}

function isValidComparisonResult(result) {
  return Boolean(
    result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      result.accepted === true &&
      result.mode === RESOLUTION_GUIDANCE_MODE &&
      result.comparison === "decision_paths" &&
      typeof result.reviewId === "string" &&
      typeof result.trustedCurrentState === "string" &&
      Number.isSafeInteger(result.observedReviewVersion) &&
      result.paths &&
      typeof result.paths === "object" &&
      result.paths.approve &&
      result.paths.reject
  );
}

function rejectResolutionGuidance({ code, reason }) {
  return freezeClone({
    accepted: false,
    guidanceGenerated: false,
    mode: RESOLUTION_GUIDANCE_MODE,
    guidanceType: RESOLUTION_GUIDANCE_TYPE,
    code,
    reason,
    reviewId: null,
    trustedCurrentState: null,
    observedReviewVersion: null,
    readiness: null,
    approve: null,
    reject: null,
    internalFollowUpSummary: null,
    ...createSafetyFields(),
  });
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
  ACTOR_CODES,
  EXECUTION_POLICY_CODES,
  GUIDANCE_CATEGORIES,
  IDEMPOTENCY_CODES,
  READINESS_CLASSIFICATIONS,
  REQUEST_CODES,
  RESOLUTION_GUIDANCE_MODE,
  RESOLUTION_GUIDANCE_TYPE,
  REVIEW_STATE_CODES,
  VERSION_CODES,
  collectPathCodes,
  buildAppointmentReviewResolutionGuidance,
};
