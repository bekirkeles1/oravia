const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const {
  createAppointmentReviewActiveRouteRuntimeCompositionRoot,
} = require("../src/secretary/appointmentReviewRouteRuntimeCompositionRoot");
const {
  createSqlitePersistenceProvider,
} = require("../src/persistence/sqliteProvider");
const {
  runSqliteMigrations,
} = require("../src/persistence/sqliteMigrations");
const {
  createSqliteConversationStateStore,
} = require("../src/persistence/sqliteConversationStateStore");
const {
  createSqliteOperationIdempotencyStore,
} = require("../src/persistence/sqliteIdempotencyStore");
const {
  createSqliteAppointmentReviewRepository,
} = require("../src/persistence/sqliteAppointmentReviewRepository");
const {
  createSqliteAppointmentReviewAppointmentRepository,
} = require("../src/persistence/sqliteAppointmentRepository");

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
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
    }
  }

  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function createCountingCalendarProvider() {
  const calls = [];

  return {
    name: "mock",
    calls,
    createCalendarEvent(command) {
      calls.push(command);
      return {
        calendar_provider: "mock",
        calendar_event_id: `mock_calendar_event_${command.selectedSlot.id}`,
        start_time: command.selectedSlot.start_at,
        end_time: command.selectedSlot.end_at,
      };
    },
  };
}

function createCountingOutboundProvider() {
  const calls = [];

  return {
    name: "mock_outbound",
    calls,
    sendAppointmentConfirmation(command) {
      calls.push(command);
      return {
        accepted: true,
        provider: "mock_outbound",
        providerMessageId: `mock_confirmation_message_${command.operationReference}`,
        providerDispatchAccepted: true,
        realPatientDelivery: false,
      };
    },
  };
}

function createSqliteRoot({
  databasePath,
  clinicId = "clinic_alpha",
  calendarProvider = createCountingCalendarProvider(),
  outboundMessagingProvider = createCountingOutboundProvider(),
} = {}) {
  const root = createAppointmentReviewActiveRouteRuntimeCompositionRoot({
    storageMode: "sqlite",
    databasePath,
    clinicId,
    calendarProvider,
    outboundMessagingProvider,
  });

  return {
    root,
    adapter: root.getRouteRuntimeAdapter(),
    calendarProvider,
    outboundMessagingProvider,
  };
}

async function runDurableWorkflow(adapter, keys = {}) {
  const reviewId = "review_route_runtime_demo";
  const decision = await adapter.applyAppointmentReviewDecision({
    reviewId,
    action: "approve",
    expectedReviewVersion: 1,
    idempotencyKey: keys.decision || "decision_execution:durable:approve",
    confirmation: "apply_in_memory",
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.resultingReviewVersion, 2);

  const creation = await adapter.createAppointmentFromApprovedReview({
    reviewId,
    expectedReviewVersion: decision.resultingReviewVersion,
    idempotencyKey: keys.creation || "appointment_creation:durable",
    confirmation: "create_in_memory_appointment",
  });

  assert.equal(creation.accepted, true);
  assert.equal(creation.appointment.version, 1);

  const sync = await adapter.syncAppointmentToCalendar({
    appointmentId: creation.appointmentId,
    expectedAppointmentVersion: creation.appointment.version,
    idempotencyKey: keys.sync || "calendar_sync:durable",
    confirmation: "sync_configured_calendar",
  });

  assert.equal(sync.accepted, true);
  assert.equal(sync.resultingAppointmentVersion, 2);

  const confirmation = await adapter.dispatchAppointmentConfirmation({
    appointmentId: creation.appointmentId,
    expectedAppointmentVersion: sync.resultingAppointmentVersion,
    idempotencyKey: keys.confirmation || "confirmation_dispatch:durable",
    confirmation: "send_mock_appointment_confirmation",
  });

  assert.equal(confirmation.accepted, true);
  assert.equal(confirmation.resultingAppointmentVersion, 3);

  return {
    reviewId,
    appointmentId: creation.appointmentId,
    decision,
    creation,
    sync,
    confirmation,
  };
}

test("sqlite migrations are repeatable and reject newer schema safely", () => {
  const temp = createTempDatabasePath("migration");
  let database;

  try {
    database = new DatabaseSync(temp.databasePath);
    const first = runSqliteMigrations(database);
    const second = runSqliteMigrations(database);
    const rows = database
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all();

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, true);
    assert.equal(rows.length, 6);
    assert.equal(rows[0].version, 1);
    assert.equal(rows[1].version, 2);
    assert.equal(rows[2].version, 3);
    assert.equal(rows[3].version, 4);
    assert.equal(rows[4].version, 5);
    assert.equal(rows[5].version, 6);

    database
      .prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
      )
      .run(999, "future", new Date().toISOString());
    assert.throws(
      () => runSqliteMigrations(database),
      (error) => error.code === "sqlite_schema_version_mismatch"
    );
  } finally {
    if (database) {
      database.close();
    }
    cleanupTempDatabase(temp);
  }
});

