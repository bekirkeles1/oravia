const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  createAppointmentSelectionReply,
  createPendingAppointmentFlowState,
} = require("../src/messaging/appointmentFlowState");
const { generateSlotProposals } = require("../src/messaging/slotProposal");
const {
  createAppointmentReviewItem,
} = require("../src/secretary/appointmentReviewQueue");
const {
  createInMemoryAppointmentReviewRepository,
} = require("../src/secretary/appointmentReviewRepository");
const {
  createHybridAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewHybridControlledActionDependencies");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");
const {
  handleAppointmentReviewControlledActionValidation,
} = require("../src/api/secretaryAppointmentReviewControlledActionValidationHandler");
const {
  handleAppointmentReviewControlledActionValidationReceipt,
} = require("../src/api/secretaryAppointmentReviewControlledActionValidationReceiptHandler");

function createSampleAppointmentSelectionReview() {
  const flowState = createPendingAppointmentFlowState(
    generateSlotProposals({
      message: "İmplant için çarşamba günü slot var mı?",
      maxSlots: 3,
    })
  );

  return createAppointmentSelectionReply(flowState, "10:30 olur")
    .appointmentSelectionReview;
}

function createSampleReviewRecord(metadata = {}) {
  return createAppointmentReviewItem(createSampleAppointmentSelectionReview(), {
    conversationKey: metadata.conversationKey || "whatsapp:+905322223333",
  }).review;
}

function createRepositoryWithReview(review = createSampleReviewRecord()) {
  const repository = createInMemoryAppointmentReviewRepository();
  const addResult = repository.add(review);

  assert.equal(addResult.status, "ok");

  return {
    repository,
    review: addResult.review,
  };
}

function createHybrid({
  repository = createRepositoryWithReview().repository,
  resolveControlledActionState = () => "validation_only_intent_checked",
} = {}) {
  return createHybridAppointmentReviewControlledActionDependencies({
    repository,
    resolveControlledActionState,
  });
}

function createValidationInput({
  reviewId,
  dependencies,
  actionIntent = "approve_intent",
  expectedReviewVersion = 1,
  requestId = "request_hybrid_dependencies",
  idempotencyKey = "hybrid_dependencies:approve",
  bodyOverrides = {},
}) {
  return {
    method: "POST",
    reviewId,
    body: {
      actionIntent,
      requestId,
      idempotencyKey,
      expectedReviewVersion,
      ...bodyOverrides,
    },
    dependencies,
  };
}

function assertSafetyFields(result) {
  assert.equal(result.validationOnly, true);
  assert.equal(result.controlledHandlingOnly, true);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.executorAvailable, false);
  assert.equal(result.executionAvailable, false);
  assert.equal(result.executionRequested, false);
  assert.equal(result.actionPerformed, false);
  assert.equal(result.commandDispatched, false);
  assert.equal(result.commandPersisted, false);
  assert.equal(result.bookingCreated, false);
  assert.equal(result.calendarChecked, false);
  assert.equal(result.appointmentCreated, false);
  assert.equal(result.calendarEventCreated, false);
  assert.equal(result.databasePersisted, false);
  assert.equal(result.persistence, "not_persisted");
}

