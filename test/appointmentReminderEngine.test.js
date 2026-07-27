const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createInMemoryAppointmentReviewAppointmentRepository,
} = require("../src/secretary/appointmentReviewAppointmentRepository");
const {
  createInMemoryAppointmentReminderRepository,
  REMINDER_JOB_STATUS,
} = require("../src/reminders/appointmentReminderRepository");
const {
  dispatchClaimedAppointmentReminder,
  reconcileAppointmentReminders,
  runAppointmentReminderCycle,
} = require("../src/reminders/appointmentReminderService");
const {
  createMockOutboundAppointmentConfirmationProvider,
} = require("../src/messaging/mockOutboundAppointmentConfirmationProvider");
const {
  createInMemoryAppointmentReviewExecutionIdempotencyStore,
} = require("../src/secretary/appointmentReviewExecutionIdempotencyStore");
const {
  createSqlitePersistenceProvider,
} = require("../src/persistence/sqliteProvider");
const {
  createSqliteAppointmentReviewAppointmentRepository,
} = require("../src/persistence/sqliteAppointmentRepository");
const {
  createSqliteAppointmentReminderRepository,
} = require("../src/persistence/sqliteAppointmentReminderRepository");
const {
  createAppointmentReviewActiveRouteRuntimeCompositionRoot,
} = require("../src/secretary/appointmentReviewRouteRuntimeCompositionRoot");

test("reminder reconciliation creates bounded durable jobs without duplicates", () => {
  const appointmentRepository = createInMemoryAppointmentReviewAppointmentRepository();
  const appointment = createAppointment(appointmentRepository, {
    sourceReviewId: "review_reminder_reconcile",
    startAt: "2099-07-29T10:30:00+03:00",
    endAt: "2099-07-29T11:00:00+03:00",
  }).appointment;
  const reminderRepository = createInMemoryAppointmentReminderRepository();
  const config = createReminderConfig({ offsetsMinutes: [1440, 120, 120] });

  const first = reconcileAppointmentReminders({
    appointmentRepository,
    reminderRepository,
    reminderConfig: config,
    now: new Date("2099-07-27T10:00:00+03:00"),
  });
  const second = reconcileAppointmentReminders({
    appointmentRepository,
    reminderRepository,
    reminderConfig: config,
    now: new Date("2099-07-27T10:00:00+03:00"),
  });

  assert.equal(first.createdCount, 2);
  assert.equal(second.createdCount, 0);
  assert.deepEqual(
    reminderRepository
      .listJobsForAppointment(appointment.id)
      .map((job) => job.offsetMinutes)
      .sort((a, b) => a - b),
    [120, 1440]
  );
});

test("SQLite reminder jobs survive restart and due claims are one-time", () => {
  const databasePath = createTempDatabasePath();
  let provider = createSqlitePersistenceProvider({
    databasePath,
    clinicId: "oravia_demo_clinic",
  });
  let appointmentRepository = createSqliteAppointmentReviewAppointmentRepository({
    persistenceProvider: provider,
  });
  let reminderRepository = createSqliteAppointmentReminderRepository({
    persistenceProvider: provider,
  });
  const appointment = createAppointment(appointmentRepository, {
    sourceReviewId: "review_sqlite_reminder",
    startAt: "2099-07-29T10:30:00+03:00",
    endAt: "2099-07-29T11:00:00+03:00",
  }).appointment;

  reminderRepository.createMissingJobs({
    appointment,
    scheduledJobs: [
      {
        offsetMinutes: 120,
        scheduledDispatchAt: "2099-07-27T08:00:00.000Z",
      },
    ],
  });
  provider.close();

  provider = createSqlitePersistenceProvider({
    databasePath,
    clinicId: "oravia_demo_clinic",
  });
  reminderRepository = createSqliteAppointmentReminderRepository({
    persistenceProvider: provider,
  });

  const claimed = reminderRepository.claimDueJobs({
    now: new Date("2099-07-27T09:00:00.000Z"),
    limit: 5,
  });
  const replayClaim = reminderRepository.claimDueJobs({
    now: new Date("2099-07-27T09:00:00.000Z"),
    limit: 5,
  });

  assert.equal(claimed.claimedCount, 1);
  assert.equal(replayClaim.claimedCount, 0);
  assert.equal(
    reminderRepository.listJobsForAppointment(appointment.id)[0].status,
    REMINDER_JOB_STATUS.CLAIMED
  );
  provider.close();
});

