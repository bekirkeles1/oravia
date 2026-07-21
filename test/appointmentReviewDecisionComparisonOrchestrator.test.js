const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  runAppointmentReviewDecisionComparison,
} = require("../src/api/secretaryAppointmentReviewDecisionComparisonOrchestrator");
const {
  validateAppointmentReviewActionPreconditions,
} = require("../src/secretary/appointmentReviewActionPreconditionsContract");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

function createDependencies(options = {}) {
  const base = createMockAppointmentReviewControlledActionDependencies();
  const calls = {
    actor: [],
    review: [],
    idempotency: [],
    policy: [],
  };
  const reviewContext = options.reviewContext || {
    reviewId: options.reviewId || "review_decision_comparison",
    currentState: options.currentState || "validation_only_intent_checked",
    observedReviewVersion: options.observedReviewVersion || 7,
  };

  return {
    calls,
    dependencies: Object.freeze({
      resolveVerifiedActorContext(input) {
        calls.actor.push(input);
        return base.resolveVerifiedActorContext(input);
      },
      resolveAppointmentReviewContext(input) {
        calls.review.push(input);

        if (options.reviewThrows) {
          throw Object.freeze({
            code: options.reviewThrows,
            reason: "Synthetic review context failure.",
          });
        }

        if (reviewContext === null) {
          throw Object.freeze({
            code: "appointment_review_snapshot_not_found",
            reason: "Synthetic not found.",
          });
        }

        return Object.freeze({
          contextType: "appointment_review_snapshot_context_v1",
          contextSource: "server_review_boundary",
          ...reviewContext,
          reviewId: input.reviewId,
        });
      },
      resolveIdempotencyContext(input) {
        calls.idempotency.push(input);
        return base.resolveIdempotencyContext(input);
      },
      resolveExecutionPolicyContext(input) {
        calls.policy.push(input);
        return base.resolveExecutionPolicyContext(input);
      },
    }),
  };
}

function assertComparisonSafety(result) {
  assert.equal(result.dryRun, true);
  assert.equal(result.decisionComparison, true);
  assert.equal(result.validationOnly, true);
  assert.equal(result.controlledHandlingOnly, true);
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
  assert.equal(result.reviewStateChanged, false);
  assert.equal(result.repositoryVersionChanged, false);
}

function assertPathSafety(path) {
  assertComparisonSafety(path);
  assert.equal(path.receiptPersisted, false);
  assert.equal(path.commandDispatched, false);
  assert.equal(path.commandPersisted, false);
}

