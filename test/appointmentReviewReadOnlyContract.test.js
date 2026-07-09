const assert = require("node:assert/strict");
const test = require("node:test");

const {
  READ_ONLY_MODE,
  buildAppointmentReviewDetailResponse,
  buildAppointmentReviewListResponse,
  createAppointmentReviewReadOnlySafety,
  sanitizeAppointmentReviewForReadOnly,
} = require("../src/secretary/appointmentReviewReadOnlyContract");

function createUnsafeReview() {
  return {
    id: "review_mock_demo",
    status: "pending_secretary_review",
    selectedSlot: {
      id: "slot-1030",
      doctorName: "Dr. Demo",
      time: "10:30",
    },
    treatment: "implant",
    requiresSecretaryConfirmation: false,
    bookingCreated: true,
    calendarChecked: true,
  };
}

test("read-only safety contract makes appointment review boundaries explicit", () => {
  const safety = createAppointmentReviewReadOnlySafety();

  assert.equal(safety.mode, READ_ONLY_MODE);
  assert.equal(safety.readOnly, true);
  assert.equal(safety.source, "mock");
  assert.equal(safety.persistence, "not_persisted");
  assert.equal(safety.requiresSecretaryConfirmation, true);
  assert.equal(safety.bookingCreated, false);
  assert.equal(safety.calendarChecked, false);
  assert.equal(safety.createsAppointment, false);
  assert.equal(safety.writesCalendar, false);
  assert.equal(safety.checksCalendarConflict, false);
  assert.equal(safety.usesDatabase, false);
  assert.equal(safety.approvalActionsEnabled, false);
  assert.equal(safety.bookingActionsEnabled, false);
  assert.equal(safety.calendarActionsEnabled, false);
});

test("read-only review sanitizer forces safe booking and calendar flags", () => {
  const unsafeReview = createUnsafeReview();
  const safeReview = sanitizeAppointmentReviewForReadOnly(unsafeReview);

  assert.equal(safeReview.id, unsafeReview.id);
  assert.equal(safeReview.selectedSlot.time, "10:30");
  assert.equal(safeReview.requiresSecretaryConfirmation, true);
  assert.equal(safeReview.bookingCreated, false);
  assert.equal(safeReview.calendarChecked, false);
});

test("read-only list response includes count, items, and safety metadata", () => {
  const response = buildAppointmentReviewListResponse([createUnsafeReview()]);

  assert.equal(response.status, "ok");
  assert.equal(response.source, "mock");
  assert.equal(response.mode, READ_ONLY_MODE);
  assert.equal(response.persistence, "not_persisted");
  assert.equal(response.count, 1);
  assert.equal(response.reviews[0].bookingCreated, false);
  assert.equal(response.reviews[0].calendarChecked, false);
  assert.equal(response.safety.readOnly, true);
  assert.equal(response.safety.usesDatabase, false);
});

test("read-only detail response keeps one safe review item", () => {
  const response = buildAppointmentReviewDetailResponse(createUnsafeReview());

  assert.equal(response.status, "ok");
  assert.equal(response.mode, READ_ONLY_MODE);
  assert.equal(response.review.requiresSecretaryConfirmation, true);
  assert.equal(response.review.bookingCreated, false);
  assert.equal(response.review.calendarChecked, false);
  assert.equal(response.safety.createsAppointment, false);
});

test("read-only contract does not call appointment creation or calendar provider", () => {
  let appointmentCreationCalled = false;
  let calendarProviderCalled = false;
  const response = buildAppointmentReviewListResponse([createUnsafeReview()], {
    createAppointment() {
      appointmentCreationCalled = true;
    },
    calendarProvider() {
      calendarProviderCalled = true;
    },
  });

  assert.equal(response.safety.createsAppointment, false);
  assert.equal(response.safety.writesCalendar, false);
  assert.equal(appointmentCreationCalled, false);
  assert.equal(calendarProviderCalled, false);
});
