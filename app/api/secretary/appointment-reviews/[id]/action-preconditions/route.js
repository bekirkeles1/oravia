const {
  validateAppointmentReviewActionPreconditions,
} = require("../../../../../../src/secretary/appointmentReviewActionPreconditionsContract");

const UNSAFE_TRUE_FIELDS = Object.freeze([
  "executionRequested",
  "executionAvailable",
  "actionPerformed",
  "bookingCreated",
  "calendarChecked",
  "appointmentCreated",
  "calendarEventCreated",
  "databasePersisted",
  "authenticated",
  "authorized",
  "reviewFound",
  "persisted",
]);

const SAFETY_FIELDS = Object.freeze({
  dryRun: true,
  validationOnly: true,
  preconditionsChecked: true,
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

async function POST(request, context = {}) {
  const params = await Promise.resolve(context.params || {});
  const reviewId = normalizeText(params.id);

  if (!reviewId) {
    return Response.json(
      createRouteValidationError(
        "missing_review_id",
        "Appointment review id is required for action preconditions dry-run."
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
        "invalid_preconditions_payload",
        "Action preconditions dry-run payload must be an object."
      ),
      { status: 400 }
    );
  }

  const unsafeField = findUnsafeTrueField(body);

  if (unsafeField) {
    return Response.json(
      createRouteValidationError(
        "unsafe_preconditions_field",
        `${unsafeField} must not be true for validation-only action preconditions dry-runs.`
      ),
      { status: 400 }
    );
  }

  const validation = validateAppointmentReviewActionPreconditions({
    reviewId,
    actionIntent: body.actionIntent,
    currentState: body.currentState,
    actor: body.actor,
    requestId: body.requestId,
  });

  return Response.json(
    {
      ...validation,
      reviewId,
      ...createSafetyFields(),
    },
    { status: 200 }
  );
}

async function rejectMethod() {
  return Response.json(
    createRouteValidationError(
      "method_not_allowed",
      "Only POST action preconditions dry-run validation is allowed on this route."
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
    eligibleForControlledHandling: false,
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

function findUnsafeTrueField(payload) {
  return UNSAFE_TRUE_FIELDS.find((fieldName) => payload[fieldName] === true);
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
