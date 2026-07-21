const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  DELETE,
  GET,
  handleAppointmentReviewQueueCollectionRouteRequest,
  PATCH,
  POST,
  PUT,
} = require("../app/api/secretary/appointment-reviews/route");
const detailRoute = require("../app/api/secretary/appointment-reviews/[id]/route");

const COLLECTION_ROUTE_SOURCE_PATH =
  "app/api/secretary/appointment-reviews/route.js";

const FORBIDDEN_COLLECTION_ROUTE_INFRASTRUCTURE = Object.freeze([
  "appointmentReviewInMemoryMockServerRuntime",
  "appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider",
  "appointmentReviewHybridControlledActionDependencies",
  "appointmentReviewRepositoryContextResolver",
  "appointmentReviewRepository",
  "createInMemoryMockAppointmentReviewServerRuntime",
  "createInMemoryAppointmentReviewRepository",
  "createInMemoryAppointmentReviewQueue",
  "getAppointmentReviewQueue",
  "getControlledActionRuntimeDependencyProvider",
  "receiptStore",
  "auditStore",
  "idempotencyStore",
  "commandBus",
  "eventBus",
  "jobQueue",
]);

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

function createSafeReview(id) {
  return {
    id,
    status: "pending_secretary_review",
    source: "mock",
    selectedSlot: {
      id: `${id}_slot`,
      day: "2026-07-21",
      time: "10:30",
      doctorName: "Dr. Mock",
      durationMinutes: 30,
    },
    treatment: "implant",
    day: "2026-07-21",
    appointmentPurpose: "implant",
    appointmentPurposeLabel: "Implant",
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
    metadata: {
      conversationKey: "synthetic-review",
    },
  };
}

function createInstrumentedAdapterFactory(reviewBatches) {
  const calls = [];

  return {
    calls,
    createRouteRuntimeAdapter(options) {
      const call = {
        options,
        adapter: null,
        listCallCount: 0,
      };
      const reviews = reviewBatches[calls.length] || [];
      const adapter = Object.freeze({
        listAppointmentReviews() {
          call.listCallCount += 1;
          return reviews;
        },
      });

      call.adapter = adapter;
      calls.push(call);

      return adapter;
    },
  };
}

async function getCollectionWithAdapter(adapterFactory) {
  const response = await handleAppointmentReviewQueueCollectionRouteRequest(
    new Request("http://localhost/api/secretary/appointment-reviews"),
    {
      createRouteRuntimeAdapter: adapterFactory,
    }
  );

  return {
    response,
    body: await response.json(),
  };
}

function assertReadOnlyQueueSafety(body) {
  assert.equal(body.source, "mock");
  assert.equal(body.mode, "read_only");
  assert.equal(body.persistence, "not_persisted");
  assert.equal(body.persisted, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.appointmentCreated, false);
  assert.equal(body.safety.readOnly, true);
  assert.equal(body.safety.mode, "read_only");
  assert.equal(body.safety.bookingCreated, false);
  assert.equal(body.safety.calendarChecked, false);
  assert.equal(body.safety.requiresSecretaryConfirmation, true);
  assert.equal(body.safety.createsAppointment, false);
  assert.equal(body.safety.writesCalendar, false);
  assert.equal(body.safety.checksCalendarConflict, false);
  assert.equal(body.safety.usesDatabase, false);
  assert.equal(body.safety.approvalActionsEnabled, false);
  assert.equal(body.safety.bookingActionsEnabled, false);
  assert.equal(body.safety.calendarActionsEnabled, false);
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

test("secretary appointment review queue GET route returns safe empty mock response", async () => {
  const response = await GET(
    new Request("http://localhost/api/secretary/appointment-reviews")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.source, "mock");
  assert.equal(body.mode, "read_only");
  assert.equal(body.persistence, "not_persisted");
  assert.equal(body.persisted, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.appointmentCreated, false);
  assert.deepEqual(body.reviews, []);
  assert.equal(body.count, 0);
  assert.equal(body.safety.readOnly, true);
  assert.equal(body.safety.mode, "read_only");
  assert.equal(body.safety.bookingCreated, false);
  assert.equal(body.safety.calendarChecked, false);
  assert.equal(body.safety.requiresSecretaryConfirmation, true);
  assert.equal(body.safety.createsAppointment, false);
  assert.equal(body.safety.writesCalendar, false);
  assert.equal(body.safety.checksCalendarConflict, false);
  assert.equal(body.safety.usesDatabase, false);
  assert.equal(body.safety.approvalActionsEnabled, false);
  assert.equal(body.safety.bookingActionsEnabled, false);
  assert.equal(body.safety.calendarActionsEnabled, false);
});

test("secretary appointment review queue GET route uses one route runtime adapter list capability", async () => {
  const review = createSafeReview("review_route_adapter_list");
  const instrumentation = createInstrumentedAdapterFactory([[review]]);
  const { response, body } = await getCollectionWithAdapter(
    instrumentation.createRouteRuntimeAdapter
  );

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.count, 1);
  assert.equal(body.reviews[0].id, "review_route_adapter_list");
  assertReadOnlyQueueSafety(body);
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].listCallCount, 1);
  assert.equal(typeof instrumentation.calls[0].options.resolveControlledActionState, "function");
  assert.equal(Object.hasOwn(instrumentation.calls[0].options, "repository"), false);
  assert.equal(Object.hasOwn(instrumentation.calls[0].adapter, "repository"), false);
  assert.equal(Object.hasOwn(instrumentation.calls[0].adapter, "queue"), false);
  assert.equal(typeof instrumentation.calls[0].adapter.addAppointmentReview, "undefined");
});

