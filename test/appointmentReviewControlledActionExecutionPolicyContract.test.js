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
  validateAppointmentReviewControlledActionGuard,
} = require("../src/secretary/appointmentReviewControlledActionGuardContract");
const {
  buildAppointmentReviewControlledActionCommandEnvelope,
} = require("../src/secretary/appointmentReviewControlledActionCommandEnvelopeContract");
const {
  EXECUTION_POLICY_MODE,
  EXECUTION_POLICY_SOURCE,
  EXECUTION_POLICY_TYPE,
  EXECUTION_POLICY_VERSION,
  POLICY_ALLOWED_ACTION_INTENTS,
  POLICY_ALLOWED_CURRENT_STATES,
  UNSAFE_EXECUTION_FIELDS,
  evaluateAppointmentReviewControlledActionExecutionPolicy,
} = require("../src/secretary/appointmentReviewControlledActionExecutionPolicyContract");

const CONTRACT_SOURCE_PATH =
  "src/secretary/appointmentReviewControlledActionExecutionPolicyContract.js";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
  executionPolicyChecked: true,
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

function createCommandEnvelope(overrides = {}) {
  return {
    envelopeType: "appointment_review_controlled_action_command_v1",
    schemaVersion: 1,
    reviewId: "review_policy_demo",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: "secretary_policy",
      actorRole: "secretary",
      requiredPermission: "appointment_review:approve",
      contextType: "verified_actor_context_v1",
      verificationSource: "server_auth_boundary",
      ...(overrides.actor || {}),
    },
    requestId: "request_policy_demo",
    idempotencyKey: "review_policy_demo:request_policy_demo:approve",
    expectedReviewVersion: 7,
    observedReviewVersion: 7,
    requestFingerprint:
      "reviewId:review_policy_demo|actionIntent:approve_intent|actorId:secretary_policy|requestId:request_policy_demo|requiredPermission:appointment_review:approve|expectedReviewVersion:7",
    ...withoutActor(overrides),
  };
}

function withoutActor(overrides) {
  const { actor, ...rest } = overrides;
  return rest;
}

function createCommandEnvelopeResult(overrides = {}) {
  const commandEnvelope = Object.prototype.hasOwnProperty.call(
    overrides,
    "commandEnvelope"
  )
    ? overrides.commandEnvelope &&
      typeof overrides.commandEnvelope === "object" &&
      !Array.isArray(overrides.commandEnvelope)
      ? createCommandEnvelope(overrides.commandEnvelope)
      : overrides.commandEnvelope
    : createCommandEnvelope();

  return {
    accepted: true,
    commandEnvelopeConstructed: true,
    commandEnvelopeChecked: true,
    commandDispatchAvailable: false,
    commandPersisted: false,
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
    commandEnvelope,
    ...withoutCommandEnvelope(overrides),
  };
}

