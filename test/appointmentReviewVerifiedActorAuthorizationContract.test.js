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
  ACTION_INTENT_REQUIRED_PERMISSIONS,
  UNSAFE_EXECUTION_FIELDS,
  UNSAFE_PERMISSIONS,
  VERIFIED_ACTOR_CONTEXT_TYPE,
  VERIFIED_ACTOR_ROLE,
  VERIFIED_ACTOR_SOURCE,
  authorizeAppointmentReviewVerifiedActor,
  listAppointmentReviewActionAuthorizationPermissions,
} = require("../src/secretary/appointmentReviewVerifiedActorAuthorizationContract");

const CONTRACT_SOURCE_PATH =
  "src/secretary/appointmentReviewVerifiedActorAuthorizationContract.js";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
  authorizationChecked: true,
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

function createAcceptedPreconditions(overrides = {}) {
  return {
    accepted: true,
    eligibleForControlledHandling: true,
    controlledHandlingOnly: true,
    reviewId: "review_authorization_demo",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actorId: "secretary_authorized",
    actorRole: "secretary",
    requestId: "request_authorization_demo",
    code: "preconditions_satisfied",
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
    ...overrides,
  };
}

function createVerifiedActorContext(overrides = {}) {
  return {
    contextType: "verified_actor_context_v1",
    verificationSource: "server_auth_boundary",
    actorId: "secretary_authorized",
    role: "secretary",
    authenticationVerified: true,
    authorizationVerified: true,
    permissions: ["appointment_review:approve"],
    ...overrides,
  };
}

function authorize(overrides = {}, contextOverrides = {}) {
  return authorizeAppointmentReviewVerifiedActor({
    preconditionsResult: createAcceptedPreconditions(overrides),
    verifiedActorContext: createVerifiedActorContext(contextOverrides),
  });
}

function assertSafetyFields(result) {
  for (const [field, value] of Object.entries(EXPECTED_SAFETY_FIELDS)) {
    assert.equal(result[field], value);
  }
}

test("appointment review verified actor authorization exposes immutable constants", () => {
  assert.equal(VERIFIED_ACTOR_CONTEXT_TYPE, "verified_actor_context_v1");
  assert.equal(VERIFIED_ACTOR_SOURCE, "server_auth_boundary");
  assert.equal(VERIFIED_ACTOR_ROLE, "secretary");
  assert.deepEqual(ACTION_INTENT_REQUIRED_PERMISSIONS, {
    approve_intent: "appointment_review:approve",
    reject_intent: "appointment_review:reject",
  });
  assert.deepEqual(listAppointmentReviewActionAuthorizationPermissions(), [
    "appointment_review:approve",
    "appointment_review:reject",
  ]);
  assert.equal(Object.isFrozen(ACTION_INTENT_REQUIRED_PERMISSIONS), true);
  assert.equal(Object.isFrozen(UNSAFE_EXECUTION_FIELDS), true);
  assert.equal(Object.isFrozen(UNSAFE_PERMISSIONS), true);
});

test("appointment review verified actor authorization accepts approve intent with matching permission", () => {
  const result = authorize();

  assert.equal(result.accepted, true);
  assert.equal(result.actorContextAccepted, true);
  assert.equal(result.controlledHandlingAuthorized, true);
  assert.equal(result.permissionMatched, true);
  assert.equal(result.reviewId, "review_authorization_demo");
  assert.equal(result.actionIntent, "approve_intent");
  assert.equal(result.currentState, "validation_only_intent_checked");
  assert.equal(result.actorId, "secretary_authorized");
  assert.equal(result.actorRole, "secretary");
  assert.equal(result.requestId, "request_authorization_demo");
  assert.equal(result.requiredPermission, "appointment_review:approve");
  assert.equal(result.contextType, "verified_actor_context_v1");
  assert.equal(result.verificationSource, "server_auth_boundary");
  assert.equal(result.code, "controlled_handling_authorized");
  assertSafetyFields(result);
});

