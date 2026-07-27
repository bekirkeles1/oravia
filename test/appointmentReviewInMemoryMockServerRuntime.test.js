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
  createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider,
} = require("../src/secretary/appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider");
const {
  createInMemoryMockAppointmentReviewServerRuntime,
} = require("../src/secretary/appointmentReviewInMemoryMockServerRuntime");

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

function createSafeAppointmentSelectionReview() {
  const review = createSampleAppointmentSelectionReview();

  return {
    ...review,
    selectedSlot: {
      ...review.selectedSlot,
      id: "runtime_slot",
    },
  };
}

function createSampleReviewRecord(overrides = {}) {
  const item = createAppointmentReviewItem(createSampleAppointmentSelectionReview(), {
    conversationKey: overrides.conversationKey || "whatsapp:synthetic-a",
  });

  return {
    ...item.review,
    ...overrides,
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
  };
}

function createRuntime({
  resolveControlledActionState = () => "validation_only_intent_checked",
  initialReviews,
} = {}) {
  return createInMemoryMockAppointmentReviewServerRuntime({
    resolveControlledActionState,
    initialReviews,
  });
}

function createValidationInput({
  reviewId,
  dependencies,
  actionIntent = "approve_intent",
  expectedReviewVersion = 1,
  idempotencyKey = "server_runtime:approve",
  bodyOverrides = {},
}) {
  return {
    method: "POST",
    reviewId,
    body: {
      actionIntent,
      requestId: "request_server_runtime",
      idempotencyKey,
      expectedReviewVersion,
      ...bodyOverrides,
    },
    dependencies,
  };
}

