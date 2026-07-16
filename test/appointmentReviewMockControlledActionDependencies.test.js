const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  handleAppointmentReviewControlledActionValidation,
} = require("../src/api/secretaryAppointmentReviewControlledActionValidationHandler");
const {
  authorizeAppointmentReviewVerifiedActor,
} = require("../src/secretary/appointmentReviewVerifiedActorAuthorizationContract");
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
  MOCK_ACTOR_ID,
  MOCK_OBSERVED_REVIEW_VERSION,
  MOCK_REVIEW_STATE,
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

const BUNDLE_SOURCE_PATH =
  "src/secretary/appointmentReviewMockControlledActionDependencies.js";

function createHandlerBody(overrides = {}) {
  return {
    actionIntent: "approve_intent",
    requestId: "request_mock_dependency",
    idempotencyKey: "review_mock_dependency:request_mock_dependency:approve",
    expectedReviewVersion: 1,
    ...overrides,
  };
}

async function runHandler(overrides = {}) {
  return handleAppointmentReviewControlledActionValidation({
    method: "POST",
    reviewId: "review_mock_dependency",
    body: createHandlerBody(overrides.body || {}),
    dependencies:
      overrides.dependencies ||
      createMockAppointmentReviewControlledActionDependencies(),
  });
}

function assertValidationOnly(result) {
  assert.equal(result.validationOnly, true);
  assert.equal(result.controlledHandlingOnly, true);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.executorAvailable, false);
  assert.equal(result.executionAvailable, false);
  assert.equal(result.executionRequested, false);
  assert.equal(result.actionPerformed, false);
  assert.equal(result.commandDispatched, false);
  assert.equal(result.commandPersisted, false);
  assert.equal(result.bookingCreated, false);
  assert.equal(result.calendarChecked, false);
  assert.equal(result.appointmentCreated, false);
  assert.equal(result.calendarEventCreated, false);
  assert.equal(result.databasePersisted, false);
  assert.equal(result.persistence, "not_persisted");
}

test("mock dependency factory returns all four required functions", () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();

  assert.equal(typeof dependencies.resolveVerifiedActorContext, "function");
  assert.equal(typeof dependencies.resolveAppointmentReviewContext, "function");
  assert.equal(typeof dependencies.resolveIdempotencyContext, "function");
  assert.equal(typeof dependencies.resolveExecutionPolicyContext, "function");
  assert.deepEqual(Object.keys(dependencies), [
    "resolveVerifiedActorContext",
    "resolveAppointmentReviewContext",
    "resolveIdempotencyContext",
    "resolveExecutionPolicyContext",
  ]);
});

test("mock dependency bundle is frozen", () => {
  assert.equal(
    Object.isFrozen(createMockAppointmentReviewControlledActionDependencies()),
    true
  );
});

test("equivalent factory calls expose equivalent behavior", () => {
  const first = createMockAppointmentReviewControlledActionDependencies();
  const second = createMockAppointmentReviewControlledActionDependencies();

  assert.deepEqual(
    first.resolveExecutionPolicyContext({ reviewId: "review_mock_dependency" }),
    second.resolveExecutionPolicyContext({ reviewId: "review_mock_dependency" })
  );
});

test("actor resolver returns the synthetic secretary actor", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveVerifiedActorContext({
      actionIntent: "approve_intent",
    });

  assert.equal(result.actorId, MOCK_ACTOR_ID);
  assert.equal(result.role, "secretary");
  assert.equal(result.contextType, "verified_actor_context_v1");
  assert.equal(result.verificationSource, "server_auth_boundary");
});

test("actor resolver returns only approve permission for approve intent", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveVerifiedActorContext({
      actionIntent: "approve_intent",
    });

  assert.deepEqual(result.permissions, ["appointment_review:approve"]);
});

test("actor resolver returns only reject permission for reject intent", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveVerifiedActorContext({
      actionIntent: "reject_intent",
    });

  assert.deepEqual(result.permissions, ["appointment_review:reject"]);
});

test("actor resolver returns no permission for unsupported action intent", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveVerifiedActorContext({
      actionIntent: "unsupported_intent",
    });

  assert.deepEqual(result.permissions, []);
});

test("actor resolver does not accept actor identity from input", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveVerifiedActorContext({
      actionIntent: "approve_intent",
      actorId: "client_actor",
    });

  assert.equal(result.actorId, MOCK_ACTOR_ID);
});

test("actor resolver does not accept role from input", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveVerifiedActorContext({
      actionIntent: "approve_intent",
      role: "admin",
    });

  assert.equal(result.role, "secretary");
});