test("appointment review verified actor authorization accepts reject intent with matching permission", () => {
  const result = authorize(
    {
      actionIntent: "reject_intent",
    },
    {
      permissions: ["appointment_review:reject"],
    }
  );

  assert.equal(result.accepted, true);
  assert.equal(result.controlledHandlingAuthorized, true);
  assert.equal(result.permissionMatched, true);
  assert.equal(result.actionIntent, "reject_intent");
  assert.equal(result.requiredPermission, "appointment_review:reject");
  assertSafetyFields(result);
});

test("appointment review verified actor authorization does not let approve permission authorize reject intent", () => {
  const result = authorize({
    actionIntent: "reject_intent",
  });

  assert.equal(result.accepted, false);
  assert.equal(result.actorContextAccepted, true);
  assert.equal(result.controlledHandlingAuthorized, false);
  assert.equal(result.permissionMatched, false);
  assert.equal(result.requiredPermission, "appointment_review:reject");
  assert.equal(result.code, "required_permission_missing");
  assert.match(result.reason, /appointment_review:reject/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization does not let reject permission authorize approve intent", () => {
  const result = authorize(
    {},
    {
      permissions: ["appointment_review:reject"],
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.actorContextAccepted, true);
  assert.equal(result.controlledHandlingAuthorized, false);
  assert.equal(result.permissionMatched, false);
  assert.equal(result.requiredPermission, "appointment_review:approve");
  assert.equal(result.code, "required_permission_missing");
  assert.match(result.reason, /appointment_review:approve/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization rejects missing input", () => {
  for (const input of [null, undefined, "", [], 0]) {
    const result = authorizeAppointmentReviewVerifiedActor(input);

    assert.equal(result.accepted, false);
    assert.equal(result.actorContextAccepted, false);
    assert.equal(result.code, "invalid_input");
    assert.match(result.reason, /object/);
    assertSafetyFields(result);
  }
});

test("appointment review verified actor authorization rejects rejected preconditions result", () => {
  const result = authorize({
    accepted: false,
    eligibleForControlledHandling: false,
    code: "unsupported_action_intent",
    reason: "Rejected by preconditions.",
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "preconditions_not_accepted");
  assert.match(result.reason, /accepted/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization rejects malformed preconditions result", () => {
  const malformedResults = [
    null,
    undefined,
    "",
    [],
    createAcceptedPreconditions({ reviewId: "" }),
    createAcceptedPreconditions({ actionIntent: "" }),
    createAcceptedPreconditions({ currentState: "" }),
    createAcceptedPreconditions({ actorId: "" }),
    createAcceptedPreconditions({ actorRole: "" }),
    createAcceptedPreconditions({ requestId: "" }),
  ];

  for (const preconditionsResult of malformedResults) {
    const result = authorizeAppointmentReviewVerifiedActor({
      preconditionsResult,
      verifiedActorContext: createVerifiedActorContext(),
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "invalid_preconditions_result");
    assertSafetyFields(result);
  }
});

test("appointment review verified actor authorization rejects unsafe preconditions result true fields", () => {
  for (const fieldName of UNSAFE_EXECUTION_FIELDS) {
    const result = authorize({
      [fieldName]: true,
    });

    assert.equal(result.accepted, false);
    assert.equal(result.code, "unsafe_execution_flags");
    assert.match(result.reason, new RegExp(fieldName));
    assertSafetyFields(result);
  }
});

test("appointment review verified actor authorization rejects unsafe actor context true fields", () => {
  for (const fieldName of UNSAFE_EXECUTION_FIELDS) {
    const result = authorize(
      {},
      {
        [fieldName]: true,
      }
    );

    assert.equal(result.accepted, false);
    assert.equal(result.actorContextAccepted, false);
    assert.equal(result.code, "unsafe_execution_flags");
    assert.match(result.reason, new RegExp(fieldName));
    assertSafetyFields(result);
  }
});

test("appointment review verified actor authorization rejects missing actor context", () => {
  for (const verifiedActorContext of [null, undefined, "", []]) {
    const result = authorizeAppointmentReviewVerifiedActor({
      preconditionsResult: createAcceptedPreconditions(),
      verifiedActorContext,
    });

    assert.equal(result.accepted, false);
    assert.equal(result.actorContextAccepted, false);
    assert.equal(result.code, "missing_verified_actor_context");
    assert.match(result.reason, /verifiedActorContext/);
    assertSafetyFields(result);
  }
});

test("appointment review verified actor authorization rejects wrong context type", () => {
  const result = authorize(
    {},
    {
      contextType: "client_claim",
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.actorContextAccepted, false);
  assert.equal(result.code, "invalid_actor_context_type");
  assert.match(result.reason, /contextType/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization rejects wrong verification source", () => {
  const result = authorize(
    {},
    {
      verificationSource: "client_body",
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.actorContextAccepted, false);
  assert.equal(result.code, "unsupported_verification_source");
  assert.match(result.reason, /verificationSource/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization rejects unverified authentication", () => {
  const result = authorize(
    {},
    {
      authenticationVerified: false,
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.actorContextAccepted, false);
  assert.equal(result.code, "authentication_not_verified");
  assert.match(result.reason, /authenticationVerified/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization rejects unverified authorization", () => {
  const result = authorize(
    {},
    {
      authorizationVerified: false,
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.actorContextAccepted, false);
  assert.equal(result.code, "authorization_not_verified");
  assert.match(result.reason, /authorizationVerified/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization rejects missing actor id", () => {
  const result = authorize(
    {},
    {
      actorId: "   ",
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.actorContextAccepted, false);
  assert.equal(result.code, "missing_actor_id");
  assert.match(result.reason, /actorId/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization rejects unsupported actor role", () => {
  const result = authorize(
    {},
    {
      role: "doctor",
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.actorContextAccepted, false);
  assert.equal(result.code, "unsupported_actor_role");
  assert.match(result.reason, /role/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization rejects actor id mismatch", () => {
  const result = authorize(
    {},
    {
      actorId: "secretary_other",
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.actorContextAccepted, true);
  assert.equal(result.code, "actor_id_mismatch");
  assert.match(result.reason, /actorId/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization rejects actor role mismatch", () => {
  const result = authorize(
    {
      actorRole: "clinic_manager",
    },
    {
      role: "secretary",
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.actorContextAccepted, true);
  assert.equal(result.code, "actor_role_mismatch");
  assert.match(result.reason, /role/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization rejects missing permissions", () => {
  for (const permissions of [undefined, null, "appointment_review:approve"]) {
    const result = authorize(
      {},
      {
        permissions,
      }
    );

    assert.equal(result.accepted, false);
    assert.equal(result.actorContextAccepted, false);
    assert.equal(result.code, "missing_permissions");
    assert.match(result.reason, /permissions/);
    assertSafetyFields(result);
  }
});

test("appointment review verified actor authorization rejects empty permissions", () => {
  const result = authorize(
    {},
    {
      permissions: ["", "   "],
    }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.actorContextAccepted, false);
  assert.equal(result.code, "missing_permissions");
  assert.match(result.reason, /permissions/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization rejects wildcard and overbroad permissions", () => {
  for (const permission of UNSAFE_PERMISSIONS) {
    const result = authorize(
      {},
      {
        permissions: [permission, "appointment_review:approve"],
      }
    );

    assert.equal(result.accepted, false);
    assert.equal(result.actorContextAccepted, false);
    assert.equal(result.controlledHandlingAuthorized, false);
    assert.equal(result.permissionMatched, false);
    assert.equal(result.code, "required_permission_missing");
    assert.match(result.reason, new RegExp(permission.replace("*", "\\*")));
    assertSafetyFields(result);
  }
});

test("appointment review verified actor authorization rejects unsupported action intent", () => {
  const result = authorize({
    actionIntent: "needs_clinic_review",
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "unsupported_action_intent");
  assert.match(result.reason, /Unsupported actionIntent/);
  assertSafetyFields(result);
});

test("appointment review verified actor authorization rejects unsafe preconditions metadata", () => {
  const unsafeCases = [
    { eligibleForControlledHandling: false },
    { controlledHandlingOnly: false },
    { preconditionsChecked: false },
    { validationOnly: false },
    { persistence: "persisted" },
  ];

  for (const override of unsafeCases) {
    const result = authorize(override);

    assert.equal(result.accepted, false);
    assert.equal(result.code, "unsafe_preconditions_result");
    assertSafetyFields(result);
  }
});

test("appointment review verified actor authorization preserves safety fields on accepted and rejected results", () => {
  const accepted = authorize();
  const rejected = authorize(
    {},
    {
      permissions: ["appointment_review:reject"],
    }
  );

  assert.equal(accepted.accepted, true);
  assert.equal(rejected.accepted, false);
  assertSafetyFields(accepted);
  assertSafetyFields(rejected);
});

test("appointment review verified actor authorization does not mutate inputs", () => {
  const preconditionsResult = Object.freeze({
    ...createAcceptedPreconditions(),
  });
  const verifiedActorContext = Object.freeze({
    ...createVerifiedActorContext(),
    permissions: Object.freeze(["appointment_review:approve"]),
  });
  const beforePreconditions = JSON.stringify(preconditionsResult);
  const beforeContext = JSON.stringify(verifiedActorContext);

  authorizeAppointmentReviewVerifiedActor({
    preconditionsResult,
    verifiedActorContext,
  });

  assert.equal(JSON.stringify(preconditionsResult), beforePreconditions);
  assert.equal(JSON.stringify(verifiedActorContext), beforeContext);
});

test("appointment review verified actor authorization returns deterministic repeated results", () => {
  const input = {
    preconditionsResult: createAcceptedPreconditions(),
    verifiedActorContext: createVerifiedActorContext(),
  };
  const first = authorizeAppointmentReviewVerifiedActor(input);
  const second = authorizeAppointmentReviewVerifiedActor(input);

  assert.deepEqual(second, first);
});

test("appointment review verified actor authorization returned objects cannot mutate internal constants", () => {
  const firstPermissions = listAppointmentReviewActionAuthorizationPermissions();
  const firstResult = authorize();

  firstPermissions.push("*");
  firstResult.executionAvailable = true;
  firstResult.requiredPermission = "admin";

  const secondPermissions = listAppointmentReviewActionAuthorizationPermissions();
  const secondResult = authorize();

  assert.deepEqual(secondPermissions, [
    "appointment_review:approve",
    "appointment_review:reject",
  ]);
  assert.equal(secondResult.executionAvailable, false);
  assert.equal(secondResult.requiredPermission, "appointment_review:approve");
});

test("appointment review verified actor authorization has no side effects or forbidden imports", () => {
  let sideEffectCalled = false;
  const result = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult: {
      ...createAcceptedPreconditions(),
      createAppointment() {
        sideEffectCalled = true;
      },
    },
    verifiedActorContext: {
      ...createVerifiedActorContext(),
      callProvider() {
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
    "route" + ".js",
    "components/",
  ];

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
});

test("appointment review verified actor authorization leaves Sprint 12A preconditions behavior unchanged", () => {
  const result = validateAppointmentReviewActionPreconditions({
    reviewId: "review_contract_unchanged",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: "secretary_authorized",
      role: "secretary",
    },
    requestId: "request_contract_unchanged",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.eligibleForControlledHandling, true);
  assert.equal(result.validationOnly, true);
  assert.equal(result.actionPerformed, false);
});

test("appointment review verified actor authorization leaves Sprint 11W state machine behavior unchanged", () => {
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
