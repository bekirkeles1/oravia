const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  APPOINTMENT_REVIEW_ACTION_EVENTS,
  APPOINTMENT_REVIEW_ACTION_STATES,
  TERMINAL_APPOINTMENT_REVIEW_ACTION_STATES,
  listAppointmentReviewActionIntentEvents,
  listAppointmentReviewActionIntentStates,
  transitionAppointmentReviewActionIntentState,
} = require("../src/secretary/appointmentReviewActionIntentStateMachine");

const EXPECTED_SAFETY_FIELDS = Object.freeze({
  validationOnly: true,
  executionAvailable: false,
  actionPerformed: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
  requiresSecretaryConfirmation: true,
});

function assertSafetyFields(result) {
  for (const [field, value] of Object.entries(EXPECTED_SAFETY_FIELDS)) {
    assert.equal(result[field], value);
  }
}

test("appointment review action intent state machine exposes immutable state and event lists", () => {
  assert.deepEqual(listAppointmentReviewActionIntentStates(), [
    "pending_secretary_review",
    "validation_only_intent_checked",
    "needs_clinic_review",
    "action_intent_rejected",
  ]);
  assert.deepEqual(listAppointmentReviewActionIntentEvents(), [
    "check_validation_only_intent",
    "require_clinic_review",
    "reject_action_intent",
  ]);
  assert.equal(Object.isFrozen(APPOINTMENT_REVIEW_ACTION_STATES), true);
  assert.equal(Object.isFrozen(APPOINTMENT_REVIEW_ACTION_EVENTS), true);
  assert.equal(
    Object.isFrozen(TERMINAL_APPOINTMENT_REVIEW_ACTION_STATES),
    true
  );
});

test("appointment review action intent state machine accepts the three allowed transitions", () => {
  const cases = [
    {
      currentState: "pending_secretary_review",
      event: "check_validation_only_intent",
      nextState: "validation_only_intent_checked",
    },
    {
      currentState: "validation_only_intent_checked",
      event: "require_clinic_review",
      nextState: "needs_clinic_review",
    },
    {
      currentState: "validation_only_intent_checked",
      event: "reject_action_intent",
      nextState: "action_intent_rejected",
    },
  ];

  for (const transition of cases) {
    const result = transitionAppointmentReviewActionIntentState(transition);

    assert.equal(result.accepted, true);
    assert.equal(result.currentState, transition.currentState);
    assert.equal(result.event, transition.event);
    assert.equal(result.nextState, transition.nextState);
    assert.equal(result.code, "transition_accepted");
    assertSafetyFields(result);
  }
});

test("appointment review action intent state machine rejects invalid events from non-terminal states", () => {
  const cases = [
    {
      currentState: "pending_secretary_review",
      event: "require_clinic_review",
    },
    {
      currentState: "pending_secretary_review",
      event: "reject_action_intent",
    },
    {
      currentState: "validation_only_intent_checked",
      event: "check_validation_only_intent",
    },
  ];

  for (const transition of cases) {
    const result = transitionAppointmentReviewActionIntentState(transition);

    assert.equal(result.accepted, false);
    assert.equal(result.currentState, transition.currentState);
    assert.equal(result.event, transition.event);
    assert.equal(result.nextState, transition.currentState);
    assert.equal(result.code, "invalid_transition");
    assert.match(result.reason, /not allowed/);
    assertSafetyFields(result);
  }
});

test("appointment review action intent state machine rejects outgoing transitions from terminal states", () => {
  for (const currentState of TERMINAL_APPOINTMENT_REVIEW_ACTION_STATES) {
    for (const event of APPOINTMENT_REVIEW_ACTION_EVENTS) {
      const result = transitionAppointmentReviewActionIntentState({
        currentState,
        event,
      });

      assert.equal(result.accepted, false);
      assert.equal(result.currentState, currentState);
      assert.equal(result.event, event);
      assert.equal(result.nextState, currentState);
      assert.equal(result.code, "terminal_state_transition_rejected");
      assert.match(result.reason, /Terminal/);
      assertSafetyFields(result);
    }
  }
});

