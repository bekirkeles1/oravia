const {
  ACTION_INTENT_REQUIRED_PERMISSIONS,
  VERIFIED_ACTOR_CONTEXT_TYPE,
  VERIFIED_ACTOR_ROLE,
  VERIFIED_ACTOR_SOURCE,
} = require("./appointmentReviewVerifiedActorAuthorizationContract");

const COMMAND_ENVELOPE_TYPE =
  "appointment_review_controlled_action_command_v1";
const COMMAND_ENVELOPE_SCHEMA_VERSION = 1;

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

const REQUIRED_GUARD_TRUE_FIELDS = Object.freeze([
  "accepted",
  "guardPassed",
  "guardChecked",
  "idempotencyChecked",
  "reviewVersionChecked",
  "controlledHandlingOnly",
  "eligibleForNewControlledHandling",
  "reviewVersionMatched",
]);

const REQUIRED_GUARD_FALSE_FIELDS = Object.freeze([
  "duplicateRequest",
  "replayExistingResultOnly",
]);

const REQUIRED_GUARD_TEXT_FIELDS = Object.freeze([
  "reviewId",
  "actionIntent",
  "actorId",
  "actorRole",
  "requestId",
  "requiredPermission",
  "idempotencyKey",
  "requestFingerprint",
]);

const CROSS_CONTRACT_FIELDS = Object.freeze([
  Object.freeze({
    fieldName: "reviewId",
    code: "cross_contract_review_id_mismatch",
  }),
  Object.freeze({
    fieldName: "actionIntent",
    code: "cross_contract_action_intent_mismatch",
  }),
  Object.freeze({
    fieldName: "actorId",
    code: "cross_contract_actor_id_mismatch",
  }),
  Object.freeze({
    fieldName: "actorRole",
    code: "cross_contract_actor_role_mismatch",
  }),
  Object.freeze({
    fieldName: "requestId",
    code: "cross_contract_request_id_mismatch",
  }),
  Object.freeze({
    fieldName: "requiredPermission",
    code: "cross_contract_permission_mismatch",
  }),
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
  "commandDispatched",
  "commandPersisted",
  "idempotencyRecordCreated",
  "previousActionExecuted",
]);

