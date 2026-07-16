const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  ALLOWED_ACTION_INTENTS,
  validateAppointmentReviewActionIntent,
} = require("../src/secretary/appointmentReviewActionIntentContract");
const {
  APPOINTMENT_REVIEW_ACTION_STATES,
  transitionAppointmentReviewActionIntentState,
} = require("../src/secretary/appointmentReviewActionIntentStateMachine");
const {
  REQUIRED_ACTOR_ROLE,
  REQUIRED_CURRENT_STATE,
  SUPPORTED_CONTROLLED_ACTION_INTENTS,
  UNSAFE_EXECUTION_FIELDS,
  listSupportedControlledActionIntents,
  validateAppointmentReviewActionPreconditions,
} = require("../src/secretary/appointmentReviewActionPreconditionsContract");

const CONTRACT_SOURCE_PATH =
  "src/secretary/appointmentReviewActionPreconditionsContract.js";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
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
});

function createValidInput(overrides = {}) {
  return {
    reviewId: "review_mock_whatsapp_905322223333_slot_1030",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: "secretary_demo",
      role: "secretary",
    },
    requestId: "request_demo_001",
    ...overrides,
  };
}

function assertSafetyFields(result) {
  for (const [field, value] of Object.entries(EXPECTED_SAFETY_FIELDS)) {
    assert.equal(result[field], value);
  }
}

test("appointment review action preconditions expose immutable supported values", () => {
  assert.equal(REQUIRED_CURRENT_STATE, "validation_only_intent_checked");
  assert.equal(REQUIRED_ACTOR_ROLE, "secretary");
  assert.deepEqual(listSupportedControlledActionIntents(), [
    "approve_intent",
    "reject_intent",
  ]);
  assert.equal(Object.isFrozen(SUPPORTED_CONTROLLED_ACTION_INTENTS), true);
  assert.equal(Object.isFrozen(UNSAFE_EXECUTION_FIELDS), true);
});

test("appointment review action preconditions accept approve intent for secretary actor", () => {
  const result = validateAppointmentReviewActionPreconditions(createValidInput());

  assert.equal(result.accepted, true);
  assert.equal(result.eligibleForControlledHandling, true);
  assert.equal(result.controlledHandlingOnly, true);
  assert.equal(result.reviewId, createValidInput().reviewId);
  assert.equal(result.actionIntent, "approve_intent");
  assert.equal(result.currentState, "validation_only_intent_checked");
  assert.equal(result.actorId, "secretary_demo");
  assert.equal(result.actorRole, "secretary");
  assert.equal(result.requestId, "request_demo_001");
  assert.equal(result.code, "preconditions_satisfied");
  assertSafetyFields(result);
});

test("appointment review action preconditions accept reject intent for secretary actor", () => {
  const result = validateAppointmentReviewActionPreconditions(
    createValidInput({
      actionIntent: "reject_intent",
      requestId: "request_reject_001",
    })
  );

  assert.equal(result.accepted, true);
  assert.equal(result.eligibleForControlledHandling, true);
  assert.equal(result.actionIntent, "reject_intent");
  assert.equal(result.requestId, "request_reject_001");
  assert.equal(result.code, "preconditions_satisfied");
  assertSafetyFields(result);
});

test("appointment review action preconditions reject missing or malformed input", () => {
  for (const input of [null, undefined, "", [], 0]) {
    const result = validateAppointmentReviewActionPreconditions(input);

    assert.equal(result.accepted, false);
    assert.equal(result.eligibleForControlledHandling, false);
    assert.equal(result.code, "invalid_input");
    assert.match(result.reason, /object/);
    assertSafetyFields(result);
  }
});

test("appointment review action preconditions reject missing review id", () => {
  for (const reviewId of ["", "   ", null]) {
    const result = validateAppointmentReviewActionPreconditions(
      createValidInput({ reviewId })
    );

    assert.equal(result.accepted, false);
    assert.equal(result.code, "missing_review_id");
    assert.match(result.reason, /reviewId/);
    assertSafetyFields(result);
  }
});

