const {
  SUPPORTED_CONTROLLED_ACTION_INTENTS,
} = require("./appointmentReviewActionPreconditionsContract");

const VERIFIED_ACTOR_CONTEXT_TYPE = "verified_actor_context_v1";
const VERIFIED_ACTOR_SOURCE = "server_auth_boundary";
const VERIFIED_ACTOR_ROLE = "secretary";

const ACTION_INTENT_REQUIRED_PERMISSIONS = Object.freeze({
  approve_intent: "appointment_review:approve",
  reject_intent: "appointment_review:reject",
});

const UNSAFE_EXECUTION_FIELDS = Object.freeze([
  "executionAvailable",
  "executionRequested",
  "actionPerformed",
  "bookingCreated",
  "calendarChecked",
  "appointmentCreated",
  "calendarEventCreated",
  "databasePersisted",
]);

const UNSAFE_PERMISSIONS = Object.freeze([
  "*",
  "admin",
  "all",
  "appointment_review:*",
]);

const SAFETY_FIELDS = Object.freeze({
  authorizationChecked: true,
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

function authorizeAppointmentReviewVerifiedActor(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectAuthorization({
      code: "invalid_input",
      reason:
        "Appointment review verified actor authorization input must be an object.",
      actorContextAccepted: false,
    });
  }

  const { preconditionsResult, verifiedActorContext } = input;

  if (
    !preconditionsResult ||
    typeof preconditionsResult !== "object" ||
    Array.isArray(preconditionsResult)
  ) {
    return rejectAuthorization({
      code: "invalid_preconditions_result",
      reason: "Accepted preconditionsResult is required for authorization.",
      actorContextAccepted: hasValidActorContextShape(verifiedActorContext),
    });
  }

  const unsafePreconditionsField = findUnsafeExecutionField(preconditionsResult);

  if (unsafePreconditionsField) {
    return rejectAuthorization({
      code: "unsafe_execution_flags",
      reason: `${unsafePreconditionsField} must not be true in preconditionsResult.`,
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: hasValidActorContextShape(verifiedActorContext),
    });
  }

  if (preconditionsResult.accepted !== true) {
    return rejectAuthorization({
      code: "preconditions_not_accepted",
      reason: "preconditionsResult must be accepted before actor authorization.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: hasValidActorContextShape(verifiedActorContext),
    });
  }

  const unsafePreconditions = findUnsafePreconditionsResult(preconditionsResult);

  if (unsafePreconditions) {
    return rejectAuthorization({
      code: "unsafe_preconditions_result",
      reason: unsafePreconditions,
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: hasValidActorContextShape(verifiedActorContext),
    });
  }

  const identifiersError = validatePreconditionsIdentifiers(preconditionsResult);

  if (identifiersError) {
    return rejectAuthorization({
      code: identifiersError.code,
      reason: identifiersError.reason,
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: hasValidActorContextShape(verifiedActorContext),
    });
  }

  if (
    !verifiedActorContext ||
    typeof verifiedActorContext !== "object" ||
    Array.isArray(verifiedActorContext)
  ) {
    return rejectAuthorization({
      code: "missing_verified_actor_context",
      reason:
        "verifiedActorContext is required and must come from a trusted server auth boundary.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: false,
    });
  }

  const unsafeActorField = findUnsafeExecutionField(verifiedActorContext);

  if (unsafeActorField) {
    return rejectAuthorization({
      code: "unsafe_execution_flags",
      reason: `${unsafeActorField} must not be true in verifiedActorContext.`,
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: false,
    });
  }

  const contextType = normalizeText(verifiedActorContext.contextType);

  if (contextType !== VERIFIED_ACTOR_CONTEXT_TYPE) {
    return rejectAuthorization({
      code: "invalid_actor_context_type",
      reason:
        "verifiedActorContext.contextType must be verified_actor_context_v1.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: false,
    });
  }

  const verificationSource = normalizeText(verifiedActorContext.verificationSource);

  if (verificationSource !== VERIFIED_ACTOR_SOURCE) {
    return rejectAuthorization({
      code: "unsupported_verification_source",
      reason:
        "verifiedActorContext.verificationSource must be server_auth_boundary.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: false,
    });
  }

  if (verifiedActorContext.authenticationVerified !== true) {
    return rejectAuthorization({
      code: "authentication_not_verified",
      reason:
        "verifiedActorContext.authenticationVerified must be true for this boundary.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: false,
    });
  }

  if (verifiedActorContext.authorizationVerified !== true) {
    return rejectAuthorization({
      code: "authorization_not_verified",
      reason:
        "verifiedActorContext.authorizationVerified must be true for this boundary.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: false,
    });
  }

  const actorId = normalizeText(verifiedActorContext.actorId);

  if (!actorId) {
    return rejectAuthorization({
      code: "missing_actor_id",
      reason: "verifiedActorContext.actorId is required.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: false,
    });
  }

  const actorRole = normalizeText(verifiedActorContext.role);

  if (actorRole !== VERIFIED_ACTOR_ROLE) {
    return rejectAuthorization({
      code: "unsupported_actor_role",
      reason: "verifiedActorContext.role must be secretary.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: false,
    });
  }

  if (!Array.isArray(verifiedActorContext.permissions)) {
    return rejectAuthorization({
      code: "missing_permissions",
      reason: "verifiedActorContext.permissions must be an array.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: false,
    });
  }

  const permissions = normalizePermissions(verifiedActorContext.permissions);

  if (permissions.length === 0) {
    return rejectAuthorization({
      code: "missing_permissions",
      reason: "verifiedActorContext.permissions must include explicit permissions.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: false,
    });
  }

  const unsafePermission = permissions.find((permission) =>
    UNSAFE_PERMISSIONS.includes(permission)
  );

  if (unsafePermission) {
    return rejectAuthorization({
      code: "required_permission_missing",
      reason: `${unsafePermission} is not an accepted explicit appointment review permission.`,
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: false,
    });
  }

  if (actorId !== normalizeText(preconditionsResult.actorId)) {
    return rejectAuthorization({
      code: "actor_id_mismatch",
      reason:
        "verifiedActorContext.actorId must match preconditionsResult.actorId.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: true,
    });
  }

  if (actorRole !== normalizeText(preconditionsResult.actorRole)) {
    return rejectAuthorization({
      code: "actor_role_mismatch",
      reason:
        "verifiedActorContext.role must match preconditionsResult.actorRole.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: true,
    });
  }

  const actionIntent = normalizeText(preconditionsResult.actionIntent);
  const requiredPermission = ACTION_INTENT_REQUIRED_PERMISSIONS[actionIntent];

  if (!requiredPermission) {
    return rejectAuthorization({
      code: "unsupported_action_intent",
      reason: "Unsupported actionIntent for verified actor authorization.",
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: true,
    });
  }

  if (!permissions.includes(requiredPermission)) {
    return rejectAuthorization({
      code: "required_permission_missing",
      reason: `${requiredPermission} is required for ${actionIntent}.`,
      identifiers: normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext),
      actorContextAccepted: true,
      permissionMatched: false,
      requiredPermission,
    });
  }

  return {
    accepted: true,
    actorContextAccepted: true,
    controlledHandlingAuthorized: true,
    permissionMatched: true,
    reviewId: normalizeText(preconditionsResult.reviewId),
    actionIntent,
    currentState: normalizeText(preconditionsResult.currentState),
    actorId,
    actorRole,
    requestId: normalizeText(preconditionsResult.requestId),
    requiredPermission,
    contextType,
    verificationSource,
    code: "controlled_handling_authorized",
    ...createSafetyFields(),
  };
}

