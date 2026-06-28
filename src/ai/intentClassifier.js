const SUPPORTED_PROVIDERS = new Set(["local"]);

function classifyPatientMessage(message, options = {}) {
  const provider =
    options.provider || process.env.ORAVIA_AI_CLASSIFIER_PROVIDER || "local";

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(
      `Unsupported intent classifier provider "${provider}". Supported providers: local.`
    );
  }

  return classifyWithLocalRules(message);
}

function classifyWithLocalRules(message) {
  const originalMessage = String(message || "").trim();
  const normalizedMessage = normalizeText(originalMessage);
  const treatmentInterest = extractTreatmentInterest(normalizedMessage);
  const appointmentRequested = hasAny(normalizedMessage, [
    "randevu almak",
    "randevu istiyorum",
    "randevu al",
    "randevu",
    "muayene"
  ]);

  if (appointmentRequested) {
    return {
      intent: "appointment_request",
      confidence: treatmentInterest ? 0.9 : 0.82,
      requires_handoff: false,
      patient_message_summary: buildAppointmentSummary(treatmentInterest),
      extracted_data: {
        treatment_interest: treatmentInterest,
        preferred_day: extractPreferredDay(normalizedMessage),
        preferred_time: extractPreferredTime(originalMessage),
        patient_name: null
      },
      reply: buildAppointmentReply(treatmentInterest)
    };
  }

  return {
    intent: "unknown_intent",
    confidence: 0.4,
    requires_handoff: true,
    patient_message_summary: "Hasta mesajının niyeti yerel sınıflandırıcı ile net anlaşılamadı.",
    extracted_data: {
      treatment_interest: treatmentInterest,
      preferred_day: extractPreferredDay(normalizedMessage),
      preferred_time: extractPreferredTime(originalMessage),
      patient_name: null
    },
    reply: "Merhaba, sizi daha doğru yönlendirebilmem için mesajınızı klinik ekibimize aktaracağım."
  };
}

function normalizeText(value) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(value, phrases) {
  return phrases.some((phrase) => value.includes(phrase));
}

function extractTreatmentInterest(normalizedMessage) {
  const treatments = [
    ["implant", ["implant"]],
    ["diş beyazlatma", ["dis beyazlatma", "beyazlatma"]],
    ["kanal tedavisi", ["kanal tedavisi"]],
    ["dolgu", ["dolgu"]],
    ["ortodonti", ["ortodonti", "tel tedavisi"]],
    ["diş çekimi", ["dis cekimi", "cekimi"]]
  ];

  const match = treatments.find(([, aliases]) => hasAny(normalizedMessage, aliases));

  return match ? match[0] : null;
}

function extractPreferredDay(normalizedMessage) {
  if (normalizedMessage.includes("bugun")) {
    return "today";
  }

  if (normalizedMessage.includes("yarin")) {
    return "tomorrow";
  }

  return null;
}

function extractPreferredTime(message) {
  const match = String(message || "").match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);

  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function buildAppointmentSummary(treatmentInterest) {
  if (treatmentInterest) {
    return `Hasta ${treatmentInterest} için randevu almak istiyor.`;
  }

  return "Hasta randevu almak istiyor.";
}

function buildAppointmentReply(treatmentInterest) {
  if (treatmentInterest) {
    return `Merhaba, yardımcı olmaktan memnuniyet duyarım. ${capitalizeTurkish(
      treatmentInterest
    )} muayenesi için uygun randevu saatlerini kontrol ediyorum.`;
  }

  return "Merhaba, yardımcı olmaktan memnuniyet duyarım. Uygun randevu saatlerini kontrol ediyorum.";
}

function capitalizeTurkish(value) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toLocaleUpperCase("tr-TR") + value.slice(1);
}

module.exports = {
  classifyPatientMessage
};
