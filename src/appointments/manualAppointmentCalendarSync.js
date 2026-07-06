const { getCalendarProvider } = require("../calendar/calendarProvider");
const { demoClinic, demoDoctor } = require("../demo/demoData");

const DEFAULT_TIMEZONE = demoClinic.timezone || "Europe/Istanbul";
const MANUAL_APPOINTMENT_SOURCE = "phone_call";
const MANUAL_APPOINTMENT_CREATED_BY = "secretary";

async function createManualAppointmentCalendarEvent(input = {}, options = {}) {
  const validation = validateManualAppointmentPayload(input, options);

  if (validation.error) {
    return validation.error;
  }

  const payload = validation.payload;
  const selectedSlot = buildManualSelectedSlot(payload);
  const calendarProvider =
    options.calendarProvider || getCalendarProvider(options.calendarProviderName);
  const calendarEvent = await calendarProvider.createCalendarEvent({
    clinic: demoClinic,
    doctor: {
      ...demoDoctor,
      name: payload.doctor
    },
    patient: {
      id: "manual_phone_patient",
      name: payload.patientName,
      phone: payload.patientPhone
    },
    treatmentInterest: payload.treatment,
    selectedSlot,
    summary: buildManualAppointmentTitle(payload),
    description: buildManualAppointmentDescription(payload)
  });

  return ok({
    appointment: {
      patient_name: payload.patientName,
      patient_phone: payload.patientPhone,
      treatment_interest: payload.treatment,
      doctor_id: demoDoctor.id,
      doctor_name: payload.doctor,
      appointment_date: payload.date,
      appointment_time: payload.time,
      duration_minutes: payload.duration,
      source: MANUAL_APPOINTMENT_SOURCE,
      created_by: MANUAL_APPOINTMENT_CREATED_BY,
      status: "confirmed",
      notes: payload.notes,
      calendar_provider: calendarEvent.calendar_provider,
      calendar_event_id: calendarEvent.calendar_event_id,
      sync_status: "synced"
    },
    selected_slot: selectedSlot,
    calendar_provider: calendarEvent.calendar_provider,
    calendar_event_id: calendarEvent.calendar_event_id,
    sync_status: "synced"
  });
}

function validateManualAppointmentPayload(input = {}, options = {}) {
  const payload = {
    patientName: normalizeText(input.patientName),
    patientPhone: normalizePhone(input.patientPhone),
    treatment: normalizeText(input.treatment),
    doctor: normalizeText(input.doctor),
    date: normalizeText(input.date),
    time: normalizeText(input.time),
    duration: Number(input.duration),
    notes: normalizeText(input.notes)
  };

  const missingFields = [];

  for (const field of [
    "patientName",
    "patientPhone",
    "treatment",
    "doctor",
    "date",
    "time"
  ]) {
    if (!payload[field]) {
      missingFields.push(field);
    }
  }

  if (!Number.isFinite(payload.duration) || payload.duration <= 0) {
    missingFields.push("duration");
  }

  if (missingFields.length > 0) {
    return {
      error: errorResponse(400, "Missing required manual appointment fields.", {
        missing_fields: missingFields
      })
    };
  }

  if (!isValidTurkishMobilePhone(payload.patientPhone)) {
    return errorResponseResult(
      400,
      "patientPhone must be a valid Turkish mobile number.",
      {
        field: "patientPhone"
      }
    );
  }

  if (!isValidDate(payload.date)) {
    return errorResponseResult(400, "date must be in YYYY-MM-DD format.", {
      field: "date"
    });
  }

  if (!isValidTime(payload.time)) {
    return errorResponseResult(400, "time must be in HH:mm format.", {
      field: "time"
    });
  }

  if (!isFutureAppointmentStart(payload.date, payload.time, options.now)) {
    return errorResponseResult(
      400,
      "appointment start time must be in the future.",
      {
        field: "start_time"
      }
    );
  }

  if (![15, 30, 45, 60, 90, 120].includes(payload.duration)) {
    return errorResponseResult(
      400,
      "duration must be one of 15, 30, 45, 60, 90, or 120 minutes.",
      {
        field: "duration"
      }
    );
  }

  return { payload };
}

function buildManualSelectedSlot(payload) {
  const startAt = `${payload.date}T${payload.time}:00+03:00`;
  const endAt = addMinutesToIstanbulDateTime(startAt, payload.duration);

  return {
    id: `manual_${payload.date}_${payload.time.replace(":", "")}`,
    start_at: startAt,
    end_at: endAt,
    timezone: DEFAULT_TIMEZONE,
    duration_minutes: payload.duration,
    display_label: formatDisplayLabel(startAt)
  };
}

function buildManualAppointmentTitle(payload) {
  return `Oravia Manual Appointment - ${payload.patientName} - ${payload.treatment}`;
}

function buildManualAppointmentDescription(payload) {
  const lines = [
    "Created by Oravia secretary manual appointment desk.",
    "Internal clinic operation. Not patient-facing dashboard booking.",
    `Source: ${MANUAL_APPOINTMENT_SOURCE}`,
    `Created by: ${MANUAL_APPOINTMENT_CREATED_BY}`,
    `Patient phone: ${payload.patientPhone}`,
    `Doctor: ${payload.doctor}`,
    `Treatment interest: ${payload.treatment}`
  ];

  if (payload.notes) {
    lines.push(`Notes: ${payload.notes}`);
  }

  return lines.join("\n");
}

function addMinutesToIstanbulDateTime(value, minutes) {
  const date = new Date(value);
  const endDate = new Date(date.getTime() + minutes * 60 * 1000);

  return formatIstanbulOffsetDateTime(endDate);
}

function formatIstanbulOffsetDateTime(date) {
  const localDate = new Date(date.getTime() + 3 * 60 * 60 * 1000);

  return `${localDate.getUTCFullYear()}-${pad2(
    localDate.getUTCMonth() + 1
  )}-${pad2(localDate.getUTCDate())}T${pad2(localDate.getUTCHours())}:${pad2(
    localDate.getUTCMinutes()
  )}:00+03:00`;
}

function formatDisplayLabel(value) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: DEFAULT_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function isValidTurkishMobilePhone(value) {
  return /^05\d{9}$/.test(value);
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isFutureAppointmentStart(date, time, now = new Date()) {
  const startDate = new Date(`${date}T${time}:00+03:00`);
  const currentDate = now instanceof Date ? now : new Date(now);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(currentDate.getTime())
  ) {
    return false;
  }

  return startDate.getTime() > currentDate.getTime();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 10 && digits.startsWith("5")) {
    return `0${digits}`;
  }

  return digits;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function ok(body) {
  return {
    status: 200,
    body
  };
}

function errorResponseResult(status, message, details = {}) {
  return {
    error: errorResponse(status, message, details)
  };
}

function errorResponse(status, message, details = {}) {
  return {
    status,
    body: {
      error: message,
      ...details
    }
  };
}

module.exports = {
  buildManualAppointmentDescription,
  buildManualAppointmentTitle,
  buildManualSelectedSlot,
  createManualAppointmentCalendarEvent,
  validateManualAppointmentPayload
};
