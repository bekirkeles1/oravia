const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const { getCalendarProvider } = require("../src/calendar/calendarProvider");
const {
  createInMemoryAppointmentReviewAppointmentRepository,
} = require("../src/secretary/appointmentReviewAppointmentRepository");
const {
  createInMemoryAppointmentReviewExecutionIdempotencyStore,
} = require("../src/secretary/appointmentReviewExecutionIdempotencyStore");
const {
  constructAppointmentCalendarSyncReceipt,
} = require("../src/secretary/appointmentCalendarSyncReceipt");
const {
  buildTrustedCalendarEventCommand,
  syncAppointmentToCalendar,
} = require("../src/api/secretaryAppointmentCalendarSyncService");
const {
  createInMemoryMockAppointmentReviewServerRuntime,
} = require("../src/secretary/appointmentReviewInMemoryMockServerRuntime");
const {
  createAppointmentReviewRouteRuntimeAdapter,
} = require("../src/secretary/appointmentReviewRouteRuntimeAdapter");
const {
  createAppointmentReviewActiveRouteRuntimeCompositionRoot,
} = require("../src/secretary/appointmentReviewRouteRuntimeCompositionRoot");
const syncRoute = require("../app/api/secretary/appointments/[appointmentId]/calendar-sync/route");

function createAppointment(repository = createInMemoryAppointmentReviewAppointmentRepository()) {
  const result = repository.createAppointment({
    sourceReviewId: "review_calendar_sync",
    selectedSlotId: "slot_calendar_sync",
    doctorId: "dr-ayse-demir",
    doctorName: "Dr. Ayse Demir",
    treatment: "implant",
    appointmentPurpose: "initial_consultation",
    appointmentPurposeLabel: "Initial consultation",
    startAt: "2026-07-29T10:30:00+03:00",
    endAt: "2026-07-29T11:00:00+03:00",
    durationMinutes: 30,
  });

  assert.equal(result.status, "ok");

  return result.appointment;
}

function createCountingProvider({ name = "mock", fail = false } = {}) {
  const calls = [];

  return {
    name,
    calls,
    createCalendarEvent(command) {
      calls.push(command);

      if (fail) {
        throw new Error("synthetic provider failure");
      }

      return {
        calendar_provider: name,
        calendar_event_id: `${name}_event_${command.selectedSlot.id}`,
        start_time: command.selectedSlot.start_at,
        end_time: command.selectedSlot.end_at,
      };
    },
  };
}

function createHarness({ provider = createCountingProvider() } = {}) {
  const appointmentRepository =
    createInMemoryAppointmentReviewAppointmentRepository();
  const appointment = createAppointment(appointmentRepository);
  const idempotencyStore =
    createInMemoryAppointmentReviewExecutionIdempotencyStore();

  return {
    appointment,
    appointmentRepository,
    idempotencyStore,
    provider,
    input(overrides = {}) {
      return {
        appointmentId: appointment.id,
        expectedAppointmentVersion: appointment.version,
        idempotencyKey: "calendar_sync:appointment_1:1",
        confirmation: "sync_configured_calendar",
        appointmentRepository,
        calendarProvider: provider,
        idempotencyStore,
        ...overrides,
      };
    },
  };
}

test("appointment repository records one calendar link and versions once", () => {
  const repository = createInMemoryAppointmentReviewAppointmentRepository();
  const appointment = createAppointment(repository);
  const beforeSnapshot = repository.getAppointmentById(appointment.id);
  const linked = repository.linkAppointmentCalendarEvent({
    appointmentId: appointment.id,
    expectedVersion: 1,
    provider: "mock",
    providerEventId: "mock_event_1",
  });
  const duplicate = repository.linkAppointmentCalendarEvent({
    appointmentId: appointment.id,
    expectedVersion: 2,
    provider: "mock",
    providerEventId: "mock_event_2",
  });
  const isolated = createInMemoryAppointmentReviewAppointmentRepository();

  assert.equal(beforeSnapshot.version, 1);
  assert.equal(beforeSnapshot.calendarLinked, false);
  assert.equal(linked.status, "ok");
  assert.equal(linked.appointment.version, 2);
  assert.equal(linked.appointment.calendarLinked, true);
  assert.equal(linked.appointment.calendarEventId, "mock_event_1");
  assert.equal(linked.appointmentRepositoryVersion, 2);
  assert.equal(repository.getVersion(), 2);
  assert.equal(duplicate.status, "error");
  assert.equal(duplicate.error.code, "appointment_already_calendar_synced");
  assert.equal(isolated.getVersion(), 0);
  assert.equal(Object.isFrozen(linked.appointment), true);
  assert.equal(beforeSnapshot.calendarLinked, false);
});

