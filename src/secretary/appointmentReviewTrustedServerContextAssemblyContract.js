const {
  APPOINTMENT_REVIEW_ACTION_STATES,
} = require("./appointmentReviewActionIntentStateMachine");
const {
  VERIFIED_ACTOR_CONTEXT_TYPE,
  VERIFIED_ACTOR_SOURCE,
} = require("./appointmentReviewVerifiedActorAuthorizationContract");
const {
  EXECUTION_POLICY_SOURCE,
} = require("./appointmentReviewControlledActionExecutionPolicyContract");

const SERVER_CONTEXT_TYPE =
  "appointment_review_controlled_action_server_context_v1";
const SERVER_CONTEXT_SOURCE = "server_context_boundary";
const REVIEW_CONTEXT_TYPE = "appointment_review_snapshot_context_v1";
const REVIEW_CONTEXT_SOURCE = "server_review_boundary";
const IDEMPOTENCY_CONTEXT_TYPE = "appointment_review_idempotency_context_v1";
const IDEMPOTENCY_CONTEXT_SOURCE = "server_idempotency_boundary";

const CLIENT_ALLOWED_FIELDS = Object.freeze([
  "reviewId",
  "actionIntent",
  "requestId",
  "idempotencyKey",
  "expectedReviewVersion",
]);

const CLIENT_TRUSTED_CONTEXT_FIELDS = Object.freeze([
  "currentState",
  "actor",
  "actorId",
  "actorRole",
  "role",
  "permissions",
  "verifiedActorContext",
  "authenticationVerified",
  "authorizationVerified",
  "observedReviewVersion",
  "priorIdempotencyObservation",
  "executionPolicyContext",
  "executionPolicy",
  "policyType",
  "policyVersion",
  "policySource",
  "policyMode",
  "executionEnabled",
  "requiredPermission",
]);

const UNSAFE_EXECUTION_FIELDS = Object.freeze([
  "executionEnabled",
  "executorAvailable",
  "executionAvailable",
  "executionRequested",
  "actionPerformed",
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
  "idempotencyRecordCreated",
]);

const ASSEMBLY_CODES = Object.freeze({
  ASSEMBLED: "controlled_action_server_context_assembled",
  INVALID_INPUT: "invalid_input",
  MISSING_CLIENT_REQUEST: "missing_client_request",
  INVALID_CLIENT_REQUEST: "invalid_client_request",
  MISSING_REVIEW_ID: "missing_review_id",
  MISSING_ACTION_INTENT: "missing_action_intent",
  MISSING_REQUEST_ID: "missing_request_id",
  MISSING_IDEMPOTENCY_KEY: "missing_idempotency_key",
  INVALID_EXPECTED_REVIEW_VERSION: "invalid_expected_review_version",
  CLIENT_TRUSTED_CONTEXT_INJECTION: "client_trusted_context_injection",
  MISSING_TRUSTED_SERVER_CONTEXT: "missing_trusted_server_context",
  INVALID_SERVER_CONTEXT_TYPE: "invalid_server_context_type",
  UNSUPPORTED_SERVER_CONTEXT_SOURCE: "unsupported_server_context_source",
  INVALID_VERIFIED_ACTOR_CONTEXT: "invalid_verified_actor_context",
  AUTHENTICATION_NOT_VERIFIED: "authentication_not_verified",
  AUTHORIZATION_NOT_VERIFIED: "authorization_not_verified",
  INVALID_REVIEW_CONTEXT: "invalid_review_context",
  REVIEW_ID_MISMATCH: "review_id_mismatch",
  INVALID_REVIEW_STATE: "invalid_review_state",
  INVALID_OBSERVED_REVIEW_VERSION: "invalid_observed_review_version",
  INVALID_IDEMPOTENCY_CONTEXT: "invalid_idempotency_context",
  INVALID_EXECUTION_POLICY_CONTEXT: "invalid_execution_policy_context",
  EXECUTION_MUST_REMAIN_DISABLED: "execution_must_remain_disabled",
  UNSAFE_EXECUTION_FLAGS: "unsafe_execution_flags",
});

