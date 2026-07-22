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
  createAppointmentReviewRouteRuntimeAdapter,
} = require("../src/secretary/appointmentReviewRouteRuntimeAdapter");

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
      id: "route_runtime_slot",
    },
  };
}

function createAdapter({
  resolveControlledActionState = () => "validation_only_intent_checked",
  initialReviews,
} = {}) {
  return createAppointmentReviewRouteRuntimeAdapter({
    resolveControlledActionState,
    initialReviews,
  });
}

function createValidationInput({
  reviewId,
  dependencies,
  actionIntent = "approve_intent",
  expectedReviewVersion = 1,
  idempotencyKey = "route_runtime:approve",
}) {
  return {
    method: "POST",
    reviewId,
    body: {
      actionIntent,
      requestId: "request_route_runtime_adapter",
      idempotencyKey,
      expectedReviewVersion,
    },
    dependencies,
  };
}

function assertDescriptorSafety(descriptor) {
  assert.equal(descriptor.adapterType, "appointment_review_route_runtime_adapter_v1");
  assert.equal(descriptor.schemaVersion, 1);
  assert.equal(descriptor.adapterSource, "route_runtime_adapter_boundary");
  assert.equal(descriptor.runtimeType, "appointment_review_server_runtime_v1");
  assert.equal(descriptor.runtimeMode, "in_memory_mock_validation_only");
  assert.equal(descriptor.runtimeSource, "server_composition_root");
  assert.equal(descriptor.mock, true);
  assert.equal(descriptor.inMemory, true);
  assert.equal(descriptor.validationOnly, true);
  assert.equal(descriptor.controlledHandlingOnly, true);
  assert.equal(descriptor.persistence, "not_persisted");
  assert.equal(descriptor.databasePersisted, false);
  assert.equal(descriptor.executionEnabled, false);
  assert.equal(descriptor.executorAvailable, false);
  assert.equal(descriptor.executionAvailable, false);
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

function assertNoRuntimeInternals(value) {
  assert.equal(Object.hasOwn(value, "repository"), false);
  assert.equal(Object.hasOwn(value, "repositoryInstance"), false);
  assert.equal(Object.hasOwn(value, "storage"), false);
  assert.equal(Object.hasOwn(value, "records"), false);
  assert.equal(Object.hasOwn(value, "map"), false);
  assert.equal(Object.hasOwn(value, "reviewMap"), false);
  assert.equal(Object.hasOwn(value, "runtime"), false);
  assert.equal(Object.hasOwn(value, "serverRuntime"), false);
  assert.equal(Object.hasOwn(value, "compositionRoot"), false);
  assert.equal(Object.hasOwn(value, "runtimeFactory"), false);
  assert.equal(Object.hasOwn(value, "dependencyProvider"), false);
  assert.equal(Object.hasOwn(value, "getControlledActionRuntimeDependencyProvider"), false);
  assert.equal(Object.hasOwn(value, "resolveControlledActionState"), false);
  assert.equal(Object.hasOwn(value, "executor"), false);
  assert.equal(Object.hasOwn(value, "dispatcher"), false);
  assert.equal(Object.hasOwn(value, "bookingService"), false);
  assert.equal(Object.hasOwn(value, "calendarProvider"), false);
  assert.equal(Object.hasOwn(value, "database"), false);
  assert.equal(Object.hasOwn(value, "authProvider"), false);
  assert.equal(Object.hasOwn(value, "receiptStore"), false);
}

test("route runtime adapter exposes a narrow frozen route-facing contract", () => {
  const adapter = createAdapter();
  const descriptor = adapter.getRuntimeDescriptor();
  const queue = adapter.getAppointmentReviewQueue();
  const dependencies = adapter.getControlledActionDependencies();

  assert.deepEqual(Object.keys(adapter), [
    "adapterType",
    "schemaVersion",
    "adapterSource",
    "getRuntimeDescriptor",
    "listAppointmentReviews",
    "getAppointmentReviewById",
    "getAppointmentReviewQueue",
    "getControlledActionDependencies",
    "applyAppointmentReviewDecision",
  ]);
  assert.equal(adapter.adapterType, "appointment_review_route_runtime_adapter_v1");
  assert.equal(adapter.schemaVersion, 1);
  assert.equal(adapter.adapterSource, "route_runtime_adapter_boundary");
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal(Object.isFrozen(descriptor), true);
  assertDescriptorSafety(descriptor);
  assertNoRuntimeInternals(adapter);
  assertNoRuntimeInternals(descriptor);
  assertNoRuntimeInternals(queue);
  assertNoRuntimeInternals(dependencies);

  adapter.adapterSource = "mutated";
  adapter.repository = {};
  adapter.getControlledActionDependencies = null;
  descriptor.runtimeMode = "production";
  descriptor.executionEnabled = true;

  assert.equal(adapter.adapterSource, "route_runtime_adapter_boundary");
  assert.equal(typeof adapter.getControlledActionDependencies, "function");
  assert.equal(Object.hasOwn(adapter, "repository"), false);
  assertDescriptorSafety(descriptor);

  assert.throws(
    () => createAppointmentReviewRouteRuntimeAdapter(),
    (error) => error.code === "invalid_factory_options"
  );
  assert.throws(
    () => createAppointmentReviewRouteRuntimeAdapter({}),
    (error) => error.code === "missing_controlled_action_state_projection"
  );
});

test("route runtime adapter creates one Sprint 13F runtime and delegates narrowly", () => {
  const adapterPath = require.resolve(
    "../src/secretary/appointmentReviewRouteRuntimeAdapter"
  );
  const runtimePath = require.resolve(
    "../src/secretary/appointmentReviewInMemoryMockServerRuntime"
  );
  const originalAdapterCache = require.cache[adapterPath];
  const originalRuntimeCache = require.cache[runtimePath];
  const queuedReviews = Object.freeze([
    Object.freeze({
      id: "review_fake_runtime",
      status: "pending_secretary_review",
      selectedSlot: Object.freeze({ id: "slot_fake_runtime" }),
      requiresSecretaryConfirmation: true,
      bookingCreated: false,
      calendarChecked: false,
    }),
  ]);
  let listCalls = 0;
  let lookupCalls = 0;
  const lookedUpReviews = [];
  const queue = Object.freeze({
    addAppointmentReview() {},
    listAppointmentReviews() {
      listCalls += 1;
      return queuedReviews;
    },
    getAppointmentReviewById(reviewId) {
      lookupCalls += 1;
      lookedUpReviews.push(reviewId);
      return queuedReviews.find((review) => review.id === reviewId) || null;
    },
  });
  const dependencies = Object.freeze({
    resolveVerifiedActorContext() {},
    resolveAppointmentReviewContext() {},
    resolveIdempotencyContext() {},
    resolveExecutionPolicyContext() {},
  });
  let runtimeFactoryCalls = 0;

  delete require.cache[adapterPath];
  require.cache[runtimePath] = {
    id: runtimePath,
    filename: runtimePath,
    loaded: true,
    exports: {
      createInMemoryMockAppointmentReviewServerRuntime(options) {
        runtimeFactoryCalls += 1;
        assert.equal(options.resolveControlledActionState, projection);
        assert.deepEqual(options.initialReviews, ["initial"]);

        return Object.freeze({
          runtimeType: "appointment_review_server_runtime_v1",
          schemaVersion: 1,
          runtimeMode: "in_memory_mock_validation_only",
          runtimeSource: "server_composition_root",
          mock: true,
          inMemory: true,
          validationOnly: true,
          controlledHandlingOnly: true,
          persistence: "not_persisted",
          databasePersisted: false,
          executionEnabled: false,
          executorAvailable: false,
          executionAvailable: false,
          getAppointmentReviewQueue() {
            return queue;
          },
          getControlledActionRuntimeDependencyProvider() {
            throw new Error("raw provider must not be exposed");
          },
          getControlledActionDependencies() {
            return dependencies;
          },
        });
      },
    },
  };

  try {
    const {
      createAppointmentReviewRouteRuntimeAdapter: createAdapterWithFakeRuntime,
    } = require(adapterPath);
    function projection() {
      return "validation_only_intent_checked";
    }

    const adapter = createAdapterWithFakeRuntime({
      resolveControlledActionState: projection,
      initialReviews: ["initial"],
    });

    assert.equal(runtimeFactoryCalls, 1);
    assert.equal(adapter.listAppointmentReviews(), queuedReviews);
    assert.equal(listCalls, 1);
    assert.equal(
      adapter.getAppointmentReviewById("review_fake_runtime"),
      queuedReviews[0]
    );
    assert.equal(adapter.getAppointmentReviewById("review_missing"), null);
    assert.equal(lookupCalls, 2);
    assert.deepEqual(lookedUpReviews, [
      "review_fake_runtime",
      "review_missing",
    ]);
    assert.equal(adapter.getAppointmentReviewQueue(), queue);
    assert.equal(adapter.getAppointmentReviewQueue(), queue);
    assert.equal(adapter.getControlledActionDependencies(), dependencies);
    assert.equal(adapter.getControlledActionDependencies(), dependencies);
    assertDescriptorSafety(adapter.getRuntimeDescriptor());
    assert.equal(runtimeFactoryCalls, 1);
  } finally {
    delete require.cache[adapterPath];

    if (originalAdapterCache) {
      require.cache[adapterPath] = originalAdapterCache;
    }

    if (originalRuntimeCache) {
      require.cache[runtimePath] = originalRuntimeCache;
    } else {
      delete require.cache[runtimePath];
    }
  }
});

test("route runtime adapter list capability delegates through its request-scoped queue", () => {
  const adapter = createAdapter();
  const queue = adapter.getAppointmentReviewQueue();
  const addResult = queue.addAppointmentReview(createSafeAppointmentSelectionReview(), {
    conversationKey: "route_runtime_list",
  });
  const reviews = adapter.listAppointmentReviews();

  assert.equal(addResult.status, "ok");
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].id, addResult.review.id);
  assert.equal(reviews[0].bookingCreated, false);
  assert.equal(reviews[0].calendarChecked, false);
  assert.equal(reviews[0].requiresSecretaryConfirmation, true);
  assert.equal(Object.hasOwn(adapter, "repository"), false);
  assert.equal(Object.hasOwn(adapter, "queue"), false);
  assert.equal(Object.hasOwn(adapter, "runtime"), false);
  assert.equal(typeof adapter.updateAppointmentReviewStatus, "undefined");
  assert.equal(typeof adapter.addAppointmentReview, "undefined");
});

