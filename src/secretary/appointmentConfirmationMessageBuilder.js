const { demoClinic } = require("../demo/demoData");

function buildAppointmentConfirmationMessage(appointment) {
  if (!appointment || typeof appointment !== "object" || Array.isArray(appointment)) {
    return rejectMessage(
      "invalid_confirmation_appointment",
      "Trusted appointment must be an object."
    );
  }

  const appointmentId = normalizeText(appointment.id);
  const doctorName = normalizeText(appointment.doctor?.name);
  const startAt = normalizeText(appointment.startAt);
  const endAt = normalizeText(appointment.endAt);
  const appointmentPurposeLabel = normalizeText(appointment.appointmentPurposeLabel);
  const timezone = normalizeText(demoClinic.timezone) || "Europe/Istanbul";
  const clinicName = normalizeText(demoClinic.name) || "Oravia";

  if (!appointmentId || !doctorName || !startAt || !endAt || !appointmentPurposeLabel) {
    return rejectMessage(
      "incomplete_confirmation_appointment",
      "Trusted appointment lacks confirmation message data."
    );
  }

  const start = parseDate(startAt);
  const end = parseDate(endAt);

  if (!start || !end) {
    return rejectMessage(
      "invalid_confirmation_appointment_time",
      "Trusted appointment contains invalid confirmation time data."
    );
  }

  const dateLabel = new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(start);
  const startTimeLabel = new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(start);
  const endTimeLabel = new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(end);

  return freezeClone({
    accepted: true,
    messageKind: "appointment_confirmation_message_v1",
    appointmentId,
    locale: "tr-TR",
    timezone,
    dateLabel,
    startTimeLabel,
    endTimeLabel,
    text: [
      `${clinicName} randevu onayı: ${dateLabel} ${startTimeLabel}-${endTimeLabel}.`,
      `${doctorName}, ${appointmentPurposeLabel}.`,
      "Bu mesaj mock sağlayıcı ile hazırlanmıştır; gerçek hasta teslimatı yapılmaz.",
    ].join(" "),
  });
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rejectMessage(code, reason) {
  return freezeClone({
    accepted: false,
    code,
    reason,
  });
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
  buildAppointmentConfirmationMessage,
};