function listAppointmentReviewActionAuthorizationPermissions() {
  return Object.values(ACTION_INTENT_REQUIRED_PERMISSIONS);
}

function rejectAuthorization({
  code,
  reason,
  identifiers = {},
  actorContextAccepted = false,
  permissionMatched = false,
  requiredPermission = null,
}) {
  return {
    accepted: false,
    actorContextAccepted,
    controlledHandlingAuthorized: false,
    permissionMatched,
    ...identifiers,
    requiredPermission,
    code,
    reason,
    ...createSafetyFields(),
  };
}

function validatePreconditionsIdentifiers(preconditionsResult) {
  const requiredTextFields = [
    "reviewId",
    "actionIntent",
    "currentState",
    "actorId",
    "actorRole",
    "requestId",
  ];

  for (const fieldName of requiredTextFields) {
    if (!normalizeText(preconditionsResult[fieldName])) {
      return {
        code: "invalid_preconditions_result",
        reason: `preconditionsResult.${fieldName} is required.`,
      };
    }
  }

  const actionIntent = normalizeText(preconditionsResult.actionIntent);

  if (!SUPPORTED_CONTROLLED_ACTION_INTENTS.includes(actionIntent)) {
    return {
      code: "unsupported_action_intent",
      reason: "Unsupported actionIntent for verified actor authorization.",
    };
  }

  return null;
}

