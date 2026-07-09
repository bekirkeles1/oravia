const {
  buildAppointmentReviewDetailResponse,
  buildAppointmentReviewListResponse,
  createAppointmentReviewReadOnlySafety,
} = require("../secretary/appointmentReviewReadOnlyContract");

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
    return createSuccessResponse(buildAppointmentReviewListResponse([]));
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

  return createSuccessResponse(buildAppointmentReviewListResponse(reviews));
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

  return createSuccessResponse(buildAppointmentReviewDetailResponse(review));
}

function createSuccessResponse(payload) {
  return {
    statusCode: 200,
    body: {
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
      mode: "read_only",
      safety: createAppointmentReviewReadOnlySafety(),
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

module.exports = {
  handleSecretaryAppointmentReviewQueueRequest,
};
