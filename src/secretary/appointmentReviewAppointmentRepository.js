const APPOINTMENT_REPOSITORY_TYPE =
  "appointment_review_in_memory_appointment_repository_v1";
const STORAGE = "in_memory";
const NOT_PERSISTED = "not_persisted";
const CALENDAR_SYNC_STATUS = Object.freeze({
  NOT_SYNCED: "not_synced",
  SYNCED: "synced",
});
const CONFIRMATION_MESSAGE_STATUS = Object.freeze({
  NOT_SENT: "not_sent",
  ACCEPTED: "accepted",
  SENT: "sent",
});
const APPOINTMENT_STATUS = Object.freeze({
  SCHEDULED: "scheduled",
  CANCELLED: "cancelled",
});
const APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS = Object.freeze({
  NOT_REQUIRED: "not_required",
  CREATE_REQUIRED: "create_required",
  UPDATE_REQUIRED: "update_required",
  CANCELLATION_REQUIRED: "cancellation_required",
  SYNCHRONIZED: "synchronized",
});
const APPOINTMENT_NOTIFICATION_STATUS = Object.freeze({
  NOT_REQUIRED: "not_required",
  CONFIRMATION_REQUIRED: "confirmation_required",
  RESCHEDULE_REQUIRED: "reschedule_notification_required",
  CANCELLATION_REQUIRED: "cancellation_notification_required",
  DISPATCHED: "dispatched",
});
const APPOINTMENT_LIFECYCLE_EVENT_TYPES = Object.freeze({
  CREATED: "appointment_created",
  RESCHEDULED: "appointment_rescheduled",
  CANCELLED: "appointment_cancelled",
  CALENDAR_RESCHEDULE_SYNCHRONIZED: "calendar_reschedule_synchronized",
  CALENDAR_CANCELLATION_SYNCHRONIZED: "calendar_cancellation_synchronized",
  RESCHEDULE_NOTIFICATION_DISPATCHED: "reschedule_notification_dispatched",
  CANCELLATION_NOTIFICATION_DISPATCHED: "cancellation_notification_dispatched",
});

