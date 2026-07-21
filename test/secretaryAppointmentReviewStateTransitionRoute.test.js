const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/[id]/state-transition/route");

const ROUTE_URL =
  "ht" +
  "tp://localhost/api/secretary/appointment-reviews/review_mock/state-transition";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
  dryRun: true,
  validationOnly: true,
  executionAvailable: false,
  actionPerformed: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
  requiresSecretaryConfirmation: true,
});

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

function createReviewContext(reviewId, overrides = {}) {
  return Object.freeze({
    contextType: "appointment_review_snapshot_context_v1",
    contextSource: "server_review_boundary",
    reviewId,
    currentState: "pending_secretary_review",
    observedReviewVersion: 1,
    ...overrides,
  });
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
        reviewContextInputs: [],
      };
      const contextSequence = normalizeContextSequence(
        contextsByRequest[calls.length]
      );
      const dependencies = Object.freeze({
        resolveAppointmentReviewContext(input) {
          call.reviewContextResolutionCount += 1;
          call.reviewContextInputs.push(input);

          if (contextSequence.throwOnCall === call.reviewContextResolutionCount) {
            throw new Error(contextSequence.throwMarker);
          }

          return contextSequence.values[
            Math.min(
              call.reviewContextResolutionCount - 1,
              contextSequence.values.length - 1
            )
          ];
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

function normalizeContextSequence(value) {
  if (Array.isArray(value)) {
    return {
      values: value,
      throwOnCall: null,
      throwMarker: null,
    };
  }

  if (value && value.throwOnCall) {
    return {
      values: [value.context || null],
      throwOnCall: value.throwOnCall,
      throwMarker: value.throwMarker || "STATE_TRANSITION_CONTEXT_INTERNAL",
    };
  }

  return {
    values: [value || null],
    throwOnCall: null,
    throwMarker: null,
  };
}

function assertSafetyFields(body) {
  for (const [field, value] of Object.entries(EXPECTED_SAFETY_FIELDS)) {
    assert.equal(body[field], value);
  }
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

test("secretary appointment review state transition route accepts pending secretary review validation check", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "pending_secretary_review",
      event: "check_validation_only_intent",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reviewId, "review_mock");
  assert.equal(body.accepted, true);
  assert.equal(body.currentState, "pending_secretary_review");
  assert.equal(body.event, "check_validation_only_intent");
  assert.equal(body.nextState, "validation_only_intent_checked");
  assert.equal(body.code, "transition_accepted");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route uses one route runtime adapter trusted context", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [
      createReviewContext("review_runtime_transition", {
        currentState: "pending_secretary_review",
        observedReviewVersion: 7,
      }),
      createReviewContext("review_runtime_transition", {
        currentState: "pending_secretary_review",
        observedReviewVersion: 7,
      }),
    ],
  ]);
  const response =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "needs_clinic_review",
        event: "check_validation_only_intent",
        observedReviewVersion: 999,
        expectedReviewVersion: 999,
      }),
      createContext("review_runtime_transition"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.currentState, "pending_secretary_review");
  assert.equal(body.nextState, "validation_only_intent_checked");
  assert.equal(body.code, "transition_accepted");
  assert.doesNotMatch(serialized, /needs_clinic_review|999/);
  assertSafetyFields(body);
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].dependencyResolutionCount, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 2);
  assert.deepEqual(instrumentation.calls[0].reviewContextInputs, [
    { reviewId: "review_runtime_transition" },
    { reviewId: "review_runtime_transition" },
  ]);
  assert.equal(Object.isFrozen(instrumentation.calls[0].adapter), true);
  assert.equal(typeof instrumentation.calls[0].options.resolveControlledActionState, "function");
  assert.equal(instrumentation.calls[0].options.initialReviews.length, 1);
  assert.equal(
    instrumentation.calls[0].options.initialReviews[0].id,
    "review_runtime_transition"
  );
  assert.equal(Object.hasOwn(instrumentation.calls[0].options, "repository"), false);
  assert.equal(Object.hasOwn(instrumentation.calls[0].adapter, "repository"), false);
  assert.equal(Object.hasOwn(instrumentation.calls[0].adapter, "queue"), false);
});