test("route runtime adapter detail capability delegates through its request-scoped queue", () => {
  const adapter = createAdapter();
  const queue = adapter.getAppointmentReviewQueue();
  const addResult = queue.addAppointmentReview(createSafeAppointmentSelectionReview(), {
    conversationKey: "route_runtime_detail",
  });
  const review = adapter.getAppointmentReviewById(addResult.review.id);
  const missingReview = adapter.getAppointmentReviewById("review_missing");

  assert.equal(addResult.status, "ok");
  assert.equal(review.id, addResult.review.id);
  assert.equal(review.bookingCreated, false);
  assert.equal(review.calendarChecked, false);
  assert.equal(review.requiresSecretaryConfirmation, true);
  assert.equal(missingReview, null);
  assert.equal(Object.hasOwn(adapter, "repository"), false);
  assert.equal(Object.hasOwn(adapter, "queue"), false);
  assert.equal(Object.hasOwn(adapter, "runtime"), false);
  assert.equal(typeof adapter.updateAppointmentReviewStatus, "undefined");
  assert.equal(typeof adapter.addAppointmentReview, "undefined");
});

test("services from one route adapter share one request-scoped runtime", async () => {
  let projectionInput;
  const adapter = createAdapter({
    resolveControlledActionState(input) {
      projectionInput = input;
      return "validation_only_intent_checked";
    },
  });
  const addResult = adapter
    .getAppointmentReviewQueue()
    .addAppointmentReview(createSafeAppointmentSelectionReview(), {
      conversationKey: "route_runtime",
    });
  const dependencies = adapter.getControlledActionDependencies();
  const context = await dependencies.resolveAppointmentReviewContext({
    reviewId: addResult.review.id,
  });

  assert.equal(addResult.status, "ok");
  assert.equal(context.reviewId, addResult.review.id);
  assert.equal(context.currentState, "validation_only_intent_checked");
  assert.equal(context.observedReviewVersion, 1);
  assert.equal(projectionInput.reviewId, addResult.review.id);
  assert.equal(projectionInput.repositoryVersion, 1);
  assert.equal(Object.hasOwn(projectionInput, "repository"), false);
  assertNoSensitiveReviewData(context);
});

