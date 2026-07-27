const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  CALENDAR_CANCELLATION_CONFIRMATION,
  CALENDAR_RESCHEDULE_CONFIRMATION,
  CANCELLATION_CONFIRMATION,
  CANCELLATION_NOTIFICATION_CONFIRMATION,
  RESCHEDULE_CONFIRMATION,
  RESCHEDULE_NOTIFICATION_CONFIRMATION,
  applyAppointmentCancellation,
  applyAppointmentReschedule,
  createAppointmentCancellationPreview,
  createAppointmentReschedulePreview,
  dispatchAppointmentChangeNotification,
  syncAppointmentChangeToCalendar,
} = require("../src/api/secretaryAppointmentChangeLifecycleService");
const {
  APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS,
  APPOINTMENT_NOTIFICATION_STATUS,
  APPOINTMENT_STATUS,
  createInMemoryAppointmentReviewAppointmentRepository,
} = require("../src/secretary/appointmentReviewAppointmentRepository");
const {
  createInMemoryAppointmentReviewExecutionIdempotencyStore,
} = require("../src/secretary/appointmentReviewExecutionIdempotencyStore");
const {
  createSqlitePersistenceProvider,
} = require("../src/persistence/sqliteProvider");
const {
  createSqliteAppointmentReviewAppointmentRepository,
} = require("../src/persistence/sqliteAppointmentRepository");
const { createMockCalendarProvider } = require("../src/calendar/mockCalendarProvider");
const {
  createMockOutboundAppointmentConfirmationProvider,
} = require("../src/messaging/mockOutboundAppointmentConfirmationProvider");
const {
  handleAppointmentChangePost,
  handleAppointmentLifecycleGet,
} = require("../src/api/secretaryAppointmentChangeRouteHandler");
const authCookies = require("../src/auth/authCookies");
const { createAuthRuntime } = require("../src/auth/authRepositoryFactory");
const {
  AUTH_PERMISSIONS,
  AUTH_ROLES,
  roleHasPermission,
} = require("../src/auth/authRoles");
const {
  authenticateCredentials,
  createUserWithPassword,
} = require("../src/auth/authService");

function createAppointment(repository, overrides = {}) {
  const result = repository.createAppointment({
    sourceReviewId: overrides.sourceReviewId || "review_change_lifecycle",
    selectedSlotId: "dr-ayse-demir-implant-initial-consultation-wednesday-1030-30m",
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
      reference: "trusted_conversation_reference",
      maskedLabel: "whatsapp:***33",
    },
    ...overrides,
  });
  assert.equal(result.status, "ok");
  return result.appointment;
}

function actor(role = "secretary") {
  return { actorId: `${role}_1`, actorRole: role };
}

