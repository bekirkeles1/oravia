const {
  createAppointmentReviewRouteRuntimeAdapter,
} = require("./appointmentReviewRouteRuntimeAdapter");

const ACTIVE_RUNTIME_COMPOSITION_ROOT_TYPE =
  "appointment_review_active_route_runtime_composition_root_v1";

const DEFAULT_ROUTE_REVIEW_ID = "review_route_runtime_demo";

function createAppointmentReviewActiveRouteRuntimeCompositionRoot(options = {}) {
  const adapter = createAppointmentReviewRouteRuntimeAdapter({
    resolveControlledActionState:
      options.resolveControlledActionState || resolveRouteControlledActionState,
    initialReviews: Array.isArray(options.initialReviews)
      ? options.initialReviews
      : [createDefaultRouteReview(DEFAULT_ROUTE_REVIEW_ID)],
    calendarProvider: options.calendarProvider,
    calendarProviderName: options.calendarProviderName,
    createCalendarProvider: options.createCalendarProvider,
    outboundMessagingProvider: options.outboundMessagingProvider,
    createOutboundMessagingProvider: options.createOutboundMessagingProvider,
    storageMode: options.storageMode,
    databasePath: options.databasePath,
    clinicId: options.clinicId,
  });

  return Object.freeze({
    compositionRootType: ACTIVE_RUNTIME_COMPOSITION_ROOT_TYPE,
    getRouteRuntimeAdapter() {
      return adapter;
    },
    close() {
      if (typeof adapter.close === "function") {
        adapter.close();
      }
    },
  });
}

let activeRouteRuntimeCompositionRoot = null;

function getActiveAppointmentReviewRouteRuntimeAdapter() {
  if (!activeRouteRuntimeCompositionRoot) {
    activeRouteRuntimeCompositionRoot =
      createAppointmentReviewActiveRouteRuntimeCompositionRoot();
  }

  return activeRouteRuntimeCompositionRoot.getRouteRuntimeAdapter();
}

function createDefaultRouteReview(reviewId) {
  return {
    id: reviewId,
    status: "pending_secretary_review",
    source: "mock",
    selectedSlot: {
      id: `${reviewId}_slot`,
      source: "mock",
      doctorId: "dr-ayse-demir",
      doctorName: "Dr. Ayse Demir",
      treatment: "implant",
      appointmentPurpose: "initial_consultation",
      appointmentPurposeLabel: "Initial consultation",
      startAt: "2026-07-29T10:30:00+03:00",
      endAt: "2026-07-29T11:00:00+03:00",
      durationMinutes: 30,
    },
    treatment: "implant",
    appointmentPurpose: "initial_consultation",
    appointmentPurposeLabel: "Initial consultation",
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
    metadata: {
      controlledActionState: "validation_only_intent_checked",
      conversationKey: "whatsapp:synthetic-contact",
    },
  };
}

function resolveRouteControlledActionState(input) {
  return String(input?.review?.metadata?.controlledActionState || "").trim();
}

module.exports = {
  ACTIVE_RUNTIME_COMPOSITION_ROOT_TYPE,
  DEFAULT_ROUTE_REVIEW_ID,
  createAppointmentReviewActiveRouteRuntimeCompositionRoot,
  createDefaultRouteReview,
  getActiveAppointmentReviewRouteRuntimeAdapter,
};
