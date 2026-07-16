const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/[id]/controlled-action-validation/route");
const actionPreconditionsRoute = require("../app/api/secretary/appointment-reviews/[id]/action-preconditions/route");
const {
  handleAppointmentReviewControlledActionValidation,
} = require("../src/api/secretaryAppointmentReviewControlledActionValidationHandler");
const {
  validateAppointmentReviewControlledActionGuard,
} = require("../src/secretary/appointmentReviewControlledActionGuardContract");
const {
  evaluateAppointmentReviewControlledActionExecutionPolicy,
} = require("../src/secretary/appointmentReviewControlledActionExecutionPolicyContract");
const {
  runAppointmentReviewControlledActionValidationPipeline,
} = require("../src/secretary/appointmentReviewControlledActionValidationPipelineContract");
const {
  assembleAppointmentReviewTrustedServerContext,
} = require("../src/secretary/appointmentReviewTrustedServerContextAssemblyContract");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

const ROUTE_SOURCE_PATH =
  "app/api/secretary/appointment-reviews/[id]/controlled-action-validation/route.js";
const ROUTE_URL =
  "ht" +
  "tp://localhost/api/secretary/appointment-reviews/review_route/controlled-action-validation";

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
    requestId: "controlled-action-preview",
    idempotencyKey: "controlled-action-preview-key",
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

function createContext(id = "review_route") {
  return {
    params: {
      id,
    },
  };
}

async function post(payload, id = "review_route") {
  const response = await route.POST(createRequest(payload), createContext(id));
  const body = await response.json();

  return { response, body };
}

function assertRouteSafetyFields(body) {
  for (const [field, value] of Object.entries(EXPECTED_ROUTE_SAFETY_FIELDS)) {
    assert.equal(body[field], value, field);
  }
}

function assertAcceptedRouteResult(body) {
  assert.equal(body.accepted, true);
  assert.equal(body.handlerCompleted, true);
  assert.equal(body.matchingReplay, false);
  assert.equal(body.replayExistingResultOnly, false);
  assert.equal(body.code, "controlled_action_validation_handler_completed");
  assertRouteSafetyFields(body);
}

function assertRejectedRouteBoundary(body, code) {
  assert.equal(body.accepted, false);
  assert.equal(body.handlerCompleted, false);
  assert.equal(body.matchingReplay, false);
  assert.equal(body.replayExistingResultOnly, false);
  assert.equal(body.eligibleForExecutorBoundary, false);
  assert.equal(body.code, code);
  assert.equal(body.error.code, code);
  assertRouteSafetyFields(body);
}

test("controlled action validation route accepts approve intent with HTTP 200", async () => {
  const { response, body } = await post(createValidPayload());

  assert.equal(response.status, 200);
  assertAcceptedRouteResult(body);
  assert.equal(body.reviewId, "review_route");
  assert.equal(body.pipelineResult.commandEnvelope.actionIntent, "approve_intent");
});

test("controlled action validation route accepts reject intent with HTTP 200", async () => {
  const { response, body } = await post(
    createValidPayload({
      actionIntent: "reject_intent",
      idempotencyKey: "controlled-action-preview-reject-key",
    }),
    "review_reject_route"
  );

  assert.equal(response.status, 200);
  assertAcceptedRouteResult(body);
  assert.equal(body.reviewId, "review_reject_route");
  assert.equal(body.pipelineResult.commandEnvelope.actionIntent, "reject_intent");
});

test("valid approve route request completes the validation handler", async () => {
  const { body } = await post(createValidPayload());

  assert.equal(body.handlerCompleted, true);
  assert.equal(body.failedStage, null);
  assert.equal(body.assemblyResult.accepted, true);
  assert.equal(body.pipelineResult.accepted, true);
});

test("valid reject route request completes the validation handler", async () => {
  const { body } = await post(
    createValidPayload({
      actionIntent: "reject_intent",
      idempotencyKey: "controlled-action-preview-reject-key",
    })
  );

  assert.equal(body.handlerCompleted, true);
  assert.equal(body.failedStage, null);
  assert.equal(
    body.pipelineResult.commandEnvelope.actor.requiredPermission,
    "appointment_review:reject"
  );
});