test("reschedule preview and execution are deterministic safe and idempotent", () => {
  const repository = createInMemoryAppointmentReviewAppointmentRepository();
  const appointment = createAppointment(repository);
  const calendarLinked = repository.linkAppointmentCalendarEvent({
    appointmentId: appointment.id,
    expectedVersion: appointment.version,
    provider: "mock",
    providerEventId: "mock_event_original",
  });
  const current = calendarLinked.appointment;
  const idempotencyStore = createInMemoryAppointmentReviewExecutionIdempotencyStore();
  const preview = createAppointmentReschedulePreview({
    appointmentId: current.id,
    expectedAppointmentVersion: current.version,
    appointmentRepository: repository,
    now: "2026-07-27T09:00:00+03:00",
  });
  const selectedSlot = preview.proposedSlots[0];
  const selectedPreview = createAppointmentReschedulePreview({
    appointmentId: current.id,
    expectedAppointmentVersion: current.version,
    selectedSlotId: selectedSlot.id,
    appointmentRepository: repository,
    now: "2026-07-27T09:00:00+03:00",
  });
  const result = applyAppointmentReschedule({
    appointmentId: current.id,
    expectedAppointmentVersion: current.version,
    selectedSlotId: selectedSlot.id,
    idempotencyKey: "reschedule:appointment_1:2",
    confirmation: RESCHEDULE_CONFIRMATION,
    appointmentRepository: repository,
    idempotencyStore,
    actor: actor(),
    now: "2026-07-27T09:00:00+03:00",
  });
  const replay = applyAppointmentReschedule({
    appointmentId: current.id,
    expectedAppointmentVersion: current.version,
    selectedSlotId: selectedSlot.id,
    idempotencyKey: "reschedule:appointment_1:2",
    confirmation: RESCHEDULE_CONFIRMATION,
    appointmentRepository: repository,
    idempotencyStore,
    actor: actor(),
    now: "2026-07-27T09:00:00+03:00",
  });
  const conflict = applyAppointmentReschedule({
    appointmentId: current.id,
    expectedAppointmentVersion: current.version,
    selectedSlotId: preview.proposedSlots[1].id,
    idempotencyKey: "reschedule:appointment_1:2",
    confirmation: RESCHEDULE_CONFIRMATION,
    appointmentRepository: repository,
    idempotencyStore,
    actor: actor(),
    now: "2026-07-27T09:00:00+03:00",
  });

  assert.equal(preview.accepted, true);
  assert.equal(selectedPreview.mutationApplied, false);
  assert.equal(selectedPreview.proposedSlot.id, selectedSlot.id);
  assert.equal(result.accepted, true);
  assert.equal(result.appointment.version, current.version + 1);
  assert.equal(
    result.appointment.calendarFollowUpStatus,
    APPOINTMENT_CALENDAR_FOLLOW_UP_STATUS.UPDATE_REQUIRED
  );
  assert.equal(
    result.appointment.notificationFollowUpStatus,
    APPOINTMENT_NOTIFICATION_STATUS.RESCHEDULE_REQUIRED
  );
  assert.equal(replay.accepted, true);
  assert.equal(replay.matchingReplay, true);
  assert.equal(repository.getAppointmentById(current.id).version, current.version + 1);
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.code, "idempotency_key_conflict");
  assert.equal(repository.listLifecycleEvents(current.id).at(-1).eventType, "appointment_rescheduled");
});

test("availability conflict checks use durable active appointments and cancellation releases slots", () => {
  const repository = createInMemoryAppointmentReviewAppointmentRepository();
  const first = createAppointment(repository, { sourceReviewId: "review_first" });
  const second = createAppointment(repository, {
    sourceReviewId: "review_second",
    selectedSlotId: "dr-ayse-demir-implant-initial-consultation-wednesday-1000-30m",
    startAt: "2026-07-29T10:00:00+03:00",
    endAt: "2026-07-29T10:30:00+03:00",
  });
  const previewWithConflict = createAppointmentReschedulePreview({
    appointmentId: first.id,
    expectedAppointmentVersion: first.version,
    selectedSlotId: second.selectedSlotId,
    appointmentRepository: repository,
    now: "2026-07-27T09:00:00+03:00",
  });
  const cancelled = applyAppointmentCancellation({
    appointmentId: second.id,
    expectedAppointmentVersion: second.version,
    idempotencyKey: "cancel:appointment_2:1",
    confirmation: CANCELLATION_CONFIRMATION,
    appointmentRepository: repository,
    idempotencyStore: createInMemoryAppointmentReviewExecutionIdempotencyStore(),
    actor: actor(),
  });
  const previewAfterCancel = createAppointmentReschedulePreview({
    appointmentId: first.id,
    expectedAppointmentVersion: first.version,
    selectedSlotId: second.selectedSlotId,
    appointmentRepository: repository,
    now: "2026-07-27T09:00:00+03:00",
  });

  assert.equal(previewWithConflict.accepted, false);
  assert.equal(previewWithConflict.code, "reschedule_slot_not_available");
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.appointment.appointmentStatus, APPOINTMENT_STATUS.CANCELLED);
  assert.equal(previewAfterCancel.accepted, true);
  assert.equal(previewAfterCancel.proposedSlot.id, second.selectedSlotId);
});

