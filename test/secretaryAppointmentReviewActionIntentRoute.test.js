const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/[id]/action-intent/route");

const ROUTE_URL =
  "http://localhost/api/secretary/appointment-reviews/review_mock/action-intent";

const FORBIDDEN_RESPONSE_KEYS = Object.freeze([
  "repository",
  "repositoryInstance",
  "rawRepository",
  "queue",
  "rawQueue",
  "runtime",
  "serverRuntime",
  "rawRuntime",
  "compositionRoot",
  "dependencyProvider",
  "rawDependencyProvider",
  "adapter",
  "routeRuntime",
  "runtimeConfig",
  "mutableConfig",
  "serviceRegistry",
  "runtimeRegistry",
  "adapterRegistry",
  "executor",
  "dispatcher",
  "commandBus",
  "eventBus",
  "jobQueue",
  "database",
  "databaseAdapter",
  "authProvider",
  "authenticationProvider",
  "authorizationProvider",
  "calendarProvider",
  "bookingService",
]);

function createRequest(payload) {
  return new Request(ROUTE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function createContext(id = "review_mock") {
  return {
    params: {
      id,
    },
  };
}

function createSafeReview(id, overrides = {}) {
  return Object.freeze({
    id,
    status: "pending_secretary_review",
    source: "mock",
    selectedSlot: Object.freeze({
      id: `${id}_slot`,
      source: "mock",
    }),
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
    metadata: Object.freeze({}),
    ...overrides,
  });
}

function createInstrumentedAdapterFactory(reviewsByRequest) {
  const calls = [];

  return {
    calls,
    createRouteRuntimeAdapter(options) {
      const call = {
        options,
        adapter: null,
        lookupCallCount: 0,
        lookupIds: [],
      };
      const review = reviewsByRequest[calls.length] || null;
      const adapter = Object.freeze({
        getAppointmentReviewById(reviewId) {
          call.lookupCallCount += 1;
          call.lookupIds.push(reviewId);

          return review;
        },
      });

      call.adapter = adapter;
      calls.push(call);

      return adapter;
    },
  };
}

function assertActionIntentSafety(body) {
  assert.equal(body.validationOnly, true);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.bookingCreated, false);
  assert.equal(body.calendarChecked, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.appointmentCreated, false);
  assert.equal(body.calendarEventCreated, false);
  assert.equal(body.requiresSecretaryConfirmation, true);
}

function assertNoInternalLeak(value, path = "response") {
  if (!value || typeof value !== "object") {
    assert.notEqual(typeof value, "function", path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoInternalLeak(item, `${path}[${index}]`));
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    assert.equal(FORBIDDEN_RESPONSE_KEYS.includes(key), false, `${path}.${key}`);
    assert.notEqual(typeof nestedValue, "function", `${path}.${key}`);
    assertNoInternalLeak(nestedValue, `${path}.${key}`);
  }
}

test("secretary appointment review action intent route validates approve intent only", async () => {
  const response = await route.POST(
    createRequest({
      actionIntent: "approve_intent",
      actorRole: "secretary",
      reason: "Future approval intent only.",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.reviewId, "review_mock");
  assert.equal(body.actionIntent, "approve_intent");
  assertActionIntentSafety(body);
});

test("secretary appointment review action intent route validates reject intent only", async () => {
  const response = await route.POST(
    createRequest({
      actionIntent: "reject_intent",
      actorRole: "secretary",
      note: "Future rejection intent only.",
    }),
    createContext("review_reject_demo")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.reviewId, "review_reject_demo");
  assert.equal(body.actionIntent, "reject_intent");
  assertActionIntentSafety(body);
});

test("secretary appointment review action intent route uses one route runtime adapter lookup capability", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    createSafeReview("review_runtime_intent"),
  ]);
  const response =
    await route.handleAppointmentReviewActionIntentRouteRequest(
      createRequest({
        actionIntent: "approve_intent",
        actorRole: "secretary",
        reason: "Validated by the runtime adapter boundary.",
      }),
      createContext("  review_runtime_intent  "),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.reviewId, "review_runtime_intent");
  assert.equal(body.actionIntent, "approve_intent");
  assertActionIntentSafety(body);
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].lookupCallCount, 1);
  assert.deepEqual(instrumentation.calls[0].lookupIds, ["review_runtime_intent"]);
  assert.equal(Object.isFrozen(instrumentation.calls[0].adapter), true);
  assert.equal(typeof instrumentation.calls[0].options.resolveControlledActionState, "function");
  assert.equal(instrumentation.calls[0].options.initialReviews.length, 1);
  assert.equal(instrumentation.calls[0].options.initialReviews[0].id, "review_runtime_intent");
  assert.equal(Object.hasOwn(instrumentation.calls[0].options, "repository"), false);
  assert.equal(Object.hasOwn(instrumentation.calls[0].adapter, "repository"), false);
  assert.equal(Object.hasOwn(instrumentation.calls[0].adapter, "queue"), false);
  assert.equal(typeof instrumentation.calls[0].adapter.addAppointmentReview, "undefined");
});

