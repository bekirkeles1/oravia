const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  GUIDANCE_CATEGORIES,
  buildAppointmentReviewResolutionGuidance,
} = require("../src/secretary/appointmentReviewResolutionGuidanceContract");

function createComparison(overrides = {}) {
  return {
    accepted: true,
    mode: "validation_only",
    comparison: "decision_paths",
    reviewId: "review_resolution_guidance",
    trustedCurrentState: "validation_only_intent_checked",
    observedReviewVersion: 9,
    paths: {
      approve: createPath({
        action: "approve",
        projectedNextState: "needs_clinic_review",
        ...overrides.approve,
      }),
      reject: createPath({
        action: "reject",
        projectedNextState: "action_intent_rejected",
        ...overrides.reject,
      }),
    },
    dryRun: true,
    validationOnly: true,
    actionPerformed: false,
    bookingCreated: false,
    calendarChecked: false,
    databasePersisted: false,
    persistence: "not_persisted",
  };
}

function createPath(overrides = {}) {
  return {
    outcome: "passed",
    accepted: true,
    previewPassed: true,
    previewBlocked: false,
    action: overrides.action || "approve",
    completedStage: "validation_decision_receipt",
    blockingStage: null,
    code: "decision_preview_passed",
    reason: null,
    projectedNextState: overrides.projectedNextState || "needs_clinic_review",
    receiptOutcome: "validation_passed",
    validationReceiptAssembled: true,
    validationResult: {
      code: "controlled_action_validation_passed",
      pipelineCode: "validation_pipeline_passed",
      pipelineStages: {},
    },
    stateTransitionResult: {
      code: "transition_accepted",
    },
    dryRun: true,
    validationOnly: true,
    actionPerformed: false,
    bookingCreated: false,
    calendarChecked: false,
    databasePersisted: false,
    persistence: "not_persisted",
    ...overrides,
  };
}

function blockedPath({ code, blockingStage = "preconditions", nested = {} }) {
  return createPath({
    outcome: "blocked",
    accepted: false,
    previewPassed: false,
    previewBlocked: true,
    completedStage: null,
    blockingStage,
    code,
    reason: "Synthetic safe domain block.",
    projectedNextState: null,
    receiptOutcome: null,
    validationReceiptAssembled: false,
    ...nested,
  });
}

function assertGuidanceSafety(result) {
  assert.equal(result.mock, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.resolutionGuidancePreview, true);
  assert.equal(result.validationOnly, true);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.executionAvailable, false);
  assert.equal(result.actionPerformed, false);
  assert.equal(result.bookingCreated, false);
  assert.equal(result.calendarChecked, false);
  assert.equal(result.appointmentCreated, false);
  assert.equal(result.calendarEventCreated, false);
  assert.equal(result.databasePersisted, false);
  assert.equal(result.persistence, "not_persisted");
  assert.equal(result.reviewMutated, false);
  assert.equal(result.repositoryVersionChanged, false);
  assert.equal(result.guidancePersisted, false);
  assert.equal(result.summaryPersisted, false);
  assert.equal(result.messageSent, false);
  assert.equal(result.taskAssigned, false);
}

function assertBranchSafety(branch) {
  assertGuidanceSafety(branch);
  assert.equal(branch.commandDispatched, false);
  assert.equal(branch.commandPersisted, false);
  assert.equal(branch.receiptPersisted, false);
}

test("resolution guidance maps both passed decision paths without choosing a path", () => {
  const result = buildAppointmentReviewResolutionGuidance(createComparison());
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, true);
  assert.equal(result.guidanceGenerated, true);
  assert.equal(result.mode, "validation_only");
  assert.equal(result.guidanceType, "appointment_review_resolution_guidance_v1");
  assert.equal(result.readiness, "both_paths_available");
  assert.equal(
    result.approve.category,
    GUIDANCE_CATEGORIES.NO_ADDITIONAL_VALIDATION_CHECK
  );
  assert.equal(result.reject.requiredCheck, "none");
  assert.equal(result.internalFollowUpSummary.includes("Execution remains disabled"), true);
  assert.doesNotMatch(
    serialized,
    new RegExp(
      [
        "recommended" + "Action",
        "best" + "Action",
        "preferred" + "Action",
        "automatic" + "Decision",
        "selected" + "Action",
      ].join("|")
    )
  );
  assertGuidanceSafety(result);
  assertBranchSafety(result.approve);
  assertBranchSafety(result.reject);
});