test("calendar and notification follow-ups are explicit separate idempotent actions", async () => {
  const repository = createInMemoryAppointmentReviewAppointmentRepository();
  const appointment = createAppointment(repository);
  const linked = repository.linkAppointmentCalendarEvent({
    appointmentId: appointment.id,
    expectedVersion: appointment.version,
    provider: "mock",
    providerEventId: "mock_event_original",
  }).appointment;
  const preview = createAppointmentReschedulePreview({
    appointmentId: linked.id,
    expectedAppointmentVersion: linked.version,
    appointmentRepository: repository,
    now: "2026-07-27T09:00:00+03:00",
  });
  const rescheduled = applyAppointmentReschedule({
    appointmentId: linked.id,
    expectedAppointmentVersion: linked.version,
    selectedSlotId: preview.proposedSlots[0].id,
    idempotencyKey: "reschedule:followup:2",
    confirmation: RESCHEDULE_CONFIRMATION,
    appointmentRepository: repository,
    idempotencyStore: createInMemoryAppointmentReviewExecutionIdempotencyStore(),
    actor: actor(),
    now: "2026-07-27T09:00:00+03:00",
  });
  const calendarProvider = createMockCalendarProvider();
  const notificationProvider = createMockOutboundAppointmentConfirmationProvider();
  let calendarProviderCalls = 0;
  let notificationProviderCalls = 0;
  const countedCalendarProvider = {
    ...calendarProvider,
    async updateCalendarEvent(command) {
      calendarProviderCalls += 1;
      return calendarProvider.updateCalendarEvent(command);
    },
  };
  const countedNotificationProvider = {
    ...notificationProvider,
    async sendAppointmentRescheduleNotification(command) {
      notificationProviderCalls += 1;
      return notificationProvider.sendAppointmentRescheduleNotification(command);
    },
  };
  const calendarIdempotencyStore =
    createInMemoryAppointmentReviewExecutionIdempotencyStore();
  const notificationIdempotencyStore =
    createInMemoryAppointmentReviewExecutionIdempotencyStore();
  const calendarSync = await syncAppointmentChangeToCalendar({
    operationName: "reschedule",
    appointmentId: linked.id,
    expectedAppointmentVersion: rescheduled.appointment.version,
    idempotencyKey: "calendar-reschedule:appointment_1:3",
    confirmation: CALENDAR_RESCHEDULE_CONFIRMATION,
    appointmentRepository: repository,
    idempotencyStore: calendarIdempotencyStore,
    provider: countedCalendarProvider,
    actor: actor(),
  });
  const calendarReplay = await syncAppointmentChangeToCalendar({
    operationName: "reschedule",
    appointmentId: linked.id,
    expectedAppointmentVersion: rescheduled.appointment.version,
    idempotencyKey: "calendar-reschedule:appointment_1:3",
    confirmation: CALENDAR_RESCHEDULE_CONFIRMATION,
    appointmentRepository: repository,
    idempotencyStore: calendarIdempotencyStore,
    provider: countedCalendarProvider,
    actor: actor(),
  });
  const notification = await dispatchAppointmentChangeNotification({
    operationName: "reschedule",
    appointmentId: linked.id,
    expectedAppointmentVersion: calendarSync.appointment.version,
    idempotencyKey: "notification-reschedule:appointment_1:4",
    confirmation: RESCHEDULE_NOTIFICATION_CONFIRMATION,
    appointmentRepository: repository,
    idempotencyStore: notificationIdempotencyStore,
    provider: countedNotificationProvider,
    actor: actor(),
  });
  const notificationReplay = await dispatchAppointmentChangeNotification({
    operationName: "reschedule",
    appointmentId: linked.id,
    expectedAppointmentVersion: calendarSync.appointment.version,
    idempotencyKey: "notification-reschedule:appointment_1:4",
    confirmation: RESCHEDULE_NOTIFICATION_CONFIRMATION,
    appointmentRepository: repository,
    idempotencyStore: notificationIdempotencyStore,
    provider: countedNotificationProvider,
    actor: actor(),
  });

  assert.equal(calendarSync.accepted, true);
  assert.equal(calendarSync.providerCalled, true);
  assert.equal(calendarReplay.accepted, true);
  assert.equal(calendarReplay.matchingReplay, true);
  assert.equal(calendarReplay.providerCalled, false);
  assert.equal(calendarProviderCalls, 1);
  assert.equal(calendarSync.appointment.calendarFollowUpStatus, "synchronized");
  assert.equal(notification.accepted, true);
  assert.equal(notification.providerCalled, true);
  assert.equal(notificationReplay.accepted, true);
  assert.equal(notificationReplay.matchingReplay, true);
  assert.equal(notificationReplay.providerCalled, false);
  assert.equal(notificationProviderCalls, 1);
  assert.equal(notification.realPatientDelivery, false);
  assert.equal(notification.appointment.notificationFollowUpStatus, "dispatched");
});

