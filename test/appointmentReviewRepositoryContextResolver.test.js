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
  APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_TYPE,
  createInMemoryAppointmentReviewRepository,
} = require("../src/secretary/appointmentReviewRepository");
const {
  RESOLVER_CODES,
  createAppointmentReviewRepositoryContextResolver,
} = require("../src/secretary/appointmentReviewRepositoryContextResolver");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");
const {
  handleAppointmentReviewControlledActionValidation,
} = require("../src/api/secretaryAppointmentReviewControlledActionValidationHandler");

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

function createResolver({
  repository = createRepositoryWithReview().repository,
  resolveControlledActionState = () => "validation_only_intent_checked",
} = {}) {
  return createAppointmentReviewRepositoryContextResolver({
    repository,
    resolveControlledActionState,
  });
}

async function assertRejectsWithCode(operation, code) {
  try {
    await operation();
  } catch (error) {
    assert.equal(error.code, code);
    assert.equal(typeof error.reason, "string");
    assert.equal(Object.hasOwn(error, "stack"), false);
    return error;
  }

  assert.fail(`Expected rejection with ${code}.`);
}

function createSnapshot(overrides = {}) {
  const review = createSampleReviewRecord();

  return {
    snapshotType: APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_TYPE,
    schemaVersion: 1,
    reviewId: review.id,
    version: 1,
    review,
    repositoryType: "in_memory",
    persistence: "not_persisted",
    databasePersisted: false,
    ...overrides,
  };
}

function createSnapshotRepository(snapshot, calls = []) {
  return {
    add() {
      calls.push("add");
      throw new Error("add must not be called");
    },
    list() {
      calls.push("list");
      throw new Error("list must not be called");
    },
    getById() {
      calls.push("getById");
      throw new Error("getById must not be called");
    },
    async getVersionedSnapshotById(reviewId) {
      calls.push(["getVersionedSnapshotById", reviewId]);
      return snapshot;
    },
  };
}

test("repository context resolver factory validates dependencies", () => {
  const { repository } = createRepositoryWithReview();

  assert.equal(typeof createResolver({ repository }), "function");
  assert.throws(
    () => createAppointmentReviewRepositoryContextResolver(),
    (error) => error.code === RESOLVER_CODES.INVALID_FACTORY_OPTIONS
  );
  assert.throws(
    () =>
      createAppointmentReviewRepositoryContextResolver({
        repository: {},
        resolveControlledActionState() {},
      }),
    (error) =>
      error.code === RESOLVER_CODES.MISSING_VERSIONED_SNAPSHOT_CAPABILITY
  );
  assert.throws(
    () => createAppointmentReviewRepositoryContextResolver({ repository }),
    (error) => error.code === RESOLVER_CODES.MISSING_STATE_PROJECTION
  );
  assert.throws(
    () =>
      createAppointmentReviewRepositoryContextResolver({
        repository,
        resolveControlledActionState: "not-a-function",
      }),
    (error) => error.code === RESOLVER_CODES.MISSING_STATE_PROJECTION
  );
});

test("repository context resolver rejects malformed and injected input", async () => {
  const resolver = createResolver();

  await assertRejectsWithCode(
    () => resolver(),
    RESOLVER_CODES.INVALID_INPUT
  );
  await assertRejectsWithCode(
    () => resolver({}),
    RESOLVER_CODES.MISSING_REVIEW_ID
  );
  await assertRejectsWithCode(
    () => resolver({ reviewId: "   " }),
    RESOLVER_CODES.MISSING_REVIEW_ID
  );
  await assertRejectsWithCode(
    () => resolver({ reviewId: "Review With Spaces" }),
    RESOLVER_CODES.INVALID_REVIEW_ID
  );
  await assertRejectsWithCode(
    () =>
      resolver({
        reviewId: "review_safe",
        currentState: "validation_only_intent_checked",
      }),
    RESOLVER_CODES.CLIENT_TRUSTED_CONTEXT_INJECTION
  );
  await assertRejectsWithCode(
    () => resolver({ reviewId: "review_safe", observedReviewVersion: 99 }),
    RESOLVER_CODES.CLIENT_TRUSTED_CONTEXT_INJECTION
  );
  await assertRejectsWithCode(
    () => resolver({ reviewId: "review_safe", reviewSnapshot: {} }),
    RESOLVER_CODES.CLIENT_TRUSTED_CONTEXT_INJECTION
  );
});

