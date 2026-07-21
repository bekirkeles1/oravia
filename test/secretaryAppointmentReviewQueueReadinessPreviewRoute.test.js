const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/decision-readiness-preview/route");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

const ROUTE_URL =
  "http://localhost/api/secretary/appointment-reviews/decision-readiness-preview";

function createRequest(payload = {}) {
  return new Request(ROUTE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function createEmptyRequest() {
  return new Request(ROUTE_URL, {
    method: "POST",
  });
}

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

function createInstrumentedAdapterFactory(requestReviews = []) {
  const calls = [];

  return {
    calls,
    createRouteRuntimeAdapter(options) {
      const call = {
        options,
        adapter: null,
        listCount: 0,
        dependencyResolutionCount: 0,
        reviewContextResolutionCount: 0,
        actorInputs: [],
        idempotencyInputs: [],
        policyInputs: [],
      };
      const base = createMockAppointmentReviewControlledActionDependencies();
      const reviews = Object.hasOwn(requestReviews, calls.length)
        ? requestReviews[calls.length]
        : [];
      const dependencies = Object.freeze({
        resolveAppointmentReviewContext(input) {
          call.reviewContextResolutionCount += 1;

          const review = reviews.find((item) => item.id === input.reviewId);

          if (!review) {
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
              review.metadata?.controlledActionState ||
              "validation_only_intent_checked",
            observedReviewVersion:
              review.metadata?.observedReviewVersion || call.listCount,
          });
        },
        resolveVerifiedActorContext(input) {
          call.actorInputs.push(input);
          return base.resolveVerifiedActorContext(input);
        },
        resolveIdempotencyContext(input) {
          call.idempotencyInputs.push(input);
          return base.resolveIdempotencyContext(input);
        },
        resolveExecutionPolicyContext(input) {
          call.policyInputs.push(input);
          return base.resolveExecutionPolicyContext(input);
        },
      });
      const adapter = Object.freeze({
        listAppointmentReviews() {
          call.listCount += 1;
          return reviews;
        },
        getControlledActionDependencies() {
          call.dependencyResolutionCount += 1;
          return dependencies;
        },
      });

      call.adapter = adapter;
      calls.push(call);

      return adapter;
    },
  };
}

function assertSafety(body) {
  assert.equal(body.mock, true);
  assert.equal(body.dryRun, true);
  assert.equal(body.queueReadinessPreview, true);
  assert.equal(body.validationOnly, true);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.executionAvailable, false);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.bookingCreated, false);
  assert.equal(body.calendarChecked, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.persistence, "not_persisted");
  assert.equal(body.reviewMutated, false);
  assert.equal(body.reviewStateChanged, false);
  assert.equal(body.repositoryVersionChanged, false);
  assert.equal(body.queueMutated, false);
  assert.equal(body.queueCountChanged, false);
}

test("queue readiness route scans adapter-backed queue through exactly one adapter", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [
      createReview("review_route_readiness_a"),
      createReview("review_route_readiness_b", "pending_secretary_review"),
    ],
  ]);
  const response =
    await route.handleAppointmentReviewQueueReadinessPreviewRouteRequest(
      createRequest(),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.preview, "queue_decision_readiness_preview");
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].listCount, 1);
  assert.equal(instrumentation.calls[0].dependencyResolutionCount, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 2);
  assert.equal(instrumentation.calls[0].actorInputs.length, 6);
  assert.equal(instrumentation.calls[0].idempotencyInputs.length, 2);
  assert.deepEqual(
    body.items.map((item) => item.reviewId),
    ["review_route_readiness_a", "review_route_readiness_b"]
  );
  assert.deepEqual(
    body.items.map((item) => item.readiness),
    ["both_paths_available", "both_paths_blocked"]
  );
  assert.equal(body.summary.totalReviewsScanned, 2);
  assert.equal(body.summary.bothPathsAvailable, 1);
  assert.equal(body.summary.bothPathsBlocked, 1);
  assert.equal(Object.hasOwn(instrumentation.calls[0].options, "repository"), false);
  assertSafety(body);
});

test("queue readiness route accepts empty body and server controls membership", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [createReview("review_route_empty_body")],
    [createReview("review_route_client_cannot_replace")],
  ]);
  const emptyBody = await route.handleAppointmentReviewQueueReadinessPreviewRouteRequest(
    createEmptyRequest(),
    {
      createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
    }
  );
  const rejectedClientBody =
    await route.handleAppointmentReviewQueueReadinessPreviewRouteRequest(
      createRequest({
        reviewIds: ["client_added_review"],
      }),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const emptyBodyPayload = await emptyBody.json();
  const rejectedPayload = await rejectedClientBody.json();

  assert.equal(emptyBody.status, 200);
  assert.deepEqual(
    emptyBodyPayload.items.map((item) => item.reviewId),
    ["review_route_empty_body"]
  );
  assert.equal(rejectedClientBody.status, 400);
  assert.equal(rejectedPayload.code, "client_queue_readiness_injection");
  assert.equal(instrumentation.calls.length, 1);
  assertSafety(emptyBodyPayload);
  assertSafety(rejectedPayload);
});

