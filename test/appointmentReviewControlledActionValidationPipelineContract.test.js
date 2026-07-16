const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  validateAppointmentReviewActionPreconditions,
} = require("../src/secretary/appointmentReviewActionPreconditionsContract");
const {
  APPOINTMENT_REVIEW_ACTION_STATES,
  transitionAppointmentReviewActionIntentState,
} = require("../src/secretary/appointmentReviewActionIntentStateMachine");
const {
  authorizeAppointmentReviewVerifiedActor,
} = require("../src/secretary/appointmentReviewVerifiedActorAuthorizationContract");
const {
  buildReviewGuardRequestFingerprint,
  validateAppointmentReviewControlledActionGuard,
} = require("../src/secretary/appointmentReviewControlledActionGuardContract");
const {
  buildAppointmentReviewControlledActionCommandEnvelope,
} = require("../src/secretary/appointmentReviewControlledActionCommandEnvelopeContract");
const {
  evaluateAppointmentReviewControlledActionExecutionPolicy,
} = require("../src/secretary/appointmentReviewControlledActionExecutionPolicyContract");
const {
  PIPELINE_CODES,
  PIPELINE_SAFETY_FIELDS,
  PIPELINE_STAGE_ORDER,
  UNSAFE_STAGE_RESULT_FIELDS,
  runAppointmentReviewControlledActionValidationPipeline,
  runAppointmentReviewControlledActionValidationPipelineWithContracts,
} = require("../src/secretary/appointmentReviewControlledActionValidationPipelineContract");

const CONTRACT_SOURCE_PATH =
  "src/secretary/appointmentReviewControlledActionValidationPipelineContract.js";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
  pipelineChecked: true,
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

function createPreconditionsInput(overrides = {}) {
  return {
    reviewId: "review_pipeline_demo",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: "secretary_pipeline",
      role: "secretary",
      ...(overrides.actor || {}),
    },
    requestId: "request_pipeline_demo",
    ...withoutActor(overrides),
  };
}

function withoutActor(overrides) {
  const { actor, ...rest } = overrides;
  return rest;
}

function createVerifiedActorContext(overrides = {}) {
  return {
    contextType: "verified_actor_context_v1",
    verificationSource: "server_auth_boundary",
    actorId: "secretary_pipeline",
    role: "secretary",
    authenticationVerified: true,
    authorizationVerified: true,
    permissions: ["appointment_review:approve"],
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

function createPipelineInput(overrides = {}) {
  const preconditionsInput = createPreconditionsInput(
    overrides.preconditionsInput || {}
  );
  const actionIntent = preconditionsInput.actionIntent;
  const permission =
    actionIntent === "reject_intent"
      ? "appointment_review:reject"
      : "appointment_review:approve";

  return {
    preconditionsInput,
    verifiedActorContext: createVerifiedActorContext({
      permissions: [permission],
      ...(overrides.verifiedActorContext || {}),
    }),
    idempotencyKey:
      overrides.idempotencyKey ||
      `review_pipeline_demo:request_pipeline_demo:${actionIntent}`,
    expectedReviewVersion: Object.prototype.hasOwnProperty.call(
      overrides,
      "expectedReviewVersion"
    )
      ? overrides.expectedReviewVersion
      : 7,
    observedReviewVersion: Object.prototype.hasOwnProperty.call(
      overrides,
      "observedReviewVersion"
    )
      ? overrides.observedReviewVersion
      : 7,
    priorIdempotencyObservation: Object.prototype.hasOwnProperty.call(
      overrides,
      "priorIdempotencyObservation"
    )
      ? overrides.priorIdempotencyObservation
      : null,
    executionPolicyContext: createExecutionPolicyContext(
      overrides.executionPolicyContext || {}
    ),
  };
}

function createMatchingReplayInput() {
  const input = createPipelineInput();
  const authorizationResult = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult: validateAppointmentReviewActionPreconditions(
      input.preconditionsInput
    ),
    verifiedActorContext: input.verifiedActorContext,
  });
  const requestFingerprint = buildReviewGuardRequestFingerprint({
    authorizationResult,
    expectedReviewVersion: input.expectedReviewVersion,
  });

  return {
    ...input,
    priorIdempotencyObservation: {
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
    },
  };
}

