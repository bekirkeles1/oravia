const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  createAppointmentSelectionReply,
  createPendingAppointmentFlowState,
} = require("../src/messaging/appointmentFlowState");
const { generateSlotProposals } = require("../src/messaging/slotProposal");
const {
  handleAppointmentReviewControlledActionValidation,
} = require("../src/api/secretaryAppointmentReviewControlledActionValidationHandler");
const {
  handleAppointmentReviewControlledActionValidationReceipt,
} = require("../src/api/secretaryAppointmentReviewControlledActionValidationReceiptHandler");
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
  createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider,
} = require("../src/secretary/appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider");

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

function createSampleReviewRecord(overrides = {}) {
  const item = createAppointmentReviewItem(createSampleAppointmentSelectionReview(), {
    conversationKey: overrides.conversationKey || "whatsapp:+905322223333",
  });

  return {
    ...item.review,
    ...overrides,
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
  };
}

function createRepositoryWithReview(
  review = createSampleReviewRecord({ id: "review_provider_default" })
) {
  const repository = createInMemoryAppointmentReviewRepository();
  const addResult = repository.add(review);

  assert.equal(addResult.status, "ok");

  return {
    repository,
    review: addResult.review,
  };
}

function createProvider({
  repository = createRepositoryWithReview().repository,
  resolveControlledActionState = () => "validation_only_intent_checked",
} = {}) {
  return createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider({
    repository,
    resolveControlledActionState,
  });
}

function createValidationInput({
  reviewId,
  dependencies,
  actionIntent = "approve_intent",
  expectedReviewVersion = 1,
  requestId = "request_runtime_provider",
  idempotencyKey = "runtime_provider:approve",
}) {
  return {
    method: "POST",
    reviewId,
    body: {
      actionIntent,
      requestId,
      idempotencyKey,
      expectedReviewVersion,
    },
    dependencies,
  };
}

function assertProviderMetadata(provider) {
  assert.equal(
    provider.providerType,
    "appointment_review_controlled_action_runtime_dependency_provider_v1"
  );
  assert.equal(provider.schemaVersion, 1);
  assert.equal(provider.runtimeType, "in_memory_mock_validation_only");
  assert.equal(provider.runtimeSource, "server_runtime_boundary");
  assert.equal(provider.mock, true);
  assert.equal(provider.inMemory, true);
  assert.equal(provider.validationOnly, true);
  assert.equal(provider.controlledHandlingOnly, true);
  assert.equal(provider.persistence, "not_persisted");
  assert.equal(provider.databasePersisted, false);
  assert.equal(provider.executionEnabled, false);
  assert.equal(provider.executorAvailable, false);
  assert.equal(provider.executionAvailable, false);
  assert.equal(typeof provider.getControlledActionDependencies, "function");
}

