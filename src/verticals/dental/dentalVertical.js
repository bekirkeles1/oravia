const treatmentKnowledgeBase = require("../../clinic/treatmentKnowledgeBase");
const handoffRules = require("../../messaging/handoffRules");
const doctorDirectory = require("../../clinic/doctorDirectory");
const doctorAvailability = require("../../clinic/doctorAvailability");
const treatmentDurationRules = require("../../clinic/treatmentDurationRules");
const appointmentPurposeRules = require("../../clinic/appointmentPurposeRules");

const dentalVertical = {
  id: "dental",
  name: "Dental clinic",
  treatmentKnowledgeBase,
  getTreatmentInfo: treatmentKnowledgeBase.getTreatmentKnowledge,
  searchTreatmentInfo: treatmentKnowledgeBase.searchTreatmentKnowledge,
  buildTreatmentAnswer: treatmentKnowledgeBase.buildTreatmentAnswer,
  handoffRules,
  evaluateHandoff: handoffRules.evaluateHandoff,
  doctorDirectory,
  doctorAvailability,
  createDoctorAvailabilityReply: doctorAvailability.createDoctorAvailabilityReply,
  treatmentDurationRules,
  appointmentPurposeRules,
};

module.exports = {
  dentalVertical,
};
