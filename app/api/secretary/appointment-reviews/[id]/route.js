const {
  handleSecretaryAppointmentReviewQueueRequest,
} = require("../../../../../src/api/secretaryAppointmentReviewQueueHandler");

async function GET(request, context = {}) {
  const params = await Promise.resolve(context.params || {});
  const result = handleSecretaryAppointmentReviewQueueRequest({
    method: "GET",
    id: params.id || readQueryId(request),
    requireReviewId: true,
  });

  return Response.json(result.body, {
    status: result.statusCode,
  });
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

module.exports = {
  GET,
  POST: rejectWriteMethod,
  PUT: rejectWriteMethod,
  PATCH: rejectWriteMethod,
  DELETE: rejectWriteMethod,
};