test("appointment lifecycle mutation permission is limited to manager and secretary", () => {
  assert.equal(
    roleHasPermission(
      AUTH_ROLES.MANAGER,
      AUTH_PERMISSIONS.MUTATE_APPOINTMENT_LIFECYCLE
    ),
    true
  );
  assert.equal(
    roleHasPermission(
      AUTH_ROLES.SECRETARY,
      AUTH_PERMISSIONS.MUTATE_APPOINTMENT_LIFECYCLE
    ),
    true
  );
  assert.equal(
    roleHasPermission(
      AUTH_ROLES.DOCTOR,
      AUTH_PERMISSIONS.MUTATE_APPOINTMENT_LIFECYCLE
    ),
    false
  );
});

test("appointment lifecycle architecture keeps providers and trusted fields server-side", () => {
  const serviceSource = fs.readFileSync(
    path.join(__dirname, "../src/api/secretaryAppointmentChangeLifecycleService.js"),
    "utf8"
  );
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../src/api/secretaryAppointmentChangeRouteHandler.js"),
    "utf8"
  );

  assert.doesNotMatch(
    serviceSource,
    /googleapis|graph\.facebook\.com|META_|GOOGLE_/,
    "local lifecycle service must not directly bind to external providers"
  );
  assert.match(routeSource, /doctorId/);
  assert.match(routeSource, /providerEventId/);
  assert.match(routeSource, /client_trusted_appointment_change_injection/);
  assert.doesNotMatch(
    routeSource,
    /appointmentRepository:\s*body|provider:\s*body|actor:\s*body/,
    "route must not hydrate trusted execution dependencies from client body"
  );
});

