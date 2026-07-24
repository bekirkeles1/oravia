const {
  CALENDAR_SYNC_CONFIRMATION,
} = require("../../../../../../src/api/secretaryAppointmentCalendarSyncService");
const {
  getActiveAppointmentReviewRouteRuntimeAdapter,
} = require("../../../../../../src/secretary/appointmentReviewRouteRuntimeCompositionRoot");
const {
  AUTH_PERMISSIONS,
} = require("../../../../../../src/auth/authRoles");
const {
  resolveRouteActor,
  validateMutationOrigin,
} = require("../../../../../../src/auth/routeAuth");

const ROUTE_SAFETY_FIELDS = Object.freeze({
  calendarSync: true,
  storage: "in_memory",
  appointmentPersistence: "not_persisted",
  durableAppointmentPersistence: false,
  messageSent: false,
  emailSent: false,
  whatsappSent: false,
  databasePersisted: false,
});

const BODY_ALLOWED_FIELDS = Object.freeze([
  "expectedAppointmentVersion",
  "idempotencyKey",
  "confirmation",
]);

const BODY_TRUSTED_FIELDS = Object.freeze([
  "provider",
  "calendarProvider",
  "calendarId",
  "calendarEventId",
  "providerEventId",
  "eventTitle",
  "summary",
  "description",
  "attendees",
  "doctor",
  "doctorId",
  "patient",
  "patientId",
  "patientPhone",
  "selectedSlot",
  "startAt",
  "endAt",
  "durationMinutes",
  "timezone",
  "appointmentPurpose",
  "treatment",
  "actor",
  "actorId",
  "actorRole",
  "user",
  "userId",
  "username",
  "role",
  "clinicId",
  "session",
  "auth",
  "authorizationResult",
]);

async function POST(request, context = {}) {
  return handleAppointmentCalendarSyncRouteRequest(request, context);
}

async function handleAppointmentCalendarSyncRouteRequest(
  request,
  context = {},
  options = {}
) {
  const authResult = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.MUTATE_CALENDAR_SYNC,
  });

  if (!authResult.accepted) {
    return routeJson(authResult.body, authResult.status);
  }

  const originResult = validateMutationOrigin(request);

  if (!originResult.accepted) {
    return routeJson(originResult.body, originResult.status);
  }

  const params = await Promise.resolve(context.params || {});
  const appointmentId = normalizeText(params.appointmentId);

  if (!appointmentId || !/^[a-z0-9_:-]+$/.test(appointmentId)) {
    return routeJson(
      createRouteError(
        "invalid_appointment_id",
        "Appointment id is required for calendar sync."
      ),
      400
    );
  }

  const bodyResult = await readJsonBody(request);

  if (bodyResult.status === "error") {
    return routeJson(
      createRouteError("invalid_json", "Request body must be valid JSON."),
      400
    );
  }

  const body = bodyResult.body || {};

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return routeJson(
      createRouteError(
        "invalid_calendar_sync_payload",
        "Calendar sync request body must be an object."
      ),
      400
    );
  }

  const bodyIssue = validateBody(body);

  if (bodyIssue) {
    return routeJson(createRouteError(bodyIssue.code, bodyIssue.reason), 400);
  }

  const runtimeResult = resolveRouteRuntime({
    createRouteRuntimeAdapter:
      options.createRouteRuntimeAdapter ||
      getActiveAppointmentReviewRouteRuntimeAdapter,
  });

  if (!runtimeResult.accepted) {
    return routeJson(
      createRouteError(
        "internal_error",
        "Calendar sync runtime failed safely."
      ),
      500
    );
  }

  let syncResult;

  try {
    syncResult = await runtimeResult.adapter.syncAppointmentToCalendar({
      appointmentId,
      expectedAppointmentVersion: body.expectedAppointmentVersion,
      idempotencyKey: normalizeText(body.idempotencyKey),
      confirmation: normalizeText(body.confirmation),
    });
  } catch {
    return routeJson(
      createRouteError(
        "internal_error",
        "Calendar sync application failed safely."
      ),
      500
    );
  }

  if (!syncResult || typeof syncResult !== "object") {
    return routeJson(
      createRouteError(
        "internal_error",
        "Calendar sync application returned malformed output."
      ),
      500
    );
  }

  return routeJson(
    {
      ...syncResult,
      ...createSafetyFields(),
    },
    resolveStatus(syncResult)
  );
}

