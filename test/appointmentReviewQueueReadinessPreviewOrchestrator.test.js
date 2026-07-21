const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  QUEUE_READINESS_CLASSIFICATIONS,
  runAppointmentReviewQueueReadinessPreview,
} = require("../src/api/secretaryAppointmentReviewQueueReadinessPreviewOrchestrator");
const {
  validateAppointmentReviewActionPreconditions,
} = require("../src/secretary/appointmentReviewActionPreconditionsContract");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

function createReview(id, controlledActionState = "validation_only_intent_checked") {
  return Object.freeze({
    id,
    status: "pending_secretary_review",
    selectedSlot: Object.freeze({
      id: `${id}_slot`,
      source: "mock",
    }),
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
  assert.equal(result.queueReadinessPreview, true);
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
  assert.equal(result.queueMutated, false);
  assert.equal(result.queueCountChanged, false);
}

function assertSummaryCounts(result) {
  const counted = {
    bothPathsAvailable: 0,
    approvePathOnly: 0,
    rejectPathOnly: 0,
    bothPathsBlocked: 0,
  };

  for (const item of result.items) {
    if (item.readiness === QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_AVAILABLE) {
      counted.bothPathsAvailable += 1;
    }

    if (item.readiness === QUEUE_READINESS_CLASSIFICATIONS.APPROVE_PATH_ONLY) {
      counted.approvePathOnly += 1;
    }

    if (item.readiness === QUEUE_READINESS_CLASSIFICATIONS.REJECT_PATH_ONLY) {
      counted.rejectPathOnly += 1;
    }

    if (item.readiness === QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_BLOCKED) {
      counted.bothPathsBlocked += 1;
    }
  }

  assert.equal(result.summary.totalReviewsScanned, result.items.length);
  assert.deepEqual(
    {
      bothPathsAvailable: result.summary.bothPathsAvailable,
      approvePathOnly: result.summary.approvePathOnly,
      rejectPathOnly: result.summary.rejectPathOnly,
      bothPathsBlocked: result.summary.bothPathsBlocked,
    },
    counted
  );
  assert.equal(
    counted.bothPathsAvailable +
      counted.approvePathOnly +
      counted.rejectPathOnly +
      counted.bothPathsBlocked,
    result.summary.totalReviewsScanned
  );
}

test("queue readiness preview scans every queued review through one adapter scope", async () => {
  const harness = createAdapterHarness({
    reviews: [
      createReview("review_queue_a"),
      createReview("review_queue_b"),
      createReview("review_queue_c"),
    ],
    contexts: {
      review_queue_a: { observedReviewVersion: 3 },
      review_queue_b: { observedReviewVersion: 4 },
      review_queue_c: { observedReviewVersion: 5 },
    },
  });
  const result = await runAppointmentReviewQueueReadinessPreview({
    routeRuntimeAdapter: harness.adapter,
    reviewIds: ["client_should_not_control_membership"],
  });

  assert.equal(result.accepted, true);
  assert.equal(harness.calls.list, 1);
  assert.equal(harness.calls.dependencies, 1);
  assert.deepEqual(
    result.items.map((item) => item.reviewId),
    ["review_queue_a", "review_queue_b", "review_queue_c"]
  );
  assert.deepEqual(
    result.items.map((item) => item.observedReviewVersion),
    [3, 4, 5]
  );
  assert.equal(harness.calls.reviewContext.length, 3);
  assert.equal(harness.calls.actor.length, 12);
  assert.equal(harness.calls.idempotency.length, 6);
  assert.equal(harness.calls.policy.length, 6);
  assert.ok(result.items.every((item) => item.approve.outcome === "passed"));
  assert.ok(result.items.every((item) => item.reject.outcome === "passed"));
  result.items.forEach(assertSafety);
  assertSafety(result);
  assertSummaryCounts(result);
});

test("queue readiness preview derives all neutral classifications from branch outcomes", async () => {
  const harness = createAdapterHarness({
    reviews: [
      createReview("review_both_paths_available"),
      createReview("review_approve_path_only"),
      createReview("review_reject_path_only"),
      createReview("review_both_paths_blocked", "pending_secretary_review"),
    ],
  });
  const result = await runAppointmentReviewQueueReadinessPreview(
    {
      routeRuntimeAdapter: harness.adapter,
    },
    {
      validatePreconditions(input) {
        if (
          input.reviewId === "review_approve_path_only" &&
          input.actionIntent === "reject_intent"
        ) {
          return blockPreconditions(input, "synthetic_reject_branch_blocked");
        }

        if (
          input.reviewId === "review_reject_path_only" &&
          input.actionIntent === "approve_intent"
        ) {
          return blockPreconditions(input, "synthetic_approve_branch_blocked");
        }

        return validateAppointmentReviewActionPreconditions(input);
      },
    }
  );

  assert.equal(result.accepted, true);
  assert.deepEqual(
    result.items.map((item) => item.readiness),
    [
      QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_AVAILABLE,
      QUEUE_READINESS_CLASSIFICATIONS.APPROVE_PATH_ONLY,
      QUEUE_READINESS_CLASSIFICATIONS.REJECT_PATH_ONLY,
      QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_BLOCKED,
    ]
  );
  assert.equal(result.items[1].approve.outcome, "passed");
  assert.equal(result.items[1].reject.outcome, "blocked");
  assert.equal(result.items[2].approve.outcome, "blocked");
  assert.equal(result.items[2].reject.outcome, "passed");
  assert.equal(result.items[3].approve.outcome, "blocked");
  assert.equal(result.items[3].reject.outcome, "blocked");
  assertSummaryCounts(result);
});

test("queue readiness preview keeps scanning later reviews after domain blocks", async () => {
  const harness = createAdapterHarness({
    reviews: [
      createReview("review_domain_block", "pending_secretary_review"),
      createReview("review_after_domain_block"),
    ],
  });
  const result = await runAppointmentReviewQueueReadinessPreview({
    routeRuntimeAdapter: harness.adapter,
  });

  assert.equal(result.accepted, true);
  assert.deepEqual(
    result.items.map((item) => item.reviewId),
    ["review_domain_block", "review_after_domain_block"]
  );
  assert.equal(
    result.items[0].readiness,
    QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_BLOCKED
  );
  assert.equal(
    result.items[1].readiness,
    QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_AVAILABLE
  );
  assert.equal(harness.calls.reviewContext.length, 2);
  assert.equal(result.code, "queue_readiness_preview_completed");
});

test("queue readiness preview returns safe empty queue success", async () => {
  const harness = createAdapterHarness({ reviews: [] });
  const result = await runAppointmentReviewQueueReadinessPreview({
    routeRuntimeAdapter: harness.adapter,
  });

  assert.equal(result.accepted, true);
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.summary, {
    totalReviewsScanned: 0,
    bothPathsAvailable: 0,
    approvePathOnly: 0,
    rejectPathOnly: 0,
    bothPathsBlocked: 0,
  });
  assert.equal(harness.calls.list, 1);
  assert.equal(harness.calls.dependencies, 0);
  assert.equal(harness.calls.reviewContext.length, 0);
  assertSafety(result);
});

test("queue readiness preview stops safely on infrastructure failures without partial results", async () => {
  const listFailure = await runAppointmentReviewQueueReadinessPreview({
    routeRuntimeAdapter: createAdapterHarness({
      reviews: [createReview("review_list_failure")],
      fail: { list: true },
    }).adapter,
  });
  const dependencyFailure = await runAppointmentReviewQueueReadinessPreview({
    routeRuntimeAdapter: createAdapterHarness({
      reviews: [createReview("review_dependency_failure")],
      fail: { dependencies: true },
    }).adapter,
  });
  const contextFailure = await runAppointmentReviewQueueReadinessPreview({
    routeRuntimeAdapter: createAdapterHarness({
      reviews: [createReview("review_context_failure")],
      fail: { context: true },
    }).adapter,
  });
  const branchFailure = await runAppointmentReviewQueueReadinessPreview(
    {
      routeRuntimeAdapter: createAdapterHarness({
        reviews: [createReview("review_branch_failure")],
      }).adapter,
    },
    {
      transitionState() {
        throw new Error("SYNTHETIC_BRANCH_FAILURE");
      },
    }
  );
  const serialized = JSON.stringify({
    listFailure,
    dependencyFailure,
    contextFailure,
    branchFailure,
  });

  assert.equal(listFailure.accepted, false);
  assert.equal(listFailure.items, null);
  assert.equal(dependencyFailure.accepted, false);
  assert.equal(dependencyFailure.items, null);
  assert.equal(contextFailure.accepted, false);
  assert.equal(contextFailure.items, null);
  assert.equal(branchFailure.accepted, false);
  assert.equal(branchFailure.code, "queue_readiness_comparison_failed");
  assert.equal(branchFailure.items, null);
  assert.doesNotMatch(
    serialized,
    /SYNTHETIC_|Error:|stack|at |routeRuntimeAdapter/
  );
  [
    listFailure,
    dependencyFailure,
    contextFailure,
    branchFailure,
  ].forEach(assertSafety);
});

test("queue readiness preview is deterministic and non-mutating", async () => {
  const reviews = [
    createReview("review_repeat_a"),
    createReview("review_repeat_b"),
  ];
  const before = JSON.stringify(reviews);
  const firstHarness = createAdapterHarness({ reviews });
  const secondHarness = createAdapterHarness({ reviews });
  const first = await runAppointmentReviewQueueReadinessPreview({
    routeRuntimeAdapter: firstHarness.adapter,
  });
  const second = await runAppointmentReviewQueueReadinessPreview({
    routeRuntimeAdapter: secondHarness.adapter,
  });

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(reviews), before);
  assert.notEqual(firstHarness.adapter, secondHarness.adapter);
  assert.equal(firstHarness.calls.list, 1);
  assert.equal(secondHarness.calls.list, 1);
  assert.equal(firstHarness.calls.dependencies, 1);
  assert.equal(secondHarness.calls.dependencies, 1);
});