test("actor resolver does not accept permissions from input", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveVerifiedActorContext({
      actionIntent: "approve_intent",
      permissions: ["*"],
    });

  assert.deepEqual(result.permissions, ["appointment_review:approve"]);
});

test("actor resolver returns defensive immutable permissions", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveVerifiedActorContext({
      actionIntent: "approve_intent",
    });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.permissions), true);
});

test("review resolver returns the supplied reviewId", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveAppointmentReviewContext({
      reviewId: "review_supplied",
    });

  assert.equal(result.reviewId, "review_supplied");
});

test("review resolver returns validation only intent checked", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveAppointmentReviewContext({
      reviewId: "review_mock_dependency",
    });

  assert.equal(result.currentState, MOCK_REVIEW_STATE);
});

test("review resolver returns observedReviewVersion one", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveAppointmentReviewContext({
      reviewId: "review_mock_dependency",
    });

  assert.equal(result.observedReviewVersion, MOCK_OBSERVED_REVIEW_VERSION);
});

test("review resolver does not claim reviewFound", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveAppointmentReviewContext({
      reviewId: "review_mock_dependency",
    });

  assert.equal(Object.hasOwn(result, "reviewFound"), false);
});

test("review resolver does not read or mutate the review queue", () => {
  let queueRead = false;
  const input = {
    reviewId: "review_mock_dependency",
    appointmentReviewQueue: {
      listAppointmentReviews() {
        queueRead = true;
      },
    },
  };
  const before = JSON.stringify(input);

  createMockAppointmentReviewControlledActionDependencies()
    .resolveAppointmentReviewContext(input);

  assert.equal(queueRead, false);
  assert.equal(JSON.stringify(input), before);
});

test("idempotency resolver always returns null prior observation", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveIdempotencyContext({
      idempotencyKey: "key",
    });

  assert.equal(result.priorIdempotencyObservation, null);
});

test("idempotency resolver does not store state between calls", () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();
  const first = dependencies.resolveIdempotencyContext({
    idempotencyKey: "key_one",
  });
  const second = dependencies.resolveIdempotencyContext({
    idempotencyKey: "key_one",
  });

  assert.notEqual(first, second);
  assert.deepEqual(second, first);
});

test("idempotency resolver does not claim a record was created or persisted", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveIdempotencyContext({
      idempotencyKey: "key",
    });

  assert.equal(Object.hasOwn(result, "idempotencyRecordCreated"), false);
  assert.equal(Object.hasOwn(result, "persisted"), false);
});

test("policy resolver returns required policy type and version", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveExecutionPolicyContext();

  assert.equal(result.policyType, "appointment_review_execution_policy_v1");
  assert.equal(result.policyVersion, 1);
});

test("policy resolver keeps executionEnabled false", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveExecutionPolicyContext({
      executionEnabled: true,
    });

  assert.equal(result.executionEnabled, false);
});

test("policy resolver allows only approve and reject intents", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveExecutionPolicyContext();

  assert.deepEqual(result.allowedActionIntents, [
    "approve_intent",
    "reject_intent",
  ]);
});

test("policy resolver allows only validation only intent checked", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveExecutionPolicyContext();

  assert.deepEqual(result.allowedCurrentStates, [
    "validation_only_intent_checked",
  ]);
});

test("policy resolver contains no wildcard actions", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveExecutionPolicyContext();

  assert.equal(result.allowedActionIntents.includes("*"), false);
  assert.equal(result.allowedActionIntents.includes("all"), false);
});

test("policy resolver contains no wildcard states", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveExecutionPolicyContext();

  assert.equal(result.allowedCurrentStates.includes("*"), false);
  assert.equal(result.allowedCurrentStates.includes("all"), false);
});

test("policy result and nested arrays are immutable", () => {
  const result =
    createMockAppointmentReviewControlledActionDependencies().resolveExecutionPolicyContext();

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.allowedActionIntents), true);
  assert.equal(Object.isFrozen(result.allowedCurrentStates), true);
});

test("mutation of one resolver result does not affect later calls", () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();
  const first = dependencies.resolveVerifiedActorContext({
    actionIntent: "approve_intent",
  });
  const second = dependencies.resolveVerifiedActorContext({
    actionIntent: "approve_intent",
  });

  assert.notEqual(first, second);
  assert.deepEqual(second.permissions, ["appointment_review:approve"]);
});

