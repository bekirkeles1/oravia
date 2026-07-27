const { APPOINTMENT_STATUS } = require("../secretary/appointmentReviewAppointmentRepository");
const { isActiveEmptySlotOffer } = require("./emptySlotRepository");

function findEligibleEmptySlotCandidates({
  opportunity,
  appointments,
  emptySlotRepository,
  config,
  now = new Date(),
} = {}) {
  const nowMs = Date.parse(toIso(now));
  const slotStartMs = Date.parse(opportunity?.slotStartAt || "");
  const offers = emptySlotRepository.listOffersForOpportunity(opportunity?.opportunityId);
  const activeOfferAppointmentIds = new Set(
    offers
      .filter((offer) => isActiveEmptySlotOffer(offer.status))
      .map((offer) => offer.candidateAppointmentId)
  );

  const candidates = [];
  for (const appointment of Array.isArray(appointments) ? appointments : []) {
    const reason = eligibilityFailure({
      opportunity,
      appointment,
      consent: emptySlotRepository.getConsentForAppointment(appointment.id),
      activeOfferAppointmentIds,
      appointments,
      nowMs,
      slotStartMs,
      config,
      emptySlotRepository,
    });
    if (reason) continue;
    candidates.push({
      appointment,
      consent: emptySlotRepository.getConsentForAppointment(appointment.id),
      preferenceMatch: true,
      cooldownAllowed: true,
    });
  }
  return freezeClone({ accepted: true, candidates });
}

function rankEmptySlotCandidates({ opportunity, candidates } = {}) {
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => {
      const improvementMinutes = Math.max(
        0,
        Math.floor(
          (Date.parse(candidate.appointment.startAt) -
            Date.parse(opportunity.slotStartAt)) /
            60_000
        )
      );
      return {
        ...candidate,
        improvementMinutes,
        rankingReasons: [
          "exact preference match",
          "greater time improvement",
          "no recent outreach",
        ],
      };
    })
    .sort((a, b) => {
      if (b.improvementMinutes !== a.improvementMinutes) {
        return b.improvementMinutes - a.improvementMinutes;
      }
      const aSeq = Number(a.consent?.sequence || 0);
      const bSeq = Number(b.consent?.sequence || 0);
      if (aSeq !== bSeq) return aSeq - bSeq;
      return String(a.appointment.id).localeCompare(String(b.appointment.id));
    })
    .map((candidate, index) => ({
      ...candidate,
      rankingPosition: index + 1,
    }));
  return freezeClone({ accepted: true, candidates: ranked });
}

function eligibilityFailure({
  opportunity,
  appointment,
  consent,
  activeOfferAppointmentIds,
  appointments,
  nowMs,
  slotStartMs,
  config,
  emptySlotRepository,
}) {
  if (!opportunity || !appointment) return "missing_input";
  if (normalizeText(appointment.appointmentStatus || appointment.status) !== APPOINTMENT_STATUS.SCHEDULED) return "appointment_not_scheduled";
  if (!consent || consent.enabled !== true) return "missing_active_consent";
  if (activeOfferAppointmentIds.has(appointment.id)) return "active_offer_exists";
  if (normalizeText(appointment.doctor?.id || appointment.doctorId) !== opportunity.doctorId) return "doctor_mismatch";
  if (normalizeText(appointment.appointmentPurpose) !== opportunity.appointmentPurpose) return "purpose_mismatch";
  if (Number(appointment.durationMinutes) !== Number(opportunity.durationMinutes)) return "duration_mismatch";
  if (Date.parse(appointment.startAt) <= slotStartMs) return "appointment_not_later";
  if (slotStartMs <= nowMs) return "slot_not_future";
  if (!hasTrustedDestination(appointment)) return "missing_trusted_destination";
  if (hasConflict({ appointments, appointment, opportunity })) return "slot_conflict";
  if (!matchesPreferences({ consent, opportunity, nowMs })) return "preference_mismatch";
  if (!contactLimitsAllow({ appointment, emptySlotRepository, config, nowMs })) return "contact_limit";
  return null;
}

function hasTrustedDestination(appointment) {
  const destination = appointment.outboundDestination || {};
  return Boolean(destination.maskedLabel && (destination.reference || destination.lookupHash));
}

function hasConflict({ appointments, appointment, opportunity }) {
  return (appointments || []).some((candidate) => {
    if (candidate.id === appointment.id) return false;
    if (normalizeText(candidate.appointmentStatus || candidate.status) !== APPOINTMENT_STATUS.SCHEDULED) return false;
    if (normalizeText(candidate.doctor?.id || candidate.doctorId) !== opportunity.doctorId) return false;
    return rangesOverlap(opportunity.slotStartAt, opportunity.slotEndAt, candidate.startAt, candidate.endAt);
  });
}

function matchesPreferences({ consent, opportunity, nowMs }) {
  const weekdays = Array.isArray(consent.weekdays) ? consent.weekdays : [];
  if (weekdays.length) {
    const weekday = weekdayKey(opportunity.slotStartAt);
    if (!weekdays.includes(weekday)) return false;
  }
  const dayparts = Array.isArray(consent.dayparts) ? consent.dayparts : [];
  if (dayparts.length) {
    const part = daypartKey(opportunity.slotStartAt);
    if (!dayparts.includes(part)) return false;
  }
  const notice = Number(consent.minimumNoticeMinutes || 0);
  if (notice > 0) {
    const diff = (Date.parse(opportunity.slotStartAt) - nowMs) / 60_000;
    if (diff < notice) return false;
  }
  return true;
}

function contactLimitsAllow({ appointment, emptySlotRepository, config, nowMs }) {
  const offers = emptySlotRepository.listOffersForAppointment(appointment.id);
  const cooldownMs = (config?.outreachCooldownMinutes || 0) * 60_000;
  const windowMs = (config?.patientOfferWindowMinutes || 0) * 60_000;
  const recentOffers = offers.filter((offer) => {
    const createdMs = Date.parse(offer.createdAt);
    return Number.isFinite(createdMs) && nowMs - createdMs <= windowMs;
  });
  if (recentOffers.length >= (config?.maxOffersPerPatientWindow || 2)) return false;
  if (cooldownMs > 0 && recentOffers.some((offer) => nowMs - Date.parse(offer.createdAt) <= cooldownMs)) {
    return false;
  }
  return true;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}

function weekdayKey(value) {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(value).getDay()];
}

function daypartKey(value) {
  const hour = new Date(value).getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : normalizeText(value);
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  findEligibleEmptySlotCandidates,
  rankEmptySlotCandidates,
};