test("repository context resolver reads the versioned snapshot exactly once", async () => {
  const review = createSampleReviewRecord();
  const calls = [];
  const repository = createSnapshotRepository(createSnapshot({ reviewId: review.id, review }), calls);
  let projectionInput;
  const resolver = createResolver({
    repository,
    resolveControlledActionState(input) {
      projectionInput = input;
      return "validation_only_intent_checked";
    },
  });
  const context = await resolver({ reviewId: review.id });

  assert.deepEqual(calls, [["getVersionedSnapshotById", review.id]]);
  assert.equal(context.reviewId, review.id);
  assert.equal(projectionInput.reviewId, review.id);
  assert.equal(projectionInput.repositoryVersion, 1);
  assert.equal(Object.hasOwn(projectionInput, "repository"), false);
  assert.equal(Object.hasOwn(projectionInput, "currentState"), false);
});

test("repository context resolver fails unknown review without state projection", async () => {
  const calls = [];
  const repository = createSnapshotRepository(null, calls);
  let projectionCalls = 0;
  const resolver = createResolver({
    repository,
    resolveControlledActionState() {
      projectionCalls += 1;
      return "validation_only_intent_checked";
    },
  });

  await assertRejectsWithCode(
    () => resolver({ reviewId: "review_missing" }),
    RESOLVER_CODES.SNAPSHOT_NOT_FOUND
  );
  assert.deepEqual(calls, [["getVersionedSnapshotById", "review_missing"]]);
  assert.equal(projectionCalls, 0);
});

test("repository context resolver validates repository snapshots", async () => {
  const review = createSampleReviewRecord();
  const cases = [
    [null, RESOLVER_CODES.SNAPSHOT_NOT_FOUND],
    [{}, RESOLVER_CODES.INVALID_REPOSITORY_SNAPSHOT],
    [
      createSnapshot({ reviewId: review.id, review, snapshotType: "wrong" }),
      RESOLVER_CODES.INVALID_REPOSITORY_SNAPSHOT,
    ],
    [
      createSnapshot({ reviewId: review.id, review, schemaVersion: 2 }),
      RESOLVER_CODES.INVALID_REPOSITORY_SNAPSHOT,
    ],
    [
      createSnapshot({ reviewId: "review_other", review }),
      RESOLVER_CODES.REPOSITORY_SNAPSHOT_REVIEW_ID_MISMATCH,
    ],
    [
      createSnapshot({ reviewId: review.id, review: null }),
      RESOLVER_CODES.INVALID_REPOSITORY_SNAPSHOT,
    ],
    [
      createSnapshot({ reviewId: review.id, review, version: undefined }),
      RESOLVER_CODES.INVALID_REPOSITORY_SNAPSHOT_VERSION,
    ],
    [
      createSnapshot({ reviewId: review.id, review, version: 0 }),
      RESOLVER_CODES.INVALID_REPOSITORY_SNAPSHOT_VERSION,
    ],
    [
      createSnapshot({ reviewId: review.id, review, version: -1 }),
      RESOLVER_CODES.INVALID_REPOSITORY_SNAPSHOT_VERSION,
    ],
    [
      createSnapshot({ reviewId: review.id, review, version: 1.5 }),
      RESOLVER_CODES.INVALID_REPOSITORY_SNAPSHOT_VERSION,
    ],
    [
      createSnapshot({ reviewId: review.id, review, persistence: "persisted" }),
      RESOLVER_CODES.UNSAFE_REPOSITORY_SNAPSHOT,
    ],
    [
      createSnapshot({ reviewId: review.id, review, databasePersisted: true }),
      RESOLVER_CODES.UNSAFE_REPOSITORY_SNAPSHOT,
    ],
    [
      createSnapshot({ reviewId: review.id, review, bookingCreated: true }),
      RESOLVER_CODES.UNSAFE_REPOSITORY_SNAPSHOT,
    ],
  ];

  for (const [snapshot, code] of cases) {
    const resolver = createResolver({
      repository: createSnapshotRepository(snapshot),
      resolveControlledActionState() {
        return "validation_only_intent_checked";
      },
    });

    await assertRejectsWithCode(() => resolver({ reviewId: review.id }), code);
  }
});

