const crypto = require("node:crypto");
const { APPOINTMENT_STATUS } = require("../secretary/appointmentReviewAppointmentRepository");
const { cancelObsoleteAppointmentReminderJobs, reconcileOneAppointmentReminders } = require("../reminders/appointmentReminderService");
const {
  EMPTY_SLOT_OFFER_STATUS,
  EMPTY_SLOT_OPPORTUNITY_STATUS,
} = require("./emptySlotRepository");
const {
  findEligibleEmptySlotCandidates,
  rankEmptySlotCandidates,
} = require("./emptySlotEligibility");
const { buildEmptySlotOfferMessage } = require("./emptySlotMessageMapper");

function createEmptySlotOpportunityFromReleasedAppointment({
  releasedAppointment,
  sourceReference,
  appointmentRepository,
  emptySlotRepository,
  config,
  manual = false,
  now = new Date(),
} = {}) {
  if (!config?.engineEnabled) {
    return freezeClone({ accepted: true, code: "empty_slot_engine_disabled", created: false });
  }
  if (!manual && !config.automaticOpportunityCreationEnabled) {
    return freezeClone({ accepted: true, code: "empty_slot_automatic_opportunity_creation_disabled", created: false });
  }
  const slot = projectReleasedSlot(releasedAppointment, sourceReference);
  if (!slot.accepted) return slot;
  const validation = validateOpportunitySlot({
    slot: slot.value,
    appointmentRepository,
    now,
  });
  if (!validation.accepted) return validation;
  return emptySlotRepository.createOpportunity({
    ...slot.value,
    expiresAt: addMinutes(slot.value.slotStartAt, -5),
  });
}

function previewEmptySlotCandidates({
  opportunityId,
  appointmentRepository,
  emptySlotRepository,
  config,
  now = new Date(),
} = {}) {
  const opportunity = emptySlotRepository.getOpportunityById(opportunityId);
  const validation = validateOpportunityForOutreach({
    opportunity,
    appointmentRepository,
    config,
    now,
  });
  if (!validation.accepted) return validation;
  const appointments = appointmentRepository.listAppointments();
  const eligible = findEligibleEmptySlotCandidates({
    opportunity,
    appointments,
    emptySlotRepository,
    config,
    now,
  });
  const ranked = rankEmptySlotCandidates({
    opportunity,
    candidates: eligible.candidates,
  });
  const selected = ranked.candidates.slice(0, config.maxCandidatesPerWave);
  return freezeClone({
    accepted: true,
    code: "empty_slot_candidate_preview_ready",
    preview: true,
    opportunity,
    opportunityVersion: opportunity.opportunityVersion,
    slotAvailability: { accepted: true, available: true },
    eligibleCandidateCount: ranked.candidates.length,
    candidates: selected.map(projectCandidate),
    providerMode: config.providerMode,
    offerExpiresAt: addMinutes(now, config.offerValidityMinutes),
    manualConfirmationRequired: true,
    mutating: false,
    providerCalled: false,
    messageSent: false,
  });
}

async function launchEmptySlotOfferWave({
  opportunityId,
  expectedOpportunityVersion,
  appointmentRepository,
  emptySlotRepository,
  outboundMessagingProvider,
  idempotencyStore,
  config,
  now = new Date(),
} = {}) {
  if (!config?.engineEnabled) return reject("empty_slot_engine_disabled");
  const opportunity = emptySlotRepository.getOpportunityById(opportunityId);
  if (!opportunity) return reject("empty_slot_opportunity_not_found");
  const fingerprint = hash({
    operation: "empty_slot_offer_wave",
    opportunityId,
    expectedOpportunityVersion,
  });
  const idempotencyKey = `empty_slot_wave:${opportunityId}:${expectedOpportunityVersion}`;
  const replay = resolveReplay(idempotencyStore, idempotencyKey, fingerprint);
  if (replay) return replay;
  const validation = validateOpportunityForOutreach({
    opportunity,
    appointmentRepository,
    config,
    now,
    expectedOpportunityVersion,
  });
  if (!validation.accepted) return validation;
  const reserve = idempotencyStore.reserveResult({ idempotencyKey, requestFingerprint: fingerprint });
  if (!reserve?.accepted) return reject(reserve?.code || "empty_slot_wave_idempotency_failed");

  const preview = previewEmptySlotCandidates({
    opportunityId,
    appointmentRepository,
    emptySlotRepository,
    config,
    now,
  });
  if (!preview.accepted) return preview;
  const wave = emptySlotRepository.incrementOpportunityWave(opportunityId);
  const offers = emptySlotRepository.createOffers({
    opportunity: wave.opportunity,
    candidates: preview.candidates.map((candidate) => ({
      appointment: appointmentRepository.getAppointmentById(candidate.appointmentId),
      rankingPosition: candidate.rankingPosition,
    })),
    expiresAt: preview.offerExpiresAt,
  });
  const results = [];
  for (const offer of offers.offers) {
    results.push(await dispatchOffer({
      offer,
      opportunity: wave.opportunity,
      appointmentRepository,
      emptySlotRepository,
      outboundMessagingProvider,
      config,
    }));
  }
  const result = freezeClone({
    accepted: true,
    code: "empty_slot_offer_wave_completed",
    opportunityId,
    createdOfferCount: offers.createdCount,
    dispatchedCount: results.filter((item) => item.accepted).length,
    failedCount: results.filter((item) => !item.accepted).length,
    results,
  });
  idempotencyStore.storeResult({ idempotencyKey, requestFingerprint: fingerprint, result });
  return result;
}

