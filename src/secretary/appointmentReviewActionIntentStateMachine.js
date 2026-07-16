const APPOINTMENT_REVIEW_ACTION_STATES = Object.freeze([
  "pending_secretary_review",
  "validation_only_intent_checked",
  "needs_clinic_review",
  "action_intent_rejected",
]);

const APPOINTMENT_REVIEW_ACTION_EVENTS = Object.freeze([
  "check_validation_only_intent",
  "require_clinic_review",
  "reject_action_intent",
]);

const TERMINAL_APPOINTMENT_REVIEW_ACTION_STATES = Object.freeze([
  "needs_clinic_review",
  "action_intent_rejected",
]);

const APPOINTMENT_REVIEW_ACTION_TRANSITIONS = Object.freeze({
  pending_secretary_review: Object.freeze({
    check_validation_only_intent: "validation_only_intent_checked",
  }),
  validation_only_intent_checked: Object.freeze({
    require_clinic_review: "needs_clinic_review",
    reject_action_intent: "action_intent_rejected",
  }),
});

const SAFETY_FIELDS = Object.freeze({
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

function transitionAppointmentReviewActionIntentState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectTransition({
      currentState: null,
      event: null,
      nextState: null,
      code: "invalid_state_machine_input",
      reason:
        "Appointment review action intent state transition input must be an object.",
    });
  }

  const currentState = normalizeText(input.currentState);
  const event = normalizeText(input.event);

  if (!currentState || !event) {
    return rejectTransition({
      currentState: currentState || null,
      event: event || null,
      nextState: recognizedState(currentState) ? currentState : null,
      code: "invalid_state_machine_input",
      reason:
        "Appointment review action intent state transition requires currentState and event.",
    });
  }

  if (!recognizedState(currentState)) {
    return rejectTransition({
      currentState,
      event,
      nextState: null,
      code: "unknown_state",
      reason: "Unknown appointment review action intent state.",
    });
  }

  if (!recognizedEvent(event)) {
    return rejectTransition({
      currentState,
      event,
      nextState: currentState,
      code: "unknown_event",
      reason: "Unknown appointment review action intent event.",
    });
  }

  if (isTerminalState(currentState)) {
    return rejectTransition({
      currentState,
      event,
      nextState: currentState,
      code: "terminal_state_transition_rejected",
      reason:
        "Terminal appointment review action intent states do not allow outgoing transitions.",
    });
  }

  const nextState =
    APPOINTMENT_REVIEW_ACTION_TRANSITIONS[currentState] &&
    APPOINTMENT_REVIEW_ACTION_TRANSITIONS[currentState][event];

  if (!nextState) {
    return rejectTransition({
      currentState,
      event,
      nextState: currentState,
      code: "invalid_transition",
      reason:
        "Appointment review action intent state transition is not allowed.",
    });
  }

  return {
    accepted: true,
    currentState,
    event,
    nextState,
    code: "transition_accepted",
    ...createSafetyFields(),
  };
}

function listAppointmentReviewActionIntentStates() {
  return [...APPOINTMENT_REVIEW_ACTION_STATES];
}

function listAppointmentReviewActionIntentEvents() {
  return [...APPOINTMENT_REVIEW_ACTION_EVENTS];
}

function rejectTransition({ currentState, event, nextState, code, reason }) {
  return {
    accepted: false,
    currentState,
    event,
    nextState,
    code,
    reason,
    ...createSafetyFields(),
  };
}

function createSafetyFields() {
  return { ...SAFETY_FIELDS };
}

function recognizedState(state) {
  return APPOINTMENT_REVIEW_ACTION_STATES.includes(state);
}

function recognizedEvent(event) {
  return APPOINTMENT_REVIEW_ACTION_EVENTS.includes(event);
}

function isTerminalState(state) {
  return TERMINAL_APPOINTMENT_REVIEW_ACTION_STATES.includes(state);
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  APPOINTMENT_REVIEW_ACTION_EVENTS,
  APPOINTMENT_REVIEW_ACTION_STATES,
  TERMINAL_APPOINTMENT_REVIEW_ACTION_STATES,
  listAppointmentReviewActionIntentEvents,
  listAppointmentReviewActionIntentStates,
  transitionAppointmentReviewActionIntentState,
};