function withoutCommandEnvelope(overrides) {
  const { commandEnvelope, ...rest } = overrides;
  return rest;
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

function evaluate(overrides = {}) {
  return evaluateAppointmentReviewControlledActionExecutionPolicy({
    commandEnvelopeResult: createCommandEnvelopeResult(
      overrides.commandEnvelopeResult || {}
    ),
    executionPolicyContext: createExecutionPolicyContext(
      overrides.executionPolicyContext || {}
    ),
    ...withoutContractInputs(overrides),
  });
}

function withoutContractInputs(overrides) {
  const { commandEnvelopeResult, executionPolicyContext, ...rest } = overrides;
  return rest;
}

function assertSafetyFields(result) {
  for (const [field, value] of Object.entries(EXPECTED_SAFETY_FIELDS)) {
    assert.equal(result[field], value);
  }
}

function assertDenied(result, code) {
  assert.equal(result.accepted, false);
  assert.equal(result.policyMatched, false);
  assert.equal(result.policyAllowsControlledHandling, false);
  assert.equal(result.eligibleForExecutorBoundary, false);
  assert.equal(result.policyDecision, "deny");
  assert.equal(result.code, code);
  assertSafetyFields(result);
}

function assertAccepted(result) {
  assert.equal(result.accepted, true);
  assert.equal(result.policyMatched, true);
  assert.equal(result.policyAllowsControlledHandling, true);
  assert.equal(result.eligibleForExecutorBoundary, true);
  assert.equal(result.policyDecision, "allow_controlled_handling");
  assert.equal(result.code, "controlled_action_execution_policy_matched");
  assertSafetyFields(result);
}

test("appointment review execution policy accepts a valid approve command", () => {
  const result = evaluate();

  assertAccepted(result);
  assert.equal(result.reviewId, "review_policy_demo");
  assert.equal(result.actionIntent, "approve_intent");
  assert.equal(result.currentState, "validation_only_intent_checked");
  assert.equal(result.actorId, "secretary_policy");
  assert.equal(result.actorRole, "secretary");
  assert.equal(result.requiredPermission, "appointment_review:approve");
  assert.equal(result.requestId, "request_policy_demo");
  assert.equal(result.idempotencyKey, "review_policy_demo:request_policy_demo:approve");
  assert.equal(result.expectedReviewVersion, 7);
  assert.equal(result.observedReviewVersion, 7);
  assert.equal(result.envelopeType, "appointment_review_controlled_action_command_v1");
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.policyType, "appointment_review_execution_policy_v1");
  assert.equal(result.policyVersion, 1);
});

test("appointment review execution policy accepts a valid reject command", () => {
  const result = evaluate({
    commandEnvelopeResult: {
      commandEnvelope: {
        actionIntent: "reject_intent",
        actor: {
          requiredPermission: "appointment_review:reject",
        },
        idempotencyKey: "review_policy_demo:request_policy_demo:reject",
        requestFingerprint:
          "reviewId:review_policy_demo|actionIntent:reject_intent|actorId:secretary_policy|requestId:request_policy_demo|requiredPermission:appointment_review:reject|expectedReviewVersion:7",
      },
    },
  });

  assertAccepted(result);
  assert.equal(result.actionIntent, "reject_intent");
  assert.equal(result.requiredPermission, "appointment_review:reject");
});

test("appointment review execution policy successful result uses allow decision", () => {
  assert.equal(evaluate().policyDecision, "allow_controlled_handling");
});

test("appointment review execution policy successful result marks executor boundary eligibility only", () => {
  assert.equal(evaluate().eligibleForExecutorBoundary, true);
});

test("appointment review execution policy successful result keeps execution disabled", () => {
  assert.equal(evaluate().executionEnabled, false);
});

test("appointment review execution policy successful result keeps executor unavailable", () => {
  assert.equal(evaluate().executorAvailable, false);
});

test("appointment review execution policy successful result keeps execution unavailable", () => {
  assert.equal(evaluate().executionAvailable, false);
});

test("appointment review execution policy rejects missing top-level input", () => {
  for (const input of [null, undefined, "", [], 0]) {
    assertDenied(
      evaluateAppointmentReviewControlledActionExecutionPolicy(input),
      "invalid_input"
    );
  }
});

test("appointment review execution policy rejects missing command envelope result", () => {
  assertDenied(
    evaluateAppointmentReviewControlledActionExecutionPolicy({
      executionPolicyContext: createExecutionPolicyContext(),
    }),
    "invalid_command_envelope_result"
  );
});

test("appointment review execution policy rejects rejected command envelope result", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        accepted: false,
      },
    }),
    "command_envelope_not_accepted"
  );
});