test("resolution guidance maps request metadata blocks", () => {
  const result = buildAppointmentReviewResolutionGuidance(
    createComparison({
      approve: blockedPath({ code: "unsupported_action_intent" }),
    })
  );

  assert.equal(result.readiness, "reject_path_only");
  assert.equal(
    result.approve.category,
    GUIDANCE_CATEGORIES.REQUEST_CORRECTION_REQUIRED
  );
  assert.equal(result.approve.requiredCheck, "request_metadata");
  assert.equal(result.approve.rerunAfterVerification, true);
});

test("resolution guidance maps review state blocks from transition output", () => {
  const result = buildAppointmentReviewResolutionGuidance(
    createComparison({
      reject: blockedPath({
        code: "state_transition_blocked",
        blockingStage: "state_transition",
        nested: {
          stateTransitionResult: {
            code: "invalid_transition",
          },
        },
      }),
    })
  );

  assert.equal(result.readiness, "approve_path_only");
  assert.equal(
    result.reject.category,
    GUIDANCE_CATEGORIES.REVIEW_STATE_CHECK_REQUIRED
  );
  assert.equal(result.reject.reasonCode, "state_transition_blocked");
});

test("resolution guidance prefers specific nested version codes over generic pipeline codes", () => {
  const result = buildAppointmentReviewResolutionGuidance(
    createComparison({
      approve: blockedPath({
        code: "controlled_action_validation_blocked",
        blockingStage: "controlled_action_validation",
        nested: {
          validationResult: {
            code: "controlled_action_validation_rejected",
            pipelineCode: "validation_pipeline_rejected",
            pipelineStages: {
              idempotencyAndVersionGuard: {
                code: "review_version_conflict",
              },
            },
          },
        },
      }),
    })
  );

  assert.equal(
    result.approve.category,
    GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED
  );
  assert.equal(result.approve.reasonCode, "review_version_conflict");
  assert.equal(result.approve.requiredCheck, "trusted_review_version");
});

test("resolution guidance maps actor, idempotency, policy, and fallback codes", () => {
  const actor = buildAppointmentReviewResolutionGuidance(
    createComparison({ approve: blockedPath({ code: "missing_actor" }) })
  );
  const idempotency = buildAppointmentReviewResolutionGuidance(
    createComparison({ approve: blockedPath({ code: "idempotency_key_conflict" }) })
  );
  const policy = buildAppointmentReviewResolutionGuidance(
    createComparison({ approve: blockedPath({ code: "execution_must_remain_disabled" }) })
  );
  const fallback = buildAppointmentReviewResolutionGuidance(
    createComparison({ approve: blockedPath({ code: "synthetic_safe_block" }) })
  );

  assert.equal(
    actor.approve.category,
    GUIDANCE_CATEGORIES.ACTOR_VERIFICATION_REQUIRED
  );
  assert.equal(
    idempotency.approve.category,
    GUIDANCE_CATEGORIES.IDEMPOTENCY_REVIEW_REQUIRED
  );
  assert.equal(
    policy.approve.category,
    GUIDANCE_CATEGORIES.EXECUTION_POLICY_REVIEW_REQUIRED
  );
  assert.equal(
    fallback.approve.category,
    GUIDANCE_CATEGORIES.MANUAL_INTERNAL_REVIEW_REQUIRED
  );
});

test("resolution guidance rejects malformed input safely", () => {
  const result = buildAppointmentReviewResolutionGuidance(null);

  assert.equal(result.accepted, false);
  assert.equal(result.guidanceGenerated, false);
  assert.equal(result.code, "invalid_decision_comparison_result");
  assert.equal(result.approve, null);
  assert.equal(result.reject, null);
  assertGuidanceSafety(result);
});

test("resolution guidance is immutable, deterministic, and does not mutate input", () => {
  const input = createComparison();
  const before = JSON.stringify(input);
  const first = buildAppointmentReviewResolutionGuidance(input);
  const second = buildAppointmentReviewResolutionGuidance(input);

  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.approve), true);
});

test("resolution guidance contract source has no side-effect integrations", () => {
  const source = fs.readFileSync(
    "src/secretary/appointmentReviewResolutionGuidanceContract.js",
    "utf8"
  );

  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, new RegExp("create" + "Appointment"));
  assert.doesNotMatch(source, new RegExp("create" + "CalendarEvent"));
  assert.doesNotMatch(source, new RegExp("get" + "CalendarProvider"));
  assert.doesNotMatch(source, new RegExp("manual" + "AppointmentCalendarSync"));
  assert.doesNotMatch(
    source,
    new RegExp(["google" + "apis", "pris" + "ma", "supa" + "base", "red" + "is"].join("|"))
  );
  assert.doesNotMatch(source, /bookingCreated:\s+true/);
  assert.doesNotMatch(source, /calendarChecked:\s+true/);
  assert.doesNotMatch(source, /databasePersisted:\s+true/);
});
