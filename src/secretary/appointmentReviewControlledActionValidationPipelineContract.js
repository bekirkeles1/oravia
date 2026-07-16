const {
  validateAppointmentReviewActionPreconditions,
} = require("./appointmentReviewActionPreconditionsContract");
const {
  authorizeAppointmentReviewVerifiedActor,
} = require("./appointmentReviewVerifiedActorAuthorizationContract");
const {
  validateAppointmentReviewControlledActionGuard,
} = require("./appointmentReviewControlledActionGuardContract");
const {
  buildAppointmentReviewControlledActionCommandEnvelope,
} = require("./appointmentReviewControlledActionCommandEnvelopeContract");
const {
  evaluateAppointmentReviewControlledActionExecutionPolicy,
} = require("./appointmentReviewControlledActionExecutionPolicyContract");

const PIPELINE_STAGE_ORDER = Object.freeze([
  "preconditions",
  "authorization",
  "idempotency_and_version_guard",
  "command_envelope",
  "execution_policy",
]);

const PIPELINE_STAGE_KEYS = Object.freeze({
  PRECONDITIONS: "preconditions",
  AUTHORIZATION: "authorization",
  IDEMPOTENCY_AND_VERSION_GUARD: "idempotencyAndVersionGuard",
  COMMAND_ENVELOPE: "commandEnvelope",
  EXECUTION_POLICY: "executionPolicy",
});

const PIPELINE_CODES = Object.freeze({
  COMPLETED: "controlled_action_validation_pipeline_completed",
  MATCHING_REPLAY: "controlled_action_pipeline_matching_replay",
  INVALID_INPUT: "invalid_input",
  PRECONDITIONS_STAGE_REJECTED: "preconditions_stage_rejected",
  AUTHORIZATION_STAGE_REJECTED: "authorization_stage_rejected",
  IDEMPOTENCY_GUARD_STAGE_REJECTED: "idempotency_guard_stage_rejected",
  COMMAND_ENVELOPE_STAGE_REJECTED: "command_envelope_stage_rejected",
  EXECUTION_POLICY_STAGE_REJECTED: "execution_policy_stage_rejected",
  UNSAFE_EXECUTION_FLAGS: "unsafe_execution_flags",
  UNEXPECTED_STAGE_RESULT: "unexpected_stage_result",
});

const STAGE_REJECTION_CODES = Object.freeze({
  preconditions: PIPELINE_CODES.PRECONDITIONS_STAGE_REJECTED,
  authorization: PIPELINE_CODES.AUTHORIZATION_STAGE_REJECTED,
  idempotencyAndVersionGuard: PIPELINE_CODES.IDEMPOTENCY_GUARD_STAGE_REJECTED,
  commandEnvelope: PIPELINE_CODES.COMMAND_ENVELOPE_STAGE_REJECTED,
  executionPolicy: PIPELINE_CODES.EXECUTION_POLICY_STAGE_REJECTED,
});

const STAGE_FAILED_NAMES = Object.freeze({
  preconditions: "preconditions",
  authorization: "authorization",
  idempotencyAndVersionGuard: "idempotency_and_version_guard",
  commandEnvelope: "command_envelope",
  executionPolicy: "execution_policy",
});

const UNSAFE_STAGE_RESULT_FIELDS = Object.freeze([
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
]);

