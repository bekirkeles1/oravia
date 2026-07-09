const ALLOWED_ACTION_INTENTS = Object.freeze([
  "approve_intent",
  "reject_intent",
  "needs_clinic_review",
  "ask_patient_clarification",
]);

const ALLOWED_ACTION_INTENT_SET = new Set(ALLOWED_ACTION_INTENTS);

const UNSAFE_ACTION_INTENTS = new Set([
  "approve",
  "reject",
  "book",
  "booked",
  "create_appointment",
  "calendar_sync",
  "create_calendar_event",
]);

function listAppointmentReviewActionIntents() {
  return [...ALLOWED_ACTION_INTENTS];
}

function validateAppointmentReviewActionIntent(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return validationError(
      "invalid_action_intent_payload",
      "Appointment review action intent payload must be an object."
    );
  }

  const reviewId = normalizeRequiredText(payload.reviewId);

  if (!reviewId) {
    return validationError(
      "missing_review_id",
      "reviewId is required for appointment review action intent validation."
    );
  }

  const actionIntent = normalizeRequiredText(payload.actionIntent);

  if (!actionIntent) {
    return validationError(
      "missing_action_intent",
      "actionIntent is required for appointment review action intent validation."
    );
  }

  if (UNSAFE_ACTION_INTENTS.has(actionIntent)) {
    return validationError(
      "unsafe_action_intent",
      "Action intent must not execute approval, rejection, booking, or calendar work."
    );
  }

  if (!ALLOWED_ACTION_INTENT_SET.has(actionIntent)) {
    return validationError(
      "unsupported_action_intent",
      "Unsupported appointment review action intent."
    );
  }

  const unsafeFlagError = findUnsafeSideEffectFlag(payload);

  if (unsafeFlagError) {
    return unsafeFlagError;
  }

  return {
    status: "ok",
    reviewId,
    actionIntent,
    actorRole: normalizeOptionalText(payload.actorRole || payload.actor) || null,
    reason: normalizeOptionalText(payload.reason || payload.note) || null,
    metadata: sanitizeMetadata(payload.metadata),
    allowedActionIntents: listAppointmentReviewActionIntents(),
    validationOnly: true,
    actionPerformed: false,
    bookingCreated: false,
    calendarChecked: false,
    databasePersisted: false,
    appointmentCreated: false,
    calendarEventCreated: false,
    requiresSecretaryConfirmation: true,
  };
}

function findUnsafeSideEffectFlag(payload) {
  const unsafeFlagNames = [
    "bookingCreated",
    "calendarChecked",
    "databasePersisted",
    "appointmentCreated",
    "calendarEventCreated",
  ];

  for (const flagName of unsafeFlagNames) {
    if (payload[flagName] === true) {
      return validationError(
        "unsafe_side_effect_flag",
        `${flagName} must not be true for validation-only action intents.`
      );
    }
  }

  return null;
}

function validationError(code, message) {
  return {
    status: "error",
    error: {
      code,
      message,
    },
    allowedActionIntents: listAppointmentReviewActionIntents(),
    validationOnly: true,
    actionPerformed: false,
    bookingCreated: false,
    calendarChecked: false,
    databasePersisted: false,
    appointmentCreated: false,
    calendarEventCreated: false,
    requiresSecretaryConfirmation: true,
  };
}

function normalizeRequiredText(value) {
  return String(value || "").trim();
}

function normalizeOptionalText(value) {
  const normalized = normalizeRequiredText(value);

  return normalized || null;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return cloneValue(metadata);
}

function cloneValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

module.exports = {
  ALLOWED_ACTION_INTENTS,
  listAppointmentReviewActionIntents,
  validateAppointmentReviewActionIntent,
};