function createInMemoryAppointmentReviewAppointmentRepository() {
  const appointments = new Map();
  const appointmentIdByReviewId = new Map();
  const lifecycleEvents = new Map();
  let version = 0;
  let lifecycleSequence = 0;

  return Object.freeze({
    repositoryType: APPOINTMENT_REPOSITORY_TYPE,
    storage: STORAGE,
    durablePersistence: false,
    createAppointment(input) {
      const validation = validateAppointmentInput(input);

      if (!validation.ok) {
        return reject(validation.error);
      }

      if (appointmentIdByReviewId.has(validation.appointment.sourceReviewId)) {
        return reject({
          code: "appointment_already_created_for_review",
          message: "An appointment already exists for this appointment review.",
        });
      }

      const nextVersion = version + 1;
      const appointment = {
        ...validation.appointment,
        id: `appointment_${nextVersion}`,
        version: 1,
        storage: STORAGE,
        persistence: NOT_PERSISTED,
        durablePersistence: false,
        calendarSyncStatus: CALENDAR_SYNC_STATUS.NOT_SYNCED,
        calendarLinked: false,
        calendarProvider: null,
        calendarEventId: null,
        calendarWritten: false,
        confirmationMessageStatus: CONFIRMATION_MESSAGE_STATUS.NOT_SENT,
        confirmationMessageLinked: false,
        confirmationMessagingProvider: null,
        confirmationProviderMessageId: null,
        confirmationDispatchAccepted: false,
        appointmentStatus: APPOINTMENT_STATUS.SCHEDULED,
        calendarFollowUpStatus: APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.CREATE_REQUIRED,
        notificationFollowUpStatus:
          APPOINTMENT_NOTIFICATION_STATUS.CONFIRMATION_REQUIRED,
        calendarChangeProviderEventId: null,
        changeNotificationProviderMessageId: null,
        realPatientDelivery: false,
        messageSent: false,
        databasePersisted: false,
      };

      if (appointments.has(appointment.id)) {
        return reject({
          code: "duplicate_appointment_id",
          message: "Appointment id already exists.",
        });
      }

      version = nextVersion;
      appointments.set(appointment.id, freezeClone(appointment));
      appointmentIdByReviewId.set(appointment.sourceReviewId, appointment.id);
      appendLifecycleEvent({
        appointmentId: appointment.id,
        eventType: APPOINTMENT_LIFECYCLE_EVENT_TYPES.CREATED,
        previousAppointmentVersion: 0,
        resultingAppointmentVersion: appointment.version,
        event: {
          appointmentId: appointment.id,
          eventType: APPOINTMENT_LIFECYCLE_EVENT_TYPES.CREATED,
          previousAppointmentVersion: 0,
          resultingAppointmentVersion: appointment.version,
          resultingStartAt: appointment.startAt,
          resultingEndAt: appointment.endAt,
          actor: { actorId: "system", actorRole: "system" },
        },
      });

      return freezeClone({
        status: "ok",
        appointment,
        appointmentRepositoryVersion: version,
        appointmentCreated: true,
        durablePersistence: false,
        calendarWritten: false,
        messageSent: false,
        databasePersisted: false,
      });
    },
    getAppointmentById(appointmentId) {
      const id = normalizeText(appointmentId);

      return id && appointments.has(id)
        ? freezeClone(appointments.get(id))
        : null;
    },
    findAppointmentBySourceReviewId(reviewId) {
      const sourceReviewId = normalizeText(reviewId);
      const appointmentId = appointmentIdByReviewId.get(sourceReviewId);

      return appointmentId ? freezeClone(appointments.get(appointmentId)) : null;
    },
    linkAppointmentCalendarEvent(input) {
      const validation = validateCalendarLinkInput(input);

      if (!validation.ok) {
        return reject(validation.error);
      }

      const appointment = appointments.get(validation.appointmentId);

      if (!appointment) {
        return reject({
          code: "appointment_not_found",
          message: "Appointment was not found.",
        });
      }

      if (appointment.version !== validation.expectedVersion) {
        return reject({
          code: "appointment_version_conflict",
          message: "Appointment version changed before calendar link.",
        });
      }

      if (appointment.calendarLinked === true || appointment.calendarEventId) {
        return reject({
          code: "appointment_already_calendar_synced",
          message: "Appointment already has a linked calendar event.",
        });
      }

      const nextRepositoryVersion = version + 1;
      const updatedAppointment = freezeClone({
        ...appointment,
        version: appointment.version + 1,
        calendarSyncStatus: CALENDAR_SYNC_STATUS.SYNCED,
        calendarLinked: true,
        calendarProvider: validation.provider,
        calendarEventId: validation.providerEventId,
        calendarWritten: true,
        calendarLinkRecorded: true,
        calendarSyncMode: validation.syncMode,
        calendarFollowUpStatus: APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.SYNCHRONIZED,
      });

      version = nextRepositoryVersion;
      appointments.set(validation.appointmentId, updatedAppointment);

      return freezeClone({
        status: "ok",
        appointment: updatedAppointment,
        previousAppointmentVersion: appointment.version,
        nextAppointmentVersion: updatedAppointment.version,
        appointmentRepositoryVersion: version,
        appointmentCalendarLinkRecorded: true,
        repositoryVersionChanged: true,
        durablePersistence: false,
        calendarWritten: true,
        messageSent: false,
        databasePersisted: false,
      });
    },
    linkAppointmentConfirmationMessage(input) {
      const validation = validateConfirmationLinkInput(input);

      if (!validation.ok) {
        return reject(validation.error);
      }

      const appointment = appointments.get(validation.appointmentId);

      if (!appointment) {
        return reject({
          code: "appointment_not_found",
          message: "Appointment was not found.",
        });
      }

      if (appointment.version !== validation.expectedVersion) {
        return reject({
          code: "appointment_version_conflict",
          message: "Appointment version changed before confirmation link.",
        });
      }

      if (
        appointment.confirmationMessageLinked === true ||
        appointment.confirmationProviderMessageId
      ) {
        return reject({
          code: "appointment_already_confirmation_dispatched",
          message: "Appointment already has a linked confirmation message.",
        });
      }

      const nextRepositoryVersion = version + 1;
      const updatedAppointment = freezeClone({
        ...appointment,
        version: appointment.version + 1,
        confirmationMessageStatus: validation.initialStatus,
        confirmationMessageLinked: true,
        confirmationMessagingProvider: validation.provider,
        confirmationProviderMessageId: validation.providerMessageId,
        confirmationDispatchAccepted: true,
        realPatientDelivery: false,
        messageSent: validation.initialStatus === CONFIRMATION_MESSAGE_STATUS.SENT,
        confirmationMessageLinkRecorded: true,
        notificationFollowUpStatus:
          APPOINTMENT_NOTIFICATION_STATUS.DISPATCHED,
      });

      version = nextRepositoryVersion;
      appointments.set(validation.appointmentId, updatedAppointment);

      return freezeClone({
        status: "ok",
        appointment: updatedAppointment,
        previousAppointmentVersion: appointment.version,
        nextAppointmentVersion: updatedAppointment.version,
        appointmentRepositoryVersion: version,
        confirmationMessageLinkRecorded: true,
        repositoryVersionChanged: true,
        durablePersistence: false,
        messageSent: validation.initialStatus === CONFIRMATION_MESSAGE_STATUS.SENT,
        whatsappSent: false,
        emailSent: false,
        smsSent: false,
        calendarWritten: false,
        databasePersisted: false,
      });
    },
    listAppointments() {
      return Array.from(appointments.values()).map((appointment) =>
        freezeClone(appointment)
      );
    },
    getVersion() {
      return version;
    },
    rescheduleAppointment(input) {
      const validation = validateRescheduleInput(input);

      if (!validation.ok) {
        return reject(validation.error);
      }

      const appointment = appointments.get(validation.appointmentId);
      const conflict = validateMutableAppointment({
        appointment,
        expectedVersion: validation.expectedVersion,
      });

      if (conflict) {
        return reject(conflict);
      }

      const nextRepositoryVersion = version + 1;
      const updatedAppointment = freezeClone({
        ...appointment,
        version: appointment.version + 1,
        selectedSlotId: validation.slot.id,
        startAt: validation.slot.startAt,
        endAt: validation.slot.endAt,
        durationMinutes: validation.slot.durationMinutes,
        appointmentStatus: APPOINTMENT_STATUS.SCHEDULED,
        calendarFollowUpStatus: appointment.calendarLinked
          ? APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.UPDATE_REQUIRED
          : appointment.calendarFollowUpStatus,
        notificationFollowUpStatus:
          APPOINTMENT_NOTIFICATION_STATUS.RESCHEDULE_REQUIRED,
        rescheduleRequired: false,
        cancellationRequired: false,
      });
      version = nextRepositoryVersion;
      appointments.set(validation.appointmentId, updatedAppointment);
      const lifecycleEvent = appendLifecycleEvent({
        appointmentId: validation.appointmentId,
        eventType: APPOINTMENT_LIFECYCLE_EVENT_TYPES.RESCHEDULED,
        previousAppointmentVersion: appointment.version,
        resultingAppointmentVersion: updatedAppointment.version,
        event: {
          appointmentId: validation.appointmentId,
          eventType: APPOINTMENT_LIFECYCLE_EVENT_TYPES.RESCHEDULED,
          previousAppointmentVersion: appointment.version,
          resultingAppointmentVersion: updatedAppointment.version,
          previousStartAt: appointment.startAt,
          previousEndAt: appointment.endAt,
          resultingStartAt: updatedAppointment.startAt,
          resultingEndAt: updatedAppointment.endAt,
          actor: validation.actor,
          idempotencyKey: validation.idempotencyKey,
        },
      });

      return freezeClone({
        status: "ok",
        appointment: updatedAppointment,
        lifecycleEvent,
        previousAppointmentVersion: appointment.version,
        nextAppointmentVersion: updatedAppointment.version,
        appointmentRepositoryVersion: nextRepositoryVersion,
        appointmentVersionChanged: true,
        appointmentRepositoryVersionChanged: true,
        databasePersisted: false,
        calendarWritten: false,
        messageSent: false,
      });
    },
    cancelAppointment(input) {
      const validation = validateCancellationInput(input);

      if (!validation.ok) {
        return reject(validation.error);
      }

      const appointment = appointments.get(validation.appointmentId);
      const conflict = validateMutableAppointment({
        appointment,
        expectedVersion: validation.expectedVersion,
      });

      if (conflict) {
        return reject(conflict);
      }

      const nextRepositoryVersion = version + 1;
      const updatedAppointment = freezeClone({
        ...appointment,
        version: appointment.version + 1,
        appointmentStatus: APPOINTMENT_STATUS.CANCELLED,
        status: APPOINTMENT_STATUS.CANCELLED,
        calendarFollowUpStatus: appointment.calendarLinked
          ? APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.CANCELLATION_REQUIRED
          : APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.NOT_REQUIRED,
        notificationFollowUpStatus:
          APPOINTMENT_NOTIFICATION_STATUS.CANCELLATION_REQUIRED,
      });
      version = nextRepositoryVersion;
      appointments.set(validation.appointmentId, updatedAppointment);
      const lifecycleEvent = appendLifecycleEvent({
        appointmentId: validation.appointmentId,
        eventType: APPOINTMENT_LIFECYCLE_EVENT_TYPES.CANCELLED,
        previousAppointmentVersion: appointment.version,
        resultingAppointmentVersion: updatedAppointment.version,
        event: {
          appointmentId: validation.appointmentId,
          eventType: APPOINTMENT_LIFECYCLE_EVENT_TYPES.CANCELLED,
          previousAppointmentVersion: appointment.version,
          resultingAppointmentVersion: updatedAppointment.version,
          previousStartAt: appointment.startAt,
          previousEndAt: appointment.endAt,
          actor: validation.actor,
          idempotencyKey: validation.idempotencyKey,
        },
      });

      return freezeClone({
        status: "ok",
        appointment: updatedAppointment,
        lifecycleEvent,
        previousAppointmentVersion: appointment.version,
        nextAppointmentVersion: updatedAppointment.version,
        appointmentRepositoryVersion: nextRepositoryVersion,
        appointmentVersionChanged: true,
        appointmentRepositoryVersionChanged: true,
        databasePersisted: false,
        calendarWritten: false,
        messageSent: false,
      });
    },
    markCalendarRescheduleSynchronized(input) {
      return markFollowUp({
        input,
        expectedStatus: APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.UPDATE_REQUIRED,
        nextFields: {
          calendarFollowUpStatus:
            APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.SYNCHRONIZED,
          calendarChangeProviderEventId: normalizeText(input?.providerEventId),
        },
        eventType:
          APPOINTMENT_LIFECYCLE_EVENT_TYPES.CALENDAR_RESCHEDULE_SYNCHRONIZED,
      });
    },
    markCalendarCancellationSynchronized(input) {
      return markFollowUp({
        input,
        expectedStatus:
          APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.CANCELLATION_REQUIRED,
        nextFields: {
          calendarFollowUpStatus:
            APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.SYNCHRONIZED,
          calendarChangeProviderEventId: normalizeText(input?.providerEventId),
        },
        eventType:
          APPOINTMENT_LIFECYCLE_EVENT_TYPES.CALENDAR_CANCELLATION_SYNCHRONIZED,
      });
    },
    markRescheduleNotificationDispatched(input) {
      return markFollowUp({
        input,
        expectedStatus: APPOINTMENT_NOTIFICATION_STATUS.RESCHEDULE_REQUIRED,
        nextFields: {
          notificationFollowUpStatus:
            APPOINTMENT_NOTIFICATION_STATUS.DISPATCHED,
          changeNotificationProviderMessageId: normalizeText(input?.providerMessageId),
        },
        eventType:
          APPOINTMENT_LIFECYCLE_EVENT_TYPES.RESCHEDULE_NOTIFICATION_DISPATCHED,
      });
    },
    markCancellationNotificationDispatched(input) {
      return markFollowUp({
        input,
        expectedStatus: APPOINTMENT_NOTIFICATION_STATUS.CANCELLATION_REQUIRED,
        nextFields: {
          notificationFollowUpStatus:
            APPOINTMENT_NOTIFICATION_STATUS.DISPATCHED,
          changeNotificationProviderMessageId: normalizeText(input?.providerMessageId),
        },
        eventType:
          APPOINTMENT_LIFECYCLE_EVENT_TYPES.CANCELLATION_NOTIFICATION_DISPATCHED,
      });
    },
    listLifecycleEvents(appointmentId) {
      const id = normalizeText(appointmentId);
      return (lifecycleEvents.get(id) || []).map((event) => freezeClone(event));
    },
  });

  function markFollowUp({ input, expectedStatus, nextFields, eventType }) {
    const validation = validateFollowUpInput(input);

    if (!validation.ok) {
      return reject(validation.error);
    }

    const appointment = appointments.get(validation.appointmentId);

    if (!appointment) {
      return reject({
        code: "appointment_not_found",
        message: "Appointment was not found.",
      });
    }

    if (appointment.version !== validation.expectedVersion) {
      return reject({
        code: "appointment_version_conflict",
        message: "Appointment version changed before follow-up link.",
      });
    }

    const currentStatus =
      expectedStatus.includes("notification")
        ? appointment.notificationFollowUpStatus
        : appointment.calendarFollowUpStatus;

    if (currentStatus !== expectedStatus) {
      return reject({
        code: "appointment_follow_up_not_required",
        message: "Appointment follow-up is not currently required.",
      });
    }

    const nextRepositoryVersion = version + 1;
    const updatedAppointment = freezeClone({
      ...appointment,
      ...nextFields,
      version: appointment.version + 1,
    });
    version = nextRepositoryVersion;
    appointments.set(validation.appointmentId, updatedAppointment);
    const lifecycleEvent = appendLifecycleEvent({
      appointmentId: validation.appointmentId,
      eventType,
      previousAppointmentVersion: appointment.version,
      resultingAppointmentVersion: updatedAppointment.version,
      event: {
        appointmentId: validation.appointmentId,
        eventType,
        previousAppointmentVersion: appointment.version,
        resultingAppointmentVersion: updatedAppointment.version,
        actor: validation.actor,
        idempotencyKey: validation.idempotencyKey,
      },
    });

    return freezeClone({
      status: "ok",
      appointment: updatedAppointment,
      lifecycleEvent,
      previousAppointmentVersion: appointment.version,
      nextAppointmentVersion: updatedAppointment.version,
      appointmentRepositoryVersion: nextRepositoryVersion,
      appointmentVersionChanged: true,
      appointmentRepositoryVersionChanged: true,
      databasePersisted: false,
    });
  }

  function appendLifecycleEvent({
    appointmentId,
    eventType,
    previousAppointmentVersion,
    resultingAppointmentVersion,
    event,
  }) {
    lifecycleSequence += 1;
    const stored = freezeClone({
      eventId: `${appointmentId}_${eventType}_${lifecycleSequence}`,
      appointmentId,
      eventType,
      previousAppointmentVersion,
      resultingAppointmentVersion,
      createdSequence: lifecycleSequence,
      createdAt: currentIsoTimestamp(),
      ...event,
    });
    lifecycleEvents.set(appointmentId, [
      ...(lifecycleEvents.get(appointmentId) || []),
      stored,
    ]);
    return stored;
  }
}

function validateConfirmationLinkInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return validationError(
      "invalid_confirmation_link_input",
      "Confirmation link input must be an object."
    );
  }

  const appointmentId = normalizeText(input.appointmentId);
  const provider = normalizeText(input.provider);
  const providerMessageId = normalizeText(input.providerMessageId);
  const initialStatus = normalizeConfirmationStatus(input.initialStatus);

  if (!appointmentId || !/^[a-z0-9_:-]+$/.test(appointmentId)) {
    return validationError(
      "invalid_appointment_id",
      "Confirmation link input requires a safe appointmentId."
    );
  }

  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 1
  ) {
    return validationError(
      "invalid_expected_appointment_version",
      "Confirmation link input requires a positive safe expectedVersion."
    );
  }

  if (!provider || !/^[a-z0-9_:-]+$/.test(provider)) {
    return validationError(
      "invalid_messaging_provider",
      "Confirmation link input requires a safe provider name."
    );
  }

  if (!providerMessageId || providerMessageId.length > 256) {
    return validationError(
      "invalid_provider_message_id",
      "Confirmation link input requires a safe provider message id."
    );
  }

  return {
    ok: true,
    appointmentId,
    expectedVersion: input.expectedVersion,
    provider,
    providerMessageId,
    initialStatus,
  };
}

function validateCalendarLinkInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return validationError(
      "invalid_calendar_link_input",
      "Calendar link input must be an object."
    );
  }

  const appointmentId = normalizeText(input.appointmentId);
  const provider = normalizeText(input.provider);
  const providerEventId = normalizeText(input.providerEventId);
  const syncMode = normalizeText(input.syncMode) || "configured_provider";

  if (!appointmentId || !/^[a-z0-9_:-]+$/.test(appointmentId)) {
    return validationError(
      "invalid_appointment_id",
      "Calendar link input requires a safe appointmentId."
    );
  }

  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 1
  ) {
    return validationError(
      "invalid_expected_appointment_version",
      "Calendar link input requires a positive safe expectedVersion."
    );
  }

  if (!provider || !/^[a-z0-9_:-]+$/.test(provider)) {
    return validationError(
      "invalid_calendar_provider",
      "Calendar link input requires a safe provider name."
    );
  }

  if (!providerEventId || providerEventId.length > 256) {
    return validationError(
      "invalid_calendar_event_id",
      "Calendar link input requires a safe provider event id."
    );
  }

  return {
    ok: true,
    appointmentId,
    expectedVersion: input.expectedVersion,
    provider,
    providerEventId,
    syncMode,
  };
}

function validateAppointmentInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return validationError(
      "invalid_appointment_input",
      "Appointment input must be an object."
    );
  }

  const sourceReviewId = normalizeText(input.sourceReviewId);
  const selectedSlotId = normalizeText(input.selectedSlotId);
  const doctorId = normalizeText(input.doctorId);
  const doctorName = normalizeText(input.doctorName);
  const appointmentPurpose = normalizeText(input.appointmentPurpose);
  const appointmentPurposeLabel = normalizeText(input.appointmentPurposeLabel);
  const treatment = normalizeText(input.treatment);
  const startAt = normalizeText(input.startAt);
  const endAt = normalizeText(input.endAt);

  if (
    !sourceReviewId ||
    !selectedSlotId ||
    !doctorId ||
    !doctorName ||
    !appointmentPurpose ||
    !appointmentPurposeLabel ||
    !treatment ||
    !startAt ||
    !endAt ||
    !Number.isSafeInteger(input.durationMinutes) ||
    input.durationMinutes < 1
  ) {
    return validationError(
      "incomplete_appointment_candidate",
      "Trusted appointment candidate is incomplete."
    );
  }

  return {
    ok: true,
    appointment: {
      source: "appointment_review",
      sourceReviewId,
      selectedSlotId,
      doctor: {
        id: doctorId,
        name: doctorName,
      },
      treatment,
      appointmentPurpose,
      appointmentPurposeLabel,
      startAt,
      endAt,
      durationMinutes: input.durationMinutes,
      outboundDestination:
        input.outboundDestination && typeof input.outboundDestination === "object"
          ? cloneSafeOutboundDestination(input.outboundDestination)
          : null,
      status: "created_in_memory",
    },
  };
}

