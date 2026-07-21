const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const validationRoute = require("../app/api/secretary/appointment-reviews/[id]/controlled-action-validation/route");
const receiptRoute = require("../app/api/secretary/appointment-reviews/[id]/controlled-action-validation-receipt/route");
const {
  createAppointmentReviewRouteRuntimeAdapter,
} = require("../src/secretary/appointmentReviewRouteRuntimeAdapter");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

const VALIDATION_ROUTE_SOURCE_PATH =
  "app/api/secretary/appointment-reviews/[id]/controlled-action-validation/route.js";
const RECEIPT_ROUTE_SOURCE_PATH =
  "app/api/secretary/appointment-reviews/[id]/controlled-action-validation-receipt/route.js";

const VALIDATION_ROUTE_URL =
  "ht" +
  "tp://localhost/api/secretary/appointment-reviews/review_guard_validation/controlled-action-validation";
const RECEIPT_ROUTE_URL =
  "ht" +
  "tp://localhost/api/secretary/appointment-reviews/review_guard_receipt/controlled-action-validation-receipt";

const FORBIDDEN_ROUTE_INFRASTRUCTURE = Object.freeze([
  "appointmentReviewInMemoryMockServerRuntime",
  "appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider",
  "appointmentReviewHybridControlledActionDependencies",
  "appointmentReviewRepositoryContextResolver",
  "appointmentReviewRepository",
  "appointmentReviewMockControlledActionDependencies",
  "createHybridAppointmentReviewControlledActionDependencies",
  "createInMemoryAppointmentReviewRepository",
  "createAppointmentReviewRepositoryContextResolver",
  "getControlledActionRuntimeDependencyProvider",
  "receiptStore",
  "auditStore",
  "idempotencyStore",
  "commandBus",
  "eventBus",
  "jobQueue",
]);

const FORBIDDEN_PUBLIC_KEYS = Object.freeze([
  "repository",
  "repositoryInstance",
  "rawRepository",
  "runtime",
  "serverRuntime",
  "rawRuntime",
  "compositionRoot",
  "dependencyProvider",
  "rawDependencyProvider",
  "queue",
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
  "receiptStore",
  "idempotencyStore",
  "calendarProvider",
  "bookingService",
]);

function createValidPayload(overrides = {}) {
  return {
    actionIntent: "approve_intent",
    requestId: "controlled-action-boundary-guard",
    idempotencyKey: "controlled-action-boundary-guard-key",
    expectedReviewVersion: 1,
    ...overrides,
  };
}

function createRequest(url, payload) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function createContext(id) {
  return {
    params: {
      id,
    },
  };
}

function createInstrumentedAdapterFactory() {
  const calls = [];

  return {
    calls,
    createRouteRuntimeAdapter(options) {
      const dependencies = createMockAppointmentReviewControlledActionDependencies();
      const adapter = Object.freeze({
        getControlledActionDependencies() {
          calls[calls.length - 1].dependencyResolutionCount += 1;
          calls[calls.length - 1].resolvedBy = adapter;
          return dependencies;
        },
      });

      calls.push({
        adapter,
        options,
        dependencyResolutionCount: 0,
        resolvedBy: null,
      });

      return adapter;
    },
  };
}

async function postValidationWithAdapter(reviewId, adapterFactory) {
  const response = await validationRoute.handleControlledActionValidationRouteRequest(
    createRequest(VALIDATION_ROUTE_URL, createValidPayload()),
    createContext(reviewId),
    {
      createRouteRuntimeAdapter: adapterFactory,
    }
  );

  return {
    response,
    body: await response.json(),
  };
}

async function postReceiptWithAdapter(reviewId, adapterFactory) {
  const response =
    await receiptRoute.handleControlledActionValidationReceiptRouteRequest(
      createRequest(RECEIPT_ROUTE_URL, createValidPayload()),
      createContext(reviewId),
      {
        createRouteRuntimeAdapter: adapterFactory,
      }
    );

  return {
    response,
    body: await response.json(),
  };
}

function assertRouteImportsAdapterOnly(sourcePath) {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /appointmentReviewRouteRuntimeAdapter/);

  for (const forbidden of FORBIDDEN_ROUTE_INFRASTRUCTURE) {
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
}

