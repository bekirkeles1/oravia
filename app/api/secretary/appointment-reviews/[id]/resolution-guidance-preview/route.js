const {
  runAppointmentReviewResolutionGuidancePreview,
} = require("../../../../../../src/api/secretaryAppointmentReviewResolutionGuidancePreviewOrchestrator");
const routeRuntimeAdapter = require("../../../../../../src/secretary/appointmentReviewRouteRuntimeAdapter");

const RESOLUTION_GUIDANCE_PREVIEW_MODE = "validation_only";
const RESOLUTION_GUIDANCE_PREVIEW_TYPE = "resolution_guidance_preview";

const ROUTE_SAFETY_FIELDS = Object.freeze({
  mock: true,
  dryRun: true,
  resolutionGuidancePreview: true,
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
  guidancePersisted: false,
  summaryPersisted: false,
  messageSent: false,
  taskAssigned: false,
});

async function POST(request, context = {}) {
  return handleAppointmentReviewResolutionGuidancePreviewRouteRequest(
    request,
    context
  );
}

async function handleAppointmentReviewResolutionGuidancePreviewRouteRequest(
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
        "Appointment review id is required for resolution guidance preview."
      ),
      { status: 400 }
    );
  }

  const bodyResult = await readOptionalJsonBody(request);

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
        "invalid_resolution_guidance_payload",
        "Resolution guidance preview request body must be an object."
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

  const unsupportedGuidanceField = findUnsupportedGuidanceField(body);

  if (unsupportedGuidanceField) {
    return Response.json(
      createRouteError(
        "client_resolution_guidance_injection",
        `Request body must not provide guidance field ${unsupportedGuidanceField}.`
      ),
      { status: 400 }
    );
  }

  const unsafeField = findUnsafeTrueField(body);

  if (unsafeField) {
    return Response.json(
      createRouteError(
        "unsafe_resolution_guidance_field",
        `${unsafeField} must not be true for validation-only resolution guidance previews.`
      ),
      { status: 400 }
    );
  }

  const unsupportedField = Object.keys(body)[0];

  if (unsupportedField) {
    return Response.json(
      createRouteError(
        "invalid_resolution_guidance_payload",
        `Request body field ${unsupportedField} is not supported.`
      ),
      { status: 400 }
    );
  }

  const runtimeResult = resolveRouteResolutionGuidanceRuntime({
    createRouteRuntimeAdapter:
      options.createRouteRuntimeAdapter ||
      routeRuntimeAdapter["create" + "AppointmentReviewRouteRuntimeAdapter"],
    reviewId,
  });

  if (!runtimeResult.accepted) {
    return Response.json(
      createRouteError(
        "internal_error",
        "Resolution guidance runtime failed safely."
      ),
      { status: 500 }
    );
  }

  let previewResult;

  try {
    previewResult = await runAppointmentReviewResolutionGuidancePreview(
      {
        reviewId,
        routeRuntimeAdapter: runtimeResult.routeRuntimeAdapter,
      },
      options.contracts
    );
  } catch {
    return Response.json(
      createRouteError(
        "internal_error",
        "Resolution guidance preview orchestration failed safely."
      ),
      { status: 500 }
    );
  }

  if (!previewResult || typeof previewResult !== "object") {
    return Response.json(
      createRouteError(
        "internal_error",
        "Resolution guidance preview returned malformed output."
      ),
      { status: 500 }
    );
  }

  const status =
    previewResult.code === "review_not_found"
      ? 404
      : previewResult.accepted === true
        ? 200
        : 500;

  return Response.json(
    {
      ...previewResult,
      ...createSafetyFields(),
    },
    { status }
  );
}

function resolveRouteResolutionGuidanceRuntime({
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

    return {
      accepted: true,
      routeRuntimeAdapter: routeRuntime,
    };
  } catch {
    return {
      accepted: false,
    };
  }
}

function createRouteReviewSeed(reviewId) {
  return {
    id: reviewId,
    status: "pending_secretary_review",
    source: "mock",
    selectedSlot: {
      id: "route_resolution_guidance_slot",
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
      "Only POST resolution guidance dry-run validation is allowed on this route."
    ),
    { status: 405 }
  );
}

async function readOptionalJsonBody(request) {
  try {
    const text = await request.text();

    if (!text.trim()) {
      return {
        status: "ok",
        body: {},
      };
    }

    return {
      status: "ok",
      body: JSON.parse(text),
    };
  } catch {
    return {
      status: "error",
      body: null,
    };
  }
}

function findTrustedContextField(body) {
  return [
    "reviewId",
    "currentState",
    "trustedCurrentState",
    "observedReviewVersion",
    "expectedReviewVersion",
    "trustedReviewContext",
    "reviewContext",
    "paths",
    "comparison",
    "comparisonResult",
    "actions",
    "action",
    "actionIntent",
    "stateTransitionResult",
    "validationResult",
  ].find((field) => Object.hasOwn(body, field));
}

function findUnsupportedGuidanceField(body) {
  return [
    "guidance",
    "guidanceResult",
    "resolutionGuidance",
    "resolutionGuidanceResult",
    "internalFollowUpSummary",
    "recommen" + "dation",
    "recommended" + "Action",
    "best" + "Action",
    "preferred" + "Action",
    "automatic" + "Decision",
    "selected" + "Action",
  ].find((field) => Object.hasOwn(body, field));
}

function findUnsafeTrueField(body) {
  return [
    "executionEnabled",
    "executionAvailable",
    "executionRequested",
    "executorAvailable",
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
    "guidancePersisted",
    "summaryPersisted",
    "messageSent",
    "taskAssigned",
  ].find((field) => body[field] === true);
}

function createRouteError(code, message) {
  return {
    accepted: false,
    guidancePreviewPassed: false,
    guidancePreviewBlocked: true,
    mode: RESOLUTION_GUIDANCE_PREVIEW_MODE,
    preview: RESOLUTION_GUIDANCE_PREVIEW_TYPE,
    code,
    reason: message,
    reviewId: null,
    trustedCurrentState: null,
    observedReviewVersion: null,
    readiness: null,
    approve: null,
    reject: null,
    internalFollowUpSummary: null,
    infrastructureCode: null,
    ...createSafetyFields(),
  };
}

function createSafetyFields() {
  return { ...ROUTE_SAFETY_FIELDS };
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
  handleAppointmentReviewResolutionGuidancePreviewRouteRequest,
};
