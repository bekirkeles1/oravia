const { demoClinic } = require("../demo/demoData");
const {
  constructAppointmentCalendarSyncReceipt,
} = require("../secretary/appointmentCalendarSyncReceipt");

const CALENDAR_SYNC_CONFIRMATION = "sync_configured_calendar";
const CALENDAR_SYNC_CODES = Object.freeze({
  SYNCED: "appointment_calendar_sync_completed",
  REPLAY: "appointment_calendar_sync_matching_replay",
  ALREADY_SYNCED: "appointment_calendar_sync_already_synced",
  CONFLICT: "appointment_calendar_sync_conflict",
  NOT_FOUND: "appointment_calendar_sync_appointment_not_found",
  PROVIDER_UNAVAILABLE: "appointment_calendar_sync_provider_unavailable",
  PROVIDER_FAILED: "appointment_calendar_sync_provider_failed",
  AMBIGUOUS: "appointment_calendar_sync_ambiguous_local_link_failure",
});

const SYNC_SAFETY_FIELDS = Object.freeze({
  calendarSync: true,
  storage: "in_memory",
  appointmentPersistence: "not_persisted",
  durableAppointmentPersistence: false,
  messageSent: false,
  emailSent: false,
  whatsappSent: false,
  databasePersisted: false,
});