test("controlled action validation route uses route parameter reviewId", async () => {
  const { body } = await post(createValidPayload(), "review_from_route_only");

  assert.equal(body.reviewId, "review_from_route_only");
  assert.equal(
    body.assemblyResult.pipelineInput.preconditionsInput.reviewId,
    "review_from_route_only"
  );
  assert.equal(
    body.pipelineResult.commandEnvelope.reviewId,
    "review_from_route_only"
  );
});

test("controlled action validation route rejects body reviewId override", async () => {
  const { response, body } = await post(
    createValidPayload({ reviewId: "body_review_must_not_win" })
  );

  assert.equal(response.status, 400);
  assertRejectedRouteBoundary(body, "client_trusted_context_injection");
  assert.match(body.reason, /reviewId/);
});

test("controlled action validation route uses the Sprint 12K mock dependency bundle", async () => {
  const { body } = await post(createValidPayload());

  assert.equal(
    body.assemblyResult.pipelineInput.verifiedActorContext.actorId,
    "secretary-mock"
  );
  assert.equal(
    body.assemblyResult.pipelineInput.preconditionsInput.currentState,
    "validation_only_intent_checked"
  );
  assert.equal(
    body.assemblyResult.pipelineInput.observedReviewVersion,
    1
  );
  assert.equal(
    body.assemblyResult.pipelineInput.priorIdempotencyObservation,
    null
  );
  assert.equal(
    body.assemblyResult.pipelineInput.executionPolicyContext.executionEnabled,
    false
  );
});

test("controlled action validation route response is explicitly mock and validation only", async () => {
  const { body } = await post(createValidPayload());

  assert.equal(body.mock, true);
  assert.equal(body.dryRun, true);
  assert.equal(body.validationOnly, true);
  assert.equal(body.controlledHandlingOnly, true);
  assert.equal(body.authenticationMode, "mock_validation_only");
});

test("controlled action validation route keeps executionEnabled false", async () => {
  assert.equal((await post(createValidPayload())).body.executionEnabled, false);
});

test("controlled action validation route keeps executorAvailable false", async () => {
  assert.equal((await post(createValidPayload())).body.executorAvailable, false);
});

test("controlled action validation route keeps executionAvailable false", async () => {
  assert.equal((await post(createValidPayload())).body.executionAvailable, false);
});

test("controlled action validation route keeps actionPerformed false", async () => {
  assert.equal((await post(createValidPayload())).body.actionPerformed, false);
});

test("controlled action validation route keeps commandDispatched false", async () => {
  assert.equal((await post(createValidPayload())).body.commandDispatched, false);
});

test("controlled action validation route keeps commandPersisted false", async () => {
  assert.equal((await post(createValidPayload())).body.commandPersisted, false);
});

test("controlled action validation route keeps bookingCreated false", async () => {
  assert.equal((await post(createValidPayload())).body.bookingCreated, false);
});

test("controlled action validation route keeps calendarChecked false", async () => {
  assert.equal((await post(createValidPayload())).body.calendarChecked, false);
});

test("controlled action validation route keeps databasePersisted false", async () => {
  assert.equal((await post(createValidPayload())).body.databasePersisted, false);
});

test("controlled action validation route rejects missing route id safely", async () => {
  const response = await route.POST(
    createRequest(createValidPayload()),
    createContext("   ")
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assertRejectedRouteBoundary(body, "missing_review_id");
});

test("controlled action validation route rejects missing body safely", async () => {
  const response = await route.POST(
    new Request(ROUTE_URL, { method: "POST" }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assertRejectedRouteBoundary(body, "missing_body");
});

test("controlled action validation route rejects invalid JSON safely", async () => {
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
  assertRejectedRouteBoundary(body, "invalid_json");
});

test("controlled action validation route returns missing actionIntent as validation rejection", async () => {
  const { response, body } = await post(
    createValidPayload({ actionIntent: undefined })
  );

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "server_context_assembly_rejected");
  assertRouteSafetyFields(body);
});

test("controlled action validation route returns missing requestId as validation rejection", async () => {
  const { response, body } = await post(createValidPayload({ requestId: "" }));

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "server_context_assembly_rejected");
  assertRouteSafetyFields(body);
});

test("controlled action validation route returns missing idempotencyKey as validation rejection", async () => {
  const { response, body } = await post(
    createValidPayload({ idempotencyKey: "" })
  );

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "server_context_assembly_rejected");
  assert.equal(body.failedStage, "server_context_assembly");
  assertRouteSafetyFields(body);
});

