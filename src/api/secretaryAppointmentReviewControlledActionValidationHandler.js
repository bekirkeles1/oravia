const {
  assembleAppointmentReviewTrustedServerContext,
} = require("../secretary/appointmentReviewTrustedServerContextAssemblyContract");
const {
  runAppointmentReviewControlledActionValidationPipeline,
} = require("../secretary/appointmentReviewControlledActionValidationPipelineContract");

const REQUIRED_DEPENDENCIES = Object.freeze([
  Object.freeze({
    name: "resolveVerifiedActorContext",
    missingCode: "missing_verified_actor_resolver",
    failedCode: "verified_actor_context_resolution_failed",
    failedStage: "verified_actor_context",
  }),
  Object.freeze({
    name: "resolveAppointmentReviewContext",
    missingCode: "missing_review_context_resolver",
    failedCode: "appointment_review_context_resolution_failed",
    failedStage: "appointment_review_context",
  }),
  Object.freeze({
    name: "resolveIdempotencyContext",
    missingCode: "missing_idempotency_context_resolver",
    failedCode: "idempotency_context_resolution_failed",
    failedStage: "idempotency_context",
  }),
  Object.freeze({
    name: "resolveExecutionPolicyContext",
    missingCode: "missing_execution_policy_resolver",
    failedCode: "execution_policy_context_resolution_failed",
    failedStage: "execution_policy_context",
  }),
]);

const BODY_ALLOWED_FIELDS = Object.freeze([
  "actionIntent",
  "requestId",
  "idempotencyKey",
  "expectedReviewVersion",
]);

