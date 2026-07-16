const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  validateAppointmentReviewActionPreconditions,
} = require("../src/secretary/appointmentReviewActionPreconditionsContract");
const {
  authorizeAppointmentReviewVerifiedActor,
} = require("../src/secretary/appointmentReviewVerifiedActorAuthorizationContract");
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
  BODY_ALLOWED_FIELDS,
  BODY_TRUSTED_CONTEXT_FIELDS,
  HANDLER_CODES,
  HANDLER_SAFETY_FIELDS,
  REQUIRED_DEPENDENCIES,
  UNSAFE_EXECUTION_FIELDS,
  handleAppointmentReviewControlledActionValidation,
} = require("../src/api/secretaryAppointmentReviewControlledActionValidationHandler");

const HANDLER_SOURCE_PATH =
  "src/api/secretaryAppointmentReviewControlledActionValidationHandler.js";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
  handlerChecked: true,
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
});

function createBody(overrides = {}) {
  return {
    actionIntent: "approve_intent",
    requestId: "request_handler_demo",
    idempotencyKey: "review_handler_demo:request_handler_demo:approve",
    expectedReviewVersion: 7,
    ...overrides,
  };
}

function createVerifiedActorContext(overrides = {}) {
  return {
    contextType: "verified_actor_context_v1",
    verificationSource: "server_auth_boundary",
    actorId: "secretary_handler",
    role: "secretary",
    authenticationVerified: true,
    authorizationVerified: true,
    permissions: ["appointment_review:approve"],
    ...overrides,
  };
}

function createReviewContext(overrides = {}) {
  return {
    contextType: "appointment_review_snapshot_context_v1",
    contextSource: "server_review_boundary",
    reviewId: "review_handler_demo",
    currentState: "validation_only_intent_checked",
    observedReviewVersion: 7,
    ...overrides,
  };
}

function createIdempotencyContext(overrides = {}) {
  return {
    contextType: "appointment_review_idempotency_context_v1",
    contextSource: "server_idempotency_boundary",
    priorIdempotencyObservation: null,
    ...overrides,
  };
}

function createExecutionPolicyContext(overrides = {}) {
  return {
    policyType: "appointment_review_execution_policy_v1",
    policyVersion: 1,
    policySource: "server_policy_boundary",
    policyMode: "controlled_validation_only",
    allowedActionIntents: ["approve_intent", "reject_intent"],
    allowedCurrentStates: ["validation_only_intent_checked"],
    requiredEnvelopeType: "appointment_review_controlled_action_command_v1",
    requiredSchemaVersion: 1,
    executionEnabled: false,
    ...overrides,
  };
}

function createDependencies(overrides = {}, calls = []) {
  return {
    async resolveVerifiedActorContext(requestContext) {
      calls.push(["resolveVerifiedActorContext", requestContext]);

      if (Object.prototype.hasOwnProperty.call(overrides, "verifiedActorContext")) {
        return overrides.verifiedActorContext;
      }

      const permission =
        requestContext.actionIntent === "reject_intent"
          ? "appointment_review:reject"
          : "appointment_review:approve";

      return createVerifiedActorContext({ permissions: [permission] });
    },
    async resolveAppointmentReviewContext(requestContext) {
      calls.push(["resolveAppointmentReviewContext", requestContext]);

      if (Object.prototype.hasOwnProperty.call(overrides, "reviewContext")) {
        return overrides.reviewContext;
      }

      return createReviewContext({ reviewId: requestContext.reviewId });
    },
    async resolveIdempotencyContext(requestContext) {
      calls.push(["resolveIdempotencyContext", requestContext]);

      if (Object.prototype.hasOwnProperty.call(overrides, "idempotencyContext")) {
        return overrides.idempotencyContext;
      }

      return createIdempotencyContext();
    },
    async resolveExecutionPolicyContext(requestContext) {
      calls.push(["resolveExecutionPolicyContext", requestContext]);

      if (Object.prototype.hasOwnProperty.call(overrides, "executionPolicyContext")) {
        return overrides.executionPolicyContext;
      }

      return createExecutionPolicyContext();
    },
  };
}

