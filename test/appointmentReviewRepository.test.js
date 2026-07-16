const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  createAppointmentSelectionReply,
  createPendingAppointmentFlowState,
} = require("../src/messaging/appointmentFlowState");
const { generateSlotProposals } = require("../src/messaging/slotProposal");
const {
  PENDING_SECRETARY_REVIEW,
  createAppointmentReviewItem,
  createInMemoryAppointmentReviewQueue,
} = require("../src/secretary/appointmentReviewQueue");
const {
  APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_SCHEMA_VERSION,
  APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_TYPE,
  assertAppointmentReviewVersionedSnapshotCapability,
  createInMemoryAppointmentReviewRepository,
  validateAppointmentReviewRepository,
} = require("../src/secretary/appointmentReviewRepository");

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

test("appointment review in-memory repository starts empty", () => {
  const repository = createInMemoryAppointmentReviewRepository();

  assert.deepEqual(repository.list(), []);
  assert.equal(repository.getById("missing"), null);
});

test("appointment review in-memory repository adds lists and gets a valid review", () => {
  const repository = createInMemoryAppointmentReviewRepository();
  const review = createSampleReviewRecord();
  const addResult = repository.add(review);

  assert.equal(addResult.status, "ok");
  assert.deepEqual(addResult.review, review);
  assert.deepEqual(repository.list(), [review]);
  assert.deepEqual(repository.getById(review.id), review);
});

test("appointment review repository rejects duplicate and missing review ids safely", () => {
  const repository = createInMemoryAppointmentReviewRepository();
  const review = createSampleReviewRecord();

  assert.equal(repository.add(review).status, "ok");

  const duplicate = repository.add(review);
  const missingId = repository.add({ ...review, id: "   " });

  assert.equal(duplicate.status, "error");
  assert.equal(duplicate.error.code, "duplicate_review_id");
  assert.equal(missingId.status, "error");
  assert.equal(missingId.error.code, "missing_review_id");
});

test("appointment review repository rejects invalid review records using queue safety rules", () => {
  const repository = createInMemoryAppointmentReviewRepository();
  const review = createSampleReviewRecord();
  const invalidRecords = [
    null,
    { ...review, status: "booked" },
    { ...review, selectedSlot: null },
    { ...review, requiresSecretaryConfirmation: false },
    { ...review, bookingCreated: true },
    { ...review, calendarChecked: true },
  ];
  const results = invalidRecords.map((record) => repository.add(record));

  assert.ok(results.every((result) => result.status === "error"));
  assert.deepEqual(
    results.map((result) => result.error.code),
    [
      "invalid_review_record",
      "invalid_review_status",
      "missing_selected_slot",
      "missing_secretary_confirmation",
      "unsafe_review_flags",
      "unsafe_review_flags",
    ]
  );
});

test("appointment review repository does not mutate input or expose stored references", () => {
  const repository = createInMemoryAppointmentReviewRepository();
  const review = createSampleReviewRecord();
  const beforeAdd = JSON.stringify(review);
  const addResult = repository.add(review);

  addResult.review.selectedSlot.time = "mutated-add-result";
  const listedReview = repository.list()[0];
  listedReview.selectedSlot.time = "mutated-list-result";
  const loadedReview = repository.getById(review.id);
  loadedReview.status = "mutated-get-result";

  const freshReview = repository.getById(review.id);

  assert.equal(JSON.stringify(review), beforeAdd);
  assert.equal(freshReview.selectedSlot.time, "10:30");
  assert.equal(freshReview.status, PENDING_SECRETARY_REVIEW);
});

