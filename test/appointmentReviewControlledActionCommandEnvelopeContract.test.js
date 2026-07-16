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
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  COMMAND_ENVELOPE_TYPE,
  UNSAFE_EXECUTION_FIELDS,
  buildAppointmentReviewControlledActionCommandEnvelope,
} = require("../src/secretary/appointmentReviewControlledActionCommandEnvelopeContract");

const CONTRACT_SOURCE_PATH =
  "src/secretary/appointmentReviewControlledActionCommandEnvelopeContract.js";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
  commandEnvelopeChecked: true,
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
});

const EXPECTED_ENVELOPE_KEYS = Object.freeze([
  "envelopeType",
  "schemaVersion",
  "reviewId",
  "actionIntent",
  "currentState",
  "actor",
  "requestId",
  "idempotencyKey",
  "expectedReviewVersion",
  "observedReviewVersion",
  "requestFingerprint",
]);

const EXPECTED_ACTOR_KEYS = Object.freeze([
  "actorId",
  "actorRole",
  "requiredPermission",
  "contextType",
  "verificationSource",
]);

function createAuthorizationResult(overrides = {}) {
  return {
    accepted: true,
    actorContextAccepted: true,
    controlledHandlingAuthorized: true,
    permissionMatched: true,
    authorizationChecked: true,
    validationOnly: true,
    controlledHandlingOnly: true,
    reviewId: "review_command_demo",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actorId: "secretary_command",
    actorRole: "secretary",
    requestId: "request_command_demo",
    requiredPermission: "appointment_review:approve",
    contextType: "verified_actor_context_v1",
    verificationSource: "server_auth_boundary",
    code: "controlled_handling_authorized",
    executionAvailable: false,
    executionRequested: false,
    actionPerformed: false,
    bookingCreated: false,
    calendarChecked: false,
    appointmentCreated: false,
    calendarEventCreated: false,
    databasePersisted: false,
    persistence: "not_persisted",
    ...overrides,
  };
}

function createGuardResult(overrides = {}) {
  return {
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
    reviewId: "review_command_demo",
    actionIntent: "approve_intent",
    actorId: "secretary_command",
    actorRole: "secretary",
    requestId: "request_command_demo",
    requiredPermission: "appointment_review:approve",
    idempotencyKey: "review_command_demo:request_command_demo:approve",
    expectedReviewVersion: 5,
    observedReviewVersion: 5,
    requestFingerprint:
      "reviewId:review_command_demo|actionIntent:approve_intent|actorId:secretary_command|requestId:request_command_demo|requiredPermission:appointment_review:approve|expectedReviewVersion:5",
    code: "controlled_action_guard_passed",
    executionAvailable: false,
    executionRequested: false,
    actionPerformed: false,
    bookingCreated: false,
    calendarChecked: false,
    appointmentCreated: false,
    calendarEventCreated: false,
    databasePersisted: false,
    persistence: "not_persisted",
    ...overrides,
  };
}

function build(overrides = {}) {
  return buildAppointmentReviewControlledActionCommandEnvelope({
    authorizationResult: createAuthorizationResult(overrides.authorizationResult),
    guardResult: createGuardResult(overrides.guardResult),
  });
}

function assertSafetyFields(result) {
  for (const [field, value] of Object.entries(EXPECTED_SAFETY_FIELDS)) {
    assert.equal(result[field], value);
  }
}

function assertNoExecution(result) {
  assert.equal(result.executionAvailable, false);
  assert.equal(result.executionRequested, false);
  assert.equal(result.actionPerformed, false);
  assert.equal(result.bookingCreated, false);
  assert.equal(result.calendarChecked, false);
  assert.equal(result.appointmentCreated, false);
  assert.equal(result.calendarEventCreated, false);
  assert.equal(result.databasePersisted, false);
  assert.equal(result.commandDispatchAvailable, false);
  assert.equal(result.commandPersisted, false);
  assert.notEqual(result.reviewFound, true);
  assert.notEqual(result.persisted, true);
  assert.notEqual(result.commandDispatched, true);
  assert.notEqual(result.idempotencyRecordCreated, true);
  assert.notEqual(result.previousActionExecuted, true);
}