function run(overrides = {}) {
  return runAppointmentReviewControlledActionValidationPipeline(
    createPipelineInput(overrides)
  );
}

function assertSafetyFields(result) {
  for (const [field, value] of Object.entries(EXPECTED_SAFETY_FIELDS)) {
    assert.equal(result[field], value);
  }
}

function assertStageStatuses(result, statuses) {
  for (const [stageName, status] of Object.entries(statuses)) {
    assert.equal(result.stages[stageName].status, status);
  }
}

function assertAcceptedPipeline(result) {
  assert.equal(result.accepted, true);
  assert.equal(result.pipelineCompleted, true);
  assert.equal(result.allStagesAccepted, true);
  assert.equal(result.matchingReplay, false);
  assert.equal(result.replayExistingResultOnly, false);
  assert.equal(result.eligibleForNewControlledHandling, true);
  assert.equal(result.eligibleForExecutorBoundary, true);
  assert.equal(result.failedStage, null);
  assert.equal(result.code, PIPELINE_CODES.COMPLETED);
  assertSafetyFields(result);
}

function assertRejectedPipeline(result, failedStage, code) {
  assert.equal(result.accepted, false);
  assert.equal(result.pipelineCompleted, false);
  assert.equal(result.allStagesAccepted, false);
  assert.equal(result.matchingReplay, false);
  assert.equal(result.replayExistingResultOnly, false);
  assert.equal(result.eligibleForNewControlledHandling, false);
  assert.equal(result.eligibleForExecutorBoundary, false);
  assert.equal(result.failedStage, failedStage);
  assert.equal(result.code, code);
  assertSafetyFields(result);
}

test("appointment review validation pipeline completes every stage for approve", () => {
  const result = run();

  assertAcceptedPipeline(result);
  assertStageStatuses(result, {
    preconditions: "accepted",
    authorization: "accepted",
    idempotencyAndVersionGuard: "accepted",
    commandEnvelope: "accepted",
    executionPolicy: "accepted",
  });
  assert.equal(result.commandEnvelope.actionIntent, "approve_intent");
});

test("appointment review validation pipeline completes every stage for reject", () => {
  const result = run({
    preconditionsInput: { actionIntent: "reject_intent" },
    idempotencyKey: "review_pipeline_demo:request_pipeline_demo:reject_intent",
  });

  assertAcceptedPipeline(result);
  assert.equal(result.commandEnvelope.actionIntent, "reject_intent");
  assert.equal(
    result.commandEnvelope.actor.requiredPermission,
    "appointment_review:reject"
  );
});

test("accepted pipeline uses the pipeline completed code", () => {
  assert.equal(run().code, "controlled_action_validation_pipeline_completed");
});

test("accepted pipeline marks every stage accepted", () => {
  const result = run();

  for (const stage of Object.values(result.stages)) {
    assert.equal(stage.status, "accepted");
  }
});

test("pipeline calls stages in the required order", () => {
  const calls = [];
  const input = createPipelineInput();

  const result =
    runAppointmentReviewControlledActionValidationPipelineWithContracts(input, {
      validatePreconditions(preconditionsInput) {
        calls.push("preconditions");
        return validateAppointmentReviewActionPreconditions(preconditionsInput);
      },
      authorizeActor(authorizationInput) {
        calls.push("authorization");
        return authorizeAppointmentReviewVerifiedActor(authorizationInput);
      },
      validateGuard(guardInput) {
        calls.push("idempotency_and_version_guard");
        return validateAppointmentReviewControlledActionGuard(guardInput);
      },
      buildCommandEnvelope(envelopeInput) {
        calls.push("command_envelope");
        return buildAppointmentReviewControlledActionCommandEnvelope(envelopeInput);
      },
      evaluateExecutionPolicy(policyInput) {
        calls.push("execution_policy");
        return evaluateAppointmentReviewControlledActionExecutionPolicy(policyInput);
      },
    });

  assertAcceptedPipeline(result);
  assert.deepEqual(calls, PIPELINE_STAGE_ORDER);
});

