const {
  APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS,
  APPOINTMENT_NOTIFICATION_STATUS,
  APPOINTMENT_STATUS,
} = require("../secretary/appointmentReviewAppointmentRepository");
const {
  getAvailabilityForDoctorDay,
  validateAvailabilityWindow,
  timeToMinutes,
} = require("../clinic/doctorAvailability");
const {
  buildSlotId,
  generateSlotsFromWindow,
} = require("../messaging/slotProposal");
const { demoClinic } = require("../demo/demoData");

const RESCHEDULE_CONFIRMATION = "apply_appointment_reschedule";
const CANCELLATION_CONFIRMATION = "cancel_local_appointment";
const CALENDAR_RESCHEDULE_CONFIRMATION = "sync_rescheduled_calendar";
const CALENDAR_CANCELLATION_CONFIRMATION = "sync_cancelled_calendar";
const RESCHEDULE_NOTIFICATION_CONFIRMATION =
  "send_reschedule_notification";
const CANCELLATION_NOTIFICATION_CONFIRMATION =
  "send_cancellation_notification";

function createAppointmentReschedulePreview(input) {
  const validation = validatePreviewInput(input, {
    operationName: "reschedule",
    requireSelectedSlot: false,
  });

  if (!validation.accepted) return reject(validation);

  const { appointment, selectedSlotId, appointmentRepository, now } =
    validation;
  const slots = buildTrustedReplacementSlots({ appointment, appointmentRepository, now });
  const selectedSlot = selectedSlotId
    ? slots.find((slot) => slot.id === selectedSlotId)
    : null;

  if (selectedSlotId && !selectedSlot) {
    return reject({
      code: "reschedule_slot_not_available",
      reason: "Selected reschedule slot is not available from trusted server proposals.",
      appointmentId: appointment.id,
      conflict: true,
    });
  }

  return freezeClone({
    accepted: true,
    preview: true,
    code: "appointment_reschedule_preview_ready",
    appointmentId: appointment.id,
    currentAppointmentVersion: appointment.version,
    currentSlot: projectSlot(appointment),
    proposedSlot: selectedSlot ? projectSlot(selectedSlot) : null,
    proposedSlots: slots.map(projectSlot),
    durationMinutes: appointment.durationMinutes,
    doctor: {
      id: appointment.doctor.id,
      name: appointment.doctor.name,
    },
    appointmentPurpose: appointment.appointmentPurpose,
    appointmentPurposeLabel: appointment.appointmentPurposeLabel,
    sameDoctor: true,
    collision: selectedSlot ? { accepted: true, conflict: false } : null,
    localMutationAvailable: selectedSlot ? true : slots.length > 0,
    calendarUpdateRequired: appointment.calendarLinked === true,
    patientNotificationRequired: true,
    mutationApplied: false,
    providerCalled: false,
    calendarWritten: false,
    messageSent: false,
    databasePersisted: false,
  });
}

function createAppointmentCancellationPreview(input) {
  const validation = validatePreviewInput(input, {
    operationName: "cancellation",
    requireSelectedSlot: false,
  });

  if (!validation.accepted) return reject(validation);

  const { appointment } = validation;

  return freezeClone({
    accepted: true,
    preview: true,
    code: "appointment_cancellation_preview_ready",
    appointmentId: appointment.id,
    currentAppointmentVersion: appointment.version,
    currentSlot: projectSlot(appointment),
    doctor: {
      id: appointment.doctor.id,
      name: appointment.doctor.name,
    },
    appointmentPurpose: appointment.appointmentPurpose,
    appointmentPurposeLabel: appointment.appointmentPurposeLabel,
    currentCalendarState: appointment.calendarFollowUpStatus || null,
    currentNotificationState: appointment.notificationFollowUpStatus || null,
    calendarCancellationRequired: appointment.calendarLinked === true,
    patientNotificationRequired: true,
    localCancellationWarning:
      "Local cancellation happens before any explicit calendar or patient notification follow-up.",
    localMutationAvailable: true,
    mutationApplied: false,
    providerCalled: false,
    calendarWritten: false,
    messageSent: false,
    databasePersisted: false,
  });
}

