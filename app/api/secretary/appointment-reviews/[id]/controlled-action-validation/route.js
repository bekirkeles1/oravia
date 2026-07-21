const {
  BODY_ALLOWED_FIELDS,
  BODY_TRUSTED_CONTEXT_FIELDS,
  UNSAFE_EXECUTION_FIELDS,
  handleAppointmentReviewControlledActionValidation,
} = require("../../../../../../src/api/secretaryAppointmentReviewControlledActionValidationHandler");
const {
  createAppointmentReviewRouteRuntimeAdapter,
} = require("../../../../../../src/secretary/appointmentReviewRouteRuntimeAdapter");

const ROUTE_UNSAFE_TRUE_FIELDS = Object.freeze([
  ...UNSAFE_EXECUTION_FIELDS,
  "executorAvailable",
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
  executionReady: false,
  appointmentApproved: false,
  appointmentRejected: false,
  productionAuthentication: false,
  productionAuthorization: false,
  authenticationMode: "mock_validation_only",
});

const REQUIRED_CONTROLLED_ACTION_DEPENDENCY_METHODS = Object.freeze([
  "resolveVerifiedActorContext",
  "resolveAppointmentReviewContext",
  "resolveIdempotencyContext",
  "resolveExecutionPolicyContext",
]);

async function POST(request, context = {}) {
  return handleControlledActionValidationRouteRequest(request, context);
}

async function handleControlledActionValidationRouteRequest(
  request,
  context = {},
  options = {}
) {
  const createRouteRuntimeAdapter =
    options.createRouteRuntimeAdapter ||
    createAppointmentReviewRouteRuntimeAdapter;
  const params = await Promise.resolve(context.params || {});
  const reviewId = normalizeText(params.id);

  if (!reviewId) {
    return Response.json(
      createRouteValidationError(
        "missing_review_id",
        "Appointment review id is required for controlled action validation."
      ),
      { status: 400 }
    );
  }

  const bodyResult = await readJsonBody(request);

  if (bodyResult.status === "missing") {
    return Response.json(
      createRouteValidationError(
        "missing_body",
        "Controlled action validation request body is required."
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
        "Controlled action validation request body must be an object."
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
        "unsafe_controlled_action_field",
        `${unsafeField} must not be true for validation-only controlled action requests.`
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

  const dependenciesResult = resolveRouteControlledActionDependencies({
    createRouteRuntimeAdapter,
    reviewId,
  });

  if (!dependenciesResult.accepted) {
    return Response.json(
      createRouteValidationError(
        "internal_error",
        "Controlled action validation runtime failed safely."
      ),
      { status: 500 }
    );
  }

  const handlerResult = await handleAppointmentReviewControlledActionValidation({
    method: "POST",
    reviewId,
    body,
    dependencies: dependenciesResult.dependencies,
  });

  return Response.json(
    {
      ...handlerResult,
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
      "Only POST controlled action validation is allowed on this route."
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
    handlerCompleted: false,
    matchingReplay: false,
    replayExistingResultOnly: false,
    eligibleForExecutorBoundary: false,
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

function createRouteReviewSeed(reviewId) {
  return {
    id: reviewId,
    status: "pending_secretary_review",
    source: "mock",
    selectedSlot: {
      id: "route_validation_slot",
      source: "mock",
    },
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
    metadata: {},
  };
}

function resolveRouteControlledActionState() {
  return "validation_only_intent_checked";
}

function resolveRouteControlledActionDependencies({
  createRouteRuntimeAdapter,
  reviewId,
}) {
  try {
    const routeRuntime = createRouteRuntimeAdapter({
      resolveControlledActionState: resolveRouteControlledActionState,
      initialReviews: [createRouteReviewSeed(reviewId)],
    });

    if (
      !routeRuntime ||
      typeof routeRuntime !== "object" ||
      typeof routeRuntime.getControlledActionDependencies !== "function"
    ) {
      return {
        accepted: false,
      };
    }

    const dependencies = routeRuntime.getControlledActionDependencies();

    if (!hasControlledActionDependencyContract(dependencies)) {
      return {
        accepted: false,
      };
    }

    return {
      accepted: true,
      dependencies,
    };
  } catch {
    return {
      accepted: false,
    };
  }
}

function hasControlledActionDependencyContract(dependencies) {
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
    return false;
  }

  return REQUIRED_CONTROLLED_ACTION_DEPENDENCY_METHODS.every(
    (methodName) => typeof dependencies[methodName] === "function"
  );
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
  handleControlledActionValidationRouteRequest,
};
