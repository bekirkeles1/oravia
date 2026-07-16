const {
  handleAppointmentReviewControlledActionValidationReceipt,
} = require("../../../../../../src/api/secretaryAppointmentReviewControlledActionValidationReceiptHandler");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../../../../../../src/secretary/appointmentReviewMockControlledActionDependencies");

const BODY_ALLOWED_FIELDS = Object.freeze([
  "actionIntent",
  "requestId",
  "idempotencyKey",
  "expectedReviewVersion",
]);

const BODY_TRUSTED_CONTEXT_FIELDS = Object.freeze([
  "reviewId",
  "currentState",
  "actor",
  "actorId",
  "actorRole",
  "role",
  "permissions",
  "verifiedActorContext",
  "authenticationVerified",
  "authorizationVerified",
  "observedReviewVersion",
  "priorIdempotencyObservation",
  "executionPolicyContext",
  "executionPolicy",
  "policyType",
  "policyVersion",
  "policySource",
  "policyMode",
  "executionEnabled",
  "requiredPermission",
]);

const ROUTE_UNSAFE_TRUE_FIELDS = Object.freeze([
  "executionEnabled",
  "executorAvailable",
  "executionAvailable",
  "executionRequested",
  "actionPerformed",
  "commandDispatched",
  "commandPersisted",
  "receiptPersisted",
  "receiptLogged",
  "receiptPublished",
  "bookingCreated",
  "calendarChecked",
  "appointmentCreated",
  "calendarEventCreated",
  "databasePersisted",
  "reviewFound",
  "persisted",
  "previousActionExecuted",
  "idempotencyRecordCreated",
  "authenticated",
  "authorized",
]);

const ROUTE_SAFETY_FIELDS = Object.freeze({
  mock: true,
  dryRun: true,
  validationOnly: true,
  controlledHandlingOnly: true,
  executionEnabled: false,
  executorAvailable: false,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  commandDispatched: false,
  commandPersisted: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
  authenticated: false,
  authorized: false,
  reviewFound: false,
  persisted: false,
  receiptLogged: false,
  receiptPublished: false,
  executionReady: false,
  appointmentApproved: false,
  appointmentRejected: false,
  productionAuthentication: false,
  productionAuthorization: false,
  authenticationMode: "mock_validation_only",
});

async function POST(request, context = {}) {
  const params = await Promise.resolve(context.params || {});
  const reviewId = normalizeText(params.id);

  if (!reviewId) {
    return Response.json(
      createRouteValidationError(
        "missing_review_id",
        "Appointment review id is required for controlled action validation receipt."
      ),
      { status: 400 }
    );
  }

  const bodyResult = await readJsonBody(request);

  if (bodyResult.status === "missing") {
    return Response.json(
      createRouteValidationError(
        "missing_body",
        "Controlled action validation receipt request body is required."
      ),
      { status: 400 }
    );
  }

  if (bodyResult.status === "error") {
    return Response.json(
      createRouteValidationError("invalid_json", "Request body must be valid JSON."),
      { status: 400 }
    );
  }

  const { body } = bodyResult;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      createRouteValidationError(
        "invalid_body",
        "Controlled action validation receipt request body must be an object."
      ),
      { status: 400 }
    );
  }

  const trustedContextField = findTrustedContextInjection(body);

  if (trustedContextField) {
    return Response.json(
      createRouteValidationError(
        "client_trusted_context_injection",
        `Request body must not provide trusted context field ${trustedContextField}.`
      ),
      { status: 400 }
    );
  }

  const unsafeField = findUnsafeTrueField(body);

  if (unsafeField) {
    return Response.json(
      createRouteValidationError(
        "unsafe_controlled_action_receipt_field",
        `${unsafeField} must not be true for validation-only receipt requests.`
      ),
      { status: 400 }
    );
  }

  const unsupportedField = Object.keys(body).find(
    (fieldName) => !BODY_ALLOWED_FIELDS.includes(fieldName)
  );

  if (unsupportedField) {
    return Response.json(
      createRouteValidationError(
        "invalid_body",
        `Request body field ${unsupportedField} is not supported.`
      ),
      { status: 400 }
    );
  }

  const receiptHandlerResult =
    await handleAppointmentReviewControlledActionValidationReceipt({
      method: "POST",
      reviewId,
      body,
      dependencies: createMockAppointmentReviewControlledActionDependencies(),
    });
  const routeResult = sanitizeRouteResult(receiptHandlerResult);

  return Response.json(
    {
      ...routeResult,
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
      "Only POST controlled action validation receipt is allowed on this route."
    ),
    { status: 405 }
  );
}

async function readJsonBody(request) {
  let text;

  try {
    text = await request.text();
  } catch (error) {
    return {
      status: "error",
      error,
    };
  }

  if (!normalizeText(text)) {
    return {
      status: "missing",
    };
  }

  try {
    return {
      status: "ok",
      body: JSON.parse(text),
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
    receiptHandlerCompleted: false,
    validationReceiptConstructed: false,
    validationReceipt: null,
    receiptOutcome: null,
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
  return { ...ROUTE_SAFETY_FIELDS };
}

function sanitizeRouteResult(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeRouteResult);
  }

  const sanitized = {};

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (
      fieldName === "verifiedActorContext" ||
      fieldName === "executionPolicyContext"
    ) {
      continue;
    }

    sanitized[fieldName] = sanitizeRouteResult(fieldValue);
  }

  return sanitized;
}

function findTrustedContextInjection(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findTrustedContextInjection(item);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (BODY_TRUSTED_CONTEXT_FIELDS.includes(fieldName)) {
      return fieldName;
    }

    const nested = findTrustedContextInjection(fieldValue);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function findUnsafeTrueField(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findUnsafeTrueField(item);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (ROUTE_UNSAFE_TRUE_FIELDS.includes(fieldName) && fieldValue === true) {
      return fieldName;
    }

    const nested = findUnsafeTrueField(fieldValue);

    if (nested) {
      return nested;
    }
  }

  return null;
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
