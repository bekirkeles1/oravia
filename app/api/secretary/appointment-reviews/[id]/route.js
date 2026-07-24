const {
  createSecretaryAppointmentReviewDetailInternalErrorResponse,
  handleSecretaryAppointmentReviewQueueRequest,
} = require("../../../../../src/api/secretaryAppointmentReviewQueueHandler");
const {
  getActiveAppointmentReviewRouteRuntimeAdapter,
} = require("../../../../../src/secretary/appointmentReviewRouteRuntimeCompositionRoot");
const {
  AUTH_PERMISSIONS,
} = require("../../../../../src/auth/authRoles");
const { resolveRouteActor } = require("../../../../../src/auth/routeAuth");

async function GET(request, context = {}) {
  return handleAppointmentReviewDetailRouteRequest(request, context);
}

async function handleAppointmentReviewDetailRouteRequest(
  request,
  context = {},
  options = {}
) {
  const authResult = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.READ_INTERNAL,
  });

  if (!authResult.accepted) {
    return Response.json(authResult.body, { status: authResult.status });
  }

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
    getActiveAppointmentReviewRouteRuntimeAdapter;

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

function resolveRouteControlledActionState(input) {
  return String(input?.review?.metadata?.controlledActionState || "").trim();
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
