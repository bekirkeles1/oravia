const {
  createHybridAppointmentReviewControlledActionDependencies,
} = require("./appointmentReviewHybridControlledActionDependencies");

const PROVIDER_TYPE =
  "appointment_review_controlled_action_runtime_dependency_provider_v1";
const SCHEMA_VERSION = 1;
const RUNTIME_TYPE = "in_memory_mock_validation_only";
const RUNTIME_SOURCE = "server_runtime_boundary";
const NOT_PERSISTED = "not_persisted";

function createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider(
  options
) {
  const controlledActionDependencies =
    createHybridAppointmentReviewControlledActionDependencies(options);

  return Object.freeze({
    providerType: PROVIDER_TYPE,
    schemaVersion: SCHEMA_VERSION,
    runtimeType: RUNTIME_TYPE,
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
    getControlledActionDependencies() {
      return controlledActionDependencies;
    },
  });
}

module.exports = {
  createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider,
};
