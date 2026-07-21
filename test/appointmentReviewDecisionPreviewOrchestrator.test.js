const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  runAppointmentReviewDecisionPreview,
} = require("../src/api/secretaryAppointmentReviewDecisionPreviewOrchestrator");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

function createDependencies(options = {}) {
  const base = createMockAppointmentReviewControlledActionDependencies();
  const calls = {
    actor: 0,
    review: 0,
    idempotency: 0,
    policy: 0,
  };
  const reviewContexts = options.reviewContexts || [
    {
      reviewId: options.reviewId || "review_decision_preview",
      currentState: options.currentState || "validation_only_intent_checked",
      observedReviewVersion: options.observedReviewVersion || 1,
    },
  ];

  return {
    calls,
    dependencies: Object.freeze({
      resolveVerifiedActorContext(input) {
        calls.actor += 1;
        return base.resolveVerifiedActorContext(input);
      },
      resolveAppointmentReviewContext(input) {
        calls.review += 1;

        if (options.reviewThrows) {
          throw Object.freeze({
            code: options.reviewThrows,
            reason: "Synthetic review context failure.",
          });
        }

        const context =
          reviewContexts[
            Math.min(calls.review - 1, reviewContexts.length - 1)
          ];

        if (context === null) {
          throw Object.freeze({
            code: "appointment_review_snapshot_not_found",
            reason: "Synthetic not found.",
          });
        }

        return Object.freeze({
          contextType: "appointment_review_snapshot_context_v1",
          contextSource: "server_review_boundary",
          ...context,
          reviewId: input.reviewId,
        });
      },
      resolveIdempotencyContext(input) {
        calls.idempotency += 1;
        return base.resolveIdempotencyContext(input);
      },
      resolveExecutionPolicyContext(input) {
        calls.policy += 1;
        return base.resolveExecutionPolicyContext(input);
      },
    }),
  };
}

function assertSafety(result) {
  assert.equal(result.dryRun, true);
  assert.equal(result.decisionPreview, true);
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
  assert.equal(result.reviewStateChanged, false);
  assert.equal(result.repositoryVersionChanged, false);
}