test("secretary appointment review action intent route keeps separate adapter scopes isolated", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    createSafeReview("review_runtime_intent_a"),
    createSafeReview("review_runtime_intent_b"),
  ]);
  const first = await route.handleAppointmentReviewActionIntentRouteRequest(
    createRequest({ actionIntent: "approve_intent" }),
    createContext("review_runtime_intent_a"),
    {
      createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
    }
  );
  const second = await route.handleAppointmentReviewActionIntentRouteRequest(
    createRequest({ actionIntent: "reject_intent" }),
    createContext("review_runtime_intent_b"),
    {
      createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
    }
  );
  const firstBody = await first.json();
  const secondBody = await second.json();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstBody.reviewId, "review_runtime_intent_a");
  assert.equal(secondBody.reviewId, "review_runtime_intent_b");
  assert.equal(instrumentation.calls.length, 2);
  assert.notEqual(instrumentation.calls[0].adapter, instrumentation.calls[1].adapter);
  assert.equal(instrumentation.calls[0].lookupCallCount, 1);
  assert.equal(instrumentation.calls[1].lookupCallCount, 1);
});

test("secretary appointment review action intent route uses adapter review data as trusted context", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    createSafeReview("review_trusted_from_adapter", {
      currentState: "action_intent_rejected",
      observedReviewVersion: 99,
      repositoryVersion: 42,
      executionAvailable: true,
      authenticated: true,
      authorized: true,
    }),
  ]);
  const response =
    await route.handleAppointmentReviewActionIntentRouteRequest(
      createRequest({
        actionIntent: "approve_intent",
        reviewId: "body_review_must_not_win",
        currentState: "client_state_must_not_win",
        observedReviewVersion: 123,
        repositoryVersion: 456,
        executionAvailable: true,
        authenticated: true,
        authorized: true,
      }),
      createContext("route_review_runtime"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.reviewId, "review_trusted_from_adapter");
  assert.notEqual(body.reviewId, "body_review_must_not_win");
  assert.doesNotMatch(serialized, /client_state_must_not_win|123|456/);
  assert.equal(body.executionAvailable, undefined);
  assert.equal(body.authenticated, undefined);
  assert.equal(body.authorized, undefined);
  assertActionIntentSafety(body);
  assert.equal(instrumentation.calls.length, 1);
  assert.deepEqual(instrumentation.calls[0].lookupIds, ["route_review_runtime"]);
});

test("secretary appointment review action intent route rejects unsafe intents safely", async () => {
  const response = await route.POST(
    createRequest({
      actionIntent: "book",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "unsafe_action_intent");
  assertActionIntentSafety(body);
});

test("secretary appointment review action intent route rejects missing id and action intent safely", async () => {
  let adapterFactoryCalls = 0;
  const missingIdResponse = await route.POST(
    createRequest({
      actionIntent: "needs_clinic_review",
    }),
    createContext("   ")
  );
  const missingIntentResponse = await route.POST(
    createRequest({}),
    createContext("review_missing_intent")
  );
  const missingIdBody = await missingIdResponse.json();
  const missingIntentBody = await missingIntentResponse.json();

  assert.equal(missingIdResponse.status, 400);
  assert.equal(missingIdBody.status, "error");
  assert.equal(missingIdBody.error.code, "missing_review_id");
  assertActionIntentSafety(missingIdBody);
  assert.equal(missingIntentResponse.status, 400);
  assert.equal(missingIntentBody.status, "error");
  assert.equal(missingIntentBody.error.code, "missing_action_intent");
  assertActionIntentSafety(missingIntentBody);

  const injectedResponse =
    await route.handleAppointmentReviewActionIntentRouteRequest(
      createRequest({}),
      createContext("review_missing_intent"),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          return Object.freeze({});
        },
      }
    );

  assert.equal(injectedResponse.status, 400);
  assert.equal(adapterFactoryCalls, 0);
});