test("appointment review execution policy rejects malformed command envelope result", () => {
  const malformedResults = [
    "",
    [],
    createCommandEnvelopeResult({ commandEnvelopeChecked: false }),
    createCommandEnvelopeResult({ validationOnly: false }),
    createCommandEnvelopeResult({ controlledHandlingOnly: false }),
    createCommandEnvelopeResult({ commandDispatchAvailable: "false" }),
    createCommandEnvelopeResult({ persistence: "persisted" }),
  ];

  for (const commandEnvelopeResult of malformedResults) {
    const result = evaluateAppointmentReviewControlledActionExecutionPolicy({
      commandEnvelopeResult,
      executionPolicyContext: createExecutionPolicyContext(),
    });

    assert.equal(result.accepted, false);
    assert.match(result.code, /invalid_command_envelope_result|unsafe_command_envelope_result/);
    assertSafetyFields(result);
  }
});

test("appointment review execution policy rejects unsafe command envelope result", () => {
  for (const fieldName of UNSAFE_EXECUTION_FIELDS) {
    const result = evaluate({
      commandEnvelopeResult: {
        [fieldName]: true,
      },
    });

    assertDenied(
      result,
      "unsafe_execution_flags"
    );
  }
});

test("appointment review execution policy rejects missing command envelope", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        commandEnvelope: null,
      },
    }),
    "invalid_command_envelope"
  );
});

test("appointment review execution policy rejects unsupported envelope type", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        commandEnvelope: {
          envelopeType: "other_envelope",
        },
      },
    }),
    "unsupported_envelope_type"
  );
});

test("appointment review execution policy rejects unsupported schema version", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        commandEnvelope: {
          schemaVersion: 2,
        },
      },
    }),
    "unsupported_schema_version"
  );
});

test("appointment review execution policy rejects missing execution policy context", () => {
  assertDenied(
    evaluateAppointmentReviewControlledActionExecutionPolicy({
      commandEnvelopeResult: createCommandEnvelopeResult(),
    }),
    "missing_execution_policy_context"
  );
});

test("appointment review execution policy rejects wrong policy type", () => {
  assertDenied(
    evaluate({
      executionPolicyContext: {
        policyType: "client_policy",
      },
    }),
    "invalid_policy_type"
  );
});

test("appointment review execution policy rejects wrong policy version", () => {
  assertDenied(
    evaluate({
      executionPolicyContext: {
        policyVersion: 2,
      },
    }),
    "unsupported_policy_version"
  );
});

test("appointment review execution policy rejects wrong policy source", () => {
  assertDenied(
    evaluate({
      executionPolicyContext: {
        policySource: "client_body",
      },
    }),
    "unsupported_policy_source"
  );
});

test("appointment review execution policy rejects wrong policy mode", () => {
  assertDenied(
    evaluate({
      executionPolicyContext: {
        policyMode: "production_execution",
      },
    }),
    "unsupported_policy_mode"
  );
});

test("appointment review execution policy rejects execution enabled true", () => {
  assertDenied(
    evaluate({
      executionPolicyContext: {
        executionEnabled: true,
      },
    }),
    "execution_must_remain_disabled"
  );
});

test("appointment review execution policy rejects missing allowed action intents", () => {
  assertDenied(
    evaluate({
      executionPolicyContext: {
        allowedActionIntents: null,
      },
    }),
    "missing_allowed_action_intents"
  );
});

test("appointment review execution policy rejects wildcard action permissions", () => {
  for (const unsafeValue of ["*", "all", "admin", "ready_for_controlled_approval"]) {
    assertDenied(
      evaluate({
        executionPolicyContext: {
          allowedActionIntents: [unsafeValue],
        },
      }),
      "invalid_allowed_action_intents"
    );
  }
});

test("appointment review execution policy rejects missing allowed states", () => {
  assertDenied(
    evaluate({
      executionPolicyContext: {
        allowedCurrentStates: null,
      },
    }),
    "missing_allowed_current_states"
  );
});

