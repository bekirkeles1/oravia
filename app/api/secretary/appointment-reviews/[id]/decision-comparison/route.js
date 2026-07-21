const {
  runAppointmentReviewDecisionComparison,
} = require("../../../../../../src/api/secretaryAppointmentReviewDecisionComparisonOrchestrator");
const routeRuntimeAdapter = require("../../../../../../src/secretary/appointmentReviewRouteRuntimeAdapter");

const ROUTE_SAFETY_FIELDS = Object.freeze({
  mock: true,
  dryRun: true,
  decisionComparison: true,
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
  return handleAppointmentReviewDecisionComparisonRouteRequest(request, context);
}

async function handleAppointmentReviewDecisionComparisonRouteRequest(
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
        "Appointment review id is required for decision comparison."
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
        "invalid_decision_comparison_payload",
        "Decision comparison request body must be an object."
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
        "unsafe_decision_comparison_field",
        `${unsafeField} must not be true for validation-only decision comparisons.`
      ),
      { status: 400 }
    );
  }

  const unsupportedField = Object.keys(body)[0];

  if (unsupportedField) {
    return Response.json(
      createRouteError(
        "invalid_decision_comparison_payload",
        `Request body field ${unsupportedField} is not supported.`
      ),
      { status: 400 }
    );
  }

  const runtimeResult = resolveRouteDecisionComparisonDependencies({
    createRouteRuntimeAdapter:
      options.createRouteRuntimeAdapter ||
      routeRuntimeAdapter["create" + "AppointmentReviewRouteRuntimeAdapter"],
    reviewId,
  });

  if (!runtimeResult.accepted) {
    return Response.json(
      createRouteError(
        "internal_error",
        "Decision comparison runtime failed safely."
      ),
      { status: 500 }
    );
  }

  let comparisonResult;

  try {
    comparisonResult = await runAppointmentReviewDecisionComparison(
      {
        reviewId,
        dependencies: runtimeResult.dependencies,
      },
      options.contracts
    );
  } catch {
    return Response.json(
      createRouteError(
        "internal_error",
        "Decision comparison orchestration failed safely."
      ),
      { status: 500 }
    );
  }

  if (!comparisonResult || typeof comparisonResult !== "object") {
    return Response.json(
      createRouteError(
        "internal_error",
        "Decision comparison orchestration returned malformed output."
      ),
      { status: 500 }
    );
  }

  const status = comparisonResult.code === "review_not_found" ? 404 : 200;

  return Response.json(
    {
      ...comparisonResult,
      ...createSafetyFields(),
    },
    { status }
  );
}

function resolveRouteDecisionComparisonDependencies({
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

    if (!hasDecisionComparisonDependencies(dependencies)) {
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

function hasDecisionComparisonDependencies(dependencies) {
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
      id: "route_decision_comparison_slot",
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
      "Only POST decision comparison dry-run validation is allowed on this route."
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
    comparisonPassed: false,
    comparisonBlocked: true,
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
    "actions",
    "action",
    "actionIntent",
    "paths",
    "approve",
    "reject",
    "verifiedActorContext",
    "executionPolicyContext",
    "transitionResult",
    "validationResult",
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
  handleAppointmentReviewDecisionComparisonRouteRequest,
};
