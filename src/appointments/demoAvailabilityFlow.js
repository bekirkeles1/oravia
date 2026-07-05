const { classifyPatientMessage } = require("../ai/intentClassifier");
const { getDemoAvailableSlots } = require("./availability");
const { demoClinic, demoDoctor } = require("../demo/demoData");

function runDemoAvailabilityFlow(message, options = {}) {
  const classification = classifyPatientMessage(message, options.classifier);
  const treatmentInterest = classification.extracted_data.treatment_interest;
  const shouldOfferSlots =
    classification.intent === "appointment_request" &&
    classification.requires_handoff === false;
  const availableSlots = shouldOfferSlots
    ? getDemoAvailableSlots({
        clinic: demoClinic,
        doctor: demoDoctor,
        now: options.now,
        limit: 3,
        calendarProvider: options.calendarProvider
      })
    : [];

  if (isPromiseLike(availableSlots)) {
    return availableSlots.then((resolvedSlots) =>
      buildAvailabilityResult({
        classification,
        treatmentInterest,
        shouldOfferSlots,
        availableSlots: resolvedSlots
      })
    );
  }

  return buildAvailabilityResult({
    classification,
    treatmentInterest,
    shouldOfferSlots,
    availableSlots
  });
}

function buildAvailabilityResult({
  classification,
  treatmentInterest,
  shouldOfferSlots,
  availableSlots
}) {
  return {
    intent: classification.intent,
    confidence: classification.confidence,
    requires_handoff: classification.requires_handoff,
    patient_message_summary: classification.patient_message_summary,
    treatment_interest: treatmentInterest,
    clinic: {
      name: demoClinic.name,
      timezone: demoClinic.timezone,
      address: demoClinic.address
    },
    doctor: {
      name: demoDoctor.name,
      specialty: demoDoctor.specialty,
      appointment_duration_minutes: demoDoctor.appointment_duration_minutes
    },
    available_slots: availableSlots,
    reply: shouldOfferSlots
      ? buildAvailabilityReply(availableSlots, treatmentInterest)
      : classification.reply
  };
}

function buildAvailabilityReply(availableSlots, treatmentInterest) {
  const treatmentText = treatmentInterest ? `${treatmentInterest} için ` : "";
  const slotText = availableSlots
    .map((slot) => slot.display_label)
    .join(", ");

  return `Merhaba, ${treatmentText}uygun randevu seçenekleri: ${slotText}. Size uygun olan saati seçebilirsiniz.`;
}

function isPromiseLike(value) {
  return value && typeof value.then === "function";
}

module.exports = {
  runDemoAvailabilityFlow
};