async function dispatchOffer({
  offer,
  opportunity,
  appointmentRepository,
  emptySlotRepository,
  outboundMessagingProvider,
  config,
}) {
  const appointment = appointmentRepository.getAppointmentById(offer.candidateAppointmentId);
  const message = buildEmptySlotOfferMessage({
    opportunity,
    appointment,
    expiresAt: offer.expiresAt,
  });
  if (!appointment || !message.accepted) {
    const failed = emptySlotRepository.updateOfferStatus({
      offerId: offer.offerId,
      status: EMPTY_SLOT_OFFER_STATUS.FAILED,
      safeFailureCategory: "offer_message_invalid",
    });
    return freezeClone({ accepted: false, code: "empty_slot_offer_failed", offer: failed.offer, providerCalled: false });
  }
  const providerResult = await outboundMessagingProvider.sendEmptySlotOffer({
    commandKind: "empty_slot_offer_dispatch_command_v1",
    operationReference: offer.outboundOperationReference,
    offer,
    opportunity,
    appointment,
    destination: appointment.outboundDestination,
    message,
    acceptPayload: config.acceptPayload,
    declinePayload: config.declinePayload,
  });
  if (!providerResult?.accepted) {
    const failed = emptySlotRepository.updateOfferStatus({
      offerId: offer.offerId,
      status: providerResult?.ambiguous ? EMPTY_SLOT_OFFER_STATUS.AMBIGUOUS : EMPTY_SLOT_OFFER_STATUS.FAILED,
      safeFailureCategory: providerResult?.code || "provider_failed",
    });
    return freezeClone({ accepted: false, code: "empty_slot_offer_failed", offer: failed.offer, providerCalled: true });
  }
  const updated = emptySlotRepository.updateOfferStatus({
    offerId: offer.offerId,
    status: EMPTY_SLOT_OFFER_STATUS.OFFERED,
    providerMessageReference: providerResult.providerMessageId,
  });
  return freezeClone({ accepted: true, code: "empty_slot_offer_dispatched", offer: updated.offer, providerCalled: true });
}