test("appointment review execution policy rejects wildcard states", () => {
  for (const unsafeValue of ["*", "all", "admin", "ready_for_controlled_approval"]) {
    assertDenied(
      evaluate({
        executionPolicyContext: {
          allowedCurrentStates: [unsafeValue],
        },
      }),
      "invalid_allowed_current_states"
    );
  }
});

test("appointment review execution policy rejects action not included in policy", () => {
  assertDenied(
    evaluate({
      executionPolicyContext: {
        allowedActionIntents: ["reject_intent"],
      },
    }),
    "action_not_allowed_by_policy"
  );
});

test("appointment review execution policy rejects current state not included in policy", () => {
  assertDenied(
    evaluate({
      executionPolicyContext: {
        allowedCurrentStates: [],
      },
    }),
    "state_not_allowed_by_policy"
  );
});

test("appointment review execution policy rejects pending secretary review state", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        commandEnvelope: {
          currentState: "pending_secretary_review",
        },
      },
    }),
    "unsupported_current_state"
  );
});

test("appointment review execution policy rejects needs clinic review state", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        commandEnvelope: {
          currentState: "needs_clinic_review",
        },
      },
    }),
    "unsupported_current_state"
  );
});

test("appointment review execution policy rejects action intent rejected state", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        commandEnvelope: {
          currentState: "action_intent_rejected",
        },
      },
    }),
    "unsupported_current_state"
  );
});

test("appointment review execution policy rejects unsupported actor role", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        commandEnvelope: {
          actor: {
            actorRole: "doctor",
          },
        },
      },
    }),
    "unsupported_actor_role"
  );
});

test("appointment review execution policy rejects wrong actor context type", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        commandEnvelope: {
          actor: {
            contextType: "client_claim",
          },
        },
      },
    }),
    "invalid_actor_context_type"
  );
});

test("appointment review execution policy rejects wrong verification source", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        commandEnvelope: {
          actor: {
            verificationSource: "client_body",
          },
        },
      },
    }),
    "unsupported_verification_source"
  );
});

test("appointment review execution policy rejects approve intent with reject permission", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        commandEnvelope: {
          actor: {
            requiredPermission: "appointment_review:reject",
          },
        },
      },
    }),
    "required_permission_mismatch"
  );
});

test("appointment review execution policy rejects reject intent with approve permission", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        commandEnvelope: {
          actionIntent: "reject_intent",
        },
      },
    }),
    "required_permission_mismatch"
  );
});

test("appointment review execution policy rejects review version mismatch", () => {
  assertDenied(
    evaluate({
      commandEnvelopeResult: {
        commandEnvelope: {
          observedReviewVersion: 8,
        },
      },
    }),
    "review_version_conflict"
  );
});

test("appointment review execution policy rejects invalid review versions", () => {
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"]) {
    assertDenied(
      evaluate({
        commandEnvelopeResult: {
          commandEnvelope: {
            expectedReviewVersion: value,
          },
        },
      }),
      "invalid_command_envelope"
    );
  }
});

test("appointment review execution policy accepted result preserves safety fields", () => {
  assertAccepted(evaluate());
});

test("appointment review execution policy rejected result preserves safety fields", () => {
  const rejectedResults = [
    evaluateAppointmentReviewControlledActionExecutionPolicy(null),
    evaluate({ executionPolicyContext: { executionEnabled: true } }),
    evaluate({ commandEnvelopeResult: { commandEnvelopeConstructed: false } }),
  ];

  for (const result of rejectedResults) {
    assert.equal(result.accepted, false);
    assertSafetyFields(result);
  }
});

test("appointment review execution policy keeps commandDispatched false", () => {
  assert.equal(evaluate().commandDispatched, false);
});

test("appointment review execution policy keeps commandPersisted false", () => {
  assert.equal(evaluate().commandPersisted, false);
});

