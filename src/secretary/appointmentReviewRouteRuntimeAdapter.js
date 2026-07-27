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
    storageMode: runtime.storageMode,
    durablePersistence: runtime.durablePersistence,
    databasePersisted: runtime.databasePersisted,
    executionEnabled: runtime.executionEnabled,
    executorAvailable: runtime.executorAvailable,
    executionAvailable: runtime.executionAvailable,
  });

  const adapter = {
    adapterType: ADAPTER_TYPE,
    schemaVersion: SCHEMA_VERSION,
    adapterSource: ADAPTER_SOURCE,
    getRuntimeDescriptor() {
      return runtimeDescriptor;
    },
    listAppointmentReviews() {
      return runtime.getAppointmentReviewQueue().listAppointmentReviews();
    },
    getAppointmentReviewById(reviewId) {
      return runtime
        .getAppointmentReviewQueue()
        .getAppointmentReviewById(reviewId);
    },
    getAppointmentReviewQueue() {
      return runtime.getAppointmentReviewQueue();
    },
    getControlledActionDependencies() {
      return runtime.getControlledActionDependencies();
    },
    applyAppointmentReviewDecision(input) {
      return runtime.applyAppointmentReviewDecision(input);
    },
    createAppointmentFromApprovedReview(input) {
      return runtime.createAppointmentFromApprovedReview(input);
    },
    listCreatedAppointments() {
      return runtime.listCreatedAppointments();
    },
    syncAppointmentToCalendar(input) {
      return runtime.syncAppointmentToCalendar(input);
    },
    dispatchAppointmentConfirmation(input) {
      return runtime.dispatchAppointmentConfirmation(input);
    },
    createAppointmentReschedulePreview(input) {
      return runtime.createAppointmentReschedulePreview(input);
    },
    applyAppointmentReschedule(input) {
      return runtime.applyAppointmentReschedule(input);
    },
    createAppointmentCancellationPreview(input) {
      return runtime.createAppointmentCancellationPreview(input);
    },
    applyAppointmentCancellation(input) {
      return runtime.applyAppointmentCancellation(input);
    },
    listAppointmentLifecycleEvents(input) {
      return runtime.listAppointmentLifecycleEvents(input);
    },
    syncAppointmentChangeToCalendar(input) {
      return runtime.syncAppointmentChangeToCalendar(input);
    },
    dispatchAppointmentChangeNotification(input) {
      return runtime.dispatchAppointmentChangeNotification(input);
    },
  };

  Object.defineProperties(adapter, {
    handleMessagingInbound: {
      enumerable: false,
      value(input) {
        return runtime.handleMessagingInbound(input);
      },
    },
    close: {
      enumerable: false,
      value() {
        return runtime.close();
      },
    },
  });

  return Object.freeze(adapter);
}

module.exports = {
  createAppointmentReviewRouteRuntimeAdapter,
};