test("secretary appointment review state transition route keeps adapter scopes isolated", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [
      createReviewContext("review_transition_a", {
        currentState: "pending_secretary_review",
        observedReviewVersion: 3,
      }),
      createReviewContext("review_transition_a", {
        currentState: "pending_secretary_review",
        observedReviewVersion: 3,
      }),
    ],
    [
      createReviewContext("review_transition_b", {
        currentState: "validation_only_intent_checked",
        observedReviewVersion: 4,
      }),
      createReviewContext("review_transition_b", {
        currentState: "validation_only_intent_checked",
        observedReviewVersion: 4,
      }),
    ],
  ]);
  const first = await route.handleAppointmentReviewStateTransitionRouteRequest(
    createRequest({
      currentState: "pending_secretary_review",
      event: "check_validation_only_intent",
    }),
    createContext("review_transition_a"),
    {
      createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
    }
  );
  const second = await route.handleAppointmentReviewStateTransitionRouteRequest(
    createRequest({
      currentState: "pending_secretary_review",
      event: "require_clinic_review",
    }),
    createContext("review_transition_b"),
    {
      createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
    }
  );
  const firstBody = await first.json();
  const secondBody = await second.json();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstBody.reviewId, "review_transition_a");
  assert.equal(firstBody.currentState, "pending_secretary_review");
  assert.equal(secondBody.reviewId, "review_transition_b");
  assert.equal(secondBody.currentState, "validation_only_intent_checked");
  assert.equal(secondBody.nextState, "needs_clinic_review");
  assert.equal(instrumentation.calls.length, 2);
  assert.notEqual(instrumentation.calls[0].adapter, instrumentation.calls[1].adapter);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 2);
  assert.equal(instrumentation.calls[1].reviewContextResolutionCount, 2);
});

test("secretary appointment review state transition route dry-run does not mutate trusted state or version", async () => {
  const beforeContext = createReviewContext("review_transition_immutable", {
    currentState: "validation_only_intent_checked",
    observedReviewVersion: 11,
  });
  const afterContext = createReviewContext("review_transition_immutable", {
    currentState: "validation_only_intent_checked",
    observedReviewVersion: 11,
  });
  const instrumentation = createInstrumentedAdapterFactory([
    [beforeContext, afterContext],
  ]);
  const response =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "validation_only_intent_checked",
        event: "reject_action_intent",
      }),
      createContext("review_transition_immutable"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.currentState, "validation_only_intent_checked");
  assert.equal(body.nextState, "action_intent_rejected");
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].dependencyResolutionCount, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 2);
  assert.deepEqual(beforeContext, afterContext);
  assertSafetyFields(body);
});

test("secretary appointment review state transition route accepts clinic review requirement", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "validation_only_intent_checked",
      event: "require_clinic_review",
    }),
    createContext("review_needs_clinic")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reviewId, "review_needs_clinic");
  assert.equal(body.accepted, true);
  assert.equal(body.nextState, "needs_clinic_review");
  assert.equal(body.code, "transition_accepted");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route accepts action intent rejection", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "validation_only_intent_checked",
      event: "reject_action_intent",
    }),
    createContext("review_reject_intent")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reviewId, "review_reject_intent");
  assert.equal(body.accepted, true);
  assert.equal(body.nextState, "action_intent_rejected");
  assert.equal(body.code, "transition_accepted");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route returns invalid transition as dry-run result", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "pending_secretary_review",
      event: "require_clinic_review",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.currentState, "pending_secretary_review");
  assert.equal(body.nextState, "pending_secretary_review");
  assert.equal(body.code, "invalid_transition");
  assert.match(body.reason, /not allowed/);
  assertSafetyFields(body);
});