function assertNoSensitiveReviewData(value) {
  const serialized = JSON.stringify(value);

  assert.doesNotMatch(serialized, /selectedSlot|doctorName|durationMinutes/);
  assert.doesNotMatch(serialized, /implant|10:30|Ayşe|905322223333/);
  assert.doesNotMatch(serialized, /repositoryType|snapshotType|databasePersisted":true/);
}

test("hybrid dependency factory validates dependencies and returns exact frozen shape", () => {
  const { repository } = createRepositoryWithReview();
  const options = {
    repository,
    resolveControlledActionState() {
      return "validation_only_intent_checked";
    },
  };
  const beforeOptions = JSON.stringify(Object.keys(options));
  const dependencies = createHybridAppointmentReviewControlledActionDependencies(
    options
  );

  assert.deepEqual(Object.keys(dependencies), [
    "resolveVerifiedActorContext",
    "resolveAppointmentReviewContext",
    "resolveIdempotencyContext",
    "resolveExecutionPolicyContext",
  ]);
  assert.equal(Object.isFrozen(dependencies), true);
  assert.equal(Object.hasOwn(dependencies, "repository"), false);
  assert.equal(Object.hasOwn(dependencies, "resolveControlledActionState"), false);
  dependencies.resolveAppointmentReviewContext = null;
  assert.equal(typeof dependencies.resolveAppointmentReviewContext, "function");
  assert.equal(JSON.stringify(Object.keys(options)), beforeOptions);
  assert.throws(
    () => createHybridAppointmentReviewControlledActionDependencies(),
    (error) => error.code === "invalid_factory_options"
  );
  assert.throws(
    () =>
      createHybridAppointmentReviewControlledActionDependencies({
        repository: {},
        resolveControlledActionState() {},
      }),
    (error) => error.code === "missing_versioned_snapshot_capability"
  );
  assert.throws(
    () => createHybridAppointmentReviewControlledActionDependencies({ repository }),
    (error) => error.code === "missing_controlled_action_state_projection"
  );
  assert.throws(
    () =>
      createHybridAppointmentReviewControlledActionDependencies({
        repository,
        resolveControlledActionState: "not-a-function",
      }),
    (error) => error.code === "missing_controlled_action_state_projection"
  );
});

test("hybrid dependencies reuse Sprint 12K mock actor idempotency and policy behavior", () => {
  const dependencies = createHybrid();
  const approveActor = dependencies.resolveVerifiedActorContext({
    actionIntent: "approve_intent",
  });
  const rejectActor = dependencies.resolveVerifiedActorContext({
    actionIntent: "reject_intent",
  });
  const unsupportedActor = dependencies.resolveVerifiedActorContext({
    actionIntent: "reschedule_intent",
  });
  const idempotencyContext = dependencies.resolveIdempotencyContext();
  const policyContext = dependencies.resolveExecutionPolicyContext();

  assert.equal(approveActor.actorId, "secretary-mock");
  assert.equal(approveActor.role, "secretary");
  assert.equal(approveActor.authenticationVerified, true);
  assert.equal(approveActor.authorizationVerified, true);
  assert.deepEqual(approveActor.permissions, ["appointment_review:approve"]);
  assert.deepEqual(rejectActor.permissions, ["appointment_review:reject"]);
  assert.deepEqual(unsupportedActor.permissions, []);
  assert.equal(idempotencyContext.priorIdempotencyObservation, null);
  assert.equal(policyContext.executionEnabled, false);
  assert.deepEqual(policyContext.allowedActionIntents, [
    "approve_intent",
    "reject_intent",
  ]);
  assert.deepEqual(policyContext.allowedCurrentStates, [
    "validation_only_intent_checked",
  ]);

  const mockDependencies = createMockAppointmentReviewControlledActionDependencies();
  assert.deepEqual(
    dependencies.resolveVerifiedActorContext({ actionIntent: "approve_intent" }),
    mockDependencies.resolveVerifiedActorContext({
      actionIntent: "approve_intent",
    })
  );
  assert.deepEqual(
    dependencies.resolveIdempotencyContext(),
    mockDependencies.resolveIdempotencyContext()
  );
  assert.deepEqual(
    dependencies.resolveExecutionPolicyContext(),
    mockDependencies.resolveExecutionPolicyContext()
  );
});

test("hybrid review context is repository-backed and projection-controlled", async () => {
  const { repository, review } = createRepositoryWithReview({
    ...createSampleReviewRecord(),
    id: "review_hybrid_context",
  });
  let projectionInput;
  const dependencies = createHybrid({
    repository,
    resolveControlledActionState(input) {
      projectionInput = input;
      input.review.selectedSlot.time = "mutated-projection";
      return "validation_only_intent_checked";
    },
  });
  const context = await dependencies.resolveAppointmentReviewContext({
    reviewId: review.id,
  });

  assert.deepEqual(context, {
    contextType: "appointment_review_snapshot_context_v1",
    contextSource: "server_review_boundary",
    reviewId: review.id,
    currentState: "validation_only_intent_checked",
    observedReviewVersion: 1,
  });
  assert.equal(projectionInput.reviewId, review.id);
  assert.equal(projectionInput.repositoryVersion, 1);
  assert.equal(Object.hasOwn(projectionInput, "repository"), false);
  assert.equal(repository.getById(review.id).selectedSlot.time, "10:30");
  assertNoSensitiveReviewData(context);

  await assert.rejects(
    () =>
      dependencies.resolveAppointmentReviewContext({
        reviewId: review.id,
        observedReviewVersion: 99,
      }),
    (error) => error.code === "client_trusted_context_injection"
  );
  await assert.rejects(
    () =>
      dependencies.resolveAppointmentReviewContext({
        reviewId: review.id,
        currentState: "needs_clinic_review",
      }),
    (error) => error.code === "client_trusted_context_injection"
  );
});

test("hybrid dependencies do not fabricate unknown reviews", async () => {
  const { repository } = createRepositoryWithReview();
  let projectionCalls = 0;
  const dependencies = createHybrid({
    repository,
    resolveControlledActionState() {
      projectionCalls += 1;
      return "validation_only_intent_checked";
    },
  });

  await assert.rejects(
    () => dependencies.resolveAppointmentReviewContext({ reviewId: "review_missing" }),
    (error) => error.code === "appointment_review_snapshot_not_found"
  );
  assert.equal(projectionCalls, 0);
});

test("Sprint 12J accepts hybrid dependencies for approve and reject", async () => {
  const { repository, review } = createRepositoryWithReview({
    ...createSampleReviewRecord(),
    id: "review_hybrid_handler",
  });
  const dependencies = createHybrid({ repository });
  const approveResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      actionIntent: "approve_intent",
      idempotencyKey: "hybrid_dependencies:approve",
    })
  );
  const rejectResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      actionIntent: "reject_intent",
      idempotencyKey: "hybrid_dependencies:reject",
    })
  );

  for (const result of [approveResult, rejectResult]) {
    assert.equal(result.accepted, true);
    assert.equal(result.handlerCompleted, true);
    assert.equal(result.failedStage, null);
    assert.equal(result.assemblyResult.pipelineInput.observedReviewVersion, 1);
    assert.equal(
      result.assemblyResult.pipelineInput.preconditionsInput.currentState,
      "validation_only_intent_checked"
    );
    assert.equal(result.eligibleForExecutorBoundary, true);
    assertSafetyFields(result);
    assertNoSensitiveReviewData(result.assemblyResult.pipelineInput.preconditionsInput);
  }

  assert.equal(
    approveResult.pipelineResult.commandEnvelope.actor.requiredPermission,
    "appointment_review:approve"
  );
  assert.equal(
    rejectResult.pipelineResult.commandEnvelope.actor.requiredPermission,
    "appointment_review:reject"
  );
  assert.equal(repository.getVersionedSnapshotById(review.id).version, 1);
});