function applyAppointmentReschedule(input) {
  const validation = validateExecutionInput(input, {
    operationName: "reschedule",
    confirmation: RESCHEDULE_CONFIRMATION,
    requireSelectedSlot: true,
    requiredRepositoryMethod: "rescheduleAppointment",
  });

  if (!validation.accepted) return reject(validation);

  const { appointment, selectedSlotId, appointmentRepository, idempotencyStore } =
    validation;
  const requestFingerprint = buildFingerprint({
    operation: "appointment_reschedule",
    appointmentId: appointment.id,
    expectedAppointmentVersion: validation.expectedAppointmentVersion,
    selectedSlotId,
  });
  const replay = resolveIdempotencyReplay({
    idempotencyStore,
    idempotencyKey: validation.idempotencyKey,
    requestFingerprint,
  });

  if (replay) return replay;

  if (normalizeAppointmentStatus(appointment) !== APPOINTMENT_STATUS.SCHEDULED) {
    return reject({
      code: "appointment_not_schedulable",
      reason: "Appointment is not currently scheduled.",
      appointmentId: appointment.id,
      conflict: true,
    });
  }

  if (appointment.version !== validation.expectedAppointmentVersion) {
    return reject({
      code: "appointment_version_conflict",
      reason: "Expected appointment version does not match trusted state.",
      appointmentId: appointment.id,
      conflict: true,
    });
  }

  const slots = buildTrustedReplacementSlots({
    appointment,
    appointmentRepository,
    now: validation.now,
  });
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId);

  if (!selectedSlot) {
    return reject({
      code: "reschedule_slot_not_available",
      reason: "Selected reschedule slot is not available from trusted server proposals.",
      appointmentId: appointment.id,
      conflict: true,
    });
  }

  const reserve = idempotencyStore.reserveResult({
    idempotencyKey: validation.idempotencyKey,
    requestFingerprint,
  });
  if (!reserve.accepted) return rejectIdempotency(reserve, appointment.id);

  const mutation = appointmentRepository.rescheduleAppointment({
    appointmentId: appointment.id,
    expectedVersion: validation.expectedAppointmentVersion,
    selectedSlot,
    idempotencyKey: validation.idempotencyKey,
    actor: validation.actor,
  });

  if (!mutation || mutation.status !== "ok") {
    return reject({
      code: mutation?.error?.code || "appointment_reschedule_failed",
      reason:
        mutation?.error?.message ||
        "Appointment reschedule failed safely before external providers.",
      appointmentId: appointment.id,
      conflict: mutation?.error?.code === "appointment_version_conflict",
    });
  }

  const result = freezeClone({
    accepted: true,
    code: "appointment_reschedule_completed",
    mutationApplied: true,
    appointmentId: appointment.id,
    appointment: mutation.appointment,
    lifecycleEvent: mutation.lifecycleEvent,
    previousAppointmentVersion: mutation.previousAppointmentVersion,
    resultingAppointmentVersion: mutation.nextAppointmentVersion,
    appointmentRepositoryVersion: mutation.appointmentRepositoryVersion,
    calendarUpdateRequired:
      mutation.appointment.calendarFollowUpStatus ===
      APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.UPDATE_REQUIRED,
    patientNotificationRequired: true,
    matchingReplay: false,
    providerCalled: false,
    calendarWritten: false,
    messageSent: false,
    databasePersisted: mutation.databasePersisted === true,
  });
  idempotencyStore.storeResult({
    idempotencyKey: validation.idempotencyKey,
    requestFingerprint,
    result,
  });
  return result;
}