test("appointment review repository instances and initial review data are isolated", () => {
  const initialReview = createSampleReviewRecord();
  const firstRepository = createInMemoryAppointmentReviewRepository({
    initialReviews: [initialReview],
  });
  const secondRepository = createInMemoryAppointmentReviewRepository();

  initialReview.selectedSlot.time = "mutated-initial";
  firstRepository.list()[0].selectedSlot.time = "mutated-list";

  assert.equal(firstRepository.list().length, 1);
  assert.equal(firstRepository.getById(initialReview.id).selectedSlot.time, "10:30");
  assert.deepEqual(secondRepository.list(), []);

  const secondAdd = secondRepository.add(
    createSampleReviewRecord({ conversationKey: "whatsapp:+905551112233" })
  );

  assert.equal(secondAdd.status, "ok");
  assert.equal(firstRepository.list().length, 1);
  assert.equal(secondRepository.list().length, 1);
});

test("appointment review repository output ordering matches queue insertion ordering", () => {
  const repository = createInMemoryAppointmentReviewRepository();
  const firstReview = createSampleReviewRecord({
    conversationKey: "whatsapp:+905322223333",
  });
  const secondReview = createSampleReviewRecord({
    conversationKey: "whatsapp:+905551112233",
  });

  repository.add(firstReview);
  repository.add(secondReview);

  assert.deepEqual(
    repository.list().map((review) => review.id),
    [firstReview.id, secondReview.id]
  );
});

test("appointment review repository keeps the base contract compatible", () => {
  const repository = createInMemoryAppointmentReviewRepository();

  assert.equal(typeof repository.add, "function");
  assert.equal(typeof repository.list, "function");
  assert.equal(typeof repository.getById, "function");
  assert.equal(
    validateAppointmentReviewRepository({
      add() {},
      list() {},
      getById() {},
    }).ok,
    true
  );
  assert.equal(
    validateAppointmentReviewRepository({
      add() {},
      list() {},
      getById() {},
      getVersionedSnapshotById() {},
    }).ok,
    true
  );
  assert.equal(Object.hasOwn(repository, "approve"), false);
  assert.equal(Object.hasOwn(repository, "reject"), false);
});

test("appointment review repository contract validation reports missing methods", () => {
  assert.equal(
    validateAppointmentReviewRepository({ list() {}, getById() {} }).error
      .message,
    "Appointment review repository is missing required add method."
  );
  assert.equal(
    validateAppointmentReviewRepository({ add() {}, getById() {} }).error
      .message,
    "Appointment review repository is missing required list method."
  );
  assert.equal(
    validateAppointmentReviewRepository({ add() {}, list() {} }).error.message,
    "Appointment review repository is missing required getById method."
  );
});

test("appointment review versioned snapshot capability validates separately", () => {
  const repository = createInMemoryAppointmentReviewRepository();
  const baseOnlyRepository = {
    add() {},
    list() {},
    getById() {},
  };

  assert.equal(typeof repository.getVersionedSnapshotById, "function");
  assert.equal(
    assertAppointmentReviewVersionedSnapshotCapability(repository).ok,
    true
  );
  assert.equal(validateAppointmentReviewRepository(baseOnlyRepository).ok, true);
  assert.equal(
    assertAppointmentReviewVersionedSnapshotCapability(null).error.code,
    "invalid_appointment_review_repository"
  );
  assert.equal(
    assertAppointmentReviewVersionedSnapshotCapability(baseOnlyRepository).error
      .code,
    "missing_versioned_snapshot_capability"
  );
  assert.equal(
    assertAppointmentReviewVersionedSnapshotCapability({
      getVersionedSnapshotById: "not-a-function",
    }).error.code,
    "missing_versioned_snapshot_capability"
  );
});

test("appointment review repository returns a versioned in-memory snapshot", () => {
  const repository = createInMemoryAppointmentReviewRepository();
  const review = createSampleReviewRecord();
  const addResult = repository.add({ ...review, version: 99 });
  const snapshot = repository.getVersionedSnapshotById(review.id);

  assert.equal(addResult.status, "ok");
  assert.equal(snapshot.snapshotType, APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_TYPE);
  assert.equal(
    snapshot.schemaVersion,
    APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_SCHEMA_VERSION
  );
  assert.equal(snapshot.reviewId, review.id);
  assert.equal(snapshot.version, 1);
  assert.deepEqual(snapshot.review, review);
  assert.equal(snapshot.repositoryType, "in_memory");
  assert.equal(snapshot.persistence, "not_persisted");
  assert.equal(snapshot.databasePersisted, false);
  assert.equal(Object.hasOwn(snapshot, "reviewFound"), false);
  assert.equal(Object.hasOwn(snapshot, "persisted"), false);
  assert.equal(Object.hasOwn(snapshot, "productionReady"), false);
});