function validateRescheduleInput(input) {
  const base = validateChangeBaseInput(input);

  if (!base.ok) {
    return base;
  }

  const slot = normalizeTrustedSlot(input.selectedSlot);

  if (!slot) {
    return validationError(
      "invalid_selected_reschedule_slot",
      "Reschedule requires a trusted selected slot."
    );
  }

  return { ...base, slot };
}

function validateCancellationInput(input) {
  return validateChangeBaseInput(input);
}

function validateFollowUpInput(input) {
  return validateChangeBaseInput(input);
}

function validateChangeBaseInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return validationError(
      "invalid_appointment_change_input",
      "Appointment change input must be an object."
    );
  }

  const appointmentId = normalizeText(input.appointmentId);
  const idempotencyKey = normalizeText(input.idempotencyKey);
  const actor = normalizeActor(input.actor);

  if (!appointmentId || !/^[a-z0-9_:-]+$/.test(appointmentId)) {
    return validationError(
      "invalid_appointment_id",
      "Appointment change input requires a safe appointmentId."
    );
  }

  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    return validationError(
      "invalid_expected_appointment_version",
      "Appointment change input requires a positive expectedVersion."
    );
  }

  if (!idempotencyKey || idempotencyKey.length > 128) {
    return validationError(
      idempotencyKey ? "invalid_idempotency_key" : "missing_idempotency_key",
      "Appointment change input requires a safe idempotencyKey."
    );
  }

  if (!actor) {
    return validationError(
      "invalid_appointment_change_actor",
      "Appointment change input requires a safe actor."
    );
  }

  return {
    ok: true,
    appointmentId,
    expectedVersion: input.expectedVersion,
    idempotencyKey,
    actor,
  };
}