function assertAcceptedEnvelope(result) {
  assert.equal(result.accepted, true);
  assert.equal(result.commandEnvelopeConstructed, true);
  assert.equal(result.commandDispatchAvailable, false);
  assert.equal(result.commandPersisted, false);
  assert.equal(result.code, "controlled_action_command_envelope_constructed");
  assertSafetyFields(result);
  assertNoExecution(result);
}

test("appointment review controlled action command envelope constructs approve envelope", () => {
  const result = build();

  assertAcceptedEnvelope(result);
  assert.deepEqual(result.commandEnvelope, {
    envelopeType: "appointment_review_controlled_action_command_v1",
    schemaVersion: 1,
    reviewId: "review_command_demo",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: "secretary_command",
      actorRole: "secretary",
      requiredPermission: "appointment_review:approve",
      contextType: "verified_actor_context_v1",
      verificationSource: "server_auth_boundary",
    },
    requestId: "request_command_demo",
    idempotencyKey: "review_command_demo:request_command_demo:approve",
    expectedReviewVersion: 5,
    observedReviewVersion: 5,
    requestFingerprint:
      "reviewId:review_command_demo|actionIntent:approve_intent|actorId:secretary_command|requestId:request_command_demo|requiredPermission:appointment_review:approve|expectedReviewVersion:5",
  });
});

test("appointment review controlled action command envelope constructs reject envelope", () => {
  const result = build({
    authorizationResult: {
      actionIntent: "reject_intent",
      requiredPermission: "appointment_review:reject",
    },
    guardResult: {
      actionIntent: "reject_intent",
      requiredPermission: "appointment_review:reject",
      idempotencyKey: "review_command_demo:request_command_demo:reject",
      requestFingerprint:
        "reviewId:review_command_demo|actionIntent:reject_intent|actorId:secretary_command|requestId:request_command_demo|requiredPermission:appointment_review:reject|expectedReviewVersion:5",
    },
  });

  assertAcceptedEnvelope(result);
  assert.equal(result.commandEnvelope.actionIntent, "reject_intent");
  assert.equal(
    result.commandEnvelope.actor.requiredPermission,
    "appointment_review:reject"
  );
});

test("appointment review controlled action command envelope uses required envelope type", () => {
  const result = build();

  assert.equal(
    result.commandEnvelope.envelopeType,
    "appointment_review_controlled_action_command_v1"
  );
  assert.equal(COMMAND_ENVELOPE_TYPE, result.commandEnvelope.envelopeType);
});

test("appointment review controlled action command envelope uses schema version one", () => {
  const result = build();

  assert.equal(result.commandEnvelope.schemaVersion, 1);
  assert.equal(COMMAND_ENVELOPE_SCHEMA_VERSION, 1);
});

test("appointment review controlled action command envelope contains only expected metadata keys", () => {
  const result = build();

  assert.deepEqual(Object.keys(result.commandEnvelope), EXPECTED_ENVELOPE_KEYS);
  assert.deepEqual(Object.keys(result.commandEnvelope.actor), EXPECTED_ACTOR_KEYS);
});

test("appointment review controlled action command envelope contains nested actor metadata", () => {
  const result = build();

  assert.deepEqual(result.commandEnvelope.actor, {
    actorId: "secretary_command",
    actorRole: "secretary",
    requiredPermission: "appointment_review:approve",
    contextType: "verified_actor_context_v1",
    verificationSource: "server_auth_boundary",
  });
});

test("appointment review controlled action command envelope omits patient secret appointment and calendar data", () => {
  const result = build({
    authorizationResult: {
      patientMessage: "sensitive patient text",
      secret: "not_allowed",
    },
    guardResult: {
      appointmentData: { id: "appointment_forbidden" },
      calendarEventData: { id: "calendar_forbidden" },
    },
  });
  const envelopeText = JSON.stringify(result.commandEnvelope);

  assert.doesNotMatch(envelopeText, /patient/i);
  assert.doesNotMatch(envelopeText, /"secret":/i);
  assert.doesNotMatch(envelopeText, /not_allowed/i);
  assert.doesNotMatch(envelopeText, /appointmentData/i);
  assert.doesNotMatch(envelopeText, /calendarEventData/i);
  assert.doesNotMatch(envelopeText, /credential/i);
});