test("accepted pipeline returns the command envelope", () => {
  const result = run();

  assert.equal(result.commandEnvelope.envelopeType, "appointment_review_controlled_action_command_v1");
  assert.equal(result.commandEnvelopeResult.commandEnvelope, result.commandEnvelope);
});

test("accepted pipeline returns the policy decision", () => {
  assert.equal(run().policyDecision, "allow_controlled_handling");
});

test("accepted pipeline keeps execution enabled false", () => {
  assert.equal(run().executionEnabled, false);
});

test("accepted pipeline keeps executor available false", () => {
  assert.equal(run().executorAvailable, false);
});

test("accepted pipeline keeps execution available false", () => {
  assert.equal(run().executionAvailable, false);
});

test("pipeline rejects missing input at the boundary", () => {
  const result = runAppointmentReviewControlledActionValidationPipeline(null);

  assertRejectedPipeline(result, null, "invalid_input");
  assertStageStatuses(result, {
    preconditions: "not_run",
    authorization: "not_run",
    idempotencyAndVersionGuard: "not_run",
    commandEnvelope: "not_run",
    executionPolicy: "not_run",
  });
});

test("preconditions rejection stops all later stages", () => {
  const result = run({ preconditionsInput: { reviewId: "" } });

  assertRejectedPipeline(result, "preconditions", "preconditions_stage_rejected");
  assert.equal(result.stageCode, "missing_review_id");
  assertStageStatuses(result, {
    preconditions: "rejected",
    authorization: "not_run",
    idempotencyAndVersionGuard: "not_run",
    commandEnvelope: "not_run",
    executionPolicy: "not_run",
  });
});

test("authorization rejection stops guard envelope and policy", () => {
  const result = run({
    verifiedActorContext: { permissions: [] },
  });

  assertRejectedPipeline(result, "authorization", "authorization_stage_rejected");
  assert.equal(result.stageCode, "missing_permissions");
  assertStageStatuses(result, {
    preconditions: "accepted",
    authorization: "rejected",
    idempotencyAndVersionGuard: "not_run",
    commandEnvelope: "not_run",
    executionPolicy: "not_run",
  });
});

test("guard rejection stops envelope and policy", () => {
  const result = run({ observedReviewVersion: 8 });

  assertRejectedPipeline(
    result,
    "idempotency_and_version_guard",
    "idempotency_guard_stage_rejected"
  );
  assert.equal(result.stageCode, "review_version_conflict");
  assertStageStatuses(result, {
    preconditions: "accepted",
    authorization: "accepted",
    idempotencyAndVersionGuard: "rejected",
    commandEnvelope: "not_run",
    executionPolicy: "not_run",
  });
});

test("command envelope rejection stops policy", () => {
  const calls = [];
  const result =
    runAppointmentReviewControlledActionValidationPipelineWithContracts(
      createPipelineInput(),
      {
        buildCommandEnvelope() {
          calls.push("commandEnvelope");
          return {
            accepted: false,
            commandEnvelopeConstructed: false,
            commandDispatchAvailable: false,
            commandPersisted: false,
            commandEnvelope: null,
            code: "synthetic_envelope_rejected",
            reason: "Synthetic command envelope rejection.",
            validationOnly: true,
            controlledHandlingOnly: true,
            executionAvailable: false,
            executionRequested: false,
            actionPerformed: false,
            bookingCreated: false,
            calendarChecked: false,
            appointmentCreated: false,
            calendarEventCreated: false,
            databasePersisted: false,
            persistence: "not_persisted",
          };
        },
        evaluateExecutionPolicy() {
          calls.push("policy");
          return null;
        },
      }
    );

  assertRejectedPipeline(result, "command_envelope", "command_envelope_stage_rejected");
  assert.equal(result.stageCode, "synthetic_envelope_rejected");
  assert.deepEqual(calls, ["commandEnvelope"]);
  assert.equal(result.stages.executionPolicy.status, "not_run");
});