function assertHandlerSafetyFields(result) {
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

function assertReceiptSafetyFields(result) {
  assertHandlerSafetyFields(result);
  assert.equal(result.receiptPersisted, false);
}

function assertNoSensitiveReviewData(value) {
  const serialized = JSON.stringify(value);

  assert.doesNotMatch(serialized, /selectedSlot|doctorName|durationMinutes/);
  assert.doesNotMatch(serialized, /implant|10:30|Ayşe|905322223333/);
  assert.doesNotMatch(serialized, /repositoryType|snapshotType|databasePersisted":true/);
}

function assertExactDependencyBundle(dependencies) {
  assert.deepEqual(Object.keys(dependencies), [
    "resolveVerifiedActorContext",
    "resolveAppointmentReviewContext",
    "resolveIdempotencyContext",
    "resolveExecutionPolicyContext",
  ]);
  assert.equal(Object.isFrozen(dependencies), true);

  for (const dependencyName of Object.keys(dependencies)) {
    assert.equal(typeof dependencies[dependencyName], "function");
  }

  assert.equal(Object.hasOwn(dependencies, "repository"), false);
  assert.equal(Object.hasOwn(dependencies, "resolveControlledActionState"), false);
  assert.equal(Object.hasOwn(dependencies, "options"), false);
  assert.equal(Object.hasOwn(dependencies, "mockDependencies"), false);
  assert.equal(Object.hasOwn(dependencies, "queue"), false);
}

test("runtime provider factory validates dependencies and exposes fixed frozen metadata", () => {
  const { repository } = createRepositoryWithReview();
  const options = Object.freeze({
    repository,
    resolveControlledActionState() {
      return "validation_only_intent_checked";
    },
    runtimeType: "production",
    productionReady: true,
  });
  const provider = createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider(
    options
  );

  assertProviderMetadata(provider);
  assert.deepEqual(Object.keys(provider), [
    "providerType",
    "schemaVersion",
    "runtimeType",
    "runtimeSource",
    "mock",
    "inMemory",
    "validationOnly",
    "controlledHandlingOnly",
    "persistence",
    "databasePersisted",
    "executionEnabled",
    "executorAvailable",
    "executionAvailable",
    "getControlledActionDependencies",
  ]);
  assert.equal(Object.isFrozen(provider), true);
  assert.equal(Object.hasOwn(provider, "repository"), false);
  assert.equal(Object.hasOwn(provider, "resolveControlledActionState"), false);
  assert.equal(Object.hasOwn(provider, "queue"), false);
  assert.equal(Object.hasOwn(provider, "options"), false);
  assert.equal(Object.hasOwn(provider, "productionReady"), false);
  assert.equal(Object.hasOwn(provider, "authenticated"), false);
  assert.equal(Object.hasOwn(provider, "authorized"), false);

  provider.runtimeType = "production";
  provider.mock = false;
  provider.persistence = "database";
  provider.getControlledActionDependencies = null;
  provider.productionReady = true;
  provider.executionEnabled = true;

  assertProviderMetadata(provider);
  assert.equal(Object.hasOwn(provider, "productionReady"), false);
});

test("runtime provider factory rejects malformed required dependencies safely", () => {
  const { repository } = createRepositoryWithReview();

  assert.throws(
    () =>
      createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider(),
    (error) => error.code === "invalid_factory_options"
  );
  assert.throws(
    () =>
      createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider({
        resolveControlledActionState() {},
      }),
    (error) => error.code === "invalid_appointment_review_repository"
  );
  assert.throws(
    () =>
      createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider({
        repository: {},
        resolveControlledActionState() {},
      }),
    (error) => error.code === "missing_versioned_snapshot_capability"
  );
  assert.throws(
    () =>
      createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider({
        repository,
      }),
    (error) => error.code === "missing_controlled_action_state_projection"
  );
  assert.throws(
    () =>
      createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider({
        repository,
        resolveControlledActionState: "not-a-function",
      }),
    (error) => error.code === "missing_controlled_action_state_projection"
  );
});

test("runtime provider creates the hybrid dependency bundle once per provider", () => {
  const providerPath = require.resolve(
    "../src/secretary/appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider"
  );
  const hybridPath = require.resolve(
    "../src/secretary/appointmentReviewHybridControlledActionDependencies"
  );
  const originalProviderCache = require.cache[providerPath];
  const originalHybridCache = require.cache[hybridPath];
  let hybridFactoryCalls = 0;
  const fakeBundle = Object.freeze({
    resolveVerifiedActorContext() {},
    resolveAppointmentReviewContext() {},
    resolveIdempotencyContext() {},
    resolveExecutionPolicyContext() {},
  });

  delete require.cache[providerPath];
  require.cache[hybridPath] = {
    id: hybridPath,
    filename: hybridPath,
    loaded: true,
    exports: {
      createHybridAppointmentReviewControlledActionDependencies(options) {
        hybridFactoryCalls += 1;
        assert.equal(options.repository, "repository_dependency");
        assert.equal(options.resolveControlledActionState, "state_projection");
        return fakeBundle;
      },
    },
  };

  try {
    const {
      createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider:
        createRuntimeProvider,
    } = require(providerPath);
    const provider = createRuntimeProvider({
      repository: "repository_dependency",
      resolveControlledActionState: "state_projection",
    });

    assert.equal(hybridFactoryCalls, 1);
    assert.equal(provider.getControlledActionDependencies(), fakeBundle);
    assert.equal(provider.getControlledActionDependencies(), fakeBundle);
    assert.equal(hybridFactoryCalls, 1);
  } finally {
    delete require.cache[providerPath];

    if (originalProviderCache) {
      require.cache[providerPath] = originalProviderCache;
    }

    if (originalHybridCache) {
      require.cache[hybridPath] = originalHybridCache;
    } else {
      delete require.cache[hybridPath];
    }
  }
});

test("runtime provider method returns the same exact safe frozen dependency bundle", () => {
  const provider = createProvider();
  const firstDependencies = provider.getControlledActionDependencies();
  const secondDependencies = provider.getControlledActionDependencies();

  assert.equal(firstDependencies, secondDependencies);
  assertExactDependencyBundle(firstDependencies);

  firstDependencies.resolveAppointmentReviewContext = null;
  firstDependencies.repository = {};

  assert.equal(firstDependencies, secondDependencies);
  assert.equal(typeof secondDependencies.resolveAppointmentReviewContext, "function");
  assert.equal(Object.hasOwn(secondDependencies, "repository"), false);
});

test("runtime provider does not read records or project state during construction", async () => {
  const backingRepository = createInMemoryAppointmentReviewRepository();
  const repositoryCalls = [];
  const repository = Object.freeze({
    getVersionedSnapshotById(reviewId) {
      repositoryCalls.push(["getVersionedSnapshotById", reviewId]);
      return backingRepository.getVersionedSnapshotById(reviewId);
    },
  });
  let projectionCalls = 0;
  const provider = createProvider({
    repository,
    resolveControlledActionState() {
      projectionCalls += 1;
      return "validation_only_intent_checked";
    },
  });

  assert.deepEqual(repositoryCalls, []);
  assert.equal(projectionCalls, 0);

  const addResult = backingRepository.add(
    createSampleReviewRecord({ id: "review_provider_late_add" })
  );

  assert.equal(addResult.status, "ok");

  const context = await provider
    .getControlledActionDependencies()
    .resolveAppointmentReviewContext({
      reviewId: addResult.review.id,
    });

  assert.deepEqual(repositoryCalls, [
    ["getVersionedSnapshotById", "review_provider_late_add"],
  ]);
  assert.equal(projectionCalls, 1);
  assert.equal(context.reviewId, "review_provider_late_add");
  assert.equal(context.currentState, "validation_only_intent_checked");
  assert.equal(context.observedReviewVersion, 1);
  assertNoSensitiveReviewData(context);
});

test("runtime provider does not cache repository snapshots or projected states", async () => {
  const { repository, review } = createRepositoryWithReview(
    createSampleReviewRecord({ id: "review_provider_no_cache" })
  );
  let projectedState = "validation_only_intent_checked";
  let projectionCalls = 0;
  const provider = createProvider({
    repository,
    resolveControlledActionState() {
      projectionCalls += 1;
      return projectedState;
    },
  });
  const dependencies = provider.getControlledActionDependencies();
  const firstContext = await dependencies.resolveAppointmentReviewContext({
    reviewId: review.id,
  });

  projectedState = "needs_clinic_review";

  const secondContext = await dependencies.resolveAppointmentReviewContext({
    reviewId: review.id,
  });

  assert.equal(projectionCalls, 2);
  assert.equal(firstContext.currentState, "validation_only_intent_checked");
  assert.equal(secondContext.currentState, "needs_clinic_review");
  assert.equal(firstContext.observedReviewVersion, 1);
  assert.equal(secondContext.observedReviewVersion, 1);
});

test("Sprint 12J accepts runtime provider dependencies for approve and reject", async () => {
  const { repository, review } = createRepositoryWithReview(
    createSampleReviewRecord({ id: "review_provider_handler" })
  );
  let projectionInput;
  const provider = createProvider({
    repository,
    resolveControlledActionState(input) {
      projectionInput = input;
      return "validation_only_intent_checked";
    },
  });
  const dependencies = provider.getControlledActionDependencies();
  const approveResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      actionIntent: "approve_intent",
      idempotencyKey: "runtime_provider:approve",
    })
  );
  const rejectResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      actionIntent: "reject_intent",
      idempotencyKey: "runtime_provider:reject",
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
    assert.equal(result.pipelineResult.executionRequested, false);
    assert.equal(result.pipelineResult.actionPerformed, false);
    assertHandlerSafetyFields(result);
    assertNoSensitiveReviewData(result.assemblyResult.pipelineInput);
  }

  assert.equal(projectionInput.reviewId, review.id);
  assert.equal(projectionInput.repositoryVersion, 1);
  assert.equal(Object.hasOwn(projectionInput, "repository"), false);
  assert.equal(repository.getVersionedSnapshotById(review.id).version, 1);
});