test("decision comparison evaluates approve and reject with one trusted review lookup", async () => {
  const { dependencies, calls } = createDependencies({
    reviewId: "review_decision_comparison_success",
    observedReviewVersion: 11,
  });
  const result = await runAppointmentReviewDecisionComparison({
    reviewId: "review_decision_comparison_success",
    dependencies,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.mode, "validation_only");
  assert.equal(result.comparison, "decision_paths");
  assert.deepEqual(result.actions, ["approve", "reject"]);
  assert.equal(result.trustedCurrentState, "validation_only_intent_checked");
  assert.equal(result.observedReviewVersion, 11);
  assert.deepEqual(Object.keys(result.paths), ["approve", "reject"]);
  assert.equal(result.paths.approve.outcome, "passed");
  assert.equal(result.paths.approve.projectedNextState, "needs_clinic_review");
  assert.equal(result.paths.approve.receiptOutcome, "validation_passed");
  assert.equal(result.paths.reject.outcome, "passed");
  assert.equal(result.paths.reject.projectedNextState, "action_intent_rejected");
  assert.equal(result.paths.reject.receiptOutcome, "validation_passed");
  assert.equal(calls.review.length, 1);
  assert.equal(calls.actor.length, 4);
  assert.equal(calls.idempotency.length, 2);
  assert.equal(calls.policy.length, 2);
  assertPathSafety(result.paths.approve);
  assertPathSafety(result.paths.reject);
  assertComparisonSafety(result);
});

test("decision comparison uses shared trusted state and version over client-shaped input", async () => {
  const { dependencies } = createDependencies({
    reviewId: "review_decision_comparison_trusted",
    observedReviewVersion: 12,
  });
  const result = await runAppointmentReviewDecisionComparison({
    reviewId: "review_decision_comparison_trusted",
    currentState: "needs_clinic_review",
    observedReviewVersion: 999,
    actions: ["approve"],
    dependencies,
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, true);
  assert.deepEqual(result.actions, ["approve", "reject"]);
  assert.equal(result.paths.approve.trustedCurrentState, "validation_only_intent_checked");
  assert.equal(result.paths.reject.trustedCurrentState, "validation_only_intent_checked");
  assert.equal(result.paths.approve.observedReviewVersion, 12);
  assert.equal(result.paths.reject.observedReviewVersion, 12);
  assert.equal(serialized.includes("999"), false);
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
  assertComparisonSafety(result);
});

test("decision comparison keeps branch-specific request metadata isolated", async () => {
  const { dependencies, calls } = createDependencies();
  const result = await runAppointmentReviewDecisionComparison({
    reviewId: "review_decision_comparison_metadata",
    dependencies,
  });

  assert.equal(result.accepted, true);
  assert.equal(calls.idempotency.length, 2);
  assert.equal(
    calls.idempotency[0].idempotencyKey,
    "decision_comparison_review_decision_comparison_metadata_approve_key"
  );
  assert.equal(
    calls.idempotency[1].idempotencyKey,
    "decision_comparison_review_decision_comparison_metadata_reject_key"
  );
  assert.notEqual(
    calls.idempotency[0].idempotencyKey,
    calls.idempotency[1].idempotencyKey
  );
  assert.equal(calls.idempotency[0].requestId.includes("_approve"), true);
  assert.equal(calls.idempotency[1].requestId.includes("_reject"), true);
  assert.equal(result.paths.approve.validationResult.matchingReplay, false);
  assert.equal(result.paths.reject.validationResult.matchingReplay, false);
  assertComparisonSafety(result);
});

test("decision comparison keeps evaluating the other branch after a domain block", async () => {
  const { dependencies } = createDependencies();
  const result = await runAppointmentReviewDecisionComparison(
    {
      reviewId: "review_decision_comparison_one_block",
      dependencies,
    },
    {
      validatePreconditions(input) {
        if (input.actionIntent === "reject_intent") {
          return Object.freeze({
            accepted: false,
            eligibleForControlledHandling: false,
            code: "synthetic_reject_block",
            reason: "Synthetic reject branch domain block.",
            reviewId: input.reviewId,
            actionIntent: input.actionIntent,
            currentState: input.currentState,
            dryRun: true,
            validationOnly: true,
            preconditionsChecked: true,
            controlledHandlingOnly: true,
            executionAvailable: false,
            executionRequested: false,
            actionPerformed: false,
            bookingCreated: false,
            calendarChecked: false,
            appointmentCreated: false,
            calendarEventCreated: false,
            databasePersisted: false,
            persistence: "not_persisted",
          });
        }

        return validateAppointmentReviewActionPreconditions(input);
      },
    }
  );

  assert.equal(result.accepted, true);
  assert.equal(result.paths.approve.outcome, "passed");
  assert.equal(result.paths.approve.receiptOutcome, "validation_passed");
  assert.equal(result.paths.reject.outcome, "blocked");
  assert.equal(result.paths.reject.blockingStage, "preconditions");
  assert.equal(result.paths.reject.code, "synthetic_reject_block");
  assert.equal(result.paths.reject.validationReceiptAssembled, false);
  assertPathSafety(result.paths.approve);
  assertPathSafety(result.paths.reject);
});

test("decision comparison returns both branches blocked from an existing invalid state", async () => {
  const { dependencies } = createDependencies({
    currentState: "pending_secretary_review",
  });
  const result = await runAppointmentReviewDecisionComparison({
    reviewId: "review_decision_comparison_both_blocked",
    dependencies,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.paths.approve.outcome, "blocked");
  assert.equal(result.paths.approve.blockingStage, "preconditions");
  assert.equal(result.paths.approve.validationReceiptAssembled, false);
  assert.equal(result.paths.reject.outcome, "blocked");
  assert.equal(result.paths.reject.blockingStage, "preconditions");
  assert.equal(result.paths.reject.validationReceiptAssembled, false);
  assertPathSafety(result.paths.approve);
  assertPathSafety(result.paths.reject);
});

test("decision comparison is deterministic and does not introduce cross-request state", async () => {
  const first = createDependencies({
    reviewId: "review_decision_comparison_repeat",
  });
  const second = createDependencies({
    reviewId: "review_decision_comparison_repeat",
  });
  const firstResult = await runAppointmentReviewDecisionComparison({
    reviewId: "review_decision_comparison_repeat",
    dependencies: first.dependencies,
  });
  const secondResult = await runAppointmentReviewDecisionComparison({
    reviewId: "review_decision_comparison_repeat",
    dependencies: second.dependencies,
  });

  assert.deepEqual(firstResult, secondResult);
  assert.notEqual(first.dependencies, second.dependencies);
  assert.equal(first.calls.review.length, 1);
  assert.equal(second.calls.review.length, 1);
});

test("decision comparison safely fails shared trusted context failures before branches", async () => {
  const { dependencies, calls } = createDependencies({
    reviewThrows: "appointment_review_snapshot_not_found",
  });
  const result = await runAppointmentReviewDecisionComparison({
    reviewId: "review_decision_comparison_missing",
    dependencies,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "review_not_found");
  assert.equal(result.paths, null);
  assert.equal(calls.review.length, 1);
  assert.equal(calls.actor.length, 0);
  assert.equal(calls.idempotency.length, 0);
  assertComparisonSafety(result);
});

test("decision comparison fails the whole request for unexpected branch infrastructure failure", async () => {
  const { dependencies } = createDependencies();
  const result = await runAppointmentReviewDecisionComparison(
    {
      reviewId: "review_decision_comparison_branch_failure",
      dependencies,
    },
    {
      transitionState() {
        throw new Error("SYNTHETIC_BRANCH_FAILURE");
      },
    }
  );
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, false);
  assert.equal(result.code, "decision_comparison_branch_failed");
  assert.equal(result.paths, null);
  assert.doesNotMatch(serialized, /SYNTHETIC_BRANCH_FAILURE|Error:|stack|at /);
  assertComparisonSafety(result);
});

test("decision comparison source has no route network persistence or recommendation side effects", () => {
  const source = fs.readFileSync(
    "src/api/secretaryAppointmentReviewDecisionComparisonOrchestrator.js",
    "utf8"
  );
  const forbidden = [
    "fe" + "tch",
    "app/api",
    "recommended" + "Action",
    "best" + "Action",
    "preferred" + "Action",
    "automatic" + "Decision",
    "selected" + "Action",
    "create" + "Appointment",
    "create" + "CalendarEvent",
    "google" + "apis",
    "pri" + "sma",
    "supa" + "base",
    "re" + "dis",
    "process" + "\\." + "env",
    "Async" + "LocalStorage",
    "global" + "This",
    "new " + "Map\\(",
  ];

  assert.match(source, /evaluateAppointmentReviewDecisionPreview/);
  assert.match(source, /DECISION_COMPARISON_ACTIONS/);

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
});
