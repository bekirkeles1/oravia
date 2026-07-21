const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/[id]/decision-comparison/route");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

const ROUTE_URL =
  "http://localhost/api/secretary/appointment-reviews/review_decision/decision-comparison";

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

function createContext(id = "review_decision") {
  return {
    params: {
      id,
    },
  };
}

function createInstrumentedAdapterFactory(contextsByRequest = []) {
  const calls = [];

  return {
    calls,
    createRouteRuntimeAdapter(options) {
      const call = {
        options,
        adapter: null,
        dependencyResolutionCount: 0,
        reviewContextResolutionCount: 0,
        actorInputs: [],
        idempotencyInputs: [],
        policyInputs: [],
      };
      const base = createMockAppointmentReviewControlledActionDependencies();
      const reviewContext = Object.hasOwn(contextsByRequest, calls.length)
        ? contextsByRequest[calls.length]
        : {};
      const dependencies = Object.freeze({
        resolveVerifiedActorContext(input) {
          call.actorInputs.push(input);
          return base.resolveVerifiedActorContext(input);
        },
        resolveAppointmentReviewContext(input) {
          call.reviewContextResolutionCount += 1;

          if (reviewContext === null) {
            throw Object.freeze({
              code: "appointment_review_snapshot_not_found",
              reason: "Synthetic not found.",
            });
          }

          if (reviewContext?.throws) {
            throw Object.freeze({
              code: "synthetic_context_failure",
              reason: "Synthetic context failure.",
            });
          }

          return Object.freeze({
            contextType: "appointment_review_snapshot_context_v1",
            contextSource: "server_review_boundary",
            reviewId: input.reviewId,
            currentState:
              reviewContext.currentState || "validation_only_intent_checked",
            observedReviewVersion: reviewContext.observedReviewVersion || 1,
          });
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
  assert.equal(body.decisionComparison, true);
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
}

test("decision comparison route returns approve and reject paths through one adapter", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    {
      currentState: "validation_only_intent_checked",
      observedReviewVersion: 6,
    },
  ]);
  const response =
    await route.handleAppointmentReviewDecisionComparisonRouteRequest(
      createRequest(),
      createContext("review_decision_comparison_route"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.mode, "validation_only");
  assert.equal(body.comparison, "decision_paths");
  assert.deepEqual(body.actions, ["approve", "reject"]);
  assert.equal(body.reviewId, "review_decision_comparison_route");
  assert.equal(body.trustedCurrentState, "validation_only_intent_checked");
  assert.equal(body.observedReviewVersion, 6);
  assert.equal(body.paths.approve.outcome, "passed");
  assert.equal(body.paths.approve.projectedNextState, "needs_clinic_review");
  assert.equal(body.paths.reject.outcome, "passed");
  assert.equal(body.paths.reject.projectedNextState, "action_intent_rejected");
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].dependencyResolutionCount, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 1);
  assert.equal(instrumentation.calls[0].actorInputs.length, 4);
  assert.equal(instrumentation.calls[0].idempotencyInputs.length, 2);
  assert.equal(Object.isFrozen(instrumentation.calls[0].adapter), true);
  assert.equal(instrumentation.calls[0].options.initialReviews.length, 1);
  assert.equal(
    instrumentation.calls[0].options.initialReviews[0].id,
    "review_decision_comparison_route"
  );
  assert.equal(Object.hasOwn(instrumentation.calls[0].options, "repository"), false);
  assertSafety(body);
});

test("decision comparison route accepts an empty body", async () => {
  const response = await route.POST(
    createEmptyRequest(),
    createContext("review_decision_comparison_empty")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.deepEqual(Object.keys(body.paths), ["approve", "reject"]);
  assertSafety(body);
});

test("decision comparison route rejects client branch and trusted claims before adapter creation", async () => {
  let adapterFactoryCalls = 0;
  const response =
    await route.handleAppointmentReviewDecisionComparisonRouteRequest(
      createRequest({
        actions: ["approve"],
        currentState: "needs_clinic_review",
      }),
      createContext(),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          return Object.freeze({});
        },
      }
    );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "client_trusted_context_injection");
  assert.equal(adapterFactoryCalls, 0);
  assertSafety(body);
});

