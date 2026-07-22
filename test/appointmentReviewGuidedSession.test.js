const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  GUIDED_SESSION_FILTERS,
  clearAppointmentReviewGuidedSessionItem,
  initializeAppointmentReviewGuidedSession,
  getAppointmentReviewGuidedSessionItemKey,
  getEmptyAppointmentReviewGuidedSession,
  filterAppointmentReviewsByGuidedSession,
  findNextUnreviewedAppointmentReviewId,
  markAppointmentReviewGuidedSessionItem,
  reconcileAppointmentReviewGuidedSession,
} = require("../src/secretary/appointmentReviewGuidedSession");

function createReview(id, observedReviewVersion = 1) {
  return Object.freeze({
    id,
    observedReviewVersion,
    status: "pending_secretary_review",
    bookingCreated: false,
    calendarChecked: false,
    selectedSlot: Object.freeze({
      id: `${id}_slot`,
      source: "mock",
    }),
  });
}

test("guided session initializes deterministically from safe queue projection", () => {
  const reviews = [createReview("review_a", 3), createReview("review_b", 4)];
  const before = JSON.stringify(reviews);
  const session = initializeAppointmentReviewGuidedSession(reviews);

  assert.equal(JSON.stringify(reviews), before);
  assert.equal(session.active, true);
  assert.deepEqual(
    session.items.map((item) => item.reviewId),
    ["review_a", "review_b"]
  );
  assert.deepEqual(
    session.items.map((item) => item.itemKey),
    ["review_a:3", "review_b:4"]
  );
  assert.ok(session.items.every((item) => item.status === "unreviewed"));
  assert.deepEqual(session.reviewedItemKeys, []);
  assert.deepEqual(session.totals, {
    total: 2,
    reviewed: 0,
    remaining: 2,
    stale: 0,
    progressText: "0 / 2 reviewed locally",
  });
  assert.equal(session.localOnly, true);
  assert.equal(session.persisted, false);
  assert.equal(session.sentToServer, false);
});

test("guided session marks and clears one review locally without mutating trusted data", () => {
  const reviews = [createReview("review_a", 1), createReview("review_b", 1)];
  const before = JSON.stringify(reviews);
  const session = initializeAppointmentReviewGuidedSession(reviews);
  const marked = markAppointmentReviewGuidedSessionItem(session, reviews[1]);
  const cleared = clearAppointmentReviewGuidedSessionItem(marked, reviews[1]);

  assert.equal(JSON.stringify(reviews), before);
  assert.equal(marked.items[0].reviewedLocally, false);
  assert.equal(marked.items[1].reviewedLocally, true);
  assert.equal(marked.items[1].status, "reviewed_locally");
  assert.deepEqual(marked.reviewedItemKeys, ["review_b:1"]);
  assert.equal(marked.totals.reviewed, 1);
  assert.equal(marked.totals.remaining, 1);
  assert.ok(Object.isFrozen(marked));
  assert.equal(cleared.items[1].status, "unreviewed");
  assert.equal(cleared.totals.reviewed, 0);
  assert.equal(cleared.totals.remaining, 2);
});

test("guided session reset returns empty inactive local state", () => {
  const empty = getEmptyAppointmentReviewGuidedSession();

  assert.equal(empty.active, false);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.totals.total, 0);
  assert.equal(empty.totals.reviewed, 0);
  assert.equal(empty.localOnly, true);
  assert.equal(empty.persisted, false);
  assert.equal(empty.sentToServer, false);
});

test("guided session next unreviewed follows queue order and wraps deterministically", () => {
  const session = initializeAppointmentReviewGuidedSession([
    createReview("review_a"),
    createReview("review_b"),
    createReview("review_c"),
  ]);
  const marked = markAppointmentReviewGuidedSessionItem(session, {
    reviewId: "review_b",
    observedReviewVersion: 1,
  });
  const markedAgain = markAppointmentReviewGuidedSessionItem(marked, {
    reviewId: "review_c",
    observedReviewVersion: 1,
  });
  const allReviewed = markAppointmentReviewGuidedSessionItem(markedAgain, {
    reviewId: "review_a",
    observedReviewVersion: 1,
  });

  assert.equal(
    findNextUnreviewedAppointmentReviewId(marked, {
      selectedReviewId: "review_a",
    }),
    "review_c"
  );
  assert.equal(
    findNextUnreviewedAppointmentReviewId(markedAgain, {
      selectedReviewId: "review_c",
    }),
    "review_a"
  );
  assert.equal(
    findNextUnreviewedAppointmentReviewId(markedAgain, {
      selectedReviewId: "",
    }),
    "review_a"
  );
  assert.equal(findNextUnreviewedAppointmentReviewId(allReviewed), null);
});

