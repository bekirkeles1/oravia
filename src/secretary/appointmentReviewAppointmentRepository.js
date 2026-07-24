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
  SENT: "sent",
});

function createInMemoryAppointmentReviewAppointmentRepository() {
  const appointments = new Map();
  const appointmentIdByReviewId = new Map();
  let version = 0;

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
        confirmationMessageStatus: CONFIRMATION_MESSAGE_STATUS.SENT,
        confirmationMessageLinked: true,
        confirmationMessagingProvider: validation.provider,
        confirmationProviderMessageId: validation.providerMessageId,
        confirmationDispatchAccepted: true,
        realPatientDelivery: false,
        messageSent: true,
        confirmationMessageLinkRecorded: true,
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
        messageSent: true,
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
  });
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

function cloneSafeOutboundDestination(destination) {
  const channel = normalizeText(destination.channel);
  const reference = normalizeText(destination.reference);
  const maskedLabel = normalizeText(destination.maskedLabel);

  if (!channel || !reference || !maskedLabel) {
    return null;
  }

  return {
    channel,
    reference,
    maskedLabel,
  };
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
  APPOINTMENT_REPOSITORY_TYPE,
  CALENDAR_SYNC_STATUS,
  CONFIRMATION_MESSAGE_STATUS,
  createInMemoryAppointmentReviewAppointmentRepository,
};