function createInput(overrides = {}, calls = []) {
  return {
    method: "POST",
    reviewId: "review_handler_demo",
    body: createBody(overrides.body || {}),
    dependencies: overrides.dependencies || createDependencies({}, calls),
    ...withoutBodyAndDependencies(overrides),
  };
}

function withoutBodyAndDependencies(overrides) {
  const { body, dependencies, ...rest } = overrides;
  return rest;
}

async function handle(overrides = {}, calls = []) {
  return handleAppointmentReviewControlledActionValidation(
    createInput(overrides, calls)
  );
}

function assertSafetyFields(result) {
  for (const [field, value] of Object.entries(EXPECTED_SAFETY_FIELDS)) {
    assert.equal(result[field], value);
  }
}

function assertAccepted(result) {
  assert.equal(result.accepted, true);
  assert.equal(result.handlerCompleted, true);
  assert.equal(result.failedStage, null);
  assert.equal(result.matchingReplay, false);
  assert.equal(result.replayExistingResultOnly, false);
  assert.equal(result.code, HANDLER_CODES.COMPLETED);
  assertSafetyFields(result);
}

function assertRejected(result, code, failedStage = null) {
  assert.equal(result.accepted, false);
  assert.equal(result.handlerCompleted, false);
  assert.equal(result.matchingReplay, false);
  assert.equal(result.replayExistingResultOnly, false);
  assert.equal(result.eligibleForExecutorBoundary, false);
  assert.equal(result.code, code);
  assert.equal(result.failedStage, failedStage);
  assertSafetyFields(result);
}

test("controlled action validation handler completes a valid approve request", async () => {
  const result = await handle();

  assertAccepted(result);
  assert.equal(result.reviewId, "review_handler_demo");
  assert.equal(result.eligibleForExecutorBoundary, true);
  assert.equal(result.pipelineResult.code, "controlled_action_validation_pipeline_completed");
});

test("controlled action validation handler completes a valid reject request", async () => {
  const result = await handle({
    body: {
      actionIntent: "reject_intent",
      idempotencyKey: "review_handler_demo:request_handler_demo:reject",
    },
  });

  assertAccepted(result);
  assert.equal(
    result.pipelineResult.commandEnvelope.actor.requiredPermission,
    "appointment_review:reject"
  );
});

test("dependency resolvers run in the required order", async () => {
  const calls = [];

  await handle({}, calls);

  assert.deepEqual(calls.map(([name]) => name), [
    "resolveVerifiedActorContext",
    "resolveAppointmentReviewContext",
    "resolveIdempotencyContext",
    "resolveExecutionPolicyContext",
  ]);
});

test("assembly receives only client-safe request fields", async () => {
  const result = await handle();
  const clientRequestKeys = Object.keys(
    result.assemblyResult.pipelineInput.preconditionsInput
  );

  assert.deepEqual(BODY_ALLOWED_FIELDS, [
    "actionIntent",
    "requestId",
    "idempotencyKey",
    "expectedReviewVersion",
  ]);
  assert.deepEqual(clientRequestKeys, [
    "reviewId",
    "actionIntent",
    "currentState",
    "actor",
    "requestId",
  ]);
  assert.equal(result.assemblyResult.pipelineInput.preconditionsInput.reviewId, "review_handler_demo");
});

test("trusted context is constructed only from dependency outputs", async () => {
  const result = await handle({
    dependencies: createDependencies({
      verifiedActorContext: createVerifiedActorContext({
        actorId: "dependency_actor",
        permissions: ["appointment_review:approve"],
      }),
      reviewContext: createReviewContext({
        currentState: "validation_only_intent_checked",
        observedReviewVersion: 9,
      }),
      idempotencyContext: createIdempotencyContext({
        priorIdempotencyObservation: null,
      }),
      executionPolicyContext: createExecutionPolicyContext({
        policyVersion: 1,
      }),
    }),
    body: {
      expectedReviewVersion: 9,
    },
  });

  assertAccepted(result);
  assert.equal(
    result.assemblyResult.pipelineInput.preconditionsInput.actor.actorId,
    "dependency_actor"
  );
  assert.equal(result.assemblyResult.pipelineInput.observedReviewVersion, 9);
});

