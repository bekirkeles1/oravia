const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  createAppointmentFromApprovedReview,
} = require("../src/api/secretaryAppointmentReviewAppointmentCreationService");
const {
  createInMemoryAppointmentReviewAppointmentRepository,
} = require("../src/secretary/appointmentReviewAppointmentRepository");
const {
  createInMemoryAppointmentReviewExecutionIdempotencyStore,
} = require("../src/secretary/appointmentReviewExecutionIdempotencyStore");
const {
  createInMemoryAppointmentReviewRepository,
} = require("../src/secretary/appointmentReviewRepository");
const {
  createInMemoryMockAppointmentReviewServerRuntime,
} = require("../src/secretary/appointmentReviewInMemoryMockServerRuntime");
const {
  createAppointmentReviewRouteRuntimeAdapter,
} = require("../src/secretary/appointmentReviewRouteRuntimeAdapter");
const route = require("../app/api/secretary/appointment-reviews/[id]/appointment-creation/route");
const appointmentsRoute = require("../app/api/secretary/appointments/route");

function createReview({
  id = "review_appointment_creation",
  state = "needs_clinic_review",
  slotOverrides = {},
} = {}) {
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
      ...slotOverrides,
    },
    treatment: "implant",
    appointmentPurpose: "initial_consultation",
    appointmentPurposeLabel: "Initial consultation",
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
    metadata: {
      controlledActionState: state,
    },
  };
}

function createHarness(review = createReview()) {
  const reviewRepository = createInMemoryAppointmentReviewRepository({
    initialReviews: [review],
  });
  const appointmentRepository =
    createInMemoryAppointmentReviewAppointmentRepository();
  const idempotencyStore =
    createInMemoryAppointmentReviewExecutionIdempotencyStore();

  return {
    reviewRepository,
    appointmentRepository,
    idempotencyStore,
    input(overrides = {}) {
      return {
        reviewId: review.id,
        expectedReviewVersion: 1,
        idempotencyKey: "appointment_creation:review:1",
        confirmation: "create_in_memory_appointment",
        resolveReviewSnapshot(reviewId) {
          return reviewRepository.getVersionedSnapshotById(reviewId);
        },
        appointmentRepository,
        idempotencyStore,
        previewReviewAppointmentCreationLink:
          reviewRepository.previewReviewAppointmentCreationLink,
        applyReviewAppointmentCreationLink:
          reviewRepository.applyReviewAppointmentCreationLink,
        ...overrides,
      };
    },
  };
}

function assertCreationSafety(result) {
  assert.equal(result.storage, "in_memory");
  assert.equal(result.persistence, "not_persisted");
  assert.equal(result.durablePersistence, false);
  assert.equal(result.calendarWritten, false);
  assert.equal(result.calendarEventCreated, false);
  assert.equal(result.messageSent, false);
  assert.equal(result.databasePersisted, false);
  assert.equal(result.externalCallPerformed, false);
}

test("appointment repository creates once and enforces source review uniqueness", () => {
  const repository = createInMemoryAppointmentReviewAppointmentRepository();
  const input = {
    sourceReviewId: "review_safe",
    selectedSlotId: "slot_safe",
    doctorId: "doctor_safe",
    doctorName: "Dr. Safe",
    treatment: "implant",
    appointmentPurpose: "initial_consultation",
    appointmentPurposeLabel: "Initial consultation",
    startAt: "2026-07-29T10:30:00+03:00",
    endAt: "2026-07-29T11:00:00+03:00",
    durationMinutes: 30,
  };
  const first = repository.createAppointment(input);
  const duplicate = repository.createAppointment(input);
  const listed = repository.listAppointments();

  assert.equal(first.status, "ok");
  assert.equal(first.appointment.id, "appointment_1");
  assert.equal(first.appointmentRepositoryVersion, 1);
  assert.equal(duplicate.status, "error");
  assert.equal(duplicate.error.code, "appointment_already_created_for_review");
  assert.equal(repository.getVersion(), 1);
  assert.equal(repository.getAppointmentById("appointment_1").id, "appointment_1");
  assert.equal(repository.findAppointmentBySourceReviewId("review_safe").id, "appointment_1");
  assert.equal(listed.length, 1);
  assert.equal(Object.isFrozen(first.appointment), true);
  assert.equal(Object.isFrozen(listed[0]), true);
});