test("decision comparison route keeps separate comparison requests isolated", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    {
      observedReviewVersion: 3,
    },
    {
      observedReviewVersion: 8,
    },
  ]);
  const first = await route.handleAppointmentReviewDecisionComparisonRouteRequest(
    createRequest(),
    createContext("review_decision_comparison_a"),
    {
      createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
    }
  );
  const second = await route.handleAppointmentReviewDecisionComparisonRouteRequest(
    createRequest(),
    createContext("review_decision_comparison_b"),
    {
      createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
    }
  );
  const firstBody = await first.json();
  const secondBody = await second.json();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstBody.observedReviewVersion, 3);
  assert.equal(secondBody.observedReviewVersion, 8);
  assert.equal(instrumentation.calls.length, 2);
  assert.notEqual(instrumentation.calls[0].adapter, instrumentation.calls[1].adapter);
});

test("decision comparison route returns safe not found without fabricated paths", async () => {
  const instrumentation = createInstrumentedAdapterFactory([null]);
  const response =
    await route.handleAppointmentReviewDecisionComparisonRouteRequest(
      createRequest(),
      createContext("review_decision_comparison_missing"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "review_not_found");
  assert.equal(body.paths, null);
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 1);
  assert.equal(instrumentation.calls[0].actorInputs.length, 0);
  assertSafety(body);
});

test("decision comparison route safely contains adapter and trusted context failures", async () => {
  let adapterFactoryCalls = 0;
  const adapterFailure =
    await route.handleAppointmentReviewDecisionComparisonRouteRequest(
      createRequest(),
      createContext("review_decision_comparison_factory_failure"),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          throw new Error("SYNTHETIC_ROUTE_FACTORY_FAILURE");
        },
      }
    );
  const adapterFailureBody = await adapterFailure.json();
  const instrumentation = createInstrumentedAdapterFactory([{ throws: true }]);
  const contextFailure =
    await route.handleAppointmentReviewDecisionComparisonRouteRequest(
      createRequest(),
      createContext("review_decision_comparison_context_failure"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const contextFailureBody = await contextFailure.json();
  const serialized = JSON.stringify({
    adapterFailureBody,
    contextFailureBody,
  });

  assert.equal(adapterFailure.status, 500);
  assert.equal(adapterFailureBody.code, "internal_error");
  assert.equal(adapterFactoryCalls, 1);
  assert.equal(contextFailure.status, 200);
  assert.equal(contextFailureBody.code, "trusted_review_context_failed");
  assert.equal(contextFailureBody.paths, null);
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 1);
  assert.equal(instrumentation.calls[0].actorInputs.length, 0);
  assert.doesNotMatch(serialized, /SYNTHETIC_ROUTE_FACTORY_FAILURE|Error:|stack|at /);
  assertSafety(adapterFailureBody);
  assertSafety(contextFailureBody);
});

test("decision comparison route rejects unsupported methods without adapter", async () => {
  let adapterFactoryCalls = 0;
  const options = {
    createRouteRuntimeAdapter() {
      adapterFactoryCalls += 1;
      return Object.freeze({});
    },
  };
  const responses = await Promise.all([
    route.GET(new Request(ROUTE_URL, { method: "GET" }), createContext(), options),
    route.PUT(new Request(ROUTE_URL, { method: "PUT" }), createContext(), options),
    route.PATCH(new Request(ROUTE_URL, { method: "PATCH" }), createContext(), options),
    route.DELETE(new Request(ROUTE_URL, { method: "DELETE" }), createContext(), options),
  ]);
  const bodies = await Promise.all(
    responses.map((response) => response.json())
  );

  assert.ok(responses.every((response) => response.status === 405));
  assert.ok(bodies.every((body) => body.code === "method_not_allowed"));
  assert.equal(adapterFactoryCalls, 0);
  bodies.forEach(assertSafety);
});

test("decision comparison route imports the adapter and no lower runtime infrastructure", () => {
  const source = fs.readFileSync(
    "app/api/secretary/appointment-reviews/[id]/decision-comparison/route.js",
    "utf8"
  );
  const forbidden = [
    "appointmentReviewInMemoryMockServerRuntime",
    "appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider",
    "appointmentReviewHybridControlledActionDependencies",
    "appointmentReviewRepositoryContextResolver",
    "appointmentReviewRepository",
    "appointmentReviewQueue",
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

  assert.match(source, /secretaryAppointmentReviewDecisionComparisonOrchestrator/);
  assert.match(source, /appointmentReviewRouteRuntimeAdapter/);

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
});
