const {
  APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS,
  APPOINTMENT_LIFECYCLE_EVENT_TYPES,
  APPOINTMENT_NOTIFICATION_STATUS,
  APPOINTMENT_STATUS,
  CALENDAR_SYNC_STATUS,
  CONFIRMATION_MESSAGE_STATUS,
} = require("../secretary/appointmentReviewAppointmentRepository");
const {
  cloneValue,
  freezeClone,
  parseJsonObject,
  stringifyJson,
} = require("./sqliteJson");

const STORAGE = "sqlite";
const PERSISTENCE = "sqlite";
const REPOSITORY_NAME = "appointments";

function createSqliteAppointmentReviewAppointmentRepository({
  persistenceProvider,
}) {
  const database = persistenceProvider.getDatabase();
  const clinicId = persistenceProvider.getClinicId();
  ensureRepositoryMetadata(database, clinicId);

  return Object.freeze({
    repositoryType: "sqlite_appointment_review_appointment_repository_v1",
    storage: STORAGE,
    durablePersistence: true,
    createAppointment(input) {
      const validation = validateAppointmentInput(input);

      if (!validation.ok) {
        return reject(validation.error);
      }

      if (findAppointmentBySourceReviewId(database, clinicId, validation.appointment.sourceReviewId)) {
        return reject({
          code: "appointment_already_created_for_review",
          message: "An appointment already exists for this appointment review.",
        });
      }

      const nextRepositoryVersion = getRepositoryVersion(database, clinicId) + 1;
      const appointment = {
        ...validation.appointment,
        id: `appointment_${nextRepositoryVersion}`,
        version: 1,
        storage: STORAGE,
        persistence: PERSISTENCE,
        durablePersistence: true,
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
        databasePersisted: true,
      };

      if (getAppointmentById(database, clinicId, appointment.id)) {
        return reject({
          code: "duplicate_appointment_id",
          message: "Appointment id already exists.",
        });
      }

      const now = new Date().toISOString();
      database
        .prepare(
          `INSERT INTO appointments (
            clinic_id, appointment_id, source_review_id,
            appointment_json, appointment_version, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          clinicId,
          appointment.id,
          appointment.sourceReviewId,
          stringifyJson(appointment),
          appointment.version,
          now,
          now
        );
      setRepositoryVersion(database, clinicId, nextRepositoryVersion);
      appendLifecycleEvent(database, clinicId, {
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
        appointmentRepositoryVersion: nextRepositoryVersion,
        appointmentCreated: true,
        durablePersistence: true,
        calendarWritten: false,
        messageSent: false,
        databasePersisted: true,
      });
    },
    getAppointmentById(appointmentId) {
      return getAppointmentById(database, clinicId, normalizeText(appointmentId));
    },
    findAppointmentBySourceReviewId(reviewId) {
      return findAppointmentBySourceReviewId(database, clinicId, normalizeText(reviewId));
    },
    linkAppointmentCalendarEvent(input) {
      const validation = validateCalendarLinkInput(input);

      if (!validation.ok) {
        return reject(validation.error);
      }

      const appointment = getAppointmentById(database, clinicId, validation.appointmentId);

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

      const nextRepositoryVersion = getRepositoryVersion(database, clinicId) + 1;
      const updatedAppointment = {
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
      };

      updateAppointment(database, clinicId, validation.appointmentId, updatedAppointment);
      setRepositoryVersion(database, clinicId, nextRepositoryVersion);

      return freezeClone({
        status: "ok",
        appointment: updatedAppointment,
        previousAppointmentVersion: appointment.version,
        nextAppointmentVersion: updatedAppointment.version,
        appointmentRepositoryVersion: nextRepositoryVersion,
        appointmentCalendarLinkRecorded: true,
        repositoryVersionChanged: true,
        durablePersistence: true,
        calendarWritten: true,
        messageSent: false,
        databasePersisted: true,
      });
    },
    linkAppointmentConfirmationMessage(input) {
      const validation = validateConfirmationLinkInput(input);

      if (!validation.ok) {
        return reject(validation.error);
      }

      const appointment = getAppointmentById(database, clinicId, validation.appointmentId);

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

      const nextRepositoryVersion = getRepositoryVersion(database, clinicId) + 1;
      const updatedAppointment = {
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
      };

      updateAppointment(database, clinicId, validation.appointmentId, updatedAppointment);
      setRepositoryVersion(database, clinicId, nextRepositoryVersion);

      return freezeClone({
        status: "ok",
        appointment: updatedAppointment,
        previousAppointmentVersion: appointment.version,
        nextAppointmentVersion: updatedAppointment.version,
        appointmentRepositoryVersion: nextRepositoryVersion,
        confirmationMessageLinkRecorded: true,
        repositoryVersionChanged: true,
        durablePersistence: true,
        messageSent: validation.initialStatus === CONFIRMATION_MESSAGE_STATUS.SENT,
        whatsappSent: false,
        emailSent: false,
        smsSent: false,
        calendarWritten: false,
        databasePersisted: true,
      });
    },
    listAppointments() {
      return database
        .prepare(
          `SELECT appointment_json
           FROM appointments
           WHERE clinic_id = ?
           ORDER BY appointment_id`
        )
        .all(clinicId)
        .flatMap((row) => {
          const appointment = parseJsonObject(row.appointment_json);
          return appointment ? [freezeClone(appointment)] : [];
        });
    },
    getVersion() {
      return getRepositoryVersion(database, clinicId);
    },
    rescheduleAppointment(input) {
      const validation = validateRescheduleInput(input);

      if (!validation.ok) {
        return reject(validation.error);
      }

      const appointment = getAppointmentById(database, clinicId, validation.appointmentId);
      const conflict = validateMutableAppointment({
        appointment,
        expectedVersion: validation.expectedVersion,
      });

      if (conflict) {
        return reject(conflict);
      }

      const nextRepositoryVersion = getRepositoryVersion(database, clinicId) + 1;
      const updatedAppointment = {
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
      };

      updateAppointment(database, clinicId, validation.appointmentId, updatedAppointment);
      setRepositoryVersion(database, clinicId, nextRepositoryVersion);
      const lifecycleEvent = appendLifecycleEvent(database, clinicId, {
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
        databasePersisted: true,
        calendarWritten: false,
        messageSent: false,
      });
    },
    cancelAppointment(input) {
      const validation = validateCancellationInput(input);

      if (!validation.ok) {
        return reject(validation.error);
      }

      const appointment = getAppointmentById(database, clinicId, validation.appointmentId);
      const conflict = validateMutableAppointment({
        appointment,
        expectedVersion: validation.expectedVersion,
      });

      if (conflict) {
        return reject(conflict);
      }

      const nextRepositoryVersion = getRepositoryVersion(database, clinicId) + 1;
      const updatedAppointment = {
        ...appointment,
        version: appointment.version + 1,
        appointmentStatus: APPOINTMENT_STATUS.CANCELLED,
        status: APPOINTMENT_STATUS.CANCELLED,
        calendarFollowUpStatus: appointment.calendarLinked
          ? APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.CANCELLATION_REQUIRED
          : APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.NOT_REQUIRED,
        notificationFollowUpStatus:
          APPOINTMENT_NOTIFICATION_STATUS.CANCELLATION_REQUIRED,
      };

      updateAppointment(database, clinicId, validation.appointmentId, updatedAppointment);
      setRepositoryVersion(database, clinicId, nextRepositoryVersion);
      const lifecycleEvent = appendLifecycleEvent(database, clinicId, {
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
        databasePersisted: true,
        calendarWritten: false,
        messageSent: false,
      });
    },
    markCalendarRescheduleSynchronized(input) {
      return markFollowUp(database, clinicId, {
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
      return markFollowUp(database, clinicId, {
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
      return markFollowUp(database, clinicId, {
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
      return markFollowUp(database, clinicId, {
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
      return listLifecycleEvents(database, clinicId, normalizeText(appointmentId));
    },
  });
}

function getAppointmentById(database, clinicId, appointmentId) {
  if (!appointmentId) {
    return null;
  }

  const row = database
    .prepare(
      `SELECT appointment_json
       FROM appointments
       WHERE clinic_id = ? AND appointment_id = ?`
    )
    .get(clinicId, appointmentId);

  const appointment = row ? parseJsonObject(row.appointment_json) : null;
  return appointment ? freezeClone(appointment) : null;
}

function findAppointmentBySourceReviewId(database, clinicId, sourceReviewId) {
  if (!sourceReviewId) {
    return null;
  }

  const row = database
    .prepare(
      `SELECT appointment_json
       FROM appointments
       WHERE clinic_id = ? AND source_review_id = ?`
    )
    .get(clinicId, sourceReviewId);

  const appointment = row ? parseJsonObject(row.appointment_json) : null;
  return appointment ? freezeClone(appointment) : null;
}

function updateAppointment(database, clinicId, appointmentId, appointment) {
  database
    .prepare(
      `UPDATE appointments
       SET appointment_json = ?, appointment_version = ?, updated_at = ?
       WHERE clinic_id = ? AND appointment_id = ?`
    )
    .run(
      stringifyJson(appointment),
      appointment.version,
      new Date().toISOString(),
      clinicId,
      appointmentId
    );
}

function ensureRepositoryMetadata(database, clinicId) {
  database
    .prepare(
      `INSERT OR IGNORE INTO repository_metadata (
        clinic_id, repository_name, version, updated_at
      )
      VALUES (?, ?, 0, ?)`
    )
    .run(clinicId, REPOSITORY_NAME, new Date().toISOString());
}

function getRepositoryVersion(database, clinicId) {
  const row = database
    .prepare(
      `SELECT version FROM repository_metadata
       WHERE clinic_id = ? AND repository_name = ?`
    )
    .get(clinicId, REPOSITORY_NAME);

  return row ? row.version : 0;
}

function setRepositoryVersion(database, clinicId, version) {
  database
    .prepare(
      `UPDATE repository_metadata
       SET version = ?, updated_at = ?
       WHERE clinic_id = ? AND repository_name = ?`
    )
    .run(version, new Date().toISOString(), clinicId, REPOSITORY_NAME);
}

function markFollowUp(database, clinicId, { input, expectedStatus, nextFields, eventType }) {
  const validation = validateFollowUpInput(input);

  if (!validation.ok) {
    return reject(validation.error);
  }

  const appointment = getAppointmentById(database, clinicId, validation.appointmentId);

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

  const currentStatus = expectedStatus.includes("notification")
    ? appointment.notificationFollowUpStatus
    : appointment.calendarFollowUpStatus;

  if (currentStatus !== expectedStatus) {
    return reject({
      code: "appointment_follow_up_not_required",
      message: "Appointment follow-up is not currently required.",
    });
  }

  const nextRepositoryVersion = getRepositoryVersion(database, clinicId) + 1;
  const updatedAppointment = {
    ...appointment,
    ...nextFields,
    version: appointment.version + 1,
  };
  updateAppointment(database, clinicId, validation.appointmentId, updatedAppointment);
  setRepositoryVersion(database, clinicId, nextRepositoryVersion);
  const lifecycleEvent = appendLifecycleEvent(database, clinicId, {
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
    databasePersisted: true,
  });
}

function appendLifecycleEvent(
  database,
  clinicId,
  {
    appointmentId,
    eventType,
    previousAppointmentVersion,
    resultingAppointmentVersion,
    event,
  }
) {
  const sequenceRow = database
    .prepare(
      `SELECT COALESCE(MAX(created_sequence), 0) AS sequence
       FROM appointment_lifecycle_events
       WHERE clinic_id = ? AND appointment_id = ?`
    )
    .get(clinicId, appointmentId);
  const createdSequence = Number(sequenceRow?.sequence || 0) + 1;
  const createdAt = new Date().toISOString();
  const eventId = `${appointmentId}_${eventType}_${createdSequence}`;
  const storedEvent = {
    eventId,
    appointmentId,
    eventType,
    previousAppointmentVersion,
    resultingAppointmentVersion,
    createdSequence,
    createdAt,
    ...event,
  };

  database
    .prepare(
      `INSERT INTO appointment_lifecycle_events (
        clinic_id, event_id, appointment_id, event_type,
        previous_appointment_version, resulting_appointment_version,
        event_json, created_sequence, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      clinicId,
      eventId,
      appointmentId,
      eventType,
      previousAppointmentVersion,
      resultingAppointmentVersion,
      stringifyJson(storedEvent),
      createdSequence,
      createdAt
    );

  return freezeClone(storedEvent);
}

function listLifecycleEvents(database, clinicId, appointmentId) {
  if (!appointmentId) {
    return [];
  }

  return database
    .prepare(
      `SELECT event_json
       FROM appointment_lifecycle_events
       WHERE clinic_id = ? AND appointment_id = ?
       ORDER BY created_sequence`
    )
    .all(clinicId, appointmentId)
    .flatMap((row) => {
      const event = parseJsonObject(row.event_json);
      return event ? [freezeClone(event)] : [];
    });
}

function validateAppointmentInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return validationError("invalid_appointment_input", "Appointment input must be an object.");
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
    return validationError("incomplete_appointment_candidate", "Trusted appointment candidate is incomplete.");
  }

  return {
    ok: true,
    appointment: {
      source: "appointment_review",
      sourceReviewId,
      selectedSlotId,
      doctor: { id: doctorId, name: doctorName },
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
      status: "created_sqlite",
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

function validateCalendarLinkInput(input) {
  const base = validateLinkBaseInput(input);

  if (!base.ok) {
    return base;
  }

  const providerEventId = normalizeText(input.providerEventId);
  const syncMode = normalizeText(input.syncMode) || "configured_provider";

  if (!providerEventId || providerEventId.length > 256) {
    return validationError("invalid_calendar_event_id", "Calendar link input requires a safe provider event id.");
  }

  return { ...base, providerEventId, syncMode };
}

function validateConfirmationLinkInput(input) {
  const base = validateLinkBaseInput(input);

  if (!base.ok) {
    return base;
  }

  const providerMessageId = normalizeText(input.providerMessageId);
  const initialStatus = normalizeConfirmationStatus(input.initialStatus);

  if (!providerMessageId || providerMessageId.length > 256) {
    return validationError("invalid_provider_message_id", "Confirmation link input requires a safe provider message id.");
  }

  return { ...base, providerMessageId, initialStatus };
}

function normalizeConfirmationStatus(value) {
  const status = normalizeText(value);
  return Object.values(CONFIRMATION_MESSAGE_STATUS).includes(status)
    ? status
    : CONFIRMATION_MESSAGE_STATUS.SENT;
}

function validateLinkBaseInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return validationError("invalid_link_input", "Appointment link input must be an object.");
  }

  const appointmentId = normalizeText(input.appointmentId);
  const provider = normalizeText(input.provider);

  if (!appointmentId || !/^[a-z0-9_:-]+$/.test(appointmentId)) {
    return validationError("invalid_appointment_id", "Appointment link input requires a safe appointmentId.");
  }

  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    return validationError("invalid_expected_appointment_version", "Appointment link input requires a positive expectedVersion.");
  }

  if (!provider || !/^[a-z0-9_:-]+$/.test(provider)) {
    return validationError("invalid_provider", "Appointment link input requires a safe provider name.");
  }

  return {
    ok: true,
    appointmentId,
    expectedVersion: input.expectedVersion,
    provider,
  };
}

function cloneSafeOutboundDestination(destination) {
  const channel = normalizeText(destination.channel);
  const reference = normalizeText(destination.reference);
  const maskedLabel = normalizeText(destination.maskedLabel);

  if (!channel || !reference || !maskedLabel) {
    return null;
  }

  return { channel, reference, maskedLabel };
}

function reject(error) {
  return freezeClone({
    status: "error",
    error,
    appointmentCreated: false,
    durablePersistence: true,
    calendarWritten: false,
    messageSent: false,
    databasePersisted: true,
  });
}

function validationError(code, message) {
  return { ok: false, error: { code, message } };
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  createSqliteAppointmentReviewAppointmentRepository,
};