test("Sprint 12J safely rejects missing, mismatched, and incompatible runtime contexts", async () => {
  const { repository, review } = createRepositoryWithReview(
    createSampleReviewRecord({ id: "review_provider_rejections" })
  );
  const provider = createProvider({ repository });
  const dependencies = provider.getControlledActionDependencies();
  const missingResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: "review_missing",
      dependencies,
      idempotencyKey: "runtime_provider:missing",
    })
  );
  const mismatchResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      expectedReviewVersion: 2,
      idempotencyKey: "runtime_provider:version_mismatch",
    })
  );
  const incompatibleProvider = createProvider({
    repository,
    resolveControlledActionState() {
      return "needs_clinic_review";
    },
  });
  const incompatibleResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: review.id,
      dependencies: incompatibleProvider.getControlledActionDependencies(),
      idempotencyKey: "runtime_provider:incompatible_state",
    })
  );

  assert.equal(missingResult.accepted, false);
  assert.equal(missingResult.failedStage, "appointment_review_context");
  assert.equal(missingResult.code, "appointment_review_context_resolution_failed");
  assert.equal(Object.hasOwn(missingResult, "assemblyResult"), false);
  assert.equal(Object.hasOwn(missingResult, "pipelineResult"), false);

  assert.equal(mismatchResult.accepted, false);
  assert.equal(mismatchResult.failedStage, "validation_pipeline");
  assert.equal(mismatchResult.stageCode, "idempotency_guard_stage_rejected");
  assert.equal(mismatchResult.assemblyResult.pipelineInput.observedReviewVersion, 1);
  assert.equal(mismatchResult.assemblyResult.pipelineInput.expectedReviewVersion, 2);
  assert.equal(repository.getVersionedSnapshotById(review.id).version, 1);

  assert.equal(incompatibleResult.accepted, false);
  assert.equal(incompatibleResult.failedStage, "validation_pipeline");
  assert.equal(incompatibleResult.stageCode, "preconditions_stage_rejected");
  assert.equal(
    incompatibleResult.assemblyResult.pipelineInput.preconditionsInput.currentState,
    "needs_clinic_review"
  );

  for (const result of [missingResult, mismatchResult, incompatibleResult]) {
    assertHandlerSafetyFields(result);
  }
});

