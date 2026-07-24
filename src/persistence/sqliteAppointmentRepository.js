const {
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
        confirmationMessageStatus: CONFIRMATION_MESSAGE_STATUS.SENT,
        confirmationMessageLinked: true,
        confirmationMessagingProvider: validation.provider,
        confirmationProviderMessageId: validation.providerMessageId,
        confirmationDispatchAccepted: true,
        realPatientDelivery: false,
        messageSent: true,
        confirmationMessageLinkRecorded: true,
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
        messageSent: true,
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

  if (!providerMessageId || providerMessageId.length > 256) {
    return validationError("invalid_provider_message_id", "Confirmation link input requires a safe provider message id.");
  }

  return { ...base, providerMessageId };
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