test("secretary appointment review state transition route evaluates invalid transition against trusted state", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [
      createReviewContext("review_trusted_invalid_transition", {
        currentState: "pending_secretary_review",
        observedReviewVersion: 5,
      }),
      createReviewContext("review_trusted_invalid_transition", {
        currentState: "pending_secretary_review",
        observedReviewVersion: 5,
      }),
    ],
  ]);
  const response =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "validation_only_intent_checked",
        event: "require_clinic_review",
      }),
      createContext("review_trusted_invalid_transition"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.currentState, "pending_secretary_review");
  assert.equal(body.nextState, "pending_secretary_review");
  assert.equal(body.code, "invalid_transition");
  assertSafetyFields(body);
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 2);
});

test("secretary appointment review state transition route returns terminal state transition as dry-run result", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "needs_clinic_review",
      event: "reject_action_intent",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.currentState, "needs_clinic_review");
  assert.equal(body.nextState, "needs_clinic_review");
  assert.equal(body.code, "terminal_state_transition_rejected");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route returns unknown state as dry-run result", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "waiting_for_manager",
      event: "check_validation_only_intent",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.currentState, "waiting_for_manager");
  assert.equal(body.nextState, null);
  assert.equal(body.code, "unknown_state");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route returns unknown event as dry-run result", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "pending_secretary_review",
      event: "start_booking",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.currentState, "pending_secretary_review");
  assert.equal(body.nextState, "pending_secretary_review");
  assert.equal(body.code, "unknown_event");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route rejects missing current state safely", async () => {
  let adapterFactoryCalls = 0;
  const response = await route.POST(
    createRequest({
      event: "check_validation_only_intent",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "missing_current_state");
  assert.equal(body.error.code, "missing_current_state");
  assertSafetyFields(body);

  const injectedResponse =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        event: "check_validation_only_intent",
      }),
      createContext(),
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

test("secretary appointment review state transition route rejects missing event safely", async () => {
  let adapterFactoryCalls = 0;
  const response = await route.POST(
    createRequest({
      currentState: "pending_secretary_review",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "missing_event");
  assert.equal(body.error.code, "missing_event");
  assertSafetyFields(body);

  const injectedResponse =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "pending_secretary_review",
      }),
      createContext(),
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

test("secretary appointment review state transition route rejects invalid JSON safely", async () => {
  let adapterFactoryCalls = 0;
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
  assert.equal(body.accepted, false);
  assert.equal(body.code, "invalid_json");
  assert.equal(body.error.code, "invalid_json");
  assertSafetyFields(body);

  const injectedResponse =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      new Request(ROUTE_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{",
      }),
      createContext(),
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

test("secretary appointment review state transition route rejects missing or malformed review id safely", async () => {
  let adapterFactoryCalls = 0;
  const response = await route.POST(
    createRequest({
      currentState: "pending_secretary_review",
      event: "check_validation_only_intent",
    }),
    createContext("   ")
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "missing_review_id");
  assert.equal(body.error.code, "missing_review_id");
  assertSafetyFields(body);

  const injectedResponse =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "pending_secretary_review",
        event: "check_validation_only_intent",
      }),
      createContext("   "),
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

test("secretary appointment review state transition route rejects unsafe true side effect flags", async () => {
  const unsafeTrue = Boolean("unsafe");
  const unsafeFields = [
    "executionRequested",
    "actionPerformed",
    "bookingCreated",
    "calendarChecked",
    "appointmentCreated",
    "calendarEventCreated",
    "databasePersisted",
  ];

  for (const fieldName of unsafeFields) {
    const response = await route.POST(
      createRequest({
        currentState: "pending_secretary_review",
        event: "check_validation_only_intent",
        [fieldName]: unsafeTrue,
      }),
      createContext()
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.accepted, false);
    assert.equal(body.code, "unsafe_side_effect_field");
    assert.match(body.reason, new RegExp(fieldName));
    assertSafetyFields(body);
  }
});

test("secretary appointment review state transition route keeps adapter not found as domain error", async () => {
  const instrumentation = createInstrumentedAdapterFactory([null]);
  const response =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "pending_secretary_review",
        event: "check_validation_only_intent",
      }),
      createContext("review_transition_missing"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "review_not_found");
  assert.equal(body.error.code, "review_not_found");
  assert.equal(body.reason, "Appointment review item was not found.");
  assertSafetyFields(body);
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].dependencyResolutionCount, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 1);
  assertNoInternalLeak(body);
});