function applyAppointmentCancellation(input) {
  const validation = validateExecutionInput(input, {
    operationName: "cancellation",
    confirmation: CANCELLATION_CONFIRMATION,
    requireSelectedSlot: false,
    requiredRepositoryMethod: "cancelAppointment",
  });

  if (!validation.accepted) return reject(validation);

  const requestFingerprint = buildFingerprint({
    operation: "appointment_cancellation",
    appointmentId: validation.appointment.id,
    expectedAppointmentVersion: validation.expectedAppointmentVersion,
  });
  const replay = resolveIdempotencyReplay({
    idempotencyStore: validation.idempotencyStore,
    idempotencyKey: validation.idempotencyKey,
    requestFingerprint,
  });

  if (replay) return replay;

  if (
    normalizeAppointmentStatus(validation.appointment) !==
    APPOINTMENT_STATUS.SCHEDULED
  ) {
    return reject({
      code: "appointment_not_schedulable",
      reason: "Appointment is not currently scheduled.",
      appointmentId: validation.appointment.id,
      conflict: true,
    });
  }

  if (validation.appointment.version !== validation.expectedAppointmentVersion) {
    return reject({
      code: "appointment_version_conflict",
      reason: "Expected appointment version does not match trusted state.",
      appointmentId: validation.appointment.id,
      conflict: true,
    });
  }

  const reserve = validation.idempotencyStore.reserveResult({
    idempotencyKey: validation.idempotencyKey,
    requestFingerprint,
  });
  if (!reserve.accepted) return rejectIdempotency(reserve, validation.appointment.id);

  const mutation = validation.appointmentRepository.cancelAppointment({
    appointmentId: validation.appointment.id,
    expectedVersion: validation.expectedAppointmentVersion,
    idempotencyKey: validation.idempotencyKey,
    actor: validation.actor,
  });

  if (!mutation || mutation.status !== "ok") {
    return reject({
      code: mutation?.error?.code || "appointment_cancellation_failed",
      reason:
        mutation?.error?.message ||
        "Appointment cancellation failed safely before external providers.",
      appointmentId: validation.appointment.id,
      conflict: mutation?.error?.code === "appointment_version_conflict",
    });
  }

  const result = freezeClone({
    accepted: true,
    code: "appointment_cancellation_completed",
    mutationApplied: true,
    appointmentId: validation.appointment.id,
    appointment: mutation.appointment,
    lifecycleEvent: mutation.lifecycleEvent,
    previousAppointmentVersion: mutation.previousAppointmentVersion,
    resultingAppointmentVersion: mutation.nextAppointmentVersion,
    appointmentRepositoryVersion: mutation.appointmentRepositoryVersion,
    calendarCancellationRequired:
      mutation.appointment.calendarFollowUpStatus ===
      APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.CANCELLATION_REQUIRED,
    patientNotificationRequired: true,
    matchingReplay: false,
    providerCalled: false,
    calendarWritten: false,
    messageSent: false,
    databasePersisted: mutation.databasePersisted === true,
  });
  validation.idempotencyStore.storeResult({
    idempotencyKey: validation.idempotencyKey,
    requestFingerprint,
    result,
  });
  return result;
}

