const {
  findAvailableDoctorsByTreatmentAndDay,
  findDayInMessage,
  timeToMinutes,
  validateAvailabilityWindow,
} = require("../clinic/doctorAvailability");
const { resolveTreatmentName } = require("../clinic/doctorDirectory");
const {
  DEFAULT_TREATMENT_DURATION_MINUTES,
  normalizePositiveInteger,
  resolveSlotDurationMinutes,
} = require("../clinic/treatmentDurationRules");
const {
  getAppointmentPurposeLabel,
  inferAppointmentPurpose,
} = require("../clinic/appointmentPurposeRules");

const DEFAULT_SLOT_DURATION_MINUTES = DEFAULT_TREATMENT_DURATION_MINUTES;
const DEFAULT_SLOT_STEP_MINUTES = 30;
const DEFAULT_MAX_SLOT_PROPOSALS = 3;

function minutesToTime(totalMinutes) {
  if (
    !Number.isInteger(totalMinutes) ||
    totalMinutes < 0 ||
    totalMinutes > 23 * 60 + 59
  ) {
    return null;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function generateSlotsFromWindow(window, options = {}) {
  if (!validateAvailabilityWindow(window)) {
    return [];
  }

  const durationMinutes = normalizePositiveInteger(
    options.durationMinutes,
    DEFAULT_SLOT_DURATION_MINUTES
  );
  const stepMinutes = normalizePositiveInteger(
    options.stepMinutes,
    durationMinutes || DEFAULT_SLOT_STEP_MINUTES
  );
  const maxSlots = normalizePositiveInteger(options.maxSlots, Number.MAX_SAFE_INTEGER);
  const windowStartMinutes = timeToMinutes(window.start);
  const windowEndMinutes = timeToMinutes(window.end);
  const slots = [];

  for (
    let slotStartMinutes = windowStartMinutes;
    slotStartMinutes + durationMinutes <= windowEndMinutes;
    slotStartMinutes += stepMinutes
  ) {
    const slotTime = minutesToTime(slotStartMinutes);

    if (!slotTime) {
      continue;
    }

    slots.push({
      time: slotTime,
      durationMinutes,
      source: "mock",
      requires_calendar_conflict_check: true,
    });

    if (slots.length >= maxSlots) {
      break;
    }
  }

  return slots;
}

function buildSlotId({ doctorId, treatment, appointmentPurpose, day, time, durationMinutes }) {
  return [
    doctorId,
    normalizeIdPart(treatment),
    normalizeIdPart(appointmentPurpose),
    day,
    time.replace(":", ""),
    `${durationMinutes}m`,
  ].join("-");
}

function normalizeIdPart(value) {
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
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateSlotProposals(input = {}) {
  const message = input.message || "";
  const treatment = resolveTreatmentName(input.treatmentName || message);
  const day = findDayInMessage(input.dayName || message);
  const appointmentPurpose = inferAppointmentPurpose({
    message,
    appointmentPurpose: input.appointmentPurpose,
  });
  const durationMinutes = resolveSlotDurationMinutes({
    treatmentName: treatment,
    message,
    appointmentPurpose,
    durationMinutes: input.durationMinutes,
  });
  const stepMinutes = normalizePositiveInteger(
    input.stepMinutes,
    durationMinutes || DEFAULT_SLOT_STEP_MINUTES
  );
  const maxSlots = normalizePositiveInteger(
    input.maxSlots,
    DEFAULT_MAX_SLOT_PROPOSALS
  );

  if (!treatment || !day) {
    return {
      status: "missing_context",
      treatment,
      day,
      appointmentPurpose,
      appointmentPurposeLabel: getAppointmentPurposeLabel(appointmentPurpose),
      durationMinutes,
      source: "mock",
      proposals: [],
      safety_note:
        "Slot önerisi için hem tedavi hem de gün bilgisi gerekir. Gerçek randevu oluşturulmaz.",
    };
  }

  const matches = findAvailableDoctorsByTreatmentAndDay(treatment, day);
  const proposals = [];

  for (const match of matches) {
    for (const window of match.windows) {
      const remainingSlots = maxSlots - proposals.length;

      if (remainingSlots <= 0) {
        break;
      }

      const windowSlots = generateSlotsFromWindow(window, {
        durationMinutes,
        stepMinutes,
        maxSlots: remainingSlots,
      });

      for (const slot of windowSlots) {
        proposals.push({
          id: buildSlotId({
            doctorId: match.doctor.id,
            treatment: match.treatment,
            appointmentPurpose,
            day: match.day,
            time: slot.time,
            durationMinutes: slot.durationMinutes,
          }),
          doctorId: match.doctor.id,
          doctorName: match.doctor.name,
          treatment: match.treatment,
          appointmentPurpose,
          appointmentPurposeLabel: getAppointmentPurposeLabel(appointmentPurpose),
          day: match.day,
          dayLabel: match.dayLabel,
          time: slot.time,
          durationMinutes: slot.durationMinutes,
          source: "mock",
          requires_calendar_conflict_check: true,
        });
      }
    }

    if (proposals.length >= maxSlots) {
      break;
    }
  }

  return {
    status: proposals.length > 0 ? "ok" : "no_slots",
    treatment,
    day,
    appointmentPurpose,
    appointmentPurposeLabel: getAppointmentPurposeLabel(appointmentPurpose),
    durationMinutes,
    source: "mock",
    proposals,
    safety_note:
      "Bu slotlar mock çalışma programından önerilir; gerçek randevu oluşturmadan önce takvim çakışması kontrol edilmelidir.",
  };
}

function createSlotProposalReply(input = {}) {
  const result = generateSlotProposals(input);

  if (result.status === "missing_context") {
    return null;
  }

  if (result.status === "no_slots") {
    return `${result.treatment} için seçilen gün mock programa göre önerilebilir ${result.appointmentPurposeLabel.toLocaleLowerCase("tr-TR")} slotu bulunamadı. Gerçek müsaitlik için sekreter veya takvim kontrolü gerekir.`;
  }

  return [
    `${result.treatment} için ${result.proposals[0].dayLabel} günü mock ${result.appointmentPurposeLabel.toLocaleLowerCase("tr-TR")} slot önerileri:`,
    ...result.proposals.map(
      (proposal, index) =>
        `${index + 1}. ${proposal.doctorName} — ${proposal.time} (${proposal.durationMinutes} dk)`
    ),
    "Bu seçenekler kesin randevu değildir; gerçek randevu oluşturmadan önce takvim çakışması ayrıca kontrol edilmelidir.",
  ].join("\n");
}

module.exports = {
  DEFAULT_MAX_SLOT_PROPOSALS,
  DEFAULT_SLOT_DURATION_MINUTES,
  DEFAULT_SLOT_STEP_MINUTES,
  buildSlotId,
  createSlotProposalReply,
  generateSlotProposals,
  generateSlotsFromWindow,
  minutesToTime,
};