test("body reviewId override is rejected before dependencies run", async () => {
  const calls = [];
  const result = await handle({ body: { reviewId: "other_review" } }, calls);

  assertRejected(result, "invalid_body");
  assert.deepEqual(calls, []);
});

test("client currentState injection is rejected before dependencies run", async () => {
  const calls = [];
  const result = await handle(
    { body: { currentState: "validation_only_intent_checked" } },
    calls
  );

  assertRejected(result, "client_trusted_context_injection");
  assert.deepEqual(calls, []);
});

test("client actor injection is rejected before dependencies run", async () => {
  const calls = [];
  const result = await handle({ body: { actor: { actorId: "x" } } }, calls);

  assertRejected(result, "client_trusted_context_injection");
  assert.deepEqual(calls, []);
});

test("client observedReviewVersion injection is rejected before dependencies run", async () => {
  const calls = [];
  const result = await handle({ body: { observedReviewVersion: 7 } }, calls);

  assertRejected(result, "client_trusted_context_injection");
  assert.deepEqual(calls, []);
});

test("client policy injection is rejected before dependencies run", async () => {
  const calls = [];
  const result = await handle({ body: { policyType: "trusted" } }, calls);

  assertRejected(result, "client_trusted_context_injection");
  assert.deepEqual(calls, []);
});

test("non-POST method is rejected", async () => {
  const result = await handle({ method: "GET" });

  assertRejected(result, "method_not_allowed");
});

test("missing route reviewId is rejected", async () => {
  const result = await handle({ reviewId: "" });

  assertRejected(result, "missing_review_id");
});

test("missing body is rejected", async () => {
  const result = await handleAppointmentReviewControlledActionValidation({
    method: "POST",
    reviewId: "review_handler_demo",
    dependencies: createDependencies(),
  });

  assertRejected(result, "invalid_body");
});

test("missing dependencies is rejected", async () => {
  const result = await handleAppointmentReviewControlledActionValidation({
    method: "POST",
    reviewId: "review_handler_demo",
    body: createBody(),
  });

  assertRejected(result, "missing_dependencies");
});

test("missing actor resolver is rejected", async () => {
  const dependencies = createDependencies();
  delete dependencies.resolveVerifiedActorContext;
  const result = await handle({ dependencies });

  assertRejected(result, "missing_verified_actor_resolver");
});

test("missing review resolver is rejected", async () => {
  const dependencies = createDependencies();
  delete dependencies.resolveAppointmentReviewContext;
  const result = await handle({ dependencies });

  assertRejected(result, "missing_review_context_resolver");
});

test("missing idempotency resolver is rejected", async () => {
  const dependencies = createDependencies();
  delete dependencies.resolveIdempotencyContext;
  const result = await handle({ dependencies });

  assertRejected(result, "missing_idempotency_context_resolver");
});

test("missing policy resolver is rejected", async () => {
  const dependencies = createDependencies();
  delete dependencies.resolveExecutionPolicyContext;
  const result = await handle({ dependencies });

  assertRejected(result, "missing_execution_policy_resolver");
});

test("actor resolver failure stops later resolvers", async () => {
  const calls = [];
  const dependencies = createDependencies({}, calls);
  dependencies.resolveVerifiedActorContext = async () => {
    calls.push(["resolveVerifiedActorContext"]);
    throw new Error("actor failed");
  };
  const result = await handle({ dependencies }, calls);

  assertRejected(
    result,
    "verified_actor_context_resolution_failed",
    "verified_actor_context"
  );
  assert.deepEqual(calls.map(([name]) => name), ["resolveVerifiedActorContext"]);
});

