const {
  transitionAppointmentReviewActionIntentState,
} = require("../../../../../../src/secretary/appointmentReviewActionIntentStateMachine");

const UNSAFE_SIDE_EFFECT_FIELDS = Object.freeze([
  "executionRequested",
  "actionPerformed",
  "bookingCreated",
  "calendarChecked",
  "appointmentCreated",
  "calendarEventCreated",
  "databasePersisted",
]);

const SAFETY_FIELDS = Object.freeze({
  dryRun: true,
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

async function POST(request, context = {}) {
  const params = await Promise.resolve(context.params || {});
  const reviewId = normalizeText(params.id);

  if (!reviewId) {
    return Response.json(
      createRouteValidationError(
        "missing_review_id",
        "Appointment review id is required for state transition dry-run."
      ),
      { status: 400 }
    );
  }

  const bodyResult = await readJsonBody(request);

  if (bodyResult.status === "error") {
    return Response.json(
      createRouteValidationError("invalid_json", "Request body must be valid JSON."),
      { status: 400 }
    );
  }

  const body = bodyResult.body || {};

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      createRouteValidationError(
        "invalid_state_transition_payload",
        "State transition dry-run payload must be an object."
      ),
      { status: 400 }
    );
  }

  const unsafeField = findUnsafeSideEffectField(body);

  if (unsafeField) {
    return Response.json(
      createRouteValidationError(
        "unsafe_side_effect_field",
        `${unsafeField} must not be true for validation-only state transition dry-runs.`
      ),
      { status: 400 }
    );
  }

  const currentState = normalizeText(body.currentState);
  const event = normalizeText(body.event);

  if (!currentState) {
    return Response.json(
      createRouteValidationError(
        "missing_current_state",
        "currentState is required for state transition dry-run."
      ),
      { status: 400 }
    );
  }

  if (!event) {
    return Response.json(
      createRouteValidationError(
        "missing_event",
        "event is required for state transition dry-run."
      ),
      { status: 400 }
    );
  }

  const transition = transitionAppointmentReviewActionIntentState({
    currentState,
    event,
  });

  return Response.json(
    {
      reviewId,
      ...transition,
      ...createSafetyFields(),
    },
    { status: 200 }
  );
}

async function rejectMethod() {
  return Response.json(
    createRouteValidationError(
      "method_not_allowed",
      "Only POST state transition dry-run validation is allowed on this route."
    ),
    { status: 405 }
  );
}

async function readJsonBody(request) {
  try {
    return {
      status: "ok",
      body: await request.json(),
    };
  } catch (error) {
    return {
      status: "error",
      error,
    };
  }
}

function createRouteValidationError(code, message) {
  return {
    accepted: false,
    code,
    reason: message,
    error: {
      code,
      message,
    },
    ...createSafetyFields(),
  };
}

function createSafetyFields() {
  return { ...SAFETY_FIELDS };
}

function findUnsafeSideEffectField(payload) {
  return UNSAFE_SIDE_EFFECT_FIELDS.find((fieldName) => payload[fieldName] === true);
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  GET: rejectMethod,
  POST,
  PUT: rejectMethod,
  PATCH: rejectMethod,
  DELETE: rejectMethod,
};