test("secretary appointment review queue GET route creates exactly one adapter scope per request", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [createSafeReview("review_single_scope")],
  ]);
  const { response, body } = await getCollectionWithAdapter(
    instrumentation.createRouteRuntimeAdapter
  );

  assert.equal(response.status, 200);
  assert.equal(body.reviews[0].id, "review_single_scope");
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].listCallCount, 1);
  assert.equal(Object.isFrozen(instrumentation.calls[0].adapter), true);
  assert.equal(instrumentation.calls.length, 1);
});

test("secretary appointment review queue GET route keeps separate requests isolated", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [createSafeReview("review_isolated_a")],
    [createSafeReview("review_isolated_b")],
  ]);
  const first = await getCollectionWithAdapter(
    instrumentation.createRouteRuntimeAdapter
  );
  const second = await getCollectionWithAdapter(
    instrumentation.createRouteRuntimeAdapter
  );

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(first.body.reviews[0].id, "review_isolated_a");
  assert.equal(second.body.reviews[0].id, "review_isolated_b");
  assert.equal(instrumentation.calls.length, 2);
  assert.notEqual(instrumentation.calls[0].adapter, instrumentation.calls[1].adapter);
  assert.equal(instrumentation.calls[0].listCallCount, 1);
  assert.equal(instrumentation.calls[1].listCallCount, 1);
});

test("secretary appointment review queue GET route does not claim booking or calendar checks", async () => {
  const response = await GET(
    new Request("http://localhost/api/secretary/appointment-reviews")
  );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.doesNotMatch(serialized, /"bookingCreated":true/);
  assert.doesNotMatch(serialized, /"calendarChecked":true/);
  assert.doesNotMatch(serialized, /randevunuz oluşturuldu|booked|confirmed/i);
});

test("secretary appointment review detail route returns safe not found without persistent queue", async () => {
  const response = await detailRoute.GET(
    new Request("http://localhost/api/secretary/appointment-reviews/review_demo"),
    {
      params: {
        id: "review_demo",
      },
    }
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.status, "error");
  assert.equal(body.source, "mock");
  assert.equal(body.mode, "read_only");
  assert.equal(body.persistence, "not_persisted");
  assert.equal(body.persisted, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.appointmentCreated, false);
  assert.equal(body.safety.readOnly, true);
  assert.equal(body.safety.bookingCreated, false);
  assert.equal(body.safety.calendarChecked, false);
  assert.equal(body.safety.usesDatabase, false);
  assert.equal(body.error.code, "review_not_found");
});

test("secretary appointment review detail route rejects malformed empty id safely", async () => {
  const response = await detailRoute.GET(
    new Request("http://localhost/api/secretary/appointment-reviews/%20"),
    {
      params: {
        id: "   ",
      },
    }
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "error");
  assert.equal(body.source, "mock");
  assert.equal(body.mode, "read_only");
  assert.equal(body.safety.readOnly, true);
  assert.equal(body.error.code, "missing_review_id");
});

test("secretary appointment review queue route rejects non-read methods", async () => {
  const requestUrl = "http://localhost/api/secretary/appointment-reviews";
  let adapterFactoryCalls = 0;
  let listCalls = 0;
  const unusedOptions = {
    createRouteRuntimeAdapter() {
      adapterFactoryCalls += 1;

      return Object.freeze({
        listAppointmentReviews() {
          listCalls += 1;
          return [];
        },
      });
    },
  };
  const responses = await Promise.all([
    POST(new Request(requestUrl, { method: "POST" }), unusedOptions),
    PUT(new Request(requestUrl, { method: "PUT" }), unusedOptions),
    PATCH(new Request(requestUrl, { method: "PATCH" }), unusedOptions),
    DELETE(new Request(requestUrl, { method: "DELETE" }), unusedOptions),
  ]);
  const bodies = await Promise.all(
    responses.map((response) => response.json())
  );

  assert.ok(responses.every((response) => response.status === 405));
  assert.ok(bodies.every((body) => body.status === "error"));
  assert.ok(bodies.every((body) => body.source === "mock"));
  assert.ok(bodies.every((body) => body.mode === "read_only"));
  assert.ok(bodies.every((body) => body.safety.readOnly === true));
  assert.ok(
    bodies.every((body) => body.error.code === "method_not_allowed")
  );
  assert.equal(adapterFactoryCalls, 0);
  assert.equal(listCalls, 0);
});

