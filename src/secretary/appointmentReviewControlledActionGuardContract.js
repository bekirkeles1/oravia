const {
  ACTION_INTENT_REQUIRED_PERMISSIONS,
  VERIFIED_ACTOR_CONTEXT_TYPE,
  VERIFIED_ACTOR_ROLE,
  VERIFIED_ACTOR_SOURCE,
} = require("./appointmentReviewVerifiedActorAuthorizationContract");

const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]+$/;

const REQUIRED_AUTHORIZATION_TRUE_FIELDS = Object.freeze([
  "accepted",
  "actorContextAccepted",
  "controlledHandlingAuthorized",
  "permissionMatched",
  "authorizationChecked",
  "controlledHandlingOnly",
]);

const REQUIRED_AUTHORIZATION_TEXT_FIELDS = Object.freeze([
  "reviewId",
  "actionIntent",
  "currentState",
  "actorId",
  "actorRole",
  "requestId",
  "requiredPermission",
  "contextType",
  "verificationSource",
]);

const UNSAFE_EXECUTION_FIELDS = Object.freeze([
  "executionAvailable",
  "executionRequested",
  "actionPerformed",
  "bookingCreated",
  "calendarChecked",
  "appointmentCreated",
  "calendarEventCreated",
  "databasePersisted",
  "reviewFound",
  "persisted",
  "idempotencyRecordCreated",
  "previousActionExecuted",
]);

const SAFETY_FIELDS = Object.freeze({
  validationOnly: true,
  guardChecked: true,
  idempotencyChecked: true,
  controlledHandlingOnly: true,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
});