test("review resolver failure stops later resolvers", async () => {
  const calls = [];
  const dependencies = createDependencies({}, calls);
  dependencies.resolveAppointmentReviewContext = async () => {
    calls.push(["resolveAppointmentReviewContext"]);
    throw new Error("review failed");
  };
  const result = await handle({ dependencies }, calls);

  assertRejected(
    result,
    "appointment_review_context_resolution_failed",
    "appointment_review_context"
  );
  assert.deepEqual(calls.map(([name]) => name), [
    "resolveVerifiedActorContext",
    "resolveAppointmentReviewContext",
  ]);
});

test("idempotency resolver failure stops policy resolution", async () => {
  const calls = [];
  const dependencies = createDependencies({}, calls);
  dependencies.resolveIdempotencyContext = async () => {
    calls.push(["resolveIdempotencyContext"]);
    throw new Error("idempotency failed");
  };
  const result = await handle({ dependencies }, calls);

  assertRejected(
    result,
    "idempotency_context_resolution_failed",
    "idempotency_context"
  );
  assert.deepEqual(calls.map(([name]) => name), [
    "resolveVerifiedActorContext",
    "resolveAppointmentReviewContext",
    "resolveIdempotencyContext",
  ]);
});

test("policy resolver failure stops assembly and pipeline", async () => {
  const calls = [];
  const dependencies = createDependencies({}, calls);
  dependencies.resolveExecutionPolicyContext = async () => {
    calls.push(["resolveExecutionPolicyContext"]);
    throw new Error("policy failed");
  };
  const result = await handle({ dependencies }, calls);

  assertRejected(
    result,
    "execution_policy_context_resolution_failed",
    "execution_policy_context"
  );
  assert.equal(Object.hasOwn(result, "assemblyResult"), false);
  assert.equal(Object.hasOwn(result, "pipelineResult"), false);
});

test("null dependency output is rejected", async () => {
  const result = await handle({
    dependencies: createDependencies({ reviewContext: null }),
  });

  assertRejected(
    result,
    "appointment_review_context_resolution_failed",
    "appointment_review_context"
  );
});

test("malformed dependency output is rejected", async () => {
  const result = await handle({
    dependencies: createDependencies({ idempotencyContext: [] }),
  });

  assertRejected(
    result,
    "idempotency_context_resolution_failed",
    "idempotency_context"
  );
});

test("unsafe dependency output is rejected", async () => {
  const result = await handle({
    dependencies: createDependencies({
      reviewContext: createReviewContext({ bookingCreated: true }),
    }),
  });

  assertRejected(result, "unsafe_dependency_result", "appointment_review_context");
});

test("assembly rejection stops the pipeline", async () => {
  const result = await handle({
    dependencies: createDependencies({
      reviewContext: createReviewContext({ reviewId: "other_review" }),
    }),
  });

  assertRejected(
    result,
    "server_context_assembly_rejected",
    "server_context_assembly"
  );
  assert.equal(result.stageCode, "review_id_mismatch");
  assert.equal(Object.hasOwn(result, "pipelineResult"), false);
});

test("pipeline rejection is returned safely", async () => {
  const result = await handle({
    dependencies: createDependencies({
      reviewContext: createReviewContext({ currentState: "pending_secretary_review" }),
    }),
  });

  assertRejected(result, "validation_pipeline_rejected", "validation_pipeline");
  assert.equal(result.stageCode, "preconditions_stage_rejected");
  assert.equal(result.pipelineResult.failedStage, "preconditions");
});

test("matching replay is returned without new execution", async () => {
  const priorIdempotencyObservation = {
    idempotencyKey: "review_handler_demo:request_handler_demo:approve",
    requestFingerprint:
      "reviewId:review_handler_demo|actionIntent:approve_intent|actorId:secretary_handler|requestId:request_handler_demo|requiredPermission:appointment_review:approve|expectedReviewVersion:7",
  };
  const result = await handle({
    dependencies: createDependencies({
      idempotencyContext: createIdempotencyContext({
        priorIdempotencyObservation,
      }),
    }),
  });

  assert.equal(result.accepted, true);
  assert.equal(result.handlerCompleted, true);
  assert.equal(result.matchingReplay, true);
  assert.equal(result.replayExistingResultOnly, true);
  assert.equal(result.code, "controlled_action_validation_handler_matching_replay");
  assert.equal(result.commandDispatched, false);
  assert.equal(result.actionPerformed, false);
});