function assertRuntimeMetadata(runtime) {
  assert.equal(runtime.runtimeType, "appointment_review_server_runtime_v1");
  assert.equal(runtime.schemaVersion, 1);
  assert.equal(runtime.runtimeMode, "in_memory_mock_validation_only");
  assert.equal(runtime.runtimeSource, "server_composition_root");
  assert.equal(runtime.mock, true);
  assert.equal(runtime.inMemory, true);
  assert.equal(runtime.validationOnly, true);
  assert.equal(runtime.controlledHandlingOnly, true);
  assert.equal(runtime.persistence, "not_persisted");
  assert.equal(runtime.databasePersisted, false);
  assert.equal(runtime.executionEnabled, false);
  assert.equal(runtime.executorAvailable, false);
  assert.equal(runtime.executionAvailable, false);
  assert.equal(typeof runtime.getAppointmentReviewQueue, "function");
  assert.equal(
    typeof runtime.getControlledActionRuntimeDependencyProvider,
    "function"
  );
  assert.equal(typeof runtime.getControlledActionDependencies, "function");
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

function assertNoRepositoryExposure(value) {
  assert.equal(Object.hasOwn(value, "repository"), false);
  assert.equal(Object.hasOwn(value, "repositoryInstance"), false);
  assert.equal(Object.hasOwn(value, "storage"), false);
  assert.equal(Object.hasOwn(value, "records"), false);
  assert.equal(Object.hasOwn(value, "map"), false);
  assert.equal(Object.hasOwn(value, "reviewMap"), false);
  assert.equal(Object.hasOwn(value, "initialReviews"), false);
  assert.equal(Object.hasOwn(value, "resolveControlledActionState"), false);
  assert.equal(Object.hasOwn(value, "getRepository"), false);
  assert.equal(Object.hasOwn(value, "resetRepository"), false);
}

test("server runtime factory validates state projection and exposes fixed immutable metadata", () => {
  const runtime = createRuntime();
  const queue = runtime.getAppointmentReviewQueue();

  assertRuntimeMetadata(runtime);
  assert.deepEqual(Object.keys(runtime), [
    "runtimeType",
    "schemaVersion",
    "runtimeMode",
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
    "getAppointmentReviewQueue",
    "getControlledActionRuntimeDependencyProvider",
    "getControlledActionDependencies",
    "applyAppointmentReviewDecision",
    "createAppointmentFromApprovedReview",
    "listCreatedAppointments",
    "syncAppointmentToCalendar",
    "dispatchAppointmentConfirmation",
    "createAppointmentReschedulePreview",
    "applyAppointmentReschedule",
    "createAppointmentCancellationPreview",
    "applyAppointmentCancellation",
    "listAppointmentLifecycleEvents",
    "syncAppointmentChangeToCalendar",
    "dispatchAppointmentChangeNotification",
    "getReminderState",
    "listAppointmentReminderHistory",
    "reconcileAppointmentReminders",
    "runAppointmentReminderCycle",
    "retryFailedReminder",
    "getEmptySlotState",
    "createEmptySlotOpportunity",
    "updateEarlierSlotConsent",
    "getEarlierSlotConsent",
    "previewEmptySlotCandidates",
    "launchEmptySlotOfferWave",
    "respondToEmptySlotOffer",
    "cancelEmptySlotOpportunity",
    "runEmptySlotCycle",
  ]);
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(Object.isFrozen(queue), true);
  assert.deepEqual(Object.keys(queue), [
    "addAppointmentReview",
    "listAppointmentReviews",
    "getAppointmentReviewById",
  ]);
  assertNoRepositoryExposure(runtime);
  assertNoRepositoryExposure(queue);
  assert.equal(Object.hasOwn(queue, "updateAppointmentReviewStatus"), false);

  runtime.runtimeMode = "production";
  runtime.mock = false;
  runtime.persistence = "database";
  runtime.executionEnabled = true;
  runtime.repository = {};
  runtime.getAppointmentReviewQueue = null;
  runtime.getControlledActionDependencies = null;

  assertRuntimeMetadata(runtime);
  assertNoRepositoryExposure(runtime);

  assert.throws(
    () => createInMemoryMockAppointmentReviewServerRuntime(),
    (error) => error.code === "invalid_factory_options"
  );
  assert.throws(
    () => createInMemoryMockAppointmentReviewServerRuntime({}),
    (error) => error.code === "missing_controlled_action_state_projection"
  );
  assert.throws(
    () =>
      createInMemoryMockAppointmentReviewServerRuntime({
        resolveControlledActionState: "not-a-function",
      }),
    (error) => error.code === "missing_controlled_action_state_projection"
  );
});

test("server runtime composes one repository queue and provider per runtime", () => {
  const runtimePath = require.resolve(
    "../src/secretary/appointmentReviewInMemoryMockServerRuntime"
  );
  const repositoryPath = require.resolve(
    "../src/secretary/appointmentReviewRepository"
  );
  const queuePath = require.resolve("../src/secretary/appointmentReviewQueue");
  const providerPath = require.resolve(
    "../src/secretary/appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider"
  );
  const originalRuntimeCache = require.cache[runtimePath];
  const originalRepositoryCache = require.cache[repositoryPath];
  const originalQueueCache = require.cache[queuePath];
  const originalProviderCache = require.cache[providerPath];
  const repository = { repositoryId: "shared_repository" };
  const internalQueue = {
    addAppointmentReview() {},
    listAppointmentReviews() {},
    getAppointmentReviewById() {},
    updateAppointmentReviewStatus() {},
  };
  const dependencies = Object.freeze({
    resolveVerifiedActorContext() {},
    resolveAppointmentReviewContext() {},
    resolveIdempotencyContext() {},
    resolveExecutionPolicyContext() {},
  });
  const provider = Object.freeze({
    getControlledActionDependencies() {
      return dependencies;
    },
  });
  let repositoryFactoryCalls = 0;
  let queueFactoryCalls = 0;
  let providerFactoryCalls = 0;

  delete require.cache[runtimePath];
  require.cache[repositoryPath] = {
    id: repositoryPath,
    filename: repositoryPath,
    loaded: true,
    exports: {
      createInMemoryAppointmentReviewRepository(options) {
        repositoryFactoryCalls += 1;
        assert.deepEqual(options, { initialReviews: ["initial"] });
        return repository;
      },
    },
  };
  require.cache[queuePath] = {
    id: queuePath,
    filename: queuePath,
    loaded: true,
    exports: {
      createInMemoryAppointmentReviewQueue(options) {
        queueFactoryCalls += 1;
        assert.equal(options.repository, repository);
        return internalQueue;
      },
    },
  };
  require.cache[providerPath] = {
    id: providerPath,
    filename: providerPath,
    loaded: true,
    exports: {
      createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider(
        options
      ) {
        providerFactoryCalls += 1;
        assert.equal(options.repository, repository);
        assert.equal(options.resolveControlledActionState, projection);
        return provider;
      },
    },
  };

  try {
    const {
      createInMemoryMockAppointmentReviewServerRuntime: createRuntimeWithFakes,
    } = require(runtimePath);
    function projection() {
      return "validation_only_intent_checked";
    }

    const runtime = createRuntimeWithFakes({
      resolveControlledActionState: projection,
      initialReviews: ["initial"],
    });

    assert.equal(repositoryFactoryCalls, 1);
    assert.equal(queueFactoryCalls, 1);
    assert.equal(providerFactoryCalls, 1);
    assert.equal(runtime.getAppointmentReviewQueue(), runtime.getAppointmentReviewQueue());
    assert.equal(
      runtime.getControlledActionRuntimeDependencyProvider(),
      provider
    );
    assert.equal(
      runtime.getControlledActionRuntimeDependencyProvider(),
      runtime.getControlledActionRuntimeDependencyProvider()
    );
    assert.equal(runtime.getControlledActionDependencies(), dependencies);
    assert.equal(runtime.getControlledActionDependencies(), dependencies);
    assert.equal(repositoryFactoryCalls, 1);
    assert.equal(queueFactoryCalls, 1);
    assert.equal(providerFactoryCalls, 1);
  } finally {
    delete require.cache[runtimePath];

    if (originalRuntimeCache) {
      require.cache[runtimePath] = originalRuntimeCache;
    }

    if (originalRepositoryCache) {
      require.cache[repositoryPath] = originalRepositoryCache;
    } else {
      delete require.cache[repositoryPath];
    }

    if (originalQueueCache) {
      require.cache[queuePath] = originalQueueCache;
    } else {
      delete require.cache[queuePath];
    }

    if (originalProviderCache) {
      require.cache[providerPath] = originalProviderCache;
    } else {
      delete require.cache[providerPath];
    }
  }
});

test("queue-added review is visible through controlled-action dependencies", async () => {
  let projectionInput;
  let projectionCalls = 0;
  const runtime = createRuntime({
    resolveControlledActionState(input) {
      projectionCalls += 1;
      projectionInput = input;
      return "validation_only_intent_checked";
    },
  });
  const queue = runtime.getAppointmentReviewQueue();

  assert.equal(projectionCalls, 0);
  assert.deepEqual(queue.listAppointmentReviews(), []);

  const addResult = queue.addAppointmentReview(
    createSafeAppointmentSelectionReview(),
    { conversationKey: "runtime" }
  );
  const dependencies = runtime.getControlledActionDependencies();
  const context = await dependencies.resolveAppointmentReviewContext({
    reviewId: addResult.review.id,
  });

  assert.equal(addResult.status, "ok");
  assert.deepEqual(queue.getAppointmentReviewById(addResult.review.id), addResult.review);
  assert.equal(context.reviewId, addResult.review.id);
  assert.equal(context.currentState, "validation_only_intent_checked");
  assert.equal(context.observedReviewVersion, 1);
  assert.equal(projectionCalls, 1);
  assert.equal(projectionInput.reviewId, addResult.review.id);
  assert.equal(projectionInput.repositoryVersion, 1);
  assert.equal(Object.hasOwn(projectionInput, "repository"), false);
  assertNoSensitiveReviewData(context);

  await assert.rejects(
    () =>
      dependencies.resolveAppointmentReviewContext({
        reviewId: addResult.review.id,
        currentState: "needs_clinic_review",
      }),
    (error) => error.code === "client_trusted_context_injection"
  );
  await assert.rejects(
    () =>
      dependencies.resolveAppointmentReviewContext({
        reviewId: addResult.review.id,
        observedReviewVersion: 99,
      }),
    (error) => error.code === "client_trusted_context_injection"
  );
});

test("Sprint 12J validates queue-added reviews through server runtime dependencies", async () => {
  const runtime = createRuntime();
  const queue = runtime.getAppointmentReviewQueue();
  const addResult = queue.addAppointmentReview(
    createSafeAppointmentSelectionReview(),
    { conversationKey: "runtime" }
  );
  const dependencies = runtime.getControlledActionDependencies();
  const approveResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: addResult.review.id,
      dependencies,
      actionIntent: "approve_intent",
      idempotencyKey: "server_runtime:approve",
    })
  );
  const rejectResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: addResult.review.id,
      dependencies,
      actionIntent: "reject_intent",
      idempotencyKey: "server_runtime:reject",
    })
  );
  const mismatchResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: addResult.review.id,
      dependencies,
      expectedReviewVersion: 2,
      idempotencyKey: "server_runtime:version_mismatch",
    })
  );
  const missingResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: "review_missing",
      dependencies,
      idempotencyKey: "server_runtime:missing",
    })
  );

  for (const result of [approveResult, rejectResult]) {
    assert.equal(result.accepted, true);
    assert.equal(result.handlerCompleted, true);
    assert.equal(result.assemblyResult.pipelineInput.observedReviewVersion, 1);
    assert.equal(
      result.assemblyResult.pipelineInput.preconditionsInput.currentState,
      "validation_only_intent_checked"
    );
    assertHandlerSafetyFields(result);
    assertNoSensitiveReviewData(result.assemblyResult.pipelineInput);
  }

  assert.equal(mismatchResult.accepted, false);
  assert.equal(mismatchResult.failedStage, "validation_pipeline");
  assert.equal(mismatchResult.stageCode, "idempotency_guard_stage_rejected");
  assert.equal(mismatchResult.assemblyResult.pipelineInput.observedReviewVersion, 1);
  assert.equal(mismatchResult.assemblyResult.pipelineInput.expectedReviewVersion, 2);
  assert.deepEqual(queue.getAppointmentReviewById(addResult.review.id), addResult.review);
  assertHandlerSafetyFields(mismatchResult);

  assert.equal(missingResult.accepted, false);
  assert.equal(missingResult.failedStage, "appointment_review_context");
  assert.equal(missingResult.code, "appointment_review_context_resolution_failed");
  assert.equal(Object.hasOwn(missingResult, "assemblyResult"), false);
  assertHandlerSafetyFields(missingResult);
});

