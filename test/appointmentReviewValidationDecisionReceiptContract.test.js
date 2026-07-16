"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  buildAppointmentReviewControlledActionCommandEnvelope,
} = require("../src/secretary/appointmentReviewControlledActionCommandEnvelopeContract");
const {
  evaluateAppointmentReviewControlledActionExecutionPolicy,
} = require("../src/secretary/appointmentReviewControlledActionExecutionPolicyContract");
const {
  runAppointmentReviewControlledActionValidationPipeline,
} = require("../src/secretary/appointmentReviewControlledActionValidationPipelineContract");
const {
  validateAppointmentReviewControlledActionGuard,
} = require("../src/secretary/appointmentReviewControlledActionGuardContract");
const {
  authorizeAppointmentReviewVerifiedActor,
} = require("../src/secretary/appointmentReviewVerifiedActorAuthorizationContract");
const {
  validateAppointmentReviewActionPreconditions,
} = require("../src/secretary/appointmentReviewActionPreconditionsContract");
const {
  transitionAppointmentReviewActionIntentState,
} = require("../src/secretary/appointmentReviewActionIntentStateMachine");
const {
  handleAppointmentReviewControlledActionValidation,
} = require("../src/api/secretaryAppointmentReviewControlledActionValidationHandler");
const {
  RECEIPT_CODES,
  RECEIPT_OUTCOMES,
  RECEIPT_SAFETY_FIELDS,
  VALIDATION_RECEIPT_SCHEMA_VERSION,
  VALIDATION_RECEIPT_TYPE,
  constructAppointmentReviewValidationDecisionReceipt,
} = require("../src/secretary/appointmentReviewValidationDecisionReceiptContract");

const CONTRACT_SOURCE_PATH =
  "src/secretary/appointmentReviewValidationDecisionReceiptContract.js";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
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
});

const EXPECTED_CORRELATION = Object.freeze({
  reviewId: "review_receipt_demo",
  actionIntent: "approve_intent",
  actorId: "secretary_receipt",
  actorRole: "secretary",
  requestId: "request_receipt_demo",
  idempotencyKey: "review_receipt_demo:request_receipt_demo:approve",
  expectedReviewVersion: 7,
  observedReviewVersion: 7,
  requestFingerprint:
    "reviewId:review_receipt_demo|actionIntent:approve_intent|actorId:secretary_receipt|requestId:request_receipt_demo|requiredPermission:appointment_review:approve|expectedReviewVersion:7",
  requiredPermission: "appointment_review:approve",
});

function createSafetyFields() {
  return {
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
  };
}

function createStages(overrides = {}) {
  return {
    preconditions: { status: "accepted", code: "action_preconditions_passed" },
    authorization: { status: "accepted", code: "controlled_handling_authorized" },
    idempotencyAndVersionGuard: {
      status: "accepted",
      code: "controlled_action_guard_passed",
    },
    commandEnvelope: {
      status: "accepted",
      code: "controlled_action_command_envelope_constructed",
    },
    executionPolicy: {
      status: "accepted",
      code: "controlled_action_execution_policy_matched",
    },
    ...overrides,
  };
}

function createCommandEnvelope(overrides = {}) {
  return {
    envelopeType: "appointment_review_controlled_action_command_v1",
    schemaVersion: 1,
    reviewId: EXPECTED_CORRELATION.reviewId,
    actionIntent: EXPECTED_CORRELATION.actionIntent,
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: EXPECTED_CORRELATION.actorId,
      actorRole: EXPECTED_CORRELATION.actorRole,
      requiredPermission: EXPECTED_CORRELATION.requiredPermission,
      contextType: "verified_actor_context_v1",
      verificationSource: "server_auth_boundary",
    },
    requestId: EXPECTED_CORRELATION.requestId,
    idempotencyKey: EXPECTED_CORRELATION.idempotencyKey,
    expectedReviewVersion: EXPECTED_CORRELATION.expectedReviewVersion,
    observedReviewVersion: EXPECTED_CORRELATION.observedReviewVersion,
    requestFingerprint: EXPECTED_CORRELATION.requestFingerprint,
    ...overrides,
  };
}