test("appointment repositories remain isolated", () => {
  const first = createInMemoryAppointmentReviewAppointmentRepository();
  const second = createInMemoryAppointmentReviewAppointmentRepository();

  first.createAppointment({
    sourceReviewId: "review_safe",
    selectedSlotId: "slot_safe",
    doctorId: "doctor_safe",
    doctorName: "Dr. Safe",
    treatment: "implant",
    appointmentPurpose: "initial_consultation",
    appointmentPurposeLabel: "Initial consultation",
    startAt: "2026-07-29T10:30:00+03:00",
    endAt: "2026-07-29T11:00:00+03:00",
    durationMinutes: 30,
  });

  assert.equal(first.listAppointments().length, 1);
  assert.equal(second.listAppointments().length, 0);
  assert.equal(first.getVersion(), 1);
  assert.equal(second.getVersion(), 0);
});

test("approved review creates one appointment and links trusted review data", async () => {
  const harness = createHarness();
  const result = await createAppointmentFromApprovedReview(harness.input());
  const reviewSnapshot =
    harness.reviewRepository.getVersionedSnapshotById("review_appointment_creation");

  assert.equal(result.accepted, true);
  assert.equal(result.created, true);
  assert.equal(result.appointmentCreated, true);
  assert.equal(result.appointment.id, "appointment_1");
  assert.equal(result.appointment.doctor.id, "dr-ayse-demir");
  assert.equal(result.appointment.startAt, "2026-07-29T10:30:00+03:00");
  assert.equal(result.appointment.durationMinutes, 30);
  assert.equal(result.resultingReviewVersion, 2);
  assert.equal(result.appointmentRepositoryVersion, 1);
  assert.equal(reviewSnapshot.version, 2);
  assert.equal(
    reviewSnapshot.review.metadata.linkedAppointmentId,
    "appointment_1"
  );
  assert.equal(reviewSnapshot.review.bookingCreated, false);
  assert.equal(reviewSnapshot.review.calendarChecked, false);
  assertCreationSafety(result);
  assertCreationSafety(result.receipt);
});

test("pending and rejected reviews are blocked without mutation", async () => {
  for (const state of ["validation_only_intent_checked", "action_intent_rejected"]) {
    const harness = createHarness(createReview({ state }));
    const result = await createAppointmentFromApprovedReview(harness.input());

    assert.equal(result.accepted, false);
    assert.equal(result.code, "review_not_approved_for_appointment_creation");
    assert.equal(result.blocked, true);
    assert.equal(harness.appointmentRepository.listAppointments().length, 0);
    assert.equal(
      harness.reviewRepository.getVersionedSnapshotById("review_appointment_creation").version,
      1
    );
  }
});

test("client appointment overrides are ignored and incomplete trusted candidates block", async () => {
  const harness = createHarness();
  const result = await createAppointmentFromApprovedReview(
    harness.input({
      doctorId: "malicious",
      startAt: "2099-01-01T00:00:00+03:00",
      durationMinutes: 999,
    })
  );
  const incompleteHarness = createHarness(
    createReview({ slotOverrides: { doctorId: "" } })
  );
  const incomplete = await createAppointmentFromApprovedReview(
    incompleteHarness.input()
  );

  assert.equal(result.accepted, true);
  assert.equal(result.appointment.doctor.id, "dr-ayse-demir");
  assert.equal(result.appointment.startAt, "2026-07-29T10:30:00+03:00");
  assert.equal(result.appointment.durationMinutes, 30);
  assert.equal(incomplete.accepted, false);
  assert.equal(incomplete.code, "incomplete_trusted_appointment_candidate");
  assert.equal(incompleteHarness.appointmentRepository.listAppointments().length, 0);
});

