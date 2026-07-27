const { AUTH_PERMISSIONS } = require("../auth/authRoles");
const { resolveRouteActor, validateMutationOrigin } = require("../auth/routeAuth");
const {
  getActiveAppointmentReviewRouteRuntimeAdapter,
} = require("../secretary/appointmentReviewRouteRuntimeCompositionRoot");
const {
  attachCorrelationHeader,
  resolveRequestCorrelationId,
} = require("../ops/requestCorrelation");

const FORBIDDEN_BODY_FIELDS = new Set([
  "clinic",
  "clinicId",
  "doctor",
  "doctorId",
  "rawDateTime",
  "startAt",
  "endAt",
  "duration",
  "durationMinutes",
  "purpose",
  "appointmentPurpose",
  "provider",
  "recipient",
  "destination",
  "template",
  "message",
  "rankingScore",
  "role",
]);

async function handleEmptySlotStateGet(request) {
  const correlationId = resolveRequestCorrelationId(request);
  const auth = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.READ_OPERATIONAL,
  });
  if (!auth.accepted) return respond(auth.body, auth.status, correlationId);
  try {
    const runtime = getActiveAppointmentReviewRouteRuntimeAdapter();
    return respond({ ...runtime.getEmptySlotState({ limit: 50 }), correlationId }, 200, correlationId);
  } catch {
    return respond(errorBody("empty_slot_state_unavailable"), 500, correlationId);
  }
}

async function handleEmptySlotReconcilePost(request) {
  return mutate(request, "reconcile", (runtime) => runtime.runEmptySlotCycle({}));
}

async function handleEmptySlotRunOncePost(request) {
  return mutate(request, "run_once", (runtime) => runtime.runEmptySlotCycle({ manualDispatch: true }));
}

async function handleEmptySlotCreatePost(request) {
  return mutateWithBody(request, "create_opportunity", ["sourceAppointmentId"], (runtime, body) =>
    runtime.createEmptySlotOpportunity({ sourceAppointmentId: body.sourceAppointmentId })
  );
}

async function handleEmptySlotPreviewPost(request) {
  return mutateWithBody(request, "preview_candidates", ["opportunityId"], (runtime, body) =>
    runtime.previewEmptySlotCandidates({ opportunityId: body.opportunityId })
  );
}

async function handleEmptySlotLaunchPost(request) {
  return mutateWithBody(request, "launch_wave", ["opportunityId", "expectedOpportunityVersion"], (runtime, body) =>
    runtime.launchEmptySlotOfferWave({
      opportunityId: body.opportunityId,
      expectedOpportunityVersion: body.expectedOpportunityVersion,
    })
  );
}

async function handleEmptySlotCancelPost(request) {
  return mutateWithBody(request, "cancel_opportunity", ["opportunityId"], (runtime, body) =>
    runtime.cancelEmptySlotOpportunity({ opportunityId: body.opportunityId })
  );
}

async function handleEmptySlotConsentGet(request, context = {}) {
  const correlationId = resolveRequestCorrelationId(request);
  const auth = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.READ_OPERATIONAL,
  });
  if (!auth.accepted) return respond(auth.body, auth.status, correlationId);
  const params = await Promise.resolve(context?.params || {});
  const appointmentId = String(params?.appointmentId || "").trim();
  if (!appointmentId) return respond(errorBody("missing_appointment_id"), 400, correlationId);
  const runtime = getActiveAppointmentReviewRouteRuntimeAdapter();
  return respond({ ...runtime.getEarlierSlotConsent({ appointmentId }), correlationId }, 200, correlationId);
}

async function handleEmptySlotConsentPost(request, context = {}) {
  const params = await Promise.resolve(context?.params || {});
  const appointmentId = String(params?.appointmentId || "").trim();
  return mutateWithBody(request, "update_consent", ["enabled", "weekdays", "dayparts", "minimumNoticeMinutes"], (runtime, body) =>
    runtime.updateEarlierSlotConsent({
      appointmentId,
      enabled: body.enabled === true,
      weekdays: body.weekdays,
      dayparts: body.dayparts,
      minimumNoticeMinutes: body.minimumNoticeMinutes,
    })
  );
}

async function mutateWithBody(request, operation, allowedFields, work) {
  return mutate(request, operation, async (runtime) => {
    const body = await parseBody(request, allowedFields);
    if (!body.accepted) return body;
    return work(runtime, body.value);
  });
}

async function mutate(request, operation, work) {
  const correlationId = resolveRequestCorrelationId(request);
  const origin = validateMutationOrigin(request);
  if (!origin.accepted) return respond(origin.body, origin.status, correlationId);
  const auth = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.MUTATE_EMPTY_SLOTS,
  });
  if (!auth.accepted) return respond(auth.body, auth.status, correlationId);
  try {
    const runtime = getActiveAppointmentReviewRouteRuntimeAdapter();
    const result = await work(runtime);
    return respond({ accepted: result?.accepted === true, operation, result, correlationId }, result?.accepted === false ? 409 : 200, correlationId);
  } catch {
    return respond(errorBody("empty_slot_mutation_failed_safely"), 500, correlationId);
  }
}

async function parseBody(request, allowedFields) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorBody("invalid_json_body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorBody("invalid_json_body");
  }
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key) || FORBIDDEN_BODY_FIELDS.has(key)) {
      return errorBody("forbidden_empty_slot_body_field");
    }
  }
  return { accepted: true, value: body };
}

function errorBody(code) {
  return {
    accepted: false,
    code,
    reason: "Empty-slot operation failed safely.",
    providerCalled: false,
    messageSent: false,
    realPatientDelivery: false,
  };
}

function respond(body, status, correlationId) {
  return attachCorrelationHeader(Response.json(body, { status }), correlationId);
}

function rejectMethod() {
  return Response.json({ accepted: false, code: "method_not_allowed" }, { status: 405 });
}

module.exports = {
  handleEmptySlotCancelPost,
  handleEmptySlotConsentGet,
  handleEmptySlotConsentPost,
  handleEmptySlotCreatePost,
  handleEmptySlotLaunchPost,
  handleEmptySlotPreviewPost,
  handleEmptySlotReconcilePost,
  handleEmptySlotRunOncePost,
  handleEmptySlotStateGet,
  rejectMethod,
};