test("appointment repository rejects calendar link version conflict without mutation", () => {
  const repository = createInMemoryAppointmentReviewAppointmentRepository();
  const appointment = createAppointment(repository);
  const conflict = repository.linkAppointmentCalendarEvent({
    appointmentId: appointment.id,
    expectedVersion: 2,
    provider: "mock",
    providerEventId: "mock_event_1",
  });

  assert.equal(conflict.status, "error");
  assert.equal(conflict.error.code, "appointment_version_conflict");
  assert.equal(repository.getAppointmentById(appointment.id).calendarLinked, false);
  assert.equal(repository.getVersion(), 1);
});

test("calendar sync service uses trusted appointment fields and links through mock provider", async () => {
  const harness = createHarness();
  const result = await syncAppointmentToCalendar(
    harness.input({
      doctorId: "client_override",
      startAt: "2099-01-01T00:00:00+03:00",
      provider: "google_service_account",
    })
  );
  const providerCommand = harness.provider.calls[0];

  assert.equal(result.accepted, true);
  assert.equal(result.synced, true);
  assert.equal(result.provider, "mock");
  assert.equal(result.providerEventId, "mock_event_slot_calendar_sync");
  assert.equal(result.previousAppointmentVersion, 1);
  assert.equal(result.resultingAppointmentVersion, 2);
  assert.equal(result.appointmentRepositoryVersion, 2);
  assert.equal(result.messageSent, false);
  assert.equal(harness.provider.calls.length, 1);
  assert.equal(providerCommand.doctor.name, "Dr. Ayse Demir");
  assert.equal(providerCommand.selectedSlot.start_at, "2026-07-29T10:30:00+03:00");
  assert.equal(providerCommand.selectedSlot.end_at, "2026-07-29T11:00:00+03:00");
  assert.deepEqual(providerCommand.patient, {});
  assert.equal(
    harness.appointmentRepository.getAppointmentById("appointment_1")
      .calendarLinked,
    true
  );
});

test("calendar sync idempotency replay and already-synced protection avoid provider calls", async () => {
  const harness = createHarness();
  const first = await syncAppointmentToCalendar(harness.input());
  const replay = await syncAppointmentToCalendar(harness.input());
  const alreadySynced = await syncAppointmentToCalendar(
    harness.input({
      expectedAppointmentVersion: 2,
      idempotencyKey: "calendar_sync:appointment_1:different",
    })
  );
  const conflictHarness = createHarness();
  await syncAppointmentToCalendar(conflictHarness.input());
  const conflict = await syncAppointmentToCalendar(
    conflictHarness.input({
      idempotencyKey: "calendar_sync:appointment_1:1",
      appointmentId: "appointment_2",
    })
  );

  assert.equal(first.accepted, true);
  assert.equal(replay.accepted, true);
  assert.equal(replay.matchingReplay, true);
  assert.equal(replay.providerCalled, false);
  assert.equal(replay.resultingAppointmentVersion, 2);
  assert.equal(harness.provider.calls.length, 1);
  assert.equal(alreadySynced.accepted, false);
  assert.equal(alreadySynced.code, "appointment_calendar_sync_already_synced");
  assert.equal(harness.provider.calls.length, 1);
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.code, "idempotency_key_conflict");
});