const BODY_TRUSTED_CONTEXT_FIELDS = Object.freeze([
  "reviewId",
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

const HANDLER_CODES = Object.freeze({
  COMPLETED: "controlled_action_validation_handler_completed",
  MATCHING_REPLAY: "controlled_action_validation_handler_matching_replay",
  INVALID_INPUT: "invalid_input",
  METHOD_NOT_ALLOWED: "method_not_allowed",
  MISSING_REVIEW_ID: "missing_review_id",
  INVALID_BODY: "invalid_body",
  CLIENT_TRUSTED_CONTEXT_INJECTION: "client_trusted_context_injection",
  MISSING_DEPENDENCIES: "missing_dependencies",
  MISSING_VERIFIED_ACTOR_RESOLVER: "missing_verified_actor_resolver",
  MISSING_REVIEW_CONTEXT_RESOLVER: "missing_review_context_resolver",
  MISSING_IDEMPOTENCY_CONTEXT_RESOLVER: "missing_idempotency_context_resolver",
  MISSING_EXECUTION_POLICY_RESOLVER: "missing_execution_policy_resolver",
  VERIFIED_ACTOR_CONTEXT_RESOLUTION_FAILED:
    "verified_actor_context_resolution_failed",
  APPOINTMENT_REVIEW_CONTEXT_RESOLUTION_FAILED:
    "appointment_review_context_resolution_failed",
  IDEMPOTENCY_CONTEXT_RESOLUTION_FAILED:
    "idempotency_context_resolution_failed",
  EXECUTION_POLICY_CONTEXT_RESOLUTION_FAILED:
    "execution_policy_context_resolution_failed",
  UNSAFE_DEPENDENCY_RESULT: "unsafe_dependency_result",
  SERVER_CONTEXT_ASSEMBLY_REJECTED: "server_context_assembly_rejected",
  VALIDATION_PIPELINE_REJECTED: "validation_pipeline_rejected",
  UNEXPECTED_HANDLER_RESULT: "unexpected_handler_result",
});

const HANDLER_SAFETY_FIELDS = Object.freeze({
  handlerChecked: true,
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

async function handleAppointmentReviewControlledActionValidation(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectHandler({
      code: HANDLER_CODES.INVALID_INPUT,
      reason:
        "Appointment review controlled action validation handler input must be an object.",
      failedStage: null,
    });
  }

  const unsafeInputField = findUnsafeTrueField(input);

  if (unsafeInputField) {
    return rejectHandler({
      code: HANDLER_CODES.UNEXPECTED_HANDLER_RESULT,
      reason: `Handler input must not claim unsafe ${unsafeInputField}.`,
      failedStage: null,
    });
  }

  const method = normalizeMethod(input.method);

  if (method !== "POST") {
    return rejectHandler({
      code: HANDLER_CODES.METHOD_NOT_ALLOWED,
      reason: "Only POST is supported for validation-only controlled actions.",
      failedStage: null,
    });
  }

  const reviewId = normalizeText(input.reviewId);

  if (!reviewId) {
    return rejectHandler({
      code: HANDLER_CODES.MISSING_REVIEW_ID,
      reason: "Route reviewId is required.",
      failedStage: null,
    });
  }

  const { body } = input;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return rejectHandler({
      code: HANDLER_CODES.INVALID_BODY,
      reason: "Request body must be an object.",
      failedStage: null,
      reviewId,
    });
  }

  const bodyInjectionField = findClientTrustedContextInjection(body);

  if (bodyInjectionField) {
    return rejectHandler({
      code:
        bodyInjectionField === "reviewId"
          ? HANDLER_CODES.INVALID_BODY
          : HANDLER_CODES.CLIENT_TRUSTED_CONTEXT_INJECTION,
      reason: `Request body must not provide trusted context field ${bodyInjectionField}.`,
      failedStage: null,
      reviewId,
    });
  }

  const unsafeBodyField = findUnsafeTrueField(body);

  if (unsafeBodyField) {
    return rejectHandler({
      code: HANDLER_CODES.CLIENT_TRUSTED_CONTEXT_INJECTION,
      reason: `Request body must not claim unsafe ${unsafeBodyField}.`,
      failedStage: null,
      reviewId,
    });
  }

  const invalidBodyField = Object.keys(body).find(
    (fieldName) => !BODY_ALLOWED_FIELDS.includes(fieldName)
  );

  if (invalidBodyField) {
    return rejectHandler({
      code: HANDLER_CODES.INVALID_BODY,
      reason: `Request body field ${invalidBodyField} is not supported.`,
      failedStage: null,
      reviewId,
    });
  }

  const dependenciesError = validateDependencies(input.dependencies);

  if (dependenciesError) {
    return rejectHandler({
      code: dependenciesError.code,
      reason: dependenciesError.reason,
      failedStage: null,
      reviewId,
    });
  }

  const { dependencies } = input;
  const clientRequest = Object.freeze({
    reviewId,
    actionIntent: body.actionIntent,
    requestId: body.requestId,
    idempotencyKey: body.idempotencyKey,
    expectedReviewVersion: body.expectedReviewVersion,
  });

  const verifiedActorContextResult = await resolveDependency({
    dependency: dependencies.resolveVerifiedActorContext,
    stage: REQUIRED_DEPENDENCIES[0],
    input: {
      reviewId,
      actionIntent: body.actionIntent,
      requestId: body.requestId,
    },
  });

  if (!verifiedActorContextResult.accepted) {
    return verifiedActorContextResult.result;
  }

  const reviewContextResult = await resolveDependency({
    dependency: dependencies.resolveAppointmentReviewContext,
    stage: REQUIRED_DEPENDENCIES[1],
    input: { reviewId },
  });

  if (!reviewContextResult.accepted) {
    return reviewContextResult.result;
  }

  const idempotencyContextResult = await resolveDependency({
    dependency: dependencies.resolveIdempotencyContext,
    stage: REQUIRED_DEPENDENCIES[2],
    input: {
      reviewId,
      actionIntent: body.actionIntent,
      requestId: body.requestId,
      idempotencyKey: body.idempotencyKey,
    },
  });

  if (!idempotencyContextResult.accepted) {
    return idempotencyContextResult.result;
  }

  const executionPolicyContextResult = await resolveDependency({
    dependency: dependencies.resolveExecutionPolicyContext,
    stage: REQUIRED_DEPENDENCIES[3],
    input: {
      reviewId,
      actionIntent: body.actionIntent,
    },
  });

  if (!executionPolicyContextResult.accepted) {
    return executionPolicyContextResult.result;
  }

  const assemblyResult = assembleAppointmentReviewTrustedServerContext({
    clientRequest,
    trustedServerContext: {
      contextType: "appointment_review_controlled_action_server_context_v1",
      contextSource: "server_context_boundary",
      verifiedActorContext: verifiedActorContextResult.value,
      reviewContext: reviewContextResult.value,
      idempotencyContext: idempotencyContextResult.value,
      executionPolicyContext: executionPolicyContextResult.value,
    },
  });
  const assemblyIssue = validateStageResult(assemblyResult);

  if (assemblyIssue) {
    return rejectHandler({
      code: assemblyIssue.code,
      reason: assemblyIssue.reason,
      failedStage: "server_context_assembly",
      assemblyResult,
      reviewId,
    });
  }

  if (assemblyResult.accepted !== true) {
    return rejectHandler({
      code: HANDLER_CODES.SERVER_CONTEXT_ASSEMBLY_REJECTED,
      reason: "Server context assembly rejected the validation request.",
      failedStage: "server_context_assembly",
      stageCode: normalizeText(assemblyResult.code),
      assemblyResult,
      reviewId,
    });
  }

  const pipelineResult = runAppointmentReviewControlledActionValidationPipeline(
    assemblyResult.pipelineInput
  );
  const pipelineIssue = validateStageResult(pipelineResult);

  if (pipelineIssue) {
    return rejectHandler({
      code: pipelineIssue.code,
      reason: pipelineIssue.reason,
      failedStage: "validation_pipeline",
      assemblyResult,
      pipelineResult,
      reviewId,
    });
  }

  if (pipelineResult.accepted !== true) {
    return rejectHandler({
      code: HANDLER_CODES.VALIDATION_PIPELINE_REJECTED,
      reason: "Validation pipeline rejected the controlled action request.",
      failedStage: "validation_pipeline",
      stageCode: normalizeText(pipelineResult.code),
      assemblyResult,
      pipelineResult,
      reviewId,
    });
  }

  if (pipelineResult.matchingReplay === true) {
    return Object.freeze({
      accepted: true,
      handlerCompleted: true,
      failedStage: null,
      matchingReplay: true,
      replayExistingResultOnly: true,
      eligibleForExecutorBoundary: false,
      code: HANDLER_CODES.MATCHING_REPLAY,
      reviewId,
      assemblyResult,
      pipelineResult,
      ...createSafetyFields(),
    });
  }

  return Object.freeze({
    accepted: true,
    handlerCompleted: true,
    failedStage: null,
    matchingReplay: false,
    replayExistingResultOnly: false,
    eligibleForExecutorBoundary:
      pipelineResult.eligibleForExecutorBoundary === true,
    code: HANDLER_CODES.COMPLETED,
    reviewId,
    assemblyResult,
    pipelineResult,
    ...createSafetyFields(),
  });
}

function validateDependencies(dependencies) {
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
    return {
      code: HANDLER_CODES.MISSING_DEPENDENCIES,
      reason: "Explicit validation handler dependencies are required.",
    };
  }

  for (const dependency of REQUIRED_DEPENDENCIES) {
    if (typeof dependencies[dependency.name] !== "function") {
      return {
        code: dependency.missingCode,
        reason: `${dependency.name} dependency must be a function.`,
      };
    }
  }

  return null;
}

async function resolveDependency({ dependency, stage, input }) {
  let value;

  try {
    value = await dependency(Object.freeze({ ...input }));
  } catch {
    return {
      accepted: false,
      result: rejectHandler({
        code: stage.failedCode,
        reason: `${stage.failedStage} resolver failed.`,
        failedStage: stage.failedStage,
        reviewId: input.reviewId,
      }),
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      accepted: false,
      result: rejectHandler({
        code: stage.failedCode,
        reason: `${stage.failedStage} resolver returned malformed output.`,
        failedStage: stage.failedStage,
        reviewId: input.reviewId,
      }),
    };
  }

  const unsafeField = findUnsafeTrueField(value);

  if (unsafeField) {
    return {
      accepted: false,
      result: rejectHandler({
        code: HANDLER_CODES.UNSAFE_DEPENDENCY_RESULT,
        reason: `${stage.failedStage} resolver returned unsafe ${unsafeField}.`,
        failedStage: stage.failedStage,
        reviewId: input.reviewId,
      }),
    };
  }

  return {
    accepted: true,
    value,
  };
}

function validateStageResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return {
      code: HANDLER_CODES.UNEXPECTED_HANDLER_RESULT,
      reason: "Controlled action validation stage returned malformed output.",
    };
  }

  if (typeof result.accepted !== "boolean") {
    return {
      code: HANDLER_CODES.UNEXPECTED_HANDLER_RESULT,
      reason: "Controlled action validation stage must include accepted boolean.",
    };
  }

  const unsafeField = findUnsafeTrueField(result);

  if (unsafeField) {
    return {
      code: HANDLER_CODES.UNEXPECTED_HANDLER_RESULT,
      reason: `Controlled action validation stage returned unsafe ${unsafeField}.`,
    };
  }

  if (normalizeText(result.persistence) !== "not_persisted") {
    return {
      code: HANDLER_CODES.UNEXPECTED_HANDLER_RESULT,
      reason: "Controlled action validation stage must remain not_persisted.",
    };
  }

  return null;
}