test("dispatch idempotency prevents duplicate reminder provider calls", async () => {
  const appointmentRepository = createInMemoryAppointmentReviewAppointmentRepository();
  const appointment = createAppointment(appointmentRepository, {
    sourceReviewId: "review_dispatch_reminder",
    startAt: "2099-07-29T10:30:00+03:00",
    endAt: "2099-07-29T11:00:00+03:00",
  }).appointment;
  const reminderRepository = createInMemoryAppointmentReminderRepository();
  reminderRepository.createMissingJobs({
    appointment,
    scheduledJobs: [
      {
        offsetMinutes: 120,
        scheduledDispatchAt: "2099-07-27T08:00:00.000Z",
      },
    ],
  });
  const [job] = reminderRepository.claimDueJobs({
    now: new Date("2099-07-27T09:00:00.000Z"),
    limit: 1,
  }).claimedJobs;
  const provider = createMockOutboundAppointmentConfirmationProvider();
  const idempotencyStore = createInMemoryAppointmentReviewExecutionIdempotencyStore();

  const first = await dispatchClaimedAppointmentReminder({
    job,
    appointmentRepository,
    reminderRepository,
    outboundMessagingProvider: provider,
    idempotencyStore,
  });
  const replay = await dispatchClaimedAppointmentReminder({
    job,
    appointmentRepository,
    reminderRepository,
    outboundMessagingProvider: provider,
    idempotencyStore,
  });

  assert.equal(first.accepted, true);
  assert.equal(replay.matchingReplay, true);
  assert.equal(provider.getCallCount(), 1);
  assert.equal(
    reminderRepository.listJobsForAppointment(appointment.id)[0].status,
    REMINDER_JOB_STATUS.DISPATCHED
  );
});

test("runtime lifecycle integration cancels old reminders after reschedule and cancellation", async () => {
  const root = createAppointmentReviewActiveRouteRuntimeCompositionRoot({
    storageMode: "in_memory",
    initialReviews: [createApprovedReview("review_reminder_lifecycle")],
    env: {
      ORAVIA_REMINDER_ENGINE_ENABLED: "true",
      ORAVIA_REMINDER_OFFSETS_MINUTES: "120",
      ORAVIA_WHATSAPP_PROVIDER_MODE: "mock",
    },
  });
  const runtime = root.getRouteRuntimeAdapter();
  try {
    const createResult = await runtime.createAppointmentFromApprovedReview({
      reviewId: "review_reminder_lifecycle",
      expectedReviewVersion: 1,
      confirmation: "create_in_memory_appointment",
      idempotencyKey: "create:reminder:lifecycle",
    });
    assert.equal(createResult.accepted, true);
    const appointment = createResult.appointment;
    assert.equal(createResult.reminderReconciliation.createdCount, 1);

    const preview = runtime.createAppointmentReschedulePreview({
      appointmentId: appointment.id,
      expectedAppointmentVersion: appointment.version,
      now: new Date("2026-07-27T09:00:00+03:00"),
    });
    const selectedSlotId = preview.proposedSlots[0].id;
    const rescheduled = await runtime.applyAppointmentReschedule({
      appointmentId: appointment.id,
      expectedAppointmentVersion: appointment.version,
      selectedSlotId,
      confirmation: "apply_appointment_reschedule",
      idempotencyKey: "reschedule:reminder:lifecycle",
      actor: { actorId: "manager", actorRole: "manager" },
      now: new Date("2026-07-27T09:00:00+03:00"),
    });
    assert.equal(rescheduled.accepted, true);
    assert.equal(rescheduled.reminderCancellation.cancelledCount, 1);

    const cancelled = await runtime.applyAppointmentCancellation({
      appointmentId: appointment.id,
      expectedAppointmentVersion: rescheduled.resultingAppointmentVersion,
      confirmation: "cancel_local_appointment",
      idempotencyKey: "cancel:reminder:lifecycle",
      actor: { actorId: "manager", actorRole: "manager" },
    });
    assert.equal(cancelled.accepted, true);
    assert.equal(cancelled.reminderCancellation.cancelledCount, 1);
  } finally {
    root.close();
  }
});