test("calendar sync blocks incomplete appointments and provider failures before local link", async () => {
  const incompleteRepository =
    createInMemoryAppointmentReviewAppointmentRepository();
  const incomplete = incompleteRepository.createAppointment({
    sourceReviewId: "review_incomplete",
    selectedSlotId: "slot_incomplete",
    doctorId: "dr-safe",
    doctorName: "Dr. Safe",
    treatment: "implant",
    appointmentPurpose: "initial_consultation",
    appointmentPurposeLabel: "Initial consultation",
    startAt: "2026-07-29T10:30:00+03:00",
    endAt: "",
    durationMinutes: 30,
  });
  const providerFailureHarness = createHarness({
    provider: createCountingProvider({ name: "google_service_account", fail: true }),
  });
  const providerFailure = await syncAppointmentToCalendar(
    providerFailureHarness.input()
  );

  assert.equal(incomplete.status, "error");
  assert.equal(providerFailure.accepted, false);
  assert.equal(providerFailure.code, "appointment_calendar_sync_provider_failed");
  assert.equal(providerFailure.provider, "google_service_account");
  assert.equal(providerFailureHarness.provider.calls.length, 1);
  assert.equal(
    providerFailureHarness.appointmentRepository.getAppointmentById("appointment_1")
      .calendarLinked,
    false
  );
});

test("provider success followed by local link failure is explicit ambiguous sync", async () => {
  const harness = createHarness();
  let linkCalls = 0;
  const result = await syncAppointmentToCalendar(
    harness.input({
      appointmentRepository: {
        getAppointmentById: harness.appointmentRepository.getAppointmentById,
        linkAppointmentCalendarEvent() {
          linkCalls += 1;
          return {
            status: "error",
            error: {
              code: "synthetic_link_failure",
              message: "Synthetic link failure.",
            },
          };
        },
      },
    })
  );

  assert.equal(result.accepted, false);
  assert.equal(result.ambiguous, true);
  assert.equal(result.externalEventCreated, true);
  assert.equal(result.calendarWritten, true);
  assert.equal(result.appointmentCalendarLinkRecorded, false);
  assert.equal(result.providerEventId, "mock_event_slot_calendar_sync");
  assert.equal(harness.provider.calls.length, 1);
  assert.equal(linkCalls, 1);
  assert.doesNotMatch(JSON.stringify(result), /Synthetic link failure/);
});

test("calendar sync reports created external event when result storage fails after local link", async () => {
  const harness = createHarness();
  const result = await syncAppointmentToCalendar(
    harness.input({
      idempotencyStore: {
        observe: harness.idempotencyStore.observe,
        getResult: harness.idempotencyStore.getResult,
        reserveResult: harness.idempotencyStore.reserveResult,
        storeResult() {
          return {
            accepted: false,
            code: "synthetic_store_failure",
            reason: "Synthetic store failure.",
          };
        },
      },
    })
  );
  const linkedAppointment = harness.appointmentRepository.getAppointmentById(
    harness.appointment.id
  );

  assert.equal(result.accepted, false);
  assert.equal(result.ambiguous, true);
  assert.equal(result.externalEventCreated, true);
  assert.equal(result.calendarWritten, true);
  assert.equal(result.appointmentCalendarLinkRecorded, true);
  assert.equal(result.appointmentVersionChanged, true);
  assert.equal(result.appointmentRepositoryVersionChanged, true);
  assert.equal(result.providerEventId, "mock_event_slot_calendar_sync");
  assert.equal(harness.provider.calls.length, 1);
  assert.equal(linkedAppointment.calendarLinked, true);
  assert.equal(linkedAppointment.version, 2);
  assert.doesNotMatch(JSON.stringify(result), /Synthetic store failure/);
});

test("calendar sync receipt is immutable and excludes raw provider material", () => {
  const receipt = constructAppointmentCalendarSyncReceipt({
    appointmentId: "appointment_1",
    sourceReviewId: "review_1",
    provider: "mock",
    providerEventId: "mock_event_1",
    startAt: "2026-07-29T10:30:00+03:00",
    endAt: "2026-07-29T11:00:00+03:00",
    previousAppointmentVersion: 1,
    resultingAppointmentVersion: 2,
    appointmentRepositoryVersion: 2,
    calendarExternalPersistence: false,
  });

  assert.equal(receipt.accepted, true);
  assert.equal(receipt.receiptKind, "appointment_calendar_sync_receipt_v1");
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(receipt.messageSent, false);
  assert.doesNotMatch(JSON.stringify(receipt), /credential|private_key|service-account/i);
});

