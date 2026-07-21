const {
  createSecretaryAppointmentReviewQueueInternalErrorResponse,
  handleSecretaryAppointmentReviewQueueRequest,
} = require("../../../../src/api/secretaryAppointmentReviewQueueHandler");
const {
  createAppointmentReviewRouteRuntimeAdapter,
} = require("../../../../src/secretary/appointmentReviewRouteRuntimeAdapter");

async function GET(request) {
  return handleAppointmentReviewQueueCollectionRouteRequest(request);
}

async function handleAppointmentReviewQueueCollectionRouteRequest(
  request,
  options = {}
) {
  const listResult = resolveAppointmentReviewListForRoute(options);

  if (!listResult.accepted) {
    const result = createSecretaryAppointmentReviewQueueInternalErrorResponse();

    return Response.json(result.body, {
      status: result.statusCode,
    });
  }

  const result = handleSecretaryAppointmentReviewQueueRequest(
    {
      method: "GET",
      ...readQueryInput(request),
    },
    {
      appointmentReviews: listResult.reviews,
    }
  );

  return Response.json(result.body, {
    status: result.statusCode,
  });
}

function resolveAppointmentReviewListForRoute(options) {
  const createRouteRuntimeAdapter =
    options.createRouteRuntimeAdapter ||
    createAppointmentReviewRouteRuntimeAdapter;

  try {
    const routeRuntime = createRouteRuntimeAdapter({
      resolveControlledActionState: resolveRouteControlledActionState,
    });

    if (
      !routeRuntime ||
      typeof routeRuntime.listAppointmentReviews !== "function"
    ) {
      return {
        accepted: false,
      };
    }

    const reviews = routeRuntime.listAppointmentReviews();

    if (!Array.isArray(reviews)) {
      return {
        accepted: false,
      };
    }

    return {
      accepted: true,
      reviews,
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
  });

  return Response.json(result.body, {
    status: result.statusCode,
  });
}

function readQueryInput(request) {
  if (!request?.url) {
    return {};
  }

  const url = new URL(request.url);

  return {
    id: url.searchParams.get("id") || url.searchParams.get("reviewId") || null,
  };
}

module.exports = {
  GET,
  POST: rejectWriteMethod,
  PUT: rejectWriteMethod,
  PATCH: rejectWriteMethod,
  DELETE: rejectWriteMethod,
  handleAppointmentReviewQueueCollectionRouteRequest,
};