function acceptEmptySlotOffer({
  offerId,
  appointmentRepository,
  emptySlotRepository,
  reminderRepository,
  reminderConfig,
  idempotencyStore,
  now = new Date(),
  actor = { actorId: "empty_slot_webhook", actorRole: "system" },
} = {}) {
  const offer = emptySlotRepository.getOfferById(offerId);
  if (!offer) return reject("empty_slot_offer_not_found");
  const fingerprint = hash({ operation: "empty_slot_accept", offerId, candidateAppointmentId: offer.candidateAppointmentId, candidateAppointmentVersion: offer.candidateAppointmentVersion });
  const idempotencyKey = `empty_slot_accept:${offerId}`;
  const replay = resolveReplay(idempotencyStore, idempotencyKey, fingerprint);
  if (replay) return replay;
  const reserve = idempotencyStore.reserveResult({ idempotencyKey, requestFingerprint: fingerprint });
  if (!reserve?.accepted) return reject(reserve?.code || "empty_slot_accept_idempotency_failed");
  const opportunity = emptySlotRepository.getOpportunityById(offer.opportunityId);
  const validation = validateAcceptance({
    offer,
    opportunity,
    appointmentRepository,
    emptySlotRepository,
    now,
  });
  if (!validation.accepted) {
    emptySlotRepository.updateOfferStatus({
      offerId,
      status: EMPTY_SLOT_OFFER_STATUS.SUPERSEDED,
      responseType: "accept_unavailable",
      safeFailureCategory: validation.code,
    });
    const result = freezeClone({ accepted: false, code: validation.code, appointmentMoved: false });
    idempotencyStore.storeResult({ idempotencyKey, requestFingerprint: fingerprint, result });
    return result;
  }
  const appointment = validation.appointment;
  const mutation = appointmentRepository.rescheduleAppointment({
    appointmentId: appointment.id,
    expectedVersion: appointment.version,
    selectedSlot: {
      id: `empty-slot-${opportunity.opportunityId}`,
      startAt: opportunity.slotStartAt,
      endAt: opportunity.slotEndAt,
      durationMinutes: opportunity.durationMinutes,
    },
    idempotencyKey,
    actor,
  });
  if (!mutation || mutation.status !== "ok") return reject("empty_slot_accept_reschedule_failed");
  emptySlotRepository.updateOfferStatus({
    offerId,
    status: EMPTY_SLOT_OFFER_STATUS.ACCEPTED,
    responseType: "accept",
  });
  emptySlotRepository.updateOpportunityStatus({
    opportunityId: opportunity.opportunityId,
    status: EMPTY_SLOT_OPPORTUNITY_STATUS.FILLED,
    filledAppointmentId: appointment.id,
    safeClosureCategory: "accepted_by_candidate",
  });
  const superseded = emptySlotRepository.supersedeCompetingOffers({
    opportunityId: opportunity.opportunityId,
    acceptedOfferId: offerId,
  });
  const reminderCancellation = cancelObsoleteAppointmentReminderJobs({
    reminderRepository,
    appointmentId: appointment.id,
    appointmentVersion: appointment.version,
    reason: "empty_slot_accept_rescheduled",
  });
  const reminderReconciliation = reconcileOneAppointmentReminders({
    appointment: mutation.appointment,
    reminderRepository,
    reminderConfig,
    now,
  });
  const result = freezeClone({
    accepted: true,
    code: "empty_slot_offer_accepted",
    appointmentMoved: true,
    appointmentId: appointment.id,
    previousAppointmentVersion: appointment.version,
    resultingAppointmentVersion: mutation.nextAppointmentVersion,
    opportunityId: opportunity.opportunityId,
    supersededCount: superseded.supersededCount,
    calendarUpdateRequired: true,
    patientNotificationRequired: true,
    reminderCancellation,
    reminderReconciliation,
  });
  idempotencyStore.storeResult({ idempotencyKey, requestFingerprint: fingerprint, result });
  return result;
}

function declineEmptySlotOffer({ offerId, emptySlotRepository } = {}) {
  const offer = emptySlotRepository.getOfferById(offerId);
  if (!offer) return reject("empty_slot_offer_not_found");
  if (offer.status === EMPTY_SLOT_OFFER_STATUS.DECLINED) {
    return freezeClone({ accepted: true, code: "empty_slot_offer_decline_replay", declined: false });
  }
  const update = emptySlotRepository.updateOfferStatus({
    offerId,
    status: EMPTY_SLOT_OFFER_STATUS.DECLINED,
    responseType: "decline",
  });
  return freezeClone({ accepted: true, code: "empty_slot_offer_declined", declined: true, offer: update.offer });
}

function optOutEarlierSlotOffers({ appointmentId, emptySlotRepository } = {}) {
  const consent = emptySlotRepository.upsertConsent({
    appointmentId,
    enabled: false,
    source: "patient_opt_out",
  });
  for (const offer of emptySlotRepository.listOffersForAppointment(appointmentId)) {
    if ([EMPTY_SLOT_OFFER_STATUS.PREPARED, EMPTY_SLOT_OFFER_STATUS.DISPATCHING, EMPTY_SLOT_OFFER_STATUS.OFFERED].includes(offer.status)) {
      emptySlotRepository.updateOfferStatus({
        offerId: offer.offerId,
        status: EMPTY_SLOT_OFFER_STATUS.INVALIDATED,
        responseType: "opt_out",
        safeFailureCategory: "patient_opted_out",
      });
    }
  }
  return freezeClone({ accepted: true, code: "empty_slot_consent_opted_out", consent: consent.consent });
}

