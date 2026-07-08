const assert = require("node:assert/strict");
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

function createSampleAppointmentSelectionReview() {
  const flowState = createPendingAppointmentFlowState(
    generateSlotProposals({
      message: "İmplant yaptırmak istiyorum, çarşamba müsait slot var mı?",
      maxSlots: 3,
    })
  );

  return createAppointmentSelectionReply(flowState, "10:30 olur")
    .appointmentSelectionReview;
}

test("appointmentSelectionReview can create a pending secretary review item", () => {
  const appointmentSelectionReview = createSampleAppointmentSelectionReview();
  const result = createAppointmentReviewItem(appointmentSelectionReview, {
    conversationKey: "whatsapp:+905322223333",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.review.status, PENDING_SECRETARY_REVIEW);
  assert.match(result.review.id, /^review_mock_whatsapp_905322223333_/);
  assert.equal(result.review.selectedSlot.time, "10:30");
  assert.equal(result.review.treatment, "implant");
  assert.equal(result.review.day, "wednesday");
  assert.equal(result.review.appointmentPurpose, "initial_consultation");
  assert.equal(result.review.requiresSecretaryConfirmation, true);
  assert.equal(result.review.bookingCreated, false);
  assert.equal(result.review.calendarChecked, false);
  assert.equal(
    result.review.metadata.conversationKey,
    "whatsapp:+905322223333"
  );
});

test("appointment review ids include conversation key when available", () => {
  const appointmentSelectionReview = createSampleAppointmentSelectionReview();
  const firstResult = createAppointmentReviewItem(appointmentSelectionReview, {
    conversationKey: "whatsapp:+905322223333",
    message: "10:30 olur",
  });
  const secondResult = createAppointmentReviewItem(appointmentSelectionReview, {
    conversationKey: "whatsapp:+905551112233",
    message: "10:30 olur",
  });

  assert.notEqual(firstResult.review.id, secondResult.review.id);
  assert.match(firstResult.review.id, /whatsapp_905322223333/);
  assert.match(secondResult.review.id, /whatsapp_905551112233/);
  assert.doesNotMatch(firstResult.review.id, /10_30_olur|olur/);
  assert.doesNotMatch(secondResult.review.id, /10_30_olur|olur/);
});

test("appointment review queue keeps same-slot reviews from different conversations", () => {
  const queue = createInMemoryAppointmentReviewQueue();
  const appointmentSelectionReview = createSampleAppointmentSelectionReview();
  const firstResult = queue.addAppointmentReview(appointmentSelectionReview, {
    conversationKey: "whatsapp:+905322223333",
  });
  const secondResult = queue.addAppointmentReview(appointmentSelectionReview, {
    conversationKey: "whatsapp:+905551112233",
  });
  const listedReviews = queue.listAppointmentReviews();

  assert.equal(firstResult.status, "ok");
  assert.equal(secondResult.status, "ok");
  assert.notEqual(firstResult.review.id, secondResult.review.id);
  assert.equal(listedReviews.length, 2);
  assert.deepEqual(
    listedReviews.map((review) => review.selectedSlot.time),
    ["10:30", "10:30"]
  );
});

test("appointment review queue can add, list, and get review items", () => {
  const queue = createInMemoryAppointmentReviewQueue();
  const addResult = queue.addAppointmentReview(
    createSampleAppointmentSelectionReview()
  );
  const listedReviews = queue.listAppointmentReviews();
  const loadedReview = queue.getAppointmentReviewById(addResult.review.id);

  assert.equal(addResult.status, "ok");
  assert.equal(listedReviews.length, 1);
  assert.deepEqual(listedReviews[0], addResult.review);
  assert.deepEqual(loadedReview, addResult.review);
});

test("appointment review queue returns defensive copies", () => {
  const queue = createInMemoryAppointmentReviewQueue();
  const addResult = queue.addAppointmentReview(
    createSampleAppointmentSelectionReview()
  );
  const listedReview = queue.listAppointmentReviews()[0];
  const loadedReview = queue.getAppointmentReviewById(addResult.review.id);

  listedReview.selectedSlot.time = "mutated";
  loadedReview.status = "mutated";

  const freshReview = queue.getAppointmentReviewById(addResult.review.id);

  assert.equal(freshReview.selectedSlot.time, "10:30");
  assert.equal(freshReview.status, PENDING_SECRETARY_REVIEW);
});

test("appointment review queue validates allowed review statuses", () => {
  const queue = createInMemoryAppointmentReviewQueue();
  const addResult = queue.addAppointmentReview(
    createSampleAppointmentSelectionReview()
  );
  const invalidUpdate = queue.updateAppointmentReviewStatus(
    addResult.review.id,
    "booked"
  );
  const validUpdate = queue.updateAppointmentReviewStatus(
    addResult.review.id,
    "needs_follow_up"
  );

  assert.equal(invalidUpdate.status, "error");
  assert.equal(invalidUpdate.error.code, "invalid_review_status");
  assert.equal(validUpdate.status, "ok");
  assert.equal(validUpdate.review.status, "needs_follow_up");
  assert.equal(validUpdate.review.bookingCreated, false);
  assert.equal(validUpdate.review.calendarChecked, false);
});

test("appointment review queue reports missing review ids safely", () => {
  const queue = createInMemoryAppointmentReviewQueue();
  const result = queue.updateAppointmentReviewStatus(
    "missing-review",
    "needs_follow_up"
  );

  assert.equal(result.status, "error");
  assert.equal(result.error.code, "review_not_found");
});

test("invalid appointment selection review payloads are rejected safely", () => {
  const invalidPayloads = [
    null,
    { status: "pending_secretary_confirmation" },
    {
      ...createSampleAppointmentSelectionReview(),
      status: "booked",
    },
    {
      ...createSampleAppointmentSelectionReview(),
      bookingCreated: true,
    },
    {
      ...createSampleAppointmentSelectionReview(),
      calendarChecked: true,
    },
  ];

  const results = invalidPayloads.map((payload) =>
    createAppointmentReviewItem(payload)
  );

  assert.ok(results.every((result) => result.status === "error"));
  assert.deepEqual(
    results.map((result) => result.error.code),
    [
      "invalid_review_payload",
      "missing_selected_slot",
      "invalid_review_status",
      "unsafe_review_flags",
      "unsafe_review_flags",
    ]
  );
});

test("appointment review queue does not call appointment creation or calendar provider", () => {
  let appointmentCreationCalled = false;
  let calendarProviderCalled = false;
  const queue = createInMemoryAppointmentReviewQueue();
  const result = queue.addAppointmentReview(
    createSampleAppointmentSelectionReview(),
    {
      createAppointment() {
        appointmentCreationCalled = true;
      },
      calendarProvider() {
        calendarProviderCalled = true;
      },
    }
  );

  assert.equal(result.status, "ok");
  assert.equal(result.review.bookingCreated, false);
  assert.equal(result.review.calendarChecked, false);
  assert.equal(appointmentCreationCalled, false);
  assert.equal(calendarProviderCalled, false);
});