function assertAdapterScope(calls, expectedReviewId) {
  assert.equal(calls.length, 1);
  assert.equal(calls[0].dependencyResolutionCount, 1);
  assert.equal(calls[0].resolvedBy, calls[0].adapter);
  assert.equal(typeof calls[0].options.resolveControlledActionState, "function");
  assert.equal(calls[0].options.initialReviews.length, 1);
  assert.equal(calls[0].options.initialReviews[0].id, expectedReviewId);
  assert.equal(Object.hasOwn(calls[0].options, "repository"), false);
  assert.equal(Object.hasOwn(calls[0].adapter, "repository"), false);
}

function assertSafetyFields(value) {
  assert.equal(value.validationOnly, true);
  assert.equal(value.controlledHandlingOnly, true);
  assert.equal(value.executionEnabled, false);
  assert.equal(value.executorAvailable, false);
  assert.equal(value.executionAvailable, false);
  assert.equal(value.executionRequested, false);
  assert.equal(value.actionPerformed, false);
  assert.equal(value.commandDispatched, false);
  assert.equal(value.commandPersisted, false);
  assert.equal(value.bookingCreated, false);
  assert.equal(value.calendarChecked, false);
  assert.equal(value.appointmentCreated, false);
  assert.equal(value.calendarEventCreated, false);
  assert.equal(value.databasePersisted, false);
  assert.equal(value.persistence, "not_persisted");
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
    assert.equal(FORBIDDEN_PUBLIC_KEYS.includes(key), false, `${path}.${key}`);
    assert.notEqual(typeof nestedValue, "function", `${path}.${key}`);
    assertNoInternalLeak(nestedValue, `${path}.${key}`);
  }
}

function assertDescriptorSafety(descriptor) {
  assert.equal(descriptor.mock, true);
  assert.equal(descriptor.inMemory, true);
  assert.equal(descriptor.validationOnly, true);
  assert.equal(descriptor.controlledHandlingOnly, true);
  assert.equal(descriptor.persistence, "not_persisted");
  assert.equal(descriptor.databasePersisted, false);
  assert.equal(descriptor.executionEnabled, false);
  assert.equal(descriptor.executorAvailable, false);
  assert.equal(descriptor.executionAvailable, false);
}

test("controlled-action validation route imports the route adapter but no lower runtime infrastructure", () => {
  assertRouteImportsAdapterOnly(VALIDATION_ROUTE_SOURCE_PATH);
});

test("controlled-action receipt route imports the route adapter but no lower runtime infrastructure", () => {
  assertRouteImportsAdapterOnly(RECEIPT_ROUTE_SOURCE_PATH);
});

test("controlled-action validation route creates exactly one adapter per request", async () => {
  const instrumentation = createInstrumentedAdapterFactory();
  const { response, body } = await postValidationWithAdapter(
    "review_guard_validation_scope",
    instrumentation.createRouteRuntimeAdapter
  );

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.reviewId, "review_guard_validation_scope");
  assertAdapterScope(instrumentation.calls, "review_guard_validation_scope");
  assertSafetyFields(body);
});

test("controlled-action receipt route creates exactly one adapter per request", async () => {
  const instrumentation = createInstrumentedAdapterFactory();
  const { response, body } = await postReceiptWithAdapter(
    "review_guard_receipt_scope",
    instrumentation.createRouteRuntimeAdapter
  );

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.receiptOutcome, "validation_passed");
  assert.equal(body.reviewId, "review_guard_receipt_scope");
  assertAdapterScope(instrumentation.calls, "review_guard_receipt_scope");
  assertSafetyFields(body);
  assert.equal(body.receiptPersisted, false);
});

test("controlled-action validation requests receive isolated adapter instances", async () => {
  const instrumentation = createInstrumentedAdapterFactory();
  const first = await postValidationWithAdapter(
    "review_guard_validation_a",
    instrumentation.createRouteRuntimeAdapter
  );
  const second = await postValidationWithAdapter(
    "review_guard_validation_b",
    instrumentation.createRouteRuntimeAdapter
  );

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(instrumentation.calls.length, 2);
  assert.notEqual(instrumentation.calls[0].adapter, instrumentation.calls[1].adapter);
  assert.equal(first.body.reviewId, "review_guard_validation_a");
  assert.equal(second.body.reviewId, "review_guard_validation_b");
});

test("controlled-action receipt requests receive isolated adapter instances", async () => {
  const instrumentation = createInstrumentedAdapterFactory();
  const first = await postReceiptWithAdapter(
    "review_guard_receipt_a",
    instrumentation.createRouteRuntimeAdapter
  );
  const second = await postReceiptWithAdapter(
    "review_guard_receipt_b",
    instrumentation.createRouteRuntimeAdapter
  );

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(instrumentation.calls.length, 2);
  assert.notEqual(instrumentation.calls[0].adapter, instrumentation.calls[1].adapter);
  assert.equal(first.body.reviewId, "review_guard_receipt_a");
  assert.equal(second.body.reviewId, "review_guard_receipt_b");
  assert.equal(first.body.receiptOutcome, "validation_passed");
  assert.equal(second.body.receiptOutcome, "validation_passed");
});

