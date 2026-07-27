const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createInMemoryAppointmentReviewAppointmentRepository,
} = require("../src/secretary/appointmentReviewAppointmentRepository");
const {
  createInMemoryAppointmentReviewExecutionIdempotencyStore,
} = require("../src/secretary/appointmentReviewExecutionIdempotencyStore");
const {
  createInMemoryAppointmentReminderRepository,
} = require("../src/reminders/appointmentReminderRepository");
const {
  reconcileOneAppointmentReminders,
} = require("../src/reminders/appointmentReminderService");
const {
  createInMemoryEmptySlotRepository,
  EMPTY_SLOT_OFFER_STATUS,
  EMPTY_SLOT_OPPORTUNITY_STATUS,
} = require("../src/emptySlots/emptySlotRepository");
const {
  acceptEmptySlotOffer,
  createEmptySlotOpportunityFromReleasedAppointment,
  launchEmptySlotOfferWave,
  optOutEarlierSlotOffers,
  previewEmptySlotCandidates,
} = require("../src/emptySlots/emptySlotService");
const {
  resolveEmptySlotConfig,
} = require("../src/emptySlots/emptySlotConfig");
const {
  parseWhatsAppWebhookPayload,
} = require("../src/messaging/whatsappWebhookParser");
const {
  createWhatsAppWebhookService,
} = require("../src/messaging/whatsappWebhookService");
const {
  createSqlitePersistenceProvider,
} = require("../src/persistence/sqliteProvider");
const {
  createSqliteAppointmentReviewAppointmentRepository,
} = require("../src/persistence/sqliteAppointmentRepository");
const {
  createSqliteEmptySlotRepository,
} = require("../src/persistence/sqliteEmptySlotRepository");

const NOW = new Date("2026-07-27T07:00:00.000Z");

function enabledConfig(overrides = {}) {
  const resolved = resolveEmptySlotConfig({
    ORAVIA_EMPTY_SLOT_ENGINE_ENABLED: "true",
    ORAVIA_EMPTY_SLOT_MAX_CANDIDATES_PER_WAVE: "2",
    ORAVIA_EMPTY_SLOT_MAX_CANDIDATES_PER_OPPORTUNITY: "4",
    ORAVIA_EMPTY_SLOT_OFFER_VALIDITY_MINUTES: "30",
    ORAVIA_EMPTY_SLOT_OUTREACH_COOLDOWN_MINUTES: "0",
    ORAVIA_EMPTY_SLOT_PATIENT_OFFER_WINDOW_MINUTES: "1440",
    ORAVIA_EMPTY_SLOT_MAX_OFFERS_PER_PATIENT_WINDOW: "2",
    ...overrides,
  });
  assert.equal(resolved.accepted, true);
  return resolved;
}

function createAppointment(repository, suffix, startAt, endAt, overrides = {}) {
  const result = repository.createAppointment({
    sourceReviewId: `review_${suffix}`,
    selectedSlotId: `slot_${suffix}`,
    doctorId: "doctor_alpha",
    doctorName: "Dr. Synthetic",
    appointmentPurpose: "implant_consultation",
    appointmentPurposeLabel: "Synthetic consultation",
    treatment: "synthetic-treatment",
    startAt,
    endAt,
    durationMinutes: 60,
    outboundDestination: {
      channel: "whatsapp",
      maskedLabel: `whatsapp:***${suffix}`,
      lookupHash: `lookup_${suffix}`,
      reference: `destination_${suffix}`,
    },
    ...overrides,
  });
  assert.equal(result.status, "ok");
  return result.appointment;
}

function createOpportunity(repository, overrides = {}) {
  const result = repository.createOpportunity({
    doctorId: "doctor_alpha",
    doctorName: "Dr. Synthetic",
    appointmentPurpose: "implant_consultation",
    durationMinutes: 60,
    slotStartAt: "2026-07-28T09:00:00.000Z",
    slotEndAt: "2026-07-28T10:00:00.000Z",
    sourceReference: "cancelled:synthetic-source",
    expiresAt: "2026-07-28T08:55:00.000Z",
    ...overrides,
  });
  assert.equal(result.accepted, true);
  return result.opportunity;
}