test("queue readiness preview branch metadata is isolated by review and action", async () => {
  const harness = createAdapterHarness({
    reviews: [
      createReview("review_metadata_a"),
      createReview("review_metadata_b"),
    ],
  });
  const result = await runAppointmentReviewQueueReadinessPreview({
    routeRuntimeAdapter: harness.adapter,
  });
  const keys = harness.calls.idempotency.map((input) => input.idempotencyKey);

  assert.equal(result.accepted, true);
  assert.equal(keys.length, 4);
  assert.equal(new Set(keys).size, 4);
  assert.deepEqual(keys, [
    "queue_readiness_review_metadata_a_approve_key",
    "queue_readiness_review_metadata_a_reject_key",
    "queue_readiness_review_metadata_b_approve_key",
    "queue_readiness_review_metadata_b_reject_key",
  ]);
});

test("queue readiness preview source has no route network persistence or recommendation side effects", () => {
  const source = fs.readFileSync(
    "src/api/secretaryAppointmentReviewQueueReadinessPreviewOrchestrator.js",
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

  assert.match(source, /evaluateAppointmentReviewDecisionComparison/);
  assert.match(source, /listAppointmentReviews/);

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
});

function blockPreconditions(input, code) {
  return Object.freeze({
    accepted: false,
    eligibleForControlledHandling: false,
    code,
    reason: "Synthetic domain branch block.",
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