function validateAppointmentReviewControlledActionGuard(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectGuard({
      code: "invalid_input",
      reason:
        "Appointment review controlled action guard input must be an object.",
    });
  }

  const unsafeInputField = findUnsafeExecutionField(input);

  if (unsafeInputField) {
    return rejectGuard({
      code: "unsafe_execution_flags",
      reason: `${unsafeInputField} must not be true on controlled action guard input.`,
      identifiers: normalizeKnownIdentifiers(input.authorizationResult, input),
    });
  }

  const { authorizationResult } = input;

  if (
    !authorizationResult ||
    typeof authorizationResult !== "object" ||
    Array.isArray(authorizationResult)
  ) {
    return rejectGuard({
      code: "invalid_authorization_result",
      reason: "Accepted Sprint 12D authorizationResult is required.",
      identifiers: normalizeKnownIdentifiers(authorizationResult, input),
    });
  }

  const unsafeAuthorizationField = findUnsafeExecutionField(authorizationResult);

  if (unsafeAuthorizationField) {
    return rejectGuard({
      code: "unsafe_execution_flags",
      reason: `${unsafeAuthorizationField} must not be true in authorizationResult.`,
      identifiers: normalizeKnownIdentifiers(authorizationResult, input),
    });
  }

  if (authorizationResult.accepted !== true) {
    return rejectGuard({
      code: "authorization_not_accepted",
      reason: "authorizationResult must be accepted before guard evaluation.",
      identifiers: normalizeKnownIdentifiers(authorizationResult, input),
    });
  }

  const authorizationError = validateAuthorizationResult(authorizationResult);

  if (authorizationError) {
    return rejectGuard({
      code: authorizationError.code,
      reason: authorizationError.reason,
      identifiers: normalizeKnownIdentifiers(authorizationResult, input),
    });
  }

  const idempotencyKeyResult = validateIdempotencyKey(input.idempotencyKey);

  if (!idempotencyKeyResult.accepted) {
    return rejectGuard({
      code: idempotencyKeyResult.code,
      reason: idempotencyKeyResult.reason,
      identifiers: normalizeKnownIdentifiers(authorizationResult, input),
    });
  }

  const idempotencyKey = idempotencyKeyResult.idempotencyKey;
  const expectedReviewVersionResult = validateReviewVersion(
    input.expectedReviewVersion,
    "expectedReviewVersion"
  );

  if (!expectedReviewVersionResult.accepted) {
    return rejectGuard({
      code: "invalid_expected_review_version",
      reason: expectedReviewVersionResult.reason,
      identifiers: normalizeKnownIdentifiers(authorizationResult, {
        ...input,
        idempotencyKey,
      }),
    });
  }

  const observedReviewVersionResult = validateReviewVersion(
    input.observedReviewVersion,
    "observedReviewVersion"
  );

  if (!observedReviewVersionResult.accepted) {
    return rejectGuard({
      code: "invalid_observed_review_version",
      reason: observedReviewVersionResult.reason,
      identifiers: normalizeKnownIdentifiers(authorizationResult, {
        ...input,
        idempotencyKey,
        expectedReviewVersion: expectedReviewVersionResult.reviewVersion,
      }),
    });
  }

  const expectedReviewVersion = expectedReviewVersionResult.reviewVersion;
  const observedReviewVersion = observedReviewVersionResult.reviewVersion;
  const requestFingerprint = buildReviewGuardRequestFingerprint({
    authorizationResult,
    expectedReviewVersion,
  });
  const identifiers = normalizeKnownIdentifiers(authorizationResult, {
    ...input,
    idempotencyKey,
    expectedReviewVersion,
    observedReviewVersion,
    requestFingerprint,
  });
  const { priorIdempotencyObservation } = input;

  if (priorIdempotencyObservation !== null && priorIdempotencyObservation !== undefined) {
    const unsafePriorField = findUnsafeExecutionField(priorIdempotencyObservation);

    if (unsafePriorField) {
      return rejectGuard({
        code: "unsafe_execution_flags",
        reason: `${unsafePriorField} must not be true in priorIdempotencyObservation.`,
        identifiers,
      });
    }

    const priorObservationError = validatePriorIdempotencyObservation(
      priorIdempotencyObservation
    );

    if (priorObservationError) {
      return rejectGuard({
        code: "invalid_prior_idempotency_observation",
        reason: priorObservationError.reason,
        identifiers,
      });
    }

    const priorIdempotencyKey = normalizeText(
      priorIdempotencyObservation.idempotencyKey
    );
    const priorRequestFingerprint = normalizeText(
      priorIdempotencyObservation.requestFingerprint
    );

    if (priorIdempotencyKey === idempotencyKey) {
      if (priorRequestFingerprint === requestFingerprint) {
        return acceptGuard({
          guardPassed: true,
          duplicateRequest: true,
          replayExistingResultOnly: true,
          eligibleForNewControlledHandling: false,
          idempotencyStatus: "matching_replay",
          reviewVersionMatched: expectedReviewVersion === observedReviewVersion,
          code: "matching_idempotent_replay",
          identifiers,
        });
      }

      return rejectGuard({
        code: "idempotency_key_conflict",
        reason:
          "idempotencyKey was previously observed with a different request fingerprint.",
        identifiers,
        idempotencyStatus: "conflict",
        reviewVersionMatched: expectedReviewVersion === observedReviewVersion,
      });
    }
  }

  if (expectedReviewVersion !== observedReviewVersion) {
    return rejectGuard({
      code: "review_version_conflict",
      reason:
        "expectedReviewVersion must match observedReviewVersion for new controlled handling.",
      identifiers,
      idempotencyStatus: "new_request",
      reviewVersionMatched: false,
    });
  }

  return acceptGuard({
    guardPassed: true,
    duplicateRequest: false,
    replayExistingResultOnly: false,
    eligibleForNewControlledHandling: true,
    idempotencyStatus: "new_request",
    reviewVersionMatched: true,
    code: "controlled_action_guard_passed",
    identifiers,
  });
}

