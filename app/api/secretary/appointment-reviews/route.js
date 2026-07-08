const {
  handleSecretaryAppointmentReviewQueueRequest,
} = require("../../../../src/api/secretaryAppointmentReviewQueueHandler");

async function GET(request) {
  const result = handleSecretaryAppointmentReviewQueueRequest({
    method: "GET",
    ...readQueryInput(request),
  });

  return Response.json(result.body, {
    status: result.statusCode,
  });
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
};