const SAFETY_FIELDS = Object.freeze({
  commandEnvelopeChecked: true,
  validationOnly: true,
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

function buildAppointmentReviewControlledActionCommandEnvelope(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectCommandEnvelope({
      code: "invalid_input",
      reason:
        "Appointment review controlled action command envelope input must be an object.",
    });
  }

  const { authorizationResult, guardResult } = input;

  const unsafeInputField = findUnsafeExecutionField(input);

  if (unsafeInputField) {
    return rejectCommandEnvelope({
      code: "unsafe_execution_flags",
      reason: `${unsafeInputField} must not be true on command envelope input.`,
      identifiers: normalizeKnownIdentifiers(authorizationResult, guardResult),
    });
  }

  if (
    !authorizationResult ||
    typeof authorizationResult !== "object" ||
    Array.isArray(authorizationResult)
  ) {
    return rejectCommandEnvelope({
      code: "invalid_authorization_result",
      reason: "Accepted Sprint 12D authorizationResult is required.",
      identifiers: normalizeKnownIdentifiers(authorizationResult, guardResult),
    });
  }

  const unsafeAuthorizationField = findUnsafeExecutionField(authorizationResult);

  if (unsafeAuthorizationField) {
    return rejectCommandEnvelope({
      code: "unsafe_execution_flags",
      reason: `${unsafeAuthorizationField} must not be true in authorizationResult.`,
      identifiers: normalizeKnownIdentifiers(authorizationResult, guardResult),
    });
  }

  if (authorizationResult.accepted !== true) {
    return rejectCommandEnvelope({
      code: "authorization_not_accepted",
      reason:
        "authorizationResult must be accepted before command envelope construction.",
      identifiers: normalizeKnownIdentifiers(authorizationResult, guardResult),
    });
  }

  const authorizationError = validateAuthorizationResult(authorizationResult);

  if (authorizationError) {
    return rejectCommandEnvelope({
      code: authorizationError.code,
      reason: authorizationError.reason,
      identifiers: normalizeKnownIdentifiers(authorizationResult, guardResult),
    });
  }

  if (
    !guardResult ||
    typeof guardResult !== "object" ||
    Array.isArray(guardResult)
  ) {
    return rejectCommandEnvelope({
      code: "invalid_guard_result",
      reason: "Accepted Sprint 12E new-request guardResult is required.",
      identifiers: normalizeKnownIdentifiers(authorizationResult, guardResult),
    });
  }

  const unsafeGuardField = findUnsafeExecutionField(guardResult);

  if (unsafeGuardField) {
    return rejectCommandEnvelope({
      code: "unsafe_execution_flags",
      reason: `${unsafeGuardField} must not be true in guardResult.`,
      identifiers: normalizeKnownIdentifiers(authorizationResult, guardResult),
    });
  }

  const guardError = validateGuardResult(guardResult);

  if (guardError) {
    return rejectCommandEnvelope({
      code: guardError.code,
      reason: guardError.reason,
      identifiers: normalizeKnownIdentifiers(authorizationResult, guardResult),
    });
  }

  const crossContractError = validateCrossContractMatch(
    authorizationResult,
    guardResult
  );

  if (crossContractError) {
    return rejectCommandEnvelope({
      code: crossContractError.code,
      reason: crossContractError.reason,
      identifiers: normalizeKnownIdentifiers(authorizationResult, guardResult),
    });
  }

  const actionPermissionError = validateActionPermission(
    authorizationResult.actionIntent,
    authorizationResult.requiredPermission
  );

  if (actionPermissionError) {
    return rejectCommandEnvelope({
      code: actionPermissionError.code,
      reason: actionPermissionError.reason,
      identifiers: normalizeKnownIdentifiers(authorizationResult, guardResult),
    });
  }

  const commandEnvelope = freezeCommandEnvelope({
    envelopeType: COMMAND_ENVELOPE_TYPE,
    schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
    reviewId: normalizeText(authorizationResult.reviewId),
    actionIntent: normalizeText(authorizationResult.actionIntent),
    currentState: normalizeText(authorizationResult.currentState),
    actor: {
      actorId: normalizeText(authorizationResult.actorId),
      actorRole: normalizeText(authorizationResult.actorRole),
      requiredPermission: normalizeText(authorizationResult.requiredPermission),
      contextType: normalizeText(authorizationResult.contextType),
      verificationSource: normalizeText(authorizationResult.verificationSource),
    },
    requestId: normalizeText(authorizationResult.requestId),
    idempotencyKey: normalizeText(guardResult.idempotencyKey),
    expectedReviewVersion: guardResult.expectedReviewVersion,
    observedReviewVersion: guardResult.observedReviewVersion,
    requestFingerprint: normalizeText(guardResult.requestFingerprint),
  });

  return {
    accepted: true,
    commandEnvelopeConstructed: true,
    commandDispatchAvailable: false,
    commandPersisted: false,
    code: "controlled_action_command_envelope_constructed",
    commandEnvelope,
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

  if (normalizeText(authorizationResult.persistence) !== "not_persisted") {
    return {
      code: "unsafe_authorization_result",
      reason: "authorizationResult.persistence must be not_persisted.",
    };
  }

  return validateActionPermission(
    authorizationResult.actionIntent,
    authorizationResult.requiredPermission
  );
}

function validateGuardResult(guardResult) {
  if (guardResult.accepted !== true) {
    if (
      guardResult.idempotencyStatus === "conflict" ||
      guardResult.code === "idempotency_key_conflict"
    ) {
      return {
        code: "idempotency_conflict_not_eligible",
        reason:
          "idempotency conflict guard results cannot construct command envelopes.",
      };
    }

    if (
      guardResult.reviewVersionMatched === false ||
      guardResult.code === "review_version_conflict"
    ) {
      return {
        code: "review_version_not_matched",
        reason:
          "review version conflict guard results cannot construct command envelopes.",
      };
    }

    return {
      code: "guard_not_passed",
      reason:
        "guardResult must be accepted before command envelope construction.",
    };
  }

  if (
    guardResult.duplicateRequest === true ||
    guardResult.replayExistingResultOnly === true ||
    guardResult.idempotencyStatus === "matching_replay"
  ) {
    return {
      code: "replay_not_eligible_for_new_command",
      reason:
        "Matching replay guard results cannot construct new command envelopes.",
    };
  }

  for (const fieldName of REQUIRED_GUARD_TRUE_FIELDS) {
    if (guardResult[fieldName] !== true) {
      return {
        code: "invalid_guard_result",
        reason: `guardResult.${fieldName} must be true.`,
      };
    }
  }

  for (const fieldName of REQUIRED_GUARD_FALSE_FIELDS) {
    if (guardResult[fieldName] !== false) {
      return {
        code: "replay_not_eligible_for_new_command",
        reason: `guardResult.${fieldName} must be false for new command envelope construction.`,
      };
    }
  }

  for (const fieldName of REQUIRED_GUARD_TEXT_FIELDS) {
    if (!normalizeText(guardResult[fieldName])) {
      return {
        code: "invalid_guard_result",
        reason: `guardResult.${fieldName} is required.`,
      };
    }
  }

  if (guardResult.idempotencyStatus !== "new_request") {
    if (guardResult.idempotencyStatus === "conflict") {
      return {
        code: "idempotency_conflict_not_eligible",
        reason:
          "idempotency conflict guard results cannot construct command envelopes.",
      };
    }

    return {
      code: "replay_not_eligible_for_new_command",
      reason: "Only new_request guard results can construct command envelopes.",
    };
  }

  if (
    !Number.isSafeInteger(guardResult.expectedReviewVersion) ||
    guardResult.expectedReviewVersion < 1
  ) {
    return {
      code: "invalid_guard_result",
      reason: "guardResult.expectedReviewVersion must be a positive safe integer.",
    };
  }

  if (
    !Number.isSafeInteger(guardResult.observedReviewVersion) ||
    guardResult.observedReviewVersion < 1
  ) {
    return {
      code: "invalid_guard_result",
      reason: "guardResult.observedReviewVersion must be a positive safe integer.",
    };
  }

  if (guardResult.expectedReviewVersion !== guardResult.observedReviewVersion) {
    return {
      code: "review_version_not_matched",
      reason:
        "guardResult expectedReviewVersion and observedReviewVersion must match.",
    };
  }

  if (normalizeText(guardResult.persistence) !== "not_persisted") {
    return {
      code: "invalid_guard_result",
      reason: "guardResult.persistence must be not_persisted.",
    };
  }

  return null;
}

function validateCrossContractMatch(authorizationResult, guardResult) {
  for (const { fieldName, code } of CROSS_CONTRACT_FIELDS) {
    if (authorizationResult[fieldName] !== guardResult[fieldName]) {
      return {
        code,
        reason: `authorizationResult.${fieldName} must exactly match guardResult.${fieldName}.`,
      };
    }
  }

  return null;
}

function validateActionPermission(actionIntentValue, requiredPermissionValue) {
  const actionIntent = normalizeText(actionIntentValue);
  const requiredPermission = normalizeText(requiredPermissionValue);
  const expectedPermission = ACTION_INTENT_REQUIRED_PERMISSIONS[actionIntent];

  if (!expectedPermission) {
    return {
      code: "unsupported_action_intent",
      reason: "actionIntent must be approve_intent or reject_intent.",
    };
  }

  if (requiredPermission !== expectedPermission) {
    return {
      code: "required_permission_mismatch",
      reason: "requiredPermission must match actionIntent.",
    };
  }

  return null;
}

function rejectCommandEnvelope({
  code,
  reason,
  identifiers = {},
}) {
  return {
    accepted: false,
    commandEnvelopeConstructed: false,
    commandDispatchAvailable: false,
    commandPersisted: false,
    commandEnvelope: null,
    ...identifiers,
    code,
    reason,
    ...createSafetyFields(),
  };
}

function normalizeKnownIdentifiers(authorizationResult, guardResult) {
  const identifiers = {};
  const source = authorizationResult || guardResult;

  if (source && typeof source === "object" && !Array.isArray(source)) {
    const reviewId = normalizeText(source.reviewId);
    const actionIntent = normalizeText(source.actionIntent);
    const currentState = normalizeText(source.currentState);
    const actorId = normalizeText(source.actorId);
    const actorRole = normalizeText(source.actorRole);
    const requestId = normalizeText(source.requestId);
    const requiredPermission = normalizeText(source.requiredPermission);

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

  if (guardResult && typeof guardResult === "object" && !Array.isArray(guardResult)) {
    const idempotencyKey = normalizeText(guardResult.idempotencyKey);
    const requestFingerprint = normalizeText(guardResult.requestFingerprint);

    if (idempotencyKey) {
      identifiers.idempotencyKey = idempotencyKey;
    }

    if (Number.isSafeInteger(guardResult.expectedReviewVersion)) {
      identifiers.expectedReviewVersion = guardResult.expectedReviewVersion;
    }

    if (Number.isSafeInteger(guardResult.observedReviewVersion)) {
      identifiers.observedReviewVersion = guardResult.observedReviewVersion;
    }

    if (requestFingerprint) {
      identifiers.requestFingerprint = requestFingerprint;
    }
  }

  return identifiers;
}

function findUnsafeExecutionField(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  return UNSAFE_EXECUTION_FIELDS.find((fieldName) => input[fieldName] === true);
}

function freezeCommandEnvelope(commandEnvelope) {
  return Object.freeze({
    ...commandEnvelope,
    actor: Object.freeze({ ...commandEnvelope.actor }),
  });
}

function createSafetyFields() {
  return { ...SAFETY_FIELDS };
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  COMMAND_ENVELOPE_TYPE,
  CROSS_CONTRACT_FIELDS,
  REQUIRED_AUTHORIZATION_TEXT_FIELDS,
  REQUIRED_AUTHORIZATION_TRUE_FIELDS,
  REQUIRED_GUARD_FALSE_FIELDS,
  REQUIRED_GUARD_TEXT_FIELDS,
  REQUIRED_GUARD_TRUE_FIELDS,
  UNSAFE_EXECUTION_FIELDS,
  buildAppointmentReviewControlledActionCommandEnvelope,
};