test("secretary appointment review state transition route rejects non-post methods safely", async () => {
  let adapterFactoryCalls = 0;
  const unusedOptions = {
    createRouteRuntimeAdapter() {
      adapterFactoryCalls += 1;
      return Object.freeze({
        getControlledActionDependencies() {
          throw new Error("dependency must not run for unsupported methods");
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
  assert.ok(bodies.every((body) => body.accepted === false));
  assert.ok(bodies.every((body) => body.code === "method_not_allowed"));
  assert.ok(
    bodies.every((body) => body.error.code === "method_not_allowed")
  );
  assert.ok(bodies.every((body) => body.dryRun === true));
  assert.ok(bodies.every((body) => body.validationOnly === true));
  assert.ok(bodies.every((body) => body.actionPerformed === false));
  assert.ok(bodies.every((body) => body.bookingCreated === false));
  assert.ok(bodies.every((body) => body.calendarChecked === false));
  assert.ok(bodies.every((body) => body.databasePersisted === false));
  assert.equal(adapterFactoryCalls, 0);
});

test("secretary appointment review state transition route safely contains adapter factory failures", async () => {
  let adapterFactoryCalls = 0;
  const response =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "pending_secretary_review",
        event: "check_validation_only_intent",
      }),
      createContext("review_transition_factory_failure"),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          throw new Error("STATE_TRANSITION_RUNTIME_FACTORY_INTERNAL");
        },
      }
    );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 500);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "internal_error");
  assert.equal(body.error.code, "internal_error");
  assert.equal(body.reason, "State transition dry-run runtime failed safely.");
  assert.equal(adapterFactoryCalls, 1);
  assert.doesNotMatch(serialized, /STATE_TRANSITION_RUNTIME_FACTORY_INTERNAL|Error:|stack|at /);
  assertSafetyFields(body);
  assertNoInternalLeak(body);
});

test("secretary appointment review state transition route safely contains dependency failures", async () => {
  let adapterFactoryCalls = 0;
  let dependencyResolutionCount = 0;
  const response =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "pending_secretary_review",
        event: "check_validation_only_intent",
      }),
      createContext("review_transition_dependency_failure"),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          return Object.freeze({
            getControlledActionDependencies() {
              dependencyResolutionCount += 1;
              throw new Error("STATE_TRANSITION_DEPENDENCY_INTERNAL");
            },
          });
        },
      }
    );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 500);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "internal_error");
  assert.equal(adapterFactoryCalls, 1);
  assert.equal(dependencyResolutionCount, 1);
  assert.doesNotMatch(serialized, /STATE_TRANSITION_DEPENDENCY_INTERNAL|Error:|stack|at /);
  assertSafetyFields(body);
  assertNoInternalLeak(body);
});

test("secretary appointment review state transition route safely contains trusted context failures", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    {
      throwOnCall: 1,
      throwMarker: "STATE_TRANSITION_CONTEXT_INTERNAL",
    },
  ]);
  const response =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "pending_secretary_review",
        event: "check_validation_only_intent",
      }),
      createContext("review_transition_context_failure"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 500);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "internal_error");
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].dependencyResolutionCount, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 1);
  assert.doesNotMatch(serialized, /STATE_TRANSITION_CONTEXT_INTERNAL|Error:|stack|at /);
  assertSafetyFields(body);
  assertNoInternalLeak(body);
});