test("execution policy rejection reports execution policy stage", () => {
  const result = run({
    executionPolicyContext: {
      allowedActionIntents: ["reject_intent"],
    },
  });

  assertRejectedPipeline(result, "execution_policy", "execution_policy_stage_rejected");
  assert.equal(result.stageCode, "action_not_allowed_by_policy");
  assert.equal(result.stages.executionPolicy.status, "rejected");
});

test("matching replay does not build a second envelope", () => {
  const calls = [];
  const result =
    runAppointmentReviewControlledActionValidationPipelineWithContracts(
      createMatchingReplayInput(),
      {
        buildCommandEnvelope() {
          calls.push("commandEnvelope");
          return null;
        },
      }
    );

  assert.equal(result.accepted, true);
  assert.equal(result.matchingReplay, true);
  assert.deepEqual(calls, []);
});

test("matching replay does not run execution policy", () => {
  const calls = [];
  const result =
    runAppointmentReviewControlledActionValidationPipelineWithContracts(
      createMatchingReplayInput(),
      {
        evaluateExecutionPolicy() {
          calls.push("policy");
          return null;
        },
      }
    );

  assert.equal(result.accepted, true);
  assert.equal(result.matchingReplay, true);
  assert.deepEqual(calls, []);
});

test("matching replay sets replayExistingResultOnly true", () => {
  const result = runAppointmentReviewControlledActionValidationPipeline(
    createMatchingReplayInput()
  );

  assert.equal(result.replayExistingResultOnly, true);
});

test("matching replay sets eligibleForExecutorBoundary false", () => {
  const result = runAppointmentReviewControlledActionValidationPipeline(
    createMatchingReplayInput()
  );

  assert.equal(result.eligibleForExecutorBoundary, false);
});

test("matching replay does not invent a prior result", () => {
  const result = runAppointmentReviewControlledActionValidationPipeline(
    createMatchingReplayInput()
  );

  assert.equal(Object.hasOwn(result, "commandEnvelope"), false);
  assert.equal(Object.hasOwn(result, "commandEnvelopeResult"), false);
  assert.equal(Object.hasOwn(result, "executionPolicyResult"), false);
  assert.equal(Object.hasOwn(result, "previousExecutionResult"), false);
});

test("matching replay marks later stages not run", () => {
  const result = runAppointmentReviewControlledActionValidationPipeline(
    createMatchingReplayInput()
  );

  assertStageStatuses(result, {
    preconditions: "accepted",
    authorization: "accepted",
    idempotencyAndVersionGuard: "matching_replay",
    commandEnvelope: "not_run",
    executionPolicy: "not_run",
  });
});

test("first rejected stage is reported correctly", () => {
  const result = run({
    preconditionsInput: { reviewId: "" },
    verifiedActorContext: { permissions: [] },
  });

  assert.equal(result.failedStage, "preconditions");
  assert.equal(result.stageCode, "missing_review_id");
});

test("underlying stage codes are preserved safely", () => {
  const result = run({ observedReviewVersion: 8 });

  assert.equal(result.stageCode, "review_version_conflict");
  assert.equal(
    result.stages.idempotencyAndVersionGuard.code,
    "review_version_conflict"
  );
});

test("unsafe preconditions stage output is rejected", () => {
  const result = runWithUnsafeStage("validatePreconditions");

  assertRejectedPipeline(result, "preconditions", "unsafe_execution_flags");
});

