const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  createInMemoryAppointmentReviewRepository,
} = require("../src/secretary/appointmentReviewRepository");
const {
  createInMemoryAppointmentReviewExecutionIdempotencyStore,
} = require("../src/secretary/appointmentReviewExecutionIdempotencyStore");
const {
  createHybridAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewHybridControlledActionDependencies");
const {
  applyAppointmentReviewDecision,
} = require("../src/api/secretaryAppointmentReviewDecisionExecutionService");
const {
  createInMemoryMockAppointmentReviewServerRuntime,
} = require("../src/secretary/appointmentReviewInMemoryMockServerRuntime");
const {
  createAppointmentReviewRouteRuntimeAdapter,
} = require("../src/secretary/appointmentReviewRouteRuntimeAdapter");

function createReview({
  id = "review_execution",
  state = "validation_only_intent_checked",
} = {}) {
  return {
    id,
    status: "pending_secretary_review",
    source: "mock",
    selectedSlot: {
      id: `${id}_slot`,
      source: "mock",
    },
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
    metadata: {
      controlledActionState: state,
    },
  };
}

function resolveControlledActionState(input) {
  return String(input?.review?.metadata?.controlledActionState || "").trim();
}

function createServiceHarness(review = createReview()) {
  const repository = createInMemoryAppointmentReviewRepository({
    initialReviews: [review],
  });
  const dependencies = createHybridAppointmentReviewControlledActionDependencies({
    repository,
    resolveControlledActionState,
  });
  const idempotencyStore =
    createInMemoryAppointmentReviewExecutionIdempotencyStore();
  let mutationCalls = 0;

  return {
    repository,
    dependencies,
    idempotencyStore,
    applyReviewControlledActionStateTransition(input) {
      mutationCalls += 1;
      return repository.applyReviewControlledActionStateTransition(input);
    },
    getMutationCalls() {
      return mutationCalls;
    },
  };
}

function createExecutionInput(harness, overrides = {}) {
  return {
    reviewId: "review_execution",
    action: "approve",
    expectedReviewVersion: 1,
    idempotencyKey: "decision_execution:review_execution:approve:1",
    confirmation: "apply_in_memory",
    dependencies: harness.dependencies,
    idempotencyStore: harness.idempotencyStore,
    applyReviewControlledActionStateTransition:
      harness.applyReviewControlledActionStateTransition,
    ...overrides,
  };
}

function assertExecutionSafety(result) {
  assert.equal(result.decisionExecution, true);
  assert.equal(result.validationOnly, false);
  assert.equal(result.controlledHandlingOnly, true);
  assert.equal(result.executionMode, "in_memory_demo");
  assert.equal(result.storage, "in_memory");
  assert.equal(result.durablePersistence, false);
  assert.equal(result.receiptPersisted, false);
  assert.equal(result.bookingCreated, false);
  assert.equal(result.calendarChecked, false);
  assert.equal(result.appointmentCreated, false);
  assert.equal(result.calendarEventCreated, false);
  assert.equal(result.calendarWritten, false);
  assert.equal(result.messageSent, false);
  assert.equal(result.emailSent, false);
  assert.equal(result.whatsappSent, false);
  assert.equal(result.databasePersisted, false);
  assert.equal(result.externalCallPerformed, false);
}

test("repository applies controlled action state transition atomically once", () => {
  const repository = createInMemoryAppointmentReviewRepository({
    initialReviews: [createReview()],
  });
  const before = repository.getVersionedSnapshotById("review_execution");
  const result = repository.applyReviewControlledActionStateTransition({
    reviewId: "review_execution",
    expectedState: "validation_only_intent_checked",
    expectedVersion: 1,
    nextState: "needs_clinic_review",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.reviewStateChanged, true);
  assert.equal(result.previousReviewVersion, 1);
  assert.equal(result.nextReviewVersion, 2);
  assert.equal(result.reviewSnapshot.version, 2);
  assert.equal(
    result.reviewSnapshot.review.metadata.controlledActionState,
    "needs_clinic_review"
  );
  assert.equal(before.version, 1);
  assert.equal(
    before.review.metadata.controlledActionState,
    "validation_only_intent_checked"
  );
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.reviewSnapshot.review), true);
});