test("appointment review action intent state machine rejects unknown state safely", () => {
  const result = transitionAppointmentReviewActionIntentState({
    currentState: "waiting_for_manager",
    event: "check_validation_only_intent",
  });

  assert.equal(result.accepted, false);
  assert.equal(result.currentState, "waiting_for_manager");
  assert.equal(result.event, "check_validation_only_intent");
  assert.equal(result.nextState, null);
  assert.equal(result.code, "unknown_state");
  assert.match(result.reason, /Unknown/);
  assertSafetyFields(result);
});

test("appointment review action intent state machine rejects unknown event safely", () => {
  const result = transitionAppointmentReviewActionIntentState({
    currentState: "pending_secretary_review",
    event: "start_booking",
  });

  assert.equal(result.accepted, false);
  assert.equal(result.currentState, "pending_secretary_review");
  assert.equal(result.event, "start_booking");
  assert.equal(result.nextState, "pending_secretary_review");
  assert.equal(result.code, "unknown_event");
  assert.match(result.reason, /Unknown/);
  assertSafetyFields(result);
});

test("appointment review action intent state machine rejects malformed input safely", () => {
  const malformedInputs = [
    null,
    undefined,
    "",
    [],
    {},
    { currentState: "pending_secretary_review" },
    { event: "check_validation_only_intent" },
  ];

  for (const input of malformedInputs) {
    const result = transitionAppointmentReviewActionIntentState(input);

    assert.equal(result.accepted, false);
    assert.equal(result.code, "invalid_state_machine_input");
    assert.match(result.reason, /input|requires/);
    assertSafetyFields(result);
  }
});

test("appointment review action intent state machine does not mutate input", () => {
  const input = Object.freeze({
    currentState: "pending_secretary_review",
    event: "check_validation_only_intent",
    metadata: Object.freeze({
      nested: "preserved",
    }),
  });
  const before = JSON.stringify(input);

  transitionAppointmentReviewActionIntentState(input);

  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(input, {
    currentState: "pending_secretary_review",
    event: "check_validation_only_intent",
    metadata: {
      nested: "preserved",
    },
  });
});

test("appointment review action intent state machine returns deterministic results", () => {
  const input = {
    currentState: "validation_only_intent_checked",
    event: "require_clinic_review",
  };
  const first = transitionAppointmentReviewActionIntentState(input);
  const second = transitionAppointmentReviewActionIntentState(input);

  assert.deepEqual(second, first);
});

test("appointment review action intent state machine has no booking calendar database persistence or appointment side effects", () => {
  let sideEffectCalled = false;
  const result = transitionAppointmentReviewActionIntentState({
    currentState: "pending_secretary_review",
    event: "check_validation_only_intent",
    ignoredSideEffectOne() {
      sideEffectCalled = true;
    },
    ignoredSideEffectTwo() {
      sideEffectCalled = true;
    },
    ignoredSideEffectThree() {
      sideEffectCalled = true;
    },
    ignoredSideEffectFour() {
      sideEffectCalled = true;
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(sideEffectCalled, false);
  assertSafetyFields(result);

  const source = fs.readFileSync(
    "src/secretary/appointmentReviewActionIntentStateMachine.js",
    "utf8"
  );

  assert.doesNotMatch(source, /require\(/);
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /appointmentCreation/);
  assert.doesNotMatch(source, /calendarProvider/);
  assert.doesNotMatch(source, /Google Calendar/);
  assert.doesNotMatch(source, /google/i);
  assert.doesNotMatch(
    source,
    new RegExp(["pri" + "sma", "supa" + "base", "re" + "dis"].join("|"), "i")
  );
  assert.doesNotMatch(
    source,
    new RegExp(["fe" + "tch", "ht" + "tp", "ht" + "tps", "net" + "work"].join("|"), "i")
  );
  assert.doesNotMatch(source, /route\.js|components\//);
});