test("appointment review controlled action command envelope rejects missing input", () => {
  for (const input of [null, undefined, "", [], 0]) {
    const result = buildAppointmentReviewControlledActionCommandEnvelope(input);

    assert.equal(result.accepted, false);
    assert.equal(result.code, "invalid_input");
    assert.equal(result.commandEnvelope, null);
    assertSafetyFields(result);
  }
});

test("appointment review controlled action command envelope rejects missing authorization result", () => {
  const result = buildAppointmentReviewControlledActionCommandEnvelope({
    guardResult: createGuardResult(),
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "invalid_authorization_result");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects rejected authorization result", () => {
  const result = build({
    authorizationResult: {
      accepted: false,
      controlledHandlingAuthorized: false,
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "authorization_not_accepted");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects malformed authorization result", () => {
  const malformedAuthorizationResults = [
    "",
    [],
    createAuthorizationResult({ actorContextAccepted: false }),
    createAuthorizationResult({ controlledHandlingAuthorized: false }),
    createAuthorizationResult({ permissionMatched: false }),
    createAuthorizationResult({ authorizationChecked: false }),
    createAuthorizationResult({ controlledHandlingOnly: false }),
    createAuthorizationResult({ reviewId: "" }),
    createAuthorizationResult({ currentState: "" }),
    createAuthorizationResult({ actorId: "" }),
    createAuthorizationResult({ actorRole: "doctor" }),
    createAuthorizationResult({ requestId: "" }),
    createAuthorizationResult({ contextType: "client_claim" }),
    createAuthorizationResult({ verificationSource: "client_body" }),
  ];

  for (const authorizationResult of malformedAuthorizationResults) {
    const result = buildAppointmentReviewControlledActionCommandEnvelope({
      authorizationResult,
      guardResult: createGuardResult(),
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "invalid_authorization_result");
    assertSafetyFields(result);
  }
});

test("appointment review controlled action command envelope rejects unsafe authorization result", () => {
  for (const fieldName of UNSAFE_EXECUTION_FIELDS) {
    const result = build({
      authorizationResult: {
        [fieldName]: true,
      },
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "unsafe_execution_flags");
    assert.match(result.reason, new RegExp(fieldName));
    assertSafetyFields(result);
  }
});

test("appointment review controlled action command envelope rejects missing guard result", () => {
  const result = buildAppointmentReviewControlledActionCommandEnvelope({
    authorizationResult: createAuthorizationResult(),
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "invalid_guard_result");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects rejected guard result", () => {
  const result = build({
    guardResult: {
      accepted: false,
      guardPassed: false,
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "guard_not_passed");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects malformed guard result", () => {
  const malformedGuardResults = [
    "",
    [],
    createGuardResult({ guardPassed: false }),
    createGuardResult({ guardChecked: false }),
    createGuardResult({ idempotencyChecked: false }),
    createGuardResult({ reviewVersionChecked: false }),
    createGuardResult({ controlledHandlingOnly: false }),
    createGuardResult({ reviewId: "" }),
    createGuardResult({ actionIntent: "" }),
    createGuardResult({ actorId: "" }),
    createGuardResult({ actorRole: "" }),
    createGuardResult({ requestId: "" }),
    createGuardResult({ requiredPermission: "" }),
    createGuardResult({ idempotencyKey: "" }),
    createGuardResult({ requestFingerprint: "" }),
    createGuardResult({ expectedReviewVersion: 0 }),
    createGuardResult({ observedReviewVersion: 0 }),
    createGuardResult({ persistence: "persisted" }),
  ];

  for (const guardResult of malformedGuardResults) {
    const result = buildAppointmentReviewControlledActionCommandEnvelope({
      authorizationResult: createAuthorizationResult(),
      guardResult,
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "invalid_guard_result");
    assertSafetyFields(result);
  }
});

test("appointment review controlled action command envelope rejects unsafe guard result", () => {
  for (const fieldName of UNSAFE_EXECUTION_FIELDS) {
    const result = build({
      guardResult: {
        [fieldName]: true,
      },
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "unsafe_execution_flags");
    assert.match(result.reason, new RegExp(fieldName));
    assertSafetyFields(result);
  }
});

test("appointment review controlled action command envelope rejects matching replay guard result", () => {
  const result = build({
    guardResult: {
      duplicateRequest: true,
      replayExistingResultOnly: true,
      eligibleForNewControlledHandling: false,
      idempotencyStatus: "matching_replay",
      code: "matching_idempotent_replay",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "replay_not_eligible_for_new_command");
  assert.equal(result.commandEnvelope, null);
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects duplicate request guard result", () => {
  const result = build({
    guardResult: {
      duplicateRequest: true,
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "replay_not_eligible_for_new_command");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects idempotency conflict guard result", () => {
  const result = build({
    guardResult: {
      accepted: false,
      guardPassed: false,
      idempotencyStatus: "conflict",
      code: "idempotency_key_conflict",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "idempotency_conflict_not_eligible");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects review version mismatch guard result", () => {
  const result = build({
    guardResult: {
      accepted: false,
      guardPassed: false,
      reviewVersionMatched: false,
      code: "review_version_conflict",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "review_version_not_matched");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects ineligible guard result", () => {
  const result = build({
    guardResult: {
      eligibleForNewControlledHandling: false,
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "invalid_guard_result");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects review id mismatch", () => {
  const result = build({
    guardResult: {
      reviewId: "review_other",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "cross_contract_review_id_mismatch");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects action intent mismatch", () => {
  const result = build({
    guardResult: {
      actionIntent: "reject_intent",
      requiredPermission: "appointment_review:reject",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "cross_contract_action_intent_mismatch");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects actor id mismatch", () => {
  const result = build({
    guardResult: {
      actorId: "secretary_other",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "cross_contract_actor_id_mismatch");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects actor role mismatch", () => {
  const result = build({
    guardResult: {
      actorRole: "clinic_manager",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "cross_contract_actor_role_mismatch");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects request id mismatch", () => {
  const result = build({
    guardResult: {
      requestId: "request_other",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "cross_contract_request_id_mismatch");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects permission mismatch", () => {
  const result = build({
    guardResult: {
      requiredPermission: "appointment_review:reject",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "cross_contract_permission_mismatch");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects approve intent with reject permission", () => {
  const result = build({
    authorizationResult: {
      requiredPermission: "appointment_review:reject",
    },
    guardResult: {
      requiredPermission: "appointment_review:reject",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "required_permission_mismatch");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects reject intent with approve permission", () => {
  const result = build({
    authorizationResult: {
      actionIntent: "reject_intent",
    },
    guardResult: {
      actionIntent: "reject_intent",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "required_permission_mismatch");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope rejects unsupported action intent", () => {
  const result = build({
    authorizationResult: {
      actionIntent: "ready_for_controlled_approval",
      requiredPermission: "appointment_review:approve",
    },
    guardResult: {
      actionIntent: "ready_for_controlled_approval",
      requiredPermission: "appointment_review:approve",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "unsupported_action_intent");
  assertSafetyFields(result);
});

test("appointment review controlled action command envelope preserves successful safety fields", () => {
  const result = build();

  assertAcceptedEnvelope(result);
});

test("appointment review controlled action command envelope preserves rejected safety fields", () => {
  const rejectedResults = [
    buildAppointmentReviewControlledActionCommandEnvelope(null),
    build({ authorizationResult: { accepted: false } }),
    build({ guardResult: { duplicateRequest: true } }),
  ];

  for (const result of rejectedResults) {
    assert.equal(result.accepted, false);
    assert.equal(result.commandEnvelopeConstructed, false);
    assert.equal(result.commandEnvelope, null);
    assertSafetyFields(result);
    assertNoExecution(result);
  }
});

test("appointment review controlled action command envelope keeps dispatch unavailable", () => {
  const accepted = build();
  const rejected = buildAppointmentReviewControlledActionCommandEnvelope(null);

  assert.equal(accepted.commandDispatchAvailable, false);
  assert.equal(rejected.commandDispatchAvailable, false);
});

test("appointment review controlled action command envelope keeps command persistence false", () => {
  const accepted = build();
  const rejected = buildAppointmentReviewControlledActionCommandEnvelope(null);

  assert.equal(accepted.commandPersisted, false);
  assert.equal(rejected.commandPersisted, false);
});

test("appointment review controlled action command envelope freezes top-level envelope", () => {
  const result = build();

  assert.equal(Object.isFrozen(result.commandEnvelope), true);
});

test("appointment review controlled action command envelope freezes nested actor metadata", () => {
  const result = build();

  assert.equal(Object.isFrozen(result.commandEnvelope.actor), true);
});

test("appointment review controlled action command envelope resists caller mutation", () => {
  const result = build();

  result.commandEnvelope.reviewId = "mutated";
  result.commandEnvelope.actor.actorId = "mutated";

  assert.equal(result.commandEnvelope.reviewId, "review_command_demo");
  assert.equal(result.commandEnvelope.actor.actorId, "secretary_command");
});

test("appointment review controlled action command envelope does not mutate authorizationResult", () => {
  const authorizationResult = Object.freeze(createAuthorizationResult());
  const before = JSON.stringify(authorizationResult);

  buildAppointmentReviewControlledActionCommandEnvelope({
    authorizationResult,
    guardResult: createGuardResult(),
  });

  assert.equal(JSON.stringify(authorizationResult), before);
});

test("appointment review controlled action command envelope does not mutate guardResult", () => {
  const guardResult = Object.freeze(createGuardResult());
  const before = JSON.stringify(guardResult);

  buildAppointmentReviewControlledActionCommandEnvelope({
    authorizationResult: createAuthorizationResult(),
    guardResult,
  });

  assert.equal(JSON.stringify(guardResult), before);
});

test("appointment review controlled action command envelope returns deterministic repeated results", () => {
  const input = {
    authorizationResult: createAuthorizationResult(),
    guardResult: createGuardResult(),
  };
  const first = buildAppointmentReviewControlledActionCommandEnvelope(input);
  const second = buildAppointmentReviewControlledActionCommandEnvelope(input);

  assert.deepEqual(second, first);
});

test("appointment review controlled action command envelope returned objects cannot mutate internal constants", () => {
  const first = build();
  first.commandEnvelopeConstructed = false;
  first.commandEnvelope = null;

  const second = build();

  assert.equal(second.commandEnvelopeConstructed, true);
  assert.equal(second.commandEnvelope.envelopeType, COMMAND_ENVELOPE_TYPE);
});

test("appointment review controlled action command envelope has no side effects or forbidden production imports", () => {
  let sideEffectCalled = false;
  const result = buildAppointmentReviewControlledActionCommandEnvelope({
    authorizationResult: {
      ...createAuthorizationResult(),
      createAppointment() {
        sideEffectCalled = true;
      },
    },
    guardResult: {
      ...createGuardResult(),
      publishCommand() {
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

test("appointment review controlled action command envelope has no route or UI imports", () => {
  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /route\.js/i);
  assert.doesNotMatch(source, /components\//i);
  assert.doesNotMatch(source, /workspace/i);
});

test("appointment review controlled action command envelope leaves Sprint 12E guard behavior unchanged", () => {
  const authorizationResult = createAuthorizationResult();
  const result = validateAppointmentReviewControlledActionGuard({
    authorizationResult,
    idempotencyKey: "review_command_demo:request_command_demo:approve",
    expectedReviewVersion: 5,
    observedReviewVersion: 5,
    priorIdempotencyObservation: null,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_guard_passed");
  assert.equal(result.bookingCreated, false);
});

test("appointment review controlled action command envelope leaves Sprint 12D authorization behavior unchanged", () => {
  const result = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult: {
      accepted: true,
      eligibleForControlledHandling: true,
      controlledHandlingOnly: true,
      reviewId: "review_command_regression",
      actionIntent: "approve_intent",
      currentState: "validation_only_intent_checked",
      actorId: "secretary_command",
      actorRole: "secretary",
      requestId: "request_command_regression",
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
      actorId: "secretary_command",
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

test("appointment review controlled action command envelope leaves Sprint 12A preconditions behavior unchanged", () => {
  const result = validateAppointmentReviewActionPreconditions({
    reviewId: "review_command_preconditions",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: "secretary_command",
      role: "secretary",
    },
    requestId: "request_command_preconditions",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.eligibleForControlledHandling, true);
  assert.equal(result.actionPerformed, false);
});

test("appointment review controlled action command envelope leaves Sprint 11W state machine behavior unchanged", () => {
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