test("runtime and route adapter expose narrow isolated calendar sync capability", async () => {
  const firstProvider = createCountingProvider();
  const secondProvider = createCountingProvider();
  const firstRuntime = createInMemoryMockAppointmentReviewServerRuntime({
    resolveControlledActionState,
    calendarProvider: firstProvider,
  });
  const secondRuntime = createInMemoryMockAppointmentReviewServerRuntime({
    resolveControlledActionState,
    calendarProvider: secondProvider,
  });
  const adapter = createAppointmentReviewRouteRuntimeAdapter({
    resolveControlledActionState,
    calendarProvider: createCountingProvider(),
  });

  assert.equal(typeof firstRuntime.syncAppointmentToCalendar, "function");
  assert.equal(typeof adapter.syncAppointmentToCalendar, "function");
  assert.equal(Object.hasOwn(adapter, "calendarProvider"), false);
  assert.equal(Object.hasOwn(adapter, "appointmentRepository"), false);
  assert.equal(firstRuntime.listCreatedAppointments().length, 0);
  assert.equal(secondRuntime.listCreatedAppointments().length, 0);
});

test("calendar sync route validates payload and maps safe outcomes", async () => {
  const calls = [];
  const adapter = Object.freeze({
    syncAppointmentToCalendar(input) {
      calls.push(input);

      return {
        accepted: true,
        synced: true,
        calendarSync: true,
        code: "appointment_calendar_sync_completed",
        appointmentId: input.appointmentId,
        provider: "mock",
        providerEventId: "mock_event_1",
        appointmentCalendarLinkRecorded: true,
        calendarWritten: true,
        externalEventCreated: true,
        storage: "in_memory",
        appointmentPersistence: "not_persisted",
        durableAppointmentPersistence: false,
        messageSent: false,
        emailSent: false,
        whatsappSent: false,
        databasePersisted: false,
      };
    },
  });
  const valid = await syncRoute.handleAppointmentCalendarSyncRouteRequest(
    createRequest({
      expectedAppointmentVersion: 1,
      idempotencyKey: "calendar_sync:route:1",
      confirmation: "sync_configured_calendar",
    }),
    createContext(),
    {
      createRouteRuntimeAdapter() {
        return adapter;
      },
    }
  );
  const validBody = await valid.json();
  let invalidFactoryCalls = 0;
  const invalid = await syncRoute.handleAppointmentCalendarSyncRouteRequest(
    createRequest({
      expectedAppointmentVersion: 1,
      idempotencyKey: "calendar_sync:route:1",
      confirmation: "sync_configured_calendar",
      provider: "mock",
    }),
    createContext(),
    {
      createRouteRuntimeAdapter() {
        invalidFactoryCalls += 1;
        return adapter;
      },
    }
  );
  const method = await syncRoute.GET(
    new Request("http://localhost/api/secretary/appointments/appointment_1/calendar-sync"),
    createContext()
  );

  assert.equal(valid.status, 200);
  assert.equal(validBody.provider, "mock");
  assert.deepEqual(calls[0], {
    appointmentId: "appointment_1",
    expectedAppointmentVersion: 1,
    idempotencyKey: "calendar_sync:route:1",
    confirmation: "sync_configured_calendar",
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalidFactoryCalls, 0);
  assert.equal(method.status, 405);
});

test("default route runtime supports create appointment then calendar sync", async () => {
  const approveRoute = require("../app/api/secretary/appointment-reviews/[id]/decision-execution/route");
  const createRoute = require("../app/api/secretary/appointment-reviews/[id]/appointment-creation/route");
  const appointmentsRoute = require("../app/api/secretary/appointments/route");
  const reviewId = "review_route_runtime_demo";
  const approve = await approveRoute.POST(
    new Request(`http://localhost/api/secretary/appointment-reviews/${reviewId}/decision-execution`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        expectedReviewVersion: 1,
        idempotencyKey: "calendar_sync_route_test:approve:1",
        confirmation: "apply_in_memory",
      }),
    }),
    { params: { id: reviewId } }
  );
  const created = await createRoute.POST(
    createCreateAppointmentRequest({
      expectedReviewVersion: 2,
      idempotencyKey: "calendar_sync_route_test:create:1",
      confirmation: "create_in_memory_appointment",
    }, reviewId),
    { params: { id: reviewId } }
  );
  const sync = await syncRoute.POST(
    createRequest({
      expectedAppointmentVersion: 1,
      idempotencyKey: "calendar_sync_route_test:sync:1",
      confirmation: "sync_configured_calendar",
    }, "appointment_1"),
    { params: { appointmentId: "appointment_1" } }
  );
  const replay = await syncRoute.POST(
    createRequest({
      expectedAppointmentVersion: 1,
      idempotencyKey: "calendar_sync_route_test:sync:1",
      confirmation: "sync_configured_calendar",
    }, "appointment_1"),
    { params: { appointmentId: "appointment_1" } }
  );
  const duplicate = await syncRoute.POST(
    createRequest({
      expectedAppointmentVersion: 2,
      idempotencyKey: "calendar_sync_route_test:sync:2",
      confirmation: "sync_configured_calendar",
    }, "appointment_1"),
    { params: { appointmentId: "appointment_1" } }
  );
  const list = await appointmentsRoute.GET(
    new Request("http://localhost/api/secretary/appointments")
  );
  const syncBody = await sync.json();
  const replayBody = await replay.json();
  const duplicateBody = await duplicate.json();
  const listBody = await list.json();

  assert.equal(approve.status, 200);
  assert.equal(created.status, 200);
  assert.equal(sync.status, 200);
  assert.equal(syncBody.provider, "mock");
  assert.equal(
    syncBody.providerEventId,
    "mock_calendar_event_review_route_runtime_demo_slot"
  );
  assert.equal(syncBody.resultingAppointmentVersion, 2);
  assert.equal(replay.status, 200);
  assert.equal(replayBody.matchingReplay, true);
  assert.equal(replayBody.providerCalled, false);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicateBody.code, "appointment_calendar_sync_already_synced");
  assert.equal(listBody.appointments[0].calendarLinked, true);
  assert.equal(listBody.appointments[0].version, 2);
});

