const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/[id]/controlled-action-validation-receipt/route");
const validationRoute = require("../app/api/secretary/appointment-reviews/[id]/controlled-action-validation/route");
const actionPreconditionsRoute = require("../app/api/secretary/appointment-reviews/[id]/action-preconditions/route");
const {
  handleAppointmentReviewControlledActionValidationReceipt,
} = require("../src/api/secretaryAppointmentReviewControlledActionValidationReceiptHandler");
const {
  constructAppointmentReviewValidationDecisionReceipt,
} = require("../src/secretary/appointmentReviewValidationDecisionReceiptContract");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

const ROUTE_SOURCE_PATH =
  "app/api/secretary/appointment-reviews/[id]/controlled-action-validation-receipt/route.js";
const ROUTE_URL =
  "ht" +
  "tp://localhost/api/secretary/appointment-reviews/review_receipt_route/controlled-action-validation-receipt";

const EXPECTED_ROUTE_SAFETY_FIELDS = Object.freeze({
  mock: true,
  dryRun: true,
  validationOnly: true,
  controlledHandlingOnly: true,
  executionEnabled: false,
  executorAvailable: false,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  commandDispatched: false,
  commandPersisted: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
  authenticated: false,
  authorized: false,
  reviewFound: false,
  persisted: false,
  receiptLogged: false,
  receiptPublished: false,
  executionReady: false,
  appointmentApproved: false,
  appointmentRejected: false,
  productionAuthentication: false,
  productionAuthorization: false,
  authenticationMode: "mock_validation_only",
});

function createValidPayload(overrides = {}) {
  return {
    actionIntent: "approve_intent",
    requestId: "controlled-action-receipt-preview",
    idempotencyKey: "controlled-action-receipt-preview-key",
    expectedReviewVersion: 1,
    ...overrides,
  };
}