function createCountingProvider({ failAppointmentId } = {}) {
  const calls = [];
  return {
    name: "mock",
    calls,
    async sendEmptySlotOffer(command) {
      calls.push(command);
      if (command.appointment.id === failAppointmentId) {
        return { accepted: false, code: "synthetic_provider_failure" };
      }
      return {
        accepted: true,
        provider: "mock",
        providerMessageId: `mock_empty_slot_${command.offer.offerId}`,
        providerDispatchAccepted: true,
        realPatientDelivery: false,
      };
    },
  };
}

test("empty-slot engine is disabled by default and consent opt-out invalidates active offers", async () => {
  const appointmentRepository = createInMemoryAppointmentReviewAppointmentRepository();
  const emptySlotRepository = createInMemoryEmptySlotRepository();
  const candidate = createAppointment(appointmentRepository, "a", "2026-07-28T12:00:00.000Z", "2026-07-28T13:00:00.000Z");
  const disabled = resolveEmptySlotConfig({});
  const auto = createEmptySlotOpportunityFromReleasedAppointment({
    releasedAppointment: candidate,
    appointmentRepository,
    emptySlotRepository,
    config: disabled,
    now: NOW,
  });
  assert.equal(auto.created, false);
  assert.equal(auto.code, "empty_slot_engine_disabled");

  emptySlotRepository.upsertConsent({ appointmentId: candidate.id, enabled: true });
  const opportunity = createOpportunity(emptySlotRepository);
  const wave = await launchEmptySlotOfferWave({
    opportunityId: opportunity.opportunityId,
    expectedOpportunityVersion: opportunity.opportunityVersion,
    appointmentRepository,
    emptySlotRepository,
    outboundMessagingProvider: createCountingProvider(),
    idempotencyStore: createInMemoryAppointmentReviewExecutionIdempotencyStore(),
    config: enabledConfig(),
    now: NOW,
  });
  assert.equal(wave.accepted, true);
  const offer = emptySlotRepository.listOffersForAppointment(candidate.id)[0];
  assert.equal(offer.status, EMPTY_SLOT_OFFER_STATUS.OFFERED);

  const optOut = optOutEarlierSlotOffers({ appointmentId: candidate.id, emptySlotRepository });
  assert.equal(optOut.accepted, true);
  assert.equal(emptySlotRepository.getConsentForAppointment(candidate.id).enabled, false);
  assert.equal(emptySlotRepository.getOfferById(offer.offerId).status, EMPTY_SLOT_OFFER_STATUS.INVALIDATED);
});

test("candidate preview is consent-based, conflict-aware, bounded, and ranked by time improvement", () => {
  const appointmentRepository = createInMemoryAppointmentReviewAppointmentRepository();
  const emptySlotRepository = createInMemoryEmptySlotRepository();
  const far = createAppointment(appointmentRepository, "far", "2026-07-30T12:00:00.000Z", "2026-07-30T13:00:00.000Z");
  const near = createAppointment(appointmentRepository, "near", "2026-07-28T12:00:00.000Z", "2026-07-28T13:00:00.000Z");
  emptySlotRepository.upsertConsent({ appointmentId: far.id, enabled: true });
  emptySlotRepository.upsertConsent({ appointmentId: near.id, enabled: true });
  const opportunity = createOpportunity(emptySlotRepository);

  const preview = previewEmptySlotCandidates({
    opportunityId: opportunity.opportunityId,
    appointmentRepository,
    emptySlotRepository,
    config: enabledConfig({ ORAVIA_EMPTY_SLOT_MAX_CANDIDATES_PER_WAVE: "1" }),
    now: NOW,
  });

  assert.equal(preview.accepted, true);
  assert.equal(preview.eligibleCandidateCount, 2);
  assert.equal(preview.candidates.length, 1);
  assert.equal(preview.candidates[0].appointmentId, far.id);
  assert.equal(preview.providerCalled, false);
});

