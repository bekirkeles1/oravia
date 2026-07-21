const {
  validateAppointmentReviewActionPreconditions,
} = require("../../../../../../src/secretary/appointmentReviewActionPreconditionsContract");
const {
  createAppointmentReviewRouteRuntimeAdapter,
} = require("../../../../../../src/secretary/appointmentReviewRouteRuntimeAdapter");

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
  return handleAppointmentReviewActionPreconditionsRouteRequest(
    request,
    context
  );
}

async function handleAppointmentReviewActionPreconditionsRouteRequest(
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

  const payloadValidation = validateAppointmentReviewActionPreconditions({
    reviewId,
    actionIntent: body.actionIntent,
    currentState: body.currentState,
    actor: body.actor,
    requestId: body.requestId,
  });

  if (!payloadValidation.accepted) {
    return Response.json(
      {
        ...payloadValidation,
        reviewId,
        ...createSafetyFields(),
      },
      { status: 200 }
    );
  }

  const dependenciesResult = await resolveRouteControlledActionDependencies({
    createRouteRuntimeAdapter,
    reviewId,
    actionIntent: body.actionIntent,
  });

  if (!dependenciesResult.accepted) {
    return Response.json(
      createRouteValidationError(
        "internal_error",
        "Action preconditions runtime failed safely."
      ),
      { status: 500 }
    );
  }

  const validation = validateAppointmentReviewActionPreconditions({
    reviewId,
    actionIntent: body.actionIntent,
    currentState: dependenciesResult.reviewContext.currentState,
    actor: {
      actorId: dependenciesResult.actorContext.actorId,
      role: dependenciesResult.actorContext.role,
    },
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

async function resolveRouteControlledActionDependencies({
  createRouteRuntimeAdapter,
  reviewId,
  actionIntent,
}) {
  try {
    const routeRuntime = createRouteRuntimeAdapter({
      resolveControlledActionState: resolveRouteControlledActionState,
      initialReviews: [createRouteReviewSeed(reviewId)],
    });

    if (
      !routeRuntime ||
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

    const actorContext = await dependencies.resolveVerifiedActorContext({
      actionIntent,
    });
    const reviewContext = await dependencies.resolveAppointmentReviewContext({
      reviewId,
    });

    if (!hasActorContext(actorContext) || !hasReviewContext(reviewContext)) {
      return {
        accepted: false,
      };
    }

    return {
      accepted: true,
      actorContext,
      reviewContext,
    };
  } catch {
    return {
      accepted: false,
    };
  }
}

function hasControlledActionDependencyContract(dependencies) {
  return Boolean(
    dependencies &&
      typeof dependencies === "object" &&
      !Array.isArray(dependencies) &&
      typeof dependencies.resolveVerifiedActorContext === "function" &&
      typeof dependencies.resolveAppointmentReviewContext === "function"
  );
}

function hasActorContext(actorContext) {
  return Boolean(
    actorContext &&
      typeof actorContext === "object" &&
      !Array.isArray(actorContext) &&
      normalizeText(actorContext.actorId) &&
      normalizeText(actorContext.role)
  );
}

function hasReviewContext(reviewContext) {
  return Boolean(
    reviewContext &&
      typeof reviewContext === "object" &&
      !Array.isArray(reviewContext) &&
      normalizeText(reviewContext.reviewId) &&
      normalizeText(reviewContext.currentState)
  );
}

function createRouteReviewSeed(reviewId) {
  return {
    id: reviewId,
    status: "pending_secretary_review",
    source: "mock",
    selectedSlot: {
      id: "route_preconditions_slot",
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
  handleAppointmentReviewActionPreconditionsRouteRequest,
};