test("queue readiness route returns safe empty queue success", async () => {
  const instrumentation = createInstrumentedAdapterFactory([[]]);
  const response =
    await route.handleAppointmentReviewQueueReadinessPreviewRouteRequest(
      createRequest(),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.deepEqual(body.items, []);
  assert.deepEqual(body.summary, {
    totalReviewsScanned: 0,
    bothPathsAvailable: 0,
    approvePathOnly: 0,
    rejectPathOnly: 0,
    bothPathsBlocked: 0,
  });
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].listCount, 1);
  assert.equal(instrumentation.calls[0].dependencyResolutionCount, 0);
  assertSafety(body);
});

test("queue readiness route contains infrastructure failures safely", async () => {
  let adapterFactoryCalls = 0;
  const adapterFailure =
    await route.handleAppointmentReviewQueueReadinessPreviewRouteRequest(
      createRequest(),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          throw new Error("SYNTHETIC_ADAPTER_FAILURE");
        },
      }
    );
  const malformedAdapter =
    await route.handleAppointmentReviewQueueReadinessPreviewRouteRequest(
      createRequest(),
      {
        createRouteRuntimeAdapter() {
          return Object.freeze({
            listAppointmentReviews() {
              throw new Error("SYNTHETIC_LIST_FAILURE");
            },
            getControlledActionDependencies() {
              return Object.freeze({});
            },
          });
        },
      }
    );
  const adapterFailureBody = await adapterFailure.json();
  const malformedAdapterBody = await malformedAdapter.json();
  const serialized = JSON.stringify({
    adapterFailureBody,
    malformedAdapterBody,
  });

  assert.equal(adapterFailure.status, 500);
  assert.equal(adapterFactoryCalls, 1);
  assert.equal(adapterFailureBody.code, "internal_error");
  assert.equal(malformedAdapter.status, 500);
  assert.equal(malformedAdapterBody.accepted, false);
  assert.equal(malformedAdapterBody.items, null);
  assert.doesNotMatch(serialized, /SYNTHETIC_|Error:|stack|at /);
  assertSafety(adapterFailureBody);
  assertSafety(malformedAdapterBody);
});

test("queue readiness route rejects unsupported methods without adapter", async () => {
  let adapterFactoryCalls = 0;
  const options = {
    createRouteRuntimeAdapter() {
      adapterFactoryCalls += 1;
      return Object.freeze({});
    },
  };
  const responses = await Promise.all([
    route.GET(new Request(ROUTE_URL, { method: "GET" }), options),
    route.PUT(new Request(ROUTE_URL, { method: "PUT" }), options),
    route.PATCH(new Request(ROUTE_URL, { method: "PATCH" }), options),
    route.DELETE(new Request(ROUTE_URL, { method: "DELETE" }), options),
  ]);
  const bodies = await Promise.all(responses.map((response) => response.json()));

  assert.ok(responses.every((response) => response.status === 405));
  assert.ok(bodies.every((body) => body.code === "method_not_allowed"));
  assert.equal(adapterFactoryCalls, 0);
  bodies.forEach(assertSafety);
});

test("queue readiness route keeps separate requests isolated", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [createReview("review_route_first")],
    [createReview("review_route_second")],
  ]);
  const first = await route.handleAppointmentReviewQueueReadinessPreviewRouteRequest(
    createRequest(),
    {
      createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
    }
  );
  const second =
    await route.handleAppointmentReviewQueueReadinessPreviewRouteRequest(
      createRequest(),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const firstBody = await first.json();
  const secondBody = await second.json();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstBody.items[0].reviewId, "review_route_first");
  assert.equal(secondBody.items[0].reviewId, "review_route_second");
  assert.equal(instrumentation.calls.length, 2);
  assert.notEqual(instrumentation.calls[0].adapter, instrumentation.calls[1].adapter);
});

test("queue readiness route imports adapter and no lower runtime infrastructure", () => {
  const source = fs.readFileSync(
    "app/api/secretary/appointment-reviews/decision-readiness-preview/route.js",
    "utf8"
  );
  const forbidden = [
    "appointmentReviewInMemoryMockServerRuntime",
    "appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider",
    "appointmentReviewHybridControlledActionDependencies",
    "appointmentReviewRepositoryContextResolver",
    "appointmentReviewRepository",
    "fe" + "tch",
    "recommended" + "Action",
    "best" + "Action",
    "preferred" + "Action",
    "automatic" + "Decision",
    "selected" + "Action",
    "create" + "Appointment\\(",
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

  assert.match(source, /secretaryAppointmentReviewQueueReadinessPreviewOrchestrator/);
  assert.match(source, /appointmentReviewRouteRuntimeAdapter/);

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
});