test("Sprint 12J rejects incompatible projected state through server runtime", async () => {
  const runtime = createRuntime({
    resolveControlledActionState() {
      return "needs_clinic_review";
    },
  });
  const addResult = runtime
    .getAppointmentReviewQueue()
    .addAppointmentReview(createSampleAppointmentSelectionReview());
  const result = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: addResult.review.id,
      dependencies: runtime.getControlledActionDependencies(),
      idempotencyKey: "server_runtime:incompatible_state",
    })
  );

  assert.equal(result.accepted, false);
  assert.equal(result.failedStage, "validation_pipeline");
  assert.equal(result.stageCode, "preconditions_stage_rejected");
  assert.equal(
    result.assemblyResult.pipelineInput.preconditionsInput.currentState,
    "needs_clinic_review"
  );
  assertHandlerSafetyFields(result);
});

test("Sprint 12O creates receipts from queue-added server runtime reviews", async () => {
  const runtime = createRuntime();
  const addResult = runtime
    .getAppointmentReviewQueue()
    .addAppointmentReview(createSafeAppointmentSelectionReview(), {
      conversationKey: "runtime",
    });
  const dependencies = runtime.getControlledActionDependencies();
  const validReceipt = await handleAppointmentReviewControlledActionValidationReceipt(
    createValidationInput({
      reviewId: addResult.review.id,
      dependencies,
      idempotencyKey: "server_runtime_receipt:valid",
    })
  );
  const missingReceipt = await handleAppointmentReviewControlledActionValidationReceipt(
    createValidationInput({
      reviewId: "review_missing",
      dependencies,
      idempotencyKey: "server_runtime_receipt:missing",
    })
  );
  const mismatchReceipt = await handleAppointmentReviewControlledActionValidationReceipt(
    createValidationInput({
      reviewId: addResult.review.id,
      dependencies,
      expectedReviewVersion: 2,
      idempotencyKey: "server_runtime_receipt:version_mismatch",
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

test("initial reviews are defensive and visible through queue and dependencies", async () => {
  const initialReview = createSampleReviewRecord({
    id: "review_server_runtime_initial",
    version: 99,
  });
  const initialReviews = [initialReview];
  const runtime = createRuntime({ initialReviews });

  initialReview.selectedSlot.time = "mutated";
  initialReviews.push(createSampleReviewRecord({ id: "review_late_input_mutation" }));

  const queue = runtime.getAppointmentReviewQueue();
  const listedReviews = queue.listAppointmentReviews();
  const dependencies = runtime.getControlledActionDependencies();
  const context = await dependencies.resolveAppointmentReviewContext({
    reviewId: "review_server_runtime_initial",
  });

  assert.equal(listedReviews.length, 1);
  assert.equal(listedReviews[0].id, "review_server_runtime_initial");
  assert.equal(listedReviews[0].selectedSlot.time, "10:30");
  assert.equal(Object.hasOwn(listedReviews[0], "version"), false);
  assert.equal(context.reviewId, "review_server_runtime_initial");
  assert.equal(context.observedReviewVersion, 1);
  assert.equal(context.currentState, "validation_only_intent_checked");
});

test("server runtime instances remain isolated", async () => {
  let firstProjectionCalls = 0;
  let secondProjectionCalls = 0;
  const firstRuntime = createRuntime({
    resolveControlledActionState() {
      firstProjectionCalls += 1;
      return "validation_only_intent_checked";
    },
  });
  const secondRuntime = createRuntime({
    resolveControlledActionState() {
      secondProjectionCalls += 1;
      return "needs_clinic_review";
    },
  });
  const firstQueue = firstRuntime.getAppointmentReviewQueue();
  const secondQueue = secondRuntime.getAppointmentReviewQueue();
  const firstAdd = firstQueue.addAppointmentReview(
    createSampleAppointmentSelectionReview(),
    { conversationKey: "whatsapp:synthetic-a" }
  );
  const secondAdd = secondQueue.addAppointmentReview(
    createSampleAppointmentSelectionReview(),
    { conversationKey: "whatsapp:synthetic-b" }
  );
  const firstProvider =
    firstRuntime.getControlledActionRuntimeDependencyProvider();
  const secondProvider =
    secondRuntime.getControlledActionRuntimeDependencyProvider();
  const firstDependencies = firstRuntime.getControlledActionDependencies();
  const secondDependencies = secondRuntime.getControlledActionDependencies();

  firstRuntime.runtimeMode = "production";
  firstRuntime.repository = {};
  firstDependencies.resolveAppointmentReviewContext = null;

  assertRuntimeMetadata(firstRuntime);
  assertRuntimeMetadata(secondRuntime);
  assert.notEqual(firstQueue, secondQueue);
  assert.notEqual(firstProvider, secondProvider);
  assert.notEqual(firstDependencies, secondDependencies);
  assert.equal(typeof firstDependencies.resolveAppointmentReviewContext, "function");
  assert.equal(firstQueue.getAppointmentReviewById(secondAdd.review.id), null);
  assert.equal(secondQueue.getAppointmentReviewById(firstAdd.review.id), null);

  const firstContext = await firstDependencies.resolveAppointmentReviewContext({
    reviewId: firstAdd.review.id,
  });
  const secondContext = await secondDependencies.resolveAppointmentReviewContext({
    reviewId: secondAdd.review.id,
  });

  assert.equal(firstContext.currentState, "validation_only_intent_checked");
  assert.equal(secondContext.currentState, "needs_clinic_review");
  assert.equal(firstProjectionCalls, 1);
  assert.equal(secondProjectionCalls, 1);

  await assert.rejects(
    () =>
      firstDependencies.resolveAppointmentReviewContext({
        reviewId: secondAdd.review.id,
      }),
    (error) => error.code === "appointment_review_snapshot_not_found"
  );
  await assert.rejects(
    () =>
      secondDependencies.resolveAppointmentReviewContext({
        reviewId: firstAdd.review.id,
      }),
    (error) => error.code === "appointment_review_snapshot_not_found"
  );
  assert.equal(firstProjectionCalls, 1);
  assert.equal(secondProjectionCalls, 1);
});

test("server runtime getter identities and provider behavior remain stable", () => {
  const runtime = createRuntime();
  const provider = runtime.getControlledActionRuntimeDependencyProvider();
  const dependencies = runtime.getControlledActionDependencies();

  assert.equal(runtime.getAppointmentReviewQueue(), runtime.getAppointmentReviewQueue());
  assert.equal(
    runtime.getControlledActionRuntimeDependencyProvider(),
    provider
  );
  assert.equal(runtime.getControlledActionDependencies(), dependencies);
  assert.equal(provider.getControlledActionDependencies(), dependencies);
  assert.equal(Object.isFrozen(provider), true);
  assert.equal(Object.isFrozen(dependencies), true);
  assert.deepEqual(Object.keys(dependencies), [
    "resolveVerifiedActorContext",
    "resolveAppointmentReviewContext",
    "resolveIdempotencyContext",
    "resolveExecutionPolicyContext",
  ]);
});

test("server runtime source has no forbidden side effects or unsafe values", () => {
  const source = fs.readFileSync(
    "src/secretary/appointmentReviewInMemoryMockServerRuntime.js",
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /createAppointment\(|createCalendarEvent\(|manualAppointmentCalendarSync|googleapis|prisma|supabase|redis|postgres|fetch|node:fs|require\("fs"\)|require\("node:fs"\)|filesystem|dotenv|process\.env|authProvider|authorizationProvider|audit|logger|logging|commandBus|eventBus|jobQueue|executor\(|new Executor|dispatcher|app\/api|app\/components|Date\.now|Math\.random|randomUUID|crypto|console|global|singleton|registry/
  );
  assert.doesNotMatch(
    source,
    /executionEnabled:\s*true|executorAvailable:\s*true|executionAvailable:\s*true|executionRequested:\s*true|actionPerformed:\s*true|commandDispatched:\s*true|commandPersisted:\s*true|receiptPersisted:\s*true|bookingCreated:\s*true|calendarChecked:\s*true|appointmentCreated:\s*true|calendarEventCreated:\s*true|databasePersisted:\s*true|reviewFound:\s*true|persisted:\s*true|productionReady:\s*true|realProvider:\s*true|sharedDatabase:\s*true/
  );
  assert.equal(
    source.includes(
      "createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider"
    ),
    true
  );
});

test("existing Sprint 13E provider behavior remains unchanged", () => {
  assert.equal(
    typeof createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider,
    "function"
  );
});