test("Sprint 12J hybrid missing review stops later dependency stages", async () => {
  const { repository } = createRepositoryWithReview();
  const dependencies = createHybrid({ repository });
  const result = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: "review_missing",
      dependencies,
      idempotencyKey: "hybrid_dependencies:missing",
    })
  );

  assert.equal(result.accepted, false);
  assert.equal(result.handlerCompleted, false);
  assert.equal(result.failedStage, "appointment_review_context");
  assert.equal(result.code, "appointment_review_context_resolution_failed");
  assert.equal(Object.hasOwn(result, "assemblyResult"), false);
  assert.equal(Object.hasOwn(result, "pipelineResult"), false);
  assertSafetyFields(result);
});

test("Sprint 12J hybrid version mismatch uses repository version unchanged", async () => {
  const { repository, review } = createRepositoryWithReview();
  const dependencies = createHybrid({ repository });
  const beforeSnapshot = repository.getVersionedSnapshotById(review.id);
  const result = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      expectedReviewVersion: 2,
      idempotencyKey: "hybrid_dependencies:version_mismatch",
    })
  );
  const afterSnapshot = repository.getVersionedSnapshotById(review.id);

  assert.equal(result.accepted, false);
  assert.equal(result.failedStage, "validation_pipeline");
  assert.equal(result.stageCode, "idempotency_guard_stage_rejected");
  assert.equal(result.pipelineResult.stages.idempotencyAndVersionGuard.status, "rejected");
  assert.equal(result.assemblyResult.pipelineInput.observedReviewVersion, 1);
  assert.equal(result.assemblyResult.pipelineInput.expectedReviewVersion, 2);
  assert.equal(afterSnapshot.version, 1);
  assert.deepEqual(afterSnapshot, beforeSnapshot);
  assertSafetyFields(result);
});

test("Sprint 12J hybrid incompatible projected state is not repaired", async () => {
  const { repository, review } = createRepositoryWithReview();
  const dependencies = createHybrid({
    repository,
    resolveControlledActionState() {
      return "needs_clinic_review";
    },
  });
  const result = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      idempotencyKey: "hybrid_dependencies:incompatible_state",
    })
  );

  assert.equal(result.accepted, false);
  assert.equal(result.failedStage, "validation_pipeline");
  assert.equal(result.stageCode, "preconditions_stage_rejected");
  assert.equal(
    result.assemblyResult.pipelineInput.preconditionsInput.currentState,
    "needs_clinic_review"
  );
  assertSafetyFields(result);
});

test("Sprint 12J still rejects client trusted context injection with hybrid dependencies", async () => {
  const { repository, review } = createRepositoryWithReview();
  const dependencies = createHybrid({ repository });
  const result = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      bodyOverrides: {
        observedReviewVersion: 99,
        currentState: "needs_clinic_review",
      },
    })
  );

  assert.equal(result.accepted, false);
  assert.equal(result.code, "client_trusted_context_injection");
  assert.equal(result.failedStage, null);
  assertSafetyFields(result);
});

