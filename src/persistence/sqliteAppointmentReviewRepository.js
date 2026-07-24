const {
  APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_SCHEMA_VERSION,
  APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_TYPE,
  validateAppointmentReviewRecord,
} = require("../secretary/appointmentReviewRepository");
const {
  cloneValue,
  freezeClone,
  parseJsonObject,
  stringifyJson,
} = require("./sqliteJson");

const STORAGE = "sqlite";
const PERSISTENCE = "sqlite";
const REPOSITORY_NAME = "appointment_reviews";

function createSqliteAppointmentReviewRepository({ persistenceProvider }) {
  const database = persistenceProvider.getDatabase();
  const clinicId = persistenceProvider.getClinicId();
  ensureRepositoryMetadata(database, clinicId);

  return Object.freeze({
    repositoryType: "sqlite_appointment_review_repository_v1",
    storage: STORAGE,
    persistence: PERSISTENCE,
    durablePersistence: true,
    databasePersisted: true,
    add(review) {
      const validation = validateAppointmentReviewRecord(review);

      if (!validation.ok) {
        return {
          status: "error",
          error: validation.error,
        };
      }

      const existing = getStoredReview(database, clinicId, validation.review.id);

      if (existing) {
        return {
          status: "error",
          error: {
            code: "duplicate_review_id",
            message: "Appointment review id already exists.",
          },
        };
      }

      const now = new Date().toISOString();
      database
        .prepare(
          `INSERT INTO appointment_reviews (
            clinic_id, review_id, review_json, review_version, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          clinicId,
          validation.review.id,
          stringifyJson(validation.review),
          1,
          now,
          now
        );
      incrementRepositoryVersion(database, clinicId);

      return {
        status: "ok",
        review: cloneValue(validation.review),
      };
    },
    list() {
      return database
        .prepare(
          `SELECT review_json, review_version
           FROM appointment_reviews
           WHERE clinic_id = ?
           ORDER BY review_id`
        )
        .all(clinicId)
        .flatMap((row) => {
          const review = parseJsonObject(row.review_json);
          return review ? [freezeClone(review)] : [];
        });
    },
    getById(reviewId) {
      const stored = getStoredReview(database, clinicId, normalizeReviewId(reviewId));
      return stored ? freezeClone(stored.review) : null;
    },
    getVersionedSnapshotById(reviewId) {
      const stored = getStoredReview(database, clinicId, normalizeReviewId(reviewId));

      if (!stored) {
        return null;
      }

      return freezeClone(createVersionedSnapshot(stored));
    },
    applyReviewControlledActionStateTransition(input) {
      const validation = validateStateTransitionInput(input);

      if (!validation.ok) {
        return createErrorResult(validation.error);
      }

      const stored = getStoredReview(database, clinicId, validation.reviewId);

      if (!stored) {
        return createErrorResult({
          code: "review_not_found",
          message: "Appointment review item was not found.",
        });
      }

      const currentState = normalizeText(
        stored.review?.metadata?.controlledActionState
      );
      const conflict = validateStoredState({
        stored,
        currentState,
        expectedState: validation.expectedState,
        expectedVersion: validation.expectedVersion,
        message: "Appointment review state changed before mutation.",
      });

      if (conflict) {
        return conflict;
      }

      const previousSnapshot = createVersionedSnapshot(stored);
      const updatedReview = {
        ...cloneValue(stored.review),
        requiresSecretaryConfirmation: true,
        bookingCreated: false,
        calendarChecked: false,
        metadata: {
          ...(stored.review.metadata || {}),
          controlledActionState: validation.nextState,
        },
      };
      const nextVersion = stored.version + 1;
      updateStoredReview(database, clinicId, validation.reviewId, updatedReview, nextVersion);
      incrementRepositoryVersion(database, clinicId);

      const updatedStored = {
        review: updatedReview,
        version: nextVersion,
      };

      return freezeClone({
        status: "ok",
        applied: true,
        reviewStateChanged: true,
        reviewMutated: true,
        repositoryVersionChanged: true,
        reviewId: validation.reviewId,
        previousState: validation.expectedState,
        nextState: validation.nextState,
        previousReviewVersion: stored.version,
        nextReviewVersion: nextVersion,
        previousSnapshot,
        reviewSnapshot: createVersionedSnapshot(updatedStored),
        storage: STORAGE,
        durablePersistence: true,
        receiptPersisted: false,
        bookingCreated: false,
        calendarChecked: false,
        appointmentCreated: false,
        calendarEventCreated: false,
        databasePersisted: true,
      });
    },
    previewReviewAppointmentCreationLink(input) {
      return validateAppointmentLink(database, clinicId, input);
    },
    applyReviewAppointmentCreationLink(input) {
      const preview = validateAppointmentLink(database, clinicId, input);

      if (!preview || preview.status !== "ok") {
        return preview;
      }

      const validation = preview.validation;
      const stored = getStoredReview(database, clinicId, validation.reviewId);
      const previousSnapshot = createVersionedSnapshot(stored);
      const updatedReview = {
        ...cloneValue(stored.review),
        requiresSecretaryConfirmation: true,
        bookingCreated: false,
        calendarChecked: false,
        metadata: {
          ...(stored.review.metadata || {}),
          controlledActionState: validation.expectedState,
          linkedAppointmentId: validation.appointmentId,
          appointmentCreationStorage: STORAGE,
          appointmentCreationPersistence: PERSISTENCE,
        },
      };
      const nextVersion = stored.version + 1;
      updateStoredReview(database, clinicId, validation.reviewId, updatedReview, nextVersion);
      incrementRepositoryVersion(database, clinicId);

      const updatedStored = {
        review: updatedReview,
        version: nextVersion,
      };

      return freezeClone({
        status: "ok",
        applied: true,
        reviewStateChanged: false,
        reviewMutated: true,
        repositoryVersionChanged: true,
        reviewId: validation.reviewId,
        state: validation.expectedState,
        linkedAppointmentId: validation.appointmentId,
        previousReviewVersion: stored.version,
        nextReviewVersion: nextVersion,
        previousSnapshot,
        reviewSnapshot: createVersionedSnapshot(updatedStored),
        storage: STORAGE,
        durablePersistence: true,
        receiptPersisted: false,
        bookingCreated: false,
        calendarChecked: false,
        appointmentCreated: true,
        calendarEventCreated: false,
        databasePersisted: true,
      });
    },
    getVersion() {
      return getRepositoryVersion(database, clinicId);
    },
  });
}

function validateAppointmentLink(database, clinicId, input) {
  const validation = validateAppointmentLinkInput(input);

  if (!validation.ok) {
    return createErrorResult(validation.error);
  }

  const stored = getStoredReview(database, clinicId, validation.reviewId);

  if (!stored) {
    return createErrorResult({
      code: "review_not_found",
      message: "Appointment review item was not found.",
    });
  }

  const currentState = normalizeText(stored.review?.metadata?.controlledActionState);
  const conflict = validateStoredState({
    stored,
    currentState,
    expectedState: validation.expectedState,
    expectedVersion: validation.expectedVersion,
    message: "Appointment review changed before appointment link.",
  });

  if (conflict) {
    return conflict;
  }

  if (normalizeText(stored.review?.metadata?.linkedAppointmentId)) {
    return createConflictResult({
      code: "appointment_already_created_for_review",
      message: "Appointment review already has a linked appointment.",
      reviewId: validation.reviewId,
      currentState,
      expectedState: validation.expectedState,
      currentVersion: stored.version,
      expectedVersion: validation.expectedVersion,
    });
  }

  return freezeClone({
    status: "ok",
    applied: false,
    linkPreview: true,
    reviewStateChanged: false,
    reviewMutated: false,
    repositoryVersionChanged: false,
    reviewId: validation.reviewId,
    state: validation.expectedState,
    linkedAppointmentId: validation.appointmentId,
    currentReviewVersion: stored.version,
    nextReviewVersion: stored.version + 1,
    validation,
    storage: STORAGE,
    durablePersistence: true,
    receiptPersisted: false,
    bookingCreated: false,
    calendarChecked: false,
    appointmentCreated: false,
    calendarEventCreated: false,
    databasePersisted: true,
  });
}

function validateStoredState({
  stored,
  currentState,
  expectedState,
  expectedVersion,
  message,
}) {
  if (currentState !== expectedState) {
    return createConflictResult({
      code: "review_state_conflict",
      message,
      reviewId: stored.review.id,
      currentState,
      expectedState,
      currentVersion: stored.version,
      expectedVersion,
    });
  }

  if (stored.version !== expectedVersion) {
    return createConflictResult({
      code: "review_version_conflict",
      message: "Appointment review version changed before mutation.",
      reviewId: stored.review.id,
      currentState,
      expectedState,
      currentVersion: stored.version,
      expectedVersion,
    });
  }

  return null;
}

function getStoredReview(database, clinicId, reviewId) {
  if (!reviewId) {
    return null;
  }

  const row = database
    .prepare(
      `SELECT review_json, review_version
       FROM appointment_reviews
       WHERE clinic_id = ? AND review_id = ?`
    )
    .get(clinicId, reviewId);

  if (!row) {
    return null;
  }

  const review = parseJsonObject(row.review_json);
  return review ? { review, version: row.review_version } : null;
}

function updateStoredReview(database, clinicId, reviewId, review, version) {
  database
    .prepare(
      `UPDATE appointment_reviews
       SET review_json = ?, review_version = ?, updated_at = ?
       WHERE clinic_id = ? AND review_id = ?`
    )
    .run(stringifyJson(review), version, new Date().toISOString(), clinicId, reviewId);
}

function createVersionedSnapshot(stored) {
  return {
    snapshotType: APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_TYPE,
    schemaVersion: APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_SCHEMA_VERSION,
    reviewId: stored.review.id,
    version: stored.version,
    review: cloneValue(stored.review),
    repositoryType: STORAGE,
    persistence: PERSISTENCE,
    durablePersistence: true,
    databasePersisted: true,
  };
}

function ensureRepositoryMetadata(database, clinicId) {
  database
    .prepare(
      `INSERT OR IGNORE INTO repository_metadata (
        clinic_id, repository_name, version, updated_at
      )
      VALUES (?, ?, 0, ?)`
    )
    .run(clinicId, REPOSITORY_NAME, new Date().toISOString());
}

function incrementRepositoryVersion(database, clinicId) {
  database
    .prepare(
      `UPDATE repository_metadata
       SET version = version + 1, updated_at = ?
       WHERE clinic_id = ? AND repository_name = ?`
    )
    .run(new Date().toISOString(), clinicId, REPOSITORY_NAME);
}

function getRepositoryVersion(database, clinicId) {
  const row = database
    .prepare(
      `SELECT version FROM repository_metadata
       WHERE clinic_id = ? AND repository_name = ?`
    )
    .get(clinicId, REPOSITORY_NAME);

  return row ? row.version : 0;
}

function validateStateTransitionInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return validationError("invalid_state_transition_input", "State transition input must be an object.");
  }

  const reviewId = normalizeReviewId(input.reviewId);
  const expectedState = normalizeText(input.expectedState);
  const nextState = normalizeText(input.nextState);

  if (!reviewId) {
    return validationError("missing_review_id", "State transition input requires a safe reviewId.");
  }

  if (!expectedState) {
    return validationError("missing_expected_state", "State transition input requires expectedState.");
  }

  if (!nextState) {
    return validationError("missing_next_state", "State transition input requires nextState.");
  }

  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    return validationError("invalid_expected_version", "State transition input requires a positive safe expectedVersion.");
  }

  return { ok: true, reviewId, expectedState, nextState, expectedVersion: input.expectedVersion };
}

function validateAppointmentLinkInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return validationError("invalid_appointment_link_input", "Appointment link input must be an object.");
  }

  const reviewId = normalizeReviewId(input.reviewId);
  const expectedState = normalizeText(input.expectedState);
  const appointmentId = normalizeText(input.appointmentId);

  if (!reviewId) {
    return validationError("missing_review_id", "Appointment link input requires a safe reviewId.");
  }

  if (!expectedState) {
    return validationError("missing_expected_state", "Appointment link input requires expectedState.");
  }

  if (!appointmentId || !/^[a-z0-9_:-]+$/.test(appointmentId)) {
    return validationError("invalid_appointment_id", "Appointment link input requires a safe appointmentId.");
  }

  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    return validationError("invalid_expected_version", "Appointment link input requires a positive safe expectedVersion.");
  }

  return { ok: true, reviewId, expectedState, expectedVersion: input.expectedVersion, appointmentId };
}

function createErrorResult(error) {
  return freezeClone({
    status: "error",
    applied: false,
    conflict: false,
    error,
    reviewStateChanged: false,
    reviewMutated: false,
    repositoryVersionChanged: false,
    durablePersistence: true,
    receiptPersisted: false,
    bookingCreated: false,
    calendarChecked: false,
    appointmentCreated: false,
    calendarEventCreated: false,
    databasePersisted: true,
  });
}

function createConflictResult({
  code,
  message,
  reviewId,
  currentState,
  expectedState,
  currentVersion,
  expectedVersion,
}) {
  return freezeClone({
    status: "conflict",
    applied: false,
    conflict: true,
    error: { code, message },
    reviewId,
    currentState,
    expectedState,
    currentVersion,
    expectedVersion,
    reviewStateChanged: false,
    reviewMutated: false,
    repositoryVersionChanged: false,
    durablePersistence: true,
    receiptPersisted: false,
    bookingCreated: false,
    calendarChecked: false,
    appointmentCreated: false,
    calendarEventCreated: false,
    databasePersisted: true,
  });
}

function validationError(code, message) {
  return { ok: false, error: { code, message } };
}

function normalizeReviewId(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  createSqliteAppointmentReviewRepository,
};