test("resolver inputs are not mutated", () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();
  const actorInput = Object.freeze({
    actionIntent: "approve_intent",
    actorId: "client_actor",
    role: "admin",
    permissions: Object.freeze(["*"]),
  });
  const reviewInput = Object.freeze({ reviewId: "review_mock_dependency" });
  const idempotencyInput = Object.freeze({
    reviewId: "review_mock_dependency",
    actionIntent: "approve_intent",
    requestId: "request_mock_dependency",
    idempotencyKey: "key",
  });
  const policyInput = Object.freeze({
    reviewId: "review_mock_dependency",
    actionIntent: "approve_intent",
    executionEnabled: true,
  });
  const before = JSON.stringify({
    actorInput,
    reviewInput,
    idempotencyInput,
    policyInput,
  });

  dependencies.resolveVerifiedActorContext(actorInput);
  dependencies.resolveAppointmentReviewContext(reviewInput);
  dependencies.resolveIdempotencyContext(idempotencyInput);
  dependencies.resolveExecutionPolicyContext(policyInput);

  assert.equal(
    JSON.stringify({ actorInput, reviewInput, idempotencyInput, policyInput }),
    before
  );
});

test("repeated equivalent resolver calls return deeply equivalent results", () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();

  assert.deepEqual(
    dependencies.resolveVerifiedActorContext({ actionIntent: "approve_intent" }),
    dependencies.resolveVerifiedActorContext({ actionIntent: "approve_intent" })
  );
  assert.deepEqual(
    dependencies.resolveAppointmentReviewContext({
      reviewId: "review_mock_dependency",
    }),
    dependencies.resolveAppointmentReviewContext({
      reviewId: "review_mock_dependency",
    })
  );
  assert.deepEqual(
    dependencies.resolveIdempotencyContext({ idempotencyKey: "key" }),
    dependencies.resolveIdempotencyContext({ idempotencyKey: "key" })
  );
  assert.deepEqual(
    dependencies.resolveExecutionPolicyContext({ actionIntent: "approve_intent" }),
    dependencies.resolveExecutionPolicyContext({ actionIntent: "approve_intent" })
  );
});

test("mock bundle works in the Sprint 12J handler for approve", async () => {
  const result = await runHandler();

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_validation_handler_completed");
});