test("Sprint 12O receipt handler accepts runtime provider dependencies", async () => {
  const { repository, review } = createRepositoryWithReview(
    createSampleReviewRecord({ id: "review_provider_receipt" })
  );
  const provider = createProvider({ repository });
  const dependencies = provider.getControlledActionDependencies();
  const validReceipt = await handleAppointmentReviewControlledActionValidationReceipt(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      idempotencyKey: "runtime_provider_receipt:valid",
    })
  );
  const missingReceipt = await handleAppointmentReviewControlledActionValidationReceipt(
    createValidationInput({
      reviewId: "review_missing",
      dependencies,
      idempotencyKey: "runtime_provider_receipt:missing",
    })
  );
  const mismatchReceipt = await handleAppointmentReviewControlledActionValidationReceipt(
    createValidationInput({
      reviewId: review.id,
      dependencies,
      expectedReviewVersion: 2,
      idempotencyKey: "runtime_provider_receipt:version_mismatch",
    })
  );

  assert.equal(validReceipt.accepted, true);
  assert.equal(validReceipt.receiptOutcome, "validation_passed");
  assert.equal(missingReceipt.accepted, true);
  assert.equal(missingReceipt.receiptOutcome, "validation_rejected");
  assert.equal(mismatchReceipt.accepted, true);
  assert.equal(mismatchReceipt.receiptOutcome, "validation_rejected");

  for (const result of [validReceipt, missingReceipt, mismatchReceipt]) {
    assertReceiptSafetyFields(result);
    assertNoSensitiveReviewData(result.validationReceipt);
  }
});

