const {
  createSlotProposalReplyFromResult,
  generateSlotProposals,
} = require("./slotProposal");
const {
  createAppointmentSelectionReply,
  createPendingAppointmentFlowState,
} = require("./appointmentFlowState");
const { getActiveAssistantVertical } = require("../assistant/defaultVertical");

function planMessagingReply(input = {}) {
  const message = normalizeText(input.message);
  const classification = input.classification || {};
  const vertical = resolveReplyPlanningVertical(input);
  const handoff = evaluateVerticalHandoff(vertical, message);

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

  const appointmentSelectionReply = createPendingAppointmentSelectionReply(
    input,
    message
  );

  if (appointmentSelectionReply) {
    return appointmentSelectionReply;
  }

  const treatmentKnowledge = searchVerticalTreatmentInfo(vertical, message);

  if (isSlotProposalQuestion(message)) {
    const slotProposalResult = generateSlotProposals({
      message,
      vertical
    });
    const slotProposalReply =
      createSlotProposalReplyFromResult(slotProposalResult);

    if (slotProposalReply) {
      const replyPlan = {
        intent: "appointment_slot_proposal",
        requires_handoff: false,
        reply_draft: slotProposalReply,
        reply_source: "slot_proposal_mock",
        treatment_id: treatmentKnowledge?.id || null
      };

      if (
        slotProposalResult.status === "ok" &&
        slotProposalResult.proposals.length > 0
      ) {
        replyPlan.appointmentFlowState =
          createPendingAppointmentFlowState(slotProposalResult);
      }

      return replyPlan;
    }
  }

  if (isDoctorAvailabilityQuestion(message)) {
    const availabilityReply = createVerticalDoctorAvailabilityReply(
      vertical,
      message
    );

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
      reply_draft: buildVerticalTreatmentAnswer(vertical, treatmentKnowledge),
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

function resolveReplyPlanningVertical(input = {}) {
  return input.vertical || input.assistantVertical || getActiveAssistantVertical();
}

function createPendingAppointmentSelectionReply(input, message) {
  const flowState =
    input.appointmentFlowState ||
    input.appointment_flow_state ||
    input.flowState ||
    null;

  if (!flowState || !isAppointmentSelectionAttempt(input, message)) {
    return null;
  }

  const selectionReply = createAppointmentSelectionReply(flowState, {
    message,
    selected_slot_id: input.selected_slot_id || input.selectedSlotId || null,
  });

  if (selectionReply.status === "no_pending_appointment") {
    return null;
  }

  return {
    intent: "appointment_slot_selection",
    requires_handoff: false,
    reply_draft: selectionReply.reply_draft,
    reply_source: "appointment_flow_state",
    treatment_id: flowState.treatment || null,
    appointment_selection_status: selectionReply.status,
    selected_slot: selectionReply.selectedSlot,
    appointmentSelectionReview: selectionReply.appointmentSelectionReview,
  };
}

function isAppointmentSelectionAttempt(input, message) {
  if (input.selected_slot_id || input.selectedSlotId) {
    return true;
  }

  return /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/.test(String(message || ""));
}

function evaluateVerticalHandoff(vertical, message) {
  if (typeof vertical.evaluateHandoff === "function") {
    return vertical.evaluateHandoff(message);
  }

  if (typeof vertical.handoffRules?.evaluateHandoff === "function") {
    return vertical.handoffRules.evaluateHandoff(message);
  }

  return {
    requires_handoff: false,
    matched_rules: [],
    reply_draft: null
  };
}

function searchVerticalTreatmentInfo(vertical, message) {
  if (typeof vertical.searchTreatmentInfo === "function") {
    return vertical.searchTreatmentInfo(message);
  }

  if (
    typeof vertical.treatmentKnowledgeBase?.searchTreatmentKnowledge ===
    "function"
  ) {
    return vertical.treatmentKnowledgeBase.searchTreatmentKnowledge(message);
  }

  return null;
}

function buildVerticalTreatmentAnswer(vertical, treatmentKnowledge) {
  if (typeof vertical.buildTreatmentAnswer === "function") {
    return vertical.buildTreatmentAnswer(treatmentKnowledge);
  }

  if (
    typeof vertical.treatmentKnowledgeBase?.buildTreatmentAnswer === "function"
  ) {
    return vertical.treatmentKnowledgeBase.buildTreatmentAnswer(
      treatmentKnowledge
    );
  }

  return null;
}

function createVerticalDoctorAvailabilityReply(vertical, message) {
  if (typeof vertical.createDoctorAvailabilityReply === "function") {
    return vertical.createDoctorAvailabilityReply(message);
  }

  if (
    typeof vertical.doctorAvailability?.createDoctorAvailabilityReply ===
    "function"
  ) {
    return vertical.doctorAvailability.createDoctorAvailabilityReply(message);
  }

  return null;
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