async function syncAppointmentToCalendar(input) {
  const inputIssue = validateSyncInput(input);

  if (inputIssue.code) {
    return rejectSync(inputIssue);
  }

  const {
    appointmentId,
    expectedAppointmentVersion,
    idempotencyKey,
    appointmentRepository,
    calendarProvider,
  } = inputIssue.value;
  const priorObservation = input.idempotencyStore.observe(idempotencyKey);

  if (
    priorObservation &&
    !String(priorObservation.requestFingerprint || "").includes(
      `appointmentId:${appointmentId}|`
    )
  ) {
    return rejectSync({
      code: "idempotency_key_conflict",
      reason:
        "idempotencyKey was previously used for a different calendar sync request.",
      appointmentId,
      conflict: true,
    });
  }

  let appointment;

  try {
    appointment = appointmentRepository.getAppointmentById(appointmentId);
  } catch {
    return rejectSync({
      code: "appointment_resolution_failed",
      reason: "Trusted appointment resolution failed safely.",
      appointmentId,
      internal: true,
    });
  }

  if (!appointment) {
    return rejectSync({
      code: CALENDAR_SYNC_CODES.NOT_FOUND,
      reason: "Appointment was not found.",
      appointmentId,
      notFound: true,
    });
  }

  const providerName = normalizeText(calendarProvider.name);
  const eventCommandResult = buildTrustedCalendarEventCommand({
    appointment,
    providerName,
  });

  if (!eventCommandResult.accepted) {
    return rejectSync({
      code: eventCommandResult.code,
      reason: eventCommandResult.reason,
      appointmentId,
      blocked: true,
    });
  }

  const commandFingerprint = buildCalendarCommandFingerprint(
    eventCommandResult.command
  );
  const requestFingerprint = buildSyncFingerprint({
    appointmentId,
    expectedAppointmentVersion,
    providerName,
    commandFingerprint,
  });

  if (priorObservation) {
    if (priorObservation.requestFingerprint === requestFingerprint) {
      const storedResult = input.idempotencyStore.getResult(idempotencyKey);

      if (storedResult) {
        return freezeClone({
          ...storedResult,
          accepted: true,
          synced: false,
          matchingReplay: true,
          idempotencyStatus: "matching_replay",
          code: CALENDAR_SYNC_CODES.REPLAY,
          providerCalled: false,
          appointmentVersionChanged: false,
          appointmentRepositoryVersionChanged: false,
          replayedResultOnly: true,
          receipt: {
            ...storedResult.receipt,
            matchingReplay: true,
            idempotencyStatus: "matching_replay",
          },
          ...createSafetyFields(),
        });
      }
    }

    return rejectSync({
      code: "idempotency_key_conflict",
      reason:
        "idempotencyKey was previously used for a different calendar sync request.",
      appointmentId,
      conflict: true,
    });
  }

  if (appointment.version !== expectedAppointmentVersion) {
    return rejectSync({
      code: "appointment_version_conflict",
      reason:
        "expectedAppointmentVersion must match the current trusted appointment version.",
      appointmentId,
      expectedAppointmentVersion,
      observedAppointmentVersion: appointment.version,
      conflict: true,
    });
  }

  if (appointment.calendarLinked === true || appointment.calendarEventId) {
    return rejectSync({
      code: CALENDAR_SYNC_CODES.ALREADY_SYNCED,
      reason: "Appointment already has a linked calendar event.",
      appointmentId,
      provider: appointment.calendarProvider,
      providerEventId: appointment.calendarEventId,
      alreadySynced: true,
      conflict: true,
    });
  }

  let reserveResult;

  try {
    reserveResult = input.idempotencyStore.reserveResult({
      idempotencyKey,
      requestFingerprint,
    });
  } catch {
    return rejectSync({
      code: "calendar_sync_idempotency_reserve_failed",
      reason: "Calendar sync idempotency reserve failed before provider call.",
      appointmentId,
      internal: true,
    });
  }

  if (!reserveResult || reserveResult.accepted !== true) {
    return rejectSync({
      code: reserveResult?.code || "calendar_sync_idempotency_reserve_failed",
      reason:
        reserveResult?.reason ||
        "Calendar sync idempotency reserve failed before provider call.",
      appointmentId,
      conflict: reserveResult?.code === "idempotency_key_conflict",
      internal: reserveResult?.code !== "idempotency_key_conflict",
    });
  }

  let providerResult;

  try {
    providerResult = await calendarProvider.createCalendarEvent(
      eventCommandResult.command
    );
  } catch {
    return rejectSync({
      code: CALENDAR_SYNC_CODES.PROVIDER_FAILED,
      reason: "Configured calendar provider failed safely.",
      appointmentId,
      provider: providerName,
      providerFailed: true,
    });
  }

  const safeProviderResult = normalizeProviderResult({
    providerResult,
    providerName,
    appointment,
  });

  if (!safeProviderResult.accepted) {
    return rejectSync({
      code: safeProviderResult.code,
      reason: safeProviderResult.reason,
      appointmentId,
      provider: providerName,
      providerFailed: true,
    });
  }

  let linkResult;

  try {
    linkResult = appointmentRepository.linkAppointmentCalendarEvent({
      appointmentId,
      expectedVersion: expectedAppointmentVersion,
      provider: safeProviderResult.provider,
      providerEventId: safeProviderResult.providerEventId,
      syncMode: "configured_provider",
    });
  } catch {
    return rejectSync({
      code: CALENDAR_SYNC_CODES.AMBIGUOUS,
      reason:
        "Calendar provider succeeded, but local in-memory appointment link failed. Manual internal reconciliation may be required.",
      appointmentId,
      provider: safeProviderResult.provider,
      providerEventId: safeProviderResult.providerEventId,
      ambiguous: true,
      externalEventCreated: true,
      calendarWritten: true,
      internal: true,
    });
  }

  if (!linkResult || linkResult.status !== "ok") {
    return rejectSync({
      code: CALENDAR_SYNC_CODES.AMBIGUOUS,
      reason:
        "Calendar provider succeeded, but local in-memory appointment link was rejected. Manual internal reconciliation may be required.",
      appointmentId,
      provider: safeProviderResult.provider,
      providerEventId: safeProviderResult.providerEventId,
      ambiguous: true,
      externalEventCreated: true,
      calendarWritten: true,
      internal: true,
    });
  }

  const receipt = constructAppointmentCalendarSyncReceipt({
    appointmentId,
    sourceReviewId: linkResult.appointment.sourceReviewId,
    appointment: linkResult.appointment,
    provider: safeProviderResult.provider,
    providerEventId: safeProviderResult.providerEventId,
    previousAppointmentVersion: linkResult.previousAppointmentVersion,
    resultingAppointmentVersion: linkResult.nextAppointmentVersion,
    appointmentRepositoryVersion: linkResult.appointmentRepositoryVersion,
    calendarExternalPersistence:
      safeProviderResult.provider === "google_service_account",
    idempotencyStatus: "new_request",
    matchingReplay: false,
  });

  if (!receipt.accepted) {
    return rejectSync({
      code: receipt.code,
      reason: receipt.reason,
      appointmentId,
      provider: safeProviderResult.provider,
      providerEventId: safeProviderResult.providerEventId,
      ambiguous: true,
      externalEventCreated: true,
      appointmentCalendarLinkRecorded: true,
      appointmentVersionChanged: true,
      appointmentRepositoryVersionChanged: true,
      calendarWritten: true,
      internal: true,
    });
  }

  const result = freezeClone({
    accepted: true,
    synced: true,
    matchingReplay: false,
    replayedResultOnly: false,
    alreadySynced: false,
    ambiguous: false,
    idempotencyStatus: "new_request",
    code: CALENDAR_SYNC_CODES.SYNCED,
    appointmentId,
    sourceReviewId: linkResult.appointment.sourceReviewId,
    provider: safeProviderResult.provider,
    providerEventId: safeProviderResult.providerEventId,
    appointment: linkResult.appointment,
    previousAppointmentVersion: linkResult.previousAppointmentVersion,
    resultingAppointmentVersion: linkResult.nextAppointmentVersion,
    appointmentRepositoryVersion: linkResult.appointmentRepositoryVersion,
    appointmentCalendarLinkRecorded: true,
    appointmentVersionChanged: true,
    appointmentRepositoryVersionChanged: true,
    providerCalled: true,
    calendarWritten: true,
    externalEventCreated: true,
    calendarExternalPersistence:
      safeProviderResult.provider === "google_service_account",
    receipt,
    ...createSafetyFields(),
  });
  const storeResult = input.idempotencyStore.storeResult({
    idempotencyKey,
    requestFingerprint,
    result,
  });

  if (!storeResult || storeResult.accepted !== true) {
    return rejectSync({
      code: CALENDAR_SYNC_CODES.AMBIGUOUS,
      reason:
        "Calendar provider and local link succeeded, but calendar sync result storage failed. Manual internal reconciliation may be required.",
      appointmentId,
      provider: safeProviderResult.provider,
      providerEventId: safeProviderResult.providerEventId,
      ambiguous: true,
      externalEventCreated: true,
      appointmentCalendarLinkRecorded: true,
      appointmentVersionChanged: true,
      appointmentRepositoryVersionChanged: true,
      calendarWritten: true,
      internal: true,
    });
  }

  return result;
}

