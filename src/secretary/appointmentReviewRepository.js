const PENDING_SECRETARY_REVIEW = "pending_secretary_review";
const ALLOWED_REVIEW_STATUSES = Object.freeze([
  PENDING_SECRETARY_REVIEW,
  "approved_for_controlled_booking",
  "needs_follow_up",
  "rejected",
]);
const REQUIRED_REPOSITORY_METHODS = Object.freeze(["add", "list", "getById"]);

function createInMemoryAppointmentReviewRepository(options = {}) {
  const initialReviews = Array.isArray(options.initialReviews)
    ? options.initialReviews
    : [];
  const reviews = new Map();

  for (const review of initialReviews) {
    const validation = validateAppointmentReviewRecord(review);

    if (validation.ok && !reviews.has(validation.review.id)) {
      reviews.set(validation.review.id, cloneValue(validation.review));
    }
  }

  return Object.freeze({
    add(review) {
      const validation = validateAppointmentReviewRecord(review);

      if (!validation.ok) {
        return {
          status: "error",
          error: validation.error,
        };
      }

      if (reviews.has(validation.review.id)) {
        return {
          status: "error",
          error: {
            code: "duplicate_review_id",
            message: "Appointment review id already exists.",
          },
        };
      }

      reviews.set(validation.review.id, cloneValue(validation.review));

      return {
        status: "ok",
        review: cloneValue(validation.review),
      };
    },
    list() {
      return Array.from(reviews.values()).map(cloneValue);
    },
    getById(reviewId) {
      const normalizedReviewId = normalizeReviewId(reviewId);

      if (!normalizedReviewId) {
        return null;
      }

      return cloneValue(reviews.get(normalizedReviewId) || null);
    },
  });
}

function validateAppointmentReviewRepository(repository) {
  if (!repository || typeof repository !== "object") {
    return repositoryValidationError(
      "invalid_appointment_review_repository",
      "Appointment review repository must be an object."
    );
  }

  const missingMethod = REQUIRED_REPOSITORY_METHODS.find(
    (methodName) => typeof repository[methodName] !== "function"
  );

  if (missingMethod) {
    return repositoryValidationError(
      "missing_repository_method",
      `Appointment review repository is missing required ${missingMethod} method.`
    );
  }

  return {
    ok: true,
    repository,
  };
}

function validateAppointmentReviewRecord(review) {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    return validationError(
      "invalid_review_record",
      "Appointment review record must be an object."
    );
  }

  const reviewId = normalizeReviewId(review.id);

  if (!reviewId) {
    return validationError(
      "missing_review_id",
      "Appointment review record requires a safe non-empty id."
    );
  }

  if (!ALLOWED_REVIEW_STATUSES.includes(review.status)) {
    return validationError(
      "invalid_review_status",
      "Unsupported appointment review status."
    );
  }

  if (!review.selectedSlot || typeof review.selectedSlot !== "object") {
    return validationError(
      "missing_selected_slot",
      "Appointment review record requires selectedSlot."
    );
  }

  if (review.requiresSecretaryConfirmation !== true) {
    return validationError(
      "missing_secretary_confirmation",
      "Appointment review record must require secretary confirmation."
    );
  }

  if (review.bookingCreated !== false || review.calendarChecked !== false) {
    return validationError(
      "unsafe_review_flags",
      "Appointment review record must not mark booking or calendar checks complete."
    );
  }

  return {
    ok: true,
    review: {
      ...cloneValue(review),
      id: reviewId,
      requiresSecretaryConfirmation: true,
      bookingCreated: false,
      calendarChecked: false,
    },
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

function repositoryValidationError(code, message) {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

function normalizeReviewId(value) {
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
  ALLOWED_REVIEW_STATUSES,
  PENDING_SECRETARY_REVIEW,
  createInMemoryAppointmentReviewRepository,
  validateAppointmentReviewRecord,
  validateAppointmentReviewRepository,
};