async function syncAppointmentChangeToCalendar(input) {
  const validation = validateFollowUpExecutionInput(input, {
    operationName: input?.operationName,
    confirmations: {
      reschedule: CALENDAR_RESCHEDULE_CONFIRMATION,
      cancellation: CALENDAR_CANCELLATION_CONFIRMATION,
    },
    providerMethodByOperation: {
      reschedule: "updateCalendarEvent",
      cancellation: "cancelCalendarEvent",
    },
    repositoryMethodByOperation: {
      reschedule: "markCalendarRescheduleSynchronized",
      cancellation: "markCalendarCancellationSynchronized",
    },
  });

  if (!validation.accepted) return reject(validation);

  const requestFingerprint = buildFingerprint({
    operation: `calendar_${validation.operationName}`,
    appointmentId: validation.appointment.id,
    expectedAppointmentVersion: validation.expectedAppointmentVersion,
    provider: validation.provider.name,
  });
  const replay = resolveIdempotencyReplay({
    idempotencyStore: validation.idempotencyStore,
    idempotencyKey: validation.idempotencyKey,
    requestFingerprint,
  });

  if (replay) return replay;

  const expectedFollowUp =
    validation.operationName === "reschedule"
      ? APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.UPDATE_REQUIRED
      : APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.CANCELLATION_REQUIRED;

  if (validation.appointment.calendarFollowUpStatus !== expectedFollowUp) {
    return reject({
      code: "appointment_calendar_follow_up_not_required",
      reason: "Appointment does not currently require this calendar follow-up.",
      appointmentId: validation.appointment.id,
      conflict: true,
    });
  }

  if (!validation.appointment.calendarEventId) {
    return reject({
      code: "missing_trusted_calendar_event",
      reason: "Trusted appointment does not have a linked calendar event.",
      appointmentId: validation.appointment.id,
      blocked: true,
    });
  }

  if (validation.appointment.version !== validation.expectedAppointmentVersion) {
    return reject({
      code: "appointment_version_conflict",
      reason: "Expected appointment version does not match trusted state.",
      appointmentId: validation.appointment.id,
      conflict: true,
    });
  }

  const reserve = validation.idempotencyStore.reserveResult({
    idempotencyKey: validation.idempotencyKey,
    requestFingerprint,
  });
  if (!reserve.accepted) return rejectIdempotency(reserve, validation.appointment.id);

  const command = buildCalendarChangeCommand(validation.appointment);
  let providerResult;

  try {
    providerResult = await validation.provider[validation.providerMethod](command);
  } catch {
    return reject({
      code: "appointment_calendar_change_provider_failed",
      reason: "Configured calendar provider failed safely.",
      appointmentId: validation.appointment.id,
      provider: validation.provider.name,
      providerFailed: true,
    });
  }

  const providerEventId = normalizeText(
    providerResult?.calendar_event_id || validation.appointment.calendarEventId
  );

  if (
    !providerResult ||
    providerResult.calendar_provider !== validation.provider.name ||
    providerEventId !== validation.appointment.calendarEventId
  ) {
    return reject({
      code: "unsafe_calendar_change_provider_result",
      reason: "Configured calendar provider result did not match trusted state.",
      appointmentId: validation.appointment.id,
      provider: validation.provider.name,
      providerFailed: true,
    });
  }

  const linked = validation.appointmentRepository[validation.repositoryMethod]({
    appointmentId: validation.appointment.id,
    expectedVersion: validation.expectedAppointmentVersion,
    providerEventId,
    idempotencyKey: validation.idempotencyKey,
    actor: validation.actor,
  });

  if (!linked || linked.status !== "ok") {
    return reject({
      code: "appointment_calendar_change_ambiguous_local_failure",
      reason:
        "Calendar provider succeeded, but local follow-up state failed to persist.",
      appointmentId: validation.appointment.id,
      provider: validation.provider.name,
      providerEventId,
      ambiguous: true,
      providerCalled: true,
      calendarWritten: true,
      internal: true,
    });
  }

  const result = freezeClone({
    accepted: true,
    code:
      validation.operationName === "reschedule"
        ? "appointment_calendar_reschedule_sync_completed"
        : "appointment_calendar_cancellation_sync_completed",
    appointmentId: validation.appointment.id,
    appointment: linked.appointment,
    lifecycleEvent: linked.lifecycleEvent,
    provider: validation.provider.name,
    providerEventId,
    providerCalled: true,
    calendarWritten: true,
    messageSent: false,
    matchingReplay: false,
    databasePersisted: linked.databasePersisted === true,
  });
  validation.idempotencyStore.storeResult({
    idempotencyKey: validation.idempotencyKey,
    requestFingerprint,
    result,
  });
  return result;
}