test("run-once cycle reconciles but does not dispatch when automatic dispatch is disabled", async () => {
  const appointmentRepository = createInMemoryAppointmentReviewAppointmentRepository();
  createAppointment(appointmentRepository, {
    sourceReviewId: "review_disabled_dispatch",
    startAt: "2099-07-29T10:30:00+03:00",
    endAt: "2099-07-29T11:00:00+03:00",
  });
  const reminderRepository = createInMemoryAppointmentReminderRepository();
  const provider = createMockOutboundAppointmentConfirmationProvider();

  const result = await runAppointmentReminderCycle({
    appointmentRepository,
    reminderRepository,
    reminderConfig: createReminderConfig({
      automaticDispatchEnabled: false,
      offsetsMinutes: [120],
    }),
    outboundMessagingProvider: provider,
    idempotencyStore: createInMemoryAppointmentReviewExecutionIdempotencyStore(),
    now: new Date("2099-07-27T09:00:00.000Z"),
  });

  assert.equal(result.code, "reminder_dispatch_disabled");
  assert.equal(provider.getCallCount(), 0);
  assert.equal(reminderRepository.getSummary().counts.pending, 1);
});

function createAppointment(repository, overrides = {}) {
  return repository.createAppointment({
    sourceReviewId: overrides.sourceReviewId || "review_reminder",
    selectedSlotId: overrides.selectedSlotId || "slot_reminder",
    doctorId: "dr-ayse-demir",
    doctorName: "Dr. Ayse Demir",
    treatment: "implant",
    appointmentPurpose: "initial_consultation",
    appointmentPurposeLabel: "Initial consultation",
    startAt: overrides.startAt,
    endAt: overrides.endAt,
    durationMinutes: 30,
    outboundDestination: {
      channel: "whatsapp",
      reference: "trusted_conversation_reference",
      maskedLabel: "whatsapp:***33",
    },
  });
}

function createReminderConfig(overrides = {}) {
  return {
    engineEnabled: true,
    schedulerEnabled: false,
    automaticDispatchEnabled: true,
    offsetsMinutes: [120],
    pollingIntervalMs: 60000,
    maxJobsPerCycle: 10,
    retryFailedJobsEnabled: true,
    providerMode: "mock",
    safeConfig: {},
    ...overrides,
  };
}

function createTempDatabasePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "oravia-reminders-"));
  return path.join(directory, "oravia.sqlite");
}

function createApprovedReview(id) {
  return {
    id,
    status: "pending_secretary_review",
    source: "mock",
    selectedSlot: {
      id: `${id}_slot`,
      source: "mock",
      doctorId: "dr-ayse-demir",
      doctorName: "Dr. Ayse Demir",
      treatment: "implant",
      appointmentPurpose: "initial_consultation",
      appointmentPurposeLabel: "Initial consultation",
      startAt: "2026-07-29T10:30:00+03:00",
      endAt: "2026-07-29T11:00:00+03:00",
      durationMinutes: 30,
    },
    treatment: "implant",
    appointmentPurpose: "initial_consultation",
    appointmentPurposeLabel: "Initial consultation",
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
    metadata: {
      controlledActionState: "needs_clinic_review",
      conversationKey: "whatsapp:+905322223333",
    },
  };
}
