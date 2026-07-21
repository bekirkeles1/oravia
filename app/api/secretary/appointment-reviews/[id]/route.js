const {
  createSecretaryAppointmentReviewDetailInternalErrorResponse,
  handleSecretaryAppointmentReviewQueueRequest,
} = require("../../../../../src/api/secretaryAppointmentReviewQueueHandler");
const {
  createAppointmentReviewRouteRuntimeAdapter,
} = require("../../../../../src/secretary/appointmentReviewRouteRuntimeAdapter");

async function GET(request, context = {}) {
  return handleAppointmentReviewDetailRouteRequest(request, context);
}

async function handleAppointmentReviewDetailRouteRequest(
  request,
  context = {},
  options = {}
) {
  const params = await Promise.resolve(context.params || {});
  const reviewId = normalizeRouteReviewId(params.id || readQueryId(request));

  if (!reviewId) {
    const result = handleSecretaryAppointmentReviewQueueRequest({
      method: "GET",
      id: reviewId,
      requireReviewId: true,
    });

    return Response.json(result.body, {
      status: result.statusCode,
    });
  }

  const detailResult = resolveAppointmentReviewDetailForRoute(
    reviewId,
    options
  );

  if (!detailResult.accepted) {
    const result = createSecretaryAppointmentReviewDetailInternalErrorResponse();

    return Response.json(result.body, {
      status: result.statusCode,
    });
  }

  const result = handleSecretaryAppointmentReviewQueueRequest(
    {
      method: "GET",
      id: reviewId,
      requireReviewId: true,
    },
    {
      appointmentReview: detailResult.review,
    }
  );

  return Response.json(result.body, {
    status: result.statusCode,
  });
}

function resolveAppointmentReviewDetailForRoute(reviewId, options) {
  const createRouteRuntimeAdapter =
    options.createRouteRuntimeAdapter ||
    createAppointmentReviewRouteRuntimeAdapter;

  try {
    const routeRuntime = createRouteRuntimeAdapter({
      resolveControlledActionState: resolveRouteControlledActionState,
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

function resolveRouteControlledActionState() {
  return "validation_only_intent_checked";
}

async function rejectWriteMethod(request) {
  const result = handleSecretaryAppointmentReviewQueueRequest({
    method: request?.method || "POST",
    requireReviewId: true,
  });

  return Response.json(result.body, {
    status: result.statusCode,
  });
}

function readQueryId(request) {
  if (!request?.url) {
    return null;
  }

  return new URL(request.url).searchParams.get("id");
}

function normalizeRouteReviewId(value) {
  return String(value || "").trim();
}

module.exports = {
  GET,
  POST: rejectWriteMethod,
  PUT: rejectWriteMethod,
  PATCH: rejectWriteMethod,
  DELETE: rejectWriteMethod,
  handleAppointmentReviewDetailRouteRequest,
};