async function dispatchAppointmentChangeNotification(input) {
  const validation = validateFollowUpExecutionInput(input, {
    operationName: input?.operationName,
    confirmations: {
      reschedule: RESCHEDULE_NOTIFICATION_CONFIRMATION,
      cancellation: CANCELLATION_NOTIFICATION_CONFIRMATION,
    },
    providerMethodByOperation: {
      reschedule: "sendAppointmentRescheduleNotification",
      cancellation: "sendAppointmentCancellationNotification",
    },
    repositoryMethodByOperation: {
      reschedule: "markRescheduleNotificationDispatched",
      cancellation: "markCancellationNotificationDispatched",
    },
  });

  if (!validation.accepted) return reject(validation);

  const requestFingerprint = buildFingerprint({
    operation: `notification_${validation.operationName}`,
    appointmentId: validation.appointment.id,
    expectedAppointmentVersion: validation.expectedAppointmentVersion,
    provider: validation.provider.name,
  });
  const replay = resolveIdempotencyReplay({
    idempotencyStore: validation.idempotencyStore,
    idempotencyKey: validation.idempotencyKey,
    requestFingerprint,
  });

  if (replay) return replay;

  const expectedFollowUp =
    validation.operationName === "reschedule"
      ? APPOINTMENT_NOTIFICATION_STATUS.RESCHEDULE_REQUIRED
      : APPOINTMENT_NOTIFICATION_STATUS.CANCELLATION_REQUIRED;

  if (validation.appointment.notificationFollowUpStatus !== expectedFollowUp) {
    return reject({
      code: "appointment_notification_not_required",
      reason: "Appointment does not currently require this notification.",
      appointmentId: validation.appointment.id,
      conflict: true,
    });
  }

  const destination = validation.appointment.outboundDestination;
  if (!destination?.maskedLabel || (!destination.reference && !destination.lookupHash)) {
    return reject({
      code: "missing_trusted_outbound_destination",
      reason: "Trusted appointment does not contain a safe outbound destination.",
      appointmentId: validation.appointment.id,
      blocked: true,
    });
  }

  if (validation.appointment.version !== validation.expectedAppointmentVersion) {
    return reject({
      code: "appointment_version_conflict",
      reason: "Expected appointment version does not match trusted state.",
      appointmentId: validation.appointment.id,
      conflict: true,
    });
  }

  const reserve = validation.idempotencyStore.reserveResult({
    idempotencyKey: validation.idempotencyKey,
    requestFingerprint,
  });
  if (!reserve.accepted) return rejectIdempotency(reserve, validation.appointment.id);

  let providerResult;

  try {
    providerResult = await validation.provider[validation.providerMethod]({
      appointment: validation.appointment,
      destination,
      operationReference: validation.appointment.id,
    });
  } catch {
    return reject({
      code: "appointment_notification_provider_failed",
      reason: "Configured outbound messaging provider failed safely.",
      appointmentId: validation.appointment.id,
      provider: validation.provider.name,
      providerFailed: true,
    });
  }

  const providerMessageId = normalizeText(providerResult?.providerMessageId);
  if (
    !providerResult ||
    providerResult.provider !== validation.provider.name ||
    !providerMessageId ||
    providerResult.providerDispatchAccepted !== true ||
    providerResult.realPatientDelivery !== false
  ) {
    return reject({
      code: "unsafe_notification_provider_result",
      reason: "Configured outbound messaging provider result was unsafe.",
      appointmentId: validation.appointment.id,
      provider: validation.provider.name,
      providerFailed: true,
    });
  }

  const linked = validation.appointmentRepository[validation.repositoryMethod]({
    appointmentId: validation.appointment.id,
    expectedVersion: validation.expectedAppointmentVersion,
    providerMessageId,
    idempotencyKey: validation.idempotencyKey,
    actor: validation.actor,
  });

  if (!linked || linked.status !== "ok") {
    return reject({
      code: "appointment_notification_ambiguous_local_failure",
      reason:
        "Messaging provider succeeded, but local follow-up state failed to persist.",
      appointmentId: validation.appointment.id,
      provider: validation.provider.name,
      providerMessageId,
      ambiguous: true,
      providerCalled: true,
      messageSent: true,
      internal: true,
    });
  }

  const result = freezeClone({
    accepted: true,
    code:
      validation.operationName === "reschedule"
        ? "appointment_reschedule_notification_dispatched"
        : "appointment_cancellation_notification_dispatched",
    appointmentId: validation.appointment.id,
    appointment: linked.appointment,
    lifecycleEvent: linked.lifecycleEvent,
    provider: validation.provider.name,
    providerMessageId,
    maskedDestinationLabel: destination.maskedLabel,
    providerCalled: true,
    calendarWritten: false,
    messageSent: false,
    providerDispatchAccepted: true,
    realPatientDelivery: false,
    matchingReplay: false,
    databasePersisted: linked.databasePersisted === true,
  });
  validation.idempotencyStore.storeResult({
    idempotencyKey: validation.idempotencyKey,
    requestFingerprint,
    result,
  });
  return result;
}