test("mock bundle works in the Sprint 12J handler for reject", async () => {
  const result = await runHandler({
    body: {
      actionIntent: "reject_intent",
      idempotencyKey: "review_mock_dependency:request_mock_dependency:reject",
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(
    result.pipelineResult.commandEnvelope.actor.requiredPermission,
    "appointment_review:reject"
  );
});

test("handler result remains validation only with the mock bundle", async () => {
  assertValidationOnly(await runHandler());
});

test("handler result keeps executionEnabled false", async () => {
  assert.equal((await runHandler()).executionEnabled, false);
});

test("handler result keeps executorAvailable false", async () => {
  assert.equal((await runHandler()).executorAvailable, false);
});

test("handler result keeps executionAvailable false", async () => {
  assert.equal((await runHandler()).executionAvailable, false);
});

test("handler result keeps actionPerformed false", async () => {
  assert.equal((await runHandler()).actionPerformed, false);
});

test("handler result keeps commandDispatched false", async () => {
  assert.equal((await runHandler()).commandDispatched, false);
});

test("handler result keeps commandPersisted false", async () => {
  assert.equal((await runHandler()).commandPersisted, false);
});

test("handler result keeps bookingCreated false", async () => {
  assert.equal((await runHandler()).bookingCreated, false);
});

test("handler result keeps calendarChecked false", async () => {
  assert.equal((await runHandler()).calendarChecked, false);
});

test("handler result keeps databasePersisted false", async () => {
  assert.equal((await runHandler()).databasePersisted, false);
});

test("unsupported action intent is rejected by downstream validation chain", async () => {
  const result = await runHandler({
    body: {
      actionIntent: "unsupported_intent",
      idempotencyKey: "review_mock_dependency:request_mock_dependency:unsupported",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "validation_pipeline_rejected");
  assert.equal(result.failedStage, "validation_pipeline");
});

test("mock bundle has no real authentication authorization lookup idempotency or policy provider", () => {
  const source = fs.readFileSync(BUNDLE_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /authProvider|authorizationProvider|authenticateActor/i);
  assert.doesNotMatch(source, /reviewProvider|loadAppointmentReview|findAppointmentReview/i);
  assert.doesNotMatch(source, /idempotencyStore|createIdempotency|saveIdempotency/i);
  assert.doesNotMatch(source, /policyProvider|loadExecutionPolicy/i);
});

test("mock bundle has no booking calendar db persistence queue env filesystem or network side effects", () => {
  const source = fs.readFileSync(BUNDLE_SOURCE_PATH, "utf8");
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
    "node:fs",
    "fs",
    "filesystem",
    "cookies",
    "headers",
    "session",
    "appointment" + "ReviewQueue",
    "add" + "AppointmentReview",
    "list" + "AppointmentReviews",
    "get" + "AppointmentReviewById",
    "update" + "AppointmentReviewStatus",
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

test("mock bundle has no API route or UI import", () => {
  const source = fs.readFileSync(BUNDLE_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /route\.js/i);
  assert.doesNotMatch(source, /components\//i);
  assert.doesNotMatch(source, /workspace/i);
});

test("mock bundle never returns positive execution persistence or queue flags", () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();
  const results = [
    dependencies.resolveVerifiedActorContext({ actionIntent: "approve_intent" }),
    dependencies.resolveAppointmentReviewContext({
      reviewId: "review_mock_dependency",
    }),
    dependencies.resolveIdempotencyContext({ idempotencyKey: "key" }),
    dependencies.resolveExecutionPolicyContext({ actionIntent: "approve_intent" }),
  ];
  const unsafeTrueFields = [
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
    "idempotencyRecordCreated",
    "previousActionExecuted",
  ];

  for (const result of results) {
    for (const fieldName of unsafeTrueFields) {
      assert.notEqual(result[fieldName], true);
    }
  }
});

test("existing Sprint 12J handler behavior remains unchanged", async () => {
  const result = await runHandler();

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_validation_handler_completed");
  assert.equal(result.actionPerformed, false);
});

test("existing Sprint 12I assembly behavior remains unchanged", () => {
  const dependencies = createMockAppointmentReviewControlledActionDependencies();
  const result = assembleAppointmentReviewTrustedServerContext({
    clientRequest: {
      reviewId: "review_mock_dependency",
      actionIntent: "approve_intent",
      requestId: "request_mock_dependency",
      idempotencyKey: "review_mock_dependency:request_mock_dependency:approve",
      expectedReviewVersion: 1,
    },
    trustedServerContext: {
      contextType: "appointment_review_controlled_action_server_context_v1",
      contextSource: "server_context_boundary",
      verifiedActorContext: dependencies.resolveVerifiedActorContext({
        actionIntent: "approve_intent",
      }),
      reviewContext: dependencies.resolveAppointmentReviewContext({
        reviewId: "review_mock_dependency",
      }),
      idempotencyContext: dependencies.resolveIdempotencyContext(),
      executionPolicyContext: dependencies.resolveExecutionPolicyContext(),
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_server_context_assembled");
});

test("existing Sprint 12H pipeline behavior remains unchanged", async () => {
  const handlerResult = await runHandler();
  const result = runAppointmentReviewControlledActionValidationPipeline(
    handlerResult.assemblyResult.pipelineInput
  );

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_validation_pipeline_completed");
});

test("existing Sprint 12G policy behavior remains unchanged", async () => {
  const handlerResult = await runHandler();
  const result = evaluateAppointmentReviewControlledActionExecutionPolicy({
    commandEnvelopeResult: handlerResult.pipelineResult.commandEnvelopeResult,
    executionPolicyContext:
      handlerResult.assemblyResult.pipelineInput.executionPolicyContext,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_execution_policy_matched");
});

test("existing Sprint 12D authorization behavior remains unchanged", async () => {
  const handlerResult = await runHandler();
  const result = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult:
      handlerResult.pipelineResult.authorizationResult &&
      handlerResult.pipelineResult.authorizationResult.accepted
        ? {
            accepted: true,
            eligibleForControlledHandling: true,
            controlledHandlingOnly: true,
            reviewId: "review_mock_dependency",
            actionIntent: "approve_intent",
            currentState: "validation_only_intent_checked",
            actorId: MOCK_ACTOR_ID,
            actorRole: "secretary",
            requestId: "request_mock_dependency",
            validationOnly: true,
            preconditionsChecked: true,
            executionAvailable: false,
            executionRequested: false,
            actionPerformed: false,
            bookingCreated: false,
            calendarChecked: false,
            appointmentCreated: false,
            calendarEventCreated: false,
            databasePersisted: false,
            persistence: "not_persisted",
          }
        : null,
    verifiedActorContext:
      handlerResult.assemblyResult.pipelineInput.verifiedActorContext,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_handling_authorized");
});