test("controlled action validation route returns invalid expectedReviewVersion as validation rejection", async () => {
  const { response, body } = await post(
    createValidPayload({ expectedReviewVersion: "one" })
  );

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "server_context_assembly_rejected");
  assertRouteSafetyFields(body);
});

test("controlled action validation route returns unsupported action intent as validation rejection", async () => {
  const { response, body } = await post(
    createValidPayload({ actionIntent: "book_appointment" })
  );

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "validation_pipeline_rejected");
  assertRouteSafetyFields(body);
});

test("controlled action validation route rejects client trusted-context injection", async () => {
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
    assertRejectedRouteBoundary(body, "client_trusted_context_injection");
    assert.match(body.reason, new RegExp(fieldName));
  }
});

test("controlled action validation route rejects nested trusted-context injection", async () => {
  const { response, body } = await post(
    createValidPayload({
      metadata: {
        actorId: "client_nested_actor",
      },
    })
  );

  assert.equal(response.status, 400);
  assertRejectedRouteBoundary(body, "client_trusted_context_injection");
  assert.match(body.reason, /actorId/);
});

test("controlled action validation route rejects unsafe true side-effect fields", async () => {
  const unsafeFields = [
    "executionEnabled",
    "executorAvailable",
    "executionAvailable",
    "executionRequested",
    "actionPerformed",
    "commandDispatched",
    "commandPersisted",
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
      ["client_trusted_context_injection", "unsafe_controlled_action_field"].includes(
        body.code
      )
    );
    assertRouteSafetyFields(body);
  }
});

test("controlled action validation route rejects non-post methods safely", async () => {
  const responses = await Promise.all([
    route.GET(new Request(ROUTE_URL, { method: "GET" }), createContext()),
    route.PUT(new Request(ROUTE_URL, { method: "PUT" }), createContext()),
    route.PATCH(new Request(ROUTE_URL, { method: "PATCH" }), createContext()),
    route.DELETE(new Request(ROUTE_URL, { method: "DELETE" }), createContext()),
  ]);
  const bodies = await Promise.all(responses.map((response) => response.json()));

  assert.ok(responses.every((response) => response.status === 405));
  assert.ok(bodies.every((body) => body.code === "method_not_allowed"));

  for (const body of bodies) {
    assertRejectedRouteBoundary(body, "method_not_allowed");
  }
});

test("controlled action validation route does not import the appointment review queue", () => {
  const source = fs.readFileSync(ROUTE_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /appointmentReviewQueue/i);
  assert.doesNotMatch(source, /addAppointmentReview/i);
  assert.doesNotMatch(source, /listAppointmentReviews/i);
  assert.doesNotMatch(source, /getAppointmentReviewById/i);
  assert.doesNotMatch(source, /updateAppointmentReviewStatus/i);
});