test("appointment review execution policy does not mutate inputs", () => {
  const commandEnvelopeResult = Object.freeze({
    ...createCommandEnvelopeResult(),
    commandEnvelope: Object.freeze({
      ...createCommandEnvelope(),
      actor: Object.freeze({ ...createCommandEnvelope().actor }),
    }),
  });
  const executionPolicyContext = Object.freeze({
    ...createExecutionPolicyContext(),
    allowedActionIntents: Object.freeze(["approve_intent", "reject_intent"]),
    allowedCurrentStates: Object.freeze(["validation_only_intent_checked"]),
  });
  const beforeCommand = JSON.stringify(commandEnvelopeResult);
  const beforePolicy = JSON.stringify(executionPolicyContext);

  evaluateAppointmentReviewControlledActionExecutionPolicy({
    commandEnvelopeResult,
    executionPolicyContext,
  });

  assert.equal(JSON.stringify(commandEnvelopeResult), beforeCommand);
  assert.equal(JSON.stringify(executionPolicyContext), beforePolicy);
});

test("appointment review execution policy exports immutable constants", () => {
  assert.equal(EXECUTION_POLICY_TYPE, "appointment_review_execution_policy_v1");
  assert.equal(EXECUTION_POLICY_VERSION, 1);
  assert.equal(EXECUTION_POLICY_SOURCE, "server_policy_boundary");
  assert.equal(EXECUTION_POLICY_MODE, "controlled_validation_only");
  assert.equal(Object.isFrozen(POLICY_ALLOWED_ACTION_INTENTS), true);
  assert.equal(Object.isFrozen(POLICY_ALLOWED_CURRENT_STATES), true);
  assert.equal(Object.isFrozen(UNSAFE_EXECUTION_FIELDS), true);
});

test("appointment review execution policy returns deterministic repeated results", () => {
  const input = {
    commandEnvelopeResult: createCommandEnvelopeResult(),
    executionPolicyContext: createExecutionPolicyContext(),
  };
  const first = evaluateAppointmentReviewControlledActionExecutionPolicy(input);
  const second = evaluateAppointmentReviewControlledActionExecutionPolicy(input);

  assert.deepEqual(second, first);
});

