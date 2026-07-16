"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  handleAppointmentReviewControlledActionValidation,
} = require("../src/api/secretaryAppointmentReviewControlledActionValidationHandler");
const {
  RECEIPT_HANDLER_CODES,
  RECEIPT_HANDLER_SAFETY_FIELDS,
  handleAppointmentReviewControlledActionValidationReceipt,
  handleAppointmentReviewControlledActionValidationReceiptWithContracts,
} = require("../src/api/secretaryAppointmentReviewControlledActionValidationReceiptHandler");
const {
  constructAppointmentReviewValidationDecisionReceipt,
} = require("../src/secretary/appointmentReviewValidationDecisionReceiptContract");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");
const {
  runAppointmentReviewControlledActionValidationPipeline,
} = require("../src/secretary/appointmentReviewControlledActionValidationPipelineContract");

const RECEIPT_HANDLER_SOURCE_PATH =
  "src/api/secretaryAppointmentReviewControlledActionValidationReceiptHandler.js";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
  receiptHandlerChecked: true,
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
});

function createBody(overrides = {}) {
  return {
    actionIntent: "approve_intent",
    requestId: "request_receipt_handler_demo",
    idempotencyKey: "review_receipt_handler_demo:request_receipt_handler_demo:approve",
    expectedReviewVersion: 7,
    ...overrides,
  };
}