function createPipelineResult(overrides = {}) {
  const commandEnvelope = Object.prototype.hasOwnProperty.call(
    overrides,
    "commandEnvelope"
  )
    ? overrides.commandEnvelope
    : createCommandEnvelope();

  return {
    accepted: true,
    pipelineCompleted: true,
    allStagesAccepted: true,
    matchingReplay: false,
    replayExistingResultOnly: false,
    eligibleForNewControlledHandling: true,
    eligibleForExecutorBoundary: true,
    failedStage: null,
    code: "controlled_action_validation_pipeline_completed",
    stages: createStages(overrides.stages || {}),
    authorizationResult: {
      ...EXPECTED_CORRELATION,
      accepted: true,
      code: "controlled_handling_authorized",
    },
    guardResult: {
      ...EXPECTED_CORRELATION,
      accepted: true,
      code: "controlled_action_guard_passed",
    },
    executionPolicyResult: {
      ...EXPECTED_CORRELATION,
      accepted: true,
      code: "controlled_action_execution_policy_matched",
    },
    commandEnvelope,
    ...createSafetyFields(),
    ...withoutPipelineOverrides(overrides),
  };
}

function withoutPipelineOverrides(overrides) {
  const { stages, commandEnvelope, ...rest } = overrides;
  return rest;
}

function createHandlerResult(overrides = {}) {
  const pipelineResult = Object.prototype.hasOwnProperty.call(
    overrides,
    "pipelineResult"
  )
    ? overrides.pipelineResult
    : createPipelineResult();

  return {
    accepted: true,
    handlerCompleted: true,
    failedStage: null,
    matchingReplay: false,
    replayExistingResultOnly: false,
    eligibleForExecutorBoundary: true,
    code: "controlled_action_validation_handler_completed",
    reviewId: EXPECTED_CORRELATION.reviewId,
    pipelineResult,
    ...createSafetyFields(),
    ...withoutHandlerOverrides(overrides),
  };
}

function withoutHandlerOverrides(overrides) {
  const { pipelineResult, ...rest } = overrides;
  return rest;
}

function createMatchingReplayHandlerResult() {
  return createHandlerResult({
    accepted: true,
    handlerCompleted: true,
    matchingReplay: true,
    replayExistingResultOnly: true,
    eligibleForExecutorBoundary: false,
    code: "controlled_action_validation_handler_matching_replay",
    pipelineResult: createPipelineResult({
      accepted: true,
      pipelineCompleted: true,
      allStagesAccepted: false,
      matchingReplay: true,
      replayExistingResultOnly: true,
      eligibleForNewControlledHandling: false,
      eligibleForExecutorBoundary: false,
      commandEnvelope: undefined,
      code: "controlled_action_pipeline_matching_replay",
      stages: {
        idempotencyAndVersionGuard: {
          status: "matching_replay",
          code: "controlled_action_matching_replay",
        },
        commandEnvelope: { status: "not_run" },
        executionPolicy: { status: "not_run" },
      },
    }),
  });
}

function createRejectedHandlerResult(failedStage, stageKey, stageCode) {
  return createHandlerResult({
    accepted: false,
    handlerCompleted: false,
    failedStage: "validation_pipeline",
    reason: "Validation pipeline rejected the controlled action request.",
    code: "validation_pipeline_rejected",
    matchingReplay: false,
    replayExistingResultOnly: false,
    eligibleForExecutorBoundary: false,
    pipelineResult: createPipelineResult({
      accepted: false,
      pipelineCompleted: false,
      allStagesAccepted: false,
      failedStage,
      reason: `${failedStage} stage rejected.`,
      code: `${stageKey}_stage_rejected`,
      stages: createRejectedStages(stageKey, stageCode),
      commandEnvelope: undefined,
    }),
  });
}