test("offer launch dispatches safely, supports idempotent replay, and records partial provider failures", async () => {
  const appointmentRepository = createInMemoryAppointmentReviewAppointmentRepository();
  const emptySlotRepository = createInMemoryEmptySlotRepository();
  const first = createAppointment(appointmentRepository, "first", "2026-07-30T12:00:00.000Z", "2026-07-30T13:00:00.000Z");
  const second = createAppointment(appointmentRepository, "second", "2026-07-29T12:00:00.000Z", "2026-07-29T13:00:00.000Z");
  emptySlotRepository.upsertConsent({ appointmentId: first.id, enabled: true });
  emptySlotRepository.upsertConsent({ appointmentId: second.id, enabled: true });
  const opportunity = createOpportunity(emptySlotRepository);
  const provider = createCountingProvider({ failAppointmentId: second.id });
  const store = createInMemoryAppointmentReviewExecutionIdempotencyStore();

  const firstRun = await launchEmptySlotOfferWave({
    opportunityId: opportunity.opportunityId,
    expectedOpportunityVersion: opportunity.opportunityVersion,
    appointmentRepository,
    emptySlotRepository,
    outboundMessagingProvider: provider,
    idempotencyStore: store,
    config: enabledConfig(),
    now: NOW,
  });
  const replay = await launchEmptySlotOfferWave({
    opportunityId: opportunity.opportunityId,
    expectedOpportunityVersion: opportunity.opportunityVersion,
    appointmentRepository,
    emptySlotRepository,
    outboundMessagingProvider: provider,
    idempotencyStore: store,
    config: enabledConfig(),
    now: NOW,
  });

  assert.equal(firstRun.accepted, true);
  assert.equal(firstRun.dispatchedCount, 1);
  assert.equal(firstRun.failedCount, 1);
  assert.equal(provider.calls.length, 2);
  assert.equal(replay.matchingReplay, true);
  assert.equal(provider.calls.length, 2);
});

test("first valid acceptance moves the appointment, supersedes competitors, and rebuilds reminders", async () => {
  const appointmentRepository = createInMemoryAppointmentReviewAppointmentRepository();
  const emptySlotRepository = createInMemoryEmptySlotRepository();
  const reminderRepository = createInMemoryAppointmentReminderRepository();
  const first = createAppointment(appointmentRepository, "accept_a", "2026-07-30T12:00:00.000Z", "2026-07-30T13:00:00.000Z");
  const second = createAppointment(appointmentRepository, "accept_b", "2026-07-29T12:00:00.000Z", "2026-07-29T13:00:00.000Z");
  emptySlotRepository.upsertConsent({ appointmentId: first.id, enabled: true });
  emptySlotRepository.upsertConsent({ appointmentId: second.id, enabled: true });
  const opportunity = createOpportunity(emptySlotRepository);
  reconcileOneAppointmentReminders({
    appointment: first,
    reminderRepository,
    reminderConfig: { engineEnabled: true, offsetsMinutes: [60] },
    now: NOW,
  });
  const wave = await launchEmptySlotOfferWave({
    opportunityId: opportunity.opportunityId,
    expectedOpportunityVersion: opportunity.opportunityVersion,
    appointmentRepository,
    emptySlotRepository,
    outboundMessagingProvider: createCountingProvider(),
    idempotencyStore: createInMemoryAppointmentReviewExecutionIdempotencyStore(),
    config: enabledConfig(),
    now: NOW,
  });
  assert.equal(wave.accepted, true);
  const offers = emptySlotRepository.listOffersForOpportunity(opportunity.opportunityId);
  const acceptedOffer = offers.find((offer) => offer.candidateAppointmentId === first.id);
  const competingOffer = offers.find((offer) => offer.candidateAppointmentId === second.id);

  const acceptance = acceptEmptySlotOffer({
    offerId: acceptedOffer.offerId,
    appointmentRepository,
    emptySlotRepository,
    reminderRepository,
    reminderConfig: { engineEnabled: true, offsetsMinutes: [60] },
    idempotencyStore: createInMemoryAppointmentReviewExecutionIdempotencyStore(),
    now: NOW,
  });
  const competingAcceptance = acceptEmptySlotOffer({
    offerId: competingOffer.offerId,
    appointmentRepository,
    emptySlotRepository,
    reminderRepository,
    reminderConfig: { engineEnabled: true, offsetsMinutes: [60] },
    idempotencyStore: createInMemoryAppointmentReviewExecutionIdempotencyStore(),
    now: NOW,
  });

  assert.equal(acceptance.accepted, true);
  assert.equal(appointmentRepository.getAppointmentById(first.id).startAt, "2026-07-28T09:00:00.000Z");
  assert.equal(emptySlotRepository.getOpportunityById(opportunity.opportunityId).status, EMPTY_SLOT_OPPORTUNITY_STATUS.FILLED);
  assert.equal(emptySlotRepository.getOfferById(competingOffer.offerId).status, EMPTY_SLOT_OFFER_STATUS.SUPERSEDED);
  assert.equal(competingAcceptance.accepted, false);
  const jobs = reminderRepository.listJobsForAppointment(first.id);
  assert.equal(jobs.some((job) => job.appointmentVersion === 1 && job.status === "cancelled"), true);
  assert.equal(jobs.some((job) => job.appointmentVersion === 2 && job.status === "pending"), true);
});

