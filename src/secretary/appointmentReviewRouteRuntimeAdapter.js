const {
  createInMemoryMockAppointmentReviewServerRuntime,
} = require("./appointmentReviewInMemoryMockServerRuntime");

const ADAPTER_TYPE = "appointment_review_route_runtime_adapter_v1";
const SCHEMA_VERSION = 1;
const ADAPTER_SOURCE = "route_runtime_adapter_boundary";

function createAppointmentReviewRouteRuntimeAdapter(options) {
  const runtime = createInMemoryMockAppointmentReviewServerRuntime(options);
  const runtimeDescriptor = Object.freeze({
    adapterType: ADAPTER_TYPE,
    schemaVersion: SCHEMA_VERSION,
    adapterSource: ADAPTER_SOURCE,
    runtimeType: runtime.runtimeType,
    runtimeMode: runtime.runtimeMode,
    runtimeSource: runtime.runtimeSource,
    mock: runtime.mock,
    inMemory: runtime.inMemory,
    validationOnly: runtime.validationOnly,
    controlledHandlingOnly: runtime.controlledHandlingOnly,
    persistence: runtime.persistence,
    databasePersisted: runtime.databasePersisted,
    executionEnabled: runtime.executionEnabled,
    executorAvailable: runtime.executorAvailable,
    executionAvailable: runtime.executionAvailable,
  });

  return Object.freeze({
    adapterType: ADAPTER_TYPE,
    schemaVersion: SCHEMA_VERSION,
    adapterSource: ADAPTER_SOURCE,
    getRuntimeDescriptor() {
      return runtimeDescriptor;
    },
    listAppointmentReviews() {
      return runtime.getAppointmentReviewQueue().listAppointmentReviews();
    },
    getAppointmentReviewQueue() {
      return runtime.getAppointmentReviewQueue();
    },
    getControlledActionDependencies() {
      return runtime.getControlledActionDependencies();
    },
  });
}

module.exports = {
  createAppointmentReviewRouteRuntimeAdapter,
};