const PIPELINE_SAFETY_FIELDS = Object.freeze({
  pipelineChecked: true,
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

const DEFAULT_CONTRACTS = Object.freeze({
  validatePreconditions: validateAppointmentReviewActionPreconditions,
  authorizeActor: authorizeAppointmentReviewVerifiedActor,
  validateGuard: validateAppointmentReviewControlledActionGuard,
  buildCommandEnvelope: buildAppointmentReviewControlledActionCommandEnvelope,
  evaluateExecutionPolicy: evaluateAppointmentReviewControlledActionExecutionPolicy,
});

function runAppointmentReviewControlledActionValidationPipeline(input) {
  return runAppointmentReviewControlledActionValidationPipelineWithContracts(
    input,
    DEFAULT_CONTRACTS
  );
}

function runAppointmentReviewControlledActionValidationPipelineWithContracts(
  input,
  contracts
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectPipeline({
      code: PIPELINE_CODES.INVALID_INPUT,
      reason:
        "Appointment review controlled action validation pipeline input must be an object.",
      stages: createInitialStages(),
      failedStage: null,
    });
  }

  const activeContracts = { ...DEFAULT_CONTRACTS, ...contracts };
  const stages = createInitialStages();

  const preconditionsResult = activeContracts.validatePreconditions(
    input.preconditionsInput
  );
  const preconditionsIssue = validateStageResult(
    preconditionsResult,
    PIPELINE_STAGE_KEYS.PRECONDITIONS
  );

  if (preconditionsIssue) {
    return rejectPipelineForStageIssue({
      issue: preconditionsIssue,
      stageKey: PIPELINE_STAGE_KEYS.PRECONDITIONS,
      stages,
      resultFields: { preconditionsResult },
    });
  }

  stages.preconditions = createStageStatus(preconditionsResult);

  if (preconditionsResult.accepted !== true) {
    return rejectPipelineForRejectedStage({
      stageKey: PIPELINE_STAGE_KEYS.PRECONDITIONS,
      stageResult: preconditionsResult,
      stages,
      resultFields: { preconditionsResult },
    });
  }

  const authorizationResult = activeContracts.authorizeActor({
    preconditionsResult,
    verifiedActorContext: input.verifiedActorContext,
  });
  const authorizationIssue = validateStageResult(
    authorizationResult,
    PIPELINE_STAGE_KEYS.AUTHORIZATION
  );

  if (authorizationIssue) {
    return rejectPipelineForStageIssue({
      issue: authorizationIssue,
      stageKey: PIPELINE_STAGE_KEYS.AUTHORIZATION,
      stages,
      resultFields: { preconditionsResult, authorizationResult },
    });
  }

  stages.authorization = createStageStatus(authorizationResult);

  if (authorizationResult.accepted !== true) {
    return rejectPipelineForRejectedStage({
      stageKey: PIPELINE_STAGE_KEYS.AUTHORIZATION,
      stageResult: authorizationResult,
      stages,
      resultFields: { preconditionsResult, authorizationResult },
    });
  }

  const guardResult = activeContracts.validateGuard({
    authorizationResult,
    idempotencyKey: input.idempotencyKey,
    expectedReviewVersion: input.expectedReviewVersion,
    observedReviewVersion: input.observedReviewVersion,
    priorIdempotencyObservation: input.priorIdempotencyObservation,
  });
  const guardIssue = validateStageResult(
    guardResult,
    PIPELINE_STAGE_KEYS.IDEMPOTENCY_AND_VERSION_GUARD
  );

  if (guardIssue) {
    return rejectPipelineForStageIssue({
      issue: guardIssue,
      stageKey: PIPELINE_STAGE_KEYS.IDEMPOTENCY_AND_VERSION_GUARD,
      stages,
      resultFields: { preconditionsResult, authorizationResult, guardResult },
    });
  }

  stages.idempotencyAndVersionGuard = createStageStatus(
    guardResult,
    guardResult.replayExistingResultOnly === true ? "matching_replay" : null
  );

  if (guardResult.accepted !== true) {
    return rejectPipelineForRejectedStage({
      stageKey: PIPELINE_STAGE_KEYS.IDEMPOTENCY_AND_VERSION_GUARD,
      stageResult: guardResult,
      stages,
      resultFields: { preconditionsResult, authorizationResult, guardResult },
    });
  }

  if (guardResult.replayExistingResultOnly === true) {
    return freezeResult({
      accepted: true,
      pipelineCompleted: true,
      allStagesAccepted: false,
      matchingReplay: true,
      replayExistingResultOnly: true,
      eligibleForNewControlledHandling: false,
      eligibleForExecutorBoundary: false,
      failedStage: null,
      code: PIPELINE_CODES.MATCHING_REPLAY,
      stages: freezeStages(stages),
      authorizationResult,
      guardResult,
      ...createSafetyFields(),
    });
  }

  const commandEnvelopeResult = activeContracts.buildCommandEnvelope({
    authorizationResult,
    guardResult,
  });
  const commandEnvelopeIssue = validateStageResult(
    commandEnvelopeResult,
    PIPELINE_STAGE_KEYS.COMMAND_ENVELOPE
  );

  if (commandEnvelopeIssue) {
    return rejectPipelineForStageIssue({
      issue: commandEnvelopeIssue,
      stageKey: PIPELINE_STAGE_KEYS.COMMAND_ENVELOPE,
      stages,
      resultFields: {
        preconditionsResult,
        authorizationResult,
        guardResult,
        commandEnvelopeResult,
      },
    });
  }

  stages.commandEnvelope = createStageStatus(commandEnvelopeResult);

  if (commandEnvelopeResult.accepted !== true) {
    return rejectPipelineForRejectedStage({
      stageKey: PIPELINE_STAGE_KEYS.COMMAND_ENVELOPE,
      stageResult: commandEnvelopeResult,
      stages,
      resultFields: {
        preconditionsResult,
        authorizationResult,
        guardResult,
        commandEnvelopeResult,
      },
    });
  }

  const executionPolicyResult = activeContracts.evaluateExecutionPolicy({
    commandEnvelopeResult,
    executionPolicyContext: input.executionPolicyContext,
  });
  const executionPolicyIssue = validateStageResult(
    executionPolicyResult,
    PIPELINE_STAGE_KEYS.EXECUTION_POLICY
  );

  if (executionPolicyIssue) {
    return rejectPipelineForStageIssue({
      issue: executionPolicyIssue,
      stageKey: PIPELINE_STAGE_KEYS.EXECUTION_POLICY,
      stages,
      resultFields: {
        preconditionsResult,
        authorizationResult,
        guardResult,
        commandEnvelopeResult,
        executionPolicyResult,
      },
    });
  }

  stages.executionPolicy = createStageStatus(executionPolicyResult);

  if (executionPolicyResult.accepted !== true) {
    return rejectPipelineForRejectedStage({
      stageKey: PIPELINE_STAGE_KEYS.EXECUTION_POLICY,
      stageResult: executionPolicyResult,
      stages,
      resultFields: {
        preconditionsResult,
        authorizationResult,
        guardResult,
        commandEnvelopeResult,
        executionPolicyResult,
      },
    });
  }

  return freezeResult({
    accepted: true,
    pipelineCompleted: true,
    allStagesAccepted: true,
    matchingReplay: false,
    replayExistingResultOnly: false,
    eligibleForNewControlledHandling: true,
    eligibleForExecutorBoundary:
      executionPolicyResult.eligibleForExecutorBoundary === true,
    failedStage: null,
    code: PIPELINE_CODES.COMPLETED,
    stages: freezeStages(stages),
    authorizationResult,
    guardResult,
    commandEnvelopeResult,
    executionPolicyResult,
    commandEnvelope: commandEnvelopeResult.commandEnvelope,
    policyDecision: executionPolicyResult.policyDecision,
    ...createSafetyFields(),
  });
}

function rejectPipelineForRejectedStage({
  stageKey,
  stageResult,
  stages,
  resultFields,
}) {
  stages[stageKey] = createStageStatus(stageResult, "rejected");

  return rejectPipeline({
    code: STAGE_REJECTION_CODES[stageKey],
    reason: `${STAGE_FAILED_NAMES[stageKey]} stage rejected.`,
    failedStage: STAGE_FAILED_NAMES[stageKey],
    stageCode: normalizeText(stageResult.code),
    stages,
    resultFields,
  });
}

function rejectPipelineForStageIssue({
  issue,
  stageKey,
  stages,
  resultFields,
}) {
  stages[stageKey] = createStageStatus(issue.stageResult, "rejected");

  return rejectPipeline({
    code: issue.code,
    reason: issue.reason,
    failedStage: STAGE_FAILED_NAMES[stageKey],
    stageCode: normalizeText(issue.stageResult && issue.stageResult.code),
    stages,
    resultFields,
  });
}

function rejectPipeline({
  code,
  reason,
  failedStage,
  stageCode = "",
  stages,
  resultFields = {},
}) {
  return freezeResult({
    accepted: false,
    pipelineCompleted: false,
    allStagesAccepted: false,
    matchingReplay: false,
    replayExistingResultOnly: false,
    eligibleForNewControlledHandling: false,
    eligibleForExecutorBoundary: false,
    failedStage,
    code,
    reason,
    stageCode: stageCode || null,
    stages: freezeStages(stages || createInitialStages()),
    ...resultFields,
    ...createSafetyFields(),
  });
}

function validateStageResult(stageResult, stageKey) {
  if (!stageResult || typeof stageResult !== "object" || Array.isArray(stageResult)) {
    return {
      code: PIPELINE_CODES.UNEXPECTED_STAGE_RESULT,
      reason: `${STAGE_FAILED_NAMES[stageKey]} stage returned a malformed result.`,
      stageResult,
    };
  }

  if (typeof stageResult.accepted !== "boolean") {
    return {
      code: PIPELINE_CODES.UNEXPECTED_STAGE_RESULT,
      reason: `${STAGE_FAILED_NAMES[stageKey]} stage result must include accepted boolean.`,
      stageResult,
    };
  }

  const unsafeField = findUnsafeStageResultField(stageResult);

  if (unsafeField) {
    return {
      code: PIPELINE_CODES.UNSAFE_EXECUTION_FLAGS,
      reason: `${STAGE_FAILED_NAMES[stageKey]} stage result has unsafe ${unsafeField}.`,
      stageResult,
    };
  }

  if (normalizeText(stageResult.persistence) !== "not_persisted") {
    return {
      code: PIPELINE_CODES.UNSAFE_EXECUTION_FLAGS,
      reason: `${STAGE_FAILED_NAMES[stageKey]} stage result must remain not_persisted.`,
      stageResult,
    };
  }

  return null;
}

function findUnsafeStageResultField(stageResult) {
  return UNSAFE_STAGE_RESULT_FIELDS.find((fieldName) => stageResult[fieldName] === true);
}

function createInitialStages() {
  return {
    preconditions: createNotRunStageStatus(),
    authorization: createNotRunStageStatus(),
    idempotencyAndVersionGuard: createNotRunStageStatus(),
    commandEnvelope: createNotRunStageStatus(),
    executionPolicy: createNotRunStageStatus(),
  };
}

function createNotRunStageStatus() {
  return Object.freeze({ status: "not_run" });
}

function createStageStatus(stageResult, statusOverride = null) {
  const status =
    statusOverride ||
    (stageResult && stageResult.accepted === true ? "accepted" : "rejected");
  const stageStatus = { status };
  const code = normalizeText(stageResult && stageResult.code);

  if (code) {
    stageStatus.code = code;
  }

  return Object.freeze(stageStatus);
}

function freezeStages(stages) {
  return Object.freeze({
    preconditions: stages.preconditions,
    authorization: stages.authorization,
    idempotencyAndVersionGuard: stages.idempotencyAndVersionGuard,
    commandEnvelope: stages.commandEnvelope,
    executionPolicy: stages.executionPolicy,
  });
}

function freezeResult(result) {
  return Object.freeze(result);
}

function createSafetyFields() {
  return { ...PIPELINE_SAFETY_FIELDS };
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = {
  PIPELINE_CODES,
  PIPELINE_SAFETY_FIELDS,
  PIPELINE_STAGE_KEYS,
  PIPELINE_STAGE_ORDER,
  UNSAFE_STAGE_RESULT_FIELDS,
  runAppointmentReviewControlledActionValidationPipeline,
  runAppointmentReviewControlledActionValidationPipelineWithContracts,
};