function createRejectedStages(stageKey, stageCode) {
  const stages = {};

  for (const key of [
    "preconditions",
    "authorization",
    "idempotencyAndVersionGuard",
    "commandEnvelope",
    "executionPolicy",
  ]) {
    if (key === stageKey) {
      stages[key] = { status: "rejected", code: stageCode };
    } else if (Object.keys(stages).length === 0) {
      stages[key] = { status: "not_run" };
    } else {
      stages[key] = { status: "accepted", code: `${key}_accepted` };
    }
  }

  return stages;
}

function construct(handlerResult) {
  return constructAppointmentReviewValidationDecisionReceipt({ handlerResult });
}

function assertSafetyFields(result) {
  for (const [field, value] of Object.entries(EXPECTED_SAFETY_FIELDS)) {
    assert.equal(result[field], value);
  }
}

function assertConstructed(result, outcome) {
  assert.equal(result.accepted, true);
  assert.equal(result.validationReceiptConstructed, true);
  assert.equal(result.receiptPersisted, false);
  assert.equal(result.code, RECEIPT_CODES.CONSTRUCTED);
  assertSafetyFields(result);
  assert.equal(result.validationReceipt.outcome, outcome);
}

function assertRejected(result, code) {
  assert.equal(result.accepted, false);
  assert.equal(result.validationReceiptConstructed, false);
  assert.equal(result.validationReceipt, null);
  assert.equal(result.receiptPersisted, false);
  assert.equal(result.code, code);
  assert.equal(typeof result.reason, "string");
  assertSafetyFields(result);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("validation decision receipt creates validation_passed approve receipt", () => {
  const result = construct(createHandlerResult());

  assertConstructed(result, RECEIPT_OUTCOMES.VALIDATION_PASSED);
  assert.equal(result.validationReceipt.receiptType, VALIDATION_RECEIPT_TYPE);
  assert.equal(
    result.validationReceipt.schemaVersion,
    VALIDATION_RECEIPT_SCHEMA_VERSION
  );
  assert.equal(
    result.validationReceipt.handlerCode,
    "controlled_action_validation_handler_completed"
  );
  assert.equal(
    result.validationReceipt.pipelineCode,
    "controlled_action_validation_pipeline_completed"
  );
  assert.equal(result.validationReceipt.eligibleForExecutorBoundary, true);
  assert.equal(result.validationReceipt.matchingReplay, false);
  assert.equal(result.validationReceipt.replayExistingResultOnly, false);
});

test("validation decision receipt creates validation_passed reject receipt", () => {
  const handlerResult = createHandlerResult({
    pipelineResult: createPipelineResult({
      commandEnvelope: createCommandEnvelope({
        actionIntent: "reject_intent",
        idempotencyKey: "review_receipt_demo:request_receipt_demo:reject",
        requestFingerprint:
          "reviewId:review_receipt_demo|actionIntent:reject_intent|actorId:secretary_receipt|requestId:request_receipt_demo|requiredPermission:appointment_review:reject|expectedReviewVersion:7",
        actor: {
          actorId: "secretary_receipt",
          actorRole: "secretary",
          requiredPermission: "appointment_review:reject",
          contextType: "verified_actor_context_v1",
          verificationSource: "server_auth_boundary",
        },
      }),
    }),
  });
  const result = construct(handlerResult);

  assertConstructed(result, RECEIPT_OUTCOMES.VALIDATION_PASSED);
  assert.equal(result.validationReceipt.correlation.actionIntent, "reject_intent");
  assert.equal(
    result.validationReceipt.correlation.requiredPermission,
    "appointment_review:reject"
  );
});

test("validation decision receipt creates matching_replay receipt without command envelope or previous result", () => {
  const result = construct(createMatchingReplayHandlerResult());

  assertConstructed(result, RECEIPT_OUTCOMES.MATCHING_REPLAY);
  assert.equal(result.validationReceipt.eligibleForExecutorBoundary, false);
  assert.equal(result.validationReceipt.matchingReplay, true);
  assert.equal(result.validationReceipt.replayExistingResultOnly, true);
  assert.equal(
    result.validationReceipt.pipelineCode,
    "controlled_action_pipeline_matching_replay"
  );
  assert.equal(
    result.validationReceipt.stages.idempotencyAndVersionGuard.status,
    "matching_replay"
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.validationReceipt, "commandEnvelope"),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.validationReceipt, "previousResult"),
    false
  );
});