test("guided session filters preserve queue order", () => {
  const reviews = [
    createReview("review_a"),
    createReview("review_b"),
    createReview("review_c"),
  ];
  const session = markAppointmentReviewGuidedSessionItem(
    initializeAppointmentReviewGuidedSession(reviews),
    reviews[1]
  );

  assert.deepEqual(
    filterAppointmentReviewsByGuidedSession(
      reviews,
      session,
      GUIDED_SESSION_FILTERS.ALL
    ).map((review) => review.id),
    ["review_a", "review_b", "review_c"]
  );
  assert.deepEqual(
    filterAppointmentReviewsByGuidedSession(
      reviews,
      session,
      GUIDED_SESSION_FILTERS.UNREVIEWED
    ).map((review) => review.id),
    ["review_a", "review_c"]
  );
  assert.deepEqual(
    filterAppointmentReviewsByGuidedSession(
      reviews,
      session,
      GUIDED_SESSION_FILTERS.REVIEWED
    ).map((review) => review.id),
    ["review_b"]
  );
});

test("guided session reconciles refreshes and resets reviewed marks on version changes", () => {
  const session = markAppointmentReviewGuidedSessionItem(
    initializeAppointmentReviewGuidedSession([
      createReview("review_a", 1),
      createReview("review_b", 1),
    ]),
    createReview("review_a", 1)
  );
  const reconciled = reconcileAppointmentReviewGuidedSession(session, [
    createReview("review_b", 1),
    createReview("review_a", 2),
    createReview("review_c", 1),
  ]);

  assert.deepEqual(
    reconciled.items.map((item) => item.reviewId),
    ["review_b", "review_a", "review_c"]
  );
  assert.equal(reconciled.items[1].status, "unreviewed");
  assert.equal(reconciled.items[1].versionChanged, true);
  assert.equal(reconciled.totals.reviewed, 0);
  assert.equal(reconciled.totals.stale, 1);
  assert.match(reconciled.versionChangeNotice, /trusted review version changed/i);
  assert.deepEqual(reconciled.reviewedItemKeys, []);
});

test("guided session preserves same-version reviewed status and removes missing reviews", () => {
  const session = markAppointmentReviewGuidedSessionItem(
    initializeAppointmentReviewGuidedSession([
      createReview("review_a", 1),
      createReview("review_b", 1),
    ]),
    createReview("review_b", 1)
  );
  const reconciled = reconcileAppointmentReviewGuidedSession(session, [
    createReview("review_b", 1),
    createReview("review_c", 1),
  ]);

  assert.deepEqual(
    reconciled.items.map((item) => item.reviewId),
    ["review_b", "review_c"]
  );
  assert.equal(reconciled.items[0].status, "reviewed_locally");
  assert.equal(reconciled.items[1].status, "unreviewed");
  assert.equal(reconciled.totals.reviewed, 1);
  assert.equal(reconciled.totals.remaining, 1);
});

test("guided session item keys use review id and trusted version only", () => {
  assert.equal(
    getAppointmentReviewGuidedSessionItemKey({
      reviewId: "review_key",
      observedReviewVersion: 7,
      patientName: "SYNTHETIC_NAME_PLACEHOLDER",
    }),
    "review_key:7"
  );
});

test("guided session helper has no persistence network or runtime side effects", () => {
  const source = fs.readFileSync(
    "src/secretary/appointmentReviewGuidedSession.js",
    "utf8"
  );

  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /document\.cookie|process\.env|AsyncLocalStorage/);
  assert.doesNotMatch(
    source,
    /createAppointment\(|createCalendarEvent\(|googleapis/
  );
  assert.doesNotMatch(source, /prisma|supabase|redis|new Date|Math\.random/);
  assert.doesNotMatch(source, /approved|rejected|resolved|authorized|executed/);
});
