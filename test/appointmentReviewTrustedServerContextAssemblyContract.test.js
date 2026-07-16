const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  validateAppointmentReviewActionPreconditions,
} = require("../src/secretary/appointmentReviewActionPreconditionsContract");
const {
  authorizeAppointmentReviewVerifiedActor,
} = require("../src/secretary/appointmentReviewVerifiedActorAuthorizationContract");
const {
  validateAppointmentReviewControlledActionGuard,
} = require("../src/secretary/appointmentReviewControlledActionGuardContract");
const {
  evaluateAppointmentReviewControlledActionExecutionPolicy,
} = require("../src/secretary/appointmentReviewControlledActionExecutionPolicyContract");
const {
  runAppointmentReviewControlledActionValidationPipeline,
} = require("../src/secretary/appointmentReviewControlledActionValidationPipelineContract");
const {
  ASSEMBLY_CODES,
  CLIENT_ALLOWED_FIELDS,
  CLIENT_TRUSTED_CONTEXT_FIELDS,
  SAFETY_FIELDS,
  UNSAFE_EXECUTION_FIELDS,
  assembleAppointmentReviewTrustedServerContext,
} = require("../src/secretary/appointmentReviewTrustedServerContextAssemblyContract");

const CONTRACT_SOURCE_PATH =
  "src/secretary/appointmentReviewTrustedServerContextAssemblyContract.js";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
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

function createClientRequest(overrides = {}) {
  return {
    reviewId: "review_context_demo",
    actionIntent: "approve_intent",
    requestId: "request_context_demo",
    idempotencyKey: "review_context_demo:request_context_demo:approve",
    expectedReviewVersion: 7,
    ...overrides,
  };
}

function createTrustedServerContext(overrides = {}) {
  const verifiedActorContext = Object.prototype.hasOwnProperty.call(
    overrides,
    "verifiedActorContext"
  )
    ? hasPlainObject(overrides.verifiedActorContext)
      ? {
          contextType: "verified_actor_context_v1",
          verificationSource: "server_auth_boundary",
          actorId: "secretary_context",
          role: "secretary",
          authenticationVerified: true,
          authorizationVerified: true,
          permissions: ["appointment_review:approve"],
          ...overrides.verifiedActorContext,
        }
      : overrides.verifiedActorContext
    : {
        contextType: "verified_actor_context_v1",
        verificationSource: "server_auth_boundary",
        actorId: "secretary_context",
        role: "secretary",
        authenticationVerified: true,
        authorizationVerified: true,
        permissions: ["appointment_review:approve"],
      };
  const reviewContext = Object.prototype.hasOwnProperty.call(
    overrides,
    "reviewContext"
  )
    ? hasPlainObject(overrides.reviewContext)
      ? {
          contextType: "appointment_review_snapshot_context_v1",
          contextSource: "server_review_boundary",
          reviewId: "review_context_demo",
          currentState: "validation_only_intent_checked",
          observedReviewVersion: 7,
          ...overrides.reviewContext,
        }
      : overrides.reviewContext
    : {
        contextType: "appointment_review_snapshot_context_v1",
        contextSource: "server_review_boundary",
        reviewId: "review_context_demo",
        currentState: "validation_only_intent_checked",
        observedReviewVersion: 7,
      };
  const idempotencyContext = Object.prototype.hasOwnProperty.call(
    overrides,
    "idempotencyContext"
  )
    ? hasPlainObject(overrides.idempotencyContext)
      ? {
          contextType: "appointment_review_idempotency_context_v1",
          contextSource: "server_idempotency_boundary",
          priorIdempotencyObservation: null,
          ...overrides.idempotencyContext,
        }
      : overrides.idempotencyContext
    : {
        contextType: "appointment_review_idempotency_context_v1",
        contextSource: "server_idempotency_boundary",
        priorIdempotencyObservation: null,
      };
  const executionPolicyContext = Object.prototype.hasOwnProperty.call(
    overrides,
    "executionPolicyContext"
  )
    ? hasPlainObject(overrides.executionPolicyContext)
      ? {
          policyType: "appointment_review_execution_policy_v1",
          policyVersion: 1,
          policySource: "server_policy_boundary",
          policyMode: "controlled_validation_only",
          allowedActionIntents: ["approve_intent", "reject_intent"],
          allowedCurrentStates: ["validation_only_intent_checked"],
          requiredEnvelopeType: "appointment_review_controlled_action_command_v1",
          requiredSchemaVersion: 1,
          executionEnabled: false,
          ...overrides.executionPolicyContext,
        }
      : overrides.executionPolicyContext
    : {
        policyType: "appointment_review_execution_policy_v1",
        policyVersion: 1,
        policySource: "server_policy_boundary",
        policyMode: "controlled_validation_only",
        allowedActionIntents: ["approve_intent", "reject_intent"],
        allowedCurrentStates: ["validation_only_intent_checked"],
        requiredEnvelopeType: "appointment_review_controlled_action_command_v1",
        requiredSchemaVersion: 1,
        executionEnabled: false,
      };

  return {
    contextType: "appointment_review_controlled_action_server_context_v1",
    contextSource: "server_context_boundary",
    verifiedActorContext,
    reviewContext,
    idempotencyContext,
    executionPolicyContext,
    ...withoutNestedContext(overrides),
  };
}

function hasPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function withoutNestedContext(overrides) {
  const {
    verifiedActorContext,
    reviewContext,
    idempotencyContext,
    executionPolicyContext,
    ...rest
  } = overrides;
  return rest;
}

function assemble({
  clientRequest = createClientRequest(),
  trustedServerContext = createTrustedServerContext(),
} = {}) {
  return assembleAppointmentReviewTrustedServerContext({
    clientRequest,
    trustedServerContext,
  });
}

function assertSafetyFields(result) {
  for (const [field, value] of Object.entries(EXPECTED_SAFETY_FIELDS)) {
    assert.equal(result[field], value);
  }
}

function assertAccepted(result) {
  assert.equal(result.accepted, true);
  assert.equal(result.trustedContextAccepted, true);
  assert.equal(result.pipelineInputConstructed, true);
  assert.equal(result.code, ASSEMBLY_CODES.ASSEMBLED);
  assert.notEqual(result.pipelineInput, null);
  assertSafetyFields(result);
}

function assertRejected(result, code, trustedContextAccepted = false) {
  assert.equal(result.accepted, false);
  assert.equal(result.trustedContextAccepted, trustedContextAccepted);
  assert.equal(result.pipelineInputConstructed, false);
  assert.equal(result.pipelineInput, null);
  assert.equal(result.code, code);
  assertSafetyFields(result);
}

test("trusted server context assembly constructs approve pipeline input", () => {
  const result = assemble();

  assertAccepted(result);
  assert.deepEqual(result.pipelineInput.preconditionsInput, {
    reviewId: "review_context_demo",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: "secretary_context",
      role: "secretary",
    },
    requestId: "request_context_demo",
  });
  assert.equal(result.pipelineInput.idempotencyKey, "review_context_demo:request_context_demo:approve");
  assert.equal(result.pipelineInput.expectedReviewVersion, 7);
});

test("trusted server context assembly constructs reject pipeline input", () => {
  const result = assemble({
    clientRequest: createClientRequest({
      actionIntent: "reject_intent",
      idempotencyKey: "review_context_demo:request_context_demo:reject",
    }),
    trustedServerContext: createTrustedServerContext({
      verifiedActorContext: {
        permissions: ["appointment_review:reject"],
      },
    }),
  });

  assertAccepted(result);
  assert.equal(result.pipelineInput.preconditionsInput.actionIntent, "reject_intent");
  assert.deepEqual(result.pipelineInput.verifiedActorContext.permissions, [
    "appointment_review:reject",
  ]);
});

test("currentState is derived only from trusted review context", () => {
  const result = assemble({
    trustedServerContext: createTrustedServerContext({
      reviewContext: {
        currentState: "pending_secretary_review",
      },
    }),
  });

  assertAccepted(result);
  assert.equal(result.pipelineInput.preconditionsInput.currentState, "pending_secretary_review");
});

test("actor identity is derived only from verified actor context", () => {
  const result = assemble({
    trustedServerContext: createTrustedServerContext({
      verifiedActorContext: {
        actorId: "trusted_secretary_only",
        role: "trusted_role",
      },
    }),
  });

  assertAccepted(result);
  assert.equal(result.pipelineInput.preconditionsInput.actor.actorId, "trusted_secretary_only");
  assert.equal(result.pipelineInput.preconditionsInput.actor.role, "trusted_role");
});

test("observedReviewVersion is derived only from review context", () => {
  const result = assemble({
    trustedServerContext: createTrustedServerContext({
      reviewContext: {
        observedReviewVersion: 11,
      },
    }),
  });

  assertAccepted(result);
  assert.equal(result.pipelineInput.observedReviewVersion, 11);
});

