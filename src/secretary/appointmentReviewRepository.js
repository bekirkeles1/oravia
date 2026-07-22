const PENDING_SECRETARY_REVIEW = "pending_secretary_review";
const ALLOWED_REVIEW_STATUSES = Object.freeze([
  PENDING_SECRETARY_REVIEW,
  "approved_for_controlled_booking",
  "needs_follow_up",
  "rejected",
]);
const REQUIRED_REPOSITORY_METHODS = Object.freeze(["add", "list", "getById"]);
const VERSIONED_SNAPSHOT_METHOD = "getVersionedSnapshotById";
const STATE_TRANSITION_METHOD = "applyReviewControlledActionStateTransition";
const APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_TYPE =
  "appointment_review_repository_snapshot_v1";
const APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_SCHEMA_VERSION = 1;
const IN_MEMORY_REPOSITORY_TYPE = "in_memory";
const NOT_PERSISTED = "not_persisted";
const INITIAL_REPOSITORY_VERSION = 1;

function createInMemoryAppointmentReviewRepository(options = {}) {
  const initialReviews = Array.isArray(options.initialReviews)
    ? options.initialReviews
    : [];
  const reviews = new Map();

  for (const review of initialReviews) {
    const validation = validateAppointmentReviewRecord(review);

    if (validation.ok && !reviews.has(validation.review.id)) {
      reviews.set(validation.review.id, createStoredReview(validation.review));
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

      reviews.set(validation.review.id, createStoredReview(validation.review));

      return {
        status: "ok",
        review: cloneValue(validation.review),
      };
    },
    list() {
      return Array.from(reviews.values()).map((storedReview) =>
        cloneValue(storedReview.review)
      );
    },
    getById(reviewId) {
      const normalizedReviewId = normalizeReviewId(reviewId);

      if (!normalizedReviewId) {
        return null;
      }

      const storedReview = reviews.get(normalizedReviewId);

      return storedReview ? cloneValue(storedReview.review) : null;
    },
    getVersionedSnapshotById(reviewId) {
      const normalizedReviewId = normalizeReviewId(reviewId);

      if (!normalizedReviewId) {
        return null;
      }

      const storedReview = reviews.get(normalizedReviewId);

      if (!storedReview) {
        return null;
      }

      return deepFreeze({
        snapshotType: APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_TYPE,
        schemaVersion: APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_SCHEMA_VERSION,
        reviewId: storedReview.review.id,
        version: storedReview.version,
        review: cloneValue(storedReview.review),
        repositoryType: IN_MEMORY_REPOSITORY_TYPE,
        persistence: NOT_PERSISTED,
        databasePersisted: false,
      });
    },
    applyReviewControlledActionStateTransition(input) {
      const validation = validateStateTransitionInput(input);

      if (!validation.ok) {
        return createStateTransitionErrorResult(validation.error);
      }

      const storedReview = reviews.get(validation.reviewId);

      if (!storedReview) {
        return createStateTransitionErrorResult({
          code: "review_not_found",
          message: "Appointment review item was not found.",
        });
      }

      const currentState = normalizeControlledActionState(
        storedReview.review?.metadata?.controlledActionState
      );

      if (currentState !== validation.expectedState) {
        return createStateTransitionConflictResult({
          code: "review_state_conflict",
          message: "Appointment review state changed before mutation.",
          reviewId: validation.reviewId,
          currentState,
          expectedState: validation.expectedState,
          currentVersion: storedReview.version,
          expectedVersion: validation.expectedVersion,
        });
      }

      if (storedReview.version !== validation.expectedVersion) {
        return createStateTransitionConflictResult({
          code: "review_version_conflict",
          message: "Appointment review version changed before mutation.",
          reviewId: validation.reviewId,
          currentState,
          expectedState: validation.expectedState,
          currentVersion: storedReview.version,
          expectedVersion: validation.expectedVersion,
        });
      }

      const previousSnapshot = createVersionedSnapshot(storedReview);
      const updatedReview = {
        ...cloneValue(storedReview.review),
        requiresSecretaryConfirmation: true,
        bookingCreated: false,
        calendarChecked: false,
        metadata: {
          ...(storedReview.review.metadata || {}),
          controlledActionState: validation.nextState,
        },
      };
      const nextVersion = storedReview.version + 1;
      const updatedStoredReview = {
        review: updatedReview,
        version: nextVersion,
      };

      reviews.set(validation.reviewId, updatedStoredReview);

      return deepFreeze({
        status: "ok",
        applied: true,
        reviewStateChanged: true,
        reviewMutated: true,
        repositoryVersionChanged: true,
        reviewId: validation.reviewId,
        previousState: validation.expectedState,
        nextState: validation.nextState,
        previousReviewVersion: storedReview.version,
        nextReviewVersion: nextVersion,
        previousSnapshot,
        reviewSnapshot: createVersionedSnapshot(updatedStoredReview),
        storage: IN_MEMORY_REPOSITORY_TYPE,
        durablePersistence: false,
        receiptPersisted: false,
        bookingCreated: false,
        calendarChecked: false,
        appointmentCreated: false,
        calendarEventCreated: false,
        databasePersisted: false,
      });
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

function assertAppointmentReviewVersionedSnapshotCapability(repository) {
  if (!repository || typeof repository !== "object") {
    return repositoryValidationError(
      "invalid_appointment_review_repository",
      "Appointment review repository must be an object."
    );
  }

  if (typeof repository[VERSIONED_SNAPSHOT_METHOD] !== "function") {
    return repositoryValidationError(
      "missing_versioned_snapshot_capability",
      "Appointment review repository is missing required getVersionedSnapshotById method."
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

  const normalizedReview = cloneValue(review);
  delete normalizedReview.version;

  return {
    ok: true,
    review: {
      ...normalizedReview,
      id: reviewId,
      requiresSecretaryConfirmation: true,
      bookingCreated: false,
      calendarChecked: false,
    },
  };
}

function createStoredReview(review) {
  return {
    review: cloneValue(review),
    version: INITIAL_REPOSITORY_VERSION,
  };
}

function validateStateTransitionInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return validationError(
      "invalid_state_transition_input",
      "State transition input must be an object."
    );
  }

  const reviewId = normalizeReviewId(input.reviewId);

  if (!reviewId) {
    return validationError(
      "missing_review_id",
      "State transition input requires a safe reviewId."
    );
  }

  const expectedState = normalizeControlledActionState(input.expectedState);
  const nextState = normalizeControlledActionState(input.nextState);

  if (!expectedState) {
    return validationError(
      "missing_expected_state",
      "State transition input requires expectedState."
    );
  }

  if (!nextState) {
    return validationError(
      "missing_next_state",
      "State transition input requires nextState."
    );
  }

  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 1
  ) {
    return validationError(
      "invalid_expected_version",
      "State transition input requires a positive safe expectedVersion."
    );
  }

  return {
    ok: true,
    reviewId,
    expectedState,
    nextState,
    expectedVersion: input.expectedVersion,
  };
}

function createVersionedSnapshot(storedReview) {
  return {
    snapshotType: APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_TYPE,
    schemaVersion: APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_SCHEMA_VERSION,
    reviewId: storedReview.review.id,
    version: storedReview.version,
    review: cloneValue(storedReview.review),
    repositoryType: IN_MEMORY_REPOSITORY_TYPE,
    persistence: NOT_PERSISTED,
    databasePersisted: false,
  };
}

function createStateTransitionErrorResult(error) {
  return deepFreeze({
    status: "error",
    applied: false,
    conflict: false,
    error,
    reviewStateChanged: false,
    reviewMutated: false,
    repositoryVersionChanged: false,
    durablePersistence: false,
    receiptPersisted: false,
    bookingCreated: false,
    calendarChecked: false,
    appointmentCreated: false,
    calendarEventCreated: false,
    databasePersisted: false,
  });
}

function createStateTransitionConflictResult({
  code,
  message,
  reviewId,
  currentState,
  expectedState,
  currentVersion,
  expectedVersion,
}) {
  return deepFreeze({
    status: "conflict",
    applied: false,
    conflict: true,
    error: {
      code,
      message,
    },
    reviewId,
    currentState,
    expectedState,
    currentVersion,
    expectedVersion,
    reviewStateChanged: false,
    reviewMutated: false,
    repositoryVersionChanged: false,
    durablePersistence: false,
    receiptPersisted: false,
    bookingCreated: false,
    calendarChecked: false,
    appointmentCreated: false,
    calendarEventCreated: false,
    databasePersisted: false,
  });
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

function normalizeControlledActionState(value) {
  return String(value || "").trim();
}

function cloneValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return value;
}

module.exports = {
  ALLOWED_REVIEW_STATUSES,
  APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_SCHEMA_VERSION,
  APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_TYPE,
  PENDING_SECRETARY_REVIEW,
  STATE_TRANSITION_METHOD,
  assertAppointmentReviewVersionedSnapshotCapability,
  createInMemoryAppointmentReviewRepository,
  validateAppointmentReviewRecord,
  validateAppointmentReviewRepository,
};
