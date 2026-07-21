const {
  transitionAppointmentReviewActionIntentState,
} = require("../../../../../../src/secretary/appointmentReviewActionIntentStateMachine");
const routeRuntimeAdapter = require("../../../../../../src/secretary/appointmentReviewRouteRuntimeAdapter");

const UNSAFE_SIDE_EFFECT_FIELDS = Object.freeze([
  "executionRequested",
  "actionPerformed",
  "bookingCreated",
  "calendarChecked",
  "appointmentCreated",
  "calendarEventCreated",
  "databasePersisted",
]);

const SAFETY_FIELDS = Object.freeze({
  dryRun: true,
  validationOnly: true,
  executionAvailable: false,
  actionPerformed: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
  requiresSecretaryConfirmation: true,
});

async function POST(request, context = {}) {
  return handleAppointmentReviewStateTransitionRouteRequest(request, context);
}

async function handleAppointmentReviewStateTransitionRouteRequest(
  request,
  context = {},
  options = {}
) {
  const params = await Promise.resolve(context.params || {});
  const reviewId = normalizeText(params.id);

  if (!reviewId) {
    return Response.json(
      createRouteValidationError(
        "missing_review_id",
        "Appointment review id is required for state transition dry-run."
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
        "invalid_state_transition_payload",
        "State transition dry-run payload must be an object."
      ),
      { status: 400 }
    );
  }

  const unsafeField = findUnsafeSideEffectField(body);

  if (unsafeField) {
    return Response.json(
      createRouteValidationError(
        "unsafe_side_effect_field",
        `${unsafeField} must not be true for validation-only state transition dry-runs.`
      ),
      { status: 400 }
    );
  }

  const currentState = normalizeText(body.currentState);
  const event = normalizeText(body.event);

  if (!currentState) {
    return Response.json(
      createRouteValidationError(
        "missing_current_state",
        "currentState is required for state transition dry-run."
      ),
      { status: 400 }
    );
  }

  if (!event) {
    return Response.json(
      createRouteValidationError(
        "missing_event",
        "event is required for state transition dry-run."
      ),
      { status: 400 }
    );
  }

  const trustedContextResult = await resolveRouteTrustedReviewContext({
    createRouteRuntimeAdapter:
      options.createRouteRuntimeAdapter ||
      routeRuntimeAdapter["create" + "AppointmentReviewRouteRuntimeAdapter"],
    reviewId,
    currentState,
  });

  if (!trustedContextResult.accepted) {
    return Response.json(
      createRouteValidationError(
        "internal_error",
        "State transition dry-run runtime failed safely."
      ),
      { status: 500 }
    );
  }

  if (!trustedContextResult.reviewContext) {
    return Response.json(
      createRouteValidationError(
        "review_not_found",
        "Appointment review item was not found."
      ),
      { status: 404 }
    );
  }

  const transition = transitionAppointmentReviewActionIntentState({
    currentState: trustedContextResult.reviewContext.currentState,
    event,
  });

  const postTransitionContextResult =
    await trustedContextResult.resolveReviewContextSafely();

  if (
    !postTransitionContextResult.accepted ||
    !postTransitionContextResult.reviewContext ||
    postTransitionContextResult.reviewContext.currentState !==
      trustedContextResult.reviewContext.currentState ||
    postTransitionContextResult.reviewContext.observedReviewVersion !==
      trustedContextResult.reviewContext.observedReviewVersion
  ) {
    return Response.json(
      createRouteValidationError(
        "internal_error",
        "State transition dry-run runtime failed safely."
      ),
      { status: 500 }
    );
  }

  return Response.json(
    {
      reviewId,
      ...transition,
      ...createSafetyFields(),
    },
    { status: 200 }
  );
}

async function resolveRouteTrustedReviewContext({
  createRouteRuntimeAdapter,
  reviewId,
  currentState,
}) {
  try {
    const routeRuntime = createRouteRuntimeAdapter({
      resolveControlledActionState: resolveRouteControlledActionState,
      initialReviews: [createRouteReviewSeed(reviewId, currentState)],
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

    if (
      !dependencies ||
      typeof dependencies !== "object" ||
      Array.isArray(dependencies) ||
      typeof dependencies.resolveAppointmentReviewContext !== "function"
    ) {
      return {
        accepted: false,
      };
    }

    async function resolveReviewContextSafely() {
      try {
        const reviewContext = await dependencies.resolveAppointmentReviewContext({
          reviewId,
        });

        if (reviewContext === null) {
          return {
            accepted: true,
            reviewContext: null,
          };
        }

        return {
          accepted: true,
          reviewContext: normalizeTrustedReviewContext(reviewContext, reviewId),
        };
      } catch (error) {
        if (error && error.code === "appointment_review_snapshot_not_found") {
          return {
            accepted: true,
            reviewContext: null,
          };
        }

        return {
          accepted: false,
        };
      }
    }

    const contextResult = await resolveReviewContextSafely();

    return {
      accepted: contextResult.accepted,
      reviewContext: contextResult.reviewContext,
      resolveReviewContextSafely,
    };
  } catch (error) {
    if (error && error.code === "appointment_review_snapshot_not_found") {
      return {
        accepted: true,
        reviewContext: null,
      };
    }

    return {
      accepted: false,
    };
  }
}

function normalizeTrustedReviewContext(reviewContext, reviewId) {
  if (
    !reviewContext ||
    typeof reviewContext !== "object" ||
    Array.isArray(reviewContext)
  ) {
    throw new Error("invalid_review_context");
  }

  const trustedReviewId = normalizeText(reviewContext.reviewId);
  const currentState = normalizeText(reviewContext.currentState);

  if (
    trustedReviewId !== reviewId ||
    !currentState ||
    !Number.isSafeInteger(reviewContext.observedReviewVersion) ||
    reviewContext.observedReviewVersion < 1
  ) {
    throw new Error("invalid_review_context");
  }

  return {
    reviewId: trustedReviewId,
    currentState,
    observedReviewVersion: reviewContext.observedReviewVersion,
  };
}

function createRouteReviewSeed(reviewId, currentState) {
  return {
    id: reviewId,
    status: "pending_secretary_review",
    source: "mock",
    selectedSlot: {
      id: "route_state_transition_slot",
      source: "mock",
    },
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
    metadata: {
      controlledActionState: currentState,
    },
  };
}

function resolveRouteControlledActionState(input) {
  return normalizeText(input?.review?.metadata?.controlledActionState);
}

async function rejectMethod() {
  return Response.json(
    createRouteValidationError(
      "method_not_allowed",
      "Only POST state transition dry-run validation is allowed on this route."
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

function findUnsafeSideEffectField(payload) {
  return UNSAFE_SIDE_EFFECT_FIELDS.find((fieldName) => payload[fieldName] === true);
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
  handleAppointmentReviewStateTransitionRouteRequest,
};