test("prior observation is derived only from idempotency context", () => {
  const priorIdempotencyObservation = {
    idempotencyKey: "review_context_demo:request_context_demo:approve",
    requestFingerprint: "trusted_fingerprint",
  };
  const result = assemble({
    trustedServerContext: createTrustedServerContext({
      idempotencyContext: {
        priorIdempotencyObservation,
      },
    }),
  });

  assertAccepted(result);
  assert.deepEqual(result.pipelineInput.priorIdempotencyObservation, priorIdempotencyObservation);
});

test("execution policy comes only from trusted server context", () => {
  const executionPolicyContext = {
    ...createTrustedServerContext().executionPolicyContext,
    policyVersion: 1,
  };
  const result = assemble({
    trustedServerContext: createTrustedServerContext({
      executionPolicyContext,
    }),
  });

  assertAccepted(result);
  assert.deepEqual(result.pipelineInput.executionPolicyContext, executionPolicyContext);
});

test("client currentState injection is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ currentState: "validation_only_intent_checked" }) }),
    "client_trusted_context_injection",
    true
  );
});

test("client actor injection is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ actor: { actorId: "x" } }) }),
    "client_trusted_context_injection",
    true
  );
});

test("client actorId injection is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ actorId: "secretary_context" }) }),
    "client_trusted_context_injection",
    true
  );
});

test("client role injection is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ role: "secretary" }) }),
    "client_trusted_context_injection",
    true
  );
});

test("client permissions injection is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ permissions: ["appointment_review:approve"] }) }),
    "client_trusted_context_injection",
    true
  );
});

test("client verifiedActorContext injection is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ verifiedActorContext: createTrustedServerContext().verifiedActorContext }) }),
    "client_trusted_context_injection",
    true
  );
});

test("client observedReviewVersion injection is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ observedReviewVersion: 7 }) }),
    "client_trusted_context_injection",
    true
  );
});

test("client priorIdempotencyObservation injection is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ priorIdempotencyObservation: null }) }),
    "client_trusted_context_injection",
    true
  );
});

test("client executionPolicyContext injection is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ executionPolicyContext: createTrustedServerContext().executionPolicyContext }) }),
    "client_trusted_context_injection",
    true
  );
});

test("client policy field injection is rejected", () => {
  for (const fieldName of ["policyType", "policyVersion", "policySource", "policyMode"]) {
    assertRejected(
      assemble({ clientRequest: createClientRequest({ [fieldName]: "trusted_value" }) }),
      "client_trusted_context_injection",
      true
    );
  }
});

test("nested client trusted context injection is rejected", () => {
  assertRejected(
    assemble({
      clientRequest: createClientRequest({
        requestId: {
          value: "request_context_demo",
          actorId: "secretary_context",
        },
      }),
    }),
    "client_trusted_context_injection",
    true
  );
});

test("missing client request is rejected", () => {
  assertRejected(
    assembleAppointmentReviewTrustedServerContext({
      trustedServerContext: createTrustedServerContext(),
    }),
    "missing_client_request",
    true
  );
});

test("missing reviewId is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ reviewId: "" }) }),
    "missing_review_id",
    true
  );
});

test("missing actionIntent is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ actionIntent: "" }) }),
    "missing_action_intent",
    true
  );
});

test("missing requestId is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ requestId: " " }) }),
    "missing_request_id",
    true
  );
});

test("missing idempotencyKey is rejected", () => {
  assertRejected(
    assemble({ clientRequest: createClientRequest({ idempotencyKey: "" }) }),
    "missing_idempotency_key",
    true
  );
});

test("invalid expectedReviewVersion is rejected", () => {
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "7"]) {
    assertRejected(
      assemble({ clientRequest: createClientRequest({ expectedReviewVersion: value }) }),
      "invalid_expected_review_version",
      true
    );
  }
});

test("missing trusted server context is rejected", () => {
  assertRejected(
    assembleAppointmentReviewTrustedServerContext({
      clientRequest: createClientRequest(),
    }),
    "missing_trusted_server_context",
    false
  );
});

test("wrong server context type is rejected", () => {
  assertRejected(
    assemble({
      trustedServerContext: createTrustedServerContext({ contextType: "client_context" }),
    }),
    "invalid_server_context_type"
  );
});

test("wrong server context source is rejected", () => {
  assertRejected(
    assemble({
      trustedServerContext: createTrustedServerContext({ contextSource: "client_body" }),
    }),
    "unsupported_server_context_source"
  );
});