async function runEmptySlotCycle({
  emptySlotRepository,
  appointmentRepository,
  outboundMessagingProvider,
  idempotencyStore,
  config,
  now = new Date(),
} = {}) {
  const expired = emptySlotRepository.expireDue({ now });
  const invalidated = invalidateOccupiedOpportunities({
    emptySlotRepository,
    appointmentRepository,
    now,
  });
  const automaticWaves = [];
  if (
    config?.engineEnabled &&
    config.automaticOutreachEnabled &&
    appointmentRepository &&
    outboundMessagingProvider &&
    idempotencyStore
  ) {
    for (const opportunity of emptySlotRepository.listOpportunities({
      status: EMPTY_SLOT_OPPORTUNITY_STATUS.OPEN,
      limit: 10,
    })) {
      const wave = await launchEmptySlotOfferWave({
        opportunityId: opportunity.opportunityId,
        expectedOpportunityVersion: opportunity.opportunityVersion,
        appointmentRepository,
        emptySlotRepository,
        outboundMessagingProvider,
        idempotencyStore,
        config,
        now,
      });
      automaticWaves.push({
        accepted: wave.accepted === true,
        code: wave.code,
        opportunityId: opportunity.opportunityId,
        createdOfferCount: wave.createdOfferCount || 0,
        dispatchedCount: wave.dispatchedCount || 0,
        failedCount: wave.failedCount || 0,
      });
    }
  }
  return freezeClone({
    accepted: true,
    code: "empty_slot_cycle_completed",
    expired,
    invalidated,
    automaticWaves,
  });
}

function invalidateOccupiedOpportunities({ emptySlotRepository, appointmentRepository, now }) {
  if (!appointmentRepository) {
    return { accepted: true, invalidatedOpportunities: 0, invalidatedOffers: 0 };
  }
  let invalidatedOpportunities = 0;
  let invalidatedOffers = 0;
  for (const status of [
    EMPTY_SLOT_OPPORTUNITY_STATUS.OPEN,
    EMPTY_SLOT_OPPORTUNITY_STATUS.OUTREACH_IN_PROGRESS,
  ]) {
    for (const opportunity of emptySlotRepository.listOpportunities({ status, limit: 100 })) {
      const validation = validateOpportunitySlot({
        slot: opportunity,
        appointmentRepository,
        now,
      });
      if (validation.accepted) continue;
      emptySlotRepository.updateOpportunityStatus({
        opportunityId: opportunity.opportunityId,
        status: EMPTY_SLOT_OPPORTUNITY_STATUS.INVALIDATED,
        safeClosureCategory: validation.code,
      });
      invalidatedOpportunities += 1;
      for (const offer of emptySlotRepository.listOffersForOpportunity(opportunity.opportunityId)) {
        if ([EMPTY_SLOT_OFFER_STATUS.PREPARED, EMPTY_SLOT_OFFER_STATUS.DISPATCHING, EMPTY_SLOT_OFFER_STATUS.OFFERED].includes(offer.status)) {
          emptySlotRepository.updateOfferStatus({
            offerId: offer.offerId,
            status: EMPTY_SLOT_OFFER_STATUS.INVALIDATED,
            safeFailureCategory: validation.code,
          });
          invalidatedOffers += 1;
        }
      }
    }
  }
  return { accepted: true, invalidatedOpportunities, invalidatedOffers };
}

function validateOpportunityForOutreach({ opportunity, appointmentRepository, config, now, expectedOpportunityVersion }) {
  if (!config?.engineEnabled) return reject("empty_slot_engine_disabled");
  if (!opportunity) return reject("empty_slot_opportunity_not_found");
  if (expectedOpportunityVersion && opportunity.opportunityVersion !== expectedOpportunityVersion) return reject("empty_slot_opportunity_version_conflict");
  if (![EMPTY_SLOT_OPPORTUNITY_STATUS.OPEN, EMPTY_SLOT_OPPORTUNITY_STATUS.OUTREACH_IN_PROGRESS].includes(opportunity.status)) return reject("empty_slot_opportunity_not_open");
  if (Date.parse(opportunity.expiresAt) <= Date.parse(toIso(now))) return reject("empty_slot_opportunity_expired");
  return validateOpportunitySlot({ slot: opportunity, appointmentRepository, now });
}

function validateOpportunitySlot({ slot, appointmentRepository, now }) {
  if (Date.parse(slot.slotStartAt) <= Date.parse(toIso(now))) return reject("empty_slot_not_future");
  const conflict = appointmentRepository.listAppointments().some((appointment) => {
    if (normalizeText(appointment.appointmentStatus || appointment.status) !== APPOINTMENT_STATUS.SCHEDULED) return false;
    if (normalizeText(appointment.doctor?.id || appointment.doctorId) !== slot.doctorId) return false;
    return rangesOverlap(slot.slotStartAt, slot.slotEndAt, appointment.startAt, appointment.endAt);
  });
  if (conflict) return reject("empty_slot_occupied");
  return freezeClone({ accepted: true });
}