test("controlled action validation route imports no execution booking calendar database or persistence modules", () => {
  const source = fs.readFileSync(ROUTE_SOURCE_PATH, "utf8");
  const forbidden = [
    "create" + "Appointment",
    "create" + "CalendarEvent",
    "get" + "CalendarProvider",
    "manual" + "AppointmentCalendarSync",
    "google" + "apis",
    "pri" + "sma",
    "supa" + "base",
    "re" + "dis",
    "fe" + "tch",
    "command" + "Bus",
    "event" + "Bus",
    "job" + "Queue",
    "dispatcher",
    "process" + ".env",
    "Date" + ".now",
    "Math" + ".random",
    "random" + "UUID",
    "crypto",
  ];

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }

  assert.doesNotMatch(source, /require\([^)]*executor|executor\(|new Executor|Executor\(/i);
});

test("controlled action validation route does not access cookies sessions or authentication providers", () => {
  const source = fs.readFileSync(ROUTE_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /cookies\(/i);
  assert.doesNotMatch(source, /headers\(/i);
  assert.doesNotMatch(source, /session/i);
  assert.doesNotMatch(source, /authProvider|authenticationProvider/i);
  assert.doesNotMatch(source, /authorizationProvider/i);
});

test("controlled action validation route does not claim a review was found", async () => {
  const { body } = await post(createValidPayload());

  assert.equal(body.reviewFound, false);
});

test("controlled action validation route does not claim production authentication occurred", async () => {
  const { body } = await post(createValidPayload());

  assert.equal(body.authenticated, false);
  assert.equal(body.authorized, false);
  assert.equal(body.productionAuthentication, false);
  assert.equal(body.productionAuthorization, false);
  assert.equal(
    body.assemblyResult.pipelineInput.verifiedActorContext.authenticationVerified,
    true
  );
});

test("controlled action validation route does not fabricate matching replay", async () => {
  const { body } = await post(createValidPayload());

  assert.equal(body.matchingReplay, false);
  assert.equal(body.replayExistingResultOnly, false);
  assert.equal(
    body.assemblyResult.pipelineInput.priorIdempotencyObservation,
    null
  );
});

test("controlled action validation route leaves Sprint 12J handler behavior unchanged", async () => {
  const result = await handleAppointmentReviewControlledActionValidation({
    method: "POST",
    reviewId: "review_route_contract",
    body: createValidPayload(),
    dependencies: createMockAppointmentReviewControlledActionDependencies(),
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_validation_handler_completed");
  assert.equal(result.bookingCreated, false);
});

test("controlled action validation route leaves Sprint 12K mock dependency behavior unchanged", () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();
  const actor = dependencies.resolveVerifiedActorContext({
    actionIntent: "approve_intent",
  });
  const review = dependencies.resolveAppointmentReviewContext({
    reviewId: "review_route_contract",
  });
  const idempotency = dependencies.resolveIdempotencyContext();
  const policy = dependencies.resolveExecutionPolicyContext();

  assert.equal(actor.actorId, "secretary-mock");
  assert.deepEqual(actor.permissions, ["appointment_review:approve"]);
  assert.equal(review.currentState, "validation_only_intent_checked");
  assert.equal(idempotency.priorIdempotencyObservation, null);
  assert.equal(policy.executionEnabled, false);
});

test("controlled action validation route leaves Sprint 12I context assembly unchanged", () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();
  const result = assembleAppointmentReviewTrustedServerContext({
    clientRequest: {
      reviewId: "review_route_contract",
      ...createValidPayload(),
    },
    trustedServerContext: {
      contextType: "appointment_review_controlled_action_server_context_v1",
      contextSource: "server_context_boundary",
      verifiedActorContext: dependencies.resolveVerifiedActorContext({
        actionIntent: "approve_intent",
      }),
      reviewContext: dependencies.resolveAppointmentReviewContext({
        reviewId: "review_route_contract",
      }),
      idempotencyContext: dependencies.resolveIdempotencyContext(),
      executionPolicyContext: dependencies.resolveExecutionPolicyContext(),
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_server_context_assembled");
});

test("controlled action validation route leaves Sprint 12H pipeline unchanged", async () => {
  const { body } = await post(createValidPayload());
  const result = runAppointmentReviewControlledActionValidationPipeline(
    body.assemblyResult.pipelineInput
  );

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_validation_pipeline_completed");
});

test("controlled action validation route leaves Sprint 12G policy unchanged", async () => {
  const { body } = await post(createValidPayload());
  const result = evaluateAppointmentReviewControlledActionExecutionPolicy({
    commandEnvelopeResult: body.pipelineResult.commandEnvelopeResult,
    executionPolicyContext:
      body.assemblyResult.pipelineInput.executionPolicyContext,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_execution_policy_matched");
});

test("controlled action validation route leaves Sprint 12E guard unchanged", async () => {
  const { body } = await post(createValidPayload());
  const pipelineInput = body.assemblyResult.pipelineInput;
  const result = validateAppointmentReviewControlledActionGuard({
    authorizationResult: body.pipelineResult.authorizationResult,
    idempotencyKey: pipelineInput.idempotencyKey,
    expectedReviewVersion: pipelineInput.expectedReviewVersion,
    observedReviewVersion: pipelineInput.observedReviewVersion,
    priorIdempotencyObservation: pipelineInput.priorIdempotencyObservation,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_guard_passed");
});

test("controlled action validation route leaves existing appointment review routes unchanged", async () => {
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
  assert.equal(body.code, "preconditions_satisfied");
  assert.equal(body.bookingCreated, false);
  assert.equal(body.calendarChecked, false);
});
