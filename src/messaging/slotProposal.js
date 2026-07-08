const { dentalVertical } = require("../verticals/dental/dentalVertical");

const DEFAULT_SLOT_DURATION_MINUTES =
  dentalVertical.treatmentDurationRules.DEFAULT_TREATMENT_DURATION_MINUTES;
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
  const vertical = resolveSlotProposalVertical(options);

  if (!validateAvailabilityWindowWithVertical(vertical, window)) {
    return [];
  }

  const durationMinutes = normalizePositiveIntegerWithVertical(
    vertical,
    options.durationMinutes,
    DEFAULT_SLOT_DURATION_MINUTES
  );
  const stepMinutes = normalizePositiveIntegerWithVertical(
    vertical,
    options.stepMinutes,
    durationMinutes || DEFAULT_SLOT_STEP_MINUTES
  );
  const maxSlots = normalizePositiveIntegerWithVertical(
    vertical,
    options.maxSlots,
    Number.MAX_SAFE_INTEGER
  );
  const windowStartMinutes = timeToMinutesWithVertical(vertical, window.start);
  const windowEndMinutes = timeToMinutesWithVertical(vertical, window.end);
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
  const vertical = resolveSlotProposalVertical(input);
  const message = input.message || "";
  const treatment = resolveTreatmentNameWithVertical(
    vertical,
    input.treatmentName || message
  );
  const day = findDayInMessageWithVertical(vertical, input.dayName || message);
  const appointmentPurpose = inferAppointmentPurposeWithVertical(vertical, {
    message,
    appointmentPurpose: input.appointmentPurpose,
  });
  const durationMinutes = resolveSlotDurationMinutesWithVertical(vertical, {
    treatmentName: treatment,
    message,
    appointmentPurpose,
    durationMinutes: input.durationMinutes,
  });
  const stepMinutes = normalizePositiveIntegerWithVertical(
    vertical,
    input.stepMinutes,
    durationMinutes || DEFAULT_SLOT_STEP_MINUTES
  );
  const maxSlots = normalizePositiveIntegerWithVertical(
    vertical,
    input.maxSlots,
    DEFAULT_MAX_SLOT_PROPOSALS
  );

  if (!treatment || !day) {
    return {
      status: "missing_context",
      treatment,
      day,
      appointmentPurpose,
      appointmentPurposeLabel: getAppointmentPurposeLabelWithVertical(
        vertical,
        appointmentPurpose
      ),
      durationMinutes,
      source: "mock",
      proposals: [],
      safety_note:
        "Slot önerisi için hem tedavi hem de gün bilgisi gerekir. Gerçek randevu oluşturulmaz.",
    };
  }

  const matches = findAvailableDoctorsByTreatmentAndDayWithVertical(
    vertical,
    treatment,
    day
  );
  const proposals = [];

  for (const match of matches) {
    for (const window of match.windows) {
      const remainingSlots = maxSlots - proposals.length;

      if (remainingSlots <= 0) {
        break;
      }

      const windowSlots = generateSlotsFromWindow(window, {
        vertical,
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
          appointmentPurposeLabel: getAppointmentPurposeLabelWithVertical(
            vertical,
            appointmentPurpose
          ),
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
    appointmentPurposeLabel: getAppointmentPurposeLabelWithVertical(
      vertical,
      appointmentPurpose
    ),
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

function resolveSlotProposalVertical(input = {}) {
  return input.vertical || input.assistantVertical || dentalVertical;
}

function resolveTreatmentNameWithVertical(vertical, value) {
  if (typeof vertical.doctorDirectory?.resolveTreatmentName === "function") {
    return vertical.doctorDirectory.resolveTreatmentName(value);
  }

  return dentalVertical.doctorDirectory.resolveTreatmentName(value);
}

function findDayInMessageWithVertical(vertical, value) {
  if (typeof vertical.doctorAvailability?.findDayInMessage === "function") {
    return vertical.doctorAvailability.findDayInMessage(value);
  }

  return dentalVertical.doctorAvailability.findDayInMessage(value);
}

function inferAppointmentPurposeWithVertical(vertical, input) {
  if (typeof vertical.appointmentPurposeRules?.inferAppointmentPurpose === "function") {
    return vertical.appointmentPurposeRules.inferAppointmentPurpose(input);
  }

  return dentalVertical.appointmentPurposeRules.inferAppointmentPurpose(input);
}

function resolveSlotDurationMinutesWithVertical(vertical, input) {
  if (typeof vertical.treatmentDurationRules?.resolveSlotDurationMinutes === "function") {
    return vertical.treatmentDurationRules.resolveSlotDurationMinutes(input);
  }

  return dentalVertical.treatmentDurationRules.resolveSlotDurationMinutes(input);
}

function normalizePositiveIntegerWithVertical(vertical, value, fallback) {
  if (typeof vertical.treatmentDurationRules?.normalizePositiveInteger === "function") {
    return vertical.treatmentDurationRules.normalizePositiveInteger(value, fallback);
  }

  return dentalVertical.treatmentDurationRules.normalizePositiveInteger(
    value,
    fallback
  );
}

function getAppointmentPurposeLabelWithVertical(vertical, value) {
  if (typeof vertical.appointmentPurposeRules?.getAppointmentPurposeLabel === "function") {
    return vertical.appointmentPurposeRules.getAppointmentPurposeLabel(value);
  }

  return dentalVertical.appointmentPurposeRules.getAppointmentPurposeLabel(value);
}

function findAvailableDoctorsByTreatmentAndDayWithVertical(
  vertical,
  treatment,
  day
) {
  if (
    typeof vertical.doctorAvailability?.findAvailableDoctorsByTreatmentAndDay ===
    "function"
  ) {
    return vertical.doctorAvailability.findAvailableDoctorsByTreatmentAndDay(
      treatment,
      day
    );
  }

  return dentalVertical.doctorAvailability.findAvailableDoctorsByTreatmentAndDay(
    treatment,
    day
  );
}

function validateAvailabilityWindowWithVertical(vertical, window) {
  if (typeof vertical.doctorAvailability?.validateAvailabilityWindow === "function") {
    return vertical.doctorAvailability.validateAvailabilityWindow(window);
  }

  return dentalVertical.doctorAvailability.validateAvailabilityWindow(window);
}

function timeToMinutesWithVertical(vertical, value) {
  if (typeof vertical.doctorAvailability?.timeToMinutes === "function") {
    return vertical.doctorAvailability.timeToMinutes(value);
  }

  return dentalVertical.doctorAvailability.timeToMinutes(value);
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