test("route adapter dependencies work with Sprint 12J validation", async () => {
  const adapter = createAdapter();
  const addResult = adapter
    .getAppointmentReviewQueue()
    .addAppointmentReview(createSafeAppointmentSelectionReview(), {
      conversationKey: "route_runtime",
    });
  const dependencies = adapter.getControlledActionDependencies();
  const approveResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: addResult.review.id,
      dependencies,
      actionIntent: "approve_intent",
      idempotencyKey: "route_runtime:approve",
    })
  );
  const mismatchResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: addResult.review.id,
      dependencies,
      expectedReviewVersion: 2,
      idempotencyKey: "route_runtime:version_mismatch",
    })
  );
  const missingResult = await handleAppointmentReviewControlledActionValidation(
    createValidationInput({
      reviewId: "review_missing",
      dependencies,
      idempotencyKey: "route_runtime:missing",
    })
  );

  assert.equal(approveResult.accepted, true);
  assert.equal(approveResult.assemblyResult.pipelineInput.observedReviewVersion, 1);
  assert.equal(
    approveResult.assemblyResult.pipelineInput.preconditionsInput.currentState,
    "validation_only_intent_checked"
  );
  assertHandlerSafetyFields(approveResult);
  assertNoSensitiveReviewData(approveResult.assemblyResult.pipelineInput);

  assert.equal(mismatchResult.accepted, false);
  assert.equal(mismatchResult.failedStage, "validation_pipeline");
  assert.equal(mismatchResult.stageCode, "idempotency_guard_stage_rejected");
  assert.equal(mismatchResult.assemblyResult.pipelineInput.observedReviewVersion, 1);
  assertHandlerSafetyFields(mismatchResult);

  assert.equal(missingResult.accepted, false);
  assert.equal(missingResult.failedStage, "appointment_review_context");
  assert.equal(missingResult.code, "appointment_review_context_resolution_failed");
  assertHandlerSafetyFields(missingResult);
});

