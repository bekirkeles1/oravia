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
  IDEMPOTENCY_KEY_MAX_LENGTH,
  UNSAFE_EXECUTION_FIELDS,
  buildReviewGuardRequestFingerprint,
  validateAppointmentReviewControlledActionGuard,
} = require("../src/secretary/appointmentReviewControlledActionGuardContract");

const CONTRACT_SOURCE_PATH =
  "src/secretary/appointmentReviewControlledActionGuardContract.js";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
  validationOnly: true,
  guardChecked: true,
  idempotencyChecked: true,
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

function createAuthorizationResult(overrides = {}) {
  return {
    accepted: true,
    actorContextAccepted: true,
    controlledHandlingAuthorized: true,
    permissionMatched: true,
    authorizationChecked: true,
    validationOnly: true,
    controlledHandlingOnly: true,
    reviewId: "review_guard_demo",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actorId: "secretary_guard",
    actorRole: "secretary",
    requestId: "request_guard_demo",
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

function createGuardInput(overrides = {}) {
  return {
    authorizationResult: createAuthorizationResult(),
    idempotencyKey: "review_guard_demo:request_guard_demo:approve",
    expectedReviewVersion: 3,
    observedReviewVersion: 3,
    priorIdempotencyObservation: null,
    ...overrides,
  };
}

function validate(overrides = {}) {
  return validateAppointmentReviewControlledActionGuard(createGuardInput(overrides));
}

function createFingerprint(overrides = {}) {
  return buildReviewGuardRequestFingerprint({
    authorizationResult: createAuthorizationResult(overrides.authorizationResult),
    expectedReviewVersion: overrides.expectedReviewVersion || 3,
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
  assert.notEqual(result.reviewFound, true);
  assert.notEqual(result.persisted, true);
  assert.notEqual(result.idempotencyRecordCreated, true);
  assert.notEqual(result.previousActionExecuted, true);
  assert.notEqual(result.appointmentApproved, true);
  assert.notEqual(result.appointmentRejected, true);
}

test("appointment review controlled action guard accepts a new approve request when versions match", () => {
  const result = validate();

  assert.equal(result.accepted, true);
  assert.equal(result.guardPassed, true);
  assert.equal(result.duplicateRequest, false);
  assert.equal(result.replayExistingResultOnly, false);
  assert.equal(result.eligibleForNewControlledHandling, true);
  assert.equal(result.idempotencyStatus, "new_request");
  assert.equal(result.reviewVersionMatched, true);
  assert.equal(result.reviewVersionChecked, true);
  assert.equal(result.code, "controlled_action_guard_passed");
  assert.equal(result.reviewId, "review_guard_demo");
  assert.equal(result.actionIntent, "approve_intent");
  assert.equal(result.actorId, "secretary_guard");
  assert.equal(result.requestId, "request_guard_demo");
  assert.equal(result.requiredPermission, "appointment_review:approve");
  assert.equal(result.idempotencyKey, "review_guard_demo:request_guard_demo:approve");
  assert.equal(result.expectedReviewVersion, 3);
  assert.equal(result.observedReviewVersion, 3);
  assert.match(result.requestFingerprint, /reviewId:review_guard_demo/);
  assertSafetyFields(result);
  assertNoExecution(result);
});

test("appointment review controlled action guard accepts a new reject request when versions match", () => {
  const result = validate({
    authorizationResult: createAuthorizationResult({
      actionIntent: "reject_intent",
      requiredPermission: "appointment_review:reject",
    }),
    idempotencyKey: "review_guard_demo:request_guard_demo:reject",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.actionIntent, "reject_intent");
  assert.equal(result.requiredPermission, "appointment_review:reject");
  assert.equal(result.idempotencyStatus, "new_request");
  assert.equal(result.eligibleForNewControlledHandling, true);
  assertSafetyFields(result);
});

test("appointment review controlled action guard rejects missing input", () => {
  for (const input of [null, undefined, "", [], 0]) {
    const result = validateAppointmentReviewControlledActionGuard(input);

    assert.equal(result.accepted, false);
    assert.equal(result.code, "invalid_input");
    assert.match(result.reason, /object/);
    assertSafetyFields(result);
  }
});

test("appointment review controlled action guard rejects missing authorization result", () => {
  const result = validate({ authorizationResult: null });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "invalid_authorization_result");
  assert.match(result.reason, /authorizationResult/);
  assertSafetyFields(result);
});

test("appointment review controlled action guard rejects rejected authorization result", () => {
  const result = validate({
    authorizationResult: createAuthorizationResult({
      accepted: false,
      controlledHandlingAuthorized: false,
    }),
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "authorization_not_accepted");
  assert.match(result.reason, /accepted/);
  assertSafetyFields(result);
});

test("appointment review controlled action guard rejects malformed authorization result", () => {
  const malformedResults = [
    "",
    [],
    createAuthorizationResult({ actorContextAccepted: false }),
    createAuthorizationResult({ controlledHandlingAuthorized: false }),
    createAuthorizationResult({ permissionMatched: false }),
    createAuthorizationResult({ authorizationChecked: false }),
    createAuthorizationResult({ controlledHandlingOnly: false }),
    createAuthorizationResult({ reviewId: "" }),
    createAuthorizationResult({ actionIntent: "needs_clinic_review" }),
    createAuthorizationResult({ actorId: "" }),
    createAuthorizationResult({ actorRole: "doctor" }),
    createAuthorizationResult({ requestId: "" }),
    createAuthorizationResult({ requiredPermission: "appointment_review:reject" }),
    createAuthorizationResult({ contextType: "client_claim" }),
    createAuthorizationResult({ verificationSource: "client_body" }),
  ];

  for (const authorizationResult of malformedResults) {
    const result = validate({ authorizationResult });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "invalid_authorization_result");
    assertSafetyFields(result);
  }
});

test("appointment review controlled action guard rejects unsafe authorization true fields", () => {
  for (const fieldName of UNSAFE_EXECUTION_FIELDS) {
    const result = validate({
      authorizationResult: createAuthorizationResult({
        [fieldName]: true,
      }),
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "unsafe_execution_flags");
    assert.match(result.reason, new RegExp(fieldName));
    assertSafetyFields(result);
  }
});

test("appointment review controlled action guard rejects unsafe top-level true fields", () => {
  const result = validate({
    actionPerformed: true,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "unsafe_execution_flags");
  assert.match(result.reason, /actionPerformed/);
  assertSafetyFields(result);
});

test("appointment review controlled action guard rejects missing idempotency key", () => {
  for (const idempotencyKey of [null, undefined]) {
    const result = validate({ idempotencyKey });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "missing_idempotency_key");
    assert.match(result.reason, /idempotencyKey/);
    assertSafetyFields(result);
  }
});

test("appointment review controlled action guard rejects blank idempotency key", () => {
  for (const idempotencyKey of ["", "   "]) {
    const result = validate({ idempotencyKey });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "missing_idempotency_key");
    assertSafetyFields(result);
  }
});

test("appointment review controlled action guard rejects invalid idempotency key characters", () => {
  const invalidKeys = [
    "review/key",
    "../review",
    "https://example.test/key",
    "review?key=1",
    "review#fragment",
    "review key",
    "review\nkey",
  ];

  for (const idempotencyKey of invalidKeys) {
    const result = validate({ idempotencyKey });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "invalid_idempotency_key");
    assertSafetyFields(result);
  }
});

test("appointment review controlled action guard rejects overly long idempotency key", () => {
  const result = validate({
    idempotencyKey: "a".repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1),
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "invalid_idempotency_key");
  assert.match(result.reason, new RegExp(String(IDEMPOTENCY_KEY_MAX_LENGTH)));
  assertSafetyFields(result);
});

test("appointment review controlled action guard rejects invalid expectedReviewVersion", () => {
  for (const expectedReviewVersion of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"]) {
    const result = validate({ expectedReviewVersion });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "invalid_expected_review_version");
    assertSafetyFields(result);
  }
});

test("appointment review controlled action guard rejects invalid observedReviewVersion", () => {
  for (const observedReviewVersion of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"]) {
    const result = validate({ observedReviewVersion });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "invalid_observed_review_version");
    assertSafetyFields(result);
  }
});

test("appointment review controlled action guard rejects new request with version mismatch", () => {
  const result = validate({
    expectedReviewVersion: 3,
    observedReviewVersion: 4,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.guardPassed, false);
  assert.equal(result.idempotencyStatus, "new_request");
  assert.equal(result.reviewVersionMatched, false);
  assert.equal(result.reviewVersionChecked, true);
  assert.equal(result.code, "review_version_conflict");
  assert.match(result.reason, /expectedReviewVersion/);
  assertSafetyFields(result);
  assertNoExecution(result);
});

test("appointment review controlled action guard returns matching replay for matching prior key and fingerprint", () => {
  const input = createGuardInput();
  const requestFingerprint = buildReviewGuardRequestFingerprint({
    authorizationResult: input.authorizationResult,
    expectedReviewVersion: input.expectedReviewVersion,
  });
  const result = validateAppointmentReviewControlledActionGuard({
    ...input,
    priorIdempotencyObservation: {
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.guardPassed, true);
  assert.equal(result.duplicateRequest, true);
  assert.equal(result.idempotencyStatus, "matching_replay");
  assert.equal(result.code, "matching_idempotent_replay");
  assert.equal(result.requestFingerprint, requestFingerprint);
  assertSafetyFields(result);
});

test("appointment review controlled action guard matching replay sets replayExistingResultOnly true", () => {
  const requestFingerprint = createFingerprint();
  const result = validate({
    priorIdempotencyObservation: {
      idempotencyKey: "review_guard_demo:request_guard_demo:approve",
      requestFingerprint,
    },
  });

  assert.equal(result.replayExistingResultOnly, true);
  assert.equal(result.duplicateRequest, true);
  assertSafetyFields(result);
});

test("appointment review controlled action guard matching replay disables new controlled handling", () => {
  const requestFingerprint = createFingerprint();
  const result = validate({
    priorIdempotencyObservation: {
      idempotencyKey: "review_guard_demo:request_guard_demo:approve",
      requestFingerprint,
    },
  });

  assert.equal(result.eligibleForNewControlledHandling, false);
  assert.equal(result.guardPassed, true);
  assertSafetyFields(result);
});

test("appointment review controlled action guard matching replay never enables execution", () => {
  const requestFingerprint = createFingerprint();
  const result = validate({
    observedReviewVersion: 4,
    priorIdempotencyObservation: {
      idempotencyKey: "review_guard_demo:request_guard_demo:approve",
      requestFingerprint,
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "matching_idempotent_replay");
  assert.equal(result.replayExistingResultOnly, true);
  assert.equal(result.eligibleForNewControlledHandling, false);
  assert.equal(result.reviewVersionMatched, false);
  assertNoExecution(result);
});

test("appointment review controlled action guard rejects same key with different fingerprint", () => {
  const result = validate({
    priorIdempotencyObservation: {
      idempotencyKey: "review_guard_demo:request_guard_demo:approve",
      requestFingerprint: "reviewId:different",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.guardPassed, false);
  assert.equal(result.duplicateRequest, false);
  assert.equal(result.idempotencyStatus, "conflict");
  assert.equal(result.code, "idempotency_key_conflict");
  assertSafetyFields(result);
});

test("appointment review controlled action guard treats different prior key as new request", () => {
  const result = validate({
    priorIdempotencyObservation: {
      idempotencyKey: "different:key",
      requestFingerprint: "reviewId:other",
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.idempotencyStatus, "new_request");
  assert.equal(result.duplicateRequest, false);
  assert.equal(result.eligibleForNewControlledHandling, true);
  assertSafetyFields(result);
});

test("appointment review controlled action guard rejects malformed prior observation", () => {
  const malformedPriorObservations = [
    "",
    [],
    {},
    { idempotencyKey: "", requestFingerprint: "fingerprint" },
    { idempotencyKey: "valid:key", requestFingerprint: "" },
    { idempotencyKey: "invalid/key", requestFingerprint: "fingerprint" },
  ];

  for (const priorIdempotencyObservation of malformedPriorObservations) {
    const result = validate({ priorIdempotencyObservation });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "invalid_prior_idempotency_observation");
    assertSafetyFields(result);
  }
});

test("appointment review controlled action guard rejects unsafe prior observation true fields", () => {
  const result = validate({
    priorIdempotencyObservation: {
      idempotencyKey: "different:key",
      requestFingerprint: "reviewId:other",
      previousActionExecuted: true,
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "unsafe_execution_flags");
  assert.match(result.reason, /previousActionExecuted/);
  assertSafetyFields(result);
});

test("appointment review controlled action guard request fingerprint is deterministic", () => {
  const first = createFingerprint();
  const second = createFingerprint();

  assert.equal(second, first);
  assert.equal(
    first,
    "reviewId:review_guard_demo|actionIntent:approve_intent|actorId:secretary_guard|requestId:request_guard_demo|requiredPermission:appointment_review:approve|expectedReviewVersion:3"
  );
});

test("appointment review controlled action guard fingerprint changes when reviewId changes", () => {
  assert.notEqual(
    createFingerprint(),
    createFingerprint({ authorizationResult: { reviewId: "review_other" } })
  );
});

test("appointment review controlled action guard fingerprint changes when actionIntent changes", () => {
  assert.notEqual(
    createFingerprint(),
    createFingerprint({
      authorizationResult: {
        actionIntent: "reject_intent",
        requiredPermission: "appointment_review:reject",
      },
    })
  );
});

test("appointment review controlled action guard fingerprint changes when actorId changes", () => {
  assert.notEqual(
    createFingerprint(),
    createFingerprint({ authorizationResult: { actorId: "secretary_other" } })
  );
});

test("appointment review controlled action guard fingerprint changes when requestId changes", () => {
  assert.notEqual(
    createFingerprint(),
    createFingerprint({ authorizationResult: { requestId: "request_other" } })
  );
});

test("appointment review controlled action guard fingerprint changes when requiredPermission changes", () => {
  assert.notEqual(
    createFingerprint(),
    createFingerprint({
      authorizationResult: { requiredPermission: "appointment_review:reject" },
    })
  );
});

test("appointment review controlled action guard fingerprint changes when expectedReviewVersion changes", () => {
  assert.notEqual(createFingerprint(), createFingerprint({ expectedReviewVersion: 4 }));
});

test("appointment review controlled action guard preserves safety fields on every accepted result shape", () => {
  const newRequest = validate();
  const matchingReplay = validate({
    priorIdempotencyObservation: {
      idempotencyKey: "review_guard_demo:request_guard_demo:approve",
      requestFingerprint: createFingerprint(),
    },
  });

  assert.equal(newRequest.accepted, true);
  assert.equal(matchingReplay.accepted, true);
  assertSafetyFields(newRequest);
  assertSafetyFields(matchingReplay);
});

test("appointment review controlled action guard preserves safety fields on every rejected result shape", () => {
  const rejectedResults = [
    validateAppointmentReviewControlledActionGuard(null),
    validate({ authorizationResult: createAuthorizationResult({ accepted: false }) }),
    validate({ idempotencyKey: "bad/key" }),
    validate({ expectedReviewVersion: 2, observedReviewVersion: 3 }),
  ];

  for (const result of rejectedResults) {
    assert.equal(result.accepted, false);
    assertSafetyFields(result);
    assertNoExecution(result);
  }
});

test("appointment review controlled action guard does not mutate authorization input", () => {
  const authorizationResult = Object.freeze(createAuthorizationResult());
  const before = JSON.stringify(authorizationResult);

  validate({ authorizationResult });

  assert.equal(JSON.stringify(authorizationResult), before);
});

test("appointment review controlled action guard does not mutate prior observation input", () => {
  const priorIdempotencyObservation = Object.freeze({
    idempotencyKey: "different:key",
    requestFingerprint: "reviewId:other",
  });
  const before = JSON.stringify(priorIdempotencyObservation);

  validate({ priorIdempotencyObservation });

  assert.equal(JSON.stringify(priorIdempotencyObservation), before);
});

test("appointment review controlled action guard does not mutate top-level input", () => {
  const input = Object.freeze({
    authorizationResult: Object.freeze(createAuthorizationResult()),
    idempotencyKey: "review_guard_demo:request_guard_demo:approve",
    expectedReviewVersion: 3,
    observedReviewVersion: 3,
    priorIdempotencyObservation: null,
  });
  const before = JSON.stringify(input);

  validateAppointmentReviewControlledActionGuard(input);

  assert.equal(JSON.stringify(input), before);
});

test("appointment review controlled action guard returns deterministic repeated results", () => {
  const input = createGuardInput();
  const first = validateAppointmentReviewControlledActionGuard(input);
  const second = validateAppointmentReviewControlledActionGuard(input);

  assert.deepEqual(second, first);
});

test("appointment review controlled action guard returned objects cannot mutate internal constants", () => {
  const first = validate();
  first.executionAvailable = true;
  first.idempotencyStatus = "persisted";

  const second = validate();

  assert.equal(second.executionAvailable, false);
  assert.equal(second.idempotencyStatus, "new_request");
});

test("appointment review controlled action guard has no side effects or forbidden production imports", () => {
  let sideEffectCalled = false;
  const result = validate({
    authorizationResult: {
      ...createAuthorizationResult(),
      createAppointment() {
        sideEffectCalled = true;
      },
    },
    priorIdempotencyObservation: {
      idempotencyKey: "different:key",
      requestFingerprint: "reviewId:other",
      persist() {
        sideEffectCalled = true;
      },
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(sideEffectCalled, false);
  assertSafetyFields(result);

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
    "process" + ".env",
    "Date" + ".now",
    "Math" + ".random",
    "random" + "UUID",
  ];

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
});

test("appointment review controlled action guard has no route or UI imports", () => {
  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /route\.js/i);
  assert.doesNotMatch(source, /components\//i);
  assert.doesNotMatch(source, /workspace/i);
});

test("appointment review controlled action guard leaves Sprint 12D authorization behavior unchanged", () => {
  const result = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult: {
      accepted: true,
      eligibleForControlledHandling: true,
      controlledHandlingOnly: true,
      reviewId: "review_guard_regression",
      actionIntent: "approve_intent",
      currentState: "validation_only_intent_checked",
      actorId: "secretary_guard",
      actorRole: "secretary",
      requestId: "request_guard_regression",
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
      actorId: "secretary_guard",
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

test("appointment review controlled action guard leaves Sprint 12A preconditions behavior unchanged", () => {
  const result = validateAppointmentReviewActionPreconditions({
    reviewId: "review_guard_preconditions",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: "secretary_guard",
      role: "secretary",
    },
    requestId: "request_guard_preconditions",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.eligibleForControlledHandling, true);
  assert.equal(result.actionPerformed, false);
});

test("appointment review controlled action guard leaves Sprint 11W state machine behavior unchanged", () => {
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
