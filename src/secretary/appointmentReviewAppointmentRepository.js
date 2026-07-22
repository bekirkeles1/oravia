const APPOINTMENT_REPOSITORY_TYPE =
  "appointment_review_in_memory_appointment_repository_v1";
const STORAGE = "in_memory";
const NOT_PERSISTED = "not_persisted";

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
        storage: STORAGE,
        persistence: NOT_PERSISTED,
        durablePersistence: false,
        calendarWritten: false,
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
      status: "created_in_memory",
    },
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
  createInMemoryAppointmentReviewAppointmentRepository,
};