test("validation decision receipt creates validation_rejected receipts for each rejected pipeline stage", () => {
  const cases = [
    ["preconditions", "preconditions", "missing_review_id"],
    ["authorization", "authorization", "missing_permissions"],
    ["idempotency_and_version_guard", "idempotencyAndVersionGuard", "review_version_conflict"],
    ["command_envelope", "commandEnvelope", "invalid_command_envelope"],
    ["execution_policy", "executionPolicy", "execution_must_remain_disabled"],
  ];

  for (const [failedStage, stageKey, stageCode] of cases) {
    const result = construct(
      createRejectedHandlerResult(failedStage, stageKey, stageCode)
    );

    assertConstructed(result, RECEIPT_OUTCOMES.VALIDATION_REJECTED);
    assert.equal(result.validationReceipt.failedStage, "validation_pipeline");
    assert.equal(
      result.validationReceipt.reason,
      "Validation pipeline rejected the controlled action request."
    );
    assert.equal(result.validationReceipt.stages[stageKey].status, "rejected");
    assert.equal(result.validationReceipt.stages[stageKey].code, stageCode);
  }
});

test("validation decision receipt contains safe correlation metadata only", () => {
  const result = construct(createHandlerResult());

  assertConstructed(result, RECEIPT_OUTCOMES.VALIDATION_PASSED);
  assert.deepEqual(result.validationReceipt.correlation, EXPECTED_CORRELATION);
  assert.deepEqual(Object.keys(result.validationReceipt.correlation), [
    "reviewId",
    "actionIntent",
    "actorId",
    "actorRole",
    "requestId",
    "idempotencyKey",
    "requestFingerprint",
    "requiredPermission",
    "expectedReviewVersion",
    "observedReviewVersion",
  ]);
});

test("validation decision receipt stage summaries contain only status and optional code", () => {
  const handlerResult = createHandlerResult({
    pipelineResult: createPipelineResult({
      stages: {
        preconditions: {
          status: "accepted",
          code: "action_preconditions_passed",
          rawResult: { patientName: "Should Not Copy" },
        },
      },
    }),
  });
  const result = construct(handlerResult);

  assertConstructed(result, RECEIPT_OUTCOMES.VALIDATION_PASSED);
  assert.deepEqual(Object.keys(result.validationReceipt.stages.preconditions), [
    "status",
    "code",
  ]);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result.validationReceipt.stages.preconditions,
      "rawResult"
    ),
    false
  );
});

test("validation decision receipt does not fabricate missing stages", () => {
  const result = construct(
    createHandlerResult({
      pipelineResult: createPipelineResult({
        stages: {
          preconditions: { status: "accepted", code: "ok" },
          authorization: undefined,
          idempotencyAndVersionGuard: undefined,
          commandEnvelope: undefined,
          executionPolicy: undefined,
        },
      }),
    })
  );

  assertRejected(result, RECEIPT_CODES.INVALID_STAGE_SUMMARY);

  const sparseResult = construct(
    createHandlerResult({
      pipelineResult: {
        ...createPipelineResult(),
        stages: {
          preconditions: { status: "accepted", code: "ok" },
        },
      },
    })
  );

  assertConstructed(sparseResult, RECEIPT_OUTCOMES.VALIDATION_PASSED);
  assert.deepEqual(Object.keys(sparseResult.validationReceipt.stages), [
    "preconditions",
  ]);
});

