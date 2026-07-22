const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  GUIDANCE_CATEGORIES,
} = require("../src/secretary/appointmentReviewResolutionGuidanceContract");
const {
  GUIDED_SESSION_FILTERS,
  initializeAppointmentReviewGuidedSession,
  markAppointmentReviewGuidedSessionItem,
} = require("../src/secretary/appointmentReviewGuidedSession");
const {
  FOLLOW_UP_CATEGORY_FILTER_ALL,
  SUPPORTED_FOLLOW_UP_CATEGORIES,
  buildAppointmentReviewFollowUpFocusBoard,
  filterAppointmentReviewFollowUpFocusItems,
  findNextUnreviewedAppointmentReviewInFocus,
  getAppointmentReviewFollowUpCategoryLabel,
} = require("../src/secretary/appointmentReviewFollowUpFocusBoard");

function createHandoffItem({
  reviewId,
  observedReviewVersion = 1,
  readiness = "both_paths_blocked",
  categories = [],
}) {
  return Object.freeze({
    reviewId,
    trustedCurrentState: "validation_only_intent_checked",
    observedReviewVersion,
    readiness,
    followUpCategories: Object.freeze(["legacy_escalation_category"]),
    branches: Object.freeze(
      categories.map((category, index) =>
        Object.freeze({
          action: index === 0 ? "approve" : "reject",
          outcome:
            category === GUIDANCE_CATEGORIES.NO_ADDITIONAL_VALIDATION_CHECK
              ? "passed"
              : "blocked",
          requiredCheck: "synthetic_check",
          followUpCategory: "legacy_escalation_category",
          guidanceCategory: category,
          executionEnabled: false,
          executionAvailable: false,
          actionPerformed: false,
          bookingCreated: false,
          calendarChecked: false,
          databasePersisted: false,
          persistence: "not_persisted",
        })
      )
    ),
    executionEnabled: false,
    persistence: "not_persisted",
  });
}

function createHandoffResult(items) {
  return Object.freeze({
    accepted: true,
    preview: "secretary_shift_handoff_preview",
    validationOnly: true,
    items: Object.freeze(items),
    plainTextBrief: "SERVER RETURNED BRIEF",
  });
}

test("follow-up board extracts real Sprint 14D guidance categories deterministically", () => {
  const handoff = createHandoffResult([
    createHandoffItem({
      reviewId: "review_a",
      categories: [
        GUIDANCE_CATEGORIES.REVIEW_STATE_CHECK_REQUIRED,
        GUIDANCE_CATEGORIES.REVIEW_STATE_CHECK_REQUIRED,
      ],
    }),
    createHandoffItem({
      reviewId: "review_b",
      categories: [
        GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED,
        GUIDANCE_CATEGORIES.ACTOR_VERIFICATION_REQUIRED,
      ],
    }),
  ]);
  const before = JSON.stringify(handoff);
  const board = buildAppointmentReviewFollowUpFocusBoard(handoff);

  assert.equal(JSON.stringify(handoff), before);
  assert.deepEqual(board.items[0].followUpCategories, [
    GUIDANCE_CATEGORIES.REVIEW_STATE_CHECK_REQUIRED,
  ]);
  assert.deepEqual(board.items[1].followUpCategories, [
    GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED,
    GUIDANCE_CATEGORIES.ACTOR_VERIFICATION_REQUIRED,
  ]);
  assert.ok(Object.isFrozen(board));
  assert.equal(
    getAppointmentReviewFollowUpCategoryLabel(
      GUIDANCE_CATEGORIES.NO_ADDITIONAL_VALIDATION_CHECK
    ),
    "No current validation blocker"
  );
  assert.deepEqual(
    SUPPORTED_FOLLOW_UP_CATEGORIES,
    Object.values(GUIDANCE_CATEGORIES)
  );
});