test("secretary appointment review queue route safely contains adapter factory failures", async () => {
  let adapterFactoryCalls = 0;
  const response = await handleAppointmentReviewQueueCollectionRouteRequest(
    new Request("http://localhost/api/secretary/appointment-reviews"),
    {
      createRouteRuntimeAdapter() {
        adapterFactoryCalls += 1;
        throw new Error("deterministic_raw_factory_marker");
      },
    }
  );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 500);
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "internal_error");
  assert.equal(body.error.message, "Secretary appointment review queue runtime failed safely.");
  assertReadOnlyQueueSafety(body);
  assert.equal(adapterFactoryCalls, 1);
  assert.doesNotMatch(serialized, /deterministic_raw_factory_marker|Error:|stack|at /);
  assertNoInternalLeak(body);
});

test("secretary appointment review queue route safely contains adapter list failures", async () => {
  let adapterFactoryCalls = 0;
  let listCalls = 0;
  const response = await handleAppointmentReviewQueueCollectionRouteRequest(
    new Request("http://localhost/api/secretary/appointment-reviews"),
    {
      createRouteRuntimeAdapter() {
        adapterFactoryCalls += 1;

        return Object.freeze({
          listAppointmentReviews() {
            listCalls += 1;
            throw new Error("deterministic_raw_list_marker");
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
  assertReadOnlyQueueSafety(body);
  assert.equal(adapterFactoryCalls, 1);
  assert.equal(listCalls, 1);
  assert.doesNotMatch(serialized, /deterministic_raw_list_marker|Error:|stack|at /);
  assertNoInternalLeak(body);
});

test("secretary appointment review queue route responses do not leak runtime internals", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [createSafeReview("review_no_internal_leak")],
  ]);
  const success = await getCollectionWithAdapter(
    instrumentation.createRouteRuntimeAdapter
  );
  const failureResponse =
    await handleAppointmentReviewQueueCollectionRouteRequest(
      new Request("http://localhost/api/secretary/appointment-reviews"),
      {
        createRouteRuntimeAdapter() {
          return Object.freeze({
            listAppointmentReviews() {
              return null;
            },
          });
        },
      }
    );
  const failureBody = await failureResponse.json();

  assert.equal(success.response.status, 200);
  assert.equal(failureResponse.status, 500);
  assertNoInternalLeak(success.body);
  assertNoInternalLeak(failureBody);
});

test("secretary appointment review collection route imports only the route adapter boundary", () => {
  const source = fs.readFileSync(COLLECTION_ROUTE_SOURCE_PATH, "utf8");

  assert.match(source, /appointmentReviewRouteRuntimeAdapter/);

  for (const forbidden of FORBIDDEN_COLLECTION_ROUTE_INFRASTRUCTURE) {
    assert.doesNotMatch(source, new RegExp(forbidden, "i"), forbidden);
  }

  assert.doesNotMatch(source, /createAppointment\(/);
  assert.doesNotMatch(source, /createCalendarEvent\(/);
  assert.doesNotMatch(source, /getCalendarProvider\(/);
  assert.doesNotMatch(source, /manualAppointmentCalendarSync/);
  assert.doesNotMatch(source, /googleapis|prisma|supabase|redis|fetch\(/i);
  assert.doesNotMatch(source, /require\([^)]*executor|executor\(|new Executor/i);
  assert.doesNotMatch(source, /require\([^)]*dispatcher|dispatcher\(|new Dispatcher/i);
  assert.doesNotMatch(source, /AsyncLocalStorage|globalThis|new Map\(/);
});

test("secretary appointment review detail route rejects non-read methods", async () => {
  const requestUrl = "http://localhost/api/secretary/appointment-reviews/review_demo";
  const context = {
    params: {
      id: "review_demo",
    },
  };
  const responses = await Promise.all([
    detailRoute.POST(new Request(requestUrl, { method: "POST" }), context),
    detailRoute.PUT(new Request(requestUrl, { method: "PUT" }), context),
    detailRoute.PATCH(new Request(requestUrl, { method: "PATCH" }), context),
    detailRoute.DELETE(new Request(requestUrl, { method: "DELETE" }), context),
  ]);
  const bodies = await Promise.all(
    responses.map((response) => response.json())
  );

  assert.ok(responses.every((response) => response.status === 405));
  assert.ok(bodies.every((body) => body.status === "error"));
  assert.ok(bodies.every((body) => body.source === "mock"));
  assert.ok(bodies.every((body) => body.mode === "read_only"));
  assert.ok(bodies.every((body) => body.safety.readOnly === true));
  assert.ok(
    bodies.every((body) => body.error.code === "method_not_allowed")
  );
});

test("secretary appointment review queue route has no appointment or calendar side effects", async () => {
  let appointmentCreationCalled = false;
  let calendarProviderCalled = false;

  const response = await GET(
    new Request("http://localhost/api/secretary/appointment-reviews")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.safety.createsAppointment, false);
  assert.equal(body.safety.writesCalendar, false);
  assert.equal(body.safety.usesDatabase, false);
  assert.equal(appointmentCreationCalled, false);
  assert.equal(calendarProviderCalled, false);
});