test("repository rejects version and state conflicts without mutation", () => {
  const repository = createInMemoryAppointmentReviewRepository({
    initialReviews: [createReview()],
  });
  const stale = repository.applyReviewControlledActionStateTransition({
    reviewId: "review_execution",
    expectedState: "validation_only_intent_checked",
    expectedVersion: 2,
    nextState: "needs_clinic_review",
  });
  const stateConflict = repository.applyReviewControlledActionStateTransition({
    reviewId: "review_execution",
    expectedState: "needs_clinic_review",
    expectedVersion: 1,
    nextState: "action_intent_rejected",
  });
  const snapshot = repository.getVersionedSnapshotById("review_execution");

  assert.equal(stale.status, "conflict");
  assert.equal(stale.error.code, "review_version_conflict");
  assert.equal(stateConflict.status, "conflict");
  assert.equal(stateConflict.error.code, "review_state_conflict");
  assert.equal(snapshot.version, 1);
  assert.equal(
    snapshot.review.metadata.controlledActionState,
    "validation_only_intent_checked"
  );
});

test("execution service applies approve and reject decisions with safe receipts", async () => {
  const approveHarness = createServiceHarness();
  const approve = await applyAppointmentReviewDecision(
    createExecutionInput(approveHarness)
  );
  const rejectHarness = createServiceHarness();
  const reject = await applyAppointmentReviewDecision(
    createExecutionInput(rejectHarness, {
      action: "reject",
      idempotencyKey: "decision_execution:review_execution:reject:1",
    })
  );

  assert.equal(approve.accepted, true);
  assert.equal(approve.applied, true);
  assert.equal(approve.resultingState, "needs_clinic_review");
  assert.equal(approve.resultingReviewVersion, 2);
  assert.equal(approve.receipt.receiptKind, "appointment_review_decision_execution_receipt_v1");
  assert.equal(reject.accepted, true);
  assert.equal(reject.resultingState, "action_intent_rejected");
  assert.equal(reject.resultingReviewVersion, 2);
  assert.equal(approveHarness.getMutationCalls(), 1);
  assert.equal(rejectHarness.getMutationCalls(), 1);
  assertExecutionSafety(approve);
  assertExecutionSafety(approve.receipt);
  assertExecutionSafety(reject);
});

test("execution service ignores fabricated prior client preview fields", async () => {
  const harness = createServiceHarness();
  const result = await applyAppointmentReviewDecision(
    createExecutionInput(harness, {
      previewPassed: true,
      projectedNextState: "action_intent_rejected",
      validationResult: { accepted: true },
      comparisonResult: { accepted: true },
    })
  );

  assert.equal(result.accepted, true);
  assert.equal(result.resultingState, "needs_clinic_review");
  assert.equal(harness.getMutationCalls(), 1);
});

test("execution service rejects stale expected version before mutation", async () => {
  const harness = createServiceHarness();
  const result = await applyAppointmentReviewDecision(
    createExecutionInput(harness, {
      expectedReviewVersion: 2,
      idempotencyKey: "decision_execution:review_execution:approve:2",
    })
  );
  const snapshot = harness.repository.getVersionedSnapshotById("review_execution");

  assert.equal(result.accepted, false);
  assert.equal(result.code, "review_version_conflict");
  assert.equal(result.conflict, true);
  assert.equal(harness.getMutationCalls(), 0);
  assert.equal(snapshot.version, 1);
  assertExecutionSafety(result);
});

test("execution idempotency returns matching replay without second mutation", async () => {
  const harness = createServiceHarness();
  const input = createExecutionInput(harness);
  const first = await applyAppointmentReviewDecision(input);
  const replay = await applyAppointmentReviewDecision(input);
  const snapshot = harness.repository.getVersionedSnapshotById("review_execution");

  assert.equal(first.accepted, true);
  assert.equal(replay.accepted, true);
  assert.equal(replay.matchingReplay, true);
  assert.equal(replay.applied, false);
  assert.equal(harness.getMutationCalls(), 1);
  assert.equal(snapshot.version, 2);
  assert.equal(replay.receipt.matchingReplay, true);
  assertExecutionSafety(replay);
});