test("validation decision receipt rejects unsupported stage status", () => {
  const result = construct(
    createHandlerResult({
      pipelineResult: createPipelineResult({
        stages: {
          preconditions: { status: "approved", code: "unsafe" },
        },
      }),
    })
  );

  assertRejected(result, RECEIPT_CODES.INVALID_STAGE_SUMMARY);
});

test("validation decision receipt excludes sensitive patient clinical appointment calendar and credential data", () => {
  const handlerResult = createHandlerResult({
    patientName: "Example Patient",
    patientPhone: "+905551112233",
    patientMessage: "implant pain",
    treatmentNotes: "clinical note",
    appointmentDetails: { time: "10:00" },
    calendarEvent: { id: "calendar-event" },
    secret: "TOP_SECRET_VALUE",
    credentials: { token: "credential" },
    headers: { cookie: "session" },
    verifiedActorContext: { rawToken: "token" },
    executionPolicyContext: { completePolicy: true },
  });
  const result = construct(handlerResult);
  const serialized = JSON.stringify(result.validationReceipt);

  assertConstructed(result, RECEIPT_OUTCOMES.VALIDATION_PASSED);
  for (const forbiddenValue of [
    "Example Patient",
    "+905551112233",
    "implant pain",
    "clinical note",
    "10:00",
    "calendar-event",
    "TOP_SECRET_VALUE",
    "credential",
    "cookie",
    "token",
    "completePolicy",
  ]) {
    assert.equal(serialized.includes(forbiddenValue), false);
  }
});

test("validation decision receipt rejects missing malformed unsafe and unsupported inputs", () => {
  assertRejected(
    constructAppointmentReviewValidationDecisionReceipt(),
    RECEIPT_CODES.INVALID_INPUT
  );
  assertRejected(
    constructAppointmentReviewValidationDecisionReceipt({}),
    RECEIPT_CODES.MISSING_HANDLER_RESULT
  );
  assertRejected(
    constructAppointmentReviewValidationDecisionReceipt({ handlerResult: [] }),
    RECEIPT_CODES.INVALID_HANDLER_RESULT
  );
  assertRejected(
    construct({ ...createHandlerResult(), handlerChecked: false }),
    RECEIPT_CODES.INVALID_HANDLER_RESULT
  );
  assertRejected(
    construct({ ...createHandlerResult(), executionEnabled: true }),
    RECEIPT_CODES.UNSAFE_EXECUTION_FLAGS
  );
  assertRejected(
    construct({ ...createHandlerResult(), bookingCreated: true }),
    RECEIPT_CODES.UNSAFE_HANDLER_RESULT
  );
  assertRejected(
    construct({ ...createHandlerResult(), accepted: true, matchingReplay: true }),
    RECEIPT_CODES.UNSUPPORTED_HANDLER_OUTCOME
  );
  assertRejected(
    construct({ ...createHandlerResult(), reviewId: "" }),
    RECEIPT_CODES.MISSING_REVIEW_ID
  );
  assertRejected(
    construct({
      ...createHandlerResult(),
      pipelineResult: createPipelineResult({ requestId: {} }),
    }),
    RECEIPT_CODES.INVALID_CORRELATION_METADATA
  );
});

test("validation decision receipt rejects every unsafe handler true field", () => {
  for (const fieldName of [
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
  ]) {
    assertRejected(
      construct({ ...createHandlerResult(), [fieldName]: true }),
      RECEIPT_CODES.UNSAFE_HANDLER_RESULT
    );
  }
});

test("validation decision receipt preserves safety fields on accepted and rejected results", () => {
  assertSafetyFields(construct(createHandlerResult()));
  assertSafetyFields(
    constructAppointmentReviewValidationDecisionReceipt({ handlerResult: null })
  );
  assert.equal(construct(createHandlerResult()).receiptPersisted, false);
  assert.equal(construct(createHandlerResult()).commandDispatched, false);
  assert.equal(construct(createHandlerResult()).commandPersisted, false);
  assert.deepEqual(RECEIPT_SAFETY_FIELDS, EXPECTED_SAFETY_FIELDS);
});