test("follow-up board category counts count unique reviews and allow overlap", () => {
  const board = buildAppointmentReviewFollowUpFocusBoard(
    createHandoffResult([
      createHandoffItem({
        reviewId: "review_a",
        categories: [
          GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED,
          GUIDANCE_CATEGORIES.ACTOR_VERIFICATION_REQUIRED,
        ],
      }),
      createHandoffItem({
        reviewId: "review_b",
        categories: [GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED],
      }),
    ])
  );
  const countsByCode = Object.fromEntries(
    board.categories.map((category) => [category.code, category.count])
  );

  assert.equal(board.totalReviews, 2);
  assert.equal(countsByCode[GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED], 2);
  assert.equal(countsByCode[GUIDANCE_CATEGORIES.ACTOR_VERIFICATION_REQUIRED], 1);
  assert.equal(board.countsMayOverlap, true);
  assert.ok(
    board.categories.reduce((sum, category) => sum + category.count, 0) >
      board.totalReviews
  );
});

test("follow-up board all-category filter preserves queue order without duplicates", () => {
  const board = buildAppointmentReviewFollowUpFocusBoard(
    createHandoffResult([
      createHandoffItem({
        reviewId: "review_a",
        categories: [GUIDANCE_CATEGORIES.REQUEST_CORRECTION_REQUIRED],
      }),
      createHandoffItem({
        reviewId: "review_b",
        categories: [
          GUIDANCE_CATEGORIES.REQUEST_CORRECTION_REQUIRED,
          GUIDANCE_CATEGORIES.EXECUTION_POLICY_REVIEW_REQUIRED,
        ],
      }),
      createHandoffItem({
        reviewId: "review_c",
        categories: [GUIDANCE_CATEGORIES.MANUAL_INTERNAL_REVIEW_REQUIRED],
      }),
    ]),
    {
      categoryFilter: FOLLOW_UP_CATEGORY_FILTER_ALL,
    }
  );

  assert.deepEqual(
    board.items.map((item) => item.reviewId),
    ["review_a", "review_b", "review_c"]
  );
  assert.equal(new Set(board.items.map((item) => item.reviewId)).size, 3);
});

test("follow-up board single-category filters match any category once in queue order", () => {
  const handoff = createHandoffResult([
    createHandoffItem({
      reviewId: "review_a",
      categories: [GUIDANCE_CATEGORIES.REQUEST_CORRECTION_REQUIRED],
    }),
    createHandoffItem({
      reviewId: "review_b",
      categories: [
        GUIDANCE_CATEGORIES.REQUEST_CORRECTION_REQUIRED,
        GUIDANCE_CATEGORIES.EXECUTION_POLICY_REVIEW_REQUIRED,
      ],
    }),
    createHandoffItem({
      reviewId: "review_c",
      categories: [GUIDANCE_CATEGORIES.EXECUTION_POLICY_REVIEW_REQUIRED],
    }),
  ]);

  assert.deepEqual(
    buildAppointmentReviewFollowUpFocusBoard(handoff, {
      categoryFilter: GUIDANCE_CATEGORIES.REQUEST_CORRECTION_REQUIRED,
    }).items.map((item) => item.reviewId),
    ["review_a", "review_b"]
  );
  assert.deepEqual(
    buildAppointmentReviewFollowUpFocusBoard(handoff, {
      categoryFilter: GUIDANCE_CATEGORIES.EXECUTION_POLICY_REVIEW_REQUIRED,
    }).items.map((item) => item.reviewId),
    ["review_b", "review_c"]
  );
});

test("follow-up board uses neutral no-blocker wording", () => {
  const board = buildAppointmentReviewFollowUpFocusBoard(
    createHandoffResult([
      createHandoffItem({
        reviewId: "review_no_blocker",
        readiness: "both_paths_available",
        categories: [GUIDANCE_CATEGORIES.NO_ADDITIONAL_VALIDATION_CHECK],
      }),
    ])
  );
  const serialized = JSON.stringify(board);

  assert.equal(
    board.items[0].followUpCategoryLabels[0],
    "No current validation blocker"
  );
  assert.doesNotMatch(
    serialized,
    /ready to execute|safe to approve|safe to reject|recommended|priority/i
  );
});

