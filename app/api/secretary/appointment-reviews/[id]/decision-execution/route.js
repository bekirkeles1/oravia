const {
  EXECUTION_CONFIRMATION,
} = require("../../../../../../src/api/secretaryAppointmentReviewDecisionExecutionService");
const {
  SUPPORTED_DECISION_ACTIONS,
} = require("../../../../../../src/api/secretaryAppointmentReviewDecisionPreviewOrchestrator");
const routeRuntimeAdapter = require("../../../../../../src/secretary/appointmentReviewRouteRuntimeAdapter");

const ROUTE_SAFETY_FIELDS = Object.freeze({
  mock: true,
  dryRun: false,
  decisionExecution: true,
  validationOnly: false,
  controlledHandlingOnly: true,
  executionMode: "in_memory_demo",
  storage: "in_memory",
  durablePersistence: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  calendarWritten: false,
  messageSent: false,
  emailSent: false,
  whatsappSent: false,
  databasePersisted: false,
  externalCallPerformed: false,
});

const BODY_ALLOWED_FIELDS = Object.freeze([
  "action",
  "expectedReviewVersion",
  "idempotencyKey",
  "confirmation",
]);

const BODY_TRUSTED_FIELDS = Object.freeze([
  "nextState",
  "currentState",
  "trustedCurrentState",
  "observedReviewVersion",
  "repositoryVersion",
  "validationResult",
  "comparisonResult",
  "guidanceResult",
  "readinessResult",
  "handoffResult",
  "receipt",
  "actor",
  "actorId",
  "actorRole",
  "policyResult",
  "executionPolicy",
  "checkedItems",
  "guidedSession",
  "followUpFocusBoard",
  "plainTextBrief",
]);

async function POST(request, context = {}) {
  return handleAppointmentReviewDecisionExecutionRouteRequest(request, context);
}

async function handleAppointmentReviewDecisionExecutionRouteRequest(
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
        "Appointment review id is required for decision execution."
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
        "invalid_decision_execution_payload",
        "Decision execution request body must be an object."
      ),
      400
    );
  }

  const bodyIssue = validateBody(body);

  if (bodyIssue) {
    return routeJson(createRouteError(bodyIssue.code, bodyIssue.reason), 400);
  }

  const runtimeResult = resolveRouteDecisionExecutionRuntime({
    createRouteRuntimeAdapter:
      options.createRouteRuntimeAdapter ||
      routeRuntimeAdapter["create" + "AppointmentReviewRouteRuntimeAdapter"],
    reviewId,
  });

  if (!runtimeResult.accepted) {
    return routeJson(
      createRouteError(
        "internal_error",
        "Decision execution runtime failed safely."
      ),
      500
    );
  }

  let executionResult;

  try {
    executionResult = await runtimeResult.adapter.applyAppointmentReviewDecision({
      reviewId,
      action: normalizeText(body.action),
      expectedReviewVersion: body.expectedReviewVersion,
      idempotencyKey: normalizeText(body.idempotencyKey),
      confirmation: normalizeText(body.confirmation),
    });
  } catch {
    return routeJson(
      createRouteError(
        "internal_error",
        "Decision execution application failed safely."
      ),
      500
    );
  }

  if (!executionResult || typeof executionResult !== "object") {
    return routeJson(
      createRouteError(
        "internal_error",
        "Decision execution application returned malformed output."
      ),
      500
    );
  }

  const status = resolveStatus(executionResult);

  return routeJson(
    {
      ...executionResult,
      ...createSafetyFields(),
    },
    status
  );
}

function validateBody(body) {
  const trustedField = findField(body, BODY_TRUSTED_FIELDS);

  if (trustedField) {
    return {
      code: "client_trusted_context_injection",
      reason: `Request body must not provide trusted context field ${trustedField}.`,
    };
  }

  const unsupportedField = Object.keys(body).find(
    (fieldName) => !BODY_ALLOWED_FIELDS.includes(fieldName)
  );

  if (unsupportedField) {
    return {
      code: "invalid_decision_execution_payload",
      reason: `Request body field ${unsupportedField} is not supported.`,
    };
  }

  const action = normalizeText(body.action);

  if (!SUPPORTED_DECISION_ACTIONS.includes(action)) {
    return {
      code: action ? "unsupported_decision_action" : "missing_decision_action",
      reason: "Decision execution action must be approve or reject.",
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

  if (normalizeText(body.confirmation) !== EXECUTION_CONFIRMATION) {
    return {
      code: "missing_execution_confirmation",
      reason: "Explicit in-memory execution confirmation is required.",
    };
  }

  return null;
}

function resolveRouteDecisionExecutionRuntime({
  createRouteRuntimeAdapter,
  reviewId,
}) {
  try {
    const adapter = createRouteRuntimeAdapter({
      resolveControlledActionState: resolveRouteControlledActionState,
      initialReviews: [createRouteReviewSeed(reviewId)],
    });

    if (
      !adapter ||
      typeof adapter.applyAppointmentReviewDecision !== "function"
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

function createRouteReviewSeed(reviewId) {
  return {
    id: reviewId,
    status: "pending_secretary_review",
    source: "mock",
    selectedSlot: {
      id: "route_decision_execution_slot",
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
      "Only POST in-memory decision execution is allowed on this route."
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
    applied: false,
    matchingReplay: false,
    replayedResultOnly: false,
    code,
    reason,
    reviewStateChanged: false,
    repositoryVersionChanged: false,
    receipt: null,
    review: null,
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
  handleAppointmentReviewDecisionExecutionRouteRequest,
};
