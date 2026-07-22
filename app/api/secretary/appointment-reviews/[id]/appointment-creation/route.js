const {
  APPOINTMENT_CREATION_CONFIRMATION,
} = require("../../../../../../src/api/secretaryAppointmentReviewAppointmentCreationService");
const {
  getActiveAppointmentReviewRouteRuntimeAdapter,
} = require("../../../../../../src/secretary/appointmentReviewRouteRuntimeCompositionRoot");

const ROUTE_SAFETY_FIELDS = Object.freeze({
  appointmentCreation: true,
  storage: "in_memory",
  persistence: "not_persisted",
  durablePersistence: false,
  calendarWritten: false,
  calendarEventCreated: false,
  messageSent: false,
  emailSent: false,
  whatsappSent: false,
  databasePersisted: false,
  externalCallPerformed: false,
});

const BODY_ALLOWED_FIELDS = Object.freeze([
  "expectedReviewVersion",
  "idempotencyKey",
  "confirmation",
]);

const BODY_TRUSTED_FIELDS = Object.freeze([
  "appointment",
  "appointmentId",
  "doctor",
  "doctorId",
  "doctorName",
  "patient",
  "patientId",
  "patientPhone",
  "selectedSlot",
  "selectedSlotId",
  "startAt",
  "endAt",
  "durationMinutes",
  "appointmentPurpose",
  "treatment",
  "reviewState",
  "bookingCreated",
  "calendarChecked",
  "handoffResult",
  "guidedSession",
  "followUpFocusBoard",
]);

async function POST(request, context = {}) {
  return handleAppointmentReviewAppointmentCreationRouteRequest(
    request,
    context
  );
}

async function handleAppointmentReviewAppointmentCreationRouteRequest(
  request,
  context = {},
  options = {}
) {
  const params = await Promise.resolve(context.params || {});
  const reviewId = normalizeText(params.id);

  if (!reviewId) {
    return routeJson(
      createRouteError(
        "missing_review_id",
        "Appointment review id is required for appointment creation."
      ),
      400
    );
  }

  const bodyResult = await readJsonBody(request);

  if (bodyResult.status === "error") {
    return routeJson(
      createRouteError("invalid_json", "Request body must be valid JSON."),
      400
    );
  }

  const body = bodyResult.body || {};

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return routeJson(
      createRouteError(
        "invalid_appointment_creation_payload",
        "Appointment creation request body must be an object."
      ),
      400
    );
  }

  const bodyIssue = validateBody(body);

  if (bodyIssue) {
    return routeJson(createRouteError(bodyIssue.code, bodyIssue.reason), 400);
  }

  const runtimeResult = resolveRouteRuntime({
    createRouteRuntimeAdapter:
      options.createRouteRuntimeAdapter ||
      getActiveAppointmentReviewRouteRuntimeAdapter,
  });

  if (!runtimeResult.accepted) {
    return routeJson(
      createRouteError(
        "internal_error",
        "Appointment creation runtime failed safely."
      ),
      500
    );
  }

  let creationResult;

  try {
    creationResult =
      await runtimeResult.adapter.createAppointmentFromApprovedReview({
        reviewId,
        expectedReviewVersion: body.expectedReviewVersion,
        idempotencyKey: normalizeText(body.idempotencyKey),
        confirmation: normalizeText(body.confirmation),
      });
  } catch {
    return routeJson(
      createRouteError(
        "internal_error",
        "Appointment creation application failed safely."
      ),
      500
    );
  }

  if (!creationResult || typeof creationResult !== "object") {
    return routeJson(
      createRouteError(
        "internal_error",
        "Appointment creation application returned malformed output."
      ),
      500
    );
  }

  return routeJson(
    {
      ...creationResult,
      ...createSafetyFields(),
    },
    resolveStatus(creationResult)
  );
}

function validateBody(body) {
  const trustedField = findField(body, BODY_TRUSTED_FIELDS);

  if (trustedField) {
    return {
      code: "client_trusted_appointment_injection",
      reason: `Request body must not provide trusted appointment field ${trustedField}.`,
    };
  }

  const unsupportedField = Object.keys(body).find(
    (fieldName) => !BODY_ALLOWED_FIELDS.includes(fieldName)
  );

  if (unsupportedField) {
    return {
      code: "invalid_appointment_creation_payload",
      reason: `Request body field ${unsupportedField} is not supported.`,
    };
  }

  if (
    !Number.isSafeInteger(body.expectedReviewVersion) ||
    body.expectedReviewVersion < 1
  ) {
    return {
      code: "invalid_expected_review_version",
      reason: "expectedReviewVersion must be a positive safe integer.",
    };
  }

  const idempotencyKey = normalizeText(body.idempotencyKey);

  if (!idempotencyKey || idempotencyKey.length > 128) {
    return {
      code: idempotencyKey
        ? "invalid_idempotency_key"
        : "missing_idempotency_key",
      reason:
        "idempotencyKey is required and must be 128 characters or fewer.",
    };
  }

  if (!/^[A-Za-z0-9:_-]+$/.test(idempotencyKey)) {
    return {
      code: "invalid_idempotency_key",
      reason:
        "idempotencyKey may contain only letters, numbers, hyphen, underscore, and colon.",
    };
  }

  if (normalizeText(body.confirmation) !== APPOINTMENT_CREATION_CONFIRMATION) {
    return {
      code: "missing_appointment_creation_confirmation",
      reason: "Explicit in-memory appointment creation confirmation is required.",
    };
  }

  return null;
}

function resolveRouteRuntime({ createRouteRuntimeAdapter }) {
  try {
    const adapter = createRouteRuntimeAdapter({
      resolveControlledActionState,
    });

    if (
      !adapter ||
      typeof adapter.createAppointmentFromApprovedReview !== "function"
    ) {
      return {
        accepted: false,
      };
    }

    return {
      accepted: true,
      adapter,
    };
  } catch {
    return {
      accepted: false,
    };
  }
}

function resolveStatus(result) {
  if (result.accepted === true) {
    return 200;
  }

  if (result.notFound === true) {
    return 404;
  }

  if (result.conflict === true || result.code === "review_version_conflict") {
    return 409;
  }

  if (result.blocked === true) {
    return 422;
  }

  if (result.internal === true) {
    return 500;
  }

  return 400;
}

async function rejectMethod() {
  return routeJson(
    createRouteError(
      "method_not_allowed",
      "Only POST in-memory appointment creation is allowed on this route."
    ),
    405
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

function createRouteError(code, reason) {
  return {
    accepted: false,
    created: false,
    appointmentCreated: false,
    matchingReplay: false,
    replayedResultOnly: false,
    code,
    reason,
    appointment: null,
    review: null,
    receipt: null,
    reviewVersionChanged: false,
    appointmentRepositoryVersionChanged: false,
    ...createSafetyFields(),
  };
}

function routeJson(body, status) {
  return Response.json(body, { status });
}

function findField(value, fieldNames) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findField(item, fieldNames);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (fieldNames.includes(fieldName)) {
      return fieldName;
    }

    const nested = findField(fieldValue, fieldNames);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function resolveControlledActionState(input) {
  return normalizeText(input?.review?.metadata?.controlledActionState);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function createSafetyFields() {
  return { ...ROUTE_SAFETY_FIELDS };
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
  handleAppointmentReviewAppointmentCreationRouteRequest,
};