test("appointment review repository exposes version metadata only in snapshots", () => {
  const repository = createInMemoryAppointmentReviewRepository();
  const review = createSampleReviewRecord();
  const addResult = repository.add({ ...review, version: 42 });
  const listResult = repository.list();
  const getResult = repository.getById(review.id);
  const snapshot = repository.getVersionedSnapshotById(review.id);

  assert.equal(Object.hasOwn(addResult.review, "version"), false);
  assert.equal(Object.hasOwn(listResult[0], "version"), false);
  assert.equal(Object.hasOwn(getResult, "version"), false);
  assert.equal(snapshot.version, 1);
  assert.equal(Object.hasOwn(snapshot.review, "version"), false);
});

test("appointment review versioned snapshot handles missing ids safely", () => {
  const repository = createInMemoryAppointmentReviewRepository();

  assert.equal(repository.getVersionedSnapshotById("missing-review"), null);
  assert.equal(repository.getVersionedSnapshotById("   "), null);
  assert.equal(repository.getVersionedSnapshotById(null), null);
  assert.equal(repository.getVersionedSnapshotById(undefined), null);
});

test("appointment review repository reads do not increment snapshot version", () => {
  const repository = createInMemoryAppointmentReviewRepository();
  const review = createSampleReviewRecord();

  assert.equal(repository.add(review).status, "ok");

  const initialSnapshot = repository.getVersionedSnapshotById(review.id);
  repository.list();
  repository.getById(review.id);
  repository.getVersionedSnapshotById(review.id);
  const duplicate = repository.add(review);
  const finalSnapshot = repository.getVersionedSnapshotById(review.id);

  assert.equal(duplicate.status, "error");
  assert.equal(initialSnapshot.version, 1);
  assert.equal(finalSnapshot.version, 1);
  assert.deepEqual(finalSnapshot, initialSnapshot);
});

test("appointment review versioned snapshots are immutable defensive objects", () => {
  const repository = createInMemoryAppointmentReviewRepository();
  const review = createSampleReviewRecord();

  repository.add(review);

  const firstSnapshot = repository.getVersionedSnapshotById(review.id);
  const secondSnapshot = repository.getVersionedSnapshotById(review.id);

  assert.notEqual(firstSnapshot, secondSnapshot);
  assert.notEqual(firstSnapshot.review, secondSnapshot.review);
  assert.equal(Object.isFrozen(firstSnapshot), true);
  assert.equal(Object.isFrozen(firstSnapshot.review), true);
  assert.equal(Object.isFrozen(firstSnapshot.review.selectedSlot), true);
  firstSnapshot.version = 2;
  firstSnapshot.review.selectedSlot.time = "mutated-snapshot";
  assert.equal(firstSnapshot.version, 1);
  assert.equal(firstSnapshot.review.selectedSlot.time, "10:30");
  assert.equal(
    repository.getVersionedSnapshotById(review.id).review.selectedSlot.time,
    "10:30"
  );
});

test("appointment review public read mutations cannot alter versioned snapshots", () => {
  const repository = createInMemoryAppointmentReviewRepository();
  const review = createSampleReviewRecord();
  const addResult = repository.add(review);
  const listResult = repository.list();
  const getResult = repository.getById(review.id);

  addResult.review.selectedSlot.time = "mutated-add";
  listResult[0].selectedSlot.time = "mutated-list";
  getResult.selectedSlot.time = "mutated-get";

  const snapshot = repository.getVersionedSnapshotById(review.id);

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.review.selectedSlot.time, "10:30");
});

