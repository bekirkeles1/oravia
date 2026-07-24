function mapAppointmentConfirmationTemplateParameters({
  appointment,
  clinicDisplayName,
  locale = "tr",
  timeZone = "Europe/Istanbul",
} = {}) {
  const safeAppointment = appointment || {};
  const date = new Date(safeAppointment.startAt);

  if (Number.isNaN(date.getTime())) {
    return reject("invalid_appointment_start");
  }

  const parameters = [
    normalizeText(clinicDisplayName || safeAppointment.clinicName || "Oravia"),
    normalizeText(safeAppointment.doctor?.name || safeAppointment.doctorName),
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone,
    }).format(date),
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(date),
    normalizeText(
      safeAppointment.appointmentPurposeLabel ||
        safeAppointment.appointmentPurpose
    ),
  ];

  if (parameters.some((parameter) => !parameter)) {
    return reject("incomplete_appointment_template_parameters");
  }

  return freezeClone({
    accepted: true,
    parameterOrder: [
      "clinic_display_name",
      "doctor_display_name",
      "appointment_date",
      "appointment_time",
      "appointment_purpose",
    ],
    parameters,
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function reject(code) {
  return freezeClone({
    accepted: false,
    code,
    reason: "Appointment confirmation template parameters are incomplete.",
  });
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  mapAppointmentConfirmationTemplateParameters,
};