function buildReviewGuardRequestFingerprint({
  authorizationResult,
  expectedReviewVersion,
}) {
  return [
    `reviewId:${normalizeText(authorizationResult.reviewId)}`,
    `actionIntent:${normalizeText(authorizationResult.actionIntent)}`,
    `actorId:${normalizeText(authorizationResult.actorId)}`,
    `requestId:${normalizeText(authorizationResult.requestId)}`,
    `requiredPermission:${normalizeText(authorizationResult.requiredPermission)}`,
    `expectedReviewVersion:${expectedReviewVersion}`,
  ].join("|");
}

function acceptGuard({
  guardPassed,
  duplicateRequest,
  replayExistingResultOnly,
  eligibleForNewControlledHandling,
  idempotencyStatus,
  reviewVersionMatched,
  code,
  identifiers,
}) {
  return {
    accepted: true,
    guardPassed,
    reviewVersionChecked: true,
    duplicateRequest,
    replayExistingResultOnly,
    eligibleForNewControlledHandling,
    idempotencyStatus,
    reviewVersionMatched,
    code,
    ...identifiers,
    ...createSafetyFields(),
  };
}

function rejectGuard({
  code,
  reason,
  identifiers = {},
  idempotencyStatus = "rejected",
  reviewVersionMatched = null,
}) {
  return {
    accepted: false,
    guardPassed: false,
    reviewVersionChecked: reviewVersionMatched !== null,
    duplicateRequest: false,
    replayExistingResultOnly: false,
    eligibleForNewControlledHandling: false,
    idempotencyStatus,
    reviewVersionMatched,
    code,
    reason,
    ...identifiers,
    ...createSafetyFields(),
  };
}

function validateAuthorizationResult(authorizationResult) {
  for (const fieldName of REQUIRED_AUTHORIZATION_TRUE_FIELDS) {
    if (authorizationResult[fieldName] !== true) {
      return {
        code: "invalid_authorization_result",
        reason: `authorizationResult.${fieldName} must be true.`,
      };
    }
  }

  for (const fieldName of REQUIRED_AUTHORIZATION_TEXT_FIELDS) {
    if (!normalizeText(authorizationResult[fieldName])) {
      return {
        code: "invalid_authorization_result",
        reason: `authorizationResult.${fieldName} is required.`,
      };
    }
  }

  if (normalizeText(authorizationResult.actorRole) !== VERIFIED_ACTOR_ROLE) {
    return {
      code: "invalid_authorization_result",
      reason: "authorizationResult.actorRole must be secretary.",
    };
  }

  if (normalizeText(authorizationResult.contextType) !== VERIFIED_ACTOR_CONTEXT_TYPE) {
    return {
      code: "invalid_authorization_result",
      reason:
        "authorizationResult.contextType must be verified_actor_context_v1.",
    };
  }

  if (normalizeText(authorizationResult.verificationSource) !== VERIFIED_ACTOR_SOURCE) {
    return {
      code: "invalid_authorization_result",
      reason:
        "authorizationResult.verificationSource must be server_auth_boundary.",
    };
  }

  const actionIntent = normalizeText(authorizationResult.actionIntent);
  const requiredPermission = ACTION_INTENT_REQUIRED_PERMISSIONS[actionIntent];

  if (!requiredPermission) {
    return {
      code: "invalid_authorization_result",
      reason:
        "authorizationResult.actionIntent must be approve_intent or reject_intent.",
    };
  }

  if (normalizeText(authorizationResult.requiredPermission) !== requiredPermission) {
    return {
      code: "invalid_authorization_result",
      reason:
        "authorizationResult.requiredPermission does not match actionIntent.",
    };
  }

  if (normalizeText(authorizationResult.persistence) !== "not_persisted") {
    return {
      code: "unsafe_authorization_result",
      reason: "authorizationResult.persistence must be not_persisted.",
    };
  }

  return null;
}