test("secretary appointment review state transition route safely contains post dry-run mutation signals", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [
      createReviewContext("review_transition_mutation_signal", {
        currentState: "pending_secretary_review",
        observedReviewVersion: 8,
      }),
      createReviewContext("review_transition_mutation_signal", {
        currentState: "validation_only_intent_checked",
        observedReviewVersion: 9,
      }),
    ],
  ]);
  const response =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "pending_secretary_review",
        event: "check_validation_only_intent",
      }),
      createContext("review_transition_mutation_signal"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "internal_error");
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 2);
  assertSafetyFields(body);
  assertNoInternalLeak(body);
});

test("secretary appointment review state transition route responses do not leak runtime internals", async () => {
  const successInstrumentation = createInstrumentedAdapterFactory([
    [
      createReviewContext("review_transition_no_internal_leak"),
      createReviewContext("review_transition_no_internal_leak"),
    ],
  ]);
  const success =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "pending_secretary_review",
        event: "check_validation_only_intent",
      }),
      createContext("review_transition_no_internal_leak"),
      {
        createRouteRuntimeAdapter: successInstrumentation.createRouteRuntimeAdapter,
      }
    );
  const notFound =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "pending_secretary_review",
        event: "check_validation_only_intent",
      }),
      createContext("review_transition_not_found_no_internal_leak"),
      {
        createRouteRuntimeAdapter:
          createInstrumentedAdapterFactory([null]).createRouteRuntimeAdapter,
      }
    );
  const failure =
    await route.handleAppointmentReviewStateTransitionRouteRequest(
      createRequest({
        currentState: "pending_secretary_review",
        event: "check_validation_only_intent",
      }),
      createContext("review_transition_bad_adapter"),
      {
        createRouteRuntimeAdapter() {
          return Object.freeze({});
        },
      }
    );
  const domainFailure = await route.POST(
    createRequest({
      currentState: "pending_secretary_review",
      event: "require_clinic_review",
    }),
    createContext("review_transition_domain_failure")
  );
  const invalid = await route.POST(
    createRequest({
      event: "check_validation_only_intent",
    }),
    createContext("review_transition_invalid")
  );
  const bodies = await Promise.all([
    success.json(),
    notFound.json(),
    failure.json(),
    domainFailure.json(),
    invalid.json(),
  ]);

  assert.equal(success.status, 200);
  assert.equal(notFound.status, 404);
  assert.equal(failure.status, 500);
  assert.equal(domainFailure.status, 200);
  assert.equal(invalid.status, 400);
  bodies.forEach((body) => assertNoInternalLeak(body));
});

test("secretary appointment review state transition route has no execution imports or stateful store access", () => {
  const source = fs.readFileSync(
    [
      "app/api/secretary/appointment-reviews/[id]/state-transition/route",
      "js",
    ].join("."),
    "utf8"
  );
  const forbidden = [
    "create" + "Appointment",
    "create" + "CalendarEvent",
    "get" + "CalendarProvider",
    "manual" + "AppointmentCalendarSync",
    "google" + "apis",
    "pri" + "sma",
    "supa" + "base",
    "re" + "dis",
    "appointment" + "ReviewQueue",
    "list" + "AppointmentReviews",
    "get" + "AppointmentReviewById",
    "update" + "AppointmentReviewStatus",
    "process" + "\\." + "env",
    "fe" + "tch",
    "Async" + "LocalStorage",
    "global" + "This",
    "new " + "Map\\(",
  ];

  assert.match(source, /transitionAppointmentReviewActionIntentState/);
  assert.match(source, /appointmentReviewRouteRuntimeAdapter/);
  assert.doesNotMatch(source, /appointmentReviewInMemoryMockServerRuntime/);
  assert.doesNotMatch(
    source,
    /appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider/
  );
  assert.doesNotMatch(source, /appointmentReviewHybridControlledActionDependencies/);
  assert.doesNotMatch(source, /appointmentReviewRepositoryContextResolver/);
  assert.doesNotMatch(source, /appointmentReviewRepository/);

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
});