test("validation decision receipt freezes receipt, stages, stage summaries and correlation", () => {
  const result = construct(createHandlerResult());

  assert.equal(Object.isFrozen(result.validationReceipt), true);
  assert.equal(Object.isFrozen(result.validationReceipt.stages), true);
  assert.equal(
    Object.isFrozen(result.validationReceipt.stages.preconditions),
    true
  );
  assert.equal(Object.isFrozen(result.validationReceipt.correlation), true);
});

test("validation decision receipt resists caller mutation and later calls stay independent", () => {
  const first = construct(createHandlerResult());
  const second = construct(createHandlerResult());

  assert.throws(() => {
    first.validationReceipt.outcome = "mutated";
  }, TypeError);
  assert.throws(() => {
    first.validationReceipt.stages.preconditions.status = "mutated";
  }, TypeError);
  assert.throws(() => {
    first.validationReceipt.correlation.reviewId = "mutated";
  }, TypeError);
  assert.deepEqual(second, construct(createHandlerResult()));
});

test("validation decision receipt does not mutate handler or nested pipeline input", () => {
  const handlerResult = createHandlerResult();
  const before = clone(handlerResult);

  construct(handlerResult);

  assert.deepEqual(handlerResult, before);
  assert.deepEqual(handlerResult.pipelineResult, before.pipelineResult);
});

test("validation decision receipt returns deterministic repeated results", () => {
  const handlerResult = createHandlerResult();

  assert.deepEqual(construct(handlerResult), construct(clone(handlerResult)));
});