test("appointment review action preconditions reject missing or unsupported action intent", () => {
  for (const actionIntent of ["", "needs_clinic_review", "ask_patient_clarification", "approve"]) {
    const result = validateAppointmentReviewActionPreconditions(
      createValidInput({ actionIntent })
    );

    assert.equal(result.accepted, false);
    assert.equal(result.code, "unsupported_action_intent");
    assert.match(result.reason, /actionIntent/);
    assertSafetyFields(result);
  }
});

test("appointment review action preconditions reject wrong current state", () => {
  for (const currentState of ["", "pending_secretary_review", "needs_clinic_review"]) {
    const result = validateAppointmentReviewActionPreconditions(
      createValidInput({ currentState })
    );

    assert.equal(result.accepted, false);
    assert.equal(result.code, "unsupported_current_state");
    assert.match(result.reason, /currentState/);
    assertSafetyFields(result);
  }
});

test("appointment review action preconditions reject missing actor", () => {
  for (const actor of [null, undefined, "", []]) {
    const result = validateAppointmentReviewActionPreconditions(
      createValidInput({ actor })
    );

    assert.equal(result.accepted, false);
    assert.equal(result.code, "missing_actor");
    assert.match(result.reason, /actor/);
    assertSafetyFields(result);
  }
});

test("appointment review action preconditions reject missing actor id", () => {
  for (const actorId of ["", "   ", null]) {
    const result = validateAppointmentReviewActionPreconditions(
      createValidInput({
        actor: {
          actorId,
          role: "secretary",
        },
      })
    );

    assert.equal(result.accepted, false);
    assert.equal(result.code, "missing_actor_id");
    assert.match(result.reason, /actor\.actorId/);
    assertSafetyFields(result);
  }
});

test("appointment review action preconditions reject unsupported actor role", () => {
  for (const role of ["", "doctor", "admin", "patient"]) {
    const result = validateAppointmentReviewActionPreconditions(
      createValidInput({
        actor: {
          actorId: "actor_demo",
          role,
        },
      })
    );

    assert.equal(result.accepted, false);
    assert.equal(result.code, "unsupported_actor_role");
    assert.match(result.reason, /actor\.role/);
    assertSafetyFields(result);
  }
});

test("appointment review action preconditions reject missing request id", () => {
  for (const requestId of ["", "   ", null]) {
    const result = validateAppointmentReviewActionPreconditions(
      createValidInput({ requestId })
    );

    assert.equal(result.accepted, false);
    assert.equal(result.code, "missing_request_id");
    assert.match(result.reason, /requestId/);
    assertSafetyFields(result);
  }
});

test("appointment review action preconditions reject unsafe execution flags", () => {
  for (const fieldName of UNSAFE_EXECUTION_FIELDS) {
    const result = validateAppointmentReviewActionPreconditions(
      createValidInput({
        [fieldName]: true,
      })
    );

    assert.equal(result.accepted, false);
    assert.equal(result.eligibleForControlledHandling, false);
    assert.equal(result.code, "unsafe_execution_flags");
    assert.match(result.reason, new RegExp(fieldName));
    assertSafetyFields(result);
  }
});

test("appointment review action preconditions reject unsafe persistence indication", () => {
  const result = validateAppointmentReviewActionPreconditions(
    createValidInput({
      persistence: "persisted",
    })
  );

  assert.equal(result.accepted, false);
  assert.equal(result.code, "unsafe_execution_flags");
  assert.match(result.reason, /persistence/);
  assertSafetyFields(result);
});

test("appointment review action preconditions normalize known identifiers on rejection", () => {
  const result = validateAppointmentReviewActionPreconditions(
    createValidInput({
      reviewId: "  review_demo  ",
      actionIntent: "  approve_intent  ",
      currentState: "pending_secretary_review",
      actor: {
        actorId: "  secretary_1  ",
        role: "  secretary  ",
      },
      requestId: "  request_1  ",
    })
  );

  assert.equal(result.accepted, false);
  assert.equal(result.code, "unsupported_current_state");
  assert.equal(result.reviewId, "review_demo");
  assert.equal(result.actionIntent, "approve_intent");
  assert.equal(result.currentState, "pending_secretary_review");
  assert.equal(result.actorId, "secretary_1");
  assert.equal(result.actorRole, "secretary");
  assert.equal(result.requestId, "request_1");
  assertSafetyFields(result);
});