test("appointment review initial reviews receive isolated internal version one", () => {
  const firstReview = {
    ...createSampleReviewRecord(),
    version: 73,
  };
  const duplicateReview = {
    ...firstReview,
    selectedSlot: {
      ...firstReview.selectedSlot,
      time: "11:00",
    },
    version: 74,
  };
  const initialReviews = [firstReview, duplicateReview];
  const beforeInitialReviews = JSON.stringify(initialReviews);
  const repository = createInMemoryAppointmentReviewRepository({
    initialReviews,
  });

  assert.equal(JSON.stringify(initialReviews), beforeInitialReviews);

  initialReviews[0].selectedSlot.time = "mutated-initial-input";

  const snapshot = repository.getVersionedSnapshotById(firstReview.id);

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.review.selectedSlot.time, "10:30");
  assert.equal(Object.hasOwn(repository.list()[0], "version"), false);
  assert.equal(Object.hasOwn(snapshot.review, "version"), false);
  assert.equal(repository.list().length, 1);
});

test("appointment review repository instances isolate snapshots and versions", () => {
  const firstReview = createSampleReviewRecord({
    conversationKey: "whatsapp:+905322223333",
  });
  const secondReview = createSampleReviewRecord({
    conversationKey: "whatsapp:+905551112233",
  });
  const firstRepository = createInMemoryAppointmentReviewRepository();
  const secondRepository = createInMemoryAppointmentReviewRepository();

  firstRepository.add(firstReview);
  secondRepository.add(secondReview);

  const firstSnapshot = firstRepository.getVersionedSnapshotById(firstReview.id);
  const secondSnapshot = secondRepository.getVersionedSnapshotById(secondReview.id);

  assert.equal(secondRepository.getVersionedSnapshotById(firstReview.id), null);
  assert.equal(firstRepository.getVersionedSnapshotById(secondReview.id), null);
  assert.notDeepEqual(firstSnapshot, secondSnapshot);
  assert.equal(firstSnapshot.version, 1);
  assert.equal(secondSnapshot.version, 1);
});

test("appointment review queue operates with an injected repository", () => {
  const repository = createInMemoryAppointmentReviewRepository();
  const queue = createInMemoryAppointmentReviewQueue({ repository });
  const addResult = queue.addAppointmentReview(
    createSampleAppointmentSelectionReview()
  );

  assert.equal(addResult.status, "ok");
  assert.deepEqual(queue.listAppointmentReviews(), [addResult.review]);
  assert.deepEqual(queue.getAppointmentReviewById(addResult.review.id), addResult.review);
  assert.deepEqual(repository.list(), [addResult.review]);
});

test("appointment review queue rejects malformed repository injection safely", () => {
  assert.throws(
    () => createInMemoryAppointmentReviewQueue({ repository: { add() {} } }),
    /missing required list method/
  );
});

test("appointment review repository modules have no forbidden side effects", () => {
  const repositorySource = fs.readFileSync(
    "src/secretary/appointmentReviewRepository.js",
    "utf8"
  );
  const queueSource = fs.readFileSync(
    "src/secretary/appointmentReviewQueue.js",
    "utf8"
  );
  const forbidden =
    /createAppointment\(|createCalendarEvent\(|getCalendarProvider\(|manualAppointmentCalendarSync|googleapis|prisma|supabase|redis|sqlite|postgres|fetch|node:fs|require\("fs"\)|filesystem|dotenv|process\.env|audit|logger|logging|commandBus|eventBus|jobQueue|executor\(|new Executor|dispatcher|app\/api|app\/components|Date\.now|Math\.random|randomUUID|crypto/;

  assert.doesNotMatch(repositorySource, forbidden);
  assert.doesNotMatch(queueSource, forbidden);
  assert.doesNotMatch(
    repositorySource,
    /executionEnabled:\s*true|bookingCreated:\s*true|calendarChecked:\s*true|databasePersisted:\s*true|persisted:\s*true/
  );
});
