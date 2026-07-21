const {
  runAppointmentReviewQueueReadinessPreview,
} = require("../../../../../src/api/secretaryAppointmentReviewQueueReadinessPreviewOrchestrator");
const routeRuntimeAdapter = require("../../../../../src/secretary/appointmentReviewRouteRuntimeAdapter");

const ROUTE_SAFETY_FIELDS = Object.freeze({
  mock: true,
  dryRun: true,
  queueReadinessPreview: true,
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
  queueMutated: false,
  queueCountChanged: false,
});

async function POST(request) {
  return handleAppointmentReviewQueueReadinessPreviewRouteRequest(request);
}

async function handleAppointmentReviewQueueReadinessPreviewRouteRequest(
  request,
  options = {}
) {
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
        "invalid_queue_readiness_payload",
        "Queue readiness preview request body must be an object."
      ),
      { status: 400 }
    );
  }

  const blockedField = findBlockedInputField(body);

  if (blockedField) {
    return Response.json(
      createRouteError(
        "client_queue_readiness_injection",
        `Request body must not provide queue readiness field ${blockedField}.`
      ),
      { status: 400 }
    );
  }

  const unsafeField = findUnsafeTrueField(body);

  if (unsafeField) {
    return Response.json(
      createRouteError(
        "unsafe_queue_readiness_field",
        `${unsafeField} must not be true for validation-only queue readiness preview.`
      ),
      { status: 400 }
    );
  }

  const unsupportedField = Object.keys(body)[0];

  if (unsupportedField) {
    return Response.json(
      createRouteError(
        "invalid_queue_readiness_payload",
        `Request body field ${unsupportedField} is not supported.`
      ),
      { status: 400 }
    );
  }

  const runtimeResult = resolveRouteRuntimeAdapter({
    createRouteRuntimeAdapter:
      options.createRouteRuntimeAdapter ||
      routeRuntimeAdapter["create" + "AppointmentReviewRouteRuntimeAdapter"],
  });

  if (!runtimeResult.accepted) {
    return Response.json(
      createRouteError(
        "internal_error",
        "Queue readiness runtime failed safely."
      ),
      { status: 500 }
    );
  }

  let previewResult;

  try {
    previewResult = await runAppointmentReviewQueueReadinessPreview(
      {
        routeRuntimeAdapter: runtimeResult.routeRuntimeAdapter,
      },
      options.contracts
    );
  } catch {
    return Response.json(
      createRouteError(
        "internal_error",
        "Queue readiness orchestration failed safely."
      ),
      { status: 500 }
    );
  }

  if (!previewResult || typeof previewResult !== "object") {
    return Response.json(
      createRouteError(
        "internal_error",
        "Queue readiness orchestration returned malformed output."
      ),
      { status: 500 }
    );
  }

  const status = previewResult.accepted === true ? 200 : 500;

  return Response.json(
    {
      ...previewResult,
      ...createSafetyFields(),
    },
    { status }
  );
}

function resolveRouteRuntimeAdapter({ createRouteRuntimeAdapter }) {
  try {
    const adapter = createRouteRuntimeAdapter({
      resolveControlledActionState: resolveRouteControlledActionState,
    });

    if (
      !adapter ||
      typeof adapter.listAppointmentReviews !== "function" ||
      typeof adapter.getControlledActionDependencies !== "function"
    ) {
      return {
        accepted: false,
      };
    }

    return {
      accepted: true,
      routeRuntimeAdapter: adapter,
    };
  } catch {
    return {
      accepted: false,
    };
  }
}

function resolveRouteControlledActionState(input) {
  return normalizeText(input?.review?.metadata?.controlledActionState) ||
    "validation_only_intent_checked";
}

async function rejectMethod() {
  return Response.json(
    createRouteError(
      "method_not_allowed",
      "Only POST queue readiness dry-run preview is allowed on this route."
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

function createRouteError(code, reason) {
  return {
    accepted: false,
    queueReadinessPassed: false,
    queueReadinessBlocked: true,
    mode: "validation_only",
    preview: "queue_decision_readiness_preview",
    code,
    reason,
    error: {
      code,
      message: reason,
    },
    summary: null,
    items: null,
    ...createSafetyFields(),
  };
}

function findBlockedInputField(value) {
  const blockedFields = new Set([
    "reviewId",
    "reviewIds",
    "reviews",
    "items",
    "queue",
    "currentState",
    "trustedCurrentState",
    "observedReviewVersion",
    "repositoryVersion",
    "actions",
    "action",
    "actionIntent",
    "paths",
    "approve",
    "reject",
    "summary",
    "validationResult",
    "stateTransitionResult",
    "validationReceipt",
    "receiptOutcome",
    "actor",
    "permissions",
    "executionPolicy",
  ]);

  return findFirstMatchingField(value, (key) => blockedFields.has(key));
}

function findUnsafeTrueField(value) {
  const unsafeFields = new Set([
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
    "queueMutated",
    "queueCountChanged",
  ]);

  return findFirstMatchingField(
    value,
    (key, nestedValue) => unsafeFields.has(key) && nestedValue === true
  );
}

function findFirstMatchingField(value, predicate, path = "") {
  if (!value || typeof value !== "object") {
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;

    if (predicate(key, nestedValue)) {
      return nextPath;
    }

    const nestedMatch = findFirstMatchingField(nestedValue, predicate, nextPath);

    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return null;
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
  handleAppointmentReviewQueueReadinessPreviewRouteRequest,
};
