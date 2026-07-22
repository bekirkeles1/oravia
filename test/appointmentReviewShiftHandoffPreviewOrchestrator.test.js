const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  formatAppointmentReviewShiftHandoffBrief,
  runAppointmentReviewShiftHandoffPreview,
} = require("../src/api/secretaryAppointmentReviewShiftHandoffPreviewOrchestrator");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

function createReview(id, controlledActionState = "validation_only_intent_checked") {
  return Object.freeze({
    id,
    patientName: "SYNTHETIC_SENSITIVE_NAME_PLACEHOLDER",
    patientPhone: "SYNTHETIC_PHONE_PLACEHOLDER",
    patientEmail: "SYNTHETIC_EMAIL_PLACEHOLDER",
    rawMessage: "Synthetic free-form medical message",
    status: "pending_secretary_review",
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
    metadata: Object.freeze({
      controlledActionState,
    }),
  });
}

function createAdapterHarness({ reviews = [], contexts = {}, fail = {} } = {}) {
  const base = createMockAppointmentReviewControlledActionDependencies();
  const calls = {
    list: 0,
    dependencies: 0,
    reviewContext: [],
    actor: [],
    idempotency: [],
    policy: [],
  };
  const dependencies = Object.freeze({
    resolveAppointmentReviewContext(input) {
      calls.reviewContext.push(input);

      if (fail.context) {
        throw new Error("SYNTHETIC_CONTEXT_FAILURE");
      }

      const review = reviews.find((item) => item.id === input.reviewId);

      if (!review) {
        throw Object.freeze({
          code: "appointment_review_snapshot_not_found",
          reason: "Synthetic not found.",
        });
      }

      const context = contexts[input.reviewId] || {};

      return Object.freeze({
        contextType: "appointment_review_snapshot_context_v1",
        contextSource: "server_review_boundary",
        reviewId: input.reviewId,
        currentState:
          context.currentState ||
          review.metadata?.controlledActionState ||
          "validation_only_intent_checked",
        observedReviewVersion: context.observedReviewVersion || 1,
      });
    },
    resolveVerifiedActorContext(input) {
      calls.actor.push(input);
      return base.resolveVerifiedActorContext(input);
    },
    resolveIdempotencyContext(input) {
      calls.idempotency.push(input);
      return base.resolveIdempotencyContext(input);
    },
    resolveExecutionPolicyContext(input) {
      calls.policy.push(input);
      return base.resolveExecutionPolicyContext(input);
    },
  });
  const adapter = Object.freeze({
    listAppointmentReviews() {
      calls.list += 1;

      if (fail.list) {
        throw new Error("SYNTHETIC_LIST_FAILURE");
      }

      return reviews;
    },
    getControlledActionDependencies() {
      calls.dependencies += 1;

      if (fail.dependencies) {
        throw new Error("SYNTHETIC_DEPENDENCIES_FAILURE");
      }

      return dependencies;
    },
  });

  return {
    adapter,
    calls,
    reviews,
  };
}

function assertSafety(result) {
  assert.equal(result.mock, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.shiftHandoffPreview, true);
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
  assert.equal(result.queueMutated, false);
  assert.equal(result.queueCountChanged, false);
  assert.equal(result.handoffPersisted, false);
  assert.equal(result.handoffSent, false);
}

test("shift handoff preview uses one adapter scope and server queue order", async () => {
  const harness = createAdapterHarness({
    reviews: [
      createReview("review_handoff_a"),
      createReview("review_handoff_b", "pending_secretary_review"),
      createReview("review_handoff_c"),
    ],
    contexts: {
      review_handoff_a: { observedReviewVersion: 3 },
      review_handoff_b: { observedReviewVersion: 4 },
      review_handoff_c: { observedReviewVersion: 5 },
    },
  });
  const result = await runAppointmentReviewShiftHandoffPreview({
    routeRuntimeAdapter: harness.adapter,
    reviewIds: ["client_cannot_control_handoff"],
  });

  assert.equal(result.accepted, true);
  assert.equal(result.preview, "secretary_shift_handoff_preview");
  assert.equal(harness.calls.list, 1);
  assert.equal(harness.calls.dependencies, 1);
  assert.equal(harness.calls.reviewContext.length, 3);
  assert.deepEqual(
    result.items.map((item) => item.reviewId),
    ["review_handoff_a", "review_handoff_b", "review_handoff_c"]
  );
  assert.deepEqual(
    result.items.map((item) => item.observedReviewVersion),
    [3, 4, 5]
  );
  assert.equal(result.items[1].readiness, "both_paths_blocked");
  assert.deepEqual(result.items[1].unresolvedChecks, ["trusted_review_state"]);
  assert.deepEqual(result.items[1].followUpCategories, ["internal_state_review"]);
  assert.match(result.plainTextBrief, /Review: review_handoff_b/);
  assert.match(result.plainTextBrief, /Required check: trusted_review_state/);
  assertSafety(result);
  result.items.forEach(assertSafety);
});

