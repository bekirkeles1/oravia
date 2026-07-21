const {
  runAppointmentReviewDecisionPreview,
  SUPPORTED_DECISION_ACTIONS,
} = require("../../../../../../src/api/secretaryAppointmentReviewDecisionPreviewOrchestrator");
const routeRuntimeAdapter = require("../../../../../../src/secretary/appointmentReviewRouteRuntimeAdapter");

const ROUTE_SAFETY_FIELDS = Object.freeze({
  mock: true,
  dryRun: true,
  decisionPreview: true,
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
  reviewMutated: false,
  reviewStateChanged: false,
  repositoryVersionChanged: false,
});

async function POST(request, context = {}) {
  return handleAppointmentReviewDecisionPreviewRouteRequest(request, context);
}

async function handleAppointmentReviewDecisionPreviewRouteRequest(
  request,
  context = {},
  options = {}
) {
  const params = await Promise.resolve(context.params || {});
  const reviewId = normalizeText(params.id);

  if (!reviewId) {
    return Response.json(
      createRouteError(
        "missing_review_id",
        "Appointment review id is required for decision preview."
      ),
      { status: 400 }
    );
  }

  const bodyResult = await readJsonBody(request);

  if (bodyResult.status === "error") {
    return Response.json(
      createRouteError("invalid_json", "Request body must be valid JSON."),
      { status: 400 }
    );
  }

  const body = bodyResult.body || {};

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      createRouteError(
        "invalid_decision_preview_payload",
        "Decision preview request body must be an object."
      ),
      { status: 400 }
    );
  }

  const action = normalizeText(body.action);

  if (!SUPPORTED_DECISION_ACTIONS.includes(action)) {
    return Response.json(
      createRouteError(
        action ? "unsupported_decision_action" : "missing_decision_action",
        "Decision preview action must be approve or reject.",
        {
          action: action || null,
          blockingStage: "action_intent",
        }
      ),
      { status: 400 }
    );
  }

  const trustedField = findTrustedContextField(body);

  if (trustedField) {
    return Response.json(
      createRouteError(
        "client_trusted_context_injection",
        `Request body must not provide trusted context field ${trustedField}.`
      ),
      { status: 400 }
    );
  }

  const unsafeField = findUnsafeTrueField(body);

  if (unsafeField) {
    return Response.json(
      createRouteError(
        "unsafe_decision_preview_field",
        `${unsafeField} must not be true for validation-only decision previews.`
      ),
      { status: 400 }
    );
  }

  const unsupportedField = Object.keys(body).find(
    (fieldName) => !["action"].includes(fieldName)
  );

  if (unsupportedField) {
    return Response.json(
      createRouteError(
        "invalid_decision_preview_payload",
        `Request body field ${unsupportedField} is not supported.`
      ),
      { status: 400 }
    );
  }

  const runtimeResult = resolveRouteDecisionPreviewDependencies({
    createRouteRuntimeAdapter:
      options.createRouteRuntimeAdapter ||
      routeRuntimeAdapter["create" + "AppointmentReviewRouteRuntimeAdapter"],
    reviewId,
  });

  if (!runtimeResult.accepted) {
    return Response.json(
      createRouteError(
        "internal_error",
        "Decision preview runtime failed safely."
      ),
      { status: 500 }
    );
  }

  let previewResult;

  try {
    previewResult = await runAppointmentReviewDecisionPreview(
      {
        reviewId,
        action,
        dependencies: runtimeResult.dependencies,
      },
      options.contracts
    );
  } catch {
    return Response.json(
      createRouteError(
        "internal_error",
        "Decision preview orchestration failed safely."
      ),
      { status: 500 }
    );
  }

  if (!previewResult || typeof previewResult !== "object") {
    return Response.json(
      createRouteError(
        "internal_error",
        "Decision preview orchestration returned malformed output."
      ),
      { status: 500 }
    );
  }

  const status = previewResult.code === "review_not_found" ? 404 : 200;

  return Response.json(
    {
      ...previewResult,
      ...createSafetyFields(),
    },
    { status }
  );
}

function resolveRouteDecisionPreviewDependencies({
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
      typeof routeRuntime.getControlledActionDependencies !== "function"
    ) {
      return {
        accepted: false,
      };
    }

    const dependencies = routeRuntime.getControlledActionDependencies();

    if (!hasDecisionPreviewDependencies(dependencies)) {
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

function hasDecisionPreviewDependencies(dependencies) {
  return Boolean(
    dependencies &&
      typeof dependencies === "object" &&
      !Array.isArray(dependencies) &&
      typeof dependencies.resolveAppointmentReviewContext === "function" &&
      typeof dependencies.resolveVerifiedActorContext === "function" &&
      typeof dependencies.resolveIdempotencyContext === "function" &&
      typeof dependencies.resolveExecutionPolicyContext === "function"
  );
}

function createRouteReviewSeed(reviewId) {
  return {
    id: reviewId,
    status: "pending_secretary_review",
    source: "mock",
    selectedSlot: {
      id: "route_decision_preview_slot",
      source: "mock",
    },
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
    metadata: {
      controlledActionState: "validation_only_intent_checked",
    },
  };
}

function resolveRouteControlledActionState(input) {
  return normalizeText(input?.review?.metadata?.controlledActionState);
}

async function rejectMethod() {
  return Response.json(
    createRouteError(
      "method_not_allowed",
      "Only POST decision preview dry-run validation is allowed on this route."
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

function createRouteError(code, reason, extra = {}) {
  return {
    accepted: false,
    previewPassed: false,
    previewBlocked: true,
    code,
    reason,
    error: {
      code,
      message: reason,
    },
    ...extra,
    ...createSafetyFields(),
  };
}

function createSafetyFields() {
  return { ...ROUTE_SAFETY_FIELDS };
}

function findTrustedContextField(value) {
  const trustedFields = [
    "reviewId",
    "currentState",
    "observedReviewVersion",
    "repositoryVersion",
    "verifiedActorContext",
    "executionPolicyContext",
    "transitionResult",
    "validationReceipt",
    "receiptResult",
  ];

  return Object.keys(value).find((fieldName) => trustedFields.includes(fieldName));
}

function findUnsafeTrueField(value) {
  const unsafeFields = [
    "executionEnabled",
    "executorAvailable",
    "executionAvailable",
    "executionRequested",
    "actionPerformed",
    "commandDispatched",
    "commandPersisted",
    "receiptPersisted",
    "bookingCreated",
    "calendarChecked",
    "appointmentCreated",
    "calendarEventCreated",
    "databasePersisted",
    "reviewMutated",
    "reviewStateChanged",
    "repositoryVersionChanged",
  ];

  return unsafeFields.find((fieldName) => value[fieldName] === true);
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
  handleAppointmentReviewDecisionPreviewRouteRequest,
};