test("in-process production route smoke syncs once replays and blocks already synced", async () => {
  const approveRoute = require("../app/api/secretary/appointment-reviews/[id]/decision-execution/route");
  const createRoute = require("../app/api/secretary/appointment-reviews/[id]/appointment-creation/route");
  const appointmentsRoute = require("../app/api/secretary/appointments/route");
  const provider = createCountingProvider();
  const compositionRoot = createAppointmentReviewActiveRouteRuntimeCompositionRoot({
    calendarProvider: provider,
  });
  const createRouteRuntimeAdapter = () =>
    compositionRoot.getRouteRuntimeAdapter();
  const reviewId = "review_route_runtime_demo";
  const approve = await approveRoute.handleAppointmentReviewDecisionExecutionRouteRequest(
    createDecisionExecutionRequest({
      action: "approve",
      expectedReviewVersion: 1,
      idempotencyKey: "calendar_sync_integrated:approve:1",
      confirmation: "apply_in_memory",
    }, reviewId),
    { params: { id: reviewId } },
    { createRouteRuntimeAdapter }
  );
  const created = await createRoute.handleAppointmentReviewAppointmentCreationRouteRequest(
    createCreateAppointmentRequest({
      expectedReviewVersion: 2,
      idempotencyKey: "calendar_sync_integrated:create:1",
      confirmation: "create_in_memory_appointment",
    }, reviewId),
    { params: { id: reviewId } },
    { createRouteRuntimeAdapter }
  );
  const beforeList = await appointmentsRoute.GET(
    new Request("http://localhost/api/secretary/appointments"),
    { createRouteRuntimeAdapter }
  );
  const first = await syncRoute.handleAppointmentCalendarSyncRouteRequest(
    createRequest({
      expectedAppointmentVersion: 1,
      idempotencyKey: "calendar_sync_integrated:sync:1",
      confirmation: "sync_configured_calendar",
    }, "appointment_1"),
    { params: { appointmentId: "appointment_1" } },
    { createRouteRuntimeAdapter }
  );
  const replay = await syncRoute.handleAppointmentCalendarSyncRouteRequest(
    createRequest({
      expectedAppointmentVersion: 1,
      idempotencyKey: "calendar_sync_integrated:sync:1",
      confirmation: "sync_configured_calendar",
    }, "appointment_1"),
    { params: { appointmentId: "appointment_1" } },
    { createRouteRuntimeAdapter }
  );
  const duplicate = await syncRoute.handleAppointmentCalendarSyncRouteRequest(
    createRequest({
      expectedAppointmentVersion: 2,
      idempotencyKey: "calendar_sync_integrated:sync:2",
      confirmation: "sync_configured_calendar",
    }, "appointment_1"),
    { params: { appointmentId: "appointment_1" } },
    { createRouteRuntimeAdapter }
  );
  const afterList = await appointmentsRoute.GET(
    new Request("http://localhost/api/secretary/appointments"),
    { createRouteRuntimeAdapter }
  );
  const approveBody = await approve.json();
  const createdBody = await created.json();
  const beforeListBody = await beforeList.json();
  const firstBody = await first.json();
  const replayBody = await replay.json();
  const duplicateBody = await duplicate.json();
  const afterListBody = await afterList.json();
  const serializedResponses = JSON.stringify([
    firstBody,
    replayBody,
    duplicateBody,
    afterListBody,
  ]);

  assert.equal(approve.status, 200);
  assert.equal(approveBody.resultingState, "needs_clinic_review");
  assert.equal(created.status, 200);
  assert.equal(createdBody.appointmentId, "appointment_1");
  assert.equal(beforeListBody.appointments[0].version, 1);
  assert.equal(beforeListBody.appointments[0].calendarLinked, false);
  assert.equal(first.status, 200);
  assert.equal(firstBody.provider, "mock");
  assert.equal(
    firstBody.providerEventId,
    "mock_event_review_route_runtime_demo_slot"
  );
  assert.equal(firstBody.appointmentCalendarLinkRecorded, true);
  assert.equal(firstBody.resultingAppointmentVersion, 2);
  assert.equal(firstBody.messageSent, false);
  assert.equal(provider.calls.length, 1);
  assert.equal(replay.status, 200);
  assert.equal(replayBody.matchingReplay, true);
  assert.equal(replayBody.providerCalled, false);
  assert.equal(replayBody.resultingAppointmentVersion, 2);
  assert.equal(provider.calls.length, 1);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicateBody.code, "appointment_calendar_sync_already_synced");
  assert.equal(provider.calls.length, 1);
  assert.equal(afterListBody.appointments[0].calendarLinked, true);
  assert.equal(afterListBody.appointments[0].version, 2);
  assert.doesNotMatch(
    serializedResponses,
    /"repository"\s*:|"adapter"\s*:|"runtime"\s*:|credential|private_key|stack|patientPhone|patientId|createCalendarEvent|"calendarId"\s*:/i
  );
});