function buildTrustedReplacementSlots({ appointment, appointmentRepository, now }) {
  if (!appointment || normalizeAppointmentStatus(appointment) !== APPOINTMENT_STATUS.SCHEDULED) {
    return [];
  }

  const day = weekdayKeyFromDate(appointment.startAt);
  const date = datePart(appointment.startAt);
  const availability = getAvailabilityForDoctorDay(appointment.doctor?.id, day);
  const windows = Array.isArray(availability?.windows) ? availability.windows : [];
  const slots = [];

  for (const window of windows) {
    if (!validateAvailabilityWindow(window)) continue;
    for (const slot of generateSlotsFromWindow(window, {
      durationMinutes: appointment.durationMinutes,
      stepMinutes: appointment.durationMinutes,
      maxSlots: 12,
    })) {
      const startAt = `${date}T${slot.time}:00+03:00`;
      const endAt = addMinutes(startAt, appointment.durationMinutes);
      const trustedSlot = {
        id: buildSlotId({
          doctorId: appointment.doctor.id,
          treatment: appointment.treatment,
          appointmentPurpose: appointment.appointmentPurpose,
          day,
          time: slot.time,
          durationMinutes: appointment.durationMinutes,
        }),
        doctorId: appointment.doctor.id,
        doctorName: appointment.doctor.name,
        treatment: appointment.treatment,
        appointmentPurpose: appointment.appointmentPurpose,
        appointmentPurposeLabel: appointment.appointmentPurposeLabel,
        day,
        dayLabel: availability.day || day,
        startAt,
        endAt,
        durationMinutes: appointment.durationMinutes,
        timezone: demoClinic.timezone || "Europe/Istanbul",
      };

      if (trustedSlot.startAt === appointment.startAt) continue;
      if (!isFutureSlot(trustedSlot, now)) continue;
      if (hasActiveAppointmentConflict({
        appointmentRepository,
        appointment,
        slot: trustedSlot,
      })) continue;
      slots.push(trustedSlot);
    }
  }

  return slots;
}

function hasActiveAppointmentConflict({ appointmentRepository, appointment, slot }) {
  const appointments = appointmentRepository.listAppointments();
  return appointments.some((candidate) => {
    if (candidate.id === appointment.id) return false;
    if (normalizeAppointmentStatus(candidate) !== APPOINTMENT_STATUS.SCHEDULED) {
      return false;
    }
    if (candidate.doctor?.id !== appointment.doctor?.id) return false;
    return rangesOverlap(slot.startAt, slot.endAt, candidate.startAt, candidate.endAt);
  });
}

function validatePreviewInput(input, { operationName }) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { accepted: false, code: `invalid_${operationName}_preview_input` };
  }
  const base = resolveTrustedAppointmentInput(input, { requireIdempotency: false });
  if (!base.accepted) return base;
  if (normalizeAppointmentStatus(base.appointment) !== APPOINTMENT_STATUS.SCHEDULED) {
    return {
      accepted: false,
      code: "appointment_not_schedulable",
      reason: "Appointment is not currently scheduled.",
      appointmentId: base.appointment?.id || null,
      conflict: true,
    };
  }
  return base;
}

function validateExecutionInput(input, options) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { accepted: false, code: `invalid_${options.operationName}_input` };
  }
  if (normalizeText(input.confirmation) !== options.confirmation) {
    return {
      accepted: false,
      code: `missing_${options.operationName}_confirmation`,
      reason: "Explicit appointment change confirmation is required.",
    };
  }
  const base = resolveTrustedAppointmentInput(input, { requireIdempotency: true });
  if (!base.accepted) return base;
  if (typeof base.appointmentRepository[options.requiredRepositoryMethod] !== "function") {
    return {
      accepted: false,
      code: "invalid_appointment_repository",
      reason: "Appointment repository contract is invalid.",
    };
  }
  return base;
}