test("execution idempotency rejects conflicting replay without leaking command internals", async () => {
  const harness = createServiceHarness();

  await applyAppointmentReviewDecision(createExecutionInput(harness));

  const conflict = await applyAppointmentReviewDecision(
    createExecutionInput(harness, {
      action: "reject",
      idempotencyKey: "decision_execution:review_execution:approve:1",
    })
  );
  const serialized = JSON.stringify(conflict);

  assert.equal(conflict.accepted, false);
  assert.equal(conflict.code, "idempotency_key_conflict");
  assert.equal(conflict.conflict, true);
  assert.equal(harness.getMutationCalls(), 1);
  assert.doesNotMatch(serialized, /requestFingerprint|commandEnvelope|policyDecision/);
  assertExecutionSafety(conflict);
});

test("isolated server runtimes isolate repository and idempotency state", async () => {
  const firstRuntime = createInMemoryMockAppointmentReviewServerRuntime({
    resolveControlledActionState,
    initialReviews: [createReview()],
  });
  const secondRuntime = createInMemoryMockAppointmentReviewServerRuntime({
    resolveControlledActionState,
    initialReviews: [createReview()],
  });
  const first = await firstRuntime.applyAppointmentReviewDecision({
    reviewId: "review_execution",
    action: "approve",
    expectedReviewVersion: 1,
    idempotencyKey: "same_key",
    confirmation: "apply_in_memory",
  });
  const second = await secondRuntime.applyAppointmentReviewDecision({
    reviewId: "review_execution",
    action: "approve",
    expectedReviewVersion: 1,
    idempotencyKey: "same_key",
    confirmation: "apply_in_memory",
  });

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.equal(first.matchingReplay, false);
  assert.equal(second.matchingReplay, false);
  assert.equal(firstRuntime.getAppointmentReviewQueue().getAppointmentReviewById(
    "review_execution"
  ).metadata.controlledActionState, "needs_clinic_review");
  assert.equal(secondRuntime.getAppointmentReviewQueue().getAppointmentReviewById(
    "review_execution"
  ).metadata.controlledActionState, "needs_clinic_review");
});

test("route runtime adapter exposes one narrow execution capability", () => {
  const adapter = createAppointmentReviewRouteRuntimeAdapter({
    resolveControlledActionState,
    initialReviews: [createReview()],
  });

  assert.equal(typeof adapter.applyAppointmentReviewDecision, "function");
  assert.equal(Object.hasOwn(adapter, "repository"), false);
  assert.equal(Object.hasOwn(adapter, "idempotencyStore"), false);
  assert.equal(Object.hasOwn(adapter, "executor"), false);
  assert.equal(Object.isFrozen(adapter), true);
});

test("execution production files avoid prohibited side effects and global stores", () => {
  const files = [
    "src/api/secretaryAppointmentReviewDecisionExecutionService.js",
    "src/secretary/appointmentReviewRouteRuntimeCompositionRoot.js",
    "src/secretary/appointmentReviewExecutionIdempotencyStore.js",
    "src/secretary/appointmentReviewDecisionExecutionReceipt.js",
    "app/api/secretary/appointment-reviews/[id]/decision-execution/route.js",
  ];
  const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

  const forbiddenSideEffectPattern = new RegExp(
    [
      "create" + "Appointment\\(",
      "create" + "CalendarEvent\\(",
      "google" + "apis",
    ].join("|")
  );

  assert.doesNotMatch(source, forbiddenSideEffectPattern);
  assert.doesNotMatch(source, /prisma|supabase|redis|process\.env|localStorage/);
  assert.doesNotMatch(source, /sendEmail|sendWhatsapp|notification|job queue/i);
  assert.doesNotMatch(source, /globalThis|module-level mutable|new Date|Math\.random/);
});