function validateMutableAppointment({ appointment, expectedVersion }) {
  if (!appointment) {
    return {
      code: "appointment_not_found",
      message: "Appointment was not found.",
    };
  }

  if (appointment.version !== expectedVersion) {
    return {
      code: "appointment_version_conflict",
      message: "Appointment version changed before mutation.",
    };
  }

  if (normalizeAppointmentStatus(appointment) === APPOINTMENT_STATUS.CANCELLED) {
    return {
      code: "appointment_already_cancelled",
      message: "Cancelled appointments cannot be changed.",
    };
  }

  return null;
}

function normalizeTrustedSlot(slot) {
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
    return null;
  }

  const id = normalizeText(slot.id);
  const startAt = normalizeText(slot.startAt);
  const endAt = normalizeText(slot.endAt);

  if (
    !id ||
    !startAt ||
    !endAt ||
    !Number.isSafeInteger(slot.durationMinutes) ||
    slot.durationMinutes < 1
  ) {
    return null;
  }

  return {
    id,
    startAt,
    endAt,
    durationMinutes: slot.durationMinutes,
  };
}

function normalizeActor(actor) {
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) {
    return null;
  }

  const actorId = normalizeText(actor.actorId || actor.userId || actor.username);
  const actorRole = normalizeText(actor.actorRole || actor.role);

  if (!actorId || !actorRole || actorId.length > 128 || actorRole.length > 64) {
    return null;
  }

  return {
    actorId,
    actorRole,
  };
}