test("repository context resolver supports sync and async state projection", async () => {
  const { repository, review } = createRepositoryWithReview();
  const syncResolver = createResolver({
    repository,
    resolveControlledActionState() {
      return "validation_only_intent_checked";
    },
  });
  const asyncResolver = createResolver({
    repository,
    async resolveControlledActionState() {
      return "needs_clinic_review";
    },
  });

  assert.equal(
    (await syncResolver({ reviewId: review.id })).currentState,
    "validation_only_intent_checked"
  );
  assert.equal(
    (await asyncResolver({ reviewId: review.id })).currentState,
    "needs_clinic_review"
  );
});

test("repository context resolver handles state projection failures safely", async () => {
  const { repository, review } = createRepositoryWithReview();
  const cases = [
    [
      () => {
        throw new Error("boom");
      },
      RESOLVER_CODES.CONTROLLED_ACTION_STATE_RESOLUTION_FAILED,
    ],
    [
      async () => {
        throw new Error("boom");
      },
      RESOLVER_CODES.CONTROLLED_ACTION_STATE_RESOLUTION_FAILED,
    ],
    [() => null, RESOLVER_CODES.INVALID_CONTROLLED_ACTION_STATE],
    [() => "", RESOLVER_CODES.INVALID_CONTROLLED_ACTION_STATE],
    [() => ({}), RESOLVER_CODES.INVALID_CONTROLLED_ACTION_STATE],
  ];

  for (const [resolveControlledActionState, code] of cases) {
    const resolver = createResolver({ repository, resolveControlledActionState });

    await assertRejectsWithCode(() => resolver({ reviewId: review.id }), code);
  }
});

test("repository context resolver returns a safe immutable trusted context", async () => {
  const { repository, review } = createRepositoryWithReview({
    ...createSampleReviewRecord(),
    id: "review_safe_context",
  });
  const input = { reviewId: review.id };
  const inputBefore = JSON.stringify(input);
  const resolver = createResolver({
    repository,
    resolveControlledActionState({ review: projectedReview }) {
      projectedReview.selectedSlot.time = "mutated-projection";
      return "validation_only_intent_checked";
    },
  });
  const context = await resolver(input);

  assert.deepEqual(context, {
    contextType: "appointment_review_snapshot_context_v1",
    contextSource: "server_review_boundary",
    reviewId: review.id,
    currentState: "validation_only_intent_checked",
    observedReviewVersion: 1,
  });
  assert.equal(Object.isFrozen(context), true);
  context.currentState = "client_mutated";
  assert.equal(context.currentState, "validation_only_intent_checked");
  assert.equal(JSON.stringify(input), inputBefore);
  assert.equal(repository.getById(review.id).selectedSlot.time, "10:30");
  assert.equal(Object.hasOwn(context, "review"), false);
  assert.equal(Object.hasOwn(context, "snapshot"), false);
  assert.equal(Object.hasOwn(context, "repositoryType"), false);
  assert.equal(Object.hasOwn(context, "databasePersisted"), false);
  assert.equal(Object.hasOwn(context, "reviewFound"), false);
  assert.equal(Object.hasOwn(context, "persisted"), false);
  assert.doesNotMatch(JSON.stringify(context), /implant|10:30|Ayşe/);
});

test("repository context resolver repeated calls and repositories stay isolated", async () => {
  const first = createRepositoryWithReview(
    createSampleReviewRecord({ conversationKey: "whatsapp:+905322223333" })
  );
  const second = createRepositoryWithReview(
    createSampleReviewRecord({ conversationKey: "whatsapp:+905551112233" })
  );
  const firstResolver = createResolver({ repository: first.repository });
  const secondResolver = createResolver({
    repository: second.repository,
    resolveControlledActionState() {
      return "needs_clinic_review";
    },
  });

  const firstContext = await firstResolver({ reviewId: first.review.id });
  const repeatedFirstContext = await firstResolver({ reviewId: first.review.id });
  const secondContext = await secondResolver({ reviewId: second.review.id });

  assert.deepEqual(firstContext, repeatedFirstContext);
  assert.notDeepEqual(firstContext, secondContext);
  assert.equal(await second.repository.getVersionedSnapshotById(first.review.id), null);
  assert.equal(await first.repository.getVersionedSnapshotById(second.review.id), null);
});

