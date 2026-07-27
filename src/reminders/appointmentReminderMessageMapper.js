function mapAppointmentReminderTemplateParameters({
  appointment,
  clinicDisplayName = "Oravia",
} = {}) {
  const appointmentId = normalizeText(appointment?.id);
  const doctorName = normalizeText(appointment?.doctor?.name || appointment?.doctorName);
  const startAt = normalizeText(appointment?.startAt);
  const purpose = normalizeText(
    appointment?.appointmentPurposeLabel || appointment?.appointmentPurpose
  );

  if (!appointmentId || !doctorName || !startAt) {
    return reject("invalid_appointment_reminder_template_input");
  }

  return freezeClone({
    accepted: true,
    messageKind: "appointment_reminder_template_parameters_v1",
    parameters: [
      normalizeText(clinicDisplayName) || "Oravia",
      doctorName,
      startAt.slice(0, 10),
      startAt.slice(11, 16),
      purpose,
    ].filter(Boolean),
  });
}

function buildAppointmentReminderMessage({ appointment, offsetMinutes } = {}) {
  const mapped = mapAppointmentReminderTemplateParameters({ appointment });
  if (!mapped.accepted) return mapped;

  return freezeClone({
    accepted: true,
    messageKind: "appointment_reminder_message_v1",
    locale: "tr",
    timezone: "Europe/Istanbul",
    offsetMinutes,
    text:
      `${mapped.parameters[0]} randevu hatirlatmasi: ` +
      `${mapped.parameters[1]} ile randevunuz ${mapped.parameters[2]} ${mapped.parameters[3]}.`,
    templateParameters: mapped.parameters,
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function reject(code) {
  return freezeClone({
    accepted: false,
    code,
    reason: "Appointment reminder message mapping failed safely.",
  });
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  buildAppointmentReminderMessage,
  mapAppointmentReminderTemplateParameters,
};
