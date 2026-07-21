const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/[id]/decision-preview/route");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

const ROUTE_URL =
  "http://localhost/api/secretary/appointment-reviews/review_decision/decision-preview";

function createRequest(payload) {
  return new Request(ROUTE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function createContext(id = "review_decision") {
  return {
    params: {
      id,
    },
  };
}

function createInstrumentedAdapterFactory(contextsByRequest) {
  const calls = [];

  return {
    calls,
    createRouteRuntimeAdapter(options) {
      const call = {
        options,
        adapter: null,
        dependencyResolutionCount: 0,
        reviewContextResolutionCount: 0,
      };
      const base = createMockAppointmentReviewControlledActionDependencies();
      const reviewContext = Object.hasOwn(contextsByRequest, calls.length)
        ? contextsByRequest[calls.length]
        : {};
      const dependencies = Object.freeze({
        resolveVerifiedActorContext(input) {
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
          return base.resolveIdempotencyContext(input);
        },
        resolveExecutionPolicyContext(input) {
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
  assert.equal(body.decisionPreview, true);
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

test("decision preview route returns successful approve preview through one adapter", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    {
      currentState: "validation_only_intent_checked",
      observedReviewVersion: 3,
    },
  ]);
  const response =
    await route.handleAppointmentReviewDecisionPreviewRouteRequest(
      createRequest({ action: "approve" }),
      createContext("review_decision_route_approve"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.previewPassed, true);
  assert.equal(body.reviewId, "review_decision_route_approve");
  assert.equal(body.action, "approve");
  assert.equal(body.actionIntent, "approve_intent");
  assert.equal(body.trustedCurrentState, "validation_only_intent_checked");
  assert.equal(body.observedReviewVersion, 3);
  assert.equal(body.projectedNextState, "needs_clinic_review");
  assert.equal(body.validationReceipt.outcome, "validation_passed");
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].dependencyResolutionCount, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 3);
  assert.equal(Object.isFrozen(instrumentation.calls[0].adapter), true);
  assert.equal(instrumentation.calls[0].options.initialReviews.length, 1);
  assert.equal(
    instrumentation.calls[0].options.initialReviews[0].id,
    "review_decision_route_approve"
  );
  assert.equal(Object.hasOwn(instrumentation.calls[0].options, "repository"), false);
  assertSafety(body);
});

test("decision preview route returns successful reject preview", async () => {
  const response = await route.POST(
    createRequest({ action: "reject" }),
    createContext("review_decision_route_reject")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.actionIntent, "reject_intent");
  assert.equal(body.projectedNextState, "action_intent_rejected");
  assert.equal(body.receiptOutcome, "validation_passed");
  assertSafety(body);
});

test("decision preview route rejects unsupported action before adapter creation", async () => {
  let adapterFactoryCalls = 0;
  const response =
    await route.handleAppointmentReviewDecisionPreviewRouteRequest(
      createRequest({ action: "book" }),
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
  assert.equal(body.code, "unsupported_decision_action");
  assert.equal(adapterFactoryCalls, 0);
  assertSafety(body);
});

test("decision preview route rejects trusted client fields before adapter creation", async () => {
  let adapterFactoryCalls = 0;
  const response =
    await route.handleAppointmentReviewDecisionPreviewRouteRequest(
      createRequest({
        action: "approve",
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
  assert.equal(body.code, "client_trusted_context_injection");
  assert.equal(adapterFactoryCalls, 0);
  assertSafety(body);
});

test("decision preview route keeps separate requests isolated", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    {
      observedReviewVersion: 2,
    },
    {
      observedReviewVersion: 4,
    },
  ]);
  const first = await route.handleAppointmentReviewDecisionPreviewRouteRequest(
    createRequest({ action: "approve" }),
    createContext("review_decision_route_a"),
    {
      createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
    }
  );
  const second = await route.handleAppointmentReviewDecisionPreviewRouteRequest(
    createRequest({ action: "reject" }),
    createContext("review_decision_route_b"),
    {
      createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
    }
  );
  const firstBody = await first.json();
  const secondBody = await second.json();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstBody.observedReviewVersion, 2);
  assert.equal(secondBody.observedReviewVersion, 4);
  assert.equal(instrumentation.calls.length, 2);
  assert.notEqual(instrumentation.calls[0].adapter, instrumentation.calls[1].adapter);
});

test("decision preview route returns safe not found without fabricated receipt", async () => {
  const instrumentation = createInstrumentedAdapterFactory([null]);
  const response =
    await route.handleAppointmentReviewDecisionPreviewRouteRequest(
      createRequest({ action: "approve" }),
      createContext("review_decision_missing"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "review_not_found");
  assert.equal(body.validationReceipt, null);
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 1);
  assertSafety(body);
});

test("decision preview route safely contains adapter factory failures", async () => {
  let adapterFactoryCalls = 0;
  const response =
    await route.handleAppointmentReviewDecisionPreviewRouteRequest(
      createRequest({ action: "approve" }),
      createContext("review_decision_factory_failure"),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          throw new Error("DECISION_PREVIEW_ROUTE_FACTORY_INTERNAL");
        },
      }
    );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 500);
  assert.equal(body.code, "internal_error");
  assert.equal(adapterFactoryCalls, 1);
  assert.doesNotMatch(serialized, /DECISION_PREVIEW_ROUTE_FACTORY_INTERNAL|Error:|stack|at /);
  assertSafety(body);
});

test("decision preview route rejects unsupported methods without adapter", async () => {
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

test("decision preview route imports the adapter and no lower runtime infrastructure", () => {
  const source = fs.readFileSync(
    "app/api/secretary/appointment-reviews/[id]/decision-preview/route.js",
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

  assert.match(source, /secretaryAppointmentReviewDecisionPreviewOrchestrator/);
  assert.match(source, /appointmentReviewRouteRuntimeAdapter/);

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
});