test("validation decision receipt source has no side effects or forbidden production imports", () => {
  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, "utf8");

  assert.doesNotMatch(
    source,
    /createAppointment|createCalendarEvent|getCalendarProvider|manualAppointmentCalendarSync|googleapis|prisma|supabase|redis|fetch|node:fs|require\("fs"\)|console\.|cookies|headers|session|authProvider|authenticationProvider|authorizationProvider|appointmentReviewQueue|audit|logger|logging|commandBus|eventBus|jobQueue|require\([^)]*executor|import .*executor|executor\(|new Executor|Executor\(|dispatcher|app\/components|route|Date\.now|Math\.random|randomUUID|crypto|process\.env/
  );
  assert.doesNotMatch(
    source,
    /executionEnabled:\s*true|executorAvailable:\s*true|executionAvailable:\s*true|executionRequested:\s*true|actionPerformed:\s*true|commandDispatched:\s*true|commandPersisted:\s*true|receiptPersisted:\s*true|bookingCreated:\s*true|calendarChecked:\s*true|appointmentCreated:\s*true|calendarEventCreated:\s*true|databasePersisted:\s*true|reviewFound:\s*true|persisted:\s*true/
  );
});

test("existing Sprint 12J handler behavior remains unchanged", async () => {
  const result = await handleAppointmentReviewControlledActionValidation({
    method: "POST",
    reviewId: "review_receipt_handler",
    body: {
      actionIntent: "approve_intent",
      requestId: "request_receipt_handler",
      idempotencyKey: "review_receipt_handler:request_receipt_handler:approve",
      expectedReviewVersion: 7,
    },
    dependencies: {
      async resolveVerifiedActorContext() {
        return {
          contextType: "verified_actor_context_v1",
          verificationSource: "server_auth_boundary",
          actorId: "secretary_receipt",
          role: "secretary",
          authenticationVerified: true,
          authorizationVerified: true,
          permissions: ["appointment_review:approve"],
        };
      },
      async resolveAppointmentReviewContext() {
        return {
          contextType: "appointment_review_snapshot_context_v1",
          contextSource: "server_review_boundary",
          reviewId: "review_receipt_handler",
          currentState: "validation_only_intent_checked",
          observedReviewVersion: 7,
        };
      },
      async resolveIdempotencyContext() {
        return {
          contextType: "appointment_review_idempotency_context_v1",
          contextSource: "server_idempotency_boundary",
          priorIdempotencyObservation: null,
        };
      },
      async resolveExecutionPolicyContext() {
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
        };
      },
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.handlerCompleted, true);
  assert.equal(result.eligibleForExecutorBoundary, true);
});

test("existing Sprint 12H 12G 12F 12E 12D 12A and 11W behavior remains unchanged", () => {
  const preconditionsResult = validateAppointmentReviewActionPreconditions({
    reviewId: "review_receipt_demo",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: { actorId: "secretary_receipt", role: "secretary" },
    requestId: "request_receipt_demo",
  });
  const authorizationResult = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult,
    verifiedActorContext: {
      contextType: "verified_actor_context_v1",
      verificationSource: "server_auth_boundary",
      actorId: "secretary_receipt",
      role: "secretary",
      authenticationVerified: true,
      authorizationVerified: true,
      permissions: ["appointment_review:approve"],
    },
  });
  const guardResult = validateAppointmentReviewControlledActionGuard({
    authorizationResult,
    idempotencyKey: "review_receipt_demo:request_receipt_demo:approve",
    expectedReviewVersion: 7,
    observedReviewVersion: 7,
    priorIdempotencyObservation: null,
  });
  const commandEnvelopeResult =
    buildAppointmentReviewControlledActionCommandEnvelope({
      authorizationResult,
      guardResult,
    });
  const policyResult = evaluateAppointmentReviewControlledActionExecutionPolicy({
    commandEnvelopeResult,
    executionPolicyContext: {
      policyType: "appointment_review_execution_policy_v1",
      policyVersion: 1,
      policySource: "server_policy_boundary",
      policyMode: "controlled_validation_only",
      allowedActionIntents: ["approve_intent", "reject_intent"],
      allowedCurrentStates: ["validation_only_intent_checked"],
      requiredEnvelopeType: "appointment_review_controlled_action_command_v1",
      requiredSchemaVersion: 1,
      executionEnabled: false,
    },
  });
  const pipelineResult = runAppointmentReviewControlledActionValidationPipeline({
    preconditionsInput: {
      reviewId: "review_receipt_demo",
      actionIntent: "approve_intent",
      currentState: "validation_only_intent_checked",
      actor: { actorId: "secretary_receipt", role: "secretary" },
      requestId: "request_receipt_demo",
    },
    verifiedActorContext: {
      contextType: "verified_actor_context_v1",
      verificationSource: "server_auth_boundary",
      actorId: "secretary_receipt",
      role: "secretary",
      authenticationVerified: true,
      authorizationVerified: true,
      permissions: ["appointment_review:approve"],
    },
    idempotencyKey: "review_receipt_demo:request_receipt_demo:approve",
    expectedReviewVersion: 7,
    observedReviewVersion: 7,
    priorIdempotencyObservation: null,
    executionPolicyContext: {
      policyType: "appointment_review_execution_policy_v1",
      policyVersion: 1,
      policySource: "server_policy_boundary",
      policyMode: "controlled_validation_only",
      allowedActionIntents: ["approve_intent", "reject_intent"],
      allowedCurrentStates: ["validation_only_intent_checked"],
      requiredEnvelopeType: "appointment_review_controlled_action_command_v1",
      requiredSchemaVersion: 1,
      executionEnabled: false,
    },
  });
  const stateTransition = transitionAppointmentReviewActionIntentState({
    currentState: "pending_secretary_review",
    event: "check_validation_only_intent",
  });

  assert.equal(preconditionsResult.accepted, true);
  assert.equal(authorizationResult.accepted, true);
  assert.equal(guardResult.accepted, true);
  assert.equal(commandEnvelopeResult.accepted, true);
  assert.equal(policyResult.accepted, true);
  assert.equal(pipelineResult.accepted, true);
  assert.equal(stateTransition.accepted, true);
});