test("appointment review execution policy has no side effects or forbidden production imports", () => {
  let sideEffectCalled = false;
  const result = evaluateAppointmentReviewControlledActionExecutionPolicy({
    commandEnvelopeResult: {
      ...createCommandEnvelopeResult(),
      execute() {
        sideEffectCalled = true;
      },
    },
    executionPolicyContext: {
      ...createExecutionPolicyContext(),
      dispatch() {
        sideEffectCalled = true;
      },
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(sideEffectCalled, false);

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
    "fs",
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
});

test("appointment review execution policy has no route or UI imports", () => {
  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /route\.js/i);
  assert.doesNotMatch(source, /components\//i);
  assert.doesNotMatch(source, /workspace/i);
});

test("appointment review execution policy leaves Sprint 12F command envelope behavior unchanged", () => {
  const result = buildAppointmentReviewControlledActionCommandEnvelope({
    authorizationResult: {
      accepted: true,
      actorContextAccepted: true,
      controlledHandlingAuthorized: true,
      permissionMatched: true,
      authorizationChecked: true,
      validationOnly: true,
      controlledHandlingOnly: true,
      reviewId: "review_policy_regression",
      actionIntent: "approve_intent",
      currentState: "validation_only_intent_checked",
      actorId: "secretary_policy",
      actorRole: "secretary",
      requestId: "request_policy_regression",
      requiredPermission: "appointment_review:approve",
      contextType: "verified_actor_context_v1",
      verificationSource: "server_auth_boundary",
      executionAvailable: false,
      executionRequested: false,
      actionPerformed: false,
      bookingCreated: false,
      calendarChecked: false,
      appointmentCreated: false,
      calendarEventCreated: false,
      databasePersisted: false,
      persistence: "not_persisted",
    },
    guardResult: {
      accepted: true,
      guardPassed: true,
      guardChecked: true,
      idempotencyChecked: true,
      reviewVersionChecked: true,
      validationOnly: true,
      controlledHandlingOnly: true,
      duplicateRequest: false,
      replayExistingResultOnly: false,
      eligibleForNewControlledHandling: true,
      idempotencyStatus: "new_request",
      reviewVersionMatched: true,
      reviewId: "review_policy_regression",
      actionIntent: "approve_intent",
      actorId: "secretary_policy",
      actorRole: "secretary",
      requestId: "request_policy_regression",
      requiredPermission: "appointment_review:approve",
      idempotencyKey: "review_policy_regression:request_policy_regression:approve",
      expectedReviewVersion: 7,
      observedReviewVersion: 7,
      requestFingerprint:
        "reviewId:review_policy_regression|actionIntent:approve_intent|actorId:secretary_policy|requestId:request_policy_regression|requiredPermission:appointment_review:approve|expectedReviewVersion:7",
      executionAvailable: false,
      executionRequested: false,
      actionPerformed: false,
      bookingCreated: false,
      calendarChecked: false,
      appointmentCreated: false,
      calendarEventCreated: false,
      databasePersisted: false,
      persistence: "not_persisted",
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.commandEnvelopeConstructed, true);
  assert.equal(result.commandDispatchAvailable, false);
});

test("appointment review execution policy leaves Sprint 12E guard behavior unchanged", () => {
  const result = validateAppointmentReviewControlledActionGuard({
    authorizationResult: {
      accepted: true,
      actorContextAccepted: true,
      controlledHandlingAuthorized: true,
      permissionMatched: true,
      authorizationChecked: true,
      validationOnly: true,
      controlledHandlingOnly: true,
      reviewId: "review_policy_guard",
      actionIntent: "approve_intent",
      currentState: "validation_only_intent_checked",
      actorId: "secretary_policy",
      actorRole: "secretary",
      requestId: "request_policy_guard",
      requiredPermission: "appointment_review:approve",
      contextType: "verified_actor_context_v1",
      verificationSource: "server_auth_boundary",
      executionAvailable: false,
      executionRequested: false,
      actionPerformed: false,
      bookingCreated: false,
      calendarChecked: false,
      appointmentCreated: false,
      calendarEventCreated: false,
      databasePersisted: false,
      persistence: "not_persisted",
    },
    idempotencyKey: "review_policy_guard:request_policy_guard:approve",
    expectedReviewVersion: 7,
    observedReviewVersion: 7,
    priorIdempotencyObservation: null,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.idempotencyStatus, "new_request");
  assert.equal(result.bookingCreated, false);
});

test("appointment review execution policy leaves Sprint 12D authorization behavior unchanged", () => {
  const result = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult: {
      accepted: true,
      eligibleForControlledHandling: true,
      controlledHandlingOnly: true,
      reviewId: "review_policy_authorization",
      actionIntent: "approve_intent",
      currentState: "validation_only_intent_checked",
      actorId: "secretary_policy",
      actorRole: "secretary",
      requestId: "request_policy_authorization",
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
    },
    verifiedActorContext: {
      contextType: "verified_actor_context_v1",
      verificationSource: "server_auth_boundary",
      actorId: "secretary_policy",
      role: "secretary",
      authenticationVerified: true,
      authorizationVerified: true,
      permissions: ["appointment_review:approve"],
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_handling_authorized");
  assert.equal(result.actionPerformed, false);
});

test("appointment review execution policy leaves Sprint 11W state machine behavior unchanged", () => {
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
  assert.equal(result.actionPerformed, false);
});

test("appointment review execution policy leaves Sprint 12A preconditions behavior unchanged", () => {
  const result = validateAppointmentReviewActionPreconditions({
    reviewId: "review_policy_preconditions",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: "secretary_policy",
      role: "secretary",
    },
    requestId: "request_policy_preconditions",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.eligibleForControlledHandling, true);
  assert.equal(result.actionPerformed, false);
});