test("calendar provider architecture is reused without fallback or duplicate abstraction", () => {
  const files = [
    "src/api/secretaryAppointmentCalendarSyncService.js",
    "src/secretary/appointmentReviewInMemoryMockServerRuntime.js",
    "app/api/secretary/appointments/[appointmentId]/calendar-sync/route.js",
  ];
  const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  const mockProvider = getCalendarProvider("mock");
  const command = buildTrustedCalendarEventCommand({
    providerName: "mock",
    appointment: createAppointment(),
  });

  assert.equal(mockProvider.name, "mock");
  assert.equal(command.accepted, true);
  assert.match(source, /getCalendarProvider/);
  assert.doesNotMatch(source, /new CalendarProvider|class .*Calendar|fallback/i);
  assert.doesNotMatch(source, /process\.env|googleapis|prisma|supabase|redis/);
});

function createRequest(payload, appointmentId = "appointment_1") {
  return new Request(
    `http://localhost/api/secretary/appointments/${appointmentId}/calendar-sync`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

function createCreateAppointmentRequest(payload, reviewId) {
  return new Request(
    `http://localhost/api/secretary/appointment-reviews/${reviewId}/appointment-creation`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

function createDecisionExecutionRequest(payload, reviewId) {
  return new Request(
    `http://localhost/api/secretary/appointment-reviews/${reviewId}/decision-execution`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

function createContext(appointmentId = "appointment_1") {
  return {
    params: { appointmentId },
  };
}

function resolveControlledActionState(input) {
  return String(input?.review?.metadata?.controlledActionState || "").trim();
}