test("cancellation lifecycle and follow-ups survive SQLite restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oravia-change-"));
  const databasePath = path.join(dir, "change.sqlite");
  try {
    let provider = createSqlitePersistenceProvider({
      databasePath,
      clinicId: "clinic_change_test",
    });
    let repository = createSqliteAppointmentReviewAppointmentRepository({
      persistenceProvider: provider,
    });
    const appointment = createAppointment(repository);
    const cancelled = applyAppointmentCancellation({
      appointmentId: appointment.id,
      expectedAppointmentVersion: appointment.version,
      idempotencyKey: "cancel:sqlite:1",
      confirmation: CANCELLATION_CONFIRMATION,
      appointmentRepository: repository,
      idempotencyStore: createInMemoryAppointmentReviewExecutionIdempotencyStore(),
      actor: actor("manager"),
    });
    provider.close();

    provider = createSqlitePersistenceProvider({
      databasePath,
      clinicId: "clinic_change_test",
    });
    repository = createSqliteAppointmentReviewAppointmentRepository({
      persistenceProvider: provider,
    });
    const reloaded = repository.getAppointmentById(appointment.id);
    const events = repository.listLifecycleEvents(appointment.id);
    provider.close();

    assert.equal(cancelled.accepted, true);
    assert.equal(reloaded.appointmentStatus, APPOINTMENT_STATUS.CANCELLED);
    assert.equal(events.some((event) => event.eventType === "appointment_cancelled"), true);
    assert.equal(Object.isFrozen(events[0]), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("route authorization rejects doctors and trusted field injection before adapter", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "oravia-change-auth-"));
  const databasePath = path.join(temp, "auth.sqlite");
  const previous = {
    ORAVIA_AUTH_REQUIRED: process.env.ORAVIA_AUTH_REQUIRED,
    ORAVIA_STORAGE_MODE: process.env.ORAVIA_STORAGE_MODE,
    ORAVIA_SQLITE_DATABASE_PATH: process.env.ORAVIA_SQLITE_DATABASE_PATH,
    ORAVIA_CLINIC_ID: process.env.ORAVIA_CLINIC_ID,
  };
  process.env.ORAVIA_AUTH_REQUIRED = "true";
  process.env.ORAVIA_STORAGE_MODE = "sqlite";
  process.env.ORAVIA_SQLITE_DATABASE_PATH = databasePath;
  process.env.ORAVIA_CLINIC_ID = "clinic_change_auth";
  let runtime = createAuthRuntime({});
  createUserWithPassword({
    repository: runtime.repository,
    user: {
      clinicId: runtime.clinicId,
      username: "doctor",
      displayName: "Doctor",
      role: "doctor",
      password: "synthetic-password",
    },
  });
  runtime.close();
  runtime = createAuthRuntime({});
  const login = authenticateCredentials({
    repository: runtime.repository,
    clinicId: runtime.clinicId,
    username: "doctor",
    password: "synthetic-password",
  });
  runtime.close();
  const cookie = `${authCookies.SESSION_COOKIE_NAME}=${login.token}`;
  const adapter = {
    createAppointmentReschedulePreview() {
      throw new Error("should not be called");
    },
  };
  const doctorRequest = new Request(
    "https://pilot.example.test/api/secretary/appointments/appointment_1/reschedule-preview",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        origin: "https://pilot.example.test",
        host: "pilot.example.test",
      },
      body: JSON.stringify({ expectedAppointmentVersion: 1 }),
    }
  );
  const injectedRequest = new Request(
    "https://pilot.example.test/api/secretary/appointments/appointment_1/reschedule-preview",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://pilot.example.test",
        host: "pilot.example.test",
      },
      body: JSON.stringify({
        expectedAppointmentVersion: 1,
        doctorId: "client_override",
      }),
    }
  );
  const doctor = await handleAppointmentChangePost(
    doctorRequest,
    { params: { appointmentId: "appointment_1" } },
    "reschedule_preview",
    {
      createRouteRuntimeAdapter() {
        return adapter;
      },
    }
  );

  process.env.ORAVIA_AUTH_REQUIRED = "false";
  const injected = await handleAppointmentChangePost(
    injectedRequest,
    { params: { appointmentId: "appointment_1" } },
    "reschedule_preview",
    {
      createRouteRuntimeAdapter() {
        return adapter;
      },
    }
  );
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  fs.rmSync(temp, { recursive: true, force: true });

  assert.equal(doctor.status, 403);
  assert.equal(injected.status, 400);
  assert.match(JSON.stringify(await injected.json()), /client_trusted/);
});

test("lifecycle history route returns safe immutable events", async () => {
  const events = [
    Object.freeze({
      eventType: "appointment_rescheduled",
      resultingAppointmentVersion: 2,
      actor: { actorRole: "secretary" },
    }),
  ];
  const response = await handleAppointmentLifecycleGet(
    new Request("https://pilot.example.test/api/secretary/appointments/appointment_1/lifecycle"),
    { params: { appointmentId: "appointment_1" } },
    {
      createRouteRuntimeAdapter() {
        return {
          listAppointmentLifecycleEvents() {
            return events;
          },
        };
      },
    }
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.lifecycleEvents[0].eventType, "appointment_rescheduled");
  assert.doesNotMatch(JSON.stringify(body), /providerCommand|accessToken|patientPhone/);
});
