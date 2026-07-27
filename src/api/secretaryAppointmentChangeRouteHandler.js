const {
  CALENDAR_CANCELLATION_CONFIRMATION,
  CALENDAR_RESCHEDULE_CONFIRMATION,
  CANCELLATION_CONFIRMATION,
  CANCELLATION_NOTIFICATION_CONFIRMATION,
  RESCHEDULE_CONFIRMATION,
  RESCHEDULE_NOTIFICATION_CONFIRMATION,
} = require("./secretaryAppointmentChangeLifecycleService");
const {
  getActiveAppointmentReviewRouteRuntimeAdapter,
} = require("../secretary/appointmentReviewRouteRuntimeCompositionRoot");
const { AUTH_PERMISSIONS } = require("../auth/authRoles");
const {
  resolveRouteActor,
  validateMutationOrigin,
} = require("../auth/routeAuth");

const TRUSTED_FIELDS = Object.freeze([
  "appointment",
  "doctor",
  "doctorId",
  "doctorName",
  "startAt",
  "endAt",
  "durationMinutes",
  "timezone",
  "selectedSlot",
  "provider",
  "providerEventId",
  "calendarEventId",
  "destination",
  "recipient",
  "phone",
  "message",
  "template",
  "templateLanguage",
  "actor",
  "actorId",
  "actorRole",
  "user",
  "role",
  "clinicId",
  "auth",
  "session",
]);

const EXECUTION_CONFIRMATIONS = Object.freeze({
  reschedule: RESCHEDULE_CONFIRMATION,
  cancel: CANCELLATION_CONFIRMATION,
  calendar_reschedule: CALENDAR_RESCHEDULE_CONFIRMATION,
  calendar_cancellation: CALENDAR_CANCELLATION_CONFIRMATION,
  reschedule_notification: RESCHEDULE_NOTIFICATION_CONFIRMATION,
  cancellation_notification: CANCELLATION_NOTIFICATION_CONFIRMATION,
});

async function handleAppointmentChangePost(request, context, operation, options = {}) {
  const authResult = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.MUTATE_APPOINTMENT_LIFECYCLE,
  });
  if (!authResult.accepted) return json(authResult.body, authResult.status);

  const originResult = validateMutationOrigin(request);
  if (!originResult.accepted) return json(originResult.body, originResult.status);

  const appointmentId = await resolveAppointmentId(context);
  if (!appointmentId) {
    return json(error("invalid_appointment_id"), 400);
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.accepted) return json(error("invalid_json"), 400);

  const body = bodyResult.body || {};
  const bodyIssue = validateBody(body, operation);
  if (bodyIssue) return json(error(bodyIssue), 400);

  const adapterResult = resolveAdapter(options);
  if (!adapterResult.accepted) return json(error("internal_error"), 500);

  try {
    const input = {
      appointmentId,
      expectedAppointmentVersion: body.expectedAppointmentVersion,
      selectedSlotId: normalizeText(body.selectedSlotId),
      idempotencyKey: normalizeText(body.idempotencyKey),
      confirmation: normalizeText(body.confirmation),
      actor: {
        actorId:
          authResult.actor.actorId ||
          authResult.actor.userId ||
          authResult.actor.username,
        actorRole: authResult.actor.role,
      },
    };
    const result = await invoke(adapterResult.adapter, operation, input);
    return json(result, statusFor(result));
  } catch {
    return json(error("internal_error"), 500);
  }
}

async function handleAppointmentLifecycleGet(request, context, options = {}) {
  const authResult = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.READ_OPERATIONAL,
  });
  if (!authResult.accepted) return json(authResult.body, authResult.status);

  const appointmentId = await resolveAppointmentId(context);
  if (!appointmentId) {
    return json(error("invalid_appointment_id"), 400);
  }

  const adapterResult = resolveAdapter(options);
  if (!adapterResult.accepted) return json(error("internal_error"), 500);

  try {
    return json({
      accepted: true,
      appointmentId,
      lifecycleEvents: adapterResult.adapter.listAppointmentLifecycleEvents({
        appointmentId,
      }),
    });
  } catch {
    return json(error("internal_error"), 500);
  }
}

