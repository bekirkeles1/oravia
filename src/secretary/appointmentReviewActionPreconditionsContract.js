const {
  ALLOWED_ACTION_INTENTS,
} = require("./appointmentReviewActionIntentContract");

const SUPPORTED_CONTROLLED_ACTION_INTENTS = Object.freeze([
  "approve_intent",
  "reject_intent",
]);

const REQUIRED_CURRENT_STATE = "validation_only_intent_checked";
const REQUIRED_ACTOR_ROLE = "secretary";

const UNSAFE_EXECUTION_FIELDS = Object.freeze([
  "executionRequested",
  "executionAvailable",
  "actionPerformed",
  "bookingCreated",
  "calendarChecked",
  "appointmentCreated",
  "calendarEventCreated",
  "databasePersisted",
]);

const SAFETY_FIELDS = Object.freeze({
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

function validateAppointmentReviewActionPreconditions(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectPreconditions({
      code: "invalid_input",
      reason:
        "Appointment review controlled action preconditions input must be an object.",
    });
  }

  const unsafeField = findUnsafeExecutionField(input);

  if (unsafeField) {
    return rejectPreconditions({
      code: "unsafe_execution_flags",
      reason: `${unsafeField} must not indicate execution or side effects for validation-only preconditions.`,
      identifiers: normalizeKnownIdentifiers(input),
    });
  }

  if (hasUnsafePersistenceIndicator(input)) {
    return rejectPreconditions({
      code: "unsafe_execution_flags",
      reason:
        "persistence must not indicate persisted work for validation-only preconditions.",
      identifiers: normalizeKnownIdentifiers(input),
    });
  }

  const reviewId = normalizeText(input.reviewId);

  if (!reviewId) {
    return rejectPreconditions({
      code: "missing_review_id",
      reason: "reviewId is required for controlled action preconditions.",
      identifiers: normalizeKnownIdentifiers(input),
    });
  }

  const actionIntent = normalizeText(input.actionIntent);

  if (!isSupportedActionIntent(actionIntent)) {
    return rejectPreconditions({
      code: "unsupported_action_intent",
      reason:
        "actionIntent must be approve_intent or reject_intent for controlled action preconditions.",
      identifiers: normalizeKnownIdentifiers(input),
    });
  }

  const currentState = normalizeText(input.currentState);

  if (currentState !== REQUIRED_CURRENT_STATE) {
    return rejectPreconditions({
      code: "unsupported_current_state",
      reason:
        "currentState must be validation_only_intent_checked for controlled action preconditions.",
      identifiers: normalizeKnownIdentifiers(input),
    });
  }

  if (!input.actor || typeof input.actor !== "object" || Array.isArray(input.actor)) {
    return rejectPreconditions({
      code: "missing_actor",
      reason: "actor is required for controlled action preconditions.",
      identifiers: normalizeKnownIdentifiers(input),
    });
  }

  const actorId = normalizeText(input.actor.actorId);

  if (!actorId) {
    return rejectPreconditions({
      code: "missing_actor_id",
      reason: "actor.actorId is required for controlled action preconditions.",
      identifiers: normalizeKnownIdentifiers(input),
    });
  }

  const actorRole = normalizeText(input.actor.role);

  if (actorRole !== REQUIRED_ACTOR_ROLE) {
    return rejectPreconditions({
      code: "unsupported_actor_role",
      reason: "actor.role must be secretary for controlled action preconditions.",
      identifiers: normalizeKnownIdentifiers(input),
    });
  }

  const requestId = normalizeText(input.requestId);

  if (!requestId) {
    return rejectPreconditions({
      code: "missing_request_id",
      reason: "requestId is required for controlled action preconditions.",
      identifiers: normalizeKnownIdentifiers(input),
    });
  }

  return {
    accepted: true,
    eligibleForControlledHandling: true,
    controlledHandlingOnly: true,
    reviewId,
    actionIntent,
    currentState,
    actorId,
    actorRole,
    requestId,
    code: "preconditions_satisfied",
    ...createSafetyFields(),
  };
}

function listSupportedControlledActionIntents() {
  return [...SUPPORTED_CONTROLLED_ACTION_INTENTS];
}

function rejectPreconditions({ code, reason, identifiers = {} }) {
  return {
    accepted: false,
    eligibleForControlledHandling: false,
    controlledHandlingOnly: true,
    ...identifiers,
    code,
    reason,
    ...createSafetyFields(),
  };
}

function normalizeKnownIdentifiers(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const identifiers = {};
  const reviewId = normalizeText(input.reviewId);
  const actionIntent = normalizeText(input.actionIntent);
  const currentState = normalizeText(input.currentState);
  const requestId = normalizeText(input.requestId);

  if (reviewId) {
    identifiers.reviewId = reviewId;
  }

  if (actionIntent) {
    identifiers.actionIntent = actionIntent;
  }

  if (currentState) {
    identifiers.currentState = currentState;
  }

  if (input.actor && typeof input.actor === "object" && !Array.isArray(input.actor)) {
    const actorId = normalizeText(input.actor.actorId);
    const actorRole = normalizeText(input.actor.role);

    if (actorId) {
      identifiers.actorId = actorId;
    }

    if (actorRole) {
      identifiers.actorRole = actorRole;
    }
  }

  if (requestId) {
    identifiers.requestId = requestId;
  }

  return identifiers;
}

function findUnsafeExecutionField(input) {
  return UNSAFE_EXECUTION_FIELDS.find((fieldName) => input[fieldName] === true);
}

function hasUnsafePersistenceIndicator(input) {
  return (
    Object.prototype.hasOwnProperty.call(input, "persistence") &&
    normalizeText(input.persistence) !== "" &&
    normalizeText(input.persistence) !== "not_persisted"
  );
}

function isSupportedActionIntent(actionIntent) {
  return (
    SUPPORTED_CONTROLLED_ACTION_INTENTS.includes(actionIntent) &&
    ALLOWED_ACTION_INTENTS.includes(actionIntent)
  );
}

function createSafetyFields() {
  return { ...SAFETY_FIELDS };
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  REQUIRED_ACTOR_ROLE,
  REQUIRED_CURRENT_STATE,
  SUPPORTED_CONTROLLED_ACTION_INTENTS,
  UNSAFE_EXECUTION_FIELDS,
  listSupportedControlledActionIntents,
  validateAppointmentReviewActionPreconditions,
};