function validateAcceptance({ offer, opportunity, appointmentRepository, emptySlotRepository, now }) {
  if (!offer || ![EMPTY_SLOT_OFFER_STATUS.OFFERED, EMPTY_SLOT_OFFER_STATUS.PREPARED].includes(offer.status)) return reject("empty_slot_offer_not_active");
  if (Date.parse(offer.expiresAt) <= Date.parse(toIso(now))) return reject("empty_slot_offer_expired");
  if (!opportunity || opportunity.status !== EMPTY_SLOT_OPPORTUNITY_STATUS.OUTREACH_IN_PROGRESS) return reject("empty_slot_opportunity_unavailable");
  if (offer.opportunityVersion !== opportunity.opportunityVersion) return reject("empty_slot_opportunity_version_conflict");
  const appointment = appointmentRepository.getAppointmentById(offer.candidateAppointmentId);
  if (!appointment || appointment.version !== offer.candidateAppointmentVersion) return reject("empty_slot_candidate_version_changed");
  if (normalizeText(appointment.appointmentStatus || appointment.status) !== APPOINTMENT_STATUS.SCHEDULED) return reject("empty_slot_candidate_not_scheduled");
  if (Date.parse(appointment.startAt) <= Date.parse(opportunity.slotStartAt)) return reject("empty_slot_candidate_not_later");
  const consent = emptySlotRepository.getConsentForAppointment(appointment.id);
  if (!consent?.enabled) return reject("empty_slot_consent_inactive");
  const slot = validateOpportunitySlot({ slot: opportunity, appointmentRepository, now });
  if (!slot.accepted) return slot;
  if (normalizeText(appointment.doctor?.id || appointment.doctorId) !== opportunity.doctorId) return reject("empty_slot_doctor_mismatch");
  if (normalizeText(appointment.appointmentPurpose) !== opportunity.appointmentPurpose) return reject("empty_slot_purpose_mismatch");
  if (Number(appointment.durationMinutes) !== Number(opportunity.durationMinutes)) return reject("empty_slot_duration_mismatch");
  return freezeClone({ accepted: true, appointment });
}

function projectReleasedSlot(appointment, sourceReference) {
  if (!appointment) return reject("missing_released_appointment");
  return freezeClone({
    accepted: true,
    value: {
      doctorId: normalizeText(appointment.doctor?.id || appointment.doctorId),
      doctorName: normalizeText(appointment.doctor?.name || appointment.doctorName),
      appointmentPurpose: normalizeText(appointment.appointmentPurpose),
      durationMinutes: Number(appointment.durationMinutes),
      slotStartAt: normalizeText(appointment.startAt),
      slotEndAt: normalizeText(appointment.endAt),
      sourceReference: normalizeText(sourceReference) || `released:${appointment.id}:${appointment.version}`,
    },
  });
}

function projectCandidate(candidate) {
  return {
    appointmentId: candidate.appointment.id,
    appointmentVersion: candidate.appointment.version,
    currentStartAt: candidate.appointment.startAt,
    rankingPosition: candidate.rankingPosition,
    improvementMinutes: candidate.improvementMinutes,
    rankingReasons: candidate.rankingReasons,
  };
}

function resolveReplay(idempotencyStore, idempotencyKey, fingerprint) {
  const observed = idempotencyStore.observe(idempotencyKey);
  if (!observed) return null;
  if (observed.requestFingerprint !== fingerprint) return reject("idempotency_key_conflict");
  const result = idempotencyStore.getResult(idempotencyKey);
  return result ? freezeClone({ ...result, matchingReplay: true }) : reject("idempotency_result_reserved");
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}

function addMinutes(value, minutes) {
  return new Date(Date.parse(toIso(value)) + minutes * 60_000).toISOString();
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : normalizeText(value);
}

function reject(code) {
  return freezeClone({ accepted: false, code, reason: "Empty-slot operation failed safely.", providerCalled: false, messageSent: false });
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  acceptEmptySlotOffer,
  createEmptySlotOpportunityFromReleasedAppointment,
  declineEmptySlotOffer,
  launchEmptySlotOfferWave,
  optOutEarlierSlotOffers,
  previewEmptySlotCandidates,
  runEmptySlotCycle,
};
