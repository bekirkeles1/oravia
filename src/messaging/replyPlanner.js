const {
  buildTreatmentAnswer,
  searchTreatmentKnowledge
} = require("../clinic/treatmentKnowledgeBase");

function planMessagingReply(input = {}) {
  const message = normalizeText(input.message);
  const classification = input.classification || {};
  const treatmentKnowledge = searchTreatmentKnowledge(message);

  if (classification.intent === "appointment_request") {
    return {
      intent: classification.intent,
      requires_handoff: Boolean(classification.requires_handoff),
      reply_draft: buildAppointmentReplyDraft(classification),
      reply_source: "classifier",
      treatment_id:
        classification.extracted_data?.treatment_interest || treatmentKnowledge?.id || null
    };
  }

  if (treatmentKnowledge) {
    return {
      intent: "treatment_info",
      requires_handoff: false,
      reply_draft: buildTreatmentAnswer(treatmentKnowledge),
      reply_source: "treatment_knowledge_base",
      treatment_id: treatmentKnowledge.id
    };
  }

  return {
    intent: classification.intent || "unknown_intent",
    requires_handoff:
      typeof classification.requires_handoff === "boolean"
        ? classification.requires_handoff
        : true,
    reply_draft:
      classification.reply ||
      "Merhaba, sizi daha doğru yönlendirebilmem için mesajınızı klinik ekibimize aktaracağım.",
    reply_source: "classifier",
    treatment_id: null
  };
}

function buildAppointmentReplyDraft(classification) {
  const treatmentInterest = classification.extracted_data?.treatment_interest;

  if (
    classification.intent === "appointment_request" &&
    treatmentInterest === "implant"
  ) {
    return "İmplant randevusu için uygun saatleri kontrol ediyorum.";
  }

  return (
    classification.reply ||
    "Uygun randevu saatlerini kontrol ediyorum."
  );
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  planMessagingReply
};