function validateBody(body) {
  const trustedField = findField(body, BODY_TRUSTED_FIELDS);

  if (trustedField) {
    return {
      code: "client_trusted_calendar_sync_injection",
      reason: `Request body must not provide trusted calendar field ${trustedField}.`,
    };
  }

  const unsupportedField = Object.keys(body).find(
    (fieldName) => !BODY_ALLOWED_FIELDS.includes(fieldName)
  );

  if (unsupportedField) {
    return {
      code: "invalid_calendar_sync_payload",
      reason: `Request body field ${unsupportedField} is not supported.`,
    };
  }

  if (
    !Number.isSafeInteger(body.expectedAppointmentVersion) ||
    body.expectedAppointmentVersion < 1
  ) {
    return {
      code: "invalid_expected_appointment_version",
      reason: "expectedAppointmentVersion must be a positive safe integer.",
    };
  }

  const idempotencyKey = normalizeText(body.idempotencyKey);

  if (!idempotencyKey || idempotencyKey.length > 128) {
    return {
      code: idempotencyKey
        ? "invalid_idempotency_key"
        : "missing_idempotency_key",
      reason:
        "idempotencyKey is required and must be 128 characters or fewer.",
    };
  }

  if (!/^[A-Za-z0-9:_-]+$/.test(idempotencyKey)) {
    return {
      code: "invalid_idempotency_key",
      reason:
        "idempotencyKey may contain only letters, numbers, hyphen, underscore, and colon.",
    };
  }

  if (normalizeText(body.confirmation) !== CALENDAR_SYNC_CONFIRMATION) {
    return {
      code: "missing_calendar_sync_confirmation",
      reason: "Explicit configured calendar sync confirmation is required.",
    };
  }

  return null;
}

function resolveRouteRuntime({ createRouteRuntimeAdapter }) {
  try {
    const adapter = createRouteRuntimeAdapter({});

    if (!adapter || typeof adapter.syncAppointmentToCalendar !== "function") {
      return {
        accepted: false,
      };
    }

    return {
      accepted: true,
      adapter,
    };
  } catch {
    return {
      accepted: false,
    };
  }
}

function resolveStatus(result) {
  if (result.accepted === true) {
    return 200;
  }

  if (result.notFound === true) {
    return 404;
  }

  if (result.conflict === true || result.alreadySynced === true) {
    return 409;
  }

  if (result.providerFailed === true || result.providerUnavailable === true) {
    return 502;
  }

  if (result.ambiguous === true || result.internal === true) {
    return 500;
  }

  if (result.blocked === true) {
    return 422;
  }

  return 400;
}

async function rejectMethod() {
  return routeJson(
    createRouteError(
      "method_not_allowed",
      "Only POST calendar sync is allowed on this route."
    ),
    405
  );
}

async function readJsonBody(request) {
  try {
    return {
      status: "ok",
      body: await request.json(),
    };
  } catch {
    return {
      status: "error",
    };
  }
}

function createRouteError(code, reason) {
  return {
    accepted: false,
    synced: false,
    code,
    reason,
    appointmentCalendarLinkRecorded: false,
    calendarWritten: false,
    externalEventCreated: false,
    ...createSafetyFields(),
  };
}

function routeJson(body, status) {
  return Response.json(body, { status });
}

function findField(value, fieldNames) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findField(item, fieldNames);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (fieldNames.includes(fieldName)) {
      return fieldName;
    }

    const nested = findField(fieldValue, fieldNames);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function createSafetyFields() {
  return { ...ROUTE_SAFETY_FIELDS };
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
  handleAppointmentCalendarSyncRouteRequest,
};