test("sqlite conversation state persists across provider restart and stays clinic scoped", () => {
  const temp = createTempDatabasePath("conversation");

  try {
    const alphaProvider = createSqlitePersistenceProvider({
      databasePath: temp.databasePath,
      clinicId: "clinic_alpha",
    });
    const alphaStore = createSqliteConversationStateStore({
      persistenceProvider: alphaProvider,
    });
    const saved = alphaStore.setAppointmentFlowState("whatsapp:synthetic", {
      status: "pending_appointment_selection",
      offeredSlots: [{ id: "slot_1" }],
    });
    saved.offeredSlots[0].id = "mutated";
    alphaProvider.close();

    const alphaRestart = createSqlitePersistenceProvider({
      databasePath: temp.databasePath,
      clinicId: "clinic_alpha",
    });
    const alphaRestartStore = createSqliteConversationStateStore({
      persistenceProvider: alphaRestart,
    });
    const betaProvider = createSqlitePersistenceProvider({
      databasePath: temp.databasePath,
      clinicId: "clinic_beta",
    });
    const betaStore = createSqliteConversationStateStore({
      persistenceProvider: betaProvider,
    });

    assert.equal(
      alphaRestartStore.getAppointmentFlowState("whatsapp:synthetic").offeredSlots[0]
        .id,
      "slot_1"
    );
    assert.equal(betaStore.getAppointmentFlowState("whatsapp:synthetic"), null);
    assert.equal(alphaRestartStore.clearAppointmentFlowState("whatsapp:synthetic"), true);
    assert.equal(alphaRestartStore.getAppointmentFlowState("whatsapp:synthetic"), null);

    alphaRestart.close();
    betaProvider.close();
  } finally {
    cleanupTempDatabase(temp);
  }
});

test("sqlite repositories persist reviews appointments versions and isolate clinics", () => {
  const temp = createTempDatabasePath("repositories");

  try {
    const alphaProvider = createSqlitePersistenceProvider({
      databasePath: temp.databasePath,
      clinicId: "clinic_alpha",
    });
    const reviewRepository = createSqliteAppointmentReviewRepository({
      persistenceProvider: alphaProvider,
    });
    const appointmentRepository =
      createSqliteAppointmentReviewAppointmentRepository({
        persistenceProvider: alphaProvider,
      });
    const review = {
      id: "review_sqlite",
      status: "pending_secretary_review",
      source: "mock",
      selectedSlot: {
        id: "slot_sqlite",
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
        conversationKey: "whatsapp:synthetic",
      },
    };

    assert.equal(reviewRepository.add(review).status, "ok");
    assert.equal(reviewRepository.getVersionedSnapshotById(review.id).version, 1);

    const appointment = appointmentRepository.createAppointment({
      sourceReviewId: review.id,
      selectedSlotId: "slot_sqlite",
      doctorId: "dr-ayse-demir",
      doctorName: "Dr. Ayse Demir",
      treatment: "implant",
      appointmentPurpose: "initial_consultation",
      appointmentPurposeLabel: "Initial consultation",
      startAt: "2026-07-29T10:30:00+03:00",
      endAt: "2026-07-29T11:00:00+03:00",
      durationMinutes: 30,
      outboundDestination: {
        channel: "whatsapp",
        reference: "trusted_synthetic",
        maskedLabel: "whatsapp:***00",
      },
    });
    const linkedCalendar = appointmentRepository.linkAppointmentCalendarEvent({
      appointmentId: appointment.appointment.id,
      expectedVersion: 1,
      provider: "mock_calendar",
      providerEventId: "mock_event_sqlite",
    });
    const linkedConfirmation =
      appointmentRepository.linkAppointmentConfirmationMessage({
        appointmentId: appointment.appointment.id,
        expectedVersion: 2,
        provider: "mock_outbound",
        providerMessageId: "mock_confirmation_sqlite",
      });

    assert.equal(appointment.status, "ok");
    assert.equal(linkedCalendar.status, "ok");
    assert.equal(linkedConfirmation.status, "ok");
    assert.equal(linkedConfirmation.appointment.version, 3);
    alphaProvider.close();

    const alphaRestart = createSqlitePersistenceProvider({
      databasePath: temp.databasePath,
      clinicId: "clinic_alpha",
    });
    const alphaAppointments =
      createSqliteAppointmentReviewAppointmentRepository({
        persistenceProvider: alphaRestart,
      });
    const betaProvider = createSqlitePersistenceProvider({
      databasePath: temp.databasePath,
      clinicId: "clinic_beta",
    });
    const betaAppointments = createSqliteAppointmentReviewAppointmentRepository({
      persistenceProvider: betaProvider,
    });

    assert.equal(alphaAppointments.getAppointmentById("appointment_1").version, 3);
    assert.equal(
      alphaAppointments.getAppointmentById("appointment_1")
        .confirmationMessageLinked,
      true
    );
    assert.equal(betaAppointments.getAppointmentById("appointment_1"), null);

    alphaRestart.close();
    betaProvider.close();
  } finally {
    cleanupTempDatabase(temp);
  }
});