const SAFETY_FIELDS = Object.freeze({
  serverContextChecked: true,
  pipelineInputChecked: true,
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

function assembleAppointmentReviewTrustedServerContext(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectAssembly({
      code: ASSEMBLY_CODES.INVALID_INPUT,
      reason:
        "Appointment review trusted server context assembly input must be an object.",
      trustedContextAccepted: false,
    });
  }

  const { clientRequest, trustedServerContext } = input;

  if (
    !clientRequest ||
    typeof clientRequest !== "object" ||
    Array.isArray(clientRequest)
  ) {
    return rejectAssembly({
      code: ASSEMBLY_CODES.MISSING_CLIENT_REQUEST,
      reason: "clientRequest is required for trusted server context assembly.",
      trustedContextAccepted: hasObjectShape(trustedServerContext),
    });
  }

  const clientInjectionField = findClientTrustedContextInjection(clientRequest);

  if (clientInjectionField) {
    return rejectAssembly({
      code: ASSEMBLY_CODES.CLIENT_TRUSTED_CONTEXT_INJECTION,
      reason: `clientRequest must not provide trusted context field ${clientInjectionField}.`,
      trustedContextAccepted: hasObjectShape(trustedServerContext),
    });
  }

  const unsafeClientField = findUnsafeTrueField(clientRequest);

  if (unsafeClientField) {
    return rejectAssembly({
      code: ASSEMBLY_CODES.UNSAFE_EXECUTION_FLAGS,
      reason: `clientRequest must not claim unsafe ${unsafeClientField}.`,
      trustedContextAccepted: hasObjectShape(trustedServerContext),
    });
  }

  const clientError = validateClientRequest(clientRequest);

  if (clientError) {
    return rejectAssembly({
      code: clientError.code,
      reason: clientError.reason,
      trustedContextAccepted: hasObjectShape(trustedServerContext),
    });
  }

  if (
    !trustedServerContext ||
    typeof trustedServerContext !== "object" ||
    Array.isArray(trustedServerContext)
  ) {
    return rejectAssembly({
      code: ASSEMBLY_CODES.MISSING_TRUSTED_SERVER_CONTEXT,
      reason: "trustedServerContext is required.",
      trustedContextAccepted: false,
    });
  }

  const unsafeTrustedField = findUnsafeTrueField(trustedServerContext);

  if (unsafeTrustedField) {
    return rejectAssembly({
      code:
        unsafeTrustedField === "executionEnabled"
          ? ASSEMBLY_CODES.EXECUTION_MUST_REMAIN_DISABLED
          : ASSEMBLY_CODES.UNSAFE_EXECUTION_FLAGS,
      reason: `trustedServerContext must not claim unsafe ${unsafeTrustedField}.`,
      trustedContextAccepted: false,
    });
  }

  const serverContextError = validateServerContext(
    trustedServerContext,
    normalizeText(clientRequest.reviewId)
  );

  if (serverContextError) {
    return rejectAssembly({
      code: serverContextError.code,
      reason: serverContextError.reason,
      trustedContextAccepted: false,
    });
  }

  const { verifiedActorContext, reviewContext, idempotencyContext } =
    trustedServerContext;
  const executionPolicyContext = trustedServerContext.executionPolicyContext;
  const reviewId = normalizeText(clientRequest.reviewId);
  const actionIntent = normalizeText(clientRequest.actionIntent);
  const requestId = normalizeText(clientRequest.requestId);
  const idempotencyKey = normalizeText(clientRequest.idempotencyKey);
  const expectedReviewVersion = clientRequest.expectedReviewVersion;
  const currentState = normalizeText(reviewContext.currentState);
  const observedReviewVersion = reviewContext.observedReviewVersion;
  const actorId = normalizeText(verifiedActorContext.actorId);
  const role = normalizeText(verifiedActorContext.role);
  const priorIdempotencyObservation =
    idempotencyContext.priorIdempotencyObservation === undefined
      ? null
      : idempotencyContext.priorIdempotencyObservation;
  const frozenVerifiedActorContext = freezeVerifiedActorContext(
    verifiedActorContext
  );
  const frozenExecutionPolicyContext = deepFreezeClone(executionPolicyContext);
  const frozenPriorIdempotencyObservation =
    priorIdempotencyObservation &&
    typeof priorIdempotencyObservation === "object" &&
    !Array.isArray(priorIdempotencyObservation)
      ? deepFreezeClone(priorIdempotencyObservation)
      : priorIdempotencyObservation;
  const preconditionsInput = Object.freeze({
    reviewId,
    actionIntent,
    currentState,
    actor: Object.freeze({
      actorId,
      role,
    }),
    requestId,
  });
  const pipelineInput = Object.freeze({
    preconditionsInput,
    verifiedActorContext: frozenVerifiedActorContext,
    idempotencyKey,
    expectedReviewVersion,
    observedReviewVersion,
    priorIdempotencyObservation: frozenPriorIdempotencyObservation,
    executionPolicyContext: frozenExecutionPolicyContext,
  });

  return Object.freeze({
    accepted: true,
    trustedContextAccepted: true,
    pipelineInputConstructed: true,
    code: ASSEMBLY_CODES.ASSEMBLED,
    pipelineInput,
    ...createSafetyFields(),
  });
}

function validateClientRequest(clientRequest) {
  for (const fieldName of Object.keys(clientRequest)) {
    if (!CLIENT_ALLOWED_FIELDS.includes(fieldName)) {
      return {
        code: ASSEMBLY_CODES.INVALID_CLIENT_REQUEST,
        reason: `clientRequest.${fieldName} is not an accepted client field.`,
      };
    }
  }

  if (!normalizeText(clientRequest.reviewId)) {
    return {
      code: ASSEMBLY_CODES.MISSING_REVIEW_ID,
      reason: "clientRequest.reviewId is required.",
    };
  }

  if (!normalizeText(clientRequest.actionIntent)) {
    return {
      code: ASSEMBLY_CODES.MISSING_ACTION_INTENT,
      reason: "clientRequest.actionIntent is required.",
    };
  }

  if (!normalizeText(clientRequest.requestId)) {
    return {
      code: ASSEMBLY_CODES.MISSING_REQUEST_ID,
      reason: "clientRequest.requestId is required.",
    };
  }

  if (!normalizeText(clientRequest.idempotencyKey)) {
    return {
      code: ASSEMBLY_CODES.MISSING_IDEMPOTENCY_KEY,
      reason: "clientRequest.idempotencyKey is required.",
    };
  }

  if (
    !Number.isSafeInteger(clientRequest.expectedReviewVersion) ||
    clientRequest.expectedReviewVersion < 1
  ) {
    return {
      code: ASSEMBLY_CODES.INVALID_EXPECTED_REVIEW_VERSION,
      reason: "clientRequest.expectedReviewVersion must be a positive safe integer.",
    };
  }

  return null;
}

function validateServerContext(trustedServerContext, clientReviewId) {
  if (normalizeText(trustedServerContext.contextType) !== SERVER_CONTEXT_TYPE) {
    return {
      code: ASSEMBLY_CODES.INVALID_SERVER_CONTEXT_TYPE,
      reason: "trustedServerContext.contextType is not supported.",
    };
  }

  if (normalizeText(trustedServerContext.contextSource) !== SERVER_CONTEXT_SOURCE) {
    return {
      code: ASSEMBLY_CODES.UNSUPPORTED_SERVER_CONTEXT_SOURCE,
      reason: "trustedServerContext.contextSource is not supported.",
    };
  }

  const actorError = validateVerifiedActorContext(
    trustedServerContext.verifiedActorContext
  );

  if (actorError) {
    return actorError;
  }

  const reviewError = validateReviewContext(
    trustedServerContext.reviewContext,
    clientReviewId
  );

  if (reviewError) {
    return reviewError;
  }

  const idempotencyError = validateIdempotencyContext(
    trustedServerContext.idempotencyContext
  );

  if (idempotencyError) {
    return idempotencyError;
  }

  const executionPolicyError = validateExecutionPolicyContext(
    trustedServerContext.executionPolicyContext
  );

  if (executionPolicyError) {
    return executionPolicyError;
  }

  return null;
}

function validateVerifiedActorContext(verifiedActorContext) {
  if (!hasObjectShape(verifiedActorContext)) {
    return {
      code: ASSEMBLY_CODES.INVALID_VERIFIED_ACTOR_CONTEXT,
      reason: "trustedServerContext.verifiedActorContext is required.",
    };
  }

  if (normalizeText(verifiedActorContext.contextType) !== VERIFIED_ACTOR_CONTEXT_TYPE) {
    return {
      code: ASSEMBLY_CODES.INVALID_VERIFIED_ACTOR_CONTEXT,
      reason: "verifiedActorContext.contextType is not supported.",
    };
  }

  if (normalizeText(verifiedActorContext.verificationSource) !== VERIFIED_ACTOR_SOURCE) {
    return {
      code: ASSEMBLY_CODES.INVALID_VERIFIED_ACTOR_CONTEXT,
      reason: "verifiedActorContext.verificationSource is not supported.",
    };
  }

  if (!normalizeText(verifiedActorContext.actorId)) {
    return {
      code: ASSEMBLY_CODES.INVALID_VERIFIED_ACTOR_CONTEXT,
      reason: "verifiedActorContext.actorId is required.",
    };
  }

  if (!normalizeText(verifiedActorContext.role)) {
    return {
      code: ASSEMBLY_CODES.INVALID_VERIFIED_ACTOR_CONTEXT,
      reason: "verifiedActorContext.role is required.",
    };
  }

  if (verifiedActorContext.authenticationVerified !== true) {
    return {
      code: ASSEMBLY_CODES.AUTHENTICATION_NOT_VERIFIED,
      reason: "verifiedActorContext.authenticationVerified must be true.",
    };
  }

  if (verifiedActorContext.authorizationVerified !== true) {
    return {
      code: ASSEMBLY_CODES.AUTHORIZATION_NOT_VERIFIED,
      reason: "verifiedActorContext.authorizationVerified must be true.",
    };
  }

  if (!Array.isArray(verifiedActorContext.permissions)) {
    return {
      code: ASSEMBLY_CODES.INVALID_VERIFIED_ACTOR_CONTEXT,
      reason: "verifiedActorContext.permissions must be an array.",
    };
  }

  return null;
}

function validateReviewContext(reviewContext, clientReviewId) {
  if (!hasObjectShape(reviewContext)) {
    return {
      code: ASSEMBLY_CODES.INVALID_REVIEW_CONTEXT,
      reason: "trustedServerContext.reviewContext is required.",
    };
  }

  if (normalizeText(reviewContext.contextType) !== REVIEW_CONTEXT_TYPE) {
    return {
      code: ASSEMBLY_CODES.INVALID_REVIEW_CONTEXT,
      reason: "reviewContext.contextType is not supported.",
    };
  }

  if (normalizeText(reviewContext.contextSource) !== REVIEW_CONTEXT_SOURCE) {
    return {
      code: ASSEMBLY_CODES.INVALID_REVIEW_CONTEXT,
      reason: "reviewContext.contextSource is not supported.",
    };
  }

  const reviewId = normalizeText(reviewContext.reviewId);

  if (!reviewId) {
    return {
      code: ASSEMBLY_CODES.INVALID_REVIEW_CONTEXT,
      reason: "reviewContext.reviewId is required.",
    };
  }

  if (clientReviewId && reviewId !== clientReviewId) {
    return {
      code: ASSEMBLY_CODES.REVIEW_ID_MISMATCH,
      reason: "reviewContext.reviewId must match clientRequest.reviewId.",
    };
  }

  const currentState = normalizeText(reviewContext.currentState);

  if (
    !currentState ||
    !APPOINTMENT_REVIEW_ACTION_STATES.includes(currentState)
  ) {
    return {
      code: ASSEMBLY_CODES.INVALID_REVIEW_STATE,
      reason: "reviewContext.currentState is not a known appointment review state.",
    };
  }

  if (
    !Number.isSafeInteger(reviewContext.observedReviewVersion) ||
    reviewContext.observedReviewVersion < 1
  ) {
    return {
      code: ASSEMBLY_CODES.INVALID_OBSERVED_REVIEW_VERSION,
      reason: "reviewContext.observedReviewVersion must be a positive safe integer.",
    };
  }

  return null;
}

function validateIdempotencyContext(idempotencyContext) {
  if (!hasObjectShape(idempotencyContext)) {
    return {
      code: ASSEMBLY_CODES.INVALID_IDEMPOTENCY_CONTEXT,
      reason: "trustedServerContext.idempotencyContext is required.",
    };
  }

  if (normalizeText(idempotencyContext.contextType) !== IDEMPOTENCY_CONTEXT_TYPE) {
    return {
      code: ASSEMBLY_CODES.INVALID_IDEMPOTENCY_CONTEXT,
      reason: "idempotencyContext.contextType is not supported.",
    };
  }

  if (
    normalizeText(idempotencyContext.contextSource) !==
    IDEMPOTENCY_CONTEXT_SOURCE
  ) {
    return {
      code: ASSEMBLY_CODES.INVALID_IDEMPOTENCY_CONTEXT,
      reason: "idempotencyContext.contextSource is not supported.",
    };
  }

  return null;
}

function validateExecutionPolicyContext(executionPolicyContext) {
  if (!hasObjectShape(executionPolicyContext)) {
    return {
      code: ASSEMBLY_CODES.INVALID_EXECUTION_POLICY_CONTEXT,
      reason: "trustedServerContext.executionPolicyContext is required.",
    };
  }

  for (const fieldName of [
    "policyType",
    "policyVersion",
    "policySource",
    "policyMode",
    "executionEnabled",
  ]) {
    if (!Object.prototype.hasOwnProperty.call(executionPolicyContext, fieldName)) {
      return {
        code: ASSEMBLY_CODES.INVALID_EXECUTION_POLICY_CONTEXT,
        reason: `executionPolicyContext.${fieldName} is required.`,
      };
    }
  }

  if (normalizeText(executionPolicyContext.policySource) !== EXECUTION_POLICY_SOURCE) {
    return {
      code: ASSEMBLY_CODES.INVALID_EXECUTION_POLICY_CONTEXT,
      reason: "executionPolicyContext.policySource is not supported.",
    };
  }

  if (executionPolicyContext.executionEnabled !== false) {
    return {
      code: ASSEMBLY_CODES.EXECUTION_MUST_REMAIN_DISABLED,
      reason: "executionPolicyContext.executionEnabled must remain false.",
    };
  }

  return null;
}

function rejectAssembly({
  code,
  reason,
  trustedContextAccepted,
}) {
  return Object.freeze({
    accepted: false,
    trustedContextAccepted,
    pipelineInputConstructed: false,
    pipelineInput: null,
    code,
    reason,
    ...createSafetyFields(),
  });
}

function findClientTrustedContextInjection(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findClientTrustedContextInjection(item);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (CLIENT_TRUSTED_CONTEXT_FIELDS.includes(fieldName)) {
      return fieldName;
    }

    const nested = findClientTrustedContextInjection(fieldValue);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function findUnsafeTrueField(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findUnsafeTrueField(item);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (UNSAFE_EXECUTION_FIELDS.includes(fieldName) && fieldValue === true) {
      return fieldName;
    }

    const nested = findUnsafeTrueField(fieldValue);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function freezeVerifiedActorContext(verifiedActorContext) {
  return Object.freeze({
    ...verifiedActorContext,
    actorId: normalizeText(verifiedActorContext.actorId),
    role: normalizeText(verifiedActorContext.role),
    permissions: Object.freeze([...verifiedActorContext.permissions]),
  });
}

function deepFreezeClone(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreezeClone));
  }

  const clone = {};

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    clone[fieldName] = deepFreezeClone(fieldValue);
  }

  return Object.freeze(clone);
}

function hasObjectShape(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function createSafetyFields() {
  return { ...SAFETY_FIELDS };
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  ASSEMBLY_CODES,
  CLIENT_ALLOWED_FIELDS,
  CLIENT_TRUSTED_CONTEXT_FIELDS,
  IDEMPOTENCY_CONTEXT_SOURCE,
  IDEMPOTENCY_CONTEXT_TYPE,
  REVIEW_CONTEXT_SOURCE,
  REVIEW_CONTEXT_TYPE,
  SAFETY_FIELDS,
  SERVER_CONTEXT_SOURCE,
  SERVER_CONTEXT_TYPE,
  UNSAFE_EXECUTION_FIELDS,
  assembleAppointmentReviewTrustedServerContext,
};