test("matching replay keeps eligibleForExecutorBoundary false", async () => {
  const result = await handle({
    dependencies: createDependencies({
      idempotencyContext: createIdempotencyContext({
        priorIdempotencyObservation: {
          idempotencyKey: "review_handler_demo:request_handler_demo:approve",
          requestFingerprint:
            "reviewId:review_handler_demo|actionIntent:approve_intent|actorId:secretary_handler|requestId:request_handler_demo|requiredPermission:appointment_review:approve|expectedReviewVersion:7",
        },
      }),
    }),
  });

  assert.equal(result.eligibleForExecutorBoundary, false);
});

test("fully accepted result preserves all non-execution safety fields", async () => {
  assertSafetyFields(await handle());
});

test("matching replay result preserves all non-execution safety fields", async () => {
  assertSafetyFields(
    await handle({
      dependencies: createDependencies({
        idempotencyContext: createIdempotencyContext({
          priorIdempotencyObservation: {
            idempotencyKey: "review_handler_demo:request_handler_demo:approve",
            requestFingerprint:
              "reviewId:review_handler_demo|actionIntent:approve_intent|actorId:secretary_handler|requestId:request_handler_demo|requiredPermission:appointment_review:approve|expectedReviewVersion:7",
          },
        }),
      }),
    })
  );
});

test("rejected result preserves all non-execution safety fields", async () => {
  assertSafetyFields(await handle({ body: { currentState: "x" } }));
});

test("no resolver runs after an earlier resolver fails", async () => {
  const calls = [];
  const dependencies = createDependencies({}, calls);
  dependencies.resolveVerifiedActorContext = async () => {
    calls.push(["resolveVerifiedActorContext"]);
    return null;
  };
  const result = await handle({ dependencies }, calls);

  assertRejected(
    result,
    "verified_actor_context_resolution_failed",
    "verified_actor_context"
  );
  assert.deepEqual(calls.map(([name]) => name), ["resolveVerifiedActorContext"]);
});

test("handler source has no review queue read or mutation", () => {
  const source = fs.readFileSync(HANDLER_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /appointmentReviewQueue/i);
  assert.doesNotMatch(source, /addAppointmentReview|listAppointmentReviews|getAppointmentReviewById|updateAppointmentReviewStatus/i);
});

test("handler source imports no authentication provider", () => {
  const source = fs.readFileSync(HANDLER_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /authProvider|authorizationProvider|authenticateActor/i);
});

