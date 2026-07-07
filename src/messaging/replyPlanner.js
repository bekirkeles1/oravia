const {
  buildTreatmentAnswer,
  searchTreatmentKnowledge
} = require("../clinic/treatmentKnowledgeBase");
const {
  createDoctorAvailabilityReply
} = require("../clinic/doctorAvailability");
const { createSlotProposalReply } = require("./slotProposal");
const { evaluateHandoff } = require("./handoffRules");

function planMessagingReply(input = {}) {
  const message = normalizeText(input.message);
  const classification = input.classification || {};
  const handoff = evaluateHandoff(message);

  if (handoff.requires_handoff) {
    return {
      intent: "handoff_required",
      requires_handoff: true,
      reply_draft: handoff.reply_draft,
      reply_source: "handoff_rules",
      treatment_id: null,
      handoff_reasons: handoff.matched_rules
    };
  }

  const treatmentKnowledge = searchTreatmentKnowledge(message);

  if (isSlotProposalQuestion(message)) {
    const slotProposalReply = createSlotProposalReply({
      message
    });

    if (slotProposalReply) {
      return {
        intent: "appointment_slot_proposal",
        requires_handoff: false,
        reply_draft: slotProposalReply,
        reply_source: "slot_proposal_mock",
        treatment_id: treatmentKnowledge?.id || null
      };
    }
  }

  if (isDoctorAvailabilityQuestion(message)) {
    const availabilityReply = createDoctorAvailabilityReply(message);

    if (availabilityReply) {
      return {
        intent: "doctor_availability",
        requires_handoff: false,
        reply_draft: availabilityReply,
        reply_source: "doctor_availability_mock",
        treatment_id: treatmentKnowledge?.id || null
      };
    }
  }

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

function isSlotProposalQuestion(message) {
  const normalizedMessage = normalizeForKeywordSearch(message);

  if (!normalizedMessage) {
    return false;
  }

  return [
    "slot",
    "saat oner",
    "saat oneri",
    "saat var",
    "hangi saat",
    "randevu onerebilir",
    "randevu oner",
    "randevu secenegi",
    "secenek",
    "rezerve",
    "ayirabilir",
    "ayir",
    "ayır"
  ].some((keyword) => normalizedMessage.includes(keyword));
}

function isDoctorAvailabilityQuestion(message) {
  const normalizedMessage = normalizeForKeywordSearch(message);

  if (!normalizedMessage) {
    return false;
  }

  return [
    "musait",
    "uygun",
    "bos",
    "hangi doktor",
    "doktor var",
    "doktor bakiyor",
    "kim bakiyor",
    "hangi gun",
    "hangi saat",
    "saatleri",
    "gunleri",
    "calisiyor",
    "calisma programi",
    "program"
  ].some((keyword) => normalizedMessage.includes(keyword));
}

function normalizeForKeywordSearch(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  planMessagingReply
};