function validateFollowUpExecutionInput(input, options) {
  const operationName = normalizeText(options.operationName);
  if (!["reschedule", "cancellation"].includes(operationName)) {
    return { accepted: false, code: "invalid_appointment_follow_up_operation" };
  }
  if (normalizeText(input?.confirmation) !== options.confirmations[operationName]) {
    return { accepted: false, code: "missing_appointment_follow_up_confirmation" };
  }
  const base = resolveTrustedAppointmentInput(input, { requireIdempotency: true });
  if (!base.accepted) return base;
  const provider = input.provider;
  const providerMethod = options.providerMethodByOperation[operationName];
  const repositoryMethod = options.repositoryMethodByOperation[operationName];
  if (!provider || typeof provider[providerMethod] !== "function" || !normalizeText(provider.name)) {
    return {
      accepted: false,
      code: "appointment_follow_up_provider_unavailable",
      reason: "Configured follow-up provider is unavailable.",
      providerUnavailable: true,
    };
  }
  if (typeof base.appointmentRepository[repositoryMethod] !== "function") {
    return { accepted: false, code: "invalid_appointment_repository" };
  }
  return {
    ...base,
    operationName,
    provider,
    providerMethod,
    repositoryMethod,
  };
}

function resolveTrustedAppointmentInput(input, { requireIdempotency }) {
  const appointmentId = normalizeText(input.appointmentId);
  const selectedSlotId = normalizeText(input.selectedSlotId);
  if (!appointmentId || !/^[a-z0-9_:-]+$/.test(appointmentId)) {
    return { accepted: false, code: "invalid_appointment_id" };
  }
  if (
    !Number.isSafeInteger(input.expectedAppointmentVersion) ||
    input.expectedAppointmentVersion < 1
  ) {
    return { accepted: false, code: "invalid_expected_appointment_version" };
  }
  if (!input.appointmentRepository || typeof input.appointmentRepository.getAppointmentById !== "function") {
    return { accepted: false, code: "invalid_appointment_repository" };
  }
  if (typeof input.appointmentRepository.listAppointments !== "function") {
    return { accepted: false, code: "invalid_appointment_repository" };
  }
  if (requireIdempotency && !isValidIdempotencyStore(input.idempotencyStore)) {
    return { accepted: false, code: "invalid_appointment_change_idempotency_store" };
  }
  const idempotencyKey = normalizeText(input.idempotencyKey);
  if (requireIdempotency && (!idempotencyKey || !/^[A-Za-z0-9:_-]{1,128}$/.test(idempotencyKey))) {
    return { accepted: false, code: "invalid_idempotency_key" };
  }
  const appointment = input.appointmentRepository.getAppointmentById(appointmentId);
  if (!appointment) {
    return {
      accepted: false,
      code: "appointment_not_found",
      reason: "Appointment was not found.",
      appointmentId,
      notFound: true,
    };
  }
  return {
    accepted: true,
    appointmentId,
    selectedSlotId,
    expectedAppointmentVersion: input.expectedAppointmentVersion,
    idempotencyKey,
    appointment,
    appointmentRepository: input.appointmentRepository,
    idempotencyStore: input.idempotencyStore,
    actor: normalizeActor(input.actor),
    now: input.now,
  };
}

function resolveIdempotencyReplay({ idempotencyStore, idempotencyKey, requestFingerprint }) {
  const observed = idempotencyStore.observe(idempotencyKey);
  if (!observed) return null;
  if (observed.requestFingerprint !== requestFingerprint) {
    return reject({
      code: "idempotency_key_conflict",
      reason: "Idempotency key was already used for a different appointment operation.",
      conflict: true,
    });
  }
  const stored = idempotencyStore.getResult(idempotencyKey);
  return stored
    ? freezeClone({
        ...stored,
        accepted: true,
        matchingReplay: true,
        replayedResultOnly: true,
        mutationApplied: false,
        providerCalled: false,
        appointmentVersionChanged: false,
        appointmentRepositoryVersionChanged: false,
      })
    : null;
}

function rejectIdempotency(result, appointmentId) {
  return reject({
    code: result?.code || "appointment_idempotency_failed",
    reason: result?.reason || "Idempotency guard failed safely.",
    appointmentId,
    conflict: result?.code === "idempotency_key_conflict",
  });
}