test("Sprint 12O receipt handler accepts hybrid dependencies", async () => {
  const { repository, review } = createRepositoryWithReview({
    ...createSampleReviewRecord(),
    id: "review_hybrid_receipt",
  });
  const dependencies = createHybrid({ repository });
  const validReceipt = await handleAppointmentReviewControlledActionValidationReceipt(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      idempotencyKey: "hybrid_receipt:valid",
    })
  );
  const missingReceipt = await handleAppointmentReviewControlledActionValidationReceipt(
    createValidationInput({
      reviewId: "review_missing",
      dependencies,
      idempotencyKey: "hybrid_receipt:missing",
    })
  );
  const mismatchReceipt = await handleAppointmentReviewControlledActionValidationReceipt(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      expectedReviewVersion: 2,
      idempotencyKey: "hybrid_receipt:version_mismatch",
    })
  );

  assert.equal(validReceipt.accepted, true);
  assert.equal(validReceipt.receiptOutcome, "validation_passed");
  assert.equal(validReceipt.receiptPersisted, false);
  assert.equal(missingReceipt.accepted, true);
  assert.equal(missingReceipt.receiptOutcome, "validation_rejected");
  assert.equal(missingReceipt.receiptPersisted, false);
  assert.equal(mismatchReceipt.accepted, true);
  assert.equal(mismatchReceipt.receiptOutcome, "validation_rejected");
  assert.equal(mismatchReceipt.receiptPersisted, false);
  assertNoSensitiveReviewData(validReceipt.validationReceipt);
  assertNoSensitiveReviewData(missingReceipt.validationReceipt);
  assertNoSensitiveReviewData(mismatchReceipt.validationReceipt);
});

test("hybrid dependency bundles remain isolated and immutable", async () => {
  const first = createRepositoryWithReview(
    createSampleReviewRecord({ conversationKey: "whatsapp:+905322223333" })
  );
  const second = createRepositoryWithReview(
    createSampleReviewRecord({ conversationKey: "whatsapp:+905551112233" })
  );
  const firstBundle = createHybrid({ repository: first.repository });
  const secondBundle = createHybrid({ repository: second.repository });

  firstBundle.resolveVerifiedActorContext = null;

  assert.equal(typeof firstBundle.resolveVerifiedActorContext, "function");
  assert.equal(typeof secondBundle.resolveVerifiedActorContext, "function");
  assert.equal(
    (await firstBundle.resolveAppointmentReviewContext({ reviewId: first.review.id }))
      .reviewId,
    first.review.id
  );
  await assert.rejects(
    () => secondBundle.resolveAppointmentReviewContext({ reviewId: first.review.id }),
    (error) => error.code === "appointment_review_snapshot_not_found"
  );
  assert.deepEqual(
    firstBundle.resolveIdempotencyContext(),
    secondBundle.resolveIdempotencyContext()
  );
});

test("hybrid dependency calls are deterministic for unchanged repository data", async () => {
  const { repository, review } = createRepositoryWithReview();
  const dependencies = createHybrid({ repository });
  const first = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      idempotencyKey: "hybrid_dependencies:deterministic",
    })
  );
  const second = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      idempotencyKey: "hybrid_dependencies:deterministic",
    })
  );

  assert.deepEqual(first, second);
});

test("hybrid dependency source has no forbidden side effects", () => {
  const source = fs.readFileSync(
    "src/secretary/appointmentReviewHybridControlledActionDependencies.js",
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /createAppointment\(|createCalendarEvent\(|getCalendarProvider\(|manualAppointmentCalendarSync|googleapis|prisma|supabase|redis|sqlite|postgres|fetch|node:fs|require\("fs"\)|filesystem|dotenv|process\.env|authProvider|authorizationProvider|audit|logger|logging|commandBus|eventBus|jobQueue|executor\(|new Executor|dispatcher|app\/api|app\/components|Date\.now|Math\.random|randomUUID|crypto|console|appointmentReviewQueue/
  );
  assert.doesNotMatch(
    source,
    /executionEnabled:\s*true|executorAvailable:\s*true|executionAvailable:\s*true|executionRequested:\s*true|actionPerformed:\s*true|commandDispatched:\s*true|commandPersisted:\s*true|receiptPersisted:\s*true|bookingCreated:\s*true|calendarChecked:\s*true|appointmentCreated:\s*true|calendarEventCreated:\s*true|databasePersisted:\s*true|reviewFound:\s*true|persisted:\s*true/
  );
});
