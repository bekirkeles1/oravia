const { AUTH_PERMISSIONS } = require("../auth/authRoles");
const { resolveRouteActor, validateMutationOrigin } = require("../auth/routeAuth");
const {
  getActiveAppointmentReviewRouteRuntimeAdapter,
} = require("../secretary/appointmentReviewRouteRuntimeCompositionRoot");
const {
  attachCorrelationHeader,
  resolveRequestCorrelationId,
} = require("../ops/requestCorrelation");

async function handleReminderStateGet(request) {
  const correlationId = resolveRequestCorrelationId(request);
  const auth = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.READ_OPERATIONAL,
  });
  if (!auth.accepted) return respond(auth.body, auth.status, correlationId);

  try {
    const runtime = getActiveAppointmentReviewRouteRuntimeAdapter();
    return respond({ ...runtime.getReminderState({ limit: 50 }), correlationId }, 200, correlationId);
  } catch {
    return respond(errorBody("reminder_state_unavailable"), 500, correlationId);
  }
}

async function handleAppointmentReminderHistoryGet(request, context = {}) {
  const correlationId = resolveRequestCorrelationId(request);
  const auth = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.READ_OPERATIONAL,
  });
  if (!auth.accepted) return respond(auth.body, auth.status, correlationId);
  const params = await Promise.resolve(context?.params || {});
  const appointmentId = String(params?.appointmentId || "").trim();
  if (!appointmentId) {
    return respond(errorBody("missing_appointment_id"), 400, correlationId);
  }
  try {
    const runtime = getActiveAppointmentReviewRouteRuntimeAdapter();
    return respond({ ...runtime.listAppointmentReminderHistory({ appointmentId }), correlationId }, 200, correlationId);
  } catch {
    return respond(errorBody("reminder_history_unavailable"), 500, correlationId);
  }
}

async function handleReminderReconcilePost(request) {
  return mutateReminder(request, "reconcile", (runtime) =>
    runtime.reconcileAppointmentReminders({})
  );
}

async function handleReminderRunOncePost(request) {
  return mutateReminder(request, "run_once", (runtime) =>
    runtime.runAppointmentReminderCycle({ manualDispatch: true })
  );
}

async function handleReminderRetryPost(request) {
  return mutateReminder(request, "retry", async (runtime) => {
    const body = await parseStrictBody(request);
    if (!body.accepted) {
      return { accepted: false, code: body.code };
    }
    const reminderJobId = String(body.value.reminderJobId || "").trim();
    if (
      !reminderJobId ||
      Object.keys(body.value).some((key) => key !== "reminderJobId")
    ) {
      return { accepted: false, code: "invalid_reminder_retry_body" };
    }
    return runtime.retryFailedReminder({ reminderJobId });
  });
}

async function mutateReminder(request, operation, work) {
  const correlationId = resolveRequestCorrelationId(request);
  const origin = validateMutationOrigin(request);
  if (!origin.accepted) return respond(origin.body, origin.status, correlationId);
  const auth = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.MUTATE_APPOINTMENT_REMINDERS,
  });
  if (!auth.accepted) return respond(auth.body, auth.status, correlationId);

  try {
    const runtime = getActiveAppointmentReviewRouteRuntimeAdapter();
    const result = await work(runtime);
    return respond({ accepted: result?.accepted === true, operation, result, correlationId }, result?.accepted === false ? 409 : 200, correlationId);
  } catch {
    return respond(errorBody("reminder_mutation_failed_safely"), 500, correlationId);
  }
}

async function parseStrictBody(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { accepted: false, code: "invalid_json_body" };
    }
    return { accepted: true, value: body };
  } catch {
    return { accepted: false, code: "invalid_json_body" };
  }
}

function errorBody(code) {
  return {
    accepted: false,
    code,
    reason: "Appointment reminder operation failed safely.",
    providerCalled: false,
    messageSent: false,
    realPatientDelivery: false,
  };
}

function respond(body, status, correlationId) {
  return attachCorrelationHeader(Response.json(body, { status }), correlationId);
}

function rejectMethod() {
  return Response.json(
    { accepted: false, code: "method_not_allowed" },
    { status: 405 }
  );
}

module.exports = {
  handleAppointmentReminderHistoryGet,
  handleReminderReconcilePost,
  handleReminderRetryPost,
  handleReminderRunOncePost,
  handleReminderStateGet,
  rejectMethod,
};