function buildCalendarChangeCommand(appointment) {
  return freezeClone({
    appointmentId: appointment.id,
    providerEventId: appointment.calendarEventId,
    selectedSlot: {
      id: appointment.selectedSlotId,
      start_at: appointment.startAt,
      end_at: appointment.endAt,
      timezone: demoClinic.timezone || "Europe/Istanbul",
      duration_minutes: appointment.durationMinutes,
    },
    doctor: appointment.doctor,
    treatmentInterest: appointment.treatment,
    appointmentPurposeLabel: appointment.appointmentPurposeLabel,
  });
}

function projectSlot(value) {
  return freezeClone({
    id: value.selectedSlotId || value.id,
    doctorId: value.doctor?.id || value.doctorId,
    doctorName: value.doctor?.name || value.doctorName,
    startAt: value.startAt,
    endAt: value.endAt,
    durationMinutes: value.durationMinutes,
    timezone: value.timezone || demoClinic.timezone || "Europe/Istanbul",
  });
}

function normalizeActor(actor) {
  return {
    actorId: normalizeText(actor?.actorId || actor?.userId || actor?.username || "system"),
    actorRole: normalizeText(actor?.actorRole || actor?.role || "system"),
  };
}

function normalizeAppointmentStatus(appointment) {
  const status = normalizeText(appointment?.appointmentStatus || appointment?.status);
  return status === APPOINTMENT_STATUS.CANCELLED
    ? APPOINTMENT_STATUS.CANCELLED
    : APPOINTMENT_STATUS.SCHEDULED;
}

function isValidIdempotencyStore(store) {
  return (
    store &&
    typeof store.observe === "function" &&
    typeof store.getResult === "function" &&
    typeof store.reserveResult === "function" &&
    typeof store.storeResult === "function"
  );
}

function buildFingerprint(parts) {
  return Object.entries(parts)
    .map(([key, value]) => `${key}:${normalizeText(value)}`)
    .join("|");
}

function weekdayKeyFromDate(value) {
  const date = new Date(value);
  return [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][date.getUTCDay()];
}

function datePart(value) {
  return normalizeText(value).slice(0, 10);
}

function addMinutes(value, minutes) {
  const date = new Date(value);
  const shifted = new Date(date.getTime() + minutes * 60 * 1000);
  const local = new Date(shifted.getTime() + 3 * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}T${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}:00+03:00`;
}

function isFutureSlot(slot, now = new Date()) {
  return new Date(slot.startAt).getTime() > new Date(now).getTime();
}

function rangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return new Date(firstStart).getTime() < new Date(secondEnd).getTime()
    && new Date(secondStart).getTime() < new Date(firstEnd).getTime();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function reject(issue) {
  return freezeClone({
    accepted: false,
    code: issue.code || "appointment_change_failed",
    reason: issue.reason || "Appointment change request was rejected safely.",
    appointmentId: issue.appointmentId || null,
    conflict: issue.conflict === true,
    blocked: issue.blocked === true,
    notFound: issue.notFound === true,
    internal: issue.internal === true,
    ambiguous: issue.ambiguous === true,
    providerFailed: issue.providerFailed === true,
    providerUnavailable: issue.providerUnavailable === true,
    mutationApplied: false,
    providerCalled: issue.providerCalled === true,
    calendarWritten: issue.calendarWritten === true,
    messageSent: issue.messageSent === true,
    databasePersisted: false,
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function freezeClone(value) {
  return value === undefined ? value : deepFreeze(JSON.parse(JSON.stringify(value)));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

module.exports = {
  CALENDAR_CANCELLATION_CONFIRMATION,
  CALENDAR_RESCHEDULE_CONFIRMATION,
  CANCELLATION_CONFIRMATION,
  CANCELLATION_NOTIFICATION_CONFIRMATION,
  RESCHEDULE_CONFIRMATION,
  RESCHEDULE_NOTIFICATION_CONFIRMATION,
  applyAppointmentCancellation,
  applyAppointmentReschedule,
  buildTrustedReplacementSlots,
  createAppointmentCancellationPreview,
  createAppointmentReschedulePreview,
  dispatchAppointmentChangeNotification,
  syncAppointmentChangeToCalendar,
};
