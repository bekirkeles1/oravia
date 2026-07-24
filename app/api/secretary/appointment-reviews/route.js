const {
  createSecretaryAppointmentReviewQueueInternalErrorResponse,
  handleSecretaryAppointmentReviewQueueRequest,
} = require("../../../../src/api/secretaryAppointmentReviewQueueHandler");
const {
  getActiveAppointmentReviewRouteRuntimeAdapter,
} = require("../../../../src/secretary/appointmentReviewRouteRuntimeCompositionRoot");
const {
  AUTH_PERMISSIONS,
} = require("../../../../src/auth/authRoles");
const { resolveRouteActor } = require("../../../../src/auth/routeAuth");

async function GET(request) {
  return handleAppointmentReviewQueueCollectionRouteRequest(request);
}

async function handleAppointmentReviewQueueCollectionRouteRequest(
  request,
  options = {}
) {
  const authResult = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.READ_INTERNAL,
  });

  if (!authResult.accepted) {
    return Response.json(authResult.body, { status: authResult.status });
  }

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
    getActiveAppointmentReviewRouteRuntimeAdapter;

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

function resolveRouteControlledActionState(input) {
  return String(input?.review?.metadata?.controlledActionState || "").trim();
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