test("decision preview orchestrator runs successful approve preview end to end", async () => {
  const { dependencies, calls } = createDependencies({
    reviewId: "review_decision_approve",
    observedReviewVersion: 5,
  });
  const result = await runAppointmentReviewDecisionPreview({
    reviewId: "review_decision_approve",
    action: "approve",
    dependencies,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.previewPassed, true);
  assert.equal(result.actionIntent, "approve_intent");
  assert.equal(result.trustedCurrentState, "validation_only_intent_checked");
  assert.equal(result.observedReviewVersion, 5);
  assert.equal(result.projectedNextState, "needs_clinic_review");
  assert.equal(result.actionIntentResult.status, "ok");
  assert.equal(result.preconditionsResult.accepted, true);
  assert.equal(result.stateTransitionResult.accepted, true);
  assert.equal(result.validationResult.accepted, true);
  assert.equal(result.validationReceipt.outcome, "validation_passed");
  assert.equal(calls.review, 3);
  assert.equal(calls.actor, 2);
  assert.equal(calls.idempotency, 1);
  assert.equal(calls.policy, 1);
  assertSafety(result);
});

test("decision preview orchestrator runs successful reject preview end to end", async () => {
  const { dependencies } = createDependencies({
    reviewId: "review_decision_reject",
  });
  const result = await runAppointmentReviewDecisionPreview({
    reviewId: "review_decision_reject",
    action: "reject",
    dependencies,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.actionIntent, "reject_intent");
  assert.equal(result.stateTransitionResult.event, "reject_action_intent");
  assert.equal(result.projectedNextState, "action_intent_rejected");
  assert.equal(result.validationReceipt.outcome, "validation_passed");
  assertSafety(result);
});

test("decision preview orchestrator blocks unsupported action before dependencies", async () => {
  const { dependencies, calls } = createDependencies();
  const result = await runAppointmentReviewDecisionPreview({
    reviewId: "review_decision_bad_action",
    action: "book",
    dependencies,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.blockingStage, "action_intent");
  assert.equal(result.code, "unsupported_decision_action");
  assert.equal(result.stateTransitionResult, undefined);
  assert.equal(result.validationReceipt, null);
  assert.equal(calls.review, 0);
  assert.equal(calls.actor, 0);
  assertSafety(result);
});

test("decision preview orchestrator stops at preconditions", async () => {
  const { dependencies, calls } = createDependencies({
    currentState: "pending_secretary_review",
  });
  let transitionCalls = 0;
  const result = await runAppointmentReviewDecisionPreview(
    {
      reviewId: "review_decision_preconditions_block",
      action: "approve",
      dependencies,
    },
    {
      transitionState() {
        transitionCalls += 1;
        throw new Error("transition must not run");
      },
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.blockingStage, "preconditions");
  assert.equal(result.code, "unsupported_current_state");
  assert.equal(transitionCalls, 0);
  assert.equal(calls.idempotency, 0);
  assert.equal(calls.policy, 0);
  assert.equal(result.validationReceipt, null);
  assertSafety(result);
});

test("decision preview orchestrator stops at state transition", async () => {
  const { dependencies, calls } = createDependencies();
  let validationCalls = 0;
  const result = await runAppointmentReviewDecisionPreview(
    {
      reviewId: "review_decision_transition_block",
      action: "approve",
      dependencies,
    },
    {
      transitionState() {
        return Object.freeze({
          accepted: false,
          currentState: "validation_only_intent_checked",
          event: "require_clinic_review",
          nextState: "validation_only_intent_checked",
          code: "invalid_transition",
          reason: "Synthetic transition block.",
          validationOnly: true,
          executionAvailable: false,
          actionPerformed: false,
          bookingCreated: false,
          calendarChecked: false,
          appointmentCreated: false,
          calendarEventCreated: false,
          databasePersisted: false,
          persistence: "not_persisted",
        });
      },
      runValidationHandler() {
        validationCalls += 1;
      },
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.blockingStage, "state_transition");
  assert.equal(result.code, "invalid_transition");
  assert.equal(validationCalls, 0);
  assert.equal(calls.idempotency, 0);
  assert.equal(calls.policy, 0);
  assertSafety(result);
});

test("decision preview orchestrator stops at validation without receipt", async () => {
  const { dependencies } = createDependencies();
  let receiptCalls = 0;
  const result = await runAppointmentReviewDecisionPreview(
    {
      reviewId: "review_decision_validation_block",
      action: "approve",
      dependencies,
    },
    {
      async runValidationHandler() {
        return Object.freeze({
          accepted: false,
          handlerCompleted: false,
          failedStage: "validation_pipeline",
          code: "validation_pipeline_rejected",
          reason: "Synthetic validation block.",
          handlerChecked: true,
          matchingReplay: false,
          replayExistingResultOnly: false,
          eligibleForExecutorBoundary: false,
          validationOnly: true,
          controlledHandlingOnly: true,
          executionEnabled: false,
          executorAvailable: false,
          executionAvailable: false,
          executionRequested: false,
          actionPerformed: false,
          commandDispatched: false,
          commandPersisted: false,
          bookingCreated: false,
          calendarChecked: false,
          appointmentCreated: false,
          calendarEventCreated: false,
          databasePersisted: false,
          persistence: "not_persisted",
        });
      },
      constructValidationReceipt() {
        receiptCalls += 1;
      },
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.blockingStage, "controlled_action_validation");
  assert.equal(result.code, "validation_pipeline_rejected");
  assert.equal(receiptCalls, 0);
  assert.equal(result.validationReceipt, null);
  assertSafety(result);
});

test("decision preview orchestrator trusts server context over client-shaped input", async () => {
  const { dependencies } = createDependencies({
    reviewId: "review_decision_trusted",
    observedReviewVersion: 9,
  });
  const result = await runAppointmentReviewDecisionPreview({
    reviewId: "review_decision_trusted",
    action: "approve",
    currentState: "needs_clinic_review",
    observedReviewVersion: 999,
    dependencies,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.trustedCurrentState, "validation_only_intent_checked");
  assert.equal(result.observedReviewVersion, 9);
  assert.equal(JSON.stringify(result).includes("999"), false);
  assertSafety(result);
});

test("decision preview orchestrator detects post-preview state or version mutation", async () => {
  const { dependencies } = createDependencies({
    reviewContexts: [
      {
        reviewId: "review_decision_mutation",
        currentState: "validation_only_intent_checked",
        observedReviewVersion: 2,
      },
      {
        reviewId: "review_decision_mutation",
        currentState: "validation_only_intent_checked",
        observedReviewVersion: 2,
      },
      {
        reviewId: "review_decision_mutation",
        currentState: "needs_clinic_review",
        observedReviewVersion: 3,
      },
    ],
  });
  const result = await runAppointmentReviewDecisionPreview({
    reviewId: "review_decision_mutation",
    action: "approve",
    dependencies,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "review_context_changed_after_preview");
  assert.equal(result.reviewStateChanged, false);
  assert.equal(result.repositoryVersionChanged, false);
  assertSafety(result);
});

test("decision preview orchestrator safely contains unexpected stage failures", async () => {
  const { dependencies } = createDependencies();
  const result = await runAppointmentReviewDecisionPreview(
    {
      reviewId: "review_decision_stage_failure",
      action: "approve",
      dependencies,
    },
    {
      async runValidationHandler() {
        throw new Error("DECISION_PREVIEW_STAGE_INTERNAL");
      },
    }
  );
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, false);
  assert.equal(result.blockingStage, "controlled_action_validation");
  assert.equal(result.code, "controlled_action_validation_failed");
  assert.doesNotMatch(serialized, /DECISION_PREVIEW_STAGE_INTERNAL|Error:|stack|at /);
  assertSafety(result);
});

test("decision preview orchestrator source has no route network or persistence side effects", () => {
  const source = fs.readFileSync(
    "src/api/secretaryAppointmentReviewDecisionPreviewOrchestrator.js",
    "utf8"
  );
  const forbidden = [
    "fe" + "tch",
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

  assert.match(source, /validateAppointmentReviewActionIntent/);
  assert.match(source, /validateAppointmentReviewActionPreconditions/);
  assert.match(source, /transitionAppointmentReviewActionIntentState/);
  assert.match(source, /handleAppointmentReviewControlledActionValidation/);
  assert.match(source, /constructAppointmentReviewValidationDecisionReceipt/);
  assert.doesNotMatch(source, /app\/api/);

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
});
