const {
  validateAppointmentReviewActionIntent,
} = require("../../../../../../src/secretary/appointmentReviewActionIntentContract");

async function POST(request, context = {}) {
  const params = await Promise.resolve(context.params || {});
  const bodyResult = await readJsonBody(request);

  if (bodyResult.status === "error") {
    return Response.json(createRouteValidationError("invalid_json"), {
      status: 400,
    });
  }

  const validation = validateAppointmentReviewActionIntent({
    ...(bodyResult.body || {}),
    reviewId: params.id,
  });

  return Response.json(validation, {
    status: validation.status === "ok" ? 200 : 400,
  });
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
  return {
    status: "error",
    error: {
      code,
      message:
        code === "method_not_allowed"
          ? "Only POST action intent validation is allowed on this mock route."
          : "Request body must be valid JSON.",
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

module.exports = {
  GET: rejectMethod,
  POST,
  PUT: rejectMethod,
  PATCH: rejectMethod,
  DELETE: rejectMethod,
};