test("stale version duplicate and idempotency replay are safe", async () => {
  const staleHarness = createHarness();
  const stale = await createAppointmentFromApprovedReview(
    staleHarness.input({ expectedReviewVersion: 2 })
  );
  const harness = createHarness();
  const first = await createAppointmentFromApprovedReview(harness.input());
  const replay = await createAppointmentFromApprovedReview(harness.input());
  const duplicate = await createAppointmentFromApprovedReview(
    harness.input({
      idempotencyKey: "appointment_creation:review:different",
      expectedReviewVersion: 2,
    })
  );
  const conflictHarness = createHarness();
  await createAppointmentFromApprovedReview(conflictHarness.input());
  const conflict = await createAppointmentFromApprovedReview(
    conflictHarness.input({
      idempotencyKey: "appointment_creation:review:1",
      reviewId: "different_review",
    })
  );

  assert.equal(stale.accepted, false);
  assert.equal(stale.code, "review_version_conflict");
  assert.equal(staleHarness.appointmentRepository.listAppointments().length, 0);
  assert.equal(first.accepted, true);
  assert.equal(replay.accepted, true);
  assert.equal(replay.matchingReplay, true);
  assert.equal(replay.created, false);
  assert.equal(replay.resultingReviewVersion, 2);
  assert.equal(harness.appointmentRepository.listAppointments().length, 1);
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.code, "appointment_already_created_for_review");
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.code, "idempotency_key_conflict");
});

test("infrastructure failures are contained before appointment creation mutation", async () => {
  const appointmentFailureHarness = createHarness();
  let appointmentCreateCalls = 0;
  const appointmentFailure = await createAppointmentFromApprovedReview(
    appointmentFailureHarness.input({
      appointmentRepository: {
        findAppointmentBySourceReviewId() {
          return null;
        },
        getVersion() {
          return 0;
        },
        createAppointment() {
          appointmentCreateCalls += 1;
          throw new Error("synthetic appointment repository failure");
        },
      },
    })
  );
  const reviewFailureHarness = createHarness();
  const reviewFailure = await createAppointmentFromApprovedReview(
    reviewFailureHarness.input({
      previewReviewAppointmentCreationLink() {
        throw new Error("synthetic review repository failure");
      },
    })
  );
  const idempotencyFailureHarness = createHarness();
  let idempotencyAppointmentCalls = 0;
  const idempotencyFailure = await createAppointmentFromApprovedReview(
    idempotencyFailureHarness.input({
      appointmentRepository: {
        findAppointmentBySourceReviewId() {
          return null;
        },
        getVersion() {
          return 0;
        },
        createAppointment() {
          idempotencyAppointmentCalls += 1;
          return { status: "ok" };
        },
      },
      idempotencyStore: {
        observe() {
          return null;
        },
        getResult() {
          return null;
        },
        reserveResult() {
          return {
            accepted: false,
            code: "synthetic_idempotency_failure",
            reason: "Synthetic idempotency reserve failure.",
          };
        },
        storeResult() {
          return { accepted: true };
        },
      },
    })
  );
  const receiptFailureHarness = createHarness();
  let receiptAppointmentCalls = 0;
  const receiptFailure = await createAppointmentFromApprovedReview(
    receiptFailureHarness.input({
      appointmentRepository: {
        findAppointmentBySourceReviewId() {
          return null;
        },
        getVersion() {
          return Number.MAX_SAFE_INTEGER;
        },
        createAppointment() {
          receiptAppointmentCalls += 1;
          return { status: "ok" };
        },
      },
    })
  );

  assert.equal(appointmentFailure.accepted, false);
  assert.equal(appointmentFailure.code, "appointment_repository_failed");
  assert.equal(appointmentCreateCalls, 1);
  assert.equal(
    appointmentFailureHarness.reviewRepository.getVersionedSnapshotById(
      "review_appointment_creation"
    ).version,
    1
  );
  assert.equal(reviewFailure.accepted, false);
  assert.equal(reviewFailure.code, "review_repository_link_preview_failed");
  assert.equal(reviewFailureHarness.appointmentRepository.listAppointments().length, 0);
  assert.equal(
    reviewFailureHarness.reviewRepository.getVersionedSnapshotById(
      "review_appointment_creation"
    ).version,
    1
  );
  assert.equal(idempotencyFailure.accepted, false);
  assert.equal(idempotencyFailure.code, "synthetic_idempotency_failure");
  assert.equal(idempotencyAppointmentCalls, 0);
  assert.equal(
    idempotencyFailureHarness.reviewRepository.getVersionedSnapshotById(
      "review_appointment_creation"
    ).version,
    1
  );
  assert.equal(receiptFailure.accepted, false);
  assert.equal(
    receiptFailure.code,
    "invalid_appointment_creation_receipt_versions"
  );
  assert.equal(receiptAppointmentCalls, 0);
  assert.equal(
    receiptFailureHarness.reviewRepository.getVersionedSnapshotById(
      "review_appointment_creation"
    ).version,
    1
  );
});