test("unsafe authorization stage output is rejected", () => {
  const result = runWithUnsafeStage("authorizeActor");

  assertRejectedPipeline(result, "authorization", "unsafe_execution_flags");
});

test("unsafe guard stage output is rejected", () => {
  const result = runWithUnsafeStage("validateGuard");

  assertRejectedPipeline(
    result,
    "idempotency_and_version_guard",
    "unsafe_execution_flags"
  );
});

test("unsafe envelope stage output is rejected", () => {
  const result = runWithUnsafeStage("buildCommandEnvelope");

  assertRejectedPipeline(result, "command_envelope", "unsafe_execution_flags");
});

test("unsafe policy stage output is rejected", () => {
  const result = runWithUnsafeStage("evaluateExecutionPolicy");

  assertRejectedPipeline(result, "execution_policy", "unsafe_execution_flags");
});

test("malformed stage output is rejected", () => {
  const result =
    runAppointmentReviewControlledActionValidationPipelineWithContracts(
      createPipelineInput(),
      {
        authorizeActor() {
          return null;
        },
      }
    );

  assertRejectedPipeline(result, "authorization", "unexpected_stage_result");
});

test("accepted result preserves all non-execution safety fields", () => {
  assertSafetyFields(run());
});

test("replay result preserves all non-execution safety fields", () => {
  assertSafetyFields(
    runAppointmentReviewControlledActionValidationPipeline(createMatchingReplayInput())
  );
});

test("rejected result preserves all non-execution safety fields", () => {
  assertSafetyFields(run({ preconditionsInput: { requestId: "" } }));
});

test("pipeline never marks command dispatch true", () => {
  assert.equal(run().commandDispatched, false);
});

test("pipeline never marks command persistence true", () => {
  assert.equal(run().commandPersisted, false);
});

test("pipeline source has no queue booking calendar database environment filesystem or network side effects", () => {
  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, "utf8");
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
    "process" + ".env",
    "Date" + ".now",
    "Math" + ".random",
    "random" + "UUID",
    "crypto",
  ];

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
});

test("pipeline source has no route or UI imports", () => {
  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /route\.js/i);
  assert.doesNotMatch(source, /components\//i);
  assert.doesNotMatch(source, /workspace/i);
});

test("pipeline does not mutate top-level input", () => {
  const input = createPipelineInput();
  const before = JSON.stringify(input);

  runAppointmentReviewControlledActionValidationPipeline(input);

  assert.equal(JSON.stringify(input), before);
});

test("pipeline does not mutate nested inputs", () => {
  const input = Object.freeze({
    ...createPipelineInput(),
    preconditionsInput: Object.freeze({
      ...createPreconditionsInput(),
      actor: Object.freeze({ ...createPreconditionsInput().actor }),
    }),
    verifiedActorContext: Object.freeze({
      ...createVerifiedActorContext(),
      permissions: Object.freeze(["appointment_review:approve"]),
    }),
  });
  const before = JSON.stringify(input);

  runAppointmentReviewControlledActionValidationPipeline(input);

  assert.equal(JSON.stringify(input), before);
});

test("pipeline does not mutate prior observation", () => {
  const input = createMatchingReplayInput();
  const before = JSON.stringify(input.priorIdempotencyObservation);

  runAppointmentReviewControlledActionValidationPipeline(input);

  assert.equal(JSON.stringify(input.priorIdempotencyObservation), before);
});

test("pipeline does not mutate policy context", () => {
  const input = createPipelineInput();
  const before = JSON.stringify(input.executionPolicyContext);

  runAppointmentReviewControlledActionValidationPipeline(input);

  assert.equal(JSON.stringify(input.executionPolicyContext), before);
});

test("repeated equivalent calls return deeply equivalent results", () => {
  const input = createPipelineInput();
  const first = runAppointmentReviewControlledActionValidationPipeline(input);
  const second = runAppointmentReviewControlledActionValidationPipeline(input);

  assert.deepEqual(second, first);
});