test("runtime providers remain isolated across repositories and projections", async () => {
  const first = createRepositoryWithReview(
    createSampleReviewRecord({ id: "review_provider_first" })
  );
  const second = createRepositoryWithReview(
    createSampleReviewRecord({ id: "review_provider_second" })
  );
  let firstProjectionCalls = 0;
  let secondProjectionCalls = 0;
  const firstProvider = createProvider({
    repository: first.repository,
    resolveControlledActionState() {
      firstProjectionCalls += 1;
      return "validation_only_intent_checked";
    },
  });
  const secondProvider = createProvider({
    repository: second.repository,
    resolveControlledActionState() {
      secondProjectionCalls += 1;
      return "needs_clinic_review";
    },
  });
  const firstDependencies = firstProvider.getControlledActionDependencies();
  const secondDependencies = secondProvider.getControlledActionDependencies();

  firstProvider.runtimeType = "production";
  firstDependencies.resolveAppointmentReviewContext = null;
  firstDependencies.repository = first.repository;

  assertProviderMetadata(firstProvider);
  assertProviderMetadata(secondProvider);
  assert.equal(typeof firstDependencies.resolveAppointmentReviewContext, "function");
  assert.equal(typeof secondDependencies.resolveAppointmentReviewContext, "function");
  assert.equal(Object.hasOwn(firstDependencies, "repository"), false);
  assert.notEqual(firstDependencies, secondDependencies);

  const firstContext = await firstDependencies.resolveAppointmentReviewContext({
    reviewId: first.review.id,
  });
  const secondContext = await secondDependencies.resolveAppointmentReviewContext({
    reviewId: second.review.id,
  });

  assert.equal(firstContext.currentState, "validation_only_intent_checked");
  assert.equal(secondContext.currentState, "needs_clinic_review");
  assert.equal(firstProjectionCalls, 1);
  assert.equal(secondProjectionCalls, 1);

  await assert.rejects(
    () =>
      firstDependencies.resolveAppointmentReviewContext({
        reviewId: second.review.id,
      }),
    (error) => error.code === "appointment_review_snapshot_not_found"
  );
  await assert.rejects(
    () =>
      secondDependencies.resolveAppointmentReviewContext({
        reviewId: first.review.id,
      }),
    (error) => error.code === "appointment_review_snapshot_not_found"
  );
  assert.equal(firstProjectionCalls, 1);
  assert.equal(secondProjectionCalls, 1);
});

test("runtime provider preserves factory input and existing hybrid behavior", async () => {
  const { repository, review } = createRepositoryWithReview(
    createSampleReviewRecord({ id: "review_provider_existing_behavior" })
  );
  const beforeList = repository.list();
  const options = {
    repository,
    resolveControlledActionState() {
      return "validation_only_intent_checked";
    },
  };
  const beforeOptionKeys = Object.keys(options);
  const provider = createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider(
    options
  );
  const providerDependencies = provider.getControlledActionDependencies();
  const hybridDependencies = createHybridAppointmentReviewControlledActionDependencies(
    options
  );
  const providerContext = await providerDependencies.resolveAppointmentReviewContext({
    reviewId: review.id,
  });
  const hybridContext = await hybridDependencies.resolveAppointmentReviewContext({
    reviewId: review.id,
  });

  assert.deepEqual(Object.keys(options), beforeOptionKeys);
  assert.deepEqual(repository.list(), beforeList);
  assert.deepEqual(providerContext, hybridContext);
  assert.deepEqual(
    providerDependencies.resolveVerifiedActorContext({
      actionIntent: "approve_intent",
    }),
    hybridDependencies.resolveVerifiedActorContext({
      actionIntent: "approve_intent",
    })
  );
});

test("runtime provider source has no forbidden side effects or unsafe values", () => {
  const source = fs.readFileSync(
    "src/secretary/appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider.js",
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /createAppointment\(|createCalendarEvent\(|getCalendarProvider\(|manualAppointmentCalendarSync|googleapis|prisma|supabase|redis|sqlite|postgres|fetch|node:fs|require\("fs"\)|require\("node:fs"\)|filesystem|dotenv|process\.env|authProvider|authorizationProvider|audit|logger|logging|commandBus|eventBus|jobQueue|executor\(|new Executor|dispatcher|app\/api|app\/components|Date\.now|Math\.random|randomUUID|crypto|console|appointmentReviewQueue|global|singleton|registry/
  );
  assert.doesNotMatch(
    source,
    /executionEnabled:\s*true|executorAvailable:\s*true|executionAvailable:\s*true|executionRequested:\s*true|actionPerformed:\s*true|commandDispatched:\s*true|commandPersisted:\s*true|receiptPersisted:\s*true|bookingCreated:\s*true|calendarChecked:\s*true|appointmentCreated:\s*true|calendarEventCreated:\s*true|databasePersisted:\s*true|reviewFound:\s*true|persisted:\s*true|productionReady:\s*true|realProvider:\s*true/
  );
});