test("secretary appointment review action intent route rejects invalid JSON safely", async () => {
  const response = await route.POST(
    new Request(ROUTE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "invalid_json");
  assertActionIntentSafety(body);
});

test("secretary appointment review action intent route rejects unsafe side effect flags", async () => {
  const unsafeTrue = Boolean("unsafe");
  const unsafeFields = [
    "bookingCreated",
    "calendarChecked",
    "databasePersisted",
    "appointmentCreated",
    "calendarEventCreated",
  ];
  const response = await route.POST(
    createRequest({
      actionIntent: "ask_patient_clarification",
      ...Object.fromEntries(unsafeFields.map((fieldName) => [fieldName, unsafeTrue])),
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "unsafe_side_effect_flag");
  assertActionIntentSafety(body);
});

test("secretary appointment review action intent route keeps adapter not found as domain error", async () => {
  const instrumentation = createInstrumentedAdapterFactory([null]);
  const response =
    await route.handleAppointmentReviewActionIntentRouteRequest(
      createRequest({
        actionIntent: "approve_intent",
      }),
      createContext("review_intent_missing"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "review_not_found");
  assert.equal(body.error.message, "Appointment review item was not found.");
  assertActionIntentSafety(body);
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].lookupCallCount, 1);
  assertNoInternalLeak(body);
});

test("secretary appointment review action intent route rejects non-post methods safely", async () => {
  let adapterFactoryCalls = 0;
  const unusedOptions = {
    createRouteRuntimeAdapter() {
      adapterFactoryCalls += 1;
      return Object.freeze({
        getAppointmentReviewById() {
          throw new Error("lookup must not run for unsupported methods");
        },
      });
    },
  };
  const responses = await Promise.all([
    route.GET(new Request(ROUTE_URL, { method: "GET" }), createContext(), unusedOptions),
    route.PUT(new Request(ROUTE_URL, { method: "PUT" }), createContext(), unusedOptions),
    route.PATCH(new Request(ROUTE_URL, { method: "PATCH" }), createContext(), unusedOptions),
    route.DELETE(new Request(ROUTE_URL, { method: "DELETE" }), createContext(), unusedOptions),
  ]);
  const bodies = await Promise.all(
    responses.map((response) => response.json())
  );

  assert.ok(responses.every((response) => response.status === 405));
  assert.ok(bodies.every((body) => body.status === "error"));
  assert.ok(bodies.every((body) => body.error.code === "method_not_allowed"));
  assert.ok(bodies.every((body) => body.validationOnly === true));
  assert.ok(bodies.every((body) => body.actionPerformed === false));
  assert.ok(bodies.every((body) => body.bookingCreated === false));
  assert.ok(bodies.every((body) => body.calendarChecked === false));
  assert.ok(bodies.every((body) => body.databasePersisted === false));
  assert.ok(bodies.every((body) => body.appointmentCreated === false));
  assert.ok(bodies.every((body) => body.calendarEventCreated === false));
  assert.equal(adapterFactoryCalls, 0);
});

test("secretary appointment review action intent route safely contains adapter factory failures", async () => {
  let adapterFactoryCalls = 0;
  const response =
    await route.handleAppointmentReviewActionIntentRouteRequest(
      createRequest({
        actionIntent: "approve_intent",
      }),
      createContext("review_intent_factory_failure"),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          throw new Error("ACTION_INTENT_RUNTIME_FACTORY_INTERNAL");
        },
      }
    );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 500);
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "internal_error");
  assert.equal(body.error.message, "Action intent runtime failed safely.");
  assert.equal(adapterFactoryCalls, 1);
  assert.doesNotMatch(serialized, /ACTION_INTENT_RUNTIME_FACTORY_INTERNAL|Error:|stack|at /);
  assertActionIntentSafety(body);
  assertNoInternalLeak(body);
});

