#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createSqlitePersistenceProvider,
} = require("../src/persistence/sqliteProvider");
const {
  createSqliteAppointmentReviewAppointmentRepository,
} = require("../src/persistence/sqliteAppointmentRepository");
const {
  createSqliteEmptySlotRepository,
} = require("../src/persistence/sqliteEmptySlotRepository");
const {
  createSqliteAppointmentReminderRepository,
} = require("../src/persistence/sqliteAppointmentReminderRepository");
const {
  createSqliteOperationIdempotencyStore,
} = require("../src/persistence/sqliteIdempotencyStore");
const {
  createInMemoryAppointmentReviewExecutionIdempotencyStore,
} = require("../src/secretary/appointmentReviewExecutionIdempotencyStore");
const {
  createEmptySlotOpportunityFromReleasedAppointment,
  acceptEmptySlotOffer,
  launchEmptySlotOfferWave,
} = require("../src/emptySlots/emptySlotService");
const { resolveEmptySlotConfig } = require("../src/emptySlots/emptySlotConfig");

const temp = createTemp("integrated");
let provider;

main().catch((error) => {
  safePrint({
    accepted: false,
    code: "empty_slot_integrated_smoke_failed",
    errorCode: error?.code || "assertion_failed",
    message: String(error?.message || "").slice(0, 160),
  });
  process.exit(1);
}).finally(() => {
  provider?.close?.();
  cleanup(temp);
});

async function main() {
  provider = createSqlitePersistenceProvider({
    databasePath: temp.databasePath,
    clinicId: "clinic_smoke",
  });
  const appointments = createSqliteAppointmentReviewAppointmentRepository({ persistenceProvider: provider });
  const emptySlots = createSqliteEmptySlotRepository({ persistenceProvider: provider });
  const reminders = createSqliteAppointmentReminderRepository({ persistenceProvider: provider });
  const config = resolveEmptySlotConfig({
    ORAVIA_EMPTY_SLOT_ENGINE_ENABLED: "true",
    ORAVIA_EMPTY_SLOT_AUTOMATIC_OPPORTUNITY_CREATION_ENABLED: "true",
    ORAVIA_EMPTY_SLOT_MAX_CANDIDATES_PER_WAVE: "1",
    ORAVIA_EMPTY_SLOT_OFFER_VALIDITY_MINUTES: "45",
  });
  assert.equal(config.accepted, true);

  const released = createAppointment(appointments, "released", "2026-07-28T09:00:00.000Z", "2026-07-28T10:00:00.000Z");
  const candidate = createAppointment(appointments, "candidate", "2026-07-29T12:00:00.000Z", "2026-07-29T13:00:00.000Z");
  const cancellation = appointments.cancelAppointment({
    appointmentId: released.id,
    expectedVersion: released.version,
    idempotencyKey: "smoke:cancel_released",
    actor: { actorId: "smoke", actorRole: "system" },
  });
  assert.equal(cancellation.status, "ok");
  emptySlots.upsertConsent({ appointmentId: candidate.id, enabled: true });
  const opportunity = createEmptySlotOpportunityFromReleasedAppointment({
    releasedAppointment: cancellation.appointment,
    sourceReference: "smoke:released",
    appointmentRepository: appointments,
    emptySlotRepository: emptySlots,
    config,
    manual: false,
    now: new Date("2026-07-27T07:00:00.000Z"),
  });
  assert.equal(opportunity.created, true);
  const providerCalls = [];
  const wave = await launchEmptySlotOfferWave({
    opportunityId: opportunity.opportunity.opportunityId,
    expectedOpportunityVersion: opportunity.opportunity.opportunityVersion,
    appointmentRepository: appointments,
    emptySlotRepository: emptySlots,
    outboundMessagingProvider: {
      async sendEmptySlotOffer(command) {
        providerCalls.push(command.offer.offerId);
        return { accepted: true, providerMessageId: `smoke_${command.offer.offerId}` };
      },
    },
    idempotencyStore: createSqliteOperationIdempotencyStore({
      persistenceProvider: provider,
      operationKind: "smoke_empty_slot_wave",
    }),
    config,
    now: new Date("2026-07-27T07:00:00.000Z"),
  });
  assert.equal(wave.accepted, true);
  assert.equal(providerCalls.length, 1);
  const offer = emptySlots.listOffersForAppointment(candidate.id)[0];
  const accepted = acceptEmptySlotOffer({
    offerId: offer.offerId,
    appointmentRepository: appointments,
    emptySlotRepository: emptySlots,
    reminderRepository: reminders,
    reminderConfig: { engineEnabled: true, offsetsMinutes: [60] },
    idempotencyStore: createInMemoryAppointmentReviewExecutionIdempotencyStore(),
    now: new Date("2026-07-27T07:00:00.000Z"),
  });
  assert.equal(accepted.accepted, true);
  safePrint({
    accepted: true,
    code: "empty_slot_integrated_smoke_ok",
    providerCalls: providerCalls.length,
    movedAppointmentVersion: accepted.resultingAppointmentVersion,
  });
}

function createAppointment(repository, suffix, startAt, endAt) {
  const result = repository.createAppointment({
    sourceReviewId: `smoke_review_${suffix}`,
    selectedSlotId: `smoke_slot_${suffix}`,
    doctorId: "doctor_smoke",
    doctorName: "Dr. Synthetic",
    appointmentPurpose: "implant_consultation",
    appointmentPurposeLabel: "Synthetic consultation",
    treatment: "synthetic-treatment",
    startAt,
    endAt,
    durationMinutes: 60,
    outboundDestination: {
      channel: "whatsapp",
      reference: `destination_${suffix}`,
      maskedLabel: "whatsapp:***00",
    },
  });
  assert.equal(result.status, "ok");
  return result.appointment;
}

function createTemp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `oravia-empty-slot-${label}-`));
  return { dir, databasePath: path.join(dir, "oravia.sqlite") };
}

function cleanup(tempDir) {
  if (tempDir?.dir && fs.existsSync(tempDir.dir)) fs.rmSync(tempDir.dir, { recursive: true, force: true });
}

function safePrint(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
