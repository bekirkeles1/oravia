const {
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  COMMAND_ENVELOPE_TYPE,
} = require("./appointmentReviewControlledActionCommandEnvelopeContract");
const {
  EXECUTION_POLICY_MODE,
  EXECUTION_POLICY_SOURCE,
  EXECUTION_POLICY_TYPE,
  EXECUTION_POLICY_VERSION,
  POLICY_ALLOWED_ACTION_INTENTS,
  POLICY_ALLOWED_CURRENT_STATES,
} = require("./appointmentReviewControlledActionExecutionPolicyContract");
const {
  ACTION_INTENT_REQUIRED_PERMISSIONS,
  VERIFIED_ACTOR_CONTEXT_TYPE,
  VERIFIED_ACTOR_ROLE,
  VERIFIED_ACTOR_SOURCE,
} = require("./appointmentReviewVerifiedActorAuthorizationContract");

const MOCK_ACTOR_ID = "secretary-mock";
const MOCK_REVIEW_STATE = "validation_only_intent_checked";
const MOCK_OBSERVED_REVIEW_VERSION = 1;
const REVIEW_CONTEXT_TYPE = "appointment_review_snapshot_context_v1";
const REVIEW_CONTEXT_SOURCE = "server_review_boundary";
const IDEMPOTENCY_CONTEXT_TYPE = "appointment_review_idempotency_context_v1";
const IDEMPOTENCY_CONTEXT_SOURCE = "server_idempotency_boundary";

function createMockAppointmentReviewControlledActionDependencies() {
  return Object.freeze({
    resolveVerifiedActorContext,
    resolveAppointmentReviewContext,
    resolveIdempotencyContext,
    resolveExecutionPolicyContext,
  });
}

function resolveVerifiedActorContext(input = {}) {
  const actionIntent = normalizeText(input.actionIntent);
  const requiredPermission = ACTION_INTENT_REQUIRED_PERMISSIONS[actionIntent];
  const permissions = requiredPermission ? [requiredPermission] : [];

  return Object.freeze({
    contextType: VERIFIED_ACTOR_CONTEXT_TYPE,
    verificationSource: VERIFIED_ACTOR_SOURCE,
    actorId: MOCK_ACTOR_ID,
    role: VERIFIED_ACTOR_ROLE,
    authenticationVerified: true,
    authorizationVerified: true,
    permissions: Object.freeze([...permissions]),
  });
}

function resolveAppointmentReviewContext(input = {}) {
  return Object.freeze({
    contextType: REVIEW_CONTEXT_TYPE,
    contextSource: REVIEW_CONTEXT_SOURCE,
    reviewId: normalizeText(input.reviewId),
    currentState: MOCK_REVIEW_STATE,
    observedReviewVersion: MOCK_OBSERVED_REVIEW_VERSION,
  });
}

function resolveIdempotencyContext() {
  return Object.freeze({
    contextType: IDEMPOTENCY_CONTEXT_TYPE,
    contextSource: IDEMPOTENCY_CONTEXT_SOURCE,
    priorIdempotencyObservation: null,
  });
}

function resolveExecutionPolicyContext() {
  return Object.freeze({
    policyType: EXECUTION_POLICY_TYPE,
    policyVersion: EXECUTION_POLICY_VERSION,
    policySource: EXECUTION_POLICY_SOURCE,
    policyMode: EXECUTION_POLICY_MODE,
    allowedActionIntents: Object.freeze([...POLICY_ALLOWED_ACTION_INTENTS]),
    allowedCurrentStates: Object.freeze([...POLICY_ALLOWED_CURRENT_STATES]),
    requiredEnvelopeType: COMMAND_ENVELOPE_TYPE,
    requiredSchemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
    executionEnabled: false,
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  IDEMPOTENCY_CONTEXT_SOURCE,
  IDEMPOTENCY_CONTEXT_TYPE,
  MOCK_ACTOR_ID,
  MOCK_OBSERVED_REVIEW_VERSION,
  MOCK_REVIEW_STATE,
  REVIEW_CONTEXT_SOURCE,
  REVIEW_CONTEXT_TYPE,
  createMockAppointmentReviewControlledActionDependencies,
};