test("server runtimes and route adapters expose narrow isolated appointment creation", async () => {
  const firstRuntime = createInMemoryMockAppointmentReviewServerRuntime({
    resolveControlledActionState,
    initialReviews: [createReview()],
  });
  const secondRuntime = createInMemoryMockAppointmentReviewServerRuntime({
    resolveControlledActionState,
    initialReviews: [createReview()],
  });
  const first = await firstRuntime.createAppointmentFromApprovedReview({
    reviewId: "review_appointment_creation",
    expectedReviewVersion: 1,
    idempotencyKey: "same_key",
    confirmation: "create_in_memory_appointment",
  });
  const second = await secondRuntime.createAppointmentFromApprovedReview({
    reviewId: "review_appointment_creation",
    expectedReviewVersion: 1,
    idempotencyKey: "same_key",
    confirmation: "create_in_memory_appointment",
  });
  const adapter = createAppointmentReviewRouteRuntimeAdapter({
    resolveControlledActionState,
    initialReviews: [createReview()],
  });

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.equal(firstRuntime.listCreatedAppointments().length, 1);
  assert.equal(secondRuntime.listCreatedAppointments().length, 1);
  assert.equal(typeof adapter.createAppointmentFromApprovedReview, "function");
  assert.equal(typeof adapter.listCreatedAppointments, "function");
  assert.equal(Object.hasOwn(adapter, "appointmentRepository"), false);
  assert.equal(Object.hasOwn(adapter, "idempotencyStore"), false);
  assert.equal(Object.isFrozen(adapter), true);
});

