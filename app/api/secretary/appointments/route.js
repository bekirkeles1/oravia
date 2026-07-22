const {
  getActiveAppointmentReviewRouteRuntimeAdapter,
} = require("../../../../src/secretary/appointmentReviewRouteRuntimeCompositionRoot");

async function GET(request, options = {}) {
  const runtimeResult = resolveRouteRuntime(options);

  if (!runtimeResult.accepted) {
    return Response.json(createError("internal_error"), { status: 500 });
  }

  return Response.json({
    status: "ok",
    source: "mock",
    storage: "in_memory",
    persistence: "not_persisted",
    durablePersistence: false,
    calendarWritten: false,
    messageSent: false,
    databasePersisted: false,
    count: runtimeResult.appointments.length,
    appointments: runtimeResult.appointments,
  });
}

function resolveRouteRuntime(options = {}) {
  const createRouteRuntimeAdapter =
    options.createRouteRuntimeAdapter ||
    getActiveAppointmentReviewRouteRuntimeAdapter;

  try {
    const adapter = createRouteRuntimeAdapter({});

    if (!adapter || typeof adapter.listCreatedAppointments !== "function") {
      return {
        accepted: false,
      };
    }

    const appointments = adapter.listCreatedAppointments();

    if (!Array.isArray(appointments)) {
      return {
        accepted: false,
      };
    }

    return {
      accepted: true,
      appointments,
    };
  } catch {
    return {
      accepted: false,
    };
  }
}

function createError(code) {
  return {
    status: "error",
    code,
    storage: "in_memory",
    persistence: "not_persisted",
    durablePersistence: false,
    calendarWritten: false,
    messageSent: false,
    databasePersisted: false,
  };
}

async function rejectMethod() {
  return Response.json(createError("method_not_allowed"), { status: 405 });
}

module.exports = {
  DELETE: rejectMethod,
  GET,
  PATCH: rejectMethod,
  POST: rejectMethod,
  PUT: rejectMethod,
};
