const assert = require("node:assert/strict");
const test = require("node:test");

const {
  handleSecretaryAppointmentReviewQueueRequest,
} = require("../src/api/secretaryAppointmentReviewQueueHandler");
const {
  createAppointmentSelectionReply,
  createPendingAppointmentFlowState,
} = require("../src/messaging/appointmentFlowState");
const { generateSlotProposals } = require("../src/messaging/slotProposal");
const {
  createInMemoryAppointmentReviewQueue,
} = require("../src/secretary/appointmentReviewQueue");

function createQueueWithReview() {
  const queue = createInMemoryAppointmentReviewQueue();
  const flowState = createPendingAppointmentFlowState(
    generateSlotProposals({
      message: "İmplant için çarşamba saat önerir misiniz?",
      maxSlots: 3,
    })
  );
  const appointmentSelectionReview = createAppointmentSelectionReply(
    flowState,
    "10:30 olur"
  ).appointmentSelectionReview;
  const addResult = queue.addAppointmentReview(appointmentSelectionReview, {
    conversationKey: "whatsapp:+905322223333",
  });

  return {
    queue,
    review: addResult.review,
  };
}

test("secretary appointment review queue handler lists injected pending reviews", () => {
  const { queue } = createQueueWithReview();
  const response = handleSecretaryAppointmentReviewQueueRequest(
    { method: "GET" },
    { appointmentReviewQueue: queue }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.source, "mock");
  assert.equal(response.body.persistence, "not_persisted");
  assert.equal(response.body.count, 1);
  assert.equal(response.body.reviews[0].status, "pending_secretary_review");
  assert.equal(response.body.reviews[0].bookingCreated, false);
  assert.equal(response.body.reviews[0].calendarChecked, false);
  assert.equal(response.body.reviews[0].requiresSecretaryConfirmation, true);
  assert.equal(response.body.safety.readOnly, true);
  assert.equal(response.body.safety.createsAppointment, false);
  assert.equal(response.body.safety.writesCalendar, false);
  assert.equal(response.body.safety.usesDatabase, false);
});

test("secretary appointment review queue handler gets one review by id", () => {
  const { queue, review } = createQueueWithReview();
  const response = handleSecretaryAppointmentReviewQueueRequest(
    {
      method: "GET",
      id: review.id,
    },
    { appointmentReviewQueue: queue }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.review.id, review.id);
  assert.equal(response.body.review.selectedSlot.time, "10:30");
  assert.equal(response.body.review.bookingCreated, false);
  assert.equal(response.body.review.calendarChecked, false);
});

test("secretary appointment review queue handler returns safe not found", () => {
  const { queue } = createQueueWithReview();
  const response = handleSecretaryAppointmentReviewQueueRequest(
    {
      method: "GET",
      id: "missing-review",
    },
    { appointmentReviewQueue: queue }
  );

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.status, "error");
  assert.equal(response.body.source, "mock");
  assert.equal(response.body.error.code, "review_not_found");
});

test("secretary appointment review queue handler returns empty mock response without queue", () => {
  const response = handleSecretaryAppointmentReviewQueueRequest({
    method: "GET",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.source, "mock");
  assert.deepEqual(response.body.reviews, []);
  assert.equal(response.body.count, 0);
  assert.equal(response.body.safety.readOnly, true);
  assert.equal(response.body.safety.usesDatabase, false);
});

test("secretary appointment review queue handler rejects non-read methods", () => {
  const methods = ["POST", "PUT", "PATCH", "DELETE"];
  const responses = methods.map((method) =>
    handleSecretaryAppointmentReviewQueueRequest({ method })
  );

  assert.ok(responses.every((response) => response.statusCode === 405));
  assert.ok(
    responses.every(
      (response) => response.body.error.code === "method_not_allowed"
    )
  );
});

test("secretary appointment review queue handler returns defensive data", () => {
  const { queue, review } = createQueueWithReview();
  const response = handleSecretaryAppointmentReviewQueueRequest(
    { method: "GET" },
    { appointmentReviewQueue: queue }
  );

  response.body.reviews[0].selectedSlot.time = "mutated";
  response.body.reviews[0].bookingCreated = true;

  const freshReview = queue.getAppointmentReviewById(review.id);

  assert.equal(freshReview.selectedSlot.time, "10:30");
  assert.equal(freshReview.bookingCreated, false);
});

test("secretary appointment review queue handler does not call appointment creation or calendar provider", () => {
  let appointmentCreationCalled = false;
  let calendarProviderCalled = false;
  const { queue } = createQueueWithReview();
  const response = handleSecretaryAppointmentReviewQueueRequest(
    {
      method: "GET",
    },
    {
      appointmentReviewQueue: queue,
      createAppointment() {
        appointmentCreationCalled = true;
      },
      calendarProvider() {
        calendarProviderCalled = true;
      },
    }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.safety.createsAppointment, false);
  assert.equal(response.body.safety.writesCalendar, false);
  assert.equal(appointmentCreationCalled, false);
  assert.equal(calendarProviderCalled, false);
});

test("secretary appointment review queue handler response does not expose price or booking claims", () => {
  const { queue } = createQueueWithReview();
  const response = handleSecretaryAppointmentReviewQueueRequest(
    { method: "GET" },
    { appointmentReviewQueue: queue }
  );
  const serialized = JSON.stringify(response.body);

  assert.doesNotMatch(serialized, /\bTL\b|₺|price|fee|ücret|fiyat/i);
  assert.doesNotMatch(serialized, /randevunuz oluşturuldu|booked|confirmed/i);
  assert.doesNotMatch(serialized, /google_service_account|private_key/i);
});