test("route runtime adapter keeps a narrow immutable public contract", () => {
  const adapter = createAppointmentReviewRouteRuntimeAdapter({
    resolveControlledActionState() {
      return "validation_only_intent_checked";
    },
  });
  const descriptor = adapter.getRuntimeDescriptor();

  assert.deepEqual(Object.keys(adapter).sort(), [
    "adapterSource",
    "adapterType",
    "getAppointmentReviewById",
    "getAppointmentReviewQueue",
    "getControlledActionDependencies",
    "getRuntimeDescriptor",
    "listAppointmentReviews",
    "schemaVersion",
  ].sort());
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal(Object.isFrozen(descriptor), true);
  assertDescriptorSafety(descriptor);

  adapter.repository = {};
  adapter.runtime = {};
  descriptor.executionEnabled = true;

  assert.equal(Object.hasOwn(adapter, "repository"), false);
  assert.equal(Object.hasOwn(adapter, "runtime"), false);
  assertDescriptorSafety(descriptor);

  for (const key of FORBIDDEN_PUBLIC_KEYS) {
    assert.equal(Object.hasOwn(adapter, key), false, key);
    assert.equal(Object.hasOwn(descriptor, key), false, key);
  }
});

test("controlled-action route responses do not leak runtime adapter internals", async () => {
  const validation = await validationRoute.POST(
    createRequest(VALIDATION_ROUTE_URL, createValidPayload()),
    createContext("review_guard_validation_response")
  );
  const receipt = await receiptRoute.POST(
    createRequest(RECEIPT_ROUTE_URL, createValidPayload()),
    createContext("review_guard_receipt_response")
  );
  const validationBody = await validation.json();
  const receiptBody = await receipt.json();

  assert.equal(validation.status, 200);
  assert.equal(receipt.status, 200);
  assert.equal(validationBody.accepted, true);
  assert.equal(receiptBody.accepted, true);
  assertNoInternalLeak(validationBody);
  assertNoInternalLeak(receiptBody);
  assertSafetyFields(validationBody);
  assertSafetyFields(receiptBody);
  assert.equal(receiptBody.receiptPersisted, false);
});

test("controlled-action route failure contracts remain stable under guardrails", async () => {
  const invalidValidation = await validationRoute.POST(
    createRequest(VALIDATION_ROUTE_URL, createValidPayload({
      actionIntent: "book_appointment",
    })),
    createContext("review_guard_invalid_validation")
  );
  const missingValidationId = await validationRoute.POST(
    createRequest(VALIDATION_ROUTE_URL, createValidPayload()),
    createContext(" ")
  );
  const invalidReceipt = await receiptRoute.POST(
    createRequest(RECEIPT_ROUTE_URL, createValidPayload({
      actionIntent: "book_appointment",
    })),
    createContext("review_guard_invalid_receipt")
  );
  const missingReceiptId = await receiptRoute.POST(
    createRequest(RECEIPT_ROUTE_URL, createValidPayload()),
    createContext(" ")
  );

  const invalidValidationBody = await invalidValidation.json();
  const missingValidationIdBody = await missingValidationId.json();
  const invalidReceiptBody = await invalidReceipt.json();
  const missingReceiptIdBody = await missingReceiptId.json();

  assert.equal(invalidValidation.status, 200);
  assert.equal(invalidValidationBody.accepted, false);
  assert.equal(invalidValidationBody.code, "validation_pipeline_rejected");
  assertSafetyFields(invalidValidationBody);

  assert.equal(missingValidationId.status, 400);
  assert.equal(missingValidationIdBody.code, "missing_review_id");
  assertSafetyFields(missingValidationIdBody);

  assert.equal(invalidReceipt.status, 200);
  assert.equal(invalidReceiptBody.accepted, true);
  assert.equal(invalidReceiptBody.receiptOutcome, "validation_rejected");
  assertSafetyFields(invalidReceiptBody);
  assert.equal(invalidReceiptBody.receiptPersisted, false);

  assert.equal(missingReceiptId.status, 400);
  assert.equal(missingReceiptIdBody.code, "missing_review_id");
  assertSafetyFields(missingReceiptIdBody);
  assert.equal(missingReceiptIdBody.receiptPersisted, false);
});