function normalizeAppointmentStatus(appointment) {
  const status = normalizeText(appointment?.appointmentStatus || appointment?.status);
  return status === APPOINTMENT_STATUS.CANCELLED
    ? APPOINTMENT_STATUS.CANCELLED
    : APPOINTMENT_STATUS.SCHEDULED;
}

function cloneSafeOutboundDestination(destination) {
  const channel = normalizeText(destination.channel);
  const reference = normalizeText(destination.reference);
  const maskedLabel = normalizeText(destination.maskedLabel);
  const lookupHash = normalizeText(destination.lookupHash);
  const encryptedIdentity =
    destination.encryptedIdentity &&
    typeof destination.encryptedIdentity === "object" &&
    !Array.isArray(destination.encryptedIdentity)
      ? destination.encryptedIdentity
      : null;

  if (!channel || !maskedLabel || (!reference && !lookupHash)) {
    return null;
  }

  return {
    channel,
    reference,
    maskedLabel,
    lookupHash,
    encryptedIdentity,
  };
}

function currentIsoTimestamp() {
  return new (Date)().toISOString();
}

function normalizeConfirmationStatus(value) {
  const status = normalizeText(value);
  return Object.values(CONFIRMATION_MESSAGE_STATUS).includes(status)
    ? status
    : CONFIRMATION_MESSAGE_STATUS.SENT;
}

function reject(error) {
  return freezeClone({
    status: "error",
    error,
    appointmentCreated: false,
    durablePersistence: false,
    calendarWritten: false,
    messageSent: false,
    databasePersisted: false,
  });
}

function validationError(code, message) {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
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
  APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS,
  APPOINTMENT_LIFECYCLE_EVENT_TYPES,
  APPOINTMENT_NOTIFICATION_STATUS,
  APPOINTMENT_REPOSITORY_TYPE,
  APPOINTMENT_STATUS,
  CALENDAR_SYNC_STATUS,
  CONFIRMATION_MESSAGE_STATUS,
  createInMemoryAppointmentReviewAppointmentRepository,
};
