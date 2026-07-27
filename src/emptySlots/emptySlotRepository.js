const crypto = require("node:crypto");

const EMPTY_SLOT_OPPORTUNITY_STATUS = Object.freeze({
  OPEN: "open",
  OUTREACH_IN_PROGRESS: "outreach_in_progress",
  FILLED: "filled",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  INVALIDATED: "invalidated",
});

const EMPTY_SLOT_OFFER_STATUS = Object.freeze({
  PREPARED: "prepared",
  DISPATCHING: "dispatching",
  OFFERED: "offered",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  EXPIRED: "expired",
  SUPERSEDED: "superseded",
  FAILED: "failed",
  AMBIGUOUS: "ambiguous",
  INVALIDATED: "invalidated",
});

function createInMemoryEmptySlotRepository({
  clinicId = "oravia_demo_clinic",
} = {}) {
  const opportunities = new Map();
  const opportunityByFingerprint = new Map();
  const consents = new Map();
  const offers = new Map();
  let sequence = 0;

  return Object.freeze({
    repositoryType: "in_memory_empty_slot_repository_v1",
    storage: "in_memory",
    durablePersistence: false,
    databasePersisted: false,
    createOpportunity(input) {
      const value = normalizeOpportunityInput({ clinicId, ...input });
      if (!value.accepted) return value;
      const existingId = opportunityByFingerprint.get(value.sourceFingerprint);
      if (existingId) {
        return freezeClone({
          accepted: true,
          created: false,
          duplicate: true,
          opportunity: projectOpportunity(opportunities.get(existingId)),
        });
      }
      sequence += 1;
      const now = nowIso();
      const opportunity = {
        ...value.opportunity,
        opportunityId: `empty_slot_${sequence}`,
        opportunityVersion: 1,
        status: EMPTY_SLOT_OPPORTUNITY_STATUS.OPEN,
        waveCount: 0,
        filledAppointmentId: null,
        safeClosureCategory: null,
        createdAt: now,
        updatedAt: now,
        sequence,
      };
      opportunities.set(opportunity.opportunityId, freezeClone(opportunity));
      opportunityByFingerprint.set(value.sourceFingerprint, opportunity.opportunityId);
      return freezeClone({
        accepted: true,
        created: true,
        opportunity: projectOpportunity(opportunity),
      });
    },
    getOpportunityById(opportunityId) {
      const opportunity = opportunities.get(normalizeText(opportunityId));
      return opportunity ? projectOpportunity(opportunity) : null;
    },
    listOpportunities({ status, limit = 50 } = {}) {
      return Array.from(opportunities.values())
        .filter((item) => item.clinicId === clinicId)
        .filter((item) => !status || item.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, boundedLimit(limit))
        .map(projectOpportunity);
    },
    getSummary() {
      const counts = {
        open: 0,
        outreach_in_progress: 0,
        filled: 0,
        expired: 0,
        cancelled: 0,
        invalidated: 0,
      };
      for (const opportunity of opportunities.values()) {
        if (opportunity.clinicId === clinicId) {
          counts[opportunity.status] = (counts[opportunity.status] || 0) + 1;
        }
      }
      return freezeClone({ accepted: true, counts });
    },
    updateOpportunityStatus(input) {
      const id = normalizeText(input?.opportunityId);
      const opportunity = opportunities.get(id);
      if (!opportunity || opportunity.clinicId !== clinicId) {
        return reject("empty_slot_opportunity_not_found");
      }
      const updated = {
        ...opportunity,
        status: normalizeOpportunityStatus(input.status) || opportunity.status,
        opportunityVersion: opportunity.opportunityVersion + 1,
        filledAppointmentId: normalizeText(input.filledAppointmentId) || opportunity.filledAppointmentId,
        safeClosureCategory: normalizeText(input.safeClosureCategory) || opportunity.safeClosureCategory,
        updatedAt: nowIso(),
      };
      opportunities.set(id, freezeClone(updated));
      return freezeClone({ accepted: true, opportunity: projectOpportunity(updated) });
    },
    incrementOpportunityWave(opportunityId) {
      const id = normalizeText(opportunityId);
      const opportunity = opportunities.get(id);
      if (!opportunity || opportunity.clinicId !== clinicId) {
        return reject("empty_slot_opportunity_not_found");
      }
      const updated = {
        ...opportunity,
        waveCount: opportunity.waveCount + 1,
        status: EMPTY_SLOT_OPPORTUNITY_STATUS.OUTREACH_IN_PROGRESS,
        opportunityVersion: opportunity.opportunityVersion + 1,
        updatedAt: nowIso(),
      };
      opportunities.set(id, freezeClone(updated));
      return freezeClone({ accepted: true, opportunity: projectOpportunity(updated) });
    },
    upsertConsent(input) {
      const value = normalizeConsentInput({ clinicId, ...input });
      if (!value.accepted) return value;
      const existing = consents.get(value.key);
      const now = nowIso();
      const consent = {
        ...value.consent,
        consentVersion: existing ? existing.consentVersion + 1 : 1,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        sequence: existing?.sequence || ++sequence,
      };
      consents.set(value.key, freezeClone(consent));
      return freezeClone({ accepted: true, consent: projectConsent(consent) });
    },
    getConsentForAppointment(appointmentId) {
      const consent = consents.get(`${clinicId}:${normalizeText(appointmentId)}`);
      return consent ? projectConsent(consent) : null;
    },
    createOffers({ opportunity, candidates, expiresAt }) {
      const createdOffers = [];
      for (const candidate of Array.isArray(candidates) ? candidates : []) {
        const key = offerCandidateKey({
          clinicId,
          opportunityId: opportunity.opportunityId,
          candidateAppointmentId: candidate.appointment.id,
        });
        const existing = findOfferByCandidateKey(offers, key);
        if (existing && isActiveOffer(existing.status)) continue;
        sequence += 1;
        const now = nowIso();
        const offer = {
          offerId: `empty_slot_offer_${sequence}`,
          clinicId,
          opportunityId: opportunity.opportunityId,
          opportunityVersion: opportunity.opportunityVersion,
          candidateAppointmentId: candidate.appointment.id,
          candidateAppointmentVersion: candidate.appointment.version,
          waveNumber: opportunity.waveCount,
          rankingPosition: candidate.rankingPosition,
          status: EMPTY_SLOT_OFFER_STATUS.PREPARED,
          expiresAt,
          outboundOperationReference: `empty_slot_offer_${sequence}`,
          providerMessageReference: null,
          responseType: null,
          safeFailureCategory: null,
          candidateKey: key,
          createdAt: now,
          updatedAt: now,
          sequence,
        };
        offers.set(offer.offerId, freezeClone(offer));
        createdOffers.push(projectOffer(offer));
      }
      return freezeClone({ accepted: true, createdCount: createdOffers.length, offers: createdOffers });
    },
    updateOfferStatus(input) {
      const id = normalizeText(input?.offerId);
      const offer = offers.get(id);
      if (!offer || offer.clinicId !== clinicId) return reject("empty_slot_offer_not_found");
      const updated = {
        ...offer,
        status: normalizeOfferStatus(input.status) || offer.status,
        providerMessageReference: normalizeText(input.providerMessageReference) || offer.providerMessageReference,
        responseType: normalizeText(input.responseType) || offer.responseType,
        safeFailureCategory: normalizeText(input.safeFailureCategory) || offer.safeFailureCategory,
        updatedAt: nowIso(),
      };
      offers.set(id, freezeClone(updated));
      return freezeClone({ accepted: true, offer: projectOffer(updated) });
    },
    getOfferById(offerId) {
      const offer = offers.get(normalizeText(offerId));
      return offer ? projectOffer(offer) : null;
    },
    listOffersForOpportunity(opportunityId) {
      return Array.from(offers.values())
        .filter((offer) => offer.clinicId === clinicId && offer.opportunityId === normalizeText(opportunityId))
        .sort((a, b) => a.rankingPosition - b.rankingPosition)
        .map(projectOffer);
    },
    listOffersForAppointment(appointmentId) {
      return Array.from(offers.values())
        .filter((offer) => offer.clinicId === clinicId && offer.candidateAppointmentId === normalizeText(appointmentId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(projectOffer);
    },
    supersedeCompetingOffers({ opportunityId, acceptedOfferId }) {
      let supersededCount = 0;
      for (const [id, offer] of offers.entries()) {
        if (
          offer.clinicId === clinicId &&
          offer.opportunityId === normalizeText(opportunityId) &&
          offer.offerId !== normalizeText(acceptedOfferId) &&
          isActiveOffer(offer.status)
        ) {
          offers.set(id, freezeClone({
            ...offer,
            status: EMPTY_SLOT_OFFER_STATUS.SUPERSEDED,
            safeFailureCategory: "opportunity_filled",
            updatedAt: nowIso(),
          }));
          supersededCount += 1;
        }
      }
      return freezeClone({ accepted: true, supersededCount });
    },
    expireDue({ now = new Date() } = {}) {
      const nowMs = Date.parse(toIso(now));
      let expiredOffers = 0;
      let expiredOpportunities = 0;
      for (const [id, offer] of offers.entries()) {
        if (offer.clinicId === clinicId && isActiveOffer(offer.status) && Date.parse(offer.expiresAt) <= nowMs) {
          offers.set(id, freezeClone({ ...offer, status: EMPTY_SLOT_OFFER_STATUS.EXPIRED, updatedAt: nowIso() }));
          expiredOffers += 1;
        }
      }
      for (const [id, opportunity] of opportunities.entries()) {
        if (
          opportunity.clinicId === clinicId &&
          [EMPTY_SLOT_OPPORTUNITY_STATUS.OPEN, EMPTY_SLOT_OPPORTUNITY_STATUS.OUTREACH_IN_PROGRESS].includes(opportunity.status) &&
          Date.parse(opportunity.expiresAt) <= nowMs
        ) {
          opportunities.set(id, freezeClone({
            ...opportunity,
            status: EMPTY_SLOT_OPPORTUNITY_STATUS.EXPIRED,
            safeClosureCategory: "opportunity_expired",
            opportunityVersion: opportunity.opportunityVersion + 1,
            updatedAt: nowIso(),
          }));
          expiredOpportunities += 1;
        }
      }
      return freezeClone({ accepted: true, expiredOffers, expiredOpportunities });
    },
  });
}

function projectOpportunity(opportunity) {
  return freezeClone({
    opportunityId: opportunity.opportunityId,
    clinicId: opportunity.clinicId,
    doctorId: opportunity.doctorId,
    doctorName: opportunity.doctorName,
    appointmentPurpose: opportunity.appointmentPurpose,
    durationMinutes: opportunity.durationMinutes,
    slotStartAt: opportunity.slotStartAt,
    slotEndAt: opportunity.slotEndAt,
    sourceReference: opportunity.sourceReference,
    opportunityVersion: opportunity.opportunityVersion,
    status: opportunity.status,
    waveCount: opportunity.waveCount,
    expiresAt: opportunity.expiresAt,
    filledAppointmentId: opportunity.filledAppointmentId,
    safeClosureCategory: opportunity.safeClosureCategory,
    createdAt: opportunity.createdAt,
    updatedAt: opportunity.updatedAt,
  });
}

function projectConsent(consent) {
  return freezeClone({
    clinicId: consent.clinicId,
    appointmentId: consent.appointmentId,
    enabled: consent.enabled,
    sameDoctorOnly: true,
    weekdays: consent.weekdays,
    dayparts: consent.dayparts,
    minimumNoticeMinutes: consent.minimumNoticeMinutes,
    consentVersion: consent.consentVersion,
    source: consent.source,
    createdAt: consent.createdAt,
    updatedAt: consent.updatedAt,
    sequence: consent.sequence,
  });
}

function projectOffer(offer) {
  return freezeClone({
    offerId: offer.offerId,
    clinicId: offer.clinicId,
    opportunityId: offer.opportunityId,
    opportunityVersion: offer.opportunityVersion,
    candidateAppointmentId: offer.candidateAppointmentId,
    candidateAppointmentVersion: offer.candidateAppointmentVersion,
    waveNumber: offer.waveNumber,
    rankingPosition: offer.rankingPosition,
    status: offer.status,
    expiresAt: offer.expiresAt,
    outboundOperationReference: offer.outboundOperationReference,
    providerMessageReference: offer.providerMessageReference,
    responseType: offer.responseType,
    safeFailureCategory: offer.safeFailureCategory,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  });
}

function normalizeOpportunityInput(input) {
  const clinicId = normalizeText(input.clinicId);
  const doctorId = normalizeText(input.doctorId);
  const doctorName = normalizeText(input.doctorName);
  const appointmentPurpose = normalizeText(input.appointmentPurpose);
  const durationMinutes = Number(input.durationMinutes);
  const slotStartAt = normalizeText(input.slotStartAt);
  const slotEndAt = normalizeText(input.slotEndAt);
  const sourceReference = normalizeText(input.sourceReference);
  const expiresAt = normalizeText(input.expiresAt);
  if (!clinicId || !doctorId || !appointmentPurpose || !Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || !slotStartAt || !slotEndAt || !sourceReference || !expiresAt) {
    return reject("invalid_empty_slot_opportunity_input");
  }
  const sourceFingerprint = crypto.createHash("sha256").update(`${clinicId}:${doctorId}:${appointmentPurpose}:${durationMinutes}:${slotStartAt}:${slotEndAt}:${sourceReference}`).digest("hex");
  return {
    accepted: true,
    sourceFingerprint,
    opportunity: {
      clinicId,
      doctorId,
      doctorName,
      appointmentPurpose,
      durationMinutes,
      slotStartAt,
      slotEndAt,
      sourceReference,
      expiresAt,
    },
  };
}

function normalizeConsentInput(input) {
  const clinicId = normalizeText(input.clinicId);
  const appointmentId = normalizeText(input.appointmentId);
  if (!clinicId || !appointmentId) return reject("invalid_empty_slot_consent_input");
  return {
    accepted: true,
    key: `${clinicId}:${appointmentId}`,
    consent: {
      clinicId,
      appointmentId,
      enabled: input.enabled === true,
      sameDoctorOnly: true,
      weekdays: normalizeList(input.weekdays),
      dayparts: normalizeList(input.dayparts),
      minimumNoticeMinutes: Number.isSafeInteger(input.minimumNoticeMinutes)
        ? Math.max(0, Math.min(input.minimumNoticeMinutes, 30 * 24 * 60))
        : 0,
      source: normalizeText(input.source) || "controlled_internal_action",
    },
  };
}

function normalizeList(value) {
  return Array.isArray(value)
    ? value.map(normalizeText).filter(Boolean).slice(0, 7)
    : [];
}

function findOfferByCandidateKey(offers, key) {
  for (const offer of offers.values()) {
    if (offer.candidateKey === key) return offer;
  }
  return null;
}

function offerCandidateKey({ clinicId, opportunityId, candidateAppointmentId }) {
  return `${clinicId}:${opportunityId}:${candidateAppointmentId}`;
}

function isActiveOffer(status) {
  return [
    EMPTY_SLOT_OFFER_STATUS.PREPARED,
    EMPTY_SLOT_OFFER_STATUS.DISPATCHING,
    EMPTY_SLOT_OFFER_STATUS.OFFERED,
  ].includes(status);
}

function normalizeOpportunityStatus(value) {
  const status = normalizeText(value);
  return Object.values(EMPTY_SLOT_OPPORTUNITY_STATUS).includes(status) ? status : "";
}

function normalizeOfferStatus(value) {
  const status = normalizeText(value);
  return Object.values(EMPTY_SLOT_OFFER_STATUS).includes(status) ? status : "";
}

function boundedLimit(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100 ? parsed : 50;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : normalizeText(value);
}

function nowIso() {
  return new Date().toISOString();
}

function reject(code) {
  return freezeClone({ accepted: false, code, reason: "Empty-slot repository operation failed safely." });
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  EMPTY_SLOT_OFFER_STATUS,
  EMPTY_SLOT_OPPORTUNITY_STATUS,
  createInMemoryEmptySlotRepository,
  isActiveEmptySlotOffer: isActiveOffer,
  projectEmptySlotOffer: projectOffer,
  projectEmptySlotOpportunity: projectOpportunity,
};
