const READ_METHODS = new Set(["GET", "HEAD"]);

function handleSecretaryAppointmentReviewQueueRequest(input = {}, options = {}) {
  const method = normalizeMethod(input.method);

  if (!READ_METHODS.has(method)) {
    return createErrorResponse(
      405,
      "method_not_allowed",
      "Secretary appointment review queue is read-only in this mock handler."
    );
  }

  const queue = options.appointmentReviewQueue || null;

  if (!queue) {
    return createSuccessResponse({
      reviews: [],
      count: 0,
      persistence: "not_persisted",
      safety: createReadOnlySafety(),
    });
  }

  const reviewId = normalizeReviewId(input.id || input.reviewId);

  if (reviewId) {
    return handleGetAppointmentReviewById(queue, reviewId);
  }

  return handleListAppointmentReviews(queue);
}

function handleListAppointmentReviews(queue) {
  const reviews =
    typeof queue.listAppointmentReviews === "function"
      ? queue.listAppointmentReviews()
      : [];

  return createSuccessResponse({
    reviews: reviews.map(sanitizeReview),
    count: reviews.length,
    persistence: "not_persisted",
    safety: createReadOnlySafety(),
  });
}

function handleGetAppointmentReviewById(queue, reviewId) {
  const review =
    typeof queue.getAppointmentReviewById === "function"
      ? queue.getAppointmentReviewById(reviewId)
      : null;

  if (!review) {
    return createErrorResponse(
      404,
      "review_not_found",
      "Appointment review item was not found."
    );
  }

  return createSuccessResponse({
    review: sanitizeReview(review),
    persistence: "not_persisted",
    safety: createReadOnlySafety(),
  });
}

function sanitizeReview(review) {
  return {
    ...cloneValue(review),
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
  };
}

function createReadOnlySafety() {
  return {
    readOnly: true,
    createsAppointment: false,
    writesCalendar: false,
    checksCalendarConflict: false,
    usesDatabase: false,
  };
}

function createSuccessResponse(payload) {
  return {
    statusCode: 200,
    body: {
      status: "ok",
      source: "mock",
      ...payload,
    },
  };
}

function createErrorResponse(statusCode, code, message) {
  return {
    statusCode,
    body: {
      status: "error",
      source: "mock",
      error: {
        code,
        message,
      },
    },
  };
}

function normalizeMethod(value) {
  return String(value || "GET").trim().toUpperCase();
}

function normalizeReviewId(value) {
  return String(value || "").trim();
}

function cloneValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

module.exports = {
  handleSecretaryAppointmentReviewQueueRequest,
};
