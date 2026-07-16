const {
  ALLOWED_REVIEW_STATUSES,
  PENDING_SECRETARY_REVIEW,
  createInMemoryAppointmentReviewRepository,
  validateAppointmentReviewRepository,
} = require("./appointmentReviewRepository");

const ALLOWED_REVIEW_STATUS_SET = new Set(ALLOWED_REVIEW_STATUSES);

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
  const safeMetadata = sanitizeMetadata(metadata);

  return {
    status: "ok",
    review: {
      id: buildReviewId(sourceReview, selectedSlot, safeMetadata),
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
      metadata: safeMetadata,
    },
  };
}

function createInMemoryAppointmentReviewQueue(options = []) {
  const queueOptions = normalizeQueueOptions(options);
  let repository = queueOptions.repository;

  return {
    addAppointmentReview(appointmentSelectionReview, metadata = {}) {
      const item = createAppointmentReviewItem(
        appointmentSelectionReview,
        metadata
      );

      if (item.status !== "ok") {
        return item;
      }

      return repository.add(item.review);
    },
    listAppointmentReviews() {
      return repository.list();
    },
    getAppointmentReviewById(id) {
      return repository.getById(id);
    },
    updateAppointmentReviewStatus(id, status) {
      const reviewId = normalizeId(id);

      if (!ALLOWED_REVIEW_STATUS_SET.has(status)) {
        return {
          status: "error",
          error: {
            code: "invalid_review_status",
            message: "Unsupported appointment review status.",
          },
        };
      }

      const review = repository.getById(reviewId);

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

      repository = createInMemoryAppointmentReviewRepository({
        initialReviews: repository
          .list()
          .map((storedReview) =>
            storedReview.id === reviewId ? updatedReview : storedReview
          ),
      });

      return {
        status: "ok",
        review: cloneValue(updatedReview),
      };
    },
  };
}

function normalizeQueueOptions(options) {
  if (Array.isArray(options)) {
    return {
      repository: createInMemoryAppointmentReviewRepository({
        initialReviews: normalizeInitialReviews(options),
      }),
    };
  }

  const safeOptions =
    options && typeof options === "object" && !Array.isArray(options)
      ? options
      : {};

  if (safeOptions.repository) {
    const validation = validateAppointmentReviewRepository(
      safeOptions.repository
    );

    if (!validation.ok) {
      throw new TypeError(validation.error.message);
    }

    return {
      repository: validation.repository,
    };
  }

  return {
    repository: createInMemoryAppointmentReviewRepository({
      initialReviews: normalizeInitialReviews(safeOptions.initialReviews || []),
    }),
  };
}

function normalizeInitialReviews(initialReviews) {
  if (!Array.isArray(initialReviews)) {
    return [];
  }

  return initialReviews.flatMap((review) => {
    const item = createAppointmentReviewItem(review);

    if (item.status === "ok") {
      return [item.review];
    }

    if (isAppointmentReviewRecord(review)) {
      return [review];
    }

    return [];
  });
}

function isAppointmentReviewRecord(review) {
  return Boolean(
    review &&
      typeof review === "object" &&
      !Array.isArray(review) &&
      typeof review.id === "string" &&
      typeof review.status === "string" &&
      review.selectedSlot &&
      typeof review.selectedSlot === "object"
  );
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

function buildReviewId(review, selectedSlot, metadata = {}) {
  const parts = [
    "review",
    normalizeId(review.source || selectedSlot.source || "mock"),
  ];
  const conversationKey = normalizeId(metadata.conversationKey);

  if (conversationKey) {
    parts.push(conversationKey);
  }

  parts.push(normalizeId(selectedSlot.id || selectedSlot.time || "slot"));

  return parts.join("_");
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