test("appointment review action preconditions do not mutate input", () => {
  const input = Object.freeze({
    reviewId: "review_immutable",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: Object.freeze({
      actorId: "secretary_immutable",
      role: "secretary",
    }),
    requestId: "request_immutable",
  });
  const before = JSON.stringify(input);

  validateAppointmentReviewActionPreconditions(input);

  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(input, {
    reviewId: "review_immutable",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: "secretary_immutable",
      role: "secretary",
    },
    requestId: "request_immutable",
  });
});

test("appointment review action preconditions return deterministic repeated results", () => {
  const input = createValidInput({
    reviewId: "review_deterministic",
    requestId: "request_deterministic",
  });
  const first = validateAppointmentReviewActionPreconditions(input);
  const second = validateAppointmentReviewActionPreconditions(input);

  assert.deepEqual(second, first);
});

test("appointment review action preconditions returned objects cannot mutate internal constants", () => {
  const first = validateAppointmentReviewActionPreconditions(createValidInput());

  first.validationOnly = false;
  first.persistence = "persisted";

  const second = validateAppointmentReviewActionPreconditions(createValidInput());

  assert.equal(second.validationOnly, true);
  assert.equal(second.persistence, "not_persisted");
  assert.deepEqual(listSupportedControlledActionIntents(), [
    "approve_intent",
    "reject_intent",
  ]);
});

test("appointment review action preconditions have no side effects or execution imports", () => {
  let sideEffectCalled = false;
  const result = validateAppointmentReviewActionPreconditions(
    createValidInput({
      createAppointment() {
        sideEffectCalled = true;
      },
      createCalendarEvent() {
        sideEffectCalled = true;
      },
      getCalendarProvider() {
        sideEffectCalled = true;
      },
      metadata: {
        database() {
          sideEffectCalled = true;
        },
      },
    })
  );

  assert.equal(result.accepted, true);
  assert.equal(sideEffectCalled, false);
  assertSafetyFields(result);

  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /createAppointment/);
  assert.doesNotMatch(source, /createCalendarEvent/);
  assert.doesNotMatch(source, /getCalendarProvider/);
  assert.doesNotMatch(source, /manualAppointmentCalendarSync/);
  assert.doesNotMatch(source, /googleapis|prisma|supabase|redis/i);
  assert.doesNotMatch(source, /fetch/);
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /Date\.now|Math\.random|randomUUID|crypto/);
  assert.doesNotMatch(source, /appointmentReviewQueue|addAppointmentReview/);
  assert.doesNotMatch(source, /listAppointmentReviews|getAppointmentReviewById/);
  assert.doesNotMatch(source, /updateAppointmentReviewStatus/);
  assert.doesNotMatch(source, /route\.js|components\//);
});

test("appointment review action preconditions leave existing state machine behavior unchanged", () => {
  assert.deepEqual(APPOINTMENT_REVIEW_ACTION_STATES, [
    "pending_secretary_review",
    "validation_only_intent_checked",
    "needs_clinic_review",
    "action_intent_rejected",
  ]);

  const result = transitionAppointmentReviewActionIntentState({
    currentState: "validation_only_intent_checked",
    event: "reject_action_intent",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.nextState, "action_intent_rejected");
  assert.equal(result.code, "transition_accepted");
});

test("appointment review action preconditions leave existing action intent behavior unchanged", () => {
  assert.deepEqual(ALLOWED_ACTION_INTENTS, [
    "approve_intent",
    "reject_intent",
    "needs_clinic_review",
    "ask_patient_clarification",
  ]);

  const result = validateAppointmentReviewActionIntent({
    reviewId: "review_existing_action_intent",
    actionIntent: "needs_clinic_review",
    actorRole: "secretary",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.actionIntent, "needs_clinic_review");
  assert.equal(result.validationOnly, true);
  assert.equal(result.actionPerformed, false);
});
