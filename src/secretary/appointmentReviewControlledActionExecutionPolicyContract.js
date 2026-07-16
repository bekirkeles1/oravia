const {
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  COMMAND_ENVELOPE_TYPE,
} = require("./appointmentReviewControlledActionCommandEnvelopeContract");
const {
  ACTION_INTENT_REQUIRED_PERMISSIONS,
  VERIFIED_ACTOR_CONTEXT_TYPE,
  VERIFIED_ACTOR_ROLE,
  VERIFIED_ACTOR_SOURCE,
} = require("./appointmentReviewVerifiedActorAuthorizationContract");

const EXECUTION_POLICY_TYPE = "appointment_review_execution_policy_v1";
const EXECUTION_POLICY_VERSION = 1;
const EXECUTION_POLICY_SOURCE = "server_policy_boundary";
const EXECUTION_POLICY_MODE = "controlled_validation_only";

const POLICY_ALLOWED_ACTION_INTENTS = Object.freeze([
  "approve_intent",
  "reject_intent",
]);

const POLICY_ALLOWED_CURRENT_STATES = Object.freeze([
  "validation_only_intent_checked",
]);

const UNSAFE_POLICY_VALUES = Object.freeze([
  "*",
  "all",
  "admin",
]);

const REQUIRED_COMMAND_ENVELOPE_RESULT_TRUE_FIELDS = Object.freeze([
  "accepted",
  "commandEnvelopeConstructed",
  "commandEnvelopeChecked",
  "validationOnly",
  "controlledHandlingOnly",
]);

const REQUIRED_COMMAND_ENVELOPE_RESULT_FALSE_FIELDS = Object.freeze([
  "commandDispatchAvailable",
  "commandPersisted",
  "executionAvailable",
  "executionRequested",
  "actionPerformed",
  "bookingCreated",
  "calendarChecked",
  "appointmentCreated",
  "calendarEventCreated",
  "databasePersisted",
]);

const REQUIRED_ENVELOPE_TEXT_FIELDS = Object.freeze([
  "reviewId",
  "actionIntent",
  "currentState",
  "requestId",
  "idempotencyKey",
  "requestFingerprint",
]);

const REQUIRED_ACTOR_TEXT_FIELDS = Object.freeze([
  "actorId",
  "actorRole",
  "requiredPermission",
  "contextType",
  "verificationSource",
]);

const UNSAFE_EXECUTION_FIELDS = Object.freeze([
  "executionEnabled",
  "executorAvailable",
  "executionAvailable",
  "executionRequested",
  "actionPerformed",
  "commandDispatchAvailable",
  "commandDispatched",
  "commandPersisted",
  "bookingCreated",
  "calendarChecked",
  "appointmentCreated",
  "calendarEventCreated",
  "databasePersisted",
  "reviewFound",
  "persisted",
  "previousActionExecuted",
]);

const SAFETY_FIELDS = Object.freeze({
  executionPolicyChecked: true,
  validationOnly: true,
  controlledHandlingOnly: true,
  executionEnabled: false,
  executorAvailable: false,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  commandDispatched: false,
  commandPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
});