function buildTrustedCalendarEventCommand({ appointment, providerName }) {
  if (!appointment || typeof appointment !== "object") {
    return rejectCommand(
      "invalid_trusted_appointment",
      "Trusted appointment must be an object."
    );
  }

  const appointmentId = normalizeText(appointment.id);
  const selectedSlotId = normalizeText(appointment.selectedSlotId);
  const doctorId = normalizeText(appointment.doctor?.id);
  const doctorName = normalizeText(appointment.doctor?.name);
  const treatment = normalizeText(appointment.treatment);
  const appointmentPurposeLabel = normalizeText(
    appointment.appointmentPurposeLabel
  );
  const startAt = normalizeText(appointment.startAt);
  const endAt = normalizeText(appointment.endAt);

  if (
    !appointmentId ||
    !selectedSlotId ||
    !doctorId ||
    !doctorName ||
    !treatment ||
    !appointmentPurposeLabel ||
    !startAt ||
    !endAt ||
    !Number.isSafeInteger(appointment.durationMinutes) ||
    appointment.durationMinutes < 1 ||
    !providerName
  ) {
    return rejectCommand(
      "incomplete_trusted_calendar_sync_appointment",
      "Trusted appointment does not contain a complete calendar event candidate."
    );
  }

  const selectedSlot = {
    id: selectedSlotId,
    start_at: startAt,
    end_at: endAt,
    timezone: demoClinic.timezone || "Europe/Istanbul",
    duration_minutes: appointment.durationMinutes,
  };

  return freezeClone({
    accepted: true,
    command: {
      clinic: {
        id: demoClinic.id,
        name: demoClinic.name,
        timezone: demoClinic.timezone,
      },
      doctor: {
        id: doctorId,
        name: doctorName,
      },
      patient: {},
      treatmentInterest: treatment,
      selectedSlot,
      summary: `Oravia Appointment - ${appointmentPurposeLabel}`,
      description: [
        "Created by Oravia controlled appointment calendar sync.",
        "Source: appointment_review",
        `Appointment: ${appointmentId}`,
        `Doctor: ${doctorName}`,
      ].join("\n"),
    },
  });
}

function validateSyncInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      code: "invalid_calendar_sync_input",
      reason: "Calendar sync input must be an object.",
    };
  }

  const appointmentId = normalizeText(input.appointmentId);
  const idempotencyKey = normalizeText(input.idempotencyKey);

  if (!appointmentId || !/^[a-z0-9_:-]+$/.test(appointmentId)) {
    return {
      code: "invalid_appointment_id",
      reason: "appointmentId is required and must be safe.",
    };
  }

  if (
    !Number.isSafeInteger(input.expectedAppointmentVersion) ||
    input.expectedAppointmentVersion < 1
  ) {
    return {
      code: "invalid_expected_appointment_version",
      reason: "expectedAppointmentVersion must be a positive safe integer.",
      appointmentId,
    };
  }

  if (!idempotencyKey || idempotencyKey.length > 128) {
    return {
      code: idempotencyKey
        ? "invalid_idempotency_key"
        : "missing_idempotency_key",
      reason:
        "idempotencyKey is required and must be 128 characters or fewer.",
      appointmentId,
    };
  }

  if (!/^[A-Za-z0-9:_-]+$/.test(idempotencyKey)) {
    return {
      code: "invalid_idempotency_key",
      reason:
        "idempotencyKey may contain only letters, numbers, hyphen, underscore, and colon.",
      appointmentId,
    };
  }

  if (normalizeText(input.confirmation) !== CALENDAR_SYNC_CONFIRMATION) {
    return {
      code: "missing_calendar_sync_confirmation",
      reason: "Explicit configured calendar sync confirmation is required.",
      appointmentId,
    };
  }

  if (!input.appointmentRepository || typeof input.appointmentRepository !== "object") {
    return {
      code: "missing_appointment_repository",
      reason: "Appointment repository is required.",
      appointmentId,
    };
  }

  for (const methodName of [
    "getAppointmentById",
    "linkAppointmentCalendarEvent",
  ]) {
    if (typeof input.appointmentRepository[methodName] !== "function") {
      return {
        code: "invalid_appointment_repository",
        reason: "Appointment repository contract is invalid.",
        appointmentId,
      };
    }
  }

  if (
    !input.calendarProvider ||
    typeof input.calendarProvider !== "object" ||
    typeof input.calendarProvider.createCalendarEvent !== "function" ||
    !normalizeText(input.calendarProvider.name)
  ) {
    return {
      code: CALENDAR_SYNC_CODES.PROVIDER_UNAVAILABLE,
      reason: "Configured calendar provider is unavailable.",
      appointmentId,
      providerUnavailable: true,
    };
  }

  if (
    !input.idempotencyStore ||
    typeof input.idempotencyStore.observe !== "function" ||
    typeof input.idempotencyStore.getResult !== "function" ||
    typeof input.idempotencyStore.reserveResult !== "function" ||
    typeof input.idempotencyStore.storeResult !== "function"
  ) {
    return {
      code: "invalid_calendar_sync_idempotency_store",
      reason: "Calendar sync idempotency store contract is invalid.",
      appointmentId,
    };
  }

  return {
    value: {
      appointmentId,
      expectedAppointmentVersion: input.expectedAppointmentVersion,
      idempotencyKey,
      appointmentRepository: input.appointmentRepository,
      calendarProvider: input.calendarProvider,
    },
  };
}