function createVerifiedActorContext(overrides = {}) {
  return {
    contextType: "verified_actor_context_v1",
    verificationSource: "server_auth_boundary",
    actorId: "secretary_receipt_handler",
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
    reviewId: "review_receipt_handler_demo",
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
  const body = Object.prototype.hasOwnProperty.call(overrides, "body")
    ? overrides.body
    : createBody();
  const dependencies = Object.prototype.hasOwnProperty.call(overrides, "dependencies")
    ? overrides.dependencies
    : createDependencies({}, calls);

  return {
    method: "POST",
    reviewId: "review_receipt_handler_demo",
    body:
      body && typeof body === "object" && !Array.isArray(body)
        ? createBody(body)
        : body,
    dependencies,
    ...withoutInputFields(overrides),
  };
}

function withoutInputFields(overrides) {
  const { body, dependencies, ...rest } = overrides;
  return rest;
}

async function handle(overrides = {}, calls = []) {
  return handleAppointmentReviewControlledActionValidationReceipt(
    createInput(overrides, calls)
  );
}

function assertSafetyFields(result) {
  for (const [field, value] of Object.entries(EXPECTED_SAFETY_FIELDS)) {
    assert.equal(result[field], value);
  }
}

function assertReceiptAssembly(result, outcome) {
  assert.equal(result.accepted, true);
  assert.equal(result.receiptHandlerCompleted, true);
  assert.equal(result.validationReceiptConstructed, true);
  assert.equal(result.receiptPersisted, false);
  assert.equal(result.code, RECEIPT_HANDLER_CODES.COMPLETED);
  assert.equal(result.receiptOutcome, outcome);
  assert.equal(result.validationReceipt.outcome, outcome);
  assertSafetyFields(result);
}

function assertReceiptFailure(result, code) {
  assert.equal(result.accepted, false);
  assert.equal(result.receiptHandlerCompleted, false);
  assert.equal(result.validationReceiptConstructed, false);
  assert.equal(result.validationReceipt, null);
  assert.equal(result.receiptOutcome, null);
  assert.equal(result.receiptPersisted, false);
  assert.equal(result.code, code);
  assert.equal(typeof result.reason, "string");
  assertSafetyFields(result);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function createSafeHandlerResult(overrides = {}) {
  const result = await handleAppointmentReviewControlledActionValidation(
    createInput(overrides)
  );

  return result;
}

async function createAcceptedHandlerResult() {
  return createSafeHandlerResult();
}

async function createRejectedHandlerResult(stage) {
  if (stage === "preconditions") {
    return createSafeHandlerResult({
      dependencies: createDependencies({
        reviewContext: createReviewContext({
          currentState: "pending_secretary_review",
        }),
      }),
    });
  }

  if (stage === "authorization") {
    return createSafeHandlerResult({
      dependencies: createDependencies({
        verifiedActorContext: createVerifiedActorContext({ permissions: [] }),
      }),
    });
  }

  if (stage === "idempotency") {
    return createSafeHandlerResult({
      body: { expectedReviewVersion: 8 },
    });
  }

  if (stage === "executionPolicy") {
    return createSafeHandlerResult({
      dependencies: createDependencies({
        executionPolicyContext: createExecutionPolicyContext({
          allowedActionIntents: ["reject_intent"],
        }),
      }),
    });
  }

  const accepted = await createAcceptedHandlerResult();
  const handlerResult = clone(accepted);

  handlerResult.accepted = false;
  handlerResult.handlerCompleted = false;
  handlerResult.eligibleForExecutorBoundary = false;
  handlerResult.code = "validation_pipeline_rejected";
  handlerResult.reason = "Validation pipeline rejected the controlled action request.";
  handlerResult.failedStage = "validation_pipeline";
  handlerResult.pipelineResult.accepted = false;
  handlerResult.pipelineResult.pipelineCompleted = false;
  handlerResult.pipelineResult.allStagesAccepted = false;
  handlerResult.pipelineResult.eligibleForExecutorBoundary = false;
  handlerResult.pipelineResult.code = "command_envelope_stage_rejected";
  handlerResult.pipelineResult.reason = "command_envelope stage rejected.";
  handlerResult.pipelineResult.failedStage = "command_envelope";
  handlerResult.pipelineResult.stages.commandEnvelope = {
    status: "rejected",
    code: "invalid_command_envelope",
  };
  handlerResult.pipelineResult.stages.executionPolicy = { status: "not_run" };

  return handlerResult;
}

function createContracts(options = {}) {
  const { calls = [] } = options;
  const hasHandlerResult = Object.prototype.hasOwnProperty.call(
    options,
    "handlerResult"
  );
  const hasReceiptResult = Object.prototype.hasOwnProperty.call(
    options,
    "receiptResult"
  );

  return {
    async runValidationHandler(input) {
      calls.push(["Sprint12J", input]);
      return hasHandlerResult
        ? options.handlerResult
        : createAcceptedHandlerResult();
    },
    constructValidationReceipt(input) {
      calls.push(["Sprint12N", input]);
      return hasReceiptResult
        ? options.receiptResult
        : constructAppointmentReviewValidationDecisionReceipt(input);
    },
  };
}

test("receipt handler produces validation_passed receipt for accepted approve validation", async () => {
  const result = await handle();

  assertReceiptAssembly(result, "validation_passed");
  assert.equal(result.handlerResult.accepted, true);
  assert.equal(result.validationReceipt.reviewId, "review_receipt_handler_demo");
});

test("receipt handler produces validation_passed receipt for accepted reject validation", async () => {
  const result = await handle({
    body: {
      actionIntent: "reject_intent",
      idempotencyKey: "review_receipt_handler_demo:request_receipt_handler_demo:reject",
    },
  });

  assertReceiptAssembly(result, "validation_passed");
  assert.equal(result.handlerResult.pipelineResult.commandEnvelope.actionIntent, "reject_intent");
  assert.equal(
    result.validationReceipt.correlation.requiredPermission,
    "appointment_review:reject"
  );
});

test("receipt handler produces matching_replay receipt", async () => {
  const priorIdempotencyObservation = {
    idempotencyKey:
      "review_receipt_handler_demo:request_receipt_handler_demo:approve",
    requestFingerprint:
      "reviewId:review_receipt_handler_demo|actionIntent:approve_intent|actorId:secretary_receipt_handler|requestId:request_receipt_handler_demo|requiredPermission:appointment_review:approve|expectedReviewVersion:7",
  };
  const result = await handle({
    dependencies: createDependencies({
      idempotencyContext: createIdempotencyContext({
        priorIdempotencyObservation,
      }),
    }),
  });

  assertReceiptAssembly(result, "matching_replay");
  assert.equal(result.handlerResult.matchingReplay, true);
  assert.equal(result.validationReceipt.eligibleForExecutorBoundary, false);
  assert.equal(Object.hasOwn(result.validationReceipt, "commandEnvelope"), false);
});

test("receipt handler produces validation_rejected receipt for preconditions authorization idempotency command envelope and execution policy rejections", async () => {
  for (const stage of [
    "preconditions",
    "authorization",
    "idempotency",
    "commandEnvelope",
    "executionPolicy",
  ]) {
    const handlerResult = await createRejectedHandlerResult(stage);
    const calls = [];
    const result =
      await handleAppointmentReviewControlledActionValidationReceiptWithContracts(
        createInput(),
        createContracts({ calls, handlerResult })
      );

    assertReceiptAssembly(result, "validation_rejected");
    assert.equal(result.handlerResult.accepted, false);
    assert.equal(result.validationReceipt.reason, handlerResult.reason);
  }
});

test("receipt handler produces validation_rejected receipt for safe dependency failure", async () => {
  const calls = [];
  const result = await handle({
    dependencies: createDependencies({
      verifiedActorContext: null,
    }, calls),
  });

  assertReceiptAssembly(result, "validation_rejected");
  assert.equal(result.handlerResult.failedStage, "verified_actor_context");
  assert.deepEqual(calls.map(([name]) => name), ["resolveVerifiedActorContext"]);
});

test("receipt handler calls Sprint 12J before Sprint 12N exactly once", async () => {
  const calls = [];
  const result =
    await handleAppointmentReviewControlledActionValidationReceiptWithContracts(
      createInput(),
      createContracts({ calls })
    );

  assertReceiptAssembly(result, "validation_passed");
  assert.deepEqual(calls.map(([name]) => name), ["Sprint12J", "Sprint12N"]);
});

test("receipt handler does not rerun dependency resolvers", async () => {
  const calls = [];
  const result = await handle({}, calls);

  assertReceiptAssembly(result, "validation_passed");
  assert.deepEqual(calls.map(([name]) => name), [
    "resolveVerifiedActorContext",
    "resolveAppointmentReviewContext",
    "resolveIdempotencyContext",
    "resolveExecutionPolicyContext",
  ]);
});

test("receipt handler completion flags remain distinct from validation decision", async () => {
  const handlerResult = await createRejectedHandlerResult("preconditions");
  const result =
    await handleAppointmentReviewControlledActionValidationReceiptWithContracts(
      createInput(),
      createContracts({ handlerResult })
    );

  assert.equal(result.accepted, true);
  assert.equal(result.receiptHandlerCompleted, true);
  assert.equal(result.handlerResult.accepted, false);
  assert.equal(result.validationReceipt.outcome, "validation_rejected");
});

test("receipt handler handles missing method reviewId body and dependencies through Sprint 12J conventions", async () => {
  const missingMethod = await handle({ method: undefined });
  const missingReviewId = await handle({ reviewId: "" });
  const missingBody = await handle({ body: null });
  const missingDependencies = await handle({ dependencies: null });

  assertReceiptFailure(
    missingMethod,
    RECEIPT_HANDLER_CODES.VALIDATION_RECEIPT_CONSTRUCTION_FAILED
  );
  assertReceiptFailure(
    missingReviewId,
    RECEIPT_HANDLER_CODES.VALIDATION_RECEIPT_CONSTRUCTION_FAILED
  );
  assertReceiptAssembly(missingBody, "validation_rejected");
  assertReceiptAssembly(missingDependencies, "validation_rejected");
  assert.equal(missingMethod.receiptConstructionCode, "missing_review_id");
  assert.equal(missingReviewId.receiptConstructionCode, "missing_review_id");
  assert.equal(missingBody.handlerResult.code, "invalid_body");
  assert.equal(missingDependencies.handlerResult.code, "missing_dependencies");
});

test("receipt handler rejects missing top-level input safely", async () => {
  const result = await handleAppointmentReviewControlledActionValidationReceipt();

  assertReceiptFailure(result, RECEIPT_HANDLER_CODES.INVALID_INPUT);
});

test("receipt handler catches unexpected Sprint 12J throw and does not call Sprint 12N", async () => {
  const calls = [];
  const result =
    await handleAppointmentReviewControlledActionValidationReceiptWithContracts(
      createInput(),
      {
        async runValidationHandler() {
          calls.push("Sprint12J");
          throw new Error("boom");
        },
        constructValidationReceipt() {
          calls.push("Sprint12N");
          return null;
        },
      }
    );

  assertReceiptFailure(
    result,
    RECEIPT_HANDLER_CODES.UNEXPECTED_RECEIPT_HANDLER_RESULT
  );
  assert.deepEqual(calls, ["Sprint12J"]);
  assert.equal(result.reason.includes("boom"), false);
});

test("receipt handler rejects malformed and unsafe Sprint 12J output without producing a receipt", async () => {
  const malformed =
    await handleAppointmentReviewControlledActionValidationReceiptWithContracts(
      createInput(),
      createContracts({ handlerResult: null })
    );
  const unsafe =
    await handleAppointmentReviewControlledActionValidationReceiptWithContracts(
      createInput(),
      createContracts({
        handlerResult: {
          accepted: true,
          handlerChecked: true,
          executionEnabled: true,
          persistence: "not_persisted",
        },
      })
    );

  assertReceiptFailure(
    malformed,
    RECEIPT_HANDLER_CODES.INVALID_VALIDATION_HANDLER_RESULT
  );
  assertReceiptFailure(unsafe, RECEIPT_HANDLER_CODES.UNSAFE_EXECUTION_FLAGS);
});

test("receipt handler catches unexpected Sprint 12N throw and handles Sprint 12N rejection", async () => {
  const handlerResult = await createAcceptedHandlerResult();
  const thrown =
    await handleAppointmentReviewControlledActionValidationReceiptWithContracts(
      createInput(),
      {
        async runValidationHandler() {
          return handlerResult;
        },
        constructValidationReceipt() {
          throw new Error("receipt boom");
        },
      }
    );
  const rejected =
    await handleAppointmentReviewControlledActionValidationReceiptWithContracts(
      createInput(),
      createContracts({
        handlerResult,
        receiptResult: {
          accepted: false,
          validationReceiptConstructed: false,
          validationReceipt: null,
          code: "invalid_handler_result",
          reason: "Receipt rejected safely.",
          validationReceiptChecked: true,
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
        },
      })
    );

  assertReceiptFailure(
    thrown,
    RECEIPT_HANDLER_CODES.VALIDATION_RECEIPT_CONSTRUCTION_FAILED
  );
  assert.equal(thrown.reason.includes("receipt boom"), false);
  assertReceiptFailure(
    rejected,
    RECEIPT_HANDLER_CODES.VALIDATION_RECEIPT_CONSTRUCTION_FAILED
  );
  assert.equal(rejected.receiptConstructionCode, "invalid_handler_result");
});

test("receipt handler preserves safety fields on success and failures", async () => {
  assertSafetyFields(await handle());
  assertSafetyFields(await handleAppointmentReviewControlledActionValidationReceipt());
  assert.equal((await handle()).receiptPersisted, false);
  assert.equal((await handle()).commandDispatched, false);
  assert.equal((await handle()).commandPersisted, false);
  assert.deepEqual(RECEIPT_HANDLER_SAFETY_FIELDS, EXPECTED_SAFETY_FIELDS);
});

test("receipt handler does not mutate input body dependencies handler result or receipt", async () => {
  const calls = [];
  const input = createInput({}, calls);
  const bodyBefore = clone(input.body);
  const dependenciesBeforeKeys = Object.keys(input.dependencies);
  const handlerResult = await createAcceptedHandlerResult();
  const handlerBefore = clone(handlerResult);
  const receiptResult = constructAppointmentReviewValidationDecisionReceipt({
    handlerResult,
  });
  const receiptBefore = clone(receiptResult.validationReceipt);

  const result =
    await handleAppointmentReviewControlledActionValidationReceiptWithContracts(
      input,
      createContracts({ handlerResult, receiptResult })
    );

  assertReceiptAssembly(result, "validation_passed");
  assert.deepEqual(input.body, bodyBefore);
  assert.deepEqual(Object.keys(input.dependencies), dependenciesBeforeKeys);
  assert.deepEqual(handlerResult, handlerBefore);
  assert.deepEqual(receiptResult.validationReceipt, receiptBefore);
});

test("receipt handler returns immutable receipt and defensive handler result", async () => {
  const result = await handle();

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.handlerResult), true);
  assert.equal(Object.isFrozen(result.validationReceipt), true);
  assert.equal(Object.isFrozen(result.validationReceipt.stages), true);
  assert.throws(() => {
    result.handlerResult.accepted = false;
  }, TypeError);
  assert.throws(() => {
    result.validationReceipt.outcome = "mutated";
  }, TypeError);
  assert.equal(result.validationReceipt.outcome, "validation_passed");
});