function createRequest(payload) {
  return new Request(ROUTE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function createContext(id = "review_receipt_route") {
  return {
    params: {
      id,
    },
  };
}

async function post(payload, id = "review_receipt_route") {
  const response = await route.POST(createRequest(payload), createContext(id));
  const body = await response.json();

  return { response, body };
}

function assertRouteSafetyFields(body) {
  for (const [field, value] of Object.entries(EXPECTED_ROUTE_SAFETY_FIELDS)) {
    assert.equal(body[field], value, field);
  }
}

function assertReceiptSuccess(body, outcome) {
  assert.equal(body.accepted, true);
  assert.equal(body.receiptHandlerCompleted, true);
  assert.equal(body.validationReceiptConstructed, true);
  assert.equal(body.receiptOutcome, outcome);
  assert.equal(body.validationReceipt.outcome, outcome);
  assert.equal(body.code, "controlled_action_validation_receipt_handler_completed");
  assertRouteSafetyFields(body);
}

function assertRouteError(body, code) {
  assert.equal(body.accepted, false);
  assert.equal(body.receiptHandlerCompleted, false);
  assert.equal(body.validationReceiptConstructed, false);
  assert.equal(body.validationReceipt, null);
  assert.equal(body.receiptOutcome, null);
  assert.equal(body.code, code);
  assert.equal(body.error.code, code);
  assertRouteSafetyFields(body);
}

test("controlled action validation receipt route accepts approve request with HTTP 200", async () => {
  const { response, body } = await post(createValidPayload());

  assert.equal(response.status, 200);
  assertReceiptSuccess(body, "validation_passed");
  assert.equal(body.handlerResult.accepted, true);
});

test("controlled action validation receipt route accepts reject request with HTTP 200", async () => {
  const { response, body } = await post(
    createValidPayload({
      actionIntent: "reject_intent",
      idempotencyKey: "controlled-action-receipt-reject-key",
    }),
    "review_receipt_reject"
  );

  assert.equal(response.status, 200);
  assertReceiptSuccess(body, "validation_passed");
  assert.equal(body.handlerResult.pipelineResult.commandEnvelope.actionIntent, "reject_intent");
  assert.equal(body.validationReceipt.correlation.requiredPermission, "appointment_review:reject");
});

test("controlled action validation receipt route returns handler result receipt and receipt outcome", async () => {
  const { body } = await post(createValidPayload());

  assert.equal(typeof body.handlerResult, "object");
  assert.equal(typeof body.validationReceipt, "object");
  assert.equal(body.receiptOutcome, "validation_passed");
  assert.equal(body.receiptPersisted, false);
});

test("controlled action validation receipt route uses route review id only", async () => {
  const { body } = await post(createValidPayload(), "review_route_only_receipt");

  assert.equal(body.reviewId, "review_route_only_receipt");
  assert.equal(body.handlerResult.reviewId, "review_route_only_receipt");
  assert.equal(body.validationReceipt.reviewId, "review_route_only_receipt");
});

test("controlled action validation receipt route rejects body reviewId override", async () => {
  const { response, body } = await post(
    createValidPayload({ reviewId: "body_review_must_not_win" })
  );

  assert.equal(response.status, 400);
  assertRouteError(body, "client_trusted_context_injection");
  assert.match(body.reason, /reviewId/);
});

test("controlled action validation receipt route uses Sprint 12K dependency bundle", async () => {
  const { body } = await post(createValidPayload());

  assert.equal(
    body.validationReceipt.correlation.actorId,
    "secretary-mock"
  );
  assert.equal(
    body.handlerResult.assemblyResult.pipelineInput.preconditionsInput.currentState,
    "validation_only_intent_checked"
  );
  assert.equal(
    body.handlerResult.assemblyResult.pipelineInput.priorIdempotencyObservation,
    null
  );
});

test("controlled action validation receipt route obtains dependencies through the route runtime adapter", async () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();
  let adapterFactoryCalls = 0;
  let dependencyResolutionCalls = 0;
  const response =
    await route.handleControlledActionValidationReceiptRouteRequest(
      createRequest(createValidPayload()),
      createContext(),
      {
        createRouteRuntimeAdapter(options) {
          adapterFactoryCalls += 1;
          assert.equal(typeof options.resolveControlledActionState, "function");
          assert.equal(options.initialReviews.length, 1);
          assert.equal(options.initialReviews[0].id, "review_receipt_route");

          return Object.freeze({
            getControlledActionDependencies() {
              dependencyResolutionCalls += 1;
              return dependencies;
            },
          });
        },
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(adapterFactoryCalls, 1);
  assert.equal(dependencyResolutionCalls, 1);
  assertReceiptSuccess(body, "validation_passed");
  assert.equal(
    body.handlerResult.assemblyResult.pipelineInput.preconditionsInput.reviewId,
    "review_receipt_route"
  );
});

test("controlled action validation receipt route creates exactly one adapter scope per request", async () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();
  const adapters = [];
  const response =
    await route.handleControlledActionValidationReceiptRouteRequest(
      createRequest(createValidPayload()),
      createContext("review_receipt_single_scope"),
      {
        createRouteRuntimeAdapter() {
          const adapter = Object.freeze({
            getControlledActionDependencies() {
              assert.equal(adapters[0], adapter);
              return dependencies;
            },
          });

          adapters.push(adapter);
          return adapter;
        },
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(adapters.length, 1);
  assertReceiptSuccess(body, "validation_passed");
  assert.equal(body.reviewId, "review_receipt_single_scope");
});

test("controlled action validation receipt route creates isolated adapter scopes for separate requests", async () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();
  const adapters = [];

  async function postWithInjectedAdapter(reviewId) {
    const response =
      await route.handleControlledActionValidationReceiptRouteRequest(
        createRequest(createValidPayload()),
        createContext(reviewId),
        {
          createRouteRuntimeAdapter() {
            const adapter = Object.freeze({
              getControlledActionDependencies() {
                return dependencies;
              },
            });

            adapters.push(adapter);
            return adapter;
          },
        }
      );

    return response.json();
  }

  const firstBody = await postWithInjectedAdapter("review_receipt_request_a");
  const secondBody = await postWithInjectedAdapter("review_receipt_request_b");

  assert.equal(adapters.length, 2);
  assert.notEqual(adapters[0], adapters[1]);
  assert.equal(firstBody.reviewId, "review_receipt_request_a");
  assert.equal(secondBody.reviewId, "review_receipt_request_b");
  assertReceiptSuccess(firstBody, "validation_passed");
  assertReceiptSuccess(secondBody, "validation_passed");
});

test("controlled action validation receipt route source calls Sprint 12O handler once and not Sprint 12J or 12N directly", () => {
  const source = fs.readFileSync(ROUTE_SOURCE_PATH, "utf8");

  assert.equal(
    source.match(/handleAppointmentReviewControlledActionValidationReceipt/g)
      .length,
    2
  );
  assert.match(source, /appointmentReviewRouteRuntimeAdapter/);
  assert.doesNotMatch(source, /handleAppointmentReviewControlledActionValidation[^R]/);
  assert.doesNotMatch(source, /constructAppointmentReviewValidationDecisionReceipt/);
  assert.doesNotMatch(source, /runAppointmentReviewControlledActionValidationPipeline/);
});

test("controlled action validation receipt route returns validation_rejected receipt with HTTP 200 for safe validation rejection", async () => {
  const { response, body } = await post(
    createValidPayload({ actionIntent: "book_appointment" })
  );

  assert.equal(response.status, 200);
  assertReceiptSuccess(body, "validation_rejected");
  assert.equal(body.handlerResult.accepted, false);
  assert.equal(body.validationReceipt.failedStage, "validation_pipeline");
  assert.equal(
    body.validationReceipt.reason,
    "Validation pipeline rejected the controlled action request."
  );
  assert.equal(body.validationReceipt.stages.preconditions.status, "rejected");
});

test("controlled action validation receipt route distinguishes route success from validation decision", async () => {
  const { body } = await post(
    createValidPayload({ actionIntent: "book_appointment" })
  );

  assert.equal(body.accepted, true);
  assert.equal(body.handlerResult.accepted, false);
  assert.equal(body.validationReceipt.outcome, "validation_rejected");
});

test("controlled action validation receipt route does not fabricate matching replay", async () => {
  const { body } = await post(createValidPayload());

  assert.equal(body.receiptOutcome, "validation_passed");
  assert.equal(body.handlerResult.matchingReplay, false);
  assert.equal(body.validationReceipt.matchingReplay, false);
  assert.equal(
    body.handlerResult.assemblyResult.pipelineInput.priorIdempotencyObservation,
    null
  );
});

test("controlled action validation receipt route safely supports matching replay shaped handler output", () => {
  const source = fs.readFileSync(ROUTE_SOURCE_PATH, "utf8");

  assert.match(source, /sanitizeRouteResult\(receiptHandlerResult\)/);
  assert.match(source, /\.\.\.routeResult/);
  assert.doesNotMatch(source, /matchingReplay:\s*true/);
  assert.doesNotMatch(source, /receiptOutcome:\s*"matching_replay"/);
});

test("controlled action validation receipt route rejects invalid JSON", async () => {
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
  assertRouteError(body, "invalid_json");
});

test("controlled action validation receipt route rejects missing route id", async () => {
  const response = await route.POST(
    createRequest(createValidPayload()),
    createContext("   ")
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assertRouteError(body, "missing_review_id");
});

test("controlled action validation receipt route rejects missing body", async () => {
  const response = await route.POST(
    new Request(ROUTE_URL, { method: "POST" }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assertRouteError(body, "missing_body");
});

test("controlled action validation receipt route handles missing required metadata safely", async () => {
  const cases = [
    ["actionIntent", { actionIntent: undefined }],
    ["requestId", { requestId: "" }],
    ["idempotencyKey", { idempotencyKey: "" }],
    ["expectedReviewVersion", { expectedReviewVersion: "one" }],
  ];

  for (const [fieldName, override] of cases) {
    const { response, body } = await post(createValidPayload(override));

    assert.equal(response.status, 200, fieldName);
    assertReceiptSuccess(body, "validation_rejected");
    assert.equal(body.handlerResult.accepted, false);
  }
});

test("controlled action validation receipt route rejects trusted-context injection", async () => {
  const trustedFields = [
    "currentState",
    "actor",
    "actorId",
    "actorRole",
    "role",
    "permissions",
    "verifiedActorContext",
    "authenticationVerified",
    "authorizationVerified",
    "observedReviewVersion",
    "priorIdempotencyObservation",
    "executionPolicyContext",
    "executionPolicy",
    "policyType",
    "policyVersion",
    "policySource",
    "policyMode",
    "executionEnabled",
    "requiredPermission",
  ];

  for (const fieldName of trustedFields) {
    const { response, body } = await post(
      createValidPayload({ [fieldName]: "client_supplied" })
    );

    assert.equal(response.status, 400);
    assertRouteError(body, "client_trusted_context_injection");
    assert.match(body.reason, new RegExp(fieldName));
  }
});

test("controlled action validation receipt route rejects nested trusted-context injection", async () => {
  const { response, body } = await post(
    createValidPayload({
      metadata: {
        actorId: "client_nested_actor",
      },
    })
  );

  assert.equal(response.status, 400);
  assertRouteError(body, "client_trusted_context_injection");
  assert.match(body.reason, /actorId/);
});

test("controlled action validation receipt route rejects unsafe true side-effect fields", async () => {
  const unsafeFields = [
    "executionEnabled",
    "executorAvailable",
    "executionAvailable",
    "executionRequested",
    "actionPerformed",
    "commandDispatched",
    "commandPersisted",
    "receiptPersisted",
    "receiptLogged",
    "receiptPublished",
    "bookingCreated",
    "calendarChecked",
    "appointmentCreated",
    "calendarEventCreated",
    "databasePersisted",
    "reviewFound",
    "persisted",
    "previousActionExecuted",
    "idempotencyRecordCreated",
    "authenticated",
    "authorized",
  ];

  for (const fieldName of unsafeFields) {
    const { response, body } = await post(
      createValidPayload({ [fieldName]: true })
    );

    assert.equal(response.status, 400);
    assert.ok(
      [
        "client_trusted_context_injection",
        "unsafe_controlled_action_receipt_field",
      ].includes(body.code)
    );
    assertRouteSafetyFields(body);
  }
});

test("controlled action validation receipt route rejects non-post methods", async () => {
  const responses = await Promise.all([
    route.GET(new Request(ROUTE_URL, { method: "GET" }), createContext()),
    route.PUT(new Request(ROUTE_URL, { method: "PUT" }), createContext()),
    route.PATCH(new Request(ROUTE_URL, { method: "PATCH" }), createContext()),
    route.DELETE(new Request(ROUTE_URL, { method: "DELETE" }), createContext()),
  ]);
  const bodies = await Promise.all(responses.map((response) => response.json()));

  assert.ok(responses.every((response) => response.status === 405));

  for (const body of bodies) {
    assertRouteError(body, "method_not_allowed");
  }
});

test("controlled action validation receipt route preserves route safety fields on success and error", async () => {
  assertRouteSafetyFields((await post(createValidPayload())).body);

  const response = await route.POST(
    new Request(ROUTE_URL, { method: "POST" }),
    createContext()
  );
  const body = await response.json();

  assertRouteSafetyFields(body);
  assert.equal(body.receiptPersisted, false);
  assert.equal(body.commandDispatched, false);
  assert.equal(body.commandPersisted, false);
});

test("controlled action validation receipt route does not expose sensitive patient clinical trusted or dependency data", async () => {
  const { body } = await post(createValidPayload());
  const serialized = JSON.stringify(body);

  for (const forbidden of [
    "patientName",
    "patientPhone",
    "patientMessage",
    "clinical",
    "treatmentNotes",
    "appointmentDetails",
    "calendar-event",
    "TOP_SECRET_VALUE",
    "credential",
    "token",
    "cookie",
    "session",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }

  assert.equal(Object.hasOwn(body.validationReceipt, "verifiedActorContext"), false);
  assert.equal(Object.hasOwn(body.validationReceipt, "executionPolicyContext"), false);
  assert.equal(
    JSON.stringify(body).includes("\"verifiedActorContext\""),
    false
  );
  assert.equal(
    JSON.stringify(body).includes("\"executionPolicyContext\""),
    false
  );
});

test("controlled action validation receipt route has no forbidden imports or side effects", () => {
  const source = fs.readFileSync(ROUTE_SOURCE_PATH, "utf8");
  const forbidden = [
    "create" + "Appointment\\(",
    "create" + "CalendarEvent\\(",
    "get" + "CalendarProvider\\(",
    "manual" + "AppointmentCalendarSync\\(",
    "google" + "apis",
    "pri" + "sma",
    "supa" + "base",
    "re" + "dis",
    "fe" + "tch",
    "node:fs",
    "fs",
    "filesystem",
    "cookies",
    "headers",
    "session",
    "authProvider",
    "authenticationProvider",
    "authorizationProvider",
    "appointmentReviewQueue",
    "audit",
    "logger",
    "logging",
    "command" + "Bus",
    "event" + "Bus",
    "job" + "Queue",
    "dispatcher",
    "Date" + ".now",
    "Math" + ".random",
    "random" + "UUID",
    "crypto",
  ];

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }

  assert.doesNotMatch(source, /require\([^)]*executor|executor\(|new Executor|Executor\(/i);
  assert.doesNotMatch(source, /app\/components/i);
  assert.doesNotMatch(
    source,
    /executionEnabled:\s*true|executorAvailable:\s*true|executionAvailable:\s*true|executionRequested:\s*true|actionPerformed:\s*true|commandDispatched:\s*true|commandPersisted:\s*true|receiptPersisted:\s*true|bookingCreated:\s*true|calendarChecked:\s*true|appointmentCreated:\s*true|calendarEventCreated:\s*true|databasePersisted:\s*true|reviewFound:\s*true|persisted:\s*true/
  );
});

test("controlled action validation receipt route imports the adapter but no lower runtime internals", () => {
  const source = fs.readFileSync(ROUTE_SOURCE_PATH, "utf8");

  assert.match(source, /appointmentReviewRouteRuntimeAdapter/);
  assert.doesNotMatch(source, /appointmentReviewInMemoryMockServerRuntime/);
  assert.doesNotMatch(
    source,
    /appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider/
  );
  assert.doesNotMatch(source, /appointmentReviewHybridControlledActionDependencies/);
  assert.doesNotMatch(source, /appointmentReviewRepositoryContextResolver/);
  assert.doesNotMatch(source, /appointmentReviewRepository/);
  assert.doesNotMatch(source, /appointmentReviewMockControlledActionDependencies/);
});

test("controlled action validation receipt route leaves Sprint 12O handler behavior unchanged", async () => {
  const result = await handleAppointmentReviewControlledActionValidationReceipt({
    method: "POST",
    reviewId: "review_receipt_route_contract",
    body: createValidPayload(),
    dependencies: createMockAppointmentReviewControlledActionDependencies(),
  });

  assert.equal(result.accepted, true);
  assert.equal(result.receiptOutcome, "validation_passed");
  assert.equal(result.bookingCreated, false);
});

test("controlled action validation receipt route leaves Sprint 12N receipt behavior unchanged", async () => {
  const handlerResult = (
    await handleAppointmentReviewControlledActionValidationReceipt({
      method: "POST",
      reviewId: "review_receipt_route_contract",
      body: createValidPayload(),
      dependencies: createMockAppointmentReviewControlledActionDependencies(),
    })
  ).handlerResult;
  const result = constructAppointmentReviewValidationDecisionReceipt({
    handlerResult,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.validationReceipt.outcome, "validation_passed");
});

test("controlled action validation receipt route leaves Sprint 12L validation route unchanged", async () => {
  const response = await validationRoute.POST(
    new Request(
      "ht" +
        "tp://localhost/api/secretary/appointment-reviews/review_existing/controlled-action-validation",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          actionIntent: "approve_intent",
          requestId: "request-existing",
          idempotencyKey: "request-existing-key",
          expectedReviewVersion: 1,
        }),
      }
    ),
    { params: { id: "review_existing" } }
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.validationOnly, true);
});

test("controlled action validation receipt route leaves Sprint 12K mock dependency behavior unchanged", () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();
  const actor = dependencies.resolveVerifiedActorContext({
    actionIntent: "approve_intent",
  });
  const idempotency = dependencies.resolveIdempotencyContext();

  assert.equal(actor.actorId, "secretary-mock");
  assert.deepEqual(actor.permissions, ["appointment_review:approve"]);
  assert.equal(idempotency.priorIdempotencyObservation, null);
});

test("controlled action validation receipt route leaves existing appointment review routes unchanged", async () => {
  const response = await actionPreconditionsRoute.POST(
    new Request(
      "ht" +
        "tp://localhost/api/secretary/appointment-reviews/review_existing/action-preconditions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          actionIntent: "approve_intent",
          currentState: "validation_only_intent_checked",
          actor: {
            actorId: "secretary-existing",
            role: "secretary",
          },
          requestId: "request-existing",
        }),
      }
    ),
    { params: { id: "review_existing" } }
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.bookingCreated, false);
  assert.equal(body.calendarChecked, false);
});
