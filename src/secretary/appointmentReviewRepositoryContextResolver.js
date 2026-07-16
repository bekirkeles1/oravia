const {
  APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_SCHEMA_VERSION,
  APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_TYPE,
  assertAppointmentReviewVersionedSnapshotCapability,
} = require("./appointmentReviewRepository");

const REVIEW_CONTEXT_TYPE = "appointment_review_snapshot_context_v1";
const REVIEW_CONTEXT_SOURCE = "server_review_boundary";
const REPOSITORY_TYPE = "in_memory";
const NOT_PERSISTED = "not_persisted";

const ALLOWED_INPUT_FIELDS = Object.freeze(["reviewId"]);
const UNSAFE_SNAPSHOT_FIELDS = Object.freeze([
  "executionEnabled",
  "executorAvailable",
  "executionAvailable",
  "executionRequested",
  "actionPerformed",
  "commandDispatched",
  "commandPersisted",
  "receiptPersisted",
  "bookingCreated",
  "calendarChecked",
  "appointmentCreated",
  "calendarEventCreated",
  "databasePersisted",
  "reviewFound",
  "persisted",
]);

const RESOLVER_CODES = Object.freeze({
  INVALID_FACTORY_OPTIONS: "invalid_factory_options",
  INVALID_REPOSITORY: "invalid_appointment_review_repository",
  MISSING_VERSIONED_SNAPSHOT_CAPABILITY:
    "missing_versioned_snapshot_capability",
  MISSING_STATE_PROJECTION: "missing_controlled_action_state_projection",
  INVALID_INPUT: "invalid_resolver_input",
  MISSING_REVIEW_ID: "missing_review_id",
  INVALID_REVIEW_ID: "invalid_review_id",
  CLIENT_TRUSTED_CONTEXT_INJECTION: "client_trusted_context_injection",
  SNAPSHOT_NOT_FOUND: "appointment_review_snapshot_not_found",
  INVALID_REPOSITORY_SNAPSHOT: "invalid_repository_snapshot",
  REPOSITORY_SNAPSHOT_REVIEW_ID_MISMATCH:
    "repository_snapshot_review_id_mismatch",
  INVALID_REPOSITORY_SNAPSHOT_VERSION: "invalid_repository_snapshot_version",
  UNSAFE_REPOSITORY_SNAPSHOT: "unsafe_repository_snapshot",
  CONTROLLED_ACTION_STATE_RESOLUTION_FAILED:
    "controlled_action_state_resolution_failed",
  INVALID_CONTROLLED_ACTION_STATE: "invalid_controlled_action_state",
});

function createAppointmentReviewRepositoryContextResolver(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw createResolverError(
      RESOLVER_CODES.INVALID_FACTORY_OPTIONS,
      "Appointment review repository context resolver options must be an object."
    );
  }

  const repositoryValidation = assertAppointmentReviewVersionedSnapshotCapability(
    options.repository
  );

  if (!repositoryValidation.ok) {
    throw createResolverError(
      repositoryValidation.error.code,
      repositoryValidation.error.message
    );
  }

  if (typeof options.resolveControlledActionState !== "function") {
    throw createResolverError(
      RESOLVER_CODES.MISSING_STATE_PROJECTION,
      "resolveControlledActionState dependency must be a function."
    );
  }

  const { repository, resolveControlledActionState } = options;

  return async function resolveAppointmentReviewContext(input) {
    const reviewId = validateResolverInput(input);
    const snapshot = await repository.getVersionedSnapshotById(reviewId);

    if (snapshot === null) {
      throw createResolverError(
        RESOLVER_CODES.SNAPSHOT_NOT_FOUND,
        "Appointment review repository snapshot was not found."
      );
    }

    const validSnapshot = validateRepositorySnapshot(snapshot, reviewId);
    const projectionInput = Object.freeze({
      reviewId: validSnapshot.reviewId,
      review: cloneValue(validSnapshot.review),
      repositoryVersion: validSnapshot.version,
    });
    let currentState;

    try {
      currentState = await resolveControlledActionState(projectionInput);
    } catch {
      throw createResolverError(
        RESOLVER_CODES.CONTROLLED_ACTION_STATE_RESOLUTION_FAILED,
        "Controlled action state resolution failed."
      );
    }

    const normalizedState = validateControlledActionState(currentState);

    return deepFreeze({
      contextType: REVIEW_CONTEXT_TYPE,
      contextSource: REVIEW_CONTEXT_SOURCE,
      reviewId: validSnapshot.reviewId,
      currentState: normalizedState,
      observedReviewVersion: validSnapshot.version,
    });
  };
}

function validateResolverInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw createResolverError(
      RESOLVER_CODES.INVALID_INPUT,
      "Appointment review context resolver input must be an object."
    );
  }

  const unsupportedField = Object.keys(input).find(
    (fieldName) => !ALLOWED_INPUT_FIELDS.includes(fieldName)
  );

  if (unsupportedField) {
    throw createResolverError(
      RESOLVER_CODES.CLIENT_TRUSTED_CONTEXT_INJECTION,
      `Resolver input must not provide trusted context field ${unsupportedField}.`
    );
  }

  if (!Object.prototype.hasOwnProperty.call(input, "reviewId")) {
    throw createResolverError(
      RESOLVER_CODES.MISSING_REVIEW_ID,
      "reviewId is required."
    );
  }

  return normalizeReviewId(input.reviewId);
}

function normalizeReviewId(value) {
  if (typeof value !== "string") {
    throw createResolverError(
      RESOLVER_CODES.INVALID_REVIEW_ID,
      "reviewId must be a string."
    );
  }

  const trimmedValue = value.trim();
  const normalizedValue = trimmedValue
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalizedValue) {
    throw createResolverError(
      RESOLVER_CODES.MISSING_REVIEW_ID,
      "reviewId is required."
    );
  }

  if (normalizedValue !== trimmedValue) {
    throw createResolverError(
      RESOLVER_CODES.INVALID_REVIEW_ID,
      "reviewId must already be normalized with safe repository id characters."
    );
  }

  return normalizedValue;
}

function validateRepositorySnapshot(snapshot, requestedReviewId) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw createResolverError(
      RESOLVER_CODES.INVALID_REPOSITORY_SNAPSHOT,
      "Repository snapshot must be an object."
    );
  }

  if (findUnsafeTrueField(snapshot)) {
    throw createResolverError(
      RESOLVER_CODES.UNSAFE_REPOSITORY_SNAPSHOT,
      "Repository snapshot must not claim unsafe side effects."
    );
  }

  if (
    snapshot.snapshotType !== APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_TYPE ||
    snapshot.schemaVersion !==
      APPOINTMENT_REVIEW_REPOSITORY_SNAPSHOT_SCHEMA_VERSION ||
    snapshot.repositoryType !== REPOSITORY_TYPE
  ) {
    throw createResolverError(
      RESOLVER_CODES.INVALID_REPOSITORY_SNAPSHOT,
      "Repository snapshot shape is not supported."
    );
  }

  if (snapshot.reviewId !== requestedReviewId) {
    throw createResolverError(
      RESOLVER_CODES.REPOSITORY_SNAPSHOT_REVIEW_ID_MISMATCH,
      "Repository snapshot reviewId must match requested reviewId."
    );
  }

  if (
    !Number.isSafeInteger(snapshot.version) ||
    snapshot.version < 1
  ) {
    throw createResolverError(
      RESOLVER_CODES.INVALID_REPOSITORY_SNAPSHOT_VERSION,
      "Repository snapshot version must be a positive safe integer."
    );
  }

  if (!snapshot.review || typeof snapshot.review !== "object" || Array.isArray(snapshot.review)) {
    throw createResolverError(
      RESOLVER_CODES.INVALID_REPOSITORY_SNAPSHOT,
      "Repository snapshot review is required."
    );
  }

  if (
    snapshot.persistence !== NOT_PERSISTED ||
    snapshot.databasePersisted !== false
  ) {
    throw createResolverError(
      RESOLVER_CODES.UNSAFE_REPOSITORY_SNAPSHOT,
      "Repository snapshot must remain not_persisted."
    );
  }

  return {
    reviewId: snapshot.reviewId,
    version: snapshot.version,
    review: cloneValue(snapshot.review),
  };
}

function validateControlledActionState(value) {
  if (typeof value !== "string") {
    throw createResolverError(
      RESOLVER_CODES.INVALID_CONTROLLED_ACTION_STATE,
      "Controlled action state must be a string."
    );
  }

  const state = value.trim();

  if (!state) {
    throw createResolverError(
      RESOLVER_CODES.INVALID_CONTROLLED_ACTION_STATE,
      "Controlled action state must be non-empty."
    );
  }

  return state;
}

function findUnsafeTrueField(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedField = findUnsafeTrueField(item);

      if (nestedField) {
        return nestedField;
      }
    }

    return null;
  }

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (UNSAFE_SNAPSHOT_FIELDS.includes(fieldName) && fieldValue === true) {
      return fieldName;
    }

    const nestedField = findUnsafeTrueField(fieldValue);

    if (nestedField) {
      return nestedField;
    }
  }

  return null;
}

function createResolverError(code, reason) {
  return Object.freeze({
    code,
    reason,
  });
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
  RESOLVER_CODES,
  createAppointmentReviewRepositoryContextResolver,
};
