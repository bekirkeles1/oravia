const READ_ONLY_MODE = "read_only";
const MOCK_SOURCE = "mock";
const NOT_PERSISTED = "not_persisted";

function buildAppointmentReviewListResponse(reviews = [], options = {}) {
  const safeReviews = Array.isArray(reviews)
    ? reviews.map(sanitizeAppointmentReviewForReadOnly)
    : [];

  return {
    status: "ok",
    source: options.source || MOCK_SOURCE,
    mode: READ_ONLY_MODE,
    persistence: options.persistence || NOT_PERSISTED,
    count: safeReviews.length,
    reviews: safeReviews,
    safety: createAppointmentReviewReadOnlySafety(options),
  };
}

function buildAppointmentReviewDetailResponse(review, options = {}) {
  return {
    status: "ok",
    source: options.source || MOCK_SOURCE,
    mode: READ_ONLY_MODE,
    persistence: options.persistence || NOT_PERSISTED,
    review: sanitizeAppointmentReviewForReadOnly(review),
    safety: createAppointmentReviewReadOnlySafety(options),
  };
}

function sanitizeAppointmentReviewForReadOnly(review = {}) {
  return {
    ...cloneValue(review),
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
  };
}

function createAppointmentReviewReadOnlySafety(options = {}) {
  return {
    mode: READ_ONLY_MODE,
    readOnly: true,
    source: options.source || MOCK_SOURCE,
    persistence: options.persistence || NOT_PERSISTED,
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
    createsAppointment: false,
    writesCalendar: false,
    checksCalendarConflict: false,
    usesDatabase: false,
    approvalActionsEnabled: false,
    bookingActionsEnabled: false,
    calendarActionsEnabled: false,
  };
}

function cloneValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

module.exports = {
  READ_ONLY_MODE,
  buildAppointmentReviewDetailResponse,
  buildAppointmentReviewListResponse,
  createAppointmentReviewReadOnlySafety,
  sanitizeAppointmentReviewForReadOnly,
};