test("shift handoff projection excludes sensitive and executable data", async () => {
  const harness = createAdapterHarness({
    reviews: [createReview("review_safe_projection")],
  });
  const result = await runAppointmentReviewShiftHandoffPreview({
    routeRuntimeAdapter: harness.adapter,
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, true);
  assert.doesNotMatch(serialized, /SYNTHETIC_SENSITIVE_NAME_PLACEHOLDER/);
  assert.doesNotMatch(serialized, /SYNTHETIC_PHONE_PLACEHOLDER/);
  assert.doesNotMatch(serialized, /SYNTHETIC_EMAIL_PLACEHOLDER/);
  assert.doesNotMatch(serialized, /free-form medical message/);
  assert.doesNotMatch(serialized, /Sensitive Name|patientPhone|patientEmail|rawMessage/);
  assert.doesNotMatch(serialized, /function/);
});

test("shift handoff formatter is deterministic and summary agrees with text", async () => {
  const harness = createAdapterHarness({
    reviews: [
      createReview("review_formatter_a"),
      createReview("review_formatter_b", "pending_secretary_review"),
    ],
  });
  const result = await runAppointmentReviewShiftHandoffPreview({
    routeRuntimeAdapter: harness.adapter,
  });
  const first = formatAppointmentReviewShiftHandoffBrief(result);
  const second = formatAppointmentReviewShiftHandoffBrief(result);

  assert.equal(first, second);
  assert.equal(first, result.plainTextBrief);
  assert.ok(first.indexOf("Review: review_formatter_a") < first.indexOf("Review: review_formatter_b"));
  assert.ok(first.indexOf("Approve path:") < first.indexOf("Reject path:"));
  assert.match(first, /- Total reviews: 2/);
  assert.match(first, /- Both paths blocked: 1/);
  assert.doesNotMatch(first, /\d{4}-\d{2}-\d{2}|[0-9a-f]{8}-[0-9a-f]{4}/i);
  assert.doesNotMatch(first, /\[object Object\]|recommended|preferred|should approve|should reject/i);
});

test("shift handoff returns safe empty queue brief without guidance work", async () => {
  const harness = createAdapterHarness({ reviews: [] });
  let guidanceCalls = 0;
  const result = await runAppointmentReviewShiftHandoffPreview(
    {
      routeRuntimeAdapter: harness.adapter,
    },
    {
      createResolutionGuidance() {
        guidanceCalls += 1;
        throw new Error("SHOULD_NOT_RUN");
      },
    }
  );

  assert.equal(result.accepted, true);
  assert.equal(guidanceCalls, 0);
  assert.equal(harness.calls.list, 1);
  assert.equal(harness.calls.dependencies, 0);
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.summary, {
    totalReviews: 0,
    bothPathsAvailable: 0,
    approvePathOnly: 0,
    rejectPathOnly: 0,
    bothPathsBlocked: 0,
    requiresFollowUp: 0,
    noCurrentValidationBlocker: 0,
  });
  assert.match(result.plainTextBrief, /No appointment reviews are currently in the queue/);
  assertSafety(result);
});

test("shift handoff is non-mutating and repeatable", async () => {
  const reviews = [createReview("review_repeatable")];
  const harness = createAdapterHarness({ reviews });
  const before = JSON.stringify(reviews);
  const first = await runAppointmentReviewShiftHandoffPreview({
    routeRuntimeAdapter: harness.adapter,
  });
  const second = await runAppointmentReviewShiftHandoffPreview({
    routeRuntimeAdapter: harness.adapter,
  });

  assert.equal(JSON.stringify(reviews), before);
  assert.deepEqual(first, second);
  assert.equal(harness.calls.list, 2);
  assert.equal(harness.calls.dependencies, 2);
  assert.equal(first.queueUnchanged, true);
});

test("shift handoff contains infrastructure failures without partial brief", async () => {
  const missingAdapter = await runAppointmentReviewShiftHandoffPreview({});
  const listFailure = await runAppointmentReviewShiftHandoffPreview({
    routeRuntimeAdapter: createAdapterHarness({
      reviews: [createReview("review_failure")],
      fail: { list: true },
    }).adapter,
  });
  const guidanceFailure = await runAppointmentReviewShiftHandoffPreview(
    {
      routeRuntimeAdapter: createAdapterHarness({
        reviews: [createReview("review_guidance_failure")],
      }).adapter,
    },
    {
      createResolutionGuidance() {
        throw new Error("RAW_GUIDANCE_MARKER");
      },
    }
  );
  const formatterFailure = await runAppointmentReviewShiftHandoffPreview(
    {
      routeRuntimeAdapter: createAdapterHarness({
        reviews: [createReview("review_formatter_failure")],
      }).adapter,
    },
    {
      formatBrief() {
        throw new Error("RAW_FORMATTER_MARKER");
      },
    }
  );

  for (const result of [
    missingAdapter,
    listFailure,
    guidanceFailure,
    formatterFailure,
  ]) {
    assert.equal(result.accepted, false);
    assert.equal(result.items, null);
    assert.equal(result.plainTextBrief, null);
    assert.doesNotMatch(JSON.stringify(result), /RAW_|stack|SYNTHETIC/);
    assertSafety(result);
  }
});

test("shift handoff source has no side-effect integrations or duplicated guidance table", () => {
  const source = fs.readFileSync(
    "src/api/secretaryAppointmentReviewShiftHandoffPreviewOrchestrator.js",
    "utf8"
  );

  assert.match(source, /runAppointmentReviewQueueReadinessPreview/);
  assert.match(source, /buildAppointmentReviewResolutionGuidance/);
  assert.doesNotMatch(
    source,
    new RegExp(["fetch\\(", "localStorage", "sessionStorage", ["process", "env"].join("\\.")].join("|"))
  );
  assert.doesNotMatch(source, /createAppointment|createCalendarEvent|googleapis|prisma|supabase|redis/);
  assert.doesNotMatch(source, /recommendedAction|preferredAction|bestAction|assignedTo/);
});
