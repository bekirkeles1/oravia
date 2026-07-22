const {
  createInMemoryAppointmentReviewQueue,
} = require("./appointmentReviewQueue");
const {
  createInMemoryAppointmentReviewRepository,
} = require("./appointmentReviewRepository");
const {
  createInMemoryAppointmentReviewExecutionIdempotencyStore,
} = require("./appointmentReviewExecutionIdempotencyStore");
const {
  createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider,
} = require("./appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider");
const {
  applyAppointmentReviewDecision,
} = require("../api/secretaryAppointmentReviewDecisionExecutionService");

const RUNTIME_TYPE = "appointment_review_server_runtime_v1";
const SCHEMA_VERSION = 1;
const RUNTIME_MODE = "in_memory_mock_validation_only";
const RUNTIME_SOURCE = "server_composition_root";
const NOT_PERSISTED = "not_persisted";

function createInMemoryMockAppointmentReviewServerRuntime(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw createRuntimeError(
      "invalid_factory_options",
      "Appointment review server runtime options must be an object."
    );
  }

  if (typeof options.resolveControlledActionState !== "function") {
    throw createRuntimeError(
      "missing_controlled_action_state_projection",
      "resolveControlledActionState dependency must be a function."
    );
  }

  const repository = createInMemoryAppointmentReviewRepository({
    initialReviews: Array.isArray(options.initialReviews)
      ? options.initialReviews
      : [],
  });
  const appointmentReviewQueue = createPublicAppointmentReviewQueue(
    createInMemoryAppointmentReviewQueue({ repository })
  );
  const controlledActionRuntimeDependencyProvider =
    createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider({
      repository,
      resolveControlledActionState: options.resolveControlledActionState,
    });
  const executionIdempotencyStore =
    createInMemoryAppointmentReviewExecutionIdempotencyStore();

  return Object.freeze({
    runtimeType: RUNTIME_TYPE,
    schemaVersion: SCHEMA_VERSION,
    runtimeMode: RUNTIME_MODE,
    runtimeSource: RUNTIME_SOURCE,
    mock: true,
    inMemory: true,
    validationOnly: true,
    controlledHandlingOnly: true,
    persistence: NOT_PERSISTED,
    databasePersisted: false,
    executionEnabled: false,
    executorAvailable: false,
    executionAvailable: false,
    getAppointmentReviewQueue() {
      return appointmentReviewQueue;
    },
    getControlledActionRuntimeDependencyProvider() {
      return controlledActionRuntimeDependencyProvider;
    },
    getControlledActionDependencies() {
      return controlledActionRuntimeDependencyProvider.getControlledActionDependencies();
    },
    applyAppointmentReviewDecision(input) {
      return applyAppointmentReviewDecision({
        ...input,
        dependencies:
          controlledActionRuntimeDependencyProvider.getControlledActionDependencies(),
        idempotencyStore: executionIdempotencyStore,
        applyReviewControlledActionStateTransition:
          repository.applyReviewControlledActionStateTransition,
      });
    },
  });
}

function createPublicAppointmentReviewQueue(queue) {
  return Object.freeze({
    addAppointmentReview(appointmentSelectionReview, metadata) {
      return queue.addAppointmentReview(appointmentSelectionReview, metadata);
    },
    listAppointmentReviews() {
      return queue.listAppointmentReviews();
    },
    getAppointmentReviewById(reviewId) {
      return queue.getAppointmentReviewById(reviewId);
    },
  });
}

function createRuntimeError(code, reason) {
  return Object.freeze({
    code,
    reason,
  });
}

module.exports = {
  createInMemoryMockAppointmentReviewServerRuntime,
};