test("follow-up board combines category and guided-session filters", () => {
  const handoff = createHandoffResult([
    createHandoffItem({
      reviewId: "review_a",
      observedReviewVersion: 1,
      categories: [GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED],
    }),
    createHandoffItem({
      reviewId: "review_b",
      observedReviewVersion: 1,
      categories: [GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED],
    }),
    createHandoffItem({
      reviewId: "review_c",
      observedReviewVersion: 1,
      categories: [GUIDANCE_CATEGORIES.ACTOR_VERIFICATION_REQUIRED],
    }),
  ]);
  const session = markAppointmentReviewGuidedSessionItem(
    initializeAppointmentReviewGuidedSession([
      { id: "review_a", observedReviewVersion: 1 },
      { id: "review_b", observedReviewVersion: 1 },
      { id: "review_c", observedReviewVersion: 1 },
    ]),
    { reviewId: "review_a", observedReviewVersion: 1 }
  );
  const unreviewedBoard = buildAppointmentReviewFollowUpFocusBoard(handoff, {
    categoryFilter: GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED,
    sessionFilter: GUIDED_SESSION_FILTERS.UNREVIEWED,
    guidedSession: session,
  });
  const reviewedBoard = buildAppointmentReviewFollowUpFocusBoard(handoff, {
    categoryFilter: GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED,
    sessionFilter: GUIDED_SESSION_FILTERS.REVIEWED,
    guidedSession: session,
  });

  assert.deepEqual(
    unreviewedBoard.items.map((item) => item.reviewId),
    ["review_b"]
  );
  assert.deepEqual(
    reviewedBoard.items.map((item) => item.reviewId),
    ["review_a"]
  );
});

test("follow-up board finds next unreviewed review in filtered focus order", () => {
  const handoff = createHandoffResult([
    createHandoffItem({
      reviewId: "review_a",
      categories: [GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED],
    }),
    createHandoffItem({
      reviewId: "review_b",
      categories: [GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED],
    }),
    createHandoffItem({
      reviewId: "review_c",
      categories: [GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED],
    }),
  ]);
  const session = markAppointmentReviewGuidedSessionItem(
    initializeAppointmentReviewGuidedSession([
      { id: "review_a", observedReviewVersion: 1 },
      { id: "review_b", observedReviewVersion: 1 },
      { id: "review_c", observedReviewVersion: 1 },
    ]),
    { reviewId: "review_b", observedReviewVersion: 1 }
  );
  const board = buildAppointmentReviewFollowUpFocusBoard(handoff, {
    guidedSession: session,
  });
  const allReviewedBoard = buildAppointmentReviewFollowUpFocusBoard(handoff, {
    guidedSession: markAppointmentReviewGuidedSessionItem(
      markAppointmentReviewGuidedSessionItem(session, {
        reviewId: "review_a",
        observedReviewVersion: 1,
      }),
      {
        reviewId: "review_c",
        observedReviewVersion: 1,
      }
    ),
  });

  assert.equal(
    findNextUnreviewedAppointmentReviewInFocus(board, {
      selectedReviewId: "review_a",
    }),
    "review_c"
  );
  assert.equal(
    findNextUnreviewedAppointmentReviewInFocus(board, {
      selectedReviewId: "review_outside_focus",
    }),
    "review_a"
  );
  assert.equal(findNextUnreviewedAppointmentReviewInFocus(allReviewedBoard), null);
});

test("follow-up board helper has no persistence network sensitive or runtime side effects", () => {
  const source = fs.readFileSync(
    "src/secretary/appointmentReviewFollowUpFocusBoard.js",
    "utf8"
  );

  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /document\.cookie|process\.env|AsyncLocalStorage/);
  assert.doesNotMatch(source, /createAppointment|createCalendarEvent|googleapis/);
  assert.doesNotMatch(source, /prisma|supabase|redis|new Date|Math\.random/);
  assert.doesNotMatch(source, /patientName|patientPhone|patientEmail|rawMessage/);
  assert.doesNotMatch(source, /recommended|preferred|priority|assignedTo/i);
  assert.doesNotMatch(source, /actionPerformed:\s*true|bookingCreated:\s*true/);
});