test("secretary appointment review action intent route safely contains adapter lookup failures", async () => {
  let adapterFactoryCalls = 0;
  let lookupCalls = 0;
  const response =
    await route.handleAppointmentReviewActionIntentRouteRequest(
      createRequest({
        actionIntent: "reject_intent",
      }),
      createContext("review_intent_lookup_failure"),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          return Object.freeze({
            getAppointmentReviewById() {
              lookupCalls += 1;
              throw new Error("ACTION_INTENT_LOOKUP_INTERNAL");
            },
          });
        },
      }
    );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 500);
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "internal_error");
  assert.equal(adapterFactoryCalls, 1);
  assert.equal(lookupCalls, 1);
  assert.doesNotMatch(serialized, /ACTION_INTENT_LOOKUP_INTERNAL|Error:|stack|at /);
  assertActionIntentSafety(body);
  assertNoInternalLeak(body);
});

test("secretary appointment review action intent route responses do not leak runtime internals", async () => {
  const successInstrumentation = createInstrumentedAdapterFactory([
    createSafeReview("review_intent_no_internal_leak"),
  ]);
  const success =
    await route.handleAppointmentReviewActionIntentRouteRequest(
      createRequest({ actionIntent: "approve_intent" }),
      createContext("review_intent_no_internal_leak"),
      {
        createRouteRuntimeAdapter: successInstrumentation.createRouteRuntimeAdapter,
      }
    );
  const notFound =
    await route.handleAppointmentReviewActionIntentRouteRequest(
      createRequest({ actionIntent: "approve_intent" }),
      createContext("review_intent_not_found_no_internal_leak"),
      {
        createRouteRuntimeAdapter:
          createInstrumentedAdapterFactory([null]).createRouteRuntimeAdapter,
      }
    );
  const failure =
    await route.handleAppointmentReviewActionIntentRouteRequest(
      createRequest({ actionIntent: "approve_intent" }),
      createContext("review_intent_bad_adapter"),
      {
        createRouteRuntimeAdapter() {
          return Object.freeze({});
        },
      }
    );
  const invalid = await route.POST(
    createRequest({ actionIntent: "unsupported_intent" }),
    createContext("review_intent_invalid")
  );

  const bodies = await Promise.all([
    success.json(),
    notFound.json(),
    failure.json(),
    invalid.json(),
  ]);

  assert.equal(success.status, 200);
  assert.equal(notFound.status, 404);
  assert.equal(failure.status, 500);
  assert.equal(invalid.status, 400);
  bodies.forEach((body) => assertNoInternalLeak(body));
});

test("secretary appointment review action intent route has no execution imports", () => {
  const source = fs.readFileSync(
    "app/api/secretary/appointment-reviews/[id]/action-intent/route.js",
    "utf8"
  );

  assert.match(source, /validateAppointmentReviewActionIntent/);
  assert.match(source, /appointmentReviewRouteRuntimeAdapter/);
  assert.doesNotMatch(source, /appointmentReviewInMemoryMockServerRuntime/);
  assert.doesNotMatch(
    source,
    /appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider/
  );
  assert.doesNotMatch(source, /appointmentReviewHybridControlledActionDependencies/);
  assert.doesNotMatch(source, /appointmentReviewRepositoryContextResolver/);
  assert.doesNotMatch(source, /appointmentReviewRepository/);
  assert.doesNotMatch(source, /appointmentReviewQueue/);
  assert.doesNotMatch(source, /appointmentCreation/);
  assert.doesNotMatch(source, /calendarProvider/);
  assert.doesNotMatch(source, /Google Calendar/);
  const forbidden = [
    "create" + "Appointment\\(",
    "create" + "CalendarEvent\\(",
    "get" + "CalendarProvider\\(",
    "manual" + "AppointmentCalendarSync",
    "google" + "apis",
    "pri" + "sma",
    "supa" + "base",
    "re" + "dis",
    "fe" + "tch\\(",
  ];

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /AsyncLocalStorage|globalThis|new Map\(/);
  assert.doesNotMatch(source, /require\(.+db|require\(.+database/i);
});