test("invalid verified actor context is rejected", () => {
  assertRejected(
    assemble({
      trustedServerContext: createTrustedServerContext({
        verifiedActorContext: {
          actorId: "",
        },
      }),
    }),
    "invalid_verified_actor_context"
  );
});

test("authenticationVerified false is rejected", () => {
  assertRejected(
    assemble({
      trustedServerContext: createTrustedServerContext({
        verifiedActorContext: {
          authenticationVerified: false,
        },
      }),
    }),
    "authentication_not_verified"
  );
});

test("authorizationVerified false is rejected", () => {
  assertRejected(
    assemble({
      trustedServerContext: createTrustedServerContext({
        verifiedActorContext: {
          authorizationVerified: false,
        },
      }),
    }),
    "authorization_not_verified"
  );
});

test("invalid review context is rejected", () => {
  assertRejected(
    assemble({
      trustedServerContext: createTrustedServerContext({
        reviewContext: {
          contextType: "client_review_context",
        },
      }),
    }),
    "invalid_review_context"
  );
});

test("review id mismatch is rejected", () => {
  assertRejected(
    assemble({
      trustedServerContext: createTrustedServerContext({
        reviewContext: {
          reviewId: "other_review",
        },
      }),
    }),
    "review_id_mismatch"
  );
});

test("invalid review state is rejected", () => {
  assertRejected(
    assemble({
      trustedServerContext: createTrustedServerContext({
        reviewContext: {
          currentState: "ready_for_controlled_approval",
        },
      }),
    }),
    "invalid_review_state"
  );
});

test("invalid observed review version is rejected", () => {
  assertRejected(
    assemble({
      trustedServerContext: createTrustedServerContext({
        reviewContext: {
          observedReviewVersion: 0,
        },
      }),
    }),
    "invalid_observed_review_version"
  );
});

test("invalid idempotency context is rejected", () => {
  assertRejected(
    assemble({
      trustedServerContext: createTrustedServerContext({
        idempotencyContext: {
          contextSource: "client_body",
        },
      }),
    }),
    "invalid_idempotency_context"
  );
});

test("missing execution policy context is rejected", () => {
  assertRejected(
    assemble({
      trustedServerContext: createTrustedServerContext({
        executionPolicyContext: null,
      }),
    }),
    "invalid_execution_policy_context"
  );
});

test("executionEnabled true is rejected", () => {
  assertRejected(
    assemble({
      trustedServerContext: createTrustedServerContext({
        executionPolicyContext: {
          executionEnabled: true,
        },
      }),
    }),
    "execution_must_remain_disabled"
  );
});

test("unsafe true side-effect fields are rejected", () => {
  for (const fieldName of UNSAFE_EXECUTION_FIELDS.filter(
    (field) => field !== "executionEnabled"
  )) {
    assertRejected(
      assemble({
        trustedServerContext: createTrustedServerContext({
          reviewContext: {
            [fieldName]: true,
          },
        }),
      }),
      "unsafe_execution_flags"
    );
  }
});

test("successful result preserves all non-execution safety fields", () => {
  assertSafetyFields(assemble());
});

test("rejected result preserves all non-execution safety fields", () => {
  assertSafetyFields(assemble({ clientRequest: createClientRequest({ reviewId: "" }) }));
});

test("assembled top-level pipeline input is frozen", () => {
  assert.equal(Object.isFrozen(assemble().pipelineInput), true);
});

test("nested preconditions input is frozen", () => {
  assert.equal(Object.isFrozen(assemble().pipelineInput.preconditionsInput), true);
});

test("nested actor object is frozen", () => {
  assert.equal(Object.isFrozen(assemble().pipelineInput.preconditionsInput.actor), true);
});

test("verified actor context is frozen", () => {
  assert.equal(Object.isFrozen(assemble().pipelineInput.verifiedActorContext), true);
});

test("permissions array is frozen", () => {
  assert.equal(
    Object.isFrozen(assemble().pipelineInput.verifiedActorContext.permissions),
    true
  );
});

test("execution policy context is frozen", () => {
  assert.equal(Object.isFrozen(assemble().pipelineInput.executionPolicyContext), true);
});

test("input objects are not mutated", () => {
  const input = {
    clientRequest: createClientRequest(),
    trustedServerContext: createTrustedServerContext(),
  };
  const before = JSON.stringify(input);

  assembleAppointmentReviewTrustedServerContext(input);

  assert.equal(JSON.stringify(input), before);
});