function findUnsafePreconditionsResult(preconditionsResult) {
  if (preconditionsResult.eligibleForControlledHandling !== true) {
    return "preconditionsResult.eligibleForControlledHandling must be true.";
  }

  if (preconditionsResult.controlledHandlingOnly !== true) {
    return "preconditionsResult.controlledHandlingOnly must be true.";
  }

  if (preconditionsResult.preconditionsChecked !== true) {
    return "preconditionsResult.preconditionsChecked must be true.";
  }

  if (preconditionsResult.validationOnly !== true) {
    return "preconditionsResult.validationOnly must be true.";
  }

  if (normalizeText(preconditionsResult.persistence) !== "not_persisted") {
    return "preconditionsResult.persistence must be not_persisted.";
  }

  return null;
}

function normalizeKnownIdentifiers(preconditionsResult, verifiedActorContext) {
  const identifiers = {};

  if (preconditionsResult && typeof preconditionsResult === "object") {
    const reviewId = normalizeText(preconditionsResult.reviewId);
    const actionIntent = normalizeText(preconditionsResult.actionIntent);
    const currentState = normalizeText(preconditionsResult.currentState);
    const actorId = normalizeText(preconditionsResult.actorId);
    const actorRole = normalizeText(preconditionsResult.actorRole);
    const requestId = normalizeText(preconditionsResult.requestId);

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
  }

  if (verifiedActorContext && typeof verifiedActorContext === "object") {
    const contextType = normalizeText(verifiedActorContext.contextType);
    const verificationSource = normalizeText(
      verifiedActorContext.verificationSource
    );

    if (contextType) {
      identifiers.contextType = contextType;
    }

    if (verificationSource) {
      identifiers.verificationSource = verificationSource;
    }
  }

  return identifiers;
}

function findUnsafeExecutionField(input) {
  return UNSAFE_EXECUTION_FIELDS.find((fieldName) => input[fieldName] === true);
}

function hasValidActorContextShape(verifiedActorContext) {
  return Boolean(
    verifiedActorContext &&
      typeof verifiedActorContext === "object" &&
      !Array.isArray(verifiedActorContext)
  );
}

function normalizePermissions(permissions) {
  return permissions.map(normalizeText).filter(Boolean);
}

function createSafetyFields() {
  return { ...SAFETY_FIELDS };
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  ACTION_INTENT_REQUIRED_PERMISSIONS,
  UNSAFE_EXECUTION_FIELDS,
  UNSAFE_PERMISSIONS,
  VERIFIED_ACTOR_CONTEXT_TYPE,
  VERIFIED_ACTOR_ROLE,
  VERIFIED_ACTOR_SOURCE,
  authorizeAppointmentReviewVerifiedActor,
  listAppointmentReviewActionAuthorizationPermissions,
};