test("durable sqlite composition root survives restart and replays idempotently", async () => {
  const temp = createTempDatabasePath("workflow");
  const calendarA = createCountingCalendarProvider();
  const outboundA = createCountingOutboundProvider();

  try {
    const firstRoot = createSqliteRoot({
      databasePath: temp.databasePath,
      calendarProvider: calendarA,
      outboundMessagingProvider: outboundA,
    });
    const workflow = await runDurableWorkflow(firstRoot.adapter);

    assert.equal(calendarA.calls.length, 1);
    assert.equal(outboundA.calls.length, 1);
    assert.equal(firstRoot.adapter.listCreatedAppointments()[0].version, 3);
    firstRoot.root.close();

    const calendarB = createCountingCalendarProvider();
    const outboundB = createCountingOutboundProvider();
    const secondRoot = createSqliteRoot({
      databasePath: temp.databasePath,
      calendarProvider: calendarB,
      outboundMessagingProvider: outboundB,
    });
    const reviews = secondRoot.adapter.listAppointmentReviews();
    const appointment = secondRoot.adapter
      .listCreatedAppointments()
      .find((item) => item.id === workflow.appointmentId);
    const creationReplay = await secondRoot.adapter.createAppointmentFromApprovedReview({
      reviewId: workflow.reviewId,
      expectedReviewVersion: workflow.decision.resultingReviewVersion,
      idempotencyKey: "appointment_creation:durable",
      confirmation: "create_in_memory_appointment",
    });
    const confirmationAlready =
      await secondRoot.adapter.dispatchAppointmentConfirmation({
        appointmentId: workflow.appointmentId,
        expectedAppointmentVersion: workflow.confirmation.resultingAppointmentVersion,
        idempotencyKey: "confirmation_dispatch:durable:different",
        confirmation: "send_mock_appointment_confirmation",
      });

    assert.equal(reviews[0].metadata.linkedAppointmentId, workflow.appointmentId);
    assert.equal(appointment.calendarLinked, true);
    assert.equal(appointment.confirmationMessageLinked, true);
    assert.equal(appointment.version, 3);
    assert.equal(creationReplay.matchingReplay, true);
    assert.equal(creationReplay.appointmentCreated, false);
    assert.equal(secondRoot.adapter.listCreatedAppointments()[0].version, 3);
    assert.equal(confirmationAlready.accepted, false);
    assert.equal(confirmationAlready.alreadyConfirmed, true);
    assert.equal(calendarB.calls.length, 0);
    assert.equal(outboundB.calls.length, 0);
    secondRoot.root.close();
  } finally {
    cleanupTempDatabase(temp);
  }
});

test("sqlite operation idempotency is operation-kind and clinic scoped", () => {
  const temp = createTempDatabasePath("idempotency");

  try {
    const alphaProvider = createSqlitePersistenceProvider({
      databasePath: temp.databasePath,
      clinicId: "clinic_alpha",
    });
    const alphaDecision = createSqliteOperationIdempotencyStore({
      persistenceProvider: alphaProvider,
      operationKind: "decision",
    });
    const alphaCreation = createSqliteOperationIdempotencyStore({
      persistenceProvider: alphaProvider,
      operationKind: "creation",
    });
    const betaProvider = createSqlitePersistenceProvider({
      databasePath: temp.databasePath,
      clinicId: "clinic_beta",
    });
    const betaDecision = createSqliteOperationIdempotencyStore({
      persistenceProvider: betaProvider,
      operationKind: "decision",
    });

    assert.equal(
      alphaDecision.storeResult({
        idempotencyKey: "same",
        requestFingerprint: "fingerprint_a",
        result: { accepted: true, code: "ok" },
      }).accepted,
      true
    );
    assert.equal(alphaDecision.observe("same").requestFingerprint, "fingerprint_a");
    assert.equal(alphaCreation.observe("same"), null);
    assert.equal(betaDecision.observe("same"), null);
    assert.equal(
      alphaDecision.reserveResult({
        idempotencyKey: "same",
        requestFingerprint: "fingerprint_b",
      }).code,
      "idempotency_key_conflict"
    );

    alphaProvider.close();
    betaProvider.close();
  } finally {
    cleanupTempDatabase(temp);
  }
});