test("route adapter dependencies work with Sprint 12O receipts", async () => {
  const adapter = createAdapter();
  const addResult = adapter
    .getAppointmentReviewQueue()
    .addAppointmentReview(createSafeAppointmentSelectionReview(), {
      conversationKey: "route_runtime",
    });
  const dependencies = adapter.getControlledActionDependencies();
  const validReceipt = await handleAppointmentReviewControlledActionValidationReceipt(
    createValidationInput({
      reviewId: addResult.review.id,
      dependencies,
      idempotencyKey: "route_runtime_receipt:valid",
    })
  );
  const missingReceipt = await handleAppointmentReviewControlledActionValidationReceipt(
    createValidationInput({
      reviewId: "review_missing",
      dependencies,
      idempotencyKey: "route_runtime_receipt:missing",
    })
  );

  assert.equal(validReceipt.accepted, true);
  assert.equal(validReceipt.receiptOutcome, "validation_passed");
  assert.equal(missingReceipt.accepted, true);
  assert.equal(missingReceipt.receiptOutcome, "validation_rejected");

  for (const result of [validReceipt, missingReceipt]) {
    assertReceiptSafetyFields(result);
    assertNoSensitiveReviewData(result.validationReceipt);
  }
});

test("route adapter instances remain request-scoped and isolated", async () => {
  let firstProjectionCalls = 0;
  let secondProjectionCalls = 0;
  const firstAdapter = createAdapter({
    resolveControlledActionState() {
      firstProjectionCalls += 1;
      return "validation_only_intent_checked";
    },
  });
  const secondAdapter = createAdapter({
    resolveControlledActionState() {
      secondProjectionCalls += 1;
      return "needs_clinic_review";
    },
  });
  const firstAdd = firstAdapter
    .getAppointmentReviewQueue()
    .addAppointmentReview(createSafeAppointmentSelectionReview(), {
      conversationKey: "route_runtime_a",
    });
  const secondAdd = secondAdapter
    .getAppointmentReviewQueue()
    .addAppointmentReview(createSafeAppointmentSelectionReview(), {
      conversationKey: "route_runtime_b",
    });
  const firstDependencies = firstAdapter.getControlledActionDependencies();
  const secondDependencies = secondAdapter.getControlledActionDependencies();

  assert.notEqual(firstAdapter, secondAdapter);
  assert.notEqual(
    firstAdapter.getAppointmentReviewQueue(),
    secondAdapter.getAppointmentReviewQueue()
  );
  assert.notEqual(firstDependencies, secondDependencies);
  assert.equal(
    firstAdapter.getAppointmentReviewQueue().getAppointmentReviewById(
      secondAdd.review.id
    ),
    null
  );
  assert.equal(
    secondAdapter.getAppointmentReviewQueue().getAppointmentReviewById(
      firstAdd.review.id
    ),
    null
  );

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

test("route runtime adapter source has no route rewiring or forbidden behavior", () => {
  const source = fs.readFileSync(
    "src/secretary/appointmentReviewRouteRuntimeAdapter.js",
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /createAppointment\(|createCalendarEvent\(|getCalendarProvider\(|manualAppointmentCalendarSync|googleapis|prisma|supabase|redis|sqlite|postgres|fetch|node:fs|require\("fs"\)|require\("node:fs"\)|filesystem|dotenv|process\.env|authProvider|authorizationProvider|audit|logger|logging|commandBus|eventBus|jobQueue|executor\(|new Executor|dispatcher|app\/api|app\/components|Date\.now|Math\.random|randomUUID|crypto|console|global|singleton|registry|AsyncLocalStorage|cookies|headers/
  );
  assert.doesNotMatch(
    source,
    /executionEnabled:\s*true|executorAvailable:\s*true|executionAvailable:\s*true|executionRequested:\s*true|actionPerformed:\s*true|commandDispatched:\s*true|commandPersisted:\s*true|receiptPersisted:\s*true|bookingCreated:\s*true|calendarChecked:\s*true|appointmentCreated:\s*true|calendarEventCreated:\s*true|databasePersisted:\s*true|reviewFound:\s*true|persisted:\s*true|productionReady:\s*true|realProvider:\s*true|sharedDatabase:\s*true|authenticated:\s*true|authorized:\s*true/
  );
});
