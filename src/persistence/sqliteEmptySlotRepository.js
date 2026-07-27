const crypto = require("node:crypto");
const {
  EMPTY_SLOT_OFFER_STATUS,
  EMPTY_SLOT_OPPORTUNITY_STATUS,
  isActiveEmptySlotOffer,
  projectEmptySlotOffer,
  projectEmptySlotOpportunity,
} = require("../emptySlots/emptySlotRepository");
const { freezeClone, parseJsonValue, stringifyJson } = require("./sqliteJson");

function createSqliteEmptySlotRepository({ persistenceProvider }) {
  const database = persistenceProvider.getDatabase();
  const clinicId = persistenceProvider.getClinicId();

  return Object.freeze({
    repositoryType: "sqlite_empty_slot_repository_v1",
    storage: "sqlite",
    durablePersistence: true,
    databasePersisted: true,
    createOpportunity(input) {
      const value = normalizeOpportunityInput({ clinicId, ...input });
      if (!value.accepted) return value;
      const existing = database
        .prepare(`SELECT * FROM empty_slot_opportunities WHERE clinic_id = ? AND source_fingerprint = ?`)
        .get(clinicId, value.sourceFingerprint);
      if (existing) {
        return freezeClone({ accepted: true, created: false, duplicate: true, opportunity: projectEmptySlotOpportunity(rowToOpportunity(existing)) });
      }
      const opportunityId = `empty_slot_${crypto.randomBytes(12).toString("base64url")}`;
      const now = new Date().toISOString();
      database
        .prepare(
          `INSERT INTO empty_slot_opportunities (
            clinic_id, opportunity_id, doctor_id, doctor_name, appointment_purpose,
            duration_minutes, slot_start_at, slot_end_at, source_reference,
            source_fingerprint, opportunity_version, status, wave_count,
            expires_at, filled_appointment_id, safe_closure_category, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, NULL, NULL, ?, ?)`
        )
        .run(
          clinicId,
          opportunityId,
          value.opportunity.doctorId,
          value.opportunity.doctorName,
          value.opportunity.appointmentPurpose,
          value.opportunity.durationMinutes,
          value.opportunity.slotStartAt,
          value.opportunity.slotEndAt,
          value.opportunity.sourceReference,
          value.sourceFingerprint,
          EMPTY_SLOT_OPPORTUNITY_STATUS.OPEN,
          value.opportunity.expiresAt,
          now,
          now
        );
      return freezeClone({
        accepted: true,
        created: true,
        opportunity: projectEmptySlotOpportunity(getOpportunity(database, clinicId, opportunityId)),
      });
    },
    getOpportunityById(opportunityId) {
      const opportunity = getOpportunity(database, clinicId, normalizeText(opportunityId));
      return opportunity ? projectEmptySlotOpportunity(opportunity) : null;
    },
    listOpportunities({ status, limit = 50 } = {}) {
      const safeStatus = normalizeText(status);
      const safeLimit = boundedLimit(limit);
      const rows = safeStatus
        ? database.prepare(`SELECT * FROM empty_slot_opportunities WHERE clinic_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?`).all(clinicId, safeStatus, safeLimit)
        : database.prepare(`SELECT * FROM empty_slot_opportunities WHERE clinic_id = ? ORDER BY created_at DESC LIMIT ?`).all(clinicId, safeLimit);
      return rows.map(rowToOpportunity).map(projectEmptySlotOpportunity);
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
      for (const row of database.prepare(`SELECT status, COUNT(*) AS count FROM empty_slot_opportunities WHERE clinic_id = ? GROUP BY status`).all(clinicId)) {
        counts[row.status] = row.count;
      }
      return freezeClone({ accepted: true, counts });
    },
    updateOpportunityStatus(input) {
      const id = normalizeText(input?.opportunityId);
      const opportunity = getOpportunity(database, clinicId, id);
      if (!opportunity) return reject("empty_slot_opportunity_not_found");
      database
        .prepare(
          `UPDATE empty_slot_opportunities
           SET status = ?, opportunity_version = opportunity_version + 1,
               filled_appointment_id = ?, safe_closure_category = ?, updated_at = ?
           WHERE clinic_id = ? AND opportunity_id = ?`
        )
        .run(
          normalizeText(input.status) || opportunity.status,
          normalizeText(input.filledAppointmentId) || opportunity.filledAppointmentId,
          normalizeText(input.safeClosureCategory) || opportunity.safeClosureCategory,
          new Date().toISOString(),
          clinicId,
          id
        );
      return freezeClone({ accepted: true, opportunity: projectEmptySlotOpportunity(getOpportunity(database, clinicId, id)) });
    },
    incrementOpportunityWave(opportunityId) {
      const id = normalizeText(opportunityId);
      const result = database
        .prepare(
          `UPDATE empty_slot_opportunities
           SET wave_count = wave_count + 1, opportunity_version = opportunity_version + 1,
               status = ?, updated_at = ?
           WHERE clinic_id = ? AND opportunity_id = ?`
        )
        .run(EMPTY_SLOT_OPPORTUNITY_STATUS.OUTREACH_IN_PROGRESS, new Date().toISOString(), clinicId, id);
      if (result.changes < 1) return reject("empty_slot_opportunity_not_found");
      return freezeClone({ accepted: true, opportunity: projectEmptySlotOpportunity(getOpportunity(database, clinicId, id)) });
    },
    upsertConsent(input) {
      const value = normalizeConsentInput({ clinicId, ...input });
      if (!value.accepted) return value;
      const now = new Date().toISOString();
      const existing = database.prepare(`SELECT consent_version, created_at, created_sequence FROM empty_slot_consents WHERE clinic_id = ? AND appointment_id = ?`).get(clinicId, value.consent.appointmentId);
      database
        .prepare(
          `INSERT INTO empty_slot_consents (
            clinic_id, appointment_id, enabled, same_doctor_only, weekdays_json,
            dayparts_json, minimum_notice_minutes, consent_version, source,
            created_at, updated_at, created_sequence
          )
          VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(clinic_id, appointment_id)
          DO UPDATE SET enabled = excluded.enabled,
            weekdays_json = excluded.weekdays_json,
            dayparts_json = excluded.dayparts_json,
            minimum_notice_minutes = excluded.minimum_notice_minutes,
            consent_version = empty_slot_consents.consent_version + 1,
            source = excluded.source,
            updated_at = excluded.updated_at`
        )
        .run(
          clinicId,
          value.consent.appointmentId,
          value.consent.enabled ? 1 : 0,
          stringifyJson(value.consent.weekdays),
          stringifyJson(value.consent.dayparts),
          value.consent.minimumNoticeMinutes,
          existing ? existing.consent_version + 1 : 1,
          value.consent.source,
          existing?.created_at || now,
          now,
          existing?.created_sequence || Date.parse(now)
        );
      return freezeClone({ accepted: true, consent: rowToConsent(database.prepare(`SELECT * FROM empty_slot_consents WHERE clinic_id = ? AND appointment_id = ?`).get(clinicId, value.consent.appointmentId)) });
    },
    getConsentForAppointment(appointmentId) {
      const row = database.prepare(`SELECT * FROM empty_slot_consents WHERE clinic_id = ? AND appointment_id = ?`).get(clinicId, normalizeText(appointmentId));
      return row ? rowToConsent(row) : null;
    },
    createOffers({ opportunity, candidates, expiresAt }) {
      const created = [];
      for (const candidate of Array.isArray(candidates) ? candidates : []) {
        const existing = database
          .prepare(`SELECT * FROM empty_slot_offers WHERE clinic_id = ? AND opportunity_id = ? AND candidate_appointment_id = ?`)
          .get(clinicId, opportunity.opportunityId, candidate.appointment.id);
        if (existing && isActiveEmptySlotOffer(existing.status)) continue;
        if (existing) continue;
        const offerId = `empty_slot_offer_${crypto.randomBytes(12).toString("base64url")}`;
        const now = new Date().toISOString();
        database
          .prepare(
            `INSERT INTO empty_slot_offers (
              clinic_id, offer_id, opportunity_id, opportunity_version,
              candidate_appointment_id, candidate_appointment_version,
              wave_number, ranking_position, status, expires_at,
              outbound_operation_reference, provider_message_reference,
              response_type, safe_failure_category, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`
          )
          .run(
            clinicId,
            offerId,
            opportunity.opportunityId,
            opportunity.opportunityVersion,
            candidate.appointment.id,
            candidate.appointment.version,
            opportunity.waveCount,
            candidate.rankingPosition,
            EMPTY_SLOT_OFFER_STATUS.PREPARED,
            expiresAt,
            offerId,
            now,
            now
          );
        created.push(projectEmptySlotOffer(getOffer(database, clinicId, offerId)));
      }
      return freezeClone({ accepted: true, createdCount: created.length, offers: created });
    },
    updateOfferStatus(input) {
      const id = normalizeText(input?.offerId);
      const result = database
        .prepare(
          `UPDATE empty_slot_offers
           SET status = ?, provider_message_reference = COALESCE(?, provider_message_reference),
               response_type = COALESCE(?, response_type),
               safe_failure_category = COALESCE(?, safe_failure_category),
               updated_at = ?
           WHERE clinic_id = ? AND offer_id = ?`
        )
        .run(
          normalizeText(input.status),
          normalizeText(input.providerMessageReference) || null,
          normalizeText(input.responseType) || null,
          normalizeText(input.safeFailureCategory) || null,
          new Date().toISOString(),
          clinicId,
          id
        );
      if (result.changes < 1) return reject("empty_slot_offer_not_found");
      return freezeClone({ accepted: true, offer: projectEmptySlotOffer(getOffer(database, clinicId, id)) });
    },
    getOfferById(offerId) {
      const offer = getOffer(database, clinicId, normalizeText(offerId));
      return offer ? projectEmptySlotOffer(offer) : null;
    },
    listOffersForOpportunity(opportunityId) {
      return database.prepare(`SELECT * FROM empty_slot_offers WHERE clinic_id = ? AND opportunity_id = ? ORDER BY ranking_position`).all(clinicId, normalizeText(opportunityId)).map(rowToOffer).map(projectEmptySlotOffer);
    },
    listOffersForAppointment(appointmentId) {
      return database.prepare(`SELECT * FROM empty_slot_offers WHERE clinic_id = ? AND candidate_appointment_id = ? ORDER BY created_at DESC`).all(clinicId, normalizeText(appointmentId)).map(rowToOffer).map(projectEmptySlotOffer);
    },
    supersedeCompetingOffers({ opportunityId, acceptedOfferId }) {
      const active = [EMPTY_SLOT_OFFER_STATUS.PREPARED, EMPTY_SLOT_OFFER_STATUS.DISPATCHING, EMPTY_SLOT_OFFER_STATUS.OFFERED];
      const result = database.prepare(`UPDATE empty_slot_offers SET status = ?, safe_failure_category = ?, updated_at = ? WHERE clinic_id = ? AND opportunity_id = ? AND offer_id != ? AND status IN (${active.map(() => "?").join(",")})`).run(
        EMPTY_SLOT_OFFER_STATUS.SUPERSEDED,
        "opportunity_filled",
        new Date().toISOString(),
        clinicId,
        normalizeText(opportunityId),
        normalizeText(acceptedOfferId),
        ...active
      );
      return freezeClone({ accepted: true, supersededCount: result.changes });
    },
    expireDue({ now = new Date() } = {}) {
      const nowIso = toIso(now);
      const offerResult = database.prepare(`UPDATE empty_slot_offers SET status = ?, updated_at = ? WHERE clinic_id = ? AND status IN (?, ?, ?) AND expires_at <= ?`).run(
        EMPTY_SLOT_OFFER_STATUS.EXPIRED,
        new Date().toISOString(),
        clinicId,
        EMPTY_SLOT_OFFER_STATUS.PREPARED,
        EMPTY_SLOT_OFFER_STATUS.DISPATCHING,
        EMPTY_SLOT_OFFER_STATUS.OFFERED,
        nowIso
      );
      const opportunityResult = database.prepare(`UPDATE empty_slot_opportunities SET status = ?, safe_closure_category = ?, opportunity_version = opportunity_version + 1, updated_at = ? WHERE clinic_id = ? AND status IN (?, ?) AND expires_at <= ?`).run(
        EMPTY_SLOT_OPPORTUNITY_STATUS.EXPIRED,
        "opportunity_expired",
        new Date().toISOString(),
        clinicId,
        EMPTY_SLOT_OPPORTUNITY_STATUS.OPEN,
        EMPTY_SLOT_OPPORTUNITY_STATUS.OUTREACH_IN_PROGRESS,
        nowIso
      );
      return freezeClone({ accepted: true, expiredOffers: offerResult.changes, expiredOpportunities: opportunityResult.changes });
    },
  });
}

