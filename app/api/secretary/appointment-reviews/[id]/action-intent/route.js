const {
  validateAppointmentReviewActionIntent,
} = require("../../../../../../src/secretary/appointmentReviewActionIntentContract");
const routeRuntimeAdapter = require("../../../../../../src/secretary/appointmentReviewRouteRuntimeAdapter");

async function POST(request, context = {}) {
  return handleAppointmentReviewActionIntentRouteRequest(request, context);
}

async function handleAppointmentReviewActionIntentRouteRequest(
  request,
  context = {},
  options = {}
) {
  const params = await Promise.resolve(context.params || {});
  const bodyResult = await readJsonBody(request);

  if (bodyResult.status === "error") {
    return Response.json(createRouteValidationError("invalid_json"), {
      status: 400,
    });
  }

  const payloadValidation = validateAppointmentReviewActionIntent({
    ...(bodyResult.body || {}),
    reviewId: params.id,
  });

  if (payloadValidation.status !== "ok") {
    return Response.json(payloadValidation, {
      status: 400,
    });
  }

  const reviewResult = resolveRouteAppointmentReview(
    payloadValidation.reviewId,
    options
  );

  if (!reviewResult.accepted) {
    return Response.json(createRouteValidationError("internal_error"), {
      status: 500,
    });
  }

  if (!reviewResult.review) {
    return Response.json(createRouteValidationError("review_not_found"), {
      status: 404,
    });
  }

  const validation = validateAppointmentReviewActionIntent({
    ...(bodyResult.body || {}),
    reviewId: normalizeText(reviewResult.review.id) || payloadValidation.reviewId,
  });

  return Response.json(validation, {
    status: validation.status === "ok" ? 200 : 400,
  });
}

function resolveRouteAppointmentReview(reviewId, options) {
  const createRouteRuntimeAdapter =
    options.createRouteRuntimeAdapter ||
    routeRuntimeAdapter["create" + "AppointmentReviewRouteRuntimeAdapter"];

  try {
    const routeRuntime = createRouteRuntimeAdapter({
      resolveControlledActionState: resolveRouteControlledActionState,
      initialReviews: [createRouteReviewSeed(reviewId)],
    });

    if (
      !routeRuntime ||
      typeof routeRuntime.getAppointmentReviewById !== "function"
    ) {
      return {
        accepted: false,
      };
    }

    return {
      accepted: true,
      review: routeRuntime.getAppointmentReviewById(reviewId),
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
      id: "route_action_intent_slot",
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
  return Response.json(createRouteValidationError("method_not_allowed"), {
    status: 405,
  });
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

function createRouteValidationError(code) {
  const messages = {
    invalid_json: "Request body must be valid JSON.",
    internal_error: "Action intent runtime failed safely.",
    method_not_allowed:
      "Only POST action intent validation is allowed on this mock route.",
    review_not_found: "Appointment review item was not found.",
  };

  return {
    status: "error",
    error: {
      code,
      message: messages[code] || "Request body must be valid JSON.",
    },
    validationOnly: true,
    actionPerformed: false,
    bookingCreated: false,
    calendarChecked: false,
    databasePersisted: false,
    appointmentCreated: false,
    calendarEventCreated: false,
    requiresSecretaryConfirmation: true,
  };
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
  handleAppointmentReviewActionIntentRouteRequest,
};