function evaluateAppointmentReviewControlledActionExecutionPolicy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectPolicy({
      code: "invalid_input",
      reason:
        "Appointment review controlled action execution policy input must be an object.",
    });
  }

  const { commandEnvelopeResult, executionPolicyContext } = input;
  const unsafeInputField = findUnsafeExecutionField(input);

  if (unsafeInputField) {
    return rejectPolicy({
      code:
        unsafeInputField === "executionEnabled"
          ? "execution_must_remain_disabled"
          : "unsafe_execution_flags",
      reason: `${unsafeInputField} must not be true on execution policy input.`,
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  if (
    !commandEnvelopeResult ||
    typeof commandEnvelopeResult !== "object" ||
    Array.isArray(commandEnvelopeResult)
  ) {
    return rejectPolicy({
      code: "invalid_command_envelope_result",
      reason: "Accepted Sprint 12F commandEnvelopeResult is required.",
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  const unsafeResultField = findUnsafeExecutionField(commandEnvelopeResult);

  if (unsafeResultField) {
    return rejectPolicy({
      code: "unsafe_execution_flags",
      reason: `${unsafeResultField} must not be true in commandEnvelopeResult.`,
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  if (commandEnvelopeResult.accepted !== true) {
    return rejectPolicy({
      code: "command_envelope_not_accepted",
      reason:
        "commandEnvelopeResult must be accepted before execution policy evaluation.",
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  if (commandEnvelopeResult.commandEnvelopeConstructed !== true) {
    return rejectPolicy({
      code: "command_envelope_not_constructed",
      reason:
        "commandEnvelopeResult must construct a command envelope before policy evaluation.",
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  const commandEnvelopeResultError =
    validateCommandEnvelopeResult(commandEnvelopeResult);

  if (commandEnvelopeResultError) {
    return rejectPolicy({
      code: commandEnvelopeResultError.code,
      reason: commandEnvelopeResultError.reason,
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  const { commandEnvelope } = commandEnvelopeResult;

  if (
    !commandEnvelope ||
    typeof commandEnvelope !== "object" ||
    Array.isArray(commandEnvelope)
  ) {
    return rejectPolicy({
      code: "invalid_command_envelope",
      reason: "commandEnvelopeResult.commandEnvelope is required.",
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  const unsafeEnvelopeField = findUnsafeExecutionField(commandEnvelope);

  if (unsafeEnvelopeField) {
    return rejectPolicy({
      code: "unsafe_execution_flags",
      reason: `${unsafeEnvelopeField} must not be true in commandEnvelope.`,
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  const commandEnvelopeError = validateCommandEnvelope(commandEnvelope);

  if (commandEnvelopeError) {
    return rejectPolicy({
      code: commandEnvelopeError.code,
      reason: commandEnvelopeError.reason,
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  if (
    !executionPolicyContext ||
    typeof executionPolicyContext !== "object" ||
    Array.isArray(executionPolicyContext)
  ) {
    return rejectPolicy({
      code: "missing_execution_policy_context",
      reason: "Trusted executionPolicyContext is required.",
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  const unsafePolicyField = findUnsafeExecutionField(executionPolicyContext);

  if (unsafePolicyField) {
    return rejectPolicy({
      code:
        unsafePolicyField === "executionEnabled"
          ? "execution_must_remain_disabled"
          : "unsafe_execution_flags",
      reason: `${unsafePolicyField} must not be true in executionPolicyContext.`,
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  const policyContextError = validateExecutionPolicyContext(executionPolicyContext);

  if (policyContextError) {
    return rejectPolicy({
      code: policyContextError.code,
      reason: policyContextError.reason,
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  const policyDecisionError = validateEnvelopeAgainstPolicy(
    commandEnvelope,
    executionPolicyContext
  );

  if (policyDecisionError) {
    return rejectPolicy({
      code: policyDecisionError.code,
      reason: policyDecisionError.reason,
      identifiers: normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext),
    });
  }

  const identifiers = normalizeKnownIdentifiers(
    commandEnvelopeResult,
    executionPolicyContext
  );

  return {
    accepted: true,
    policyMatched: true,
    policyAllowsControlledHandling: true,
    eligibleForExecutorBoundary: true,
    policyDecision: "allow_controlled_handling",
    ...identifiers,
    policyType: EXECUTION_POLICY_TYPE,
    policyVersion: EXECUTION_POLICY_VERSION,
    code: "controlled_action_execution_policy_matched",
    ...createSafetyFields(),
  };
}

function validateCommandEnvelopeResult(commandEnvelopeResult) {
  for (const fieldName of REQUIRED_COMMAND_ENVELOPE_RESULT_TRUE_FIELDS) {
    if (commandEnvelopeResult[fieldName] !== true) {
      return {
        code: "invalid_command_envelope_result",
        reason: `commandEnvelopeResult.${fieldName} must be true.`,
      };
    }
  }

  for (const fieldName of REQUIRED_COMMAND_ENVELOPE_RESULT_FALSE_FIELDS) {
    if (commandEnvelopeResult[fieldName] !== false) {
      return {
        code:
          fieldName === "commandDispatchAvailable" ||
          fieldName === "commandPersisted"
            ? "unsafe_command_envelope_result"
            : "invalid_command_envelope_result",
        reason: `commandEnvelopeResult.${fieldName} must be false.`,
      };
    }
  }

  if (normalizeText(commandEnvelopeResult.persistence) !== "not_persisted") {
    return {
      code: "unsafe_command_envelope_result",
      reason: "commandEnvelopeResult.persistence must be not_persisted.",
    };
  }

  return null;
}

function validateCommandEnvelope(commandEnvelope) {
  if (normalizeText(commandEnvelope.envelopeType) !== COMMAND_ENVELOPE_TYPE) {
    return {
      code: "unsupported_envelope_type",
      reason: "commandEnvelope.envelopeType is not supported.",
    };
  }

  if (commandEnvelope.schemaVersion !== COMMAND_ENVELOPE_SCHEMA_VERSION) {
    return {
      code: "unsupported_schema_version",
      reason: "commandEnvelope.schemaVersion is not supported.",
    };
  }

  for (const fieldName of REQUIRED_ENVELOPE_TEXT_FIELDS) {
    if (!normalizeText(commandEnvelope[fieldName])) {
      return {
        code: "invalid_command_envelope",
        reason: `commandEnvelope.${fieldName} is required.`,
      };
    }
  }

  if (
    !commandEnvelope.actor ||
    typeof commandEnvelope.actor !== "object" ||
    Array.isArray(commandEnvelope.actor)
  ) {
    return {
      code: "invalid_command_envelope",
      reason: "commandEnvelope.actor is required.",
    };
  }

  for (const fieldName of REQUIRED_ACTOR_TEXT_FIELDS) {
    if (!normalizeText(commandEnvelope.actor[fieldName])) {
      return {
        code: "invalid_command_envelope",
        reason: `commandEnvelope.actor.${fieldName} is required.`,
      };
    }
  }

  if (
    !Number.isSafeInteger(commandEnvelope.expectedReviewVersion) ||
    commandEnvelope.expectedReviewVersion < 1
  ) {
    return {
      code: "invalid_command_envelope",
      reason:
        "commandEnvelope.expectedReviewVersion must be a positive safe integer.",
    };
  }

  if (
    !Number.isSafeInteger(commandEnvelope.observedReviewVersion) ||
    commandEnvelope.observedReviewVersion < 1
  ) {
    return {
      code: "invalid_command_envelope",
      reason:
        "commandEnvelope.observedReviewVersion must be a positive safe integer.",
    };
  }

  if (commandEnvelope.expectedReviewVersion !== commandEnvelope.observedReviewVersion) {
    return {
      code: "review_version_conflict",
      reason:
        "commandEnvelope expectedReviewVersion and observedReviewVersion must match.",
    };
  }

  return null;
}

function validateExecutionPolicyContext(executionPolicyContext) {
  if (normalizeText(executionPolicyContext.policyType) !== EXECUTION_POLICY_TYPE) {
    return {
      code: "invalid_policy_type",
      reason: "executionPolicyContext.policyType is not supported.",
    };
  }

  if (executionPolicyContext.policyVersion !== EXECUTION_POLICY_VERSION) {
    return {
      code: "unsupported_policy_version",
      reason: "executionPolicyContext.policyVersion is not supported.",
    };
  }

  if (normalizeText(executionPolicyContext.policySource) !== EXECUTION_POLICY_SOURCE) {
    return {
      code: "unsupported_policy_source",
      reason: "executionPolicyContext.policySource is not supported.",
    };
  }

  if (normalizeText(executionPolicyContext.policyMode) !== EXECUTION_POLICY_MODE) {
    return {
      code: "unsupported_policy_mode",
      reason: "executionPolicyContext.policyMode is not supported.",
    };
  }

  if (normalizeText(executionPolicyContext.requiredEnvelopeType) !== COMMAND_ENVELOPE_TYPE) {
    return {
      code: "unsupported_envelope_type",
      reason: "executionPolicyContext.requiredEnvelopeType is not supported.",
    };
  }

  if (
    executionPolicyContext.requiredSchemaVersion !== COMMAND_ENVELOPE_SCHEMA_VERSION
  ) {
    return {
      code: "unsupported_schema_version",
      reason: "executionPolicyContext.requiredSchemaVersion is not supported.",
    };
  }

  if (executionPolicyContext.executionEnabled !== false) {
    return {
      code: "execution_must_remain_disabled",
      reason: "executionPolicyContext.executionEnabled must remain false.",
    };
  }

  const actionIntentListError = validatePolicyList({
    value: executionPolicyContext.allowedActionIntents,
    allowedValues: POLICY_ALLOWED_ACTION_INTENTS,
    missingCode: "missing_allowed_action_intents",
    invalidCode: "invalid_allowed_action_intents",
    fieldName: "allowedActionIntents",
  });

  if (actionIntentListError) {
    return actionIntentListError;
  }

  const currentStateListError = validatePolicyList({
    value: executionPolicyContext.allowedCurrentStates,
    allowedValues: POLICY_ALLOWED_CURRENT_STATES,
    missingCode: "missing_allowed_current_states",
    invalidCode: "invalid_allowed_current_states",
    fieldName: "allowedCurrentStates",
  });

  if (currentStateListError) {
    return currentStateListError;
  }

  return null;
}

function validatePolicyList({
  value,
  allowedValues,
  missingCode,
  invalidCode,
  fieldName,
}) {
  if (!Array.isArray(value)) {
    return {
      code: missingCode,
      reason: `executionPolicyContext.${fieldName} must be an array.`,
    };
  }

  const normalizedValues = value.map(normalizeText).filter(Boolean);

  for (const policyValue of normalizedValues) {
    if (
      UNSAFE_POLICY_VALUES.includes(policyValue) ||
      !allowedValues.includes(policyValue)
    ) {
      return {
        code: invalidCode,
        reason: `executionPolicyContext.${fieldName} contains an unsupported value.`,
      };
    }
  }

  if (new Set(normalizedValues).size !== normalizedValues.length) {
    return {
      code: invalidCode,
      reason: `executionPolicyContext.${fieldName} must not contain duplicate values.`,
    };
  }

  return null;
}

function validateEnvelopeAgainstPolicy(commandEnvelope, executionPolicyContext) {
  const actionIntent = normalizeText(commandEnvelope.actionIntent);
  const currentState = normalizeText(commandEnvelope.currentState);
  const actorRole = normalizeText(commandEnvelope.actor.actorRole);
  const contextType = normalizeText(commandEnvelope.actor.contextType);
  const verificationSource = normalizeText(commandEnvelope.actor.verificationSource);
  const requiredPermission = normalizeText(commandEnvelope.actor.requiredPermission);
  const expectedPermission = ACTION_INTENT_REQUIRED_PERMISSIONS[actionIntent];

  if (!expectedPermission) {
    return {
      code: "unsupported_action_intent",
      reason: "commandEnvelope.actionIntent is not supported.",
    };
  }

  if (!executionPolicyContext.allowedActionIntents.includes(actionIntent)) {
    return {
      code: "action_not_allowed_by_policy",
      reason: "commandEnvelope.actionIntent is not allowed by policy.",
    };
  }

  if (!POLICY_ALLOWED_CURRENT_STATES.includes(currentState)) {
    return {
      code: "unsupported_current_state",
      reason: "commandEnvelope.currentState is not supported.",
    };
  }

  if (!executionPolicyContext.allowedCurrentStates.includes(currentState)) {
    return {
      code: "state_not_allowed_by_policy",
      reason: "commandEnvelope.currentState is not allowed by policy.",
    };
  }

  if (actorRole !== VERIFIED_ACTOR_ROLE) {
    return {
      code: "unsupported_actor_role",
      reason: "commandEnvelope.actor.actorRole must be secretary.",
    };
  }

  if (contextType !== VERIFIED_ACTOR_CONTEXT_TYPE) {
    return {
      code: "invalid_actor_context_type",
      reason:
        "commandEnvelope.actor.contextType must be verified_actor_context_v1.",
    };
  }

  if (verificationSource !== VERIFIED_ACTOR_SOURCE) {
    return {
      code: "unsupported_verification_source",
      reason:
        "commandEnvelope.actor.verificationSource must be server_auth_boundary.",
    };
  }

  if (requiredPermission !== expectedPermission) {
    return {
      code: "required_permission_mismatch",
      reason: "commandEnvelope.actor.requiredPermission must match actionIntent.",
    };
  }

  return null;
}

function rejectPolicy({ code, reason, identifiers = {} }) {
  return {
    accepted: false,
    policyMatched: false,
    policyAllowsControlledHandling: false,
    eligibleForExecutorBoundary: false,
    policyDecision: "deny",
    ...identifiers,
    code,
    reason,
    ...createSafetyFields(),
  };
}

function normalizeKnownIdentifiers(commandEnvelopeResult, executionPolicyContext) {
  const identifiers = {};
  const commandEnvelope =
    commandEnvelopeResult &&
    typeof commandEnvelopeResult === "object" &&
    !Array.isArray(commandEnvelopeResult) &&
    commandEnvelopeResult.commandEnvelope &&
    typeof commandEnvelopeResult.commandEnvelope === "object"
      ? commandEnvelopeResult.commandEnvelope
      : null;

  if (commandEnvelope) {
    const actor =
      commandEnvelope.actor &&
      typeof commandEnvelope.actor === "object" &&
      !Array.isArray(commandEnvelope.actor)
        ? commandEnvelope.actor
        : {};
    const reviewId = normalizeText(commandEnvelope.reviewId);
    const actionIntent = normalizeText(commandEnvelope.actionIntent);
    const currentState = normalizeText(commandEnvelope.currentState);
    const actorId = normalizeText(actor.actorId);
    const actorRole = normalizeText(actor.actorRole);
    const requiredPermission = normalizeText(actor.requiredPermission);
    const requestId = normalizeText(commandEnvelope.requestId);
    const idempotencyKey = normalizeText(commandEnvelope.idempotencyKey);
    const requestFingerprint = normalizeText(commandEnvelope.requestFingerprint);
    const envelopeType = normalizeText(commandEnvelope.envelopeType);

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

    if (requiredPermission) {
      identifiers.requiredPermission = requiredPermission;
    }

    if (requestId) {
      identifiers.requestId = requestId;
    }

    if (idempotencyKey) {
      identifiers.idempotencyKey = idempotencyKey;
    }

    if (Number.isSafeInteger(commandEnvelope.expectedReviewVersion)) {
      identifiers.expectedReviewVersion = commandEnvelope.expectedReviewVersion;
    }

    if (Number.isSafeInteger(commandEnvelope.observedReviewVersion)) {
      identifiers.observedReviewVersion = commandEnvelope.observedReviewVersion;
    }

    if (requestFingerprint) {
      identifiers.requestFingerprint = requestFingerprint;
    }

    if (envelopeType) {
      identifiers.envelopeType = envelopeType;
    }

    if (Number.isSafeInteger(commandEnvelope.schemaVersion)) {
      identifiers.schemaVersion = commandEnvelope.schemaVersion;
    }
  }

  if (
    executionPolicyContext &&
    typeof executionPolicyContext === "object" &&
    !Array.isArray(executionPolicyContext)
  ) {
    const policyType = normalizeText(executionPolicyContext.policyType);

    if (policyType) {
      identifiers.policyType = policyType;
    }

    if (Number.isSafeInteger(executionPolicyContext.policyVersion)) {
      identifiers.policyVersion = executionPolicyContext.policyVersion;
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

function createSafetyFields() {
  return { ...SAFETY_FIELDS };
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  EXECUTION_POLICY_MODE,
  EXECUTION_POLICY_SOURCE,
  EXECUTION_POLICY_TYPE,
  EXECUTION_POLICY_VERSION,
  POLICY_ALLOWED_ACTION_INTENTS,
  POLICY_ALLOWED_CURRENT_STATES,
  UNSAFE_EXECUTION_FIELDS,
  evaluateAppointmentReviewControlledActionExecutionPolicy,
};