test("reconciliation expires stale records and invalidates opportunities when the slot becomes occupied", async () => {
  const appointmentRepository = createInMemoryAppointmentReviewAppointmentRepository();
  const emptySlotRepository = createInMemoryEmptySlotRepository();
  const expiredOpportunity = createOpportunity(emptySlotRepository, {
    sourceReference: "expired:synthetic-source",
    slotStartAt: "2026-07-28T09:00:00.000Z",
    slotEndAt: "2026-07-28T10:00:00.000Z",
    expiresAt: "2026-07-27T06:00:00.000Z",
  });
  const occupiedOpportunity = createOpportunity(emptySlotRepository, {
    sourceReference: "occupied:synthetic-source",
    slotStartAt: "2026-07-29T09:00:00.000Z",
    slotEndAt: "2026-07-29T10:00:00.000Z",
    expiresAt: "2026-07-29T08:55:00.000Z",
  });
  createAppointment(appointmentRepository, "occupying", "2026-07-29T09:00:00.000Z", "2026-07-29T10:00:00.000Z");

  const result = await require("../src/emptySlots/emptySlotService").runEmptySlotCycle({
    emptySlotRepository,
    appointmentRepository,
    now: NOW,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.expired.expiredOpportunities, 1);
  assert.equal(result.invalidated.invalidatedOpportunities, 1);
  assert.equal(emptySlotRepository.getOpportunityById(expiredOpportunity.opportunityId).status, EMPTY_SLOT_OPPORTUNITY_STATUS.EXPIRED);
  assert.equal(emptySlotRepository.getOpportunityById(occupiedOpportunity.opportunityId).status, EMPTY_SLOT_OPPORTUNITY_STATUS.INVALIDATED);
});

test("sqlite empty-slot repository persists opportunities, consents, and offers across restart", async () => {
  const temp = createTempDatabasePath("empty-slots");
  let provider;

  try {
    provider = createSqlitePersistenceProvider({
      databasePath: temp.databasePath,
      clinicId: "clinic_alpha",
    });
    const appointmentRepository = createSqliteAppointmentReviewAppointmentRepository({ persistenceProvider: provider });
    const emptySlotRepository = createSqliteEmptySlotRepository({ persistenceProvider: provider });
    const candidate = createAppointment(appointmentRepository, "sqlite_a", "2026-07-29T12:00:00.000Z", "2026-07-29T13:00:00.000Z");
    emptySlotRepository.upsertConsent({ appointmentId: candidate.id, enabled: true });
    const opportunity = createOpportunity(emptySlotRepository);
    const wave = await launchEmptySlotOfferWave({
      opportunityId: opportunity.opportunityId,
      expectedOpportunityVersion: opportunity.opportunityVersion,
      appointmentRepository,
      emptySlotRepository,
      outboundMessagingProvider: createCountingProvider(),
      idempotencyStore: createInMemoryAppointmentReviewExecutionIdempotencyStore(),
      config: enabledConfig(),
      now: NOW,
    });
    assert.equal(wave.accepted, true);
    provider.close();

    provider = createSqlitePersistenceProvider({
      databasePath: temp.databasePath,
      clinicId: "clinic_alpha",
    });
    const restarted = createSqliteEmptySlotRepository({ persistenceProvider: provider });
    assert.equal(restarted.getSummary().counts.outreach_in_progress, 1);
    assert.equal(restarted.getConsentForAppointment(candidate.id).enabled, true);
    assert.equal(restarted.listOffersForOpportunity(opportunity.opportunityId).length, 1);
  } finally {
    provider?.close?.();
    cleanupTempDatabase(temp);
  }
});

test("webhook parser only accepts signed empty-slot payloads and routes them before normal inbound handling", async () => {
  const parsed = parseWhatsAppWebhookPayload({
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: "business_phone" },
          messages: [{
            id: "wamid.synthetic",
            from: "905300000000",
            timestamp: "1785150000",
            type: "interactive",
            interactive: {
              type: "button_reply",
              button_reply: { id: "EMPTY_SLOT_ACCEPT:offer_safe_1", title: "Accept" },
            },
          }],
        },
      }],
    }],
  }, { phoneNumberId: "business_phone" });
  assert.equal(parsed.events[0].emptySlotResponse.responseType, "accept");
  assert.equal(parsed.events[0].emptySlotResponse.offerId, "offer_safe_1");

  const generic = parseWhatsAppWebhookPayload({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { metadata: { phone_number_id: "business_phone" }, messages: [{ id: "wamid.generic", from: "905300000000", type: "text", text: { body: "EVET" } }] } }] }],
  }, { phoneNumberId: "business_phone" });
  assert.equal(generic.events[0].emptySlotResponse, null);

  let handledResponse = null;
  const service = createWhatsAppWebhookService({
    config: {
      phoneNumberId: "business_phone",
      clinicId: "clinic_alpha",
      autoReplyMode: "off",
    },
    identityCrypto: {
      encryptIdentity() {
        return {
          accepted: true,
          lookupHash: "lookup_hash",
          encrypted: { keyVersion: 1, ciphertext: "safe" },
          maskedLabel: "whatsapp:***00",
        };
      },
    },
    lifecycleRepository: {
      upsertChannelIdentity() {},
      reserveInboundEvent() {
        return { accepted: true, duplicate: false };
      },
      completeInboundEvent() {},
    },
    messagingRuntime: {
      handleMessagingInbound() {
        throw new Error("normal inbound should not handle empty-slot payloads");
      },
    },
    outboundProvider: {},
    emptySlotResponseHandler(input) {
      handledResponse = input;
      return { accepted: true, code: "handled" };
    },
  });
  const routed = await service.handlePayload({
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: "business_phone" },
          messages: [{
            id: "wamid.synthetic",
            from: "905300000000",
            timestamp: "1785150000",
            type: "interactive",
            interactive: {
              type: "button_reply",
              button_reply: { id: "EMPTY_SLOT_ACCEPT:offer_safe_1", title: "Accept" },
            },
          }],
        },
      }],
    }],
  });
  assert.equal(routed.accepted, true);
  assert.equal(routed.body.results[0].code, "handled");
  assert.equal(handledResponse.responseType, "accept");
});

function createTempDatabasePath(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `oravia-${label}-`));
  return {
    dir,
    databasePath: path.join(dir, "durable.sqlite"),
  };
}

function cleanupTempDatabase({ dir, databasePath }) {
  for (const file of [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    `${databasePath}-journal`,
  ]) {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