function validateIdempotencyKey(value) {
  const idempotencyKey = normalizeText(value);

  if (!idempotencyKey) {
    return {
      accepted: false,
      code: "missing_idempotency_key",
      reason: "idempotencyKey is required.",
    };
  }

  if (idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return {
      accepted: false,
      code: "invalid_idempotency_key",
      reason: `idempotencyKey must be ${IDEMPOTENCY_KEY_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return {
      accepted: false,
      code: "invalid_idempotency_key",
      reason:
        "idempotencyKey may contain only letters, numbers, hyphen, underscore, and colon.",
    };
  }

  if (/^(https?|file):/i.test(idempotencyKey)) {
    return {
      accepted: false,
      code: "invalid_idempotency_key",
      reason: "idempotencyKey must not be a URL.",
    };
  }

  return {
    accepted: true,
    idempotencyKey,
  };
}

function validateReviewVersion(value, fieldName) {
  if (!Number.isSafeInteger(value) || value < 1) {
    return {
      accepted: false,
      reason: `${fieldName} must be a positive safe integer.`,
    };
  }

  return {
    accepted: true,
    reviewVersion: value,
  };
}

function validatePriorIdempotencyObservation(priorIdempotencyObservation) {
  if (
    !priorIdempotencyObservation ||
    typeof priorIdempotencyObservation !== "object" ||
    Array.isArray(priorIdempotencyObservation)
  ) {
    return {
      reason: "priorIdempotencyObservation must be an object when supplied.",
    };
  }

  const idempotencyKeyResult = validateIdempotencyKey(
    priorIdempotencyObservation.idempotencyKey
  );

  if (!idempotencyKeyResult.accepted) {
    return {
      reason: "priorIdempotencyObservation.idempotencyKey is invalid.",
    };
  }

  if (!normalizeText(priorIdempotencyObservation.requestFingerprint)) {
    return {
      reason: "priorIdempotencyObservation.requestFingerprint is required.",
    };
  }

  return null;
}

function normalizeKnownIdentifiers(authorizationResult, input = {}) {
  const identifiers = {};

  if (authorizationResult && typeof authorizationResult === "object") {
    const reviewId = normalizeText(authorizationResult.reviewId);
    const actionIntent = normalizeText(authorizationResult.actionIntent);
    const currentState = normalizeText(authorizationResult.currentState);
    const actorId = normalizeText(authorizationResult.actorId);
    const actorRole = normalizeText(authorizationResult.actorRole);
    const requestId = normalizeText(authorizationResult.requestId);
    const requiredPermission = normalizeText(authorizationResult.requiredPermission);

    if (reviewId) {
      identifiers.reviewId = reviewId;
    }

    if (actionIntent) {
      identifiers.actionIntent = actionIntent;
    }

    if (currentState) {
      identifiers.currentState = currentState;
    }

    if (actorId) {
      identifiers.actorId = actorId;
    }

    if (actorRole) {
      identifiers.actorRole = actorRole;
    }

    if (requestId) {
      identifiers.requestId = requestId;
    }

    if (requiredPermission) {
      identifiers.requiredPermission = requiredPermission;
    }
  }

  const idempotencyKey = normalizeText(input.idempotencyKey);

  if (idempotencyKey) {
    identifiers.idempotencyKey = idempotencyKey;
  }

  if (Number.isSafeInteger(input.expectedReviewVersion)) {
    identifiers.expectedReviewVersion = input.expectedReviewVersion;
  }

  if (Number.isSafeInteger(input.observedReviewVersion)) {
    identifiers.observedReviewVersion = input.observedReviewVersion;
  }

  const requestFingerprint = normalizeText(input.requestFingerprint);

  if (requestFingerprint) {
    identifiers.requestFingerprint = requestFingerprint;
  }

  return identifiers;
}

function findUnsafeExecutionField(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  return UNSAFE_EXECUTION_FIELDS.find((fieldName) => input[fieldName] === true);
}

function createSafetyFields() {
  return { ...SAFETY_FIELDS };
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_PATTERN,
  REQUIRED_AUTHORIZATION_TEXT_FIELDS,
  REQUIRED_AUTHORIZATION_TRUE_FIELDS,
  UNSAFE_EXECUTION_FIELDS,
  buildReviewGuardRequestFingerprint,
  validateAppointmentReviewControlledActionGuard,
};