test("exported pipeline constants are immutable", () => {
  assert.equal(Object.isFrozen(PIPELINE_CODES), true);
  assert.equal(Object.isFrozen(PIPELINE_SAFETY_FIELDS), true);
  assert.equal(Object.isFrozen(PIPELINE_STAGE_ORDER), true);
  assert.equal(Object.isFrozen(UNSAFE_STAGE_RESULT_FIELDS), true);
  assert.deepEqual(PIPELINE_STAGE_ORDER, [
    "preconditions",
    "authorization",
    "idempotency_and_version_guard",
    "command_envelope",
    "execution_policy",
  ]);
});

test("existing Sprint 12G policy behavior remains unchanged", () => {
  const pipelineResult = run();
  const result = evaluateAppointmentReviewControlledActionExecutionPolicy({
    commandEnvelopeResult: pipelineResult.commandEnvelopeResult,
    executionPolicyContext: createExecutionPolicyContext(),
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_execution_policy_matched");
  assert.equal(result.bookingCreated, false);
});

test("existing Sprint 12F envelope behavior remains unchanged", () => {
  const pipelineResult = run();
  const result = buildAppointmentReviewControlledActionCommandEnvelope({
    authorizationResult: pipelineResult.authorizationResult,
    guardResult: pipelineResult.guardResult,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.commandEnvelopeConstructed, true);
  assert.equal(result.commandPersisted, false);
});

test("existing Sprint 12E guard behavior remains unchanged", () => {
  const preconditionsResult = validateAppointmentReviewActionPreconditions(
    createPreconditionsInput()
  );
  const authorizationResult = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult,
    verifiedActorContext: createVerifiedActorContext(),
  });
  const result = validateAppointmentReviewControlledActionGuard({
    authorizationResult,
    idempotencyKey: "review_pipeline_demo:request_pipeline_demo:approve_intent",
    expectedReviewVersion: 7,
    observedReviewVersion: 7,
    priorIdempotencyObservation: null,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.idempotencyStatus, "new_request");
  assert.equal(result.actionPerformed, false);
});

test("existing Sprint 12D authorization behavior remains unchanged", () => {
  const result = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult: validateAppointmentReviewActionPreconditions(
      createPreconditionsInput()
    ),
    verifiedActorContext: createVerifiedActorContext(),
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_handling_authorized");
  assert.equal(result.calendarChecked, false);
});

test("existing Sprint 12A preconditions behavior remains unchanged", () => {
  const result = validateAppointmentReviewActionPreconditions(createPreconditionsInput());

  assert.equal(result.accepted, true);
  assert.equal(result.code, "preconditions_satisfied");
  assert.equal(result.appointmentCreated, false);
});

test("existing Sprint 11W state machine behavior remains unchanged", () => {
  assert.deepEqual(APPOINTMENT_REVIEW_ACTION_STATES, [
    "pending_secretary_review",
    "validation_only_intent_checked",
    "needs_clinic_review",
    "action_intent_rejected",
  ]);

  const result = transitionAppointmentReviewActionIntentState({
    currentState: "pending_secretary_review",
    event: "check_validation_only_intent",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.nextState, "validation_only_intent_checked");
});

function runWithUnsafeStage(stageName) {
  return runAppointmentReviewControlledActionValidationPipelineWithContracts(
    createPipelineInput(),
    {
      [stageName]() {
        return {
          accepted: true,
          code: "synthetic_unsafe_stage",
          validationOnly: true,
          controlledHandlingOnly: true,
          executionAvailable: true,
          executionRequested: false,
          actionPerformed: false,
          bookingCreated: false,
          calendarChecked: false,
          appointmentCreated: false,
          calendarEventCreated: false,
          databasePersisted: false,
          persistence: "not_persisted",
        };
      },
    }
  );
}