test("receipt handler repeated equivalent calls are deterministic", async () => {
  assert.deepEqual(await handle(), await handle());
});

test("receipt handler source has no persistence logging queue route UI or external side effects", () => {
  const source = fs.readFileSync(RECEIPT_HANDLER_SOURCE_PATH, "utf8");

  assert.match(source, /handleAppointmentReviewControlledActionValidation/);
  assert.match(source, /constructAppointmentReviewValidationDecisionReceipt/);
  assert.doesNotMatch(
    source,
    /createAppointment|createCalendarEvent|getCalendarProvider|manualAppointmentCalendarSync|googleapis|prisma|supabase|redis|fetch|node:fs|require\("fs"\)|console\.|cookies|headers|session|authProvider|authenticationProvider|authorizationProvider|appointmentReviewQueue|audit|logger|logging|commandBus|eventBus|jobQueue|require\([^)]*executor|import .*executor|executor\(|new Executor|Executor\(|dispatcher|app\/components|route|Date\.now|Math\.random|randomUUID|crypto|process\.env/
  );
  assert.doesNotMatch(
    source,
    /executionEnabled:\s*true|executorAvailable:\s*true|executionAvailable:\s*true|executionRequested:\s*true|actionPerformed:\s*true|commandDispatched:\s*true|commandPersisted:\s*true|receiptPersisted:\s*true|bookingCreated:\s*true|calendarChecked:\s*true|appointmentCreated:\s*true|calendarEventCreated:\s*true|databasePersisted:\s*true|reviewFound:\s*true|persisted:\s*true/
  );
});

test("existing Sprint 12N 12J 12K and 12H behavior remains unchanged", async () => {
  const handlerResult = await createAcceptedHandlerResult();
  const receiptResult = constructAppointmentReviewValidationDecisionReceipt({
    handlerResult,
  });
  const validationHandlerResult =
    await handleAppointmentReviewControlledActionValidation(createInput());
  const mockDependencies = createMockAppointmentReviewControlledActionDependencies();
  const pipelineResult = runAppointmentReviewControlledActionValidationPipeline(
    validationHandlerResult.assemblyResult.pipelineInput
  );

  assert.equal(receiptResult.accepted, true);
  assert.equal(validationHandlerResult.accepted, true);
  assert.equal(typeof mockDependencies.resolveVerifiedActorContext, "function");
  assert.equal(pipelineResult.accepted, true);
});