async function invoke(adapter, operation, input) {
  if (operation === "reschedule_preview") {
    return adapter.createAppointmentReschedulePreview(input);
  }
  if (operation === "reschedule") {
    return adapter.applyAppointmentReschedule(input);
  }
  if (operation === "cancellation_preview") {
    return adapter.createAppointmentCancellationPreview(input);
  }
  if (operation === "cancel") {
    return adapter.applyAppointmentCancellation(input);
  }
  if (operation === "calendar_reschedule") {
    return adapter.syncAppointmentChangeToCalendar({
      ...input,
      operationName: "reschedule",
    });
  }
  if (operation === "calendar_cancellation") {
    return adapter.syncAppointmentChangeToCalendar({
      ...input,
      operationName: "cancellation",
    });
  }
  if (operation === "reschedule_notification") {
    return adapter.dispatchAppointmentChangeNotification({
      ...input,
      operationName: "reschedule",
    });
  }
  if (operation === "cancellation_notification") {
    return adapter.dispatchAppointmentChangeNotification({
      ...input,
      operationName: "cancellation",
    });
  }
  return error("unsupported_appointment_change_operation");
}

function validateBody(body, operation) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "invalid_appointment_change_payload";
  }
  const trusted = findField(body, TRUSTED_FIELDS);
  if (trusted) return `client_trusted_appointment_change_injection:${trusted}`;

  const allowed = new Set(["expectedAppointmentVersion"]);
  if (operation === "reschedule_preview" || operation === "reschedule") {
    allowed.add("selectedSlotId");
  }
  if (!operation.endsWith("_preview")) {
    allowed.add("idempotencyKey");
    allowed.add("confirmation");
  }
  const unsupported = Object.keys(body).find((field) => !allowed.has(field));
  if (unsupported) return `invalid_appointment_change_payload:${unsupported}`;
  if (!Number.isSafeInteger(body.expectedAppointmentVersion) || body.expectedAppointmentVersion < 1) {
    return "invalid_expected_appointment_version";
  }
  if (operation === "reschedule" && !normalizeText(body.selectedSlotId)) {
    return "missing_selected_slot_id";
  }
  if (!operation.endsWith("_preview")) {
    const key = normalizeText(body.idempotencyKey);
    if (!key || !/^[A-Za-z0-9:_-]{1,128}$/.test(key)) {
      return "invalid_idempotency_key";
    }
    if (normalizeText(body.confirmation) !== EXECUTION_CONFIRMATIONS[operation]) {
      return "missing_appointment_change_confirmation";
    }
  }
  return "";
}

function resolveAdapter(options) {
  const createRouteRuntimeAdapter =
    options.createRouteRuntimeAdapter ||
    getActiveAppointmentReviewRouteRuntimeAdapter;
  try {
    const adapter = createRouteRuntimeAdapter({});
    return adapter ? { accepted: true, adapter } : { accepted: false };
  } catch {
    return { accepted: false };
  }
}

async function resolveAppointmentId(context = {}) {
  const params = await Promise.resolve(context.params || {});
  const appointmentId = normalizeText(params.appointmentId);
  return /^[a-z0-9_:-]+$/.test(appointmentId) ? appointmentId : "";
}

async function readJsonBody(request) {
  try {
    return { accepted: true, body: await request.json() };
  } catch {
    return { accepted: false };
  }
}

function statusFor(result) {
  if (result?.accepted) return 200;
  if (result?.notFound) return 404;
  if (result?.conflict) return 409;
  if (result?.blocked) return 422;
  if (result?.internal) return 500;
  return 400;
}

function findField(value, fields) {
  if (!value || typeof value !== "object") return "";
  for (const [key, nested] of Object.entries(value)) {
    if (fields.includes(key)) return key;
    if (nested && typeof nested === "object") {
      const found = findField(nested, fields);
      if (found) return `${key}.${found}`;
    }
  }
  return "";
}

function error(code) {
  const [safeCode, field] = String(code || "appointment_change_failed").split(":");
  return {
    accepted: false,
    code: safeCode,
    reason: field
      ? `Request body field ${field} is not supported.`
      : "Appointment change request was rejected safely.",
    mutationApplied: false,
    providerCalled: false,
    calendarWritten: false,
    messageSent: false,
    databasePersisted: false,
  };
}

function json(body, status = 200) {
  return Response.json(body, { status });
}

function normalizeText(value) {
  return String(value || "").trim();
}

async function rejectMethod() {
  return json(error("method_not_allowed"), 405);
}

module.exports = {
  handleAppointmentChangePost,
  handleAppointmentLifecycleGet,
  rejectMethod,
};
