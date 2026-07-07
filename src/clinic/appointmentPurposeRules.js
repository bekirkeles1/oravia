const INITIAL_CONSULTATION = "initial_consultation";
const PROCEDURE = "procedure";

const APPOINTMENT_PURPOSES = {
  [INITIAL_CONSULTATION]: {
    id: INITIAL_CONSULTATION,
    label: "İlk muayene / değerlendirme",
    description:
      "WhatsApp veya ilk hasta talebinde tedavi öncesi hekim değerlendirmesi için kullanılır.",
  },
  [PROCEDURE]: {
    id: PROCEDURE,
    label: "Tedavi işlemi",
    description:
      "Doktor/sekreter tarafından işlem randevusu olarak kontrollü seçildiğinde kullanılır.",
  },
};

function listAppointmentPurposes() {
  return Object.values(APPOINTMENT_PURPOSES).map((purpose) => ({
    ...purpose,
    source: "mock",
  }));
}

function normalizeAppointmentPurpose(value) {
  const normalizedValue = String(value || "")
    .toLocaleLowerCase("tr-TR")
    .trim();

  if (normalizedValue === PROCEDURE) {
    return PROCEDURE;
  }

  if (normalizedValue === INITIAL_CONSULTATION) {
    return INITIAL_CONSULTATION;
  }

  return INITIAL_CONSULTATION;
}

function getAppointmentPurposeLabel(value) {
  const purpose = normalizeAppointmentPurpose(value);
  return APPOINTMENT_PURPOSES[purpose].label;
}

function inferAppointmentPurpose(input = {}) {
  if (input.appointmentPurpose) {
    return normalizeAppointmentPurpose(input.appointmentPurpose);
  }

  return INITIAL_CONSULTATION;
}

module.exports = {
  APPOINTMENT_PURPOSES,
  INITIAL_CONSULTATION,
  PROCEDURE,
  getAppointmentPurposeLabel,
  inferAppointmentPurpose,
  listAppointmentPurposes,
  normalizeAppointmentPurpose,
};