test("repeated equivalent calls return deeply equivalent results", () => {
  const input = {
    clientRequest: createClientRequest(),
    trustedServerContext: createTrustedServerContext(),
  };
  const first = assembleAppointmentReviewTrustedServerContext(input);
  const second = assembleAppointmentReviewTrustedServerContext(input);

  assert.deepEqual(second, first);
});

test("no pipeline execution occurs in the assembly contract", () => {
  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /runAppointmentReviewControlledActionValidationPipeline/);
});

test("no authentication provider is called", () => {
  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /authProvider|authorizationProvider|authenticateActor/i);
});

test("assembly source has no queue booking calendar database environment filesystem or network access", () => {
  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, "utf8");
  const forbidden = [
    "create" + "Appointment",
    "create" + "CalendarEvent",
    "get" + "CalendarProvider",
    "manual" + "AppointmentCalendarSync",
    "google" + "apis",
    "pri" + "sma",
    "supa" + "base",
    "re" + "dis",
    "fe" + "tch",
    "node:fs",
    "fs",
    "filesystem",
    "cookies",
    "headers",
    "session",
    "appointment" + "ReviewQueue",
    "add" + "AppointmentReview",
    "list" + "AppointmentReviews",
    "get" + "AppointmentReviewById",
    "update" + "AppointmentReviewStatus",
    "command" + "Bus",
    "event" + "Bus",
    "job" + "Queue",
    "dispatcher",
    "process" + ".env",
    "Date" + ".now",
    "Math" + ".random",
    "random" + "UUID",
    "crypto",
  ];

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }

  assert.doesNotMatch(source, /require\([^)]*executor|executor\(|new Executor|Executor\(/i);
});

test("assembly source has no route or UI imports", () => {
  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, "utf8");

  assert.doesNotMatch(source, /route\.js/i);
  assert.doesNotMatch(source, /components\//i);
  assert.doesNotMatch(source, /workspace/i);
});

test("exported constants are immutable", () => {
  assert.equal(Object.isFrozen(ASSEMBLY_CODES), true);
  assert.equal(Object.isFrozen(CLIENT_ALLOWED_FIELDS), true);
  assert.equal(Object.isFrozen(CLIENT_TRUSTED_CONTEXT_FIELDS), true);
  assert.equal(Object.isFrozen(SAFETY_FIELDS), true);
  assert.equal(Object.isFrozen(UNSAFE_EXECUTION_FIELDS), true);
});

test("existing Sprint 12H pipeline behavior remains unchanged", () => {
  const assemblyResult = assemble();
  const result = runAppointmentReviewControlledActionValidationPipeline(
    assemblyResult.pipelineInput
  );

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_validation_pipeline_completed");
  assert.equal(result.bookingCreated, false);
});

test("existing Sprint 12G policy behavior remains unchanged", () => {
  const assemblyResult = assemble();
  const pipelineResult = runAppointmentReviewControlledActionValidationPipeline(
    assemblyResult.pipelineInput
  );
  const result = evaluateAppointmentReviewControlledActionExecutionPolicy({
    commandEnvelopeResult: pipelineResult.commandEnvelopeResult,
    executionPolicyContext: assemblyResult.pipelineInput.executionPolicyContext,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_execution_policy_matched");
  assert.equal(result.calendarChecked, false);
});

test("existing Sprint 12E guard behavior remains unchanged", () => {
  const preconditionsResult = validateAppointmentReviewActionPreconditions(
    assemble().pipelineInput.preconditionsInput
  );
  const authorizationResult = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult,
    verifiedActorContext: assemble().pipelineInput.verifiedActorContext,
  });
  const result = validateAppointmentReviewControlledActionGuard({
    authorizationResult,
    idempotencyKey: "review_context_demo:request_context_demo:approve",
    expectedReviewVersion: 7,
    observedReviewVersion: 7,
    priorIdempotencyObservation: null,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_action_guard_passed");
  assert.equal(result.actionPerformed, false);
});

test("existing Sprint 12D authorization behavior remains unchanged", () => {
  const assemblyResult = assemble();
  const result = authorizeAppointmentReviewVerifiedActor({
    preconditionsResult: validateAppointmentReviewActionPreconditions(
      assemblyResult.pipelineInput.preconditionsInput
    ),
    verifiedActorContext: assemblyResult.pipelineInput.verifiedActorContext,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "controlled_handling_authorized");
  assert.equal(result.databasePersisted, false);
});