test("handler source has no booking calendar database persistence environment filesystem or network side effects", () => {
  const source = fs.readFileSync(HANDLER_SOURCE_PATH, "utf8");
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

test("handler source has no route or UI import", () => {
  const source = fs.readFileSync(HANDLER_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /route\.js/i);
  assert.doesNotMatch(source, /components\//i);
  assert.doesNotMatch(source, /workspace/i);
});

test("handler input is not mutated", async () => {
  const calls = [];
  const input = createInput({}, calls);
  const before = JSON.stringify(input);

  await handleAppointmentReviewControlledActionValidation(input);

  assert.equal(JSON.stringify(input), before);
});

test("handler body is not mutated", async () => {
  const body = Object.freeze(createBody());
  const input = {
    method: "POST",
    reviewId: "review_handler_demo",
    body,
    dependencies: createDependencies(),
  };
  const before = JSON.stringify(body);

  await handleAppointmentReviewControlledActionValidation(input);

  assert.equal(JSON.stringify(body), before);
});

test("dependency outputs are not mutated", async () => {
  const verifiedActorContext = createVerifiedActorContext();
  const reviewContext = createReviewContext();
  const idempotencyContext = createIdempotencyContext();
  const executionPolicyContext = createExecutionPolicyContext();
  const dependencies = createDependencies({
    verifiedActorContext,
    reviewContext,
    idempotencyContext,
    executionPolicyContext,
  });
  const before = JSON.stringify({
    verifiedActorContext,
    reviewContext,
    idempotencyContext,
    executionPolicyContext,
  });

  await handle({ dependencies });

  assert.equal(
    JSON.stringify({
      verifiedActorContext,
      reviewContext,
      idempotencyContext,
      executionPolicyContext,
    }),
    before
  );
});

test("repeated equivalent calls with deterministic dependencies return deeply equivalent results", async () => {
  const first = await handle();
  const second = await handle();

  assert.deepEqual(second, first);
});

test("exported handler constants are immutable", () => {
  assert.equal(Object.isFrozen(BODY_ALLOWED_FIELDS), true);
  assert.equal(Object.isFrozen(BODY_TRUSTED_CONTEXT_FIELDS), true);
  assert.equal(Object.isFrozen(HANDLER_CODES), true);
  assert.equal(Object.isFrozen(HANDLER_SAFETY_FIELDS), true);
  assert.equal(Object.isFrozen(REQUIRED_DEPENDENCIES), true);
  assert.equal(Object.isFrozen(UNSAFE_EXECUTION_FIELDS), true);
});

test("existing Sprint 12I assembly behavior remains unchanged", () => {
  const result = assembleAppointmentReviewTrustedServerContext({
    clientRequest: {
      reviewId: "review_handler_demo",
      actionIntent: "approve_intent",
      requestId: "request_handler_demo",
      idempotencyKey: "review_handler_demo:request_handler_demo:approve",
      expectedReviewVersion: 7,
    },
    trustedServerContext: {
      contextType: "appointment_review_controlled_action_server_context_v1",
      contextSource: "server_context_boundary",
      verifiedActorContext: createVerifiedActorContext(),
      reviewContext: createReviewContext(),
      idempotencyContext: createIdempotencyContext(),
      executionPolicyContext: createExecutionPolicyContext(),
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_server_context_assembled");
  assert.equal(result.bookingCreated, false);
});

test("existing Sprint 12H pipeline behavior remains unchanged", async () => {
  const handlerResult = await handle();
  const result = runAppointmentReviewControlledActionValidationPipeline(
    handlerResult.assemblyResult.pipelineInput
  );

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_validation_pipeline_completed");
  assert.equal(result.calendarChecked, false);
});

test("existing Sprint 12G policy behavior remains unchanged", async () => {
  const handlerResult = await handle();
  const result = evaluateAppointmentReviewControlledActionExecutionPolicy({
    commandEnvelopeResult: handlerResult.pipelineResult.commandEnvelopeResult,
    executionPolicyContext:
      handlerResult.assemblyResult.pipelineInput.executionPolicyContext,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_execution_policy_matched");
  assert.equal(result.actionPerformed, false);
});

test("existing Sprint 12E guard behavior remains unchanged", async () => {
  const handlerResult = await handle();
  const preconditionsResult = validateAppointmentReviewActionPreconditions(
    handlerResult.assemblyResult.pipelineInput.preconditionsInput
  );
  const authorizationResult = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult,
    verifiedActorContext:
      handlerResult.assemblyResult.pipelineInput.verifiedActorContext,
  });
  const result = validateAppointmentReviewControlledActionGuard({
    authorizationResult,
    idempotencyKey: "review_handler_demo:request_handler_demo:approve",
    expectedReviewVersion: 7,
    observedReviewVersion: 7,
    priorIdempotencyObservation: null,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_guard_passed");
  assert.equal(result.databasePersisted, false);
});

test("existing Sprint 12D authorization behavior remains unchanged", async () => {
  const handlerResult = await handle();
  const result = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult: validateAppointmentReviewActionPreconditions(
      handlerResult.assemblyResult.pipelineInput.preconditionsInput
    ),
    verifiedActorContext:
      handlerResult.assemblyResult.pipelineInput.verifiedActorContext,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_handling_authorized");
  assert.equal(result.bookingCreated, false);
});