test("Sprint 12J accepts the repository-backed review context resolver", async () => {
  const { repository, review } = createRepositoryWithReview();
  const baseDependencies = createMockAppointmentReviewControlledActionDependencies();
  const resolver = createResolver({
    repository,
    resolveControlledActionState(input) {
      assert.equal(input.reviewId, review.id);
      assert.equal(input.repositoryVersion, 1);
      return "validation_only_intent_checked";
    },
  });
  const result = await handleAppointmentReviewControlledActionValidation({
    method: "POST",
    reviewId: review.id,
    body: {
      actionIntent: "approve_intent",
      requestId: "request_repository_context_resolver",
      idempotencyKey: "repository_context_resolver:approve",
      expectedReviewVersion: 1,
    },
    dependencies: {
      ...baseDependencies,
      resolveAppointmentReviewContext: resolver,
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.handlerCompleted, true);
  assert.equal(result.assemblyResult.pipelineInput.observedReviewVersion, 1);
  assert.equal(
    result.assemblyResult.pipelineInput.preconditionsInput.currentState,
    "validation_only_intent_checked"
  );
  assert.equal(result.executionEnabled, false);
  assert.equal(result.actionPerformed, false);
  assert.equal(result.commandDispatched, false);
  assert.equal(result.commandPersisted, false);
  assert.equal(result.bookingCreated, false);
  assert.equal(result.calendarChecked, false);
  assert.equal(result.databasePersisted, false);
  assert.equal(Object.hasOwn(result, "review"), false);
  assert.equal(repository.getById(review.id).selectedSlot.time, "10:30");
});

test("Sprint 12J fails unknown repository-backed review at review context stage", async () => {
  const { repository } = createRepositoryWithReview();
  const baseDependencies = createMockAppointmentReviewControlledActionDependencies();
  let projectionCalls = 0;
  const resolver = createResolver({
    repository,
    resolveControlledActionState() {
      projectionCalls += 1;
      return "validation_only_intent_checked";
    },
  });
  const result = await handleAppointmentReviewControlledActionValidation({
    method: "POST",
    reviewId: "review_missing",
    body: {
      actionIntent: "approve_intent",
      requestId: "request_repository_context_missing",
      idempotencyKey: "repository_context_resolver:missing",
      expectedReviewVersion: 1,
    },
    dependencies: {
      ...baseDependencies,
      resolveAppointmentReviewContext: resolver,
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "appointment_review_context_resolution_failed");
  assert.equal(result.failedStage, "appointment_review_context");
  assert.equal(result.executionEnabled, false);
  assert.equal(result.actionPerformed, false);
  assert.equal(result.commandDispatched, false);
  assert.equal(result.commandPersisted, false);
  assert.equal(result.bookingCreated, false);
  assert.equal(result.calendarChecked, false);
  assert.equal(result.databasePersisted, false);
  assert.equal(Object.hasOwn(result, "assemblyResult"), false);
  assert.equal(projectionCalls, 0);
});

test("repository context resolver source has no forbidden side effects", () => {
  const source = fs.readFileSync(
    "src/secretary/appointmentReviewRepositoryContextResolver.js",
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /createAppointment\(|createCalendarEvent\(|getCalendarProvider\(|manualAppointmentCalendarSync|googleapis|prisma|supabase|redis|sqlite|postgres|fetch|node:fs|require\("fs"\)|filesystem|dotenv|process\.env|audit|logger|logging|commandBus|eventBus|jobQueue|executor\(|new Executor|dispatcher|app\/api|app\/components|Date\.now|Math\.random|randomUUID|crypto|console/
  );
  assert.doesNotMatch(
    source,
    /repository\.(add|list|getById|update|patch|replace|save|approve|reject|incrementVersion|compareAndSet|compareAndSwap)\s*\(/
  );
  assert.doesNotMatch(
    source,
    /executionEnabled:\s*true|executorAvailable:\s*true|executionAvailable:\s*true|executionRequested:\s*true|actionPerformed:\s*true|commandDispatched:\s*true|commandPersisted:\s*true|receiptPersisted:\s*true|bookingCreated:\s*true|calendarChecked:\s*true|appointmentCreated:\s*true|calendarEventCreated:\s*true|databasePersisted:\s*true|reviewFound:\s*true|persisted:\s*true/
  );
});