function getOpportunity(database, clinicId, opportunityId) {
  const row = database.prepare(`SELECT * FROM empty_slot_opportunities WHERE clinic_id = ? AND opportunity_id = ?`).get(clinicId, opportunityId);
  return row ? rowToOpportunity(row) : null;
}

function getOffer(database, clinicId, offerId) {
  const row = database.prepare(`SELECT * FROM empty_slot_offers WHERE clinic_id = ? AND offer_id = ?`).get(clinicId, offerId);
  return row ? rowToOffer(row) : null;
}

function rowToOpportunity(row) {
  return {
    clinicId: row.clinic_id,
    opportunityId: row.opportunity_id,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    appointmentPurpose: row.appointment_purpose,
    durationMinutes: row.duration_minutes,
    slotStartAt: row.slot_start_at,
    slotEndAt: row.slot_end_at,
    sourceReference: row.source_reference,
    opportunityVersion: row.opportunity_version,
    status: row.status,
    waveCount: row.wave_count,
    expiresAt: row.expires_at,
    filledAppointmentId: row.filled_appointment_id,
    safeClosureCategory: row.safe_closure_category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToConsent(row) {
  return freezeClone({
    clinicId: row.clinic_id,
    appointmentId: row.appointment_id,
    enabled: row.enabled === 1,
    sameDoctorOnly: row.same_doctor_only === 1,
    weekdays: parseJsonValue(row.weekdays_json) || [],
    dayparts: parseJsonValue(row.dayparts_json) || [],
    minimumNoticeMinutes: row.minimum_notice_minutes,
    consentVersion: row.consent_version,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sequence: row.created_sequence,
  });
}

function rowToOffer(row) {
  return {
    clinicId: row.clinic_id,
    offerId: row.offer_id,
    opportunityId: row.opportunity_id,
    opportunityVersion: row.opportunity_version,
    candidateAppointmentId: row.candidate_appointment_id,
    candidateAppointmentVersion: row.candidate_appointment_version,
    waveNumber: row.wave_number,
    rankingPosition: row.ranking_position,
    status: row.status,
    expiresAt: row.expires_at,
    outboundOperationReference: row.outbound_operation_reference,
    providerMessageReference: row.provider_message_reference,
    responseType: row.response_type,
    safeFailureCategory: row.safe_failure_category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeOpportunityInput(input) {
  const doctorId = normalizeText(input.doctorId);
  const appointmentPurpose = normalizeText(input.appointmentPurpose);
  const durationMinutes = Number(input.durationMinutes);
  const slotStartAt = normalizeText(input.slotStartAt);
  const slotEndAt = normalizeText(input.slotEndAt);
  const sourceReference = normalizeText(input.sourceReference);
  const expiresAt = normalizeText(input.expiresAt);
  if (!doctorId || !appointmentPurpose || !Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || !slotStartAt || !slotEndAt || !sourceReference || !expiresAt) {
    return reject("invalid_empty_slot_opportunity_input");
  }
  return {
    accepted: true,
    sourceFingerprint: crypto.createHash("sha256").update(`${input.clinicId}:${doctorId}:${appointmentPurpose}:${durationMinutes}:${slotStartAt}:${slotEndAt}:${sourceReference}`).digest("hex"),
    opportunity: {
      doctorId,
      doctorName: normalizeText(input.doctorName),
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
  const appointmentId = normalizeText(input.appointmentId);
  if (!appointmentId) return reject("invalid_empty_slot_consent_input");
  return {
    accepted: true,
    consent: {
      appointmentId,
      enabled: input.enabled === true,
      weekdays: Array.isArray(input.weekdays) ? input.weekdays.map(normalizeText).filter(Boolean).slice(0, 7) : [],
      dayparts: Array.isArray(input.dayparts) ? input.dayparts.map(normalizeText).filter(Boolean).slice(0, 4) : [],
      minimumNoticeMinutes: Number.isSafeInteger(input.minimumNoticeMinutes) ? Math.max(0, Math.min(input.minimumNoticeMinutes, 30 * 24 * 60)) : 0,
      source: normalizeText(input.source) || "controlled_internal_action",
    },
  };
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

function reject(code) {
  return freezeClone({ accepted: false, code, reason: "SQLite empty-slot repository operation failed safely." });
}

module.exports = {
  createSqliteEmptySlotRepository,
};
