const PENDING_SECRETARY_REVIEW = "pending_secretary_review";
const ALLOWED_REVIEW_STATUSES = new Set([
  PENDING_SECRETARY_REVIEW,
  "approved_for_controlled_booking",
  "needs_follow_up",
  "rejected",
]);

function createAppointmentReviewItem(appointmentSelectionReview, metadata = {}) {
  const validation = validateAppointmentSelectionReview(
    appointmentSelectionReview
  );

  if (!validation.ok) {
    return {
      status: "error",
      error: validation.error,
    };
  }

  const sourceReview = validation.review;
  const selectedSlot = cloneValue(sourceReview.selectedSlot);

  return {
    status: "ok",
    review: {
      id: buildReviewId(sourceReview, selectedSlot),
      status: PENDING_SECRETARY_REVIEW,
      source: sourceReview.source || "mock",
      selectedSlot,
      treatment: sourceReview.treatment || selectedSlot.treatment || null,
      day: sourceReview.day || selectedSlot.day || null,
      appointmentPurpose:
        sourceReview.appointmentPurpose ||
        selectedSlot.appointmentPurpose ||
        null,
      appointmentPurposeLabel:
        sourceReview.appointmentPurposeLabel ||
        selectedSlot.appointmentPurposeLabel ||
        null,
      requiresSecretaryConfirmation: true,
      bookingCreated: false,
      calendarChecked: false,
      metadata: sanitizeMetadata(metadata),
    },
  };
}

function createInMemoryAppointmentReviewQueue(initialReviews = []) {
  const reviews = new Map();

  for (const review of initialReviews) {
    const item = createAppointmentReviewItem(review);

    if (item.status === "ok") {
      reviews.set(item.review.id, cloneValue(item.review));
    }
  }

  return {
    addAppointmentReview(appointmentSelectionReview, metadata = {}) {
      const item = createAppointmentReviewItem(
        appointmentSelectionReview,
        metadata
      );

      if (item.status !== "ok") {
        return item;
      }

      reviews.set(item.review.id, cloneValue(item.review));

      return {
        status: "ok",
        review: cloneValue(item.review),
      };
    },
    listAppointmentReviews() {
      return Array.from(reviews.values()).map(cloneValue);
    },
    getAppointmentReviewById(id) {
      return cloneValue(reviews.get(normalizeId(id)) || null);
    },
    updateAppointmentReviewStatus(id, status) {
      const reviewId = normalizeId(id);

      if (!ALLOWED_REVIEW_STATUSES.has(status)) {
        return {
          status: "error",
          error: {
            code: "invalid_review_status",
            message: "Unsupported appointment review status.",
          },
        };
      }

      const review = reviews.get(reviewId);

      if (!review) {
        return {
          status: "error",
          error: {
            code: "review_not_found",
            message: "Appointment review item was not found.",
          },
        };
      }

      const updatedReview = {
        ...review,
        status,
        bookingCreated: false,
        calendarChecked: false,
        requiresSecretaryConfirmation: true,
      };

      reviews.set(reviewId, cloneValue(updatedReview));

      return {
        status: "ok",
        review: cloneValue(updatedReview),
      };
    },
  };
}

function validateAppointmentSelectionReview(review) {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    return validationError(
      "invalid_review_payload",
      "appointmentSelectionReview must be an object."
    );
  }

  if (review.status !== "pending_secretary_confirmation") {
    return validationError(
      "invalid_review_status",
      "appointmentSelectionReview must be pending secretary confirmation."
    );
  }

  if (!review.selectedSlot || typeof review.selectedSlot !== "object") {
    return validationError(
      "missing_selected_slot",
      "appointmentSelectionReview.selectedSlot is required."
    );
  }

  if (review.requiresSecretaryConfirmation !== true) {
    return validationError(
      "missing_secretary_confirmation",
      "appointmentSelectionReview must require secretary confirmation."
    );
  }

  if (review.bookingCreated !== false || review.calendarChecked !== false) {
    return validationError(
      "unsafe_review_flags",
      "appointmentSelectionReview must not mark booking or calendar checks complete."
    );
  }

  return {
    ok: true,
    review,
  };
}

function validationError(code, message) {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

function buildReviewId(review, selectedSlot) {
  return [
    "review",
    normalizeId(review.source || selectedSlot.source || "mock"),
    normalizeId(selectedSlot.id || selectedSlot.time || "slot"),
  ].join("_");
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return cloneValue(metadata);
}

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cloneValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

module.exports = {
  PENDING_SECRETARY_REVIEW,
  createAppointmentReviewItem,
  createInMemoryAppointmentReviewQueue,
};