function rejectHandler({
  code,
  reason,
  failedStage,
  stageCode = "",
  assemblyResult,
  pipelineResult,
  reviewId = "",
}) {
  const result = {
    accepted: false,
    handlerCompleted: false,
    matchingReplay: false,
    replayExistingResultOnly: false,
    eligibleForExecutorBoundary: false,
    failedStage,
    code,
    reason,
    stageCode: stageCode || null,
    ...createSafetyFields(),
  };
  const normalizedReviewId = normalizeText(reviewId);

  if (normalizedReviewId) {
    result.reviewId = normalizedReviewId;
  }

  if (assemblyResult) {
    result.assemblyResult = assemblyResult;
  }

  if (pipelineResult) {
    result.pipelineResult = pipelineResult;
  }

  return Object.freeze(result);
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
    if (BODY_TRUSTED_CONTEXT_FIELDS.includes(fieldName)) {
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

function normalizeMethod(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function createSafetyFields() {
  return { ...HANDLER_SAFETY_FIELDS };
}

module.exports = {
  BODY_ALLOWED_FIELDS,
  BODY_TRUSTED_CONTEXT_FIELDS,
  HANDLER_CODES,
  HANDLER_SAFETY_FIELDS,
  REQUIRED_DEPENDENCIES,
  UNSAFE_EXECUTION_FIELDS,
  handleAppointmentReviewControlledActionValidation,
};
