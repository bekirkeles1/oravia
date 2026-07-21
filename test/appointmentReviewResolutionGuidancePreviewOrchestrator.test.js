const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  runAppointmentReviewResolutionGuidancePreview,
} = require("../src/api/secretaryAppointmentReviewResolutionGuidancePreviewOrchestrator");
const {
  validateAppointmentReviewActionPreconditions,
} = require("../src/secretary/appointmentReviewActionPreconditionsContract");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

function createRuntime(options = {}) {
  const base = createMockAppointmentReviewControlledActionDependencies();
  const calls = {
    dependencies: 0,
    review: 0,
    actor: 0,
    idempotency: 0,
    policy: 0,
  };
  const dependencies = Object.freeze({
    resolveAppointmentReviewContext(input) {
      calls.review += 1;

      if (options.reviewNotFound) {
        throw Object.freeze({
          code: "appointment_review_snapshot_not_found",
          reason: "Synthetic not found.",
        });
      }

      return Object.freeze({
        contextType: "appointment_review_snapshot_context_v1",
        contextSource: "server_review_boundary",
        reviewId: input.reviewId,
        currentState:
          options.currentState || "validation_only_intent_checked",
        observedReviewVersion: options.observedReviewVersion || 4,
      });
    },
    resolveVerifiedActorContext(input) {
      calls.actor += 1;
      return base.resolveVerifiedActorContext(input);
    },
    resolveIdempotencyContext(input) {
      calls.idempotency += 1;
      return base.resolveIdempotencyContext(input);
    },
    resolveExecutionPolicyContext(input) {
      calls.policy += 1;
      return base.resolveExecutionPolicyContext(input);
    },
  });
  const adapter = Object.freeze({
    getControlledActionDependencies() {
      calls.dependencies += 1;

      if (options.dependenciesThrow) {
        throw new Error("Synthetic dependency failure.");
      }

      return dependencies;
    },
  });

  return { adapter, calls };
}

function assertPreviewSafety(result) {
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

test("resolution guidance preview runs decision comparison once through route runtime adapter", async () => {
  const { adapter, calls } = createRuntime({ observedReviewVersion: 10 });
  const result = await runAppointmentReviewResolutionGuidancePreview({
    reviewId: "review_resolution_guidance_preview",
    routeRuntimeAdapter: adapter,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.mode, "validation_only");
  assert.equal(result.preview, "resolution_guidance_preview");
  assert.equal(result.reviewId, "review_resolution_guidance_preview");
  assert.equal(result.trustedCurrentState, "validation_only_intent_checked");
  assert.equal(result.observedReviewVersion, 10);
  assert.equal(result.readiness, "both_paths_available");
  assert.equal(result.approve.branchOutcome, "passed");
  assert.equal(result.reject.branchOutcome, "passed");
  assert.equal(typeof result.internalFollowUpSummary, "string");
  assert.equal(calls.dependencies, 1);
  assert.equal(calls.review, 1);
  assert.equal(calls.actor, 4);
  assert.equal(calls.idempotency, 2);
  assert.equal(calls.policy, 2);
  assertPreviewSafety(result);
});

test("resolution guidance preview returns guidance for safe domain blocks", async () => {
  const { adapter } = createRuntime();
  const result = await runAppointmentReviewResolutionGuidancePreview(
    {
      reviewId: "review_resolution_guidance_domain_block",
      routeRuntimeAdapter: adapter,
    },
    {
      comparisonContracts: {
        validatePreconditions(input) {
          if (input.actionIntent === "reject_intent") {
            return Object.freeze({
              accepted: false,
              eligibleForControlledHandling: false,
              code: "unsupported_current_state",
              reason: "Synthetic safe state block.",
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
      },
    }
  );

  assert.equal(result.accepted, true);
  assert.equal(result.readiness, "approve_path_only");
  assert.equal(result.reject.category, "review_state_check_required");
  assert.equal(result.reject.requiredCheck, "trusted_review_state");
  assertPreviewSafety(result);
});

test("resolution guidance preview does not convert infrastructure failures into guidance", async () => {
  const { adapter } = createRuntime();
  const result = await runAppointmentReviewResolutionGuidancePreview(
    {
      reviewId: "review_resolution_guidance_infra",
      routeRuntimeAdapter: adapter,
    },
    {
      comparisonContracts: {
        validatePreconditions() {
          throw new Error("Synthetic comparison branch failure.");
        },
      },
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.code, "resolution_guidance_comparison_rejected");
  assert.equal(result.approve, null);
  assert.equal(result.reject, null);
  assert.equal(result.internalFollowUpSummary, null);
  assertPreviewSafety(result);
});

test("resolution guidance preview handles not found, dependency, mapper, and malformed inputs safely", async () => {
  const missing = createRuntime({ reviewNotFound: true });
  const missingResult = await runAppointmentReviewResolutionGuidancePreview({
    reviewId: "review_missing",
    routeRuntimeAdapter: missing.adapter,
  });
  const dependencyFailure = createRuntime({ dependenciesThrow: true });
  const dependencyResult = await runAppointmentReviewResolutionGuidancePreview({
    reviewId: "review_dependency_failure",
    routeRuntimeAdapter: dependencyFailure.adapter,
  });
  const malformed = await runAppointmentReviewResolutionGuidancePreview(null);
  const mapperFailureRuntime = createRuntime();
  const mapperFailure = await runAppointmentReviewResolutionGuidancePreview(
    {
      reviewId: "review_mapper_failure",
      routeRuntimeAdapter: mapperFailureRuntime.adapter,
    },
    {
      createResolutionGuidance() {
        throw new Error("Synthetic mapper failure.");
      },
    }
  );

  assert.equal(missingResult.code, "review_not_found");
  assert.equal(dependencyResult.code, "controlled_action_dependencies_failed");
  assert.equal(malformed.code, "invalid_resolution_guidance_preview_input");
  assert.equal(mapperFailure.code, "resolution_guidance_mapper_failed");
  assert.equal(missingResult.approve, null);
  assert.equal(dependencyResult.internalFollowUpSummary, null);
  assertPreviewSafety(missingResult);
  assertPreviewSafety(dependencyResult);
  assertPreviewSafety(malformed);
  assertPreviewSafety(mapperFailure);
});

test("resolution guidance preview is deterministic and does not mutate input", async () => {
  const { adapter } = createRuntime();
  const input = {
    reviewId: "review_resolution_guidance_deterministic",
    routeRuntimeAdapter: adapter,
    currentState: "client_injected_state",
  };
  const before = JSON.stringify({
    reviewId: input.reviewId,
    currentState: input.currentState,
  });
  const first = await runAppointmentReviewResolutionGuidancePreview(input);
  const second = await runAppointmentReviewResolutionGuidancePreview(input);

  assert.equal(
    JSON.stringify({
      reviewId: input.reviewId,
      currentState: input.currentState,
    }),
    before
  );
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assertPreviewSafety(first);
});

test("resolution guidance preview orchestrator source has no route, network, or persistence access", () => {
  const source = fs.readFileSync(
    "src/api/secretaryAppointmentReviewResolutionGuidancePreviewOrchestrator.js",
    "utf8"
  );

  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /Response\.json/);
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