test("appointment creation route validates minimal payload and blocks trusted fields", async () => {
  const calls = [];
  const adapter = Object.freeze({
    createAppointmentFromApprovedReview(input) {
      calls.push(input);
      return {
        accepted: true,
        created: true,
        appointmentCreated: true,
        code: "appointment_review_appointment_created",
        reviewId: input.reviewId,
        appointmentId: "appointment_1",
        appointment: { id: "appointment_1" },
        reviewVersionChanged: true,
        appointmentRepositoryVersionChanged: true,
      };
    },
  });
  const valid = await route.handleAppointmentReviewAppointmentCreationRouteRequest(
    createRequest({
      expectedReviewVersion: 2,
      idempotencyKey: "appointment_creation:route:1",
      confirmation: "create_in_memory_appointment",
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
  const invalid = await route.handleAppointmentReviewAppointmentCreationRouteRequest(
    createRequest({
      expectedReviewVersion: 2,
      idempotencyKey: "appointment_creation:route:1",
      confirmation: "create_in_memory_appointment",
      doctorId: "client_override",
    }),
    createContext(),
    {
      createRouteRuntimeAdapter() {
        invalidFactoryCalls += 1;
        return adapter;
      },
    }
  );
  const method = await route.GET(
    new Request("http://localhost/api/secretary/appointment-reviews/review_appointment_creation/appointment-creation"),
    createContext()
  );

  assert.equal(valid.status, 200);
  assert.equal(validBody.accepted, true);
  assert.deepEqual(calls[0], {
    reviewId: "review_appointment_creation",
    expectedReviewVersion: 2,
    idempotencyKey: "appointment_creation:route:1",
    confirmation: "create_in_memory_appointment",
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalidFactoryCalls, 0);
  assert.equal(method.status, 405);
});

test("appointment creation route contains factory and service failures safely", async () => {
  const factoryFailure =
    await route.handleAppointmentReviewAppointmentCreationRouteRequest(
      createRequest({
        expectedReviewVersion: 2,
        idempotencyKey: "appointment_creation:route:factory_failure",
        confirmation: "create_in_memory_appointment",
      }),
      createContext(),
      {
        createRouteRuntimeAdapter() {
          throw new Error("synthetic adapter factory failure");
        },
      }
    );
  const serviceFailure =
    await route.handleAppointmentReviewAppointmentCreationRouteRequest(
      createRequest({
        expectedReviewVersion: 2,
        idempotencyKey: "appointment_creation:route:service_failure",
        confirmation: "create_in_memory_appointment",
      }),
      createContext(),
      {
        createRouteRuntimeAdapter() {
          return {
            createAppointmentFromApprovedReview() {
              throw new Error("synthetic service failure");
            },
          };
        },
      }
    );
  const factoryFailureBody = await factoryFailure.json();
  const serviceFailureBody = await serviceFailure.json();

  assert.equal(factoryFailure.status, 500);
  assert.equal(factoryFailureBody.appointmentCreated, false);
  assert.equal(factoryFailureBody.databasePersisted, false);
  assert.equal(serviceFailure.status, 500);
  assert.equal(serviceFailureBody.appointmentCreated, false);
  assert.equal(serviceFailureBody.calendarWritten, false);
});

test("default route runtime creates appointment and appointment list exposes it", async () => {
  const approveRoute = require("../app/api/secretary/appointment-reviews/[id]/decision-execution/route");
  const reviewId = "review_route_runtime_demo";
  const approve = await approveRoute.POST(
    new Request(`http://localhost/api/secretary/appointment-reviews/${reviewId}/decision-execution`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        expectedReviewVersion: 1,
        idempotencyKey: "appointment_creation_route_test:approve:1",
        confirmation: "apply_in_memory",
      }),
    }),
    { params: { id: reviewId } }
  );
  const created = await route.POST(
    createRequest({
      expectedReviewVersion: 2,
      idempotencyKey: "appointment_creation_route_test:create:1",
      confirmation: "create_in_memory_appointment",
    }, reviewId),
    { params: { id: reviewId } }
  );
  const replay = await route.POST(
    createRequest({
      expectedReviewVersion: 2,
      idempotencyKey: "appointment_creation_route_test:create:1",
      confirmation: "create_in_memory_appointment",
    }, reviewId),
    { params: { id: reviewId } }
  );
  const duplicate = await route.POST(
    createRequest({
      expectedReviewVersion: 3,
      idempotencyKey: "appointment_creation_route_test:create:2",
      confirmation: "create_in_memory_appointment",
    }, reviewId),
    { params: { id: reviewId } }
  );
  const list = await appointmentsRoute.GET(
    new Request("http://localhost/api/secretary/appointments")
  );
  const createdBody = await created.json();
  const replayBody = await replay.json();
  const duplicateBody = await duplicate.json();
  const listBody = await list.json();

  assert.equal(approve.status, 200);
  assert.equal(created.status, 200);
  assert.equal(createdBody.appointmentId, "appointment_1");
  assert.equal(createdBody.resultingReviewVersion, 3);
  assert.equal(replay.status, 200);
  assert.equal(replayBody.matchingReplay, true);
  assert.equal(replayBody.created, false);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicateBody.code, "appointment_already_created_for_review");
  assert.equal(list.status, 200);
  assert.equal(listBody.count, 1);
  assert.equal(listBody.appointments[0].id, "appointment_1");
});

test("appointment creation production files avoid prohibited integrations", () => {
  const files = [
    "src/api/secretaryAppointmentReviewAppointmentCreationService.js",
    "src/secretary/appointmentReviewAppointmentRepository.js",
    "src/secretary/appointmentReviewAppointmentCreationReceipt.js",
    "app/api/secretary/appointment-reviews/[id]/appointment-creation/route.js",
    "app/api/secretary/appointments/route.js",
  ];
  const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  const forbidden = new RegExp(
    [
      "create" + "CalendarEvent\\(",
      "get" + "CalendarProvider\\(",
      "manual" + "AppointmentCalendarSync",
      "google" + "apis",
      "prisma",
      "supabase",
      "redis",
      "process\\.env",
      "commandBus",
      "eventBus",
      "jobQueue",
      "globalThis",
      "new Date",
      "Math\\.random",
    ].join("|"),
    "i"
  );

  assert.doesNotMatch(source, forbidden);
});

function createRequest(payload, reviewId = "review_appointment_creation") {
  return new Request(
    `http://localhost/api/secretary/appointment-reviews/${reviewId}/appointment-creation`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

function createContext(id = "review_appointment_creation") {
  return {
    params: { id },
  };
}

function resolveControlledActionState(input) {
  return String(input?.review?.metadata?.controlledActionState || "").trim();
}