function normalizeProviderResult({ providerResult, providerName, appointment }) {
  if (!providerResult || typeof providerResult !== "object") {
    return rejectCommand(
      "invalid_calendar_provider_result",
      "Configured calendar provider returned malformed output."
    );
  }

  const provider = normalizeText(providerResult.calendar_provider);
  const providerEventId = normalizeText(providerResult.calendar_event_id);

  if (
    provider !== providerName ||
    !providerEventId ||
    normalizeText(providerResult.start_time) !== normalizeText(appointment.startAt) ||
    normalizeText(providerResult.end_time) !== normalizeText(appointment.endAt)
  ) {
    return rejectCommand(
      "unsafe_calendar_provider_result",
      "Configured calendar provider result did not match trusted appointment data."
    );
  }

  return freezeClone({
    accepted: true,
    provider,
    providerEventId,
  });
}

function buildSyncFingerprint({
  appointmentId,
  expectedAppointmentVersion,
  providerName,
  commandFingerprint,
}) {
  return [
    "operation:appointment_calendar_sync",
    `appointmentId:${appointmentId}`,
    `expectedAppointmentVersion:${expectedAppointmentVersion}`,
    `provider:${providerName}`,
    `command:${commandFingerprint}`,
  ].join("|");
}

function buildCalendarCommandFingerprint(command) {
  return [
    command.doctor.id,
    command.doctor.name,
    command.treatmentInterest,
    command.selectedSlot.id,
    command.selectedSlot.start_at,
    command.selectedSlot.end_at,
    command.selectedSlot.duration_minutes,
    command.selectedSlot.timezone,
    command.summary,
  ].join("|");
}

function rejectCommand(code, reason) {
  return freezeClone({
    accepted: false,
    code,
    reason,
  });
}

function rejectSync({
  code,
  reason,
  appointmentId = "",
  expectedAppointmentVersion = null,
  observedAppointmentVersion = null,
  provider = null,
  providerEventId = null,
  blocked = false,
  conflict = false,
  notFound = false,
  internal = false,
  alreadySynced = false,
  ambiguous = false,
  providerFailed = false,
  providerUnavailable = false,
  externalEventCreated = false,
  appointmentCalendarLinkRecorded = false,
  appointmentVersionChanged = false,
  appointmentRepositoryVersionChanged = false,
  calendarWritten = false,
}) {
  return freezeClone({
    accepted: false,
    synced: false,
    matchingReplay: false,
    replayedResultOnly: false,
    alreadySynced: alreadySynced === true,
    ambiguous: ambiguous === true,
    blocked: blocked === true,
    conflict: conflict === true,
    notFound: notFound === true,
    internal: internal === true,
    providerFailed: providerFailed === true,
    providerUnavailable: providerUnavailable === true,
    code,
    reason,
    appointmentId: normalizeText(appointmentId) || null,
    expectedAppointmentVersion,
    observedAppointmentVersion,
    provider: provider ? normalizeText(provider) : null,
    providerEventId: providerEventId ? normalizeText(providerEventId) : null,
    appointment: null,
    receipt: null,
    providerCalled: externalEventCreated === true,
    appointmentCalendarLinkRecorded:
      appointmentCalendarLinkRecorded === true,
    appointmentVersionChanged: appointmentVersionChanged === true,
    appointmentRepositoryVersionChanged:
      appointmentRepositoryVersionChanged === true,
    calendarWritten: calendarWritten === true,
    externalEventCreated: externalEventCreated === true,
    calendarExternalPersistence: false,
    ...createSafetyFields(),
  });
}

function createSafetyFields() {
  return { ...SYNC_SAFETY_FIELDS };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function freezeClone(value) {
  return deepFreeze(cloneValue(value));
}

function cloneValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return value;
}

module.exports = {
  CALENDAR_SYNC_CODES,
  CALENDAR_SYNC_CONFIRMATION,
  buildTrustedCalendarEventCommand,
  syncAppointmentToCalendar,
};
