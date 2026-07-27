"use client";

import { useEffect, useRef, useState } from "react";
import {
  GUIDED_SESSION_FILTERS,
  clearAppointmentReviewGuidedSessionItem,
  initializeAppointmentReviewGuidedSession,
  getEmptyAppointmentReviewGuidedSession,
  filterAppointmentReviewsByGuidedSession,
  findNextUnreviewedAppointmentReviewId,
  getAppointmentReviewGuidedSessionItem,
  markAppointmentReviewGuidedSessionItem,
  reconcileAppointmentReviewGuidedSession
} from "../../src/secretary/appointmentReviewGuidedSession";
import {
  FOLLOW_UP_CATEGORY_FILTER_ALL,
  buildAppointmentReviewFollowUpFocusBoard,
  findNextUnreviewedAppointmentReviewInFocus
} from "../../src/secretary/appointmentReviewFollowUpFocusBoard";
import {
  clearResolutionChecklistSession,
  createResolutionChecklistSession,
  toggleResolutionChecklistItem
} from "../../src/secretary/appointmentReviewResolutionChecklistSession";

const ACTION_INTENT_DRY_RUN = {
  validationOnly: true,
  actionPerformed: false,
  bookingCreated: false,
  calendarChecked: false,
  databasePersisted: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  requiresSecretaryConfirmation: true,
  allowedActionIntents: [
    "approve_intent",
    "reject_intent",
    "needs_clinic_review",
    "ask_patient_clarification"
  ]
};

const STATE_TRANSITION_DRY_RUN_EVENTS = [
  "check_validation_only_intent",
  "require_clinic_review",
  "reject_action_intent"
];

const INITIAL_STATE_TRANSITION_DRY_RUN = {
  dryRun: true,
  validationOnly: true,
  executionAvailable: false,
  actionPerformed: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
  requiresSecretaryConfirmation: true
};

const INITIAL_PREVIEW_CURRENT_STATE = "pending_secretary_review";
const INITIAL_PREVIEW_EVENT = "check_validation_only_intent";
const PRECONDITIONS_ACTION_INTENTS = ["approve_intent", "reject_intent"];
const INITIAL_PRECONDITIONS_CURRENT_STATE = "validation_only_intent_checked";
const INITIAL_PRECONDITIONS_ACTOR_ID = "secretary-preview";
const INITIAL_PRECONDITIONS_ACTOR_ROLE = "secretary";
const INITIAL_PRECONDITIONS_REQUEST_ID = "preconditions-preview";
const CONTROLLED_ACTION_VALIDATION_INTENTS = ["approve_intent", "reject_intent"];
const INITIAL_CONTROLLED_ACTION_VALIDATION_REQUEST_ID =
  "controlled-action-preview";
const INITIAL_CONTROLLED_ACTION_VALIDATION_IDEMPOTENCY_KEY =
  "controlled-action-preview-key";
const INITIAL_CONTROLLED_ACTION_VALIDATION_EXPECTED_REVIEW_VERSION = 1;
const VALIDATION_RECEIPT_ACTION_INTENTS = ["approve_intent", "reject_intent"];
const INITIAL_VALIDATION_RECEIPT_REQUEST_ID = "validation-receipt-preview";
const INITIAL_VALIDATION_RECEIPT_IDEMPOTENCY_KEY =
  "validation-receipt-preview-key";
const INITIAL_VALIDATION_RECEIPT_EXPECTED_REVIEW_VERSION = 1;

const INITIAL_PRECONDITIONS_DRY_RUN = {
  dryRun: true,
  validationOnly: true,
  preconditionsChecked: true,
  controlledHandlingOnly: true,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted"
};

const INITIAL_CONTROLLED_ACTION_VALIDATION_PREVIEW = {
  mock: true,
  dryRun: true,
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
  persistence: "not_persisted"
};

const INITIAL_VALIDATION_RECEIPT_PREVIEW = {
  mock: true,
  dryRun: true,
  validationOnly: true,
  controlledHandlingOnly: true,
  executionEnabled: false,
  executorAvailable: false,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  commandDispatched: false,
  commandPersisted: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted"
};

const CONTROLLED_ACTION_VALIDATION_STAGE_LABELS = [
  ["preconditions", "Preconditions"],
  ["authorization", "Authorization"],
  ["idempotencyAndVersionGuard", "Idempotency and Version Guard"],
  ["commandEnvelope", "Command Envelope"],
  ["executionPolicy", "Execution Policy"]
];

const VALIDATION_RECEIPT_STAGE_LABELS = [
  ["preconditions", "Preconditions"],
  ["authorization", "Authorization"],
  ["idempotencyAndVersionGuard", "Idempotency and Version Guard"],
  ["commandEnvelope", "Command Envelope"],
  ["executionPolicy", "Execution Policy"]
];

const VALIDATION_RECEIPT_CORRELATION_FIELDS = [
  "actionIntent",
  "actorId",
  "actorRole",
  "requestId",
  "idempotencyKey",
  "expectedReviewVersion",
  "observedReviewVersion",
  "requestFingerprint",
  "requiredPermission"
];

const DECISION_PREVIEW_ACTIONS = ["approve", "reject"];
const DECISION_EXECUTION_CONFIRMATION = "apply_in_memory";
const APPOINTMENT_CREATION_CONFIRMATION = "create_in_memory_appointment";
const CALENDAR_SYNC_CONFIRMATION = "sync_configured_calendar";
const APPOINTMENT_CONFIRMATION_DISPATCH_CONFIRMATION =
  "send_mock_appointment_confirmation";
const RESCHEDULE_CONFIRMATION = "apply_appointment_reschedule";
const CANCELLATION_CONFIRMATION = "cancel_local_appointment";
const CALENDAR_RESCHEDULE_CONFIRMATION = "sync_rescheduled_calendar";
const CALENDAR_CANCELLATION_CONFIRMATION = "sync_cancelled_calendar";
const RESCHEDULE_NOTIFICATION_CONFIRMATION = "send_reschedule_notification";
const CANCELLATION_NOTIFICATION_CONFIRMATION =
  "send_cancellation_notification";

const INITIAL_DECISION_PREVIEW = {
  mock: true,
  dryRun: true,
  decisionPreview: true,
  validationOnly: true,
  controlledHandlingOnly: true,
  executionEnabled: false,
  executorAvailable: false,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  commandDispatched: false,
  commandPersisted: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
  reviewMutated: false,
  reviewStateChanged: false,
  repositoryVersionChanged: false
};

const INITIAL_DECISION_EXECUTION = {
  mock: true,
  dryRun: false,
  decisionExecution: true,
  validationOnly: false,
  controlledHandlingOnly: true,
  executionMode: "in_memory_demo",
  storage: "in_memory",
  durablePersistence: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  calendarWritten: false,
  messageSent: false,
  emailSent: false,
  whatsappSent: false,
  databasePersisted: false,
  externalCallPerformed: false,
  reviewStateChanged: false,
  repositoryVersionChanged: false
};

const INITIAL_APPOINTMENT_CREATION = {
  appointmentCreation: true,
  storage: "in_memory",
  persistence: "not_persisted",
  durablePersistence: false,
  calendarWritten: false,
  calendarEventCreated: false,
  messageSent: false,
  emailSent: false,
  whatsappSent: false,
  databasePersisted: false,
  externalCallPerformed: false,
  appointmentCreated: false,
  reviewVersionChanged: false,
  appointmentRepositoryVersionChanged: false
};

const INITIAL_CALENDAR_SYNC = {
  calendarSync: true,
  storage: "in_memory",
  appointmentPersistence: "not_persisted",
  durableAppointmentPersistence: false,
  appointmentCalendarLinkRecorded: false,
  calendarWritten: false,
  externalEventCreated: false,
  messageSent: false,
  emailSent: false,
  whatsappSent: false,
  databasePersisted: false,
  appointmentVersionChanged: false,
  appointmentRepositoryVersionChanged: false
};

const INITIAL_CONFIRMATION_DISPATCH = {
  confirmationDispatch: true,
  storage: "in_memory",
  appointmentPersistence: "not_persisted",
  durableAppointmentPersistence: false,
  confirmationMessageLinkRecorded: false,
  providerDispatchAccepted: false,
  realPatientDelivery: false,
  messageSent: false,
  whatsappSent: false,
  emailSent: false,
  smsSent: false,
  calendarWritten: false,
  calendarEventCreated: false,
  databasePersisted: false,
  appointmentVersionChanged: false,
  appointmentRepositoryVersionChanged: false
};

const INITIAL_DECISION_COMPARISON = {
  mock: true,
  dryRun: true,
  decisionComparison: true,
  validationOnly: true,
  controlledHandlingOnly: true,
  executionEnabled: false,
  executorAvailable: false,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  commandDispatched: false,
  commandPersisted: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
  reviewMutated: false,
  reviewStateChanged: false,
  repositoryVersionChanged: false
};

const INITIAL_RESOLUTION_GUIDANCE_PREVIEW = {
  mock: true,
  dryRun: true,
  resolutionGuidancePreview: true,
  validationOnly: true,
  controlledHandlingOnly: true,
  executionEnabled: false,
  executorAvailable: false,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  commandDispatched: false,
  commandPersisted: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
  reviewMutated: false,
  reviewStateChanged: false,
  repositoryVersionChanged: false,
  guidancePersisted: false,
  summaryPersisted: false,
  messageSent: false,
  taskAssigned: false
};

const QUEUE_READINESS_FILTERS = [
  ["all", "All"],
  ["both_paths_available", "Both paths available"],
  ["approve_path_only", "Approve path only"],
  ["reject_path_only", "Reject path only"],
  ["both_paths_blocked", "Both paths blocked"]
];

const GUIDED_SESSION_FILTER_OPTIONS = [
  [GUIDED_SESSION_FILTERS.ALL, "All session reviews"],
  [GUIDED_SESSION_FILTERS.UNREVIEWED, "Unreviewed"],
  [GUIDED_SESSION_FILTERS.REVIEWED, "Reviewed locally"],
  [GUIDED_SESSION_FILTERS.VERSION_CHANGED, "Version reset"]
];

const FOLLOW_UP_BOARD_SESSION_FILTER_OPTIONS = [
  [GUIDED_SESSION_FILTERS.ALL, "All focused reviews"],
  [GUIDED_SESSION_FILTERS.UNREVIEWED, "Unreviewed focused reviews"],
  [GUIDED_SESSION_FILTERS.REVIEWED, "Reviewed locally in focus"],
  [GUIDED_SESSION_FILTERS.VERSION_CHANGED, "Version reset in focus"]
];

const QUEUE_READINESS_LABELS = {
  both_paths_available: "Both paths available",
  approve_path_only: "Approve path only",
  reject_path_only: "Reject path only",
  both_paths_blocked: "Both paths blocked"
};

const INITIAL_QUEUE_READINESS_PREVIEW = {
  mock: true,
  dryRun: true,
  queueReadinessPreview: true,
  validationOnly: true,
  controlledHandlingOnly: true,
  executionEnabled: false,
  executorAvailable: false,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  commandDispatched: false,
  commandPersisted: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
  reviewMutated: false,
  reviewStateChanged: false,
  repositoryVersionChanged: false,
  queueMutated: false,
  queueCountChanged: false,
  summary: {
    totalReviewsScanned: 0,
    bothPathsAvailable: 0,
    approvePathOnly: 0,
    rejectPathOnly: 0,
    bothPathsBlocked: 0
  },
  items: []
};

const INITIAL_SHIFT_HANDOFF_PREVIEW = {
  mock: true,
  dryRun: true,
  shiftHandoffPreview: true,
  validationOnly: true,
  controlledHandlingOnly: true,
  executionEnabled: false,
  executorAvailable: false,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  commandDispatched: false,
  commandPersisted: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
  reviewMutated: false,
  reviewStateChanged: false,
  repositoryVersionChanged: false,
  queueMutated: false,
  queueCountChanged: false,
  handoffPersisted: false,
  handoffSent: false,
  summary: {
    totalReviews: 0,
    bothPathsAvailable: 0,
    approvePathOnly: 0,
    rejectPathOnly: 0,
    bothPathsBlocked: 0,
    requiresFollowUp: 0,
    noCurrentValidationBlocker: 0
  },
  items: [],
  plainTextBrief: ""
};

export default function AppointmentReviewsWorkspace() {
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState({
    source: "mock",
    mode: "read_only",
    persistence: "not_persisted",
    safety: null
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [actionIntentDryRunStatus, setActionIntentDryRunStatus] =
    useState("idle");
  const [actionIntentDryRunResult, setActionIntentDryRunResult] =
    useState(null);
  const [actionIntentDryRunError, setActionIntentDryRunError] = useState("");
  const [stateTransitionDryRunStatus, setStateTransitionDryRunStatus] =
    useState("idle");
  const [stateTransitionDryRunResult, setStateTransitionDryRunResult] =
    useState(null);
  const [stateTransitionDryRunError, setStateTransitionDryRunError] =
    useState("");
  const [stateTransitionPreviewCurrentState, setStateTransitionPreviewCurrentState] =
    useState(INITIAL_PREVIEW_CURRENT_STATE);
  const [selectedStateTransitionEvent, setSelectedStateTransitionEvent] =
    useState(INITIAL_PREVIEW_EVENT);
  const [preconditionsDryRunStatus, setPreconditionsDryRunStatus] =
    useState("idle");
  const [preconditionsDryRunResult, setPreconditionsDryRunResult] =
    useState(null);
  const [preconditionsDryRunError, setPreconditionsDryRunError] = useState("");
  const [selectedPreconditionsActionIntent, setSelectedPreconditionsActionIntent] =
    useState(PRECONDITIONS_ACTION_INTENTS[0]);
  const [preconditionsCurrentState, setPreconditionsCurrentState] = useState(
    INITIAL_PRECONDITIONS_CURRENT_STATE
  );
  const [preconditionsActorId, setPreconditionsActorId] = useState(
    INITIAL_PRECONDITIONS_ACTOR_ID
  );
  const [preconditionsActorRole, setPreconditionsActorRole] = useState(
    INITIAL_PRECONDITIONS_ACTOR_ROLE
  );
  const [preconditionsRequestId, setPreconditionsRequestId] = useState(
    INITIAL_PRECONDITIONS_REQUEST_ID
  );
  const [
    controlledActionValidationStatus,
    setControlledActionValidationStatus
  ] = useState("idle");
  const [
    controlledActionValidationResult,
    setControlledActionValidationResult
  ] = useState(null);
  const [
    controlledActionValidationError,
    setControlledActionValidationError
  ] = useState("");
  const [
    selectedControlledActionValidationIntent,
    setSelectedControlledActionValidationIntent
  ] = useState(CONTROLLED_ACTION_VALIDATION_INTENTS[0]);
  const [
    controlledActionValidationRequestId,
    setControlledActionValidationRequestId
  ] = useState(INITIAL_CONTROLLED_ACTION_VALIDATION_REQUEST_ID);
  const [
    controlledActionValidationIdempotencyKey,
    setControlledActionValidationIdempotencyKey
  ] = useState(INITIAL_CONTROLLED_ACTION_VALIDATION_IDEMPOTENCY_KEY);
  const [
    controlledActionValidationExpectedReviewVersion,
    setControlledActionValidationExpectedReviewVersion
  ] = useState(INITIAL_CONTROLLED_ACTION_VALIDATION_EXPECTED_REVIEW_VERSION);
  const [validationReceiptStatus, setValidationReceiptStatus] = useState("idle");
  const [validationReceiptResult, setValidationReceiptResult] = useState(null);
  const [validationReceiptError, setValidationReceiptError] = useState("");
  const [decisionPreviewStatus, setDecisionPreviewStatus] = useState("idle");
  const [decisionPreviewResult, setDecisionPreviewResult] = useState(null);
  const [decisionPreviewError, setDecisionPreviewError] = useState("");
  const [decisionExecutionStatus, setDecisionExecutionStatus] =
    useState("idle");
  const [decisionExecutionResult, setDecisionExecutionResult] = useState(null);
  const [decisionExecutionError, setDecisionExecutionError] = useState("");
  const [decisionExecutionConfirmation, setDecisionExecutionConfirmation] =
    useState(null);
  const [appointmentCreationStatus, setAppointmentCreationStatus] =
    useState("idle");
  const [appointmentCreationResult, setAppointmentCreationResult] =
    useState(null);
  const [appointmentCreationError, setAppointmentCreationError] = useState("");
  const [appointmentCreationConfirmation, setAppointmentCreationConfirmation] =
    useState(null);
  const [createdAppointments, setCreatedAppointments] = useState([]);
  const [calendarSyncStatus, setCalendarSyncStatus] = useState("idle");
  const [calendarSyncResult, setCalendarSyncResult] = useState(null);
  const [calendarSyncError, setCalendarSyncError] = useState("");
  const [calendarSyncConfirmation, setCalendarSyncConfirmation] =
    useState(null);
  const [confirmationDispatchStatus, setConfirmationDispatchStatus] =
    useState("idle");
  const [confirmationDispatchResult, setConfirmationDispatchResult] =
    useState(null);
  const [confirmationDispatchError, setConfirmationDispatchError] =
    useState("");
  const [
    confirmationDispatchConfirmation,
    setConfirmationDispatchConfirmation
  ] = useState(null);
  const [appointmentLifecycleStatus, setAppointmentLifecycleStatus] =
    useState("idle");
  const [appointmentLifecycleResult, setAppointmentLifecycleResult] =
    useState(null);
  const [appointmentLifecycleError, setAppointmentLifecycleError] =
    useState("");
  const [appointmentLifecycleConfirmation, setAppointmentLifecycleConfirmation] =
    useState(null);
  const [appointmentLifecycleEventsById, setAppointmentLifecycleEventsById] =
    useState({});
  const [decisionComparisonStatus, setDecisionComparisonStatus] =
    useState("idle");
  const [decisionComparisonResult, setDecisionComparisonResult] =
    useState(null);
  const [decisionComparisonError, setDecisionComparisonError] = useState("");
  const [resolutionGuidanceStatus, setResolutionGuidanceStatus] =
    useState("idle");
  const [resolutionGuidanceResult, setResolutionGuidanceResult] =
    useState(null);
  const [resolutionGuidanceError, setResolutionGuidanceError] = useState("");
  const [resolutionChecklistSession, setResolutionChecklistSession] = useState(
    () => createResolutionChecklistSession(null)
  );
  const [queueReadinessStatus, setQueueReadinessStatus] = useState("idle");
  const [queueReadinessResult, setQueueReadinessResult] = useState(null);
  const [queueReadinessError, setQueueReadinessError] = useState("");
  const [queueReadinessFilter, setQueueReadinessFilter] = useState("all");
  const [shiftHandoffStatus, setShiftHandoffStatus] = useState("idle");
  const [shiftHandoffResult, setShiftHandoffResult] = useState(null);
  const [shiftHandoffError, setShiftHandoffError] = useState("");
  const [shiftHandoffCopyStatus, setShiftHandoffCopyStatus] = useState("idle");
  const [guidedReviewSession, setGuidedReviewSession] = useState(() =>
    getEmptyAppointmentReviewGuidedSession()
  );
  const [guidedReviewSessionFilter, setGuidedReviewSessionFilter] = useState(
    GUIDED_SESSION_FILTERS.ALL
  );
  const [guidedReviewSessionMessage, setGuidedReviewSessionMessage] =
    useState("");
  const [followUpBoardStatus, setFollowUpBoardStatus] = useState("idle");
  const [followUpBoardError, setFollowUpBoardError] = useState("");
  const [followUpBoardMessage, setFollowUpBoardMessage] = useState("");
  const [followUpBoardCategoryFilter, setFollowUpBoardCategoryFilter] =
    useState(FOLLOW_UP_CATEGORY_FILTER_ALL);
  const [followUpBoardSessionFilter, setFollowUpBoardSessionFilter] = useState(
    GUIDED_SESSION_FILTERS.ALL
  );
  const [
    selectedValidationReceiptActionIntent,
    setSelectedValidationReceiptActionIntent
  ] = useState(VALIDATION_RECEIPT_ACTION_INTENTS[0]);
  const [validationReceiptRequestId, setValidationReceiptRequestId] = useState(
    INITIAL_VALIDATION_RECEIPT_REQUEST_ID
  );
  const [
    validationReceiptIdempotencyKey,
    setValidationReceiptIdempotencyKey
  ] = useState(INITIAL_VALIDATION_RECEIPT_IDEMPOTENCY_KEY);
  const [
    validationReceiptExpectedReviewVersion,
    setValidationReceiptExpectedReviewVersion
  ] = useState(INITIAL_VALIDATION_RECEIPT_EXPECTED_REVIEW_VERSION);
  const selectedReviewIdRef = useRef("");
  const isMountedRef = useRef(false);
  const stateTransitionRequestSequenceRef = useRef(0);
  const activeStateTransitionRequestRef = useRef(null);
  const activeStateTransitionAbortRef = useRef(null);
  const preconditionsRequestSequenceRef = useRef(0);
  const activePreconditionsRequestRef = useRef(null);
  const activePreconditionsAbortRef = useRef(null);
  const controlledActionValidationRequestSequenceRef = useRef(0);
  const activeControlledActionValidationRequestRef = useRef(null);
  const activeControlledActionValidationAbortRef = useRef(null);
  const validationReceiptRequestSequenceRef = useRef(0);
  const activeValidationReceiptRequestRef = useRef(null);
  const activeValidationReceiptAbortRef = useRef(null);
  const decisionPreviewRequestSequenceRef = useRef(0);
  const activeDecisionPreviewRequestRef = useRef(null);
  const activeDecisionPreviewAbortRef = useRef(null);
  const decisionExecutionRequestSequenceRef = useRef(0);
  const activeDecisionExecutionRequestRef = useRef(null);
  const activeDecisionExecutionAbortRef = useRef(null);
  const appointmentCreationRequestSequenceRef = useRef(0);
  const activeAppointmentCreationRequestRef = useRef(null);
  const activeAppointmentCreationAbortRef = useRef(null);
  const calendarSyncRequestSequenceRef = useRef(0);
  const activeCalendarSyncRequestRef = useRef(null);
  const activeCalendarSyncAbortRef = useRef(null);
  const confirmationDispatchRequestSequenceRef = useRef(0);
  const activeConfirmationDispatchRequestRef = useRef(null);
  const activeConfirmationDispatchAbortRef = useRef(null);
  const decisionComparisonRequestSequenceRef = useRef(0);
  const activeDecisionComparisonRequestRef = useRef(null);
  const activeDecisionComparisonAbortRef = useRef(null);
  const resolutionGuidanceRequestSequenceRef = useRef(0);
  const activeResolutionGuidanceRequestRef = useRef(null);
  const activeResolutionGuidanceAbortRef = useRef(null);
  const queueReadinessRequestSequenceRef = useRef(0);
  const activeQueueReadinessRequestRef = useRef(null);
  const activeQueueReadinessAbortRef = useRef(null);
  const shiftHandoffRequestSequenceRef = useRef(0);
  const activeShiftHandoffRequestRef = useRef(null);
  const activeShiftHandoffAbortRef = useRef(null);
  const selectedReview =
    reviews.find((review) => review.id === selectedReviewId) || null;
  const displayedActionIntentDryRun =
    actionIntentDryRunResult || ACTION_INTENT_DRY_RUN;
  const displayedStateTransitionDryRun =
    stateTransitionDryRunResult || INITIAL_STATE_TRANSITION_DRY_RUN;
  const displayedPreconditionsDryRun =
    preconditionsDryRunResult || INITIAL_PRECONDITIONS_DRY_RUN;
  const displayedControlledActionValidation =
    controlledActionValidationResult ||
    INITIAL_CONTROLLED_ACTION_VALIDATION_PREVIEW;
  const controlledActionValidationStages =
    getControlledActionValidationStages(controlledActionValidationResult);
  const displayedValidationReceipt =
    validationReceiptResult || INITIAL_VALIDATION_RECEIPT_PREVIEW;
  const validationReceiptStages =
    getValidationReceiptStages(validationReceiptResult);
  const validationReceiptCorrelation =
    getValidationReceiptCorrelation(validationReceiptResult);
  const displayedDecisionPreview =
    decisionPreviewResult || INITIAL_DECISION_PREVIEW;
  const displayedDecisionExecution =
    decisionExecutionResult || INITIAL_DECISION_EXECUTION;
  const displayedAppointmentCreation =
    appointmentCreationResult || INITIAL_APPOINTMENT_CREATION;
  const displayedCalendarSync = calendarSyncResult || INITIAL_CALENDAR_SYNC;
  const displayedConfirmationDispatch =
    confirmationDispatchResult || INITIAL_CONFIRMATION_DISPATCH;
  const executableDecisionPreview = isExecutableDecisionPreviewForReview(
    decisionPreviewResult,
    selectedReview
  )
    ? decisionPreviewResult
    : null;
  const displayedDecisionComparison =
    decisionComparisonResult || INITIAL_DECISION_COMPARISON;
  const approveComparisonPath = decisionComparisonResult?.paths?.approve || null;
  const rejectComparisonPath = decisionComparisonResult?.paths?.reject || null;
  const displayedResolutionGuidance =
    resolutionGuidanceResult || INITIAL_RESOLUTION_GUIDANCE_PREVIEW;
  const approveResolutionGuidance =
    resolutionGuidanceResult?.approve || null;
  const rejectResolutionGuidance = resolutionGuidanceResult?.reject || null;
  const approveResolutionChecklist =
    resolutionChecklistSession.branches.approve;
  const rejectResolutionChecklist =
    resolutionChecklistSession.branches.reject;
  const appointmentCreationCandidate =
    getAppointmentCreationCandidate(selectedReview);
  const displayedQueueReadiness =
    queueReadinessResult || INITIAL_QUEUE_READINESS_PREVIEW;
  const displayedShiftHandoff =
    shiftHandoffResult || INITIAL_SHIFT_HANDOFF_PREVIEW;
  const currentReviewIds = reviews.map((review) => review.id);
  const currentShiftHandoffResult =
    isCurrentShiftHandoffResult(shiftHandoffResult, currentReviewIds)
      ? shiftHandoffResult
      : null;
  const followUpFocusBoard = buildAppointmentReviewFollowUpFocusBoard(
    currentShiftHandoffResult,
    {
      categoryFilter: followUpBoardCategoryFilter,
      sessionFilter: followUpBoardSessionFilter,
      guidedSession: guidedReviewSession
    }
  );
  const followUpBoardCategoryOptions = [
    [FOLLOW_UP_CATEGORY_FILTER_ALL, "All follow-up categories"],
    ...followUpFocusBoard.categories.map((category) => [
      category.code,
      category.label
    ])
  ];
  const queueReadinessItems = getCurrentQueueReadinessItems({
    result: queueReadinessResult,
    reviewIds: currentReviewIds
  });
  const queueReadinessItemsById = Object.fromEntries(
    queueReadinessItems.map((item) => [item.reviewId, item])
  );
  const readinessFilteredReviews =
    queueReadinessFilter === "all"
      ? reviews
      : reviews.filter(
          (review) =>
            queueReadinessItemsById[review.id]?.readiness ===
            queueReadinessFilter
        );
  const filteredReviews = filterAppointmentReviewsByGuidedSession(
    readinessFilteredReviews,
    guidedReviewSession,
    guidedReviewSessionFilter
  );
  const selectedGuidedSessionItem = getAppointmentReviewGuidedSessionItem(
    guidedReviewSession,
    selectedReview
  );

  useEffect(() => {
    let isMounted = true;

    async function loadAppointmentReviews() {
      try {
        const response = await fetch("/api/secretary/appointment-reviews");

        if (!response.ok) {
          throw new Error("Appointment review queue API yanıtı başarısız oldu.");
        }

        const payload = await response.json();

        if (!isMounted) {
          return;
        }

        const nextReviews = Array.isArray(payload.reviews) ? payload.reviews : [];

        invalidateResolutionGuidanceRequest();
        resetResolutionGuidanceState();
        invalidateQueueReadinessRequest();
        resetQueueReadinessState();
        setReviews(nextReviews);
        setGuidedReviewSession((currentSession) =>
          currentSession.active
            ? reconcileAppointmentReviewGuidedSession(
                currentSession,
                nextReviews
              )
            : currentSession
        );
        invalidateShiftHandoffRequest();
        resetShiftHandoffState();
        resetFollowUpBoardState();
        setSelectedReviewId((currentSelectedReviewId) => {
          if (
            currentSelectedReviewId &&
            nextReviews.some((review) => review.id === currentSelectedReviewId)
          ) {
            return currentSelectedReviewId;
          }

          return nextReviews[0]?.id || "";
        });
        setSummary({
          source: payload.source || "mock",
          mode: payload.mode || payload.safety?.mode || "read_only",
          persistence: payload.persistence || "not_persisted",
          safety: payload.safety || null
        });
        setLoading(false);
        setLoadError("");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setReviews([]);
        setGuidedReviewSession((currentSession) =>
          currentSession.active
            ? reconcileAppointmentReviewGuidedSession(currentSession, [])
            : currentSession
        );
        setSelectedReviewId("");
        invalidateResolutionGuidanceRequest();
        resetResolutionGuidanceState();
        invalidateQueueReadinessRequest();
        resetQueueReadinessState();
        setLoading(false);
        invalidateShiftHandoffRequest();
        resetShiftHandoffState();
        resetFollowUpBoardState();
        setLoadError(
          error instanceof Error
            ? error.message
            : "Appointment review queue verisi yüklenemedi."
        );
      }
    }

    loadAppointmentReviews();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      invalidateStateTransitionDryRunRequest();
      invalidatePreconditionsDryRunRequest();
      invalidateControlledActionValidationRequest();
      invalidateValidationReceiptRequest();
      invalidateDecisionPreviewRequest();
      invalidateDecisionExecutionRequest();
      invalidateAppointmentCreationRequest();
      invalidateCalendarSyncRequest();
      invalidateConfirmationDispatchRequest();
      invalidateDecisionComparisonRequest();
      invalidateResolutionGuidanceRequest();
      invalidateQueueReadinessRequest();
      invalidateShiftHandoffRequest();
    };
  }, []);

  useEffect(() => {
    selectedReviewIdRef.current = selectedReviewId;
    invalidateStateTransitionDryRunRequest();
    invalidatePreconditionsDryRunRequest();
    invalidateControlledActionValidationRequest();
    invalidateValidationReceiptRequest();
    invalidateDecisionPreviewRequest();
    invalidateDecisionExecutionRequest();
    invalidateAppointmentCreationRequest();
    invalidateCalendarSyncRequest();
    invalidateConfirmationDispatchRequest();
    invalidateDecisionComparisonRequest();
    invalidateResolutionGuidanceRequest();
    setActionIntentDryRunStatus("idle");
    setActionIntentDryRunResult(null);
    setActionIntentDryRunError("");
    setStateTransitionDryRunStatus("idle");
    setStateTransitionDryRunResult(null);
    setStateTransitionDryRunError("");
    setStateTransitionPreviewCurrentState(INITIAL_PREVIEW_CURRENT_STATE);
    setSelectedStateTransitionEvent(INITIAL_PREVIEW_EVENT);
    setPreconditionsDryRunStatus("idle");
    setPreconditionsDryRunResult(null);
    setPreconditionsDryRunError("");
    setSelectedPreconditionsActionIntent(PRECONDITIONS_ACTION_INTENTS[0]);
    setPreconditionsCurrentState(INITIAL_PRECONDITIONS_CURRENT_STATE);
    setPreconditionsActorId(INITIAL_PRECONDITIONS_ACTOR_ID);
    setPreconditionsActorRole(INITIAL_PRECONDITIONS_ACTOR_ROLE);
    setPreconditionsRequestId(INITIAL_PRECONDITIONS_REQUEST_ID);
    setControlledActionValidationStatus("idle");
    setControlledActionValidationResult(null);
    setControlledActionValidationError("");
    setSelectedControlledActionValidationIntent(
      CONTROLLED_ACTION_VALIDATION_INTENTS[0]
    );
    setControlledActionValidationRequestId(
      INITIAL_CONTROLLED_ACTION_VALIDATION_REQUEST_ID
    );
    setControlledActionValidationIdempotencyKey(
      INITIAL_CONTROLLED_ACTION_VALIDATION_IDEMPOTENCY_KEY
    );
    setControlledActionValidationExpectedReviewVersion(
      INITIAL_CONTROLLED_ACTION_VALIDATION_EXPECTED_REVIEW_VERSION
    );
    setValidationReceiptStatus("idle");
    setValidationReceiptResult(null);
    setValidationReceiptError("");
    setSelectedValidationReceiptActionIntent(VALIDATION_RECEIPT_ACTION_INTENTS[0]);
    setValidationReceiptRequestId(INITIAL_VALIDATION_RECEIPT_REQUEST_ID);
    setValidationReceiptIdempotencyKey(
      INITIAL_VALIDATION_RECEIPT_IDEMPOTENCY_KEY
    );
    setValidationReceiptExpectedReviewVersion(
      INITIAL_VALIDATION_RECEIPT_EXPECTED_REVIEW_VERSION
    );
    setDecisionPreviewStatus("idle");
    setDecisionPreviewResult(null);
    setDecisionPreviewError("");
    resetDecisionExecutionState();
    resetAppointmentCreationState();
    resetCalendarSyncState();
    resetConfirmationDispatchState();
    setDecisionComparisonStatus("idle");
    setDecisionComparisonResult(null);
    setDecisionComparisonError("");
    setResolutionGuidanceStatus("idle");
    setResolutionGuidanceResult(null);
    setResolutionGuidanceError("");
  }, [selectedReviewId]);

  async function refreshAppointmentReviewsFromTrustedServer({
    preserveReviewId = selectedReviewIdRef.current
  } = {}) {
    const response = await fetch("/api/secretary/appointment-reviews");

    if (!response.ok) {
      throw new Error("Appointment review queue refresh failed safely.");
    }

    const payload = await response.json();
    const nextReviews = Array.isArray(payload.reviews) ? payload.reviews : [];

    setReviews(nextReviews);
    setGuidedReviewSession((currentSession) =>
      currentSession.active
        ? reconcileAppointmentReviewGuidedSession(currentSession, nextReviews)
        : currentSession
    );
    setSelectedReviewId((currentSelectedReviewId) => {
      if (
        preserveReviewId &&
        nextReviews.some((review) => review.id === preserveReviewId)
      ) {
        return preserveReviewId;
      }

      if (
        currentSelectedReviewId &&
        nextReviews.some((review) => review.id === currentSelectedReviewId)
      ) {
        return currentSelectedReviewId;
      }

      return nextReviews[0]?.id || "";
    });
    setSummary({
      source: payload.source || "mock",
      mode: payload.mode || payload.safety?.mode || "read_only",
      persistence: payload.persistence || "not_persisted",
      safety: payload.safety || null
    });
  }

  async function refreshCreatedAppointmentsFromTrustedServer() {
    const response = await fetch("/api/secretary/appointments");

    if (!response.ok) {
      throw new Error("Appointment list refresh failed safely.");
    }

    const payload = await response.json();

    setCreatedAppointments(
      Array.isArray(payload.appointments) ? payload.appointments : []
    );
  }

  function resetDecisionExecutionState() {
    setDecisionExecutionStatus("idle");
    setDecisionExecutionResult(null);
    setDecisionExecutionError("");
    setDecisionExecutionConfirmation(null);
  }

  function resetAppointmentCreationState() {
    setAppointmentCreationStatus("idle");
    setAppointmentCreationResult(null);
    setAppointmentCreationError("");
    setAppointmentCreationConfirmation(null);
  }

  function resetCalendarSyncState() {
    setCalendarSyncStatus("idle");
    setCalendarSyncResult(null);
    setCalendarSyncError("");
    setCalendarSyncConfirmation(null);
  }

  function resetConfirmationDispatchState() {
    setConfirmationDispatchStatus("idle");
    setConfirmationDispatchResult(null);
    setConfirmationDispatchError("");
    setConfirmationDispatchConfirmation(null);
  }

  function invalidateOldVersionDecisionStateAfterExecution() {
    invalidateDecisionPreviewRequest();
    invalidateDecisionComparisonRequest();
    invalidateResolutionGuidanceRequest();
    invalidateQueueReadinessRequest();
    invalidateShiftHandoffRequest();
    resetResolutionGuidanceState();
    resetQueueReadinessState();
    resetShiftHandoffState();
    resetFollowUpBoardState();
    setResolutionChecklistSession(createResolutionChecklistSession(null));
    setGuidedReviewSession(getEmptyAppointmentReviewGuidedSession());
    setDecisionPreviewStatus("idle");
    setDecisionPreviewResult(null);
    setDecisionPreviewError("");
    setDecisionComparisonStatus("idle");
    setDecisionComparisonResult(null);
    setDecisionComparisonError("");
  }

  function invalidateOldVersionStateAfterAppointmentCreation() {
    invalidateOldVersionDecisionStateAfterExecution();
  }

  function buildDecisionExecutionIdempotencyKey(preview) {
    return [
      "decision_execution",
      preview.reviewId,
      preview.action,
      preview.observedReviewVersion
    ].join(":");
  }

  function buildAppointmentCreationIdempotencyKey(review, candidate) {
    return [
      "appointment_creation",
      review.id,
      candidate.expectedReviewVersion,
      candidate.selectedSlotId
    ].join(":");
  }

  async function runActionIntentDryRun() {
    invalidateDecisionComparisonRequest();
    invalidateResolutionGuidanceRequest();
    resetResolutionGuidanceState();

    if (!selectedReview) {
      setActionIntentDryRunStatus("error");
      setActionIntentDryRunResult(null);
      setActionIntentDryRunError(
        "Select a review before running validation-only preview."
      );
      return;
    }

    const reviewIdForRequest = selectedReview.id;

    setActionIntentDryRunStatus("validating");
    setActionIntentDryRunResult(null);
    setActionIntentDryRunError("");

    try {
      const response = await fetch(
        `/api/secretary/appointment-reviews/${encodeURIComponent(
          reviewIdForRequest
        )}/action-intent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            actionIntent: "needs_clinic_review"
          })
        }
      );
      const payload = await response.json();

      if (!response.ok || payload.status !== "ok") {
        throw new Error(
          payload?.error?.message ||
            "Validation-only action intent preview failed safely."
        );
      }

      if (!isSafeActionIntentDryRunResponse(payload)) {
        throw new Error(
          "Validation-only route response was unsafe or incomplete."
        );
      }

      if (selectedReviewIdRef.current !== reviewIdForRequest) {
        return;
      }

      setActionIntentDryRunResult(payload);
      setActionIntentDryRunStatus("success");
    } catch (error) {
      if (selectedReviewIdRef.current !== reviewIdForRequest) {
        return;
      }

      setActionIntentDryRunResult(null);
      setActionIntentDryRunStatus("error");
      setActionIntentDryRunError(
        error instanceof Error
          ? error.message
          : "Validation-only action intent preview failed safely."
      );
    }
  }

  async function runStateTransitionDryRun() {
    invalidateDecisionComparisonRequest();
    invalidateResolutionGuidanceRequest();
    resetResolutionGuidanceState();

    if (stateTransitionDryRunStatus === "loading") {
      return;
    }

    if (!selectedReview) {
      setStateTransitionDryRunStatus("failure");
      setStateTransitionDryRunResult(null);
      setStateTransitionDryRunError(
        "Select a review before running state transition dry-run."
      );
      return;
    }

    const reviewIdForRequest = selectedReview.id;
    const currentStateForRequest = stateTransitionPreviewCurrentState;
    const eventForRequest = selectedStateTransitionEvent;
    const requestId = createStateTransitionDryRunRequest({
      reviewId: reviewIdForRequest,
      currentState: currentStateForRequest,
      event: eventForRequest
    });
    const activeAbortController = activeStateTransitionAbortRef.current;

    setStateTransitionDryRunStatus("loading");
    setStateTransitionDryRunResult(null);
    setStateTransitionDryRunError("");

    try {
      const response = await fetch(
        `/api/secretary/appointment-reviews/${encodeURIComponent(
          reviewIdForRequest
        )}/state-transition`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({
            currentState: currentStateForRequest,
            event: eventForRequest
          })
        }
      );
      const payload = await response.json();

      if (
        !isActiveStateTransitionDryRunRequest({
          requestId,
          reviewId: reviewIdForRequest,
          currentState: currentStateForRequest,
          event: eventForRequest
        })
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            payload?.error?.message ||
            "State transition dry-run failed safely."
        );
      }

      if (!isSafeStateTransitionDryRunResponse(payload)) {
        throw new Error(
          "State transition dry-run response was unsafe or incomplete."
        );
      }

      setStateTransitionDryRunResult(payload);
      setStateTransitionDryRunStatus("success");
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (
        !isActiveStateTransitionDryRunRequest({
          requestId,
          reviewId: reviewIdForRequest,
          currentState: currentStateForRequest,
          event: eventForRequest
        })
      ) {
        return;
      }

      setStateTransitionDryRunResult(null);
      setStateTransitionDryRunStatus("failure");
      setStateTransitionDryRunError(
        error instanceof Error
          ? error.message
          : "State transition dry-run failed safely."
      );
    }
  }

  function createStateTransitionDryRunRequest({ reviewId, currentState, event }) {
    invalidateStateTransitionDryRunRequest();

    const requestId = stateTransitionRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    stateTransitionRequestSequenceRef.current = requestId;
    activeStateTransitionAbortRef.current = abortController;
    activeStateTransitionRequestRef.current = {
      requestId,
      reviewId,
      currentState,
      event
    };

    return requestId;
  }

  function invalidateStateTransitionDryRunRequest() {
    stateTransitionRequestSequenceRef.current += 1;
    activeStateTransitionRequestRef.current = null;

    if (activeStateTransitionAbortRef.current) {
      activeStateTransitionAbortRef.current.abort();
      activeStateTransitionAbortRef.current = null;
    }
  }

  function isActiveStateTransitionDryRunRequest({
    requestId,
    reviewId,
    currentState,
    event
  }) {
    const activeRequest = activeStateTransitionRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      activeRequest.reviewId === reviewId &&
      activeRequest.currentState === currentState &&
      activeRequest.event === event &&
      selectedReviewIdRef.current === reviewId
    );
  }

  async function runPreconditionsDryRun() {
    invalidateDecisionComparisonRequest();
    invalidateResolutionGuidanceRequest();
    resetResolutionGuidanceState();

    if (preconditionsDryRunStatus === "loading") {
      return;
    }

    if (!selectedReview) {
      setPreconditionsDryRunStatus("failure");
      setPreconditionsDryRunResult(null);
      setPreconditionsDryRunError(
        "Select a review before running preconditions dry-run."
      );
      return;
    }

    const reviewIdForRequest = selectedReview.id;
    const actionIntentForRequest = selectedPreconditionsActionIntent;
    const currentStateForRequest = preconditionsCurrentState;
    const actorIdForRequest = preconditionsActorId;
    const actorRoleForRequest = preconditionsActorRole;
    const requestIdForRequest = preconditionsRequestId;
    const requestId = createPreconditionsDryRunRequest({
      reviewId: reviewIdForRequest,
      actionIntent: actionIntentForRequest,
      currentState: currentStateForRequest,
      actorId: actorIdForRequest,
      actorRole: actorRoleForRequest,
      requestId: requestIdForRequest
    });
    const activeAbortController = activePreconditionsAbortRef.current;

    setPreconditionsDryRunStatus("loading");
    setPreconditionsDryRunResult(null);
    setPreconditionsDryRunError("");

    try {
      const response = await fetch(
        `/api/secretary/appointment-reviews/${encodeURIComponent(
          reviewIdForRequest
        )}/action-preconditions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({
            actionIntent: actionIntentForRequest,
            currentState: currentStateForRequest,
            actor: {
              actorId: actorIdForRequest,
              role: actorRoleForRequest
            },
            requestId: requestIdForRequest
          })
        }
      );
      const payload = await response.json();

      if (
        !isActivePreconditionsDryRunRequest({
          requestId,
          reviewId: reviewIdForRequest,
          actionIntent: actionIntentForRequest,
          currentState: currentStateForRequest,
          actorId: actorIdForRequest,
          actorRole: actorRoleForRequest,
          preconditionsRequestId: requestIdForRequest
        })
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            payload?.error?.message ||
            "Preconditions dry-run failed safely."
        );
      }

      if (!isSafePreconditionsDryRunResponse(payload)) {
        throw new Error(
          "Preconditions dry-run response was unsafe or incomplete."
        );
      }

      setPreconditionsDryRunResult(payload);
      setPreconditionsDryRunStatus("success");
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (
        !isActivePreconditionsDryRunRequest({
          requestId,
          reviewId: reviewIdForRequest,
          actionIntent: actionIntentForRequest,
          currentState: currentStateForRequest,
          actorId: actorIdForRequest,
          actorRole: actorRoleForRequest,
          preconditionsRequestId: requestIdForRequest
        })
      ) {
        return;
      }

      setPreconditionsDryRunResult(null);
      setPreconditionsDryRunStatus("failure");
      setPreconditionsDryRunError(
        error instanceof Error
          ? error.message
          : "Preconditions dry-run failed safely."
      );
    }
  }

  function createPreconditionsDryRunRequest({
    reviewId,
    actionIntent,
    currentState,
    actorId,
    actorRole,
    requestId
  }) {
    invalidatePreconditionsDryRunRequest();

    const sequenceId = preconditionsRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    preconditionsRequestSequenceRef.current = sequenceId;
    activePreconditionsAbortRef.current = abortController;
    activePreconditionsRequestRef.current = {
      requestId: sequenceId,
      reviewId,
      actionIntent,
      currentState,
      actorId,
      actorRole,
      preconditionsRequestId: requestId
    };

    return sequenceId;
  }

  function invalidatePreconditionsDryRunRequest() {
    preconditionsRequestSequenceRef.current += 1;
    activePreconditionsRequestRef.current = null;

    if (activePreconditionsAbortRef.current) {
      activePreconditionsAbortRef.current.abort();
      activePreconditionsAbortRef.current = null;
    }
  }

  function isActivePreconditionsDryRunRequest({
    requestId,
    reviewId,
    actionIntent,
    currentState,
    actorId,
    actorRole,
    preconditionsRequestId
  }) {
    const activeRequest = activePreconditionsRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      activeRequest.reviewId === reviewId &&
      activeRequest.actionIntent === actionIntent &&
      activeRequest.currentState === currentState &&
      activeRequest.actorId === actorId &&
      activeRequest.actorRole === actorRole &&
      activeRequest.preconditionsRequestId === preconditionsRequestId &&
      selectedReviewIdRef.current === reviewId
    );
  }

  async function runControlledActionValidationDryRun() {
    invalidateDecisionComparisonRequest();
    invalidateResolutionGuidanceRequest();
    resetResolutionGuidanceState();

    if (controlledActionValidationStatus === "loading") {
      return;
    }

    if (!selectedReview) {
      setControlledActionValidationStatus("failure");
      setControlledActionValidationResult(null);
      setControlledActionValidationError(
        "Select a review before running controlled action validation dry-run."
      );
      return;
    }

    const reviewIdForRequest = selectedReview.id;
    const actionIntentForRequest = selectedControlledActionValidationIntent;
    const requestIdForRequest = controlledActionValidationRequestId;
    const idempotencyKeyForRequest = controlledActionValidationIdempotencyKey;
    const expectedReviewVersionForRequest =
      Number(controlledActionValidationExpectedReviewVersion);
    const requestId = createControlledActionValidationRequest({
      reviewId: reviewIdForRequest,
      actionIntent: actionIntentForRequest,
      previewRequestId: requestIdForRequest,
      idempotencyKey: idempotencyKeyForRequest,
      expectedReviewVersion: expectedReviewVersionForRequest
    });
    const activeAbortController = activeControlledActionValidationAbortRef.current;

    setControlledActionValidationStatus("loading");
    setControlledActionValidationResult(null);
    setControlledActionValidationError("");

    try {
      const response = await fetch(
        `/api/secretary/appointment-reviews/${encodeURIComponent(
          reviewIdForRequest
        )}/controlled-action-validation`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({
            actionIntent: actionIntentForRequest,
            requestId: requestIdForRequest,
            idempotencyKey: idempotencyKeyForRequest,
            expectedReviewVersion: expectedReviewVersionForRequest
          })
        }
      );
      const payload = await response.json();

      if (
        !isActiveControlledActionValidationRequest({
          requestId,
          reviewId: reviewIdForRequest,
          actionIntent: actionIntentForRequest,
          previewRequestId: requestIdForRequest,
          idempotencyKey: idempotencyKeyForRequest,
          expectedReviewVersion: expectedReviewVersionForRequest
        })
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            payload?.error?.message ||
            "Controlled action validation dry-run failed safely."
        );
      }

      if (!isSafeControlledActionValidationResponse(payload)) {
        throw new Error(
          "Controlled action validation response was unsafe or incomplete."
        );
      }

      setControlledActionValidationResult(payload);
      setControlledActionValidationStatus("success");
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (
        !isActiveControlledActionValidationRequest({
          requestId,
          reviewId: reviewIdForRequest,
          actionIntent: actionIntentForRequest,
          previewRequestId: requestIdForRequest,
          idempotencyKey: idempotencyKeyForRequest,
          expectedReviewVersion: expectedReviewVersionForRequest
        })
      ) {
        return;
      }

      setControlledActionValidationResult(null);
      setControlledActionValidationStatus("failure");
      setControlledActionValidationError(
        error instanceof Error
          ? error.message
          : "Controlled action validation dry-run failed safely."
      );
    }
  }

  function createControlledActionValidationRequest({
    reviewId,
    actionIntent,
    previewRequestId,
    idempotencyKey,
    expectedReviewVersion
  }) {
    invalidateControlledActionValidationRequest();

    const requestId = controlledActionValidationRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    controlledActionValidationRequestSequenceRef.current = requestId;
    activeControlledActionValidationAbortRef.current = abortController;
    activeControlledActionValidationRequestRef.current = {
      requestId,
      reviewId,
      actionIntent,
      previewRequestId,
      idempotencyKey,
      expectedReviewVersion
    };

    return requestId;
  }

  function invalidateControlledActionValidationRequest() {
    controlledActionValidationRequestSequenceRef.current += 1;
    activeControlledActionValidationRequestRef.current = null;

    if (activeControlledActionValidationAbortRef.current) {
      activeControlledActionValidationAbortRef.current.abort();
      activeControlledActionValidationAbortRef.current = null;
    }
  }

  function isActiveControlledActionValidationRequest({
    requestId,
    reviewId,
    actionIntent,
    previewRequestId,
    idempotencyKey,
    expectedReviewVersion
  }) {
    const activeRequest = activeControlledActionValidationRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      activeRequest.reviewId === reviewId &&
      activeRequest.actionIntent === actionIntent &&
      activeRequest.previewRequestId === previewRequestId &&
      activeRequest.idempotencyKey === idempotencyKey &&
      activeRequest.expectedReviewVersion === expectedReviewVersion &&
      selectedReviewIdRef.current === reviewId
    );
  }

  async function runValidationReceiptDryRun() {
    invalidateDecisionComparisonRequest();
    invalidateResolutionGuidanceRequest();
    resetResolutionGuidanceState();

    if (validationReceiptStatus === "loading") {
      return;
    }

    if (!selectedReview) {
      setValidationReceiptStatus("failure");
      setValidationReceiptResult(null);
      setValidationReceiptError(
        "Select a review before running validation receipt dry-run."
      );
      return;
    }

    const reviewIdForRequest = selectedReview.id;
    const actionIntentForRequest = selectedValidationReceiptActionIntent;
    const requestIdForRequest = validationReceiptRequestId;
    const idempotencyKeyForRequest = validationReceiptIdempotencyKey;
    const expectedReviewVersionForRequest = Number(
      validationReceiptExpectedReviewVersion
    );
    const requestId = createValidationReceiptRequest({
      reviewId: reviewIdForRequest,
      actionIntent: actionIntentForRequest,
      previewRequestId: requestIdForRequest,
      idempotencyKey: idempotencyKeyForRequest,
      expectedReviewVersion: expectedReviewVersionForRequest
    });
    const activeAbortController = activeValidationReceiptAbortRef.current;

    setValidationReceiptStatus("loading");
    setValidationReceiptResult(null);
    setValidationReceiptError("");

    try {
      const response = await fetch(
        `/api/secretary/appointment-reviews/${encodeURIComponent(
          reviewIdForRequest
        )}/controlled-action-validation-receipt`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({
            actionIntent: actionIntentForRequest,
            requestId: requestIdForRequest,
            idempotencyKey: idempotencyKeyForRequest,
            expectedReviewVersion: expectedReviewVersionForRequest
          })
        }
      );
      const payload = await response.json();

      if (
        !isActiveValidationReceiptRequest({
          requestId,
          reviewId: reviewIdForRequest,
          actionIntent: actionIntentForRequest,
          previewRequestId: requestIdForRequest,
          idempotencyKey: idempotencyKeyForRequest,
          expectedReviewVersion: expectedReviewVersionForRequest
        })
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            payload?.error?.message ||
            "Validation receipt dry-run failed safely."
        );
      }

      if (!isSafeValidationReceiptResponse(payload)) {
        throw new Error(
          "Validation receipt route response was unsafe or incomplete."
        );
      }

      setValidationReceiptResult(payload);
      setValidationReceiptStatus("success");
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (
        !isActiveValidationReceiptRequest({
          requestId,
          reviewId: reviewIdForRequest,
          actionIntent: actionIntentForRequest,
          previewRequestId: requestIdForRequest,
          idempotencyKey: idempotencyKeyForRequest,
          expectedReviewVersion: expectedReviewVersionForRequest
        })
      ) {
        return;
      }

      setValidationReceiptResult(null);
      setValidationReceiptStatus("failure");
      setValidationReceiptError(
        error instanceof Error
          ? error.message
          : "Validation receipt dry-run failed safely."
      );
    }
  }

  function createValidationReceiptRequest({
    reviewId,
    actionIntent,
    previewRequestId,
    idempotencyKey,
    expectedReviewVersion
  }) {
    invalidateValidationReceiptRequest();

    const requestId = validationReceiptRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    validationReceiptRequestSequenceRef.current = requestId;
    activeValidationReceiptAbortRef.current = abortController;
    activeValidationReceiptRequestRef.current = {
      requestId,
      reviewId,
      actionIntent,
      previewRequestId,
      idempotencyKey,
      expectedReviewVersion
    };

    return requestId;
  }

  function invalidateValidationReceiptRequest() {
    validationReceiptRequestSequenceRef.current += 1;
    activeValidationReceiptRequestRef.current = null;

    if (activeValidationReceiptAbortRef.current) {
      activeValidationReceiptAbortRef.current.abort();
      activeValidationReceiptAbortRef.current = null;
    }
  }

  function isActiveValidationReceiptRequest({
    requestId,
    reviewId,
    actionIntent,
    previewRequestId,
    idempotencyKey,
    expectedReviewVersion
  }) {
    const activeRequest = activeValidationReceiptRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      activeRequest.reviewId === reviewId &&
      activeRequest.actionIntent === actionIntent &&
      activeRequest.previewRequestId === previewRequestId &&
      activeRequest.idempotencyKey === idempotencyKey &&
      activeRequest.expectedReviewVersion === expectedReviewVersion &&
      selectedReviewIdRef.current === reviewId
    );
  }

  async function runDecisionPreview(action) {
    invalidateDecisionComparisonRequest();
    invalidateResolutionGuidanceRequest();
    resetResolutionGuidanceState();
    resetDecisionExecutionState();

    if (decisionPreviewStatus === "loading") {
      return;
    }

    if (!selectedReview) {
      setDecisionPreviewStatus("failure");
      setDecisionPreviewResult(null);
      setDecisionPreviewError(
        "Select a review before running decision preview dry-run."
      );
      return;
    }

    const reviewIdForRequest = selectedReview.id;
    const actionForRequest = action;
    const requestId = createDecisionPreviewRequest({
      reviewId: reviewIdForRequest,
      action: actionForRequest
    });
    const activeAbortController = activeDecisionPreviewAbortRef.current;

    setDecisionPreviewStatus("loading");
    setDecisionPreviewResult(null);
    setDecisionPreviewError("");

    try {
      const response = await fetch(
        `/api/secretary/appointment-reviews/${encodeURIComponent(
          reviewIdForRequest
        )}/decision-preview`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({
            action: actionForRequest
          })
        }
      );
      const payload = await response.json();

      if (
        !isActiveDecisionPreviewRequest({
          requestId,
          reviewId: reviewIdForRequest,
          action: actionForRequest
        })
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            payload?.error?.message ||
            "Decision preview dry-run failed safely."
        );
      }

      if (!isSafeDecisionPreviewResponse(payload)) {
        throw new Error("Decision preview response was unsafe or incomplete.");
      }

      setDecisionPreviewResult(payload);
      setDecisionPreviewStatus("success");
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (
        !isActiveDecisionPreviewRequest({
          requestId,
          reviewId: reviewIdForRequest,
          action: actionForRequest
        })
      ) {
        return;
      }

      setDecisionPreviewResult(null);
      setDecisionPreviewStatus("failure");
      setDecisionPreviewError(
        error instanceof Error
          ? error.message
          : "Decision preview dry-run failed safely."
      );
    }
  }

  function openDecisionExecutionConfirmation() {
    if (!executableDecisionPreview) {
      setDecisionExecutionStatus("failure");
      setDecisionExecutionError(
        "Run a successful current-version decision preview before execution confirmation."
      );
      return;
    }

    setDecisionExecutionConfirmation({
      reviewId: executableDecisionPreview.reviewId,
      action: executableDecisionPreview.action,
      expectedReviewVersion: executableDecisionPreview.observedReviewVersion,
      projectedNextState: executableDecisionPreview.projectedNextState,
      idempotencyKey: buildDecisionExecutionIdempotencyKey(
        executableDecisionPreview
      )
    });
    setDecisionExecutionStatus("confirming");
    setDecisionExecutionResult(null);
    setDecisionExecutionError("");
  }

  function cancelDecisionExecutionConfirmation() {
    invalidateDecisionExecutionRequest();
    resetDecisionExecutionState();
  }

  async function confirmDecisionExecution() {
    if (decisionExecutionStatus === "loading") {
      return;
    }

    if (!decisionExecutionConfirmation || !selectedReview) {
      setDecisionExecutionStatus("failure");
      setDecisionExecutionError(
        "Open the explicit in-memory execution confirmation before submitting."
      );
      return;
    }

    const confirmation = decisionExecutionConfirmation;
    const requestId = createDecisionExecutionRequest(confirmation);
    const activeAbortController = activeDecisionExecutionAbortRef.current;

    setDecisionExecutionStatus("loading");
    setDecisionExecutionError("");

    try {
      const response = await fetch(
        `/api/secretary/appointment-reviews/${encodeURIComponent(
          confirmation.reviewId
        )}/decision-execution`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({
            action: confirmation.action,
            expectedReviewVersion: confirmation.expectedReviewVersion,
            idempotencyKey: confirmation.idempotencyKey,
            confirmation: DECISION_EXECUTION_CONFIRMATION
          })
        }
      );
      const payload = await response.json();

      if (!isActiveDecisionExecutionRequest({ requestId, confirmation })) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            "Decision execution was blocked safely. Refresh and rerun preview for stale versions."
        );
      }

      if (!isSafeDecisionExecutionResponse(payload)) {
        throw new Error("Decision execution response was unsafe or incomplete.");
      }

      setDecisionExecutionResult(payload);
      setDecisionExecutionStatus("success");
      setDecisionExecutionConfirmation(null);
      invalidateOldVersionDecisionStateAfterExecution();
      await refreshAppointmentReviewsFromTrustedServer({
        preserveReviewId: payload.reviewId
      });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (!isActiveDecisionExecutionRequest({ requestId, confirmation })) {
        return;
      }

      setDecisionExecutionStatus("failure");
      setDecisionExecutionError(
        error instanceof Error
          ? error.message
          : "Decision execution failed safely. Refresh and rerun preview."
      );
    }
  }

  function createDecisionExecutionRequest(confirmation) {
    invalidateDecisionExecutionRequest();

    const requestId = decisionExecutionRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    decisionExecutionRequestSequenceRef.current = requestId;
    activeDecisionExecutionAbortRef.current = abortController;
    activeDecisionExecutionRequestRef.current = {
      requestId,
      ...confirmation
    };

    return requestId;
  }

  function invalidateDecisionExecutionRequest() {
    decisionExecutionRequestSequenceRef.current += 1;
    activeDecisionExecutionRequestRef.current = null;

    if (activeDecisionExecutionAbortRef.current) {
      activeDecisionExecutionAbortRef.current.abort();
      activeDecisionExecutionAbortRef.current = null;
    }
  }

  function isActiveDecisionExecutionRequest({ requestId, confirmation }) {
    const activeRequest = activeDecisionExecutionRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      activeRequest.reviewId === confirmation.reviewId &&
      activeRequest.action === confirmation.action &&
      activeRequest.expectedReviewVersion ===
        confirmation.expectedReviewVersion &&
      activeRequest.idempotencyKey === confirmation.idempotencyKey &&
      selectedReviewIdRef.current === confirmation.reviewId
    );
  }

  function openAppointmentCreationConfirmation() {
    if (!appointmentCreationCandidate) {
      setAppointmentCreationStatus("failure");
      setAppointmentCreationError(
        "Select a current approved review with a complete appointment candidate before creation confirmation."
      );
      return;
    }

    setAppointmentCreationConfirmation({
      reviewId: selectedReview.id,
      expectedReviewVersion: appointmentCreationCandidate.expectedReviewVersion,
      idempotencyKey: buildAppointmentCreationIdempotencyKey(
        selectedReview,
        appointmentCreationCandidate
      ),
      candidate: appointmentCreationCandidate
    });
    setAppointmentCreationStatus("confirming");
    setAppointmentCreationResult(null);
    setAppointmentCreationError("");
  }

  function cancelAppointmentCreationConfirmation() {
    invalidateAppointmentCreationRequest();
    resetAppointmentCreationState();
  }

  async function confirmAppointmentCreation() {
    if (appointmentCreationStatus === "loading") {
      return;
    }

    if (!appointmentCreationConfirmation || !selectedReview) {
      setAppointmentCreationStatus("failure");
      setAppointmentCreationError(
        "Open the explicit appointment creation confirmation before submitting."
      );
      return;
    }

    const confirmation = appointmentCreationConfirmation;
    const requestId = startAppointmentCreationRequest(confirmation);
    const activeAbortController = activeAppointmentCreationAbortRef.current;

    setAppointmentCreationStatus("loading");
    setAppointmentCreationError("");

    try {
      const response = await fetch(
        `/api/secretary/appointment-reviews/${encodeURIComponent(
          confirmation.reviewId
        )}/appointment-creation`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({
            expectedReviewVersion: confirmation.expectedReviewVersion,
            idempotencyKey: confirmation.idempotencyKey,
            confirmation: APPOINTMENT_CREATION_CONFIRMATION
          })
        }
      );
      const payload = await response.json();

      if (!isActiveAppointmentCreationRequest({ requestId, confirmation })) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            "Appointment creation was blocked safely. Refresh trusted review state."
        );
      }

      if (!isSafeAppointmentCreationResponse(payload)) {
        throw new Error(
          "Appointment creation response was unsafe or incomplete."
        );
      }

      setAppointmentCreationResult(payload);
      setAppointmentCreationStatus("success");
      setAppointmentCreationConfirmation(null);
      invalidateOldVersionStateAfterAppointmentCreation();
      await refreshAppointmentReviewsFromTrustedServer({
        preserveReviewId: payload.reviewId
      });
      await refreshCreatedAppointmentsFromTrustedServer();
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (!isActiveAppointmentCreationRequest({ requestId, confirmation })) {
        return;
      }

      setAppointmentCreationStatus("failure");
      setAppointmentCreationError(
        error instanceof Error
          ? error.message
          : "Appointment creation failed safely. Refresh trusted state."
      );
    }
  }

  function startAppointmentCreationRequest(confirmation) {
    invalidateAppointmentCreationRequest();

    const requestId = appointmentCreationRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    appointmentCreationRequestSequenceRef.current = requestId;
    activeAppointmentCreationAbortRef.current = abortController;
    activeAppointmentCreationRequestRef.current = {
      requestId,
      ...confirmation
    };

    return requestId;
  }

  function invalidateAppointmentCreationRequest() {
    appointmentCreationRequestSequenceRef.current += 1;
    activeAppointmentCreationRequestRef.current = null;

    if (activeAppointmentCreationAbortRef.current) {
      activeAppointmentCreationAbortRef.current.abort();
      activeAppointmentCreationAbortRef.current = null;
    }
  }

  function isActiveAppointmentCreationRequest({ requestId, confirmation }) {
    const activeRequest = activeAppointmentCreationRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      activeRequest.reviewId === confirmation.reviewId &&
      activeRequest.expectedReviewVersion ===
        confirmation.expectedReviewVersion &&
      activeRequest.idempotencyKey === confirmation.idempotencyKey &&
      selectedReviewIdRef.current === confirmation.reviewId
    );
  }

  function openCalendarSyncConfirmation(appointment) {
    if (!isCalendarSyncEligibleAppointment(appointment)) {
      setCalendarSyncStatus("failure");
      setCalendarSyncError(
        "Select an unsynced in-memory appointment with complete trusted calendar fields."
      );
      return;
    }

    setCalendarSyncConfirmation({
      appointmentId: appointment.id,
      expectedAppointmentVersion: appointment.version,
      idempotencyKey: buildCalendarSyncIdempotencyKey(appointment),
      appointment
    });
    setCalendarSyncStatus("confirming");
    setCalendarSyncResult(null);
    setCalendarSyncError("");
  }

  function cancelCalendarSyncConfirmation() {
    invalidateCalendarSyncRequest();
    resetCalendarSyncState();
  }

  async function confirmCalendarSync() {
    if (calendarSyncStatus === "loading") {
      return;
    }

    if (!calendarSyncConfirmation) {
      setCalendarSyncStatus("failure");
      setCalendarSyncError(
        "Open the explicit calendar sync confirmation before submitting."
      );
      return;
    }

    const confirmation = calendarSyncConfirmation;
    const requestId = startCalendarSyncRequest(confirmation);
    const activeAbortController = activeCalendarSyncAbortRef.current;

    setCalendarSyncStatus("loading");
    setCalendarSyncError("");

    try {
      const response = await fetch(
        `/api/secretary/appointments/${encodeURIComponent(
          confirmation.appointmentId
        )}/calendar-sync`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({
            expectedAppointmentVersion:
              confirmation.expectedAppointmentVersion,
            idempotencyKey: confirmation.idempotencyKey,
            confirmation: CALENDAR_SYNC_CONFIRMATION
          })
        }
      );
      const payload = await response.json();

      if (!isActiveCalendarSyncRequest({ requestId, confirmation })) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            "Calendar sync was blocked safely. Refresh trusted appointment state."
        );
      }

      if (!isSafeCalendarSyncResponse(payload)) {
        throw new Error("Calendar sync response was unsafe or incomplete.");
      }

      setCalendarSyncResult(payload);
      setCalendarSyncStatus("success");
      setCalendarSyncConfirmation(null);
      await refreshCreatedAppointmentsFromTrustedServer();
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (!isActiveCalendarSyncRequest({ requestId, confirmation })) {
        return;
      }

      setCalendarSyncStatus("failure");
      setCalendarSyncError(
        error instanceof Error
          ? error.message
          : "Calendar sync failed safely. Refresh trusted appointment state."
      );
    }
  }

  function startCalendarSyncRequest(confirmation) {
    invalidateCalendarSyncRequest();

    const requestId = calendarSyncRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    calendarSyncRequestSequenceRef.current = requestId;
    activeCalendarSyncAbortRef.current = abortController;
    activeCalendarSyncRequestRef.current = {
      requestId,
      ...confirmation
    };

    return requestId;
  }

  function invalidateCalendarSyncRequest() {
    calendarSyncRequestSequenceRef.current += 1;
    activeCalendarSyncRequestRef.current = null;

    if (activeCalendarSyncAbortRef.current) {
      activeCalendarSyncAbortRef.current.abort();
      activeCalendarSyncAbortRef.current = null;
    }
  }

  function isActiveCalendarSyncRequest({ requestId, confirmation }) {
    const activeRequest = activeCalendarSyncRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      activeRequest.appointmentId === confirmation.appointmentId &&
      activeRequest.expectedAppointmentVersion ===
        confirmation.expectedAppointmentVersion &&
      activeRequest.idempotencyKey === confirmation.idempotencyKey
    );
  }

  function openConfirmationDispatchConfirmation(appointment) {
    if (!isConfirmationDispatchEligibleAppointment(appointment)) {
      setConfirmationDispatchStatus("failure");
      setConfirmationDispatchError(
        "Select an unsent in-memory appointment with a trusted masked destination."
      );
      return;
    }

    setConfirmationDispatchConfirmation({
      appointmentId: appointment.id,
      expectedAppointmentVersion: appointment.version,
      idempotencyKey: buildConfirmationDispatchIdempotencyKey(appointment),
      appointment
    });
    setConfirmationDispatchStatus("confirming");
    setConfirmationDispatchResult(null);
    setConfirmationDispatchError("");
  }

  function cancelConfirmationDispatchConfirmation() {
    invalidateConfirmationDispatchRequest();
    resetConfirmationDispatchState();
  }

  async function confirmAppointmentConfirmationDispatch() {
    if (confirmationDispatchStatus === "loading") {
      return;
    }

    if (!confirmationDispatchConfirmation) {
      setConfirmationDispatchStatus("failure");
      setConfirmationDispatchError(
        "Open the explicit appointment confirmation before submitting."
      );
      return;
    }

    const confirmation = confirmationDispatchConfirmation;
    const requestId = startConfirmationDispatchRequest(confirmation);
    const activeAbortController = activeConfirmationDispatchAbortRef.current;

    setConfirmationDispatchStatus("loading");
    setConfirmationDispatchError("");

    try {
      const response = await fetch(
        `/api/secretary/appointments/${encodeURIComponent(
          confirmation.appointmentId
        )}/confirmation-message`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({
            expectedAppointmentVersion:
              confirmation.expectedAppointmentVersion,
            idempotencyKey: confirmation.idempotencyKey,
            confirmation: APPOINTMENT_CONFIRMATION_DISPATCH_CONFIRMATION
          })
        }
      );
      const payload = await response.json();

      if (!isActiveConfirmationDispatchRequest({ requestId, confirmation })) {
        return;
      }

      if (!response.ok) {
        if (isSafeConfirmationDispatchResponse(payload)) {
          setConfirmationDispatchResult(payload);
        }

        throw new Error(
          payload?.reason ||
            "Appointment confirmation dispatch was blocked safely. Refresh trusted appointment state."
        );
      }

      if (!isSafeConfirmationDispatchResponse(payload)) {
        throw new Error(
          "Appointment confirmation dispatch response was unsafe or incomplete."
        );
      }

      setConfirmationDispatchResult(payload);
      setConfirmationDispatchStatus("success");
      setConfirmationDispatchConfirmation(null);
      await refreshCreatedAppointmentsFromTrustedServer();
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (!isActiveConfirmationDispatchRequest({ requestId, confirmation })) {
        return;
      }

      setConfirmationDispatchStatus("failure");
      setConfirmationDispatchError(
        error instanceof Error
          ? error.message
          : "Appointment confirmation dispatch failed safely."
      );
    }
  }

  function startConfirmationDispatchRequest(confirmation) {
    invalidateConfirmationDispatchRequest();

    const requestId = confirmationDispatchRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    confirmationDispatchRequestSequenceRef.current = requestId;
    activeConfirmationDispatchAbortRef.current = abortController;
    activeConfirmationDispatchRequestRef.current = {
      requestId,
      ...confirmation
    };

    return requestId;
  }

  function invalidateConfirmationDispatchRequest() {
    confirmationDispatchRequestSequenceRef.current += 1;
    activeConfirmationDispatchRequestRef.current = null;

    if (activeConfirmationDispatchAbortRef.current) {
      activeConfirmationDispatchAbortRef.current.abort();
      activeConfirmationDispatchAbortRef.current = null;
    }
  }

  function isActiveConfirmationDispatchRequest({ requestId, confirmation }) {
    const activeRequest = activeConfirmationDispatchRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      activeRequest.appointmentId === confirmation.appointmentId &&
      activeRequest.expectedAppointmentVersion ===
        confirmation.expectedAppointmentVersion &&
      activeRequest.idempotencyKey === confirmation.idempotencyKey
    );
  }

  async function openAppointmentLifecycleConfirmation(appointment, operation) {
    setAppointmentLifecycleStatus("loading");
    setAppointmentLifecycleError("");
    setAppointmentLifecycleResult(null);
    setAppointmentLifecycleConfirmation(null);

    try {
      const preview = await prepareLifecyclePreview(
        appointment,
        operation
      );

      if (!preview.accepted) {
        throw new Error(
          preview.reason || "Appointment lifecycle preview was blocked safely."
        );
      }

      const selectedSlot =
        operation === "reschedule"
          ? preview.proposedSlot || preview.proposedSlots?.[0] || null
          : null;

      if (operation === "reschedule" && !selectedSlot?.id) {
        throw new Error("No trusted replacement slot is currently available.");
      }

      setAppointmentLifecycleConfirmation({
        appointment,
        operation,
        preview,
        selectedSlotId: selectedSlot?.id || "",
        expectedAppointmentVersion: appointment.version,
        idempotencyKey: buildAppointmentLifecycleIdempotencyKey(
          appointment,
          operation,
          selectedSlot?.id
        )
      });
      setAppointmentLifecycleStatus("confirming");
    } catch (error) {
      setAppointmentLifecycleStatus("failure");
      setAppointmentLifecycleError(
        error instanceof Error
          ? error.message
          : "Appointment lifecycle preview failed safely."
      );
    }
  }

  async function prepareLifecyclePreview(appointment, operation) {
    if (operation === "calendar_reschedule" || operation === "calendar_cancellation") {
      return { accepted: true, preview: true };
    }
    if (
      operation === "reschedule_notification" ||
      operation === "cancellation_notification"
    ) {
      return { accepted: true, preview: true };
    }

    const endpoint =
      operation === "reschedule"
        ? "reschedule-preview"
        : "cancellation-preview";
    const response = await fetch(
      `/api/secretary/appointments/${encodeURIComponent(
        appointment.id
      )}/${endpoint}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          expectedAppointmentVersion: appointment.version
        })
      }
    );
    return response.json();
  }

  function cancelAppointmentLifecycleConfirmation() {
    setAppointmentLifecycleStatus("idle");
    setAppointmentLifecycleError("");
    setAppointmentLifecycleResult(null);
    setAppointmentLifecycleConfirmation(null);
  }

  async function confirmAppointmentLifecycleOperation() {
    if (!appointmentLifecycleConfirmation) {
      setAppointmentLifecycleStatus("failure");
      setAppointmentLifecycleError(
        "Open an explicit appointment lifecycle confirmation before submitting."
      );
      return;
    }

    const confirmation = appointmentLifecycleConfirmation;
    setAppointmentLifecycleStatus("loading");
    setAppointmentLifecycleError("");

    try {
      const response = await fetch(
        `/api/secretary/appointments/${encodeURIComponent(
          confirmation.appointment.id
        )}/${getAppointmentLifecycleEndpoint(confirmation.operation)}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            expectedAppointmentVersion:
              confirmation.expectedAppointmentVersion,
            selectedSlotId: confirmation.selectedSlotId || undefined,
            idempotencyKey: confirmation.idempotencyKey,
            confirmation: getAppointmentLifecycleConfirmation(
              confirmation.operation
            )
          })
        }
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.reason || "Appointment lifecycle operation was blocked safely."
        );
      }

      setAppointmentLifecycleResult(payload);
      setAppointmentLifecycleStatus("success");
      setAppointmentLifecycleConfirmation(null);
      await refreshCreatedAppointmentsFromTrustedServer();
      await refreshAppointmentLifecycleEvents(confirmation.appointment.id);
    } catch (error) {
      setAppointmentLifecycleStatus("failure");
      setAppointmentLifecycleError(
        error instanceof Error
          ? error.message
          : "Appointment lifecycle operation failed safely."
      );
    }
  }

  async function refreshAppointmentLifecycleEvents(appointmentId) {
    const response = await fetch(
      `/api/secretary/appointments/${encodeURIComponent(appointmentId)}/lifecycle`
    );
    const payload = await response.json();

    if (!response.ok || !Array.isArray(payload.lifecycleEvents)) {
      throw new Error("Appointment lifecycle timeline refresh failed safely.");
    }

    setAppointmentLifecycleEventsById((current) => ({
      ...current,
      [appointmentId]: payload.lifecycleEvents
    }));
  }

  function createDecisionPreviewRequest({ reviewId, action }) {
    invalidateDecisionPreviewRequest();

    const requestId = decisionPreviewRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    decisionPreviewRequestSequenceRef.current = requestId;
    activeDecisionPreviewAbortRef.current = abortController;
    activeDecisionPreviewRequestRef.current = {
      requestId,
      reviewId,
      action
    };

    return requestId;
  }

  function invalidateDecisionPreviewRequest() {
    decisionPreviewRequestSequenceRef.current += 1;
    activeDecisionPreviewRequestRef.current = null;

    if (activeDecisionPreviewAbortRef.current) {
      activeDecisionPreviewAbortRef.current.abort();
      activeDecisionPreviewAbortRef.current = null;
    }
  }

  function isActiveDecisionPreviewRequest({ requestId, reviewId, action }) {
    const activeRequest = activeDecisionPreviewRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      activeRequest.reviewId === reviewId &&
      activeRequest.action === action &&
      selectedReviewIdRef.current === reviewId
    );
  }

  async function runDecisionComparison() {
    if (decisionComparisonStatus === "loading") {
      return;
    }

    if (!selectedReview) {
      setDecisionComparisonStatus("failure");
      setDecisionComparisonResult(null);
      setDecisionComparisonError(
        "Select a review before running decision path comparison dry-run."
      );
      return;
    }

    const reviewIdForRequest = selectedReview.id;
    const requestId = createDecisionComparisonRequest({
      reviewId: reviewIdForRequest
    });
    const activeAbortController = activeDecisionComparisonAbortRef.current;

    setDecisionComparisonStatus("loading");
    setDecisionComparisonResult(null);
    setDecisionComparisonError("");

    try {
      const response = await fetch(
        `/api/secretary/appointment-reviews/${encodeURIComponent(
          reviewIdForRequest
        )}/decision-comparison`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({})
        }
      );
      const payload = await response.json();

      if (
        !isActiveDecisionComparisonRequest({
          requestId,
          reviewId: reviewIdForRequest
        })
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            payload?.error?.message ||
            "Decision path comparison dry-run failed safely."
        );
      }

      if (!isSafeDecisionComparisonResponse(payload)) {
        throw new Error(
          "Decision path comparison response was unsafe or incomplete."
        );
      }

      invalidateResolutionGuidanceRequest();
      resetResolutionGuidanceState();
      setDecisionComparisonResult(payload);
      setDecisionComparisonStatus("success");
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (
        !isActiveDecisionComparisonRequest({
          requestId,
          reviewId: reviewIdForRequest
        })
      ) {
        return;
      }

      setDecisionComparisonResult(null);
      setDecisionComparisonStatus("failure");
      setDecisionComparisonError(
        error instanceof Error
          ? error.message
          : "Decision path comparison dry-run failed safely."
      );
    }
  }

  function createDecisionComparisonRequest({ reviewId }) {
    invalidateDecisionPreviewRequest();
    invalidateDecisionComparisonRequest();
    invalidateResolutionGuidanceRequest();
    resetResolutionGuidanceState();

    const requestId = decisionComparisonRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    decisionComparisonRequestSequenceRef.current = requestId;
    activeDecisionComparisonAbortRef.current = abortController;
    activeDecisionComparisonRequestRef.current = {
      requestId,
      reviewId
    };

    return requestId;
  }

  function invalidateDecisionComparisonRequest() {
    decisionComparisonRequestSequenceRef.current += 1;
    activeDecisionComparisonRequestRef.current = null;

    if (activeDecisionComparisonAbortRef.current) {
      activeDecisionComparisonAbortRef.current.abort();
      activeDecisionComparisonAbortRef.current = null;
    }
  }

  function isActiveDecisionComparisonRequest({ requestId, reviewId }) {
    const activeRequest = activeDecisionComparisonRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      activeRequest.reviewId === reviewId &&
      selectedReviewIdRef.current === reviewId
    );
  }

  async function runResolutionGuidancePreview() {
    if (resolutionGuidanceStatus === "loading") {
      return;
    }

    if (!selectedReview) {
      setResolutionGuidanceStatus("failure");
      setResolutionGuidanceResult(null);
      setResolutionGuidanceError(
        "Select a review before generating resolution guidance preview."
      );
      return;
    }

    const reviewIdForRequest = selectedReview.id;
    const requestId = createResolutionGuidanceRequest({
      reviewId: reviewIdForRequest
    });
    const activeAbortController = activeResolutionGuidanceAbortRef.current;

    setResolutionGuidanceStatus("loading");
    setResolutionGuidanceError("");

    try {
      const response = await fetch(
        `/api/secretary/appointment-reviews/${encodeURIComponent(
          reviewIdForRequest
        )}/resolution-guidance-preview`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({})
        }
      );
      const payload = await response.json();

      if (
        !isActiveResolutionGuidanceRequest({
          requestId,
          reviewId: reviewIdForRequest
        })
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            payload?.error?.message ||
            "Resolution guidance preview failed safely."
        );
      }

      if (!isSafeResolutionGuidanceResponse(payload)) {
        throw new Error(
          "Resolution guidance preview response was unsafe or incomplete."
        );
      }

      setResolutionGuidanceResult(payload);
      setResolutionChecklistSession((currentSession) =>
        createResolutionChecklistSession(payload, currentSession)
      );
      setResolutionGuidanceStatus("success");
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (
        !isActiveResolutionGuidanceRequest({
          requestId,
          reviewId: reviewIdForRequest
        })
      ) {
        return;
      }

      setResolutionGuidanceStatus("failure");
      setResolutionGuidanceError(
        error instanceof Error
          ? error.message
          : "Resolution guidance preview failed safely."
      );
    }
  }

  function createResolutionGuidanceRequest({ reviewId }) {
    invalidateDecisionPreviewRequest();
    invalidateDecisionComparisonRequest();
    invalidateResolutionGuidanceRequest();

    const requestId = resolutionGuidanceRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    resolutionGuidanceRequestSequenceRef.current = requestId;
    activeResolutionGuidanceAbortRef.current = abortController;
    activeResolutionGuidanceRequestRef.current = {
      requestId,
      reviewId
    };

    return requestId;
  }

  function invalidateResolutionGuidanceRequest() {
    resolutionGuidanceRequestSequenceRef.current += 1;
    activeResolutionGuidanceRequestRef.current = null;

    if (activeResolutionGuidanceAbortRef.current) {
      activeResolutionGuidanceAbortRef.current.abort();
      activeResolutionGuidanceAbortRef.current = null;
    }
  }

  function resetResolutionGuidanceState() {
    setResolutionGuidanceStatus("idle");
    setResolutionGuidanceResult(null);
    setResolutionGuidanceError("");
    setResolutionChecklistSession(createResolutionChecklistSession(null));
  }

  function toggleResolutionChecklistReview({ branchName, itemCode }) {
    setResolutionChecklistSession((currentSession) =>
      toggleResolutionChecklistItem(currentSession, {
        branchName,
        itemCode
      })
    );
  }

  function clearLocalResolutionChecklist() {
    setResolutionChecklistSession((currentSession) =>
      clearResolutionChecklistSession(currentSession)
    );
  }

  function isActiveResolutionGuidanceRequest({ requestId, reviewId }) {
    const activeRequest = activeResolutionGuidanceRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      activeRequest.reviewId === reviewId &&
      selectedReviewIdRef.current === reviewId
    );
  }

  async function runQueueReadinessPreview() {
    if (queueReadinessStatus === "loading") {
      return;
    }

    const reviewIdsForRequest = currentReviewIds;
    const requestId = createQueueReadinessRequest({
      reviewIds: reviewIdsForRequest
    });
    const activeAbortController = activeQueueReadinessAbortRef.current;

    setQueueReadinessStatus("loading");
    setQueueReadinessResult(null);
    setQueueReadinessError("");

    try {
      const response = await fetch(
        "/api/secretary/appointment-reviews/decision-readiness-preview",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({})
        }
      );
      const payload = await response.json();

      if (
        !isActiveQueueReadinessRequest({
          requestId,
          reviewIds: reviewIdsForRequest
        })
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            payload?.error?.message ||
            "Queue readiness scan failed safely."
        );
      }

      if (!isSafeQueueReadinessResponse(payload)) {
        throw new Error("Queue readiness response was unsafe or incomplete.");
      }

      setQueueReadinessResult(payload);
      setQueueReadinessStatus("success");
      setQueueReadinessFilter("all");
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (
        !isActiveQueueReadinessRequest({
          requestId,
          reviewIds: reviewIdsForRequest
        })
      ) {
        return;
      }

      setQueueReadinessResult(null);
      setQueueReadinessStatus("failure");
      setQueueReadinessError(
        error instanceof Error
          ? error.message
          : "Queue readiness scan failed safely."
      );
    }
  }

  function createQueueReadinessRequest({ reviewIds }) {
    invalidateQueueReadinessRequest();

    const requestId = queueReadinessRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    queueReadinessRequestSequenceRef.current = requestId;
    activeQueueReadinessAbortRef.current = abortController;
    activeQueueReadinessRequestRef.current = {
      requestId,
      reviewIds: [...reviewIds]
    };

    return requestId;
  }

  function invalidateQueueReadinessRequest() {
    queueReadinessRequestSequenceRef.current += 1;
    activeQueueReadinessRequestRef.current = null;

    if (activeQueueReadinessAbortRef.current) {
      activeQueueReadinessAbortRef.current.abort();
      activeQueueReadinessAbortRef.current = null;
    }
  }

  function resetQueueReadinessState() {
    setQueueReadinessStatus("idle");
    setQueueReadinessResult(null);
    setQueueReadinessError("");
    setQueueReadinessFilter("all");
  }

  function isActiveQueueReadinessRequest({ requestId, reviewIds }) {
    const activeRequest = activeQueueReadinessRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      reviewIdsMatch(activeRequest.reviewIds, reviewIds) &&
      reviewIdsMatch(currentReviewIds, reviewIds)
    );
  }

  async function runShiftHandoffPreview() {
    if (shiftHandoffStatus === "loading") {
      return;
    }

    const reviewIdsForRequest = currentReviewIds;
    const requestId = createShiftHandoffRequest({
      reviewIds: reviewIdsForRequest
    });
    const activeAbortController = activeShiftHandoffAbortRef.current;

    setShiftHandoffStatus("loading");
    setShiftHandoffResult(null);
    setShiftHandoffError("");
    setShiftHandoffCopyStatus("idle");

    try {
      const response = await fetch(
        "/api/secretary/appointment-reviews/shift-handoff-preview",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({})
        }
      );
      const payload = await response.json();

      if (
        !isActiveShiftHandoffRequest({
          requestId,
          reviewIds: reviewIdsForRequest
        })
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            payload?.error?.message ||
            "Shift handoff preview failed safely."
        );
      }

      if (!isSafeShiftHandoffResponse(payload)) {
        throw new Error("Shift handoff response was unsafe or incomplete.");
      }

      setShiftHandoffResult(payload);
      setShiftHandoffStatus("success");
      setFollowUpBoardStatus("idle");
      setFollowUpBoardError("");
      setFollowUpBoardMessage(
        "Trusted handoff data is available for the follow-up focus board."
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (
        !isActiveShiftHandoffRequest({
          requestId,
          reviewIds: reviewIdsForRequest
        })
      ) {
        return;
      }

      setShiftHandoffResult(null);
      setShiftHandoffStatus("failure");
      setFollowUpBoardStatus("idle");
      setShiftHandoffError(
        error instanceof Error
          ? error.message
          : "Shift handoff preview failed safely."
      );
    }
  }

  async function loadFollowUpFocusBoard({ forceRefresh = false } = {}) {
    if (followUpBoardStatus === "loading" || shiftHandoffStatus === "loading") {
      return;
    }

    if (!forceRefresh && currentShiftHandoffResult) {
      setFollowUpBoardStatus("success");
      setFollowUpBoardError("");
      setFollowUpBoardMessage(
        "Operational follow-up board opened from the current trusted handoff preview."
      );
      resetInvalidFollowUpCategoryFilter(followUpFocusBoard);
      return;
    }

    const reviewIdsForRequest = currentReviewIds;
    const requestId = createShiftHandoffRequest({
      reviewIds: reviewIdsForRequest
    });
    const activeAbortController = activeShiftHandoffAbortRef.current;

    setFollowUpBoardStatus("loading");
    setFollowUpBoardError("");
    setFollowUpBoardMessage("");
    setShiftHandoffStatus("loading");
    setShiftHandoffResult(null);
    setShiftHandoffError("");
    setShiftHandoffCopyStatus("idle");

    try {
      const response = await fetch(
        "/api/secretary/appointment-reviews/shift-handoff-preview",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          signal: activeAbortController?.signal,
          body: JSON.stringify({})
        }
      );
      const payload = await response.json();

      if (
        !isActiveShiftHandoffRequest({
          requestId,
          reviewIds: reviewIdsForRequest
        })
      ) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.reason ||
            payload?.error?.message ||
            "Operational follow-up board refresh failed safely."
        );
      }

      if (!isSafeShiftHandoffResponse(payload)) {
        throw new Error("Follow-up board source handoff response was unsafe.");
      }

      setShiftHandoffResult(payload);
      setShiftHandoffStatus("success");
      setFollowUpBoardStatus("success");
      setFollowUpBoardMessage(
        "Operational follow-up board loaded from the existing shift handoff preview route."
      );
      resetInvalidFollowUpCategoryFilter(
        buildAppointmentReviewFollowUpFocusBoard(payload, {
          categoryFilter: followUpBoardCategoryFilter,
          sessionFilter: followUpBoardSessionFilter,
          guidedSession: guidedReviewSession
        })
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (
        !isActiveShiftHandoffRequest({
          requestId,
          reviewIds: reviewIdsForRequest
        })
      ) {
        return;
      }

      setShiftHandoffResult(null);
      setShiftHandoffStatus("failure");
      setFollowUpBoardStatus("failure");
      setFollowUpBoardError(
        error instanceof Error
          ? error.message
          : "Operational follow-up board refresh failed safely."
      );
      setShiftHandoffError(
        error instanceof Error
          ? error.message
          : "Shift handoff preview failed safely."
      );
    }
  }

  function resetInvalidFollowUpCategoryFilter(board) {
    if (
      followUpBoardCategoryFilter !== FOLLOW_UP_CATEGORY_FILTER_ALL &&
      !board.categories.some(
        (category) => category.code === followUpBoardCategoryFilter
      )
    ) {
      setFollowUpBoardCategoryFilter(FOLLOW_UP_CATEGORY_FILTER_ALL);
    }
  }

  function clearFollowUpFocusFilters() {
    setFollowUpBoardCategoryFilter(FOLLOW_UP_CATEGORY_FILTER_ALL);
    setFollowUpBoardSessionFilter(GUIDED_SESSION_FILTERS.ALL);
    setFollowUpBoardMessage(
      "Operational follow-up focus filters cleared locally."
    );
  }

  function resetFollowUpBoardState() {
    setFollowUpBoardStatus("idle");
    setFollowUpBoardError("");
    setFollowUpBoardMessage("");
    setFollowUpBoardCategoryFilter(FOLLOW_UP_CATEGORY_FILTER_ALL);
    setFollowUpBoardSessionFilter(GUIDED_SESSION_FILTERS.ALL);
  }

  function openNextUnreviewedInFollowUpFocus() {
    if (!currentShiftHandoffResult) {
      setFollowUpBoardMessage(
        "Load the operational follow-up board before opening the next focused review."
      );
      return;
    }

    const nextReviewId = findNextUnreviewedAppointmentReviewInFocus(
      followUpFocusBoard,
      {
        selectedReviewId
      }
    );

    if (!nextReviewId) {
      setFollowUpBoardMessage(
        "No unreviewed reviews remain in the current follow-up focus."
      );
      return;
    }

    setSelectedReviewId(nextReviewId);
    setFollowUpBoardMessage(
      "Opened the next unreviewed review in the current follow-up focus."
    );
  }

  function createShiftHandoffRequest({ reviewIds }) {
    invalidateShiftHandoffRequest();

    const requestId = shiftHandoffRequestSequenceRef.current + 1;
    const abortController = new AbortController();

    shiftHandoffRequestSequenceRef.current = requestId;
    activeShiftHandoffAbortRef.current = abortController;
    activeShiftHandoffRequestRef.current = {
      requestId,
      reviewIds: [...reviewIds]
    };

    return requestId;
  }

  function invalidateShiftHandoffRequest() {
    shiftHandoffRequestSequenceRef.current += 1;
    activeShiftHandoffRequestRef.current = null;

    if (activeShiftHandoffAbortRef.current) {
      activeShiftHandoffAbortRef.current.abort();
      activeShiftHandoffAbortRef.current = null;
    }
  }

  function resetShiftHandoffState() {
    setShiftHandoffStatus("idle");
    setShiftHandoffResult(null);
    setShiftHandoffError("");
    setShiftHandoffCopyStatus("idle");
  }

  function isActiveShiftHandoffRequest({ requestId, reviewIds }) {
    const activeRequest = activeShiftHandoffRequestRef.current;

    return (
      isMountedRef.current &&
      activeRequest &&
      activeRequest.requestId === requestId &&
      reviewIdsMatch(activeRequest.reviewIds, reviewIds) &&
      reviewIdsMatch(currentReviewIds, reviewIds)
    );
  }

  async function copyShiftHandoffBrief() {
    const brief = shiftHandoffResult?.plainTextBrief;

    if (!brief || typeof brief !== "string") {
      setShiftHandoffCopyStatus("No local brief is available to copy.");
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setShiftHandoffCopyStatus(
        "Clipboard is unavailable. Select the visible brief manually."
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(brief);
      setShiftHandoffCopyStatus("Copied locally");
    } catch {
      setShiftHandoffCopyStatus(
        "Clipboard copy failed safely. Select the visible brief manually."
      );
    }
  }

  function startGuidedReviewSession() {
    setGuidedReviewSession(initializeAppointmentReviewGuidedSession(reviews));
    setGuidedReviewSessionFilter(GUIDED_SESSION_FILTERS.ALL);
    setGuidedReviewSessionMessage(
      reviews.length > 0
        ? "Guided review session started locally for the current queue."
        : "Guided review session started locally with an empty queue."
    );
  }

  function resetGuidedReviewSession() {
    setGuidedReviewSession(getEmptyAppointmentReviewGuidedSession());
    setGuidedReviewSessionFilter(GUIDED_SESSION_FILTERS.ALL);
    setGuidedReviewSessionMessage(
      "Guided review session reset locally. Server queue and previews were not changed."
    );
  }

  function markSelectedReviewReviewedLocally() {
    if (!selectedReview || !guidedReviewSession.active) {
      setGuidedReviewSessionMessage(
        "Start a guided review session and select a review before marking it locally."
      );
      return;
    }

    setGuidedReviewSession((currentSession) =>
      markAppointmentReviewGuidedSessionItem(currentSession, selectedReview)
    );
    setGuidedReviewSessionMessage(
      "Selected review marked reviewed locally for this workspace session only."
    );
  }

  function markSelectedReviewUnreviewedLocally() {
    if (!selectedReview || !guidedReviewSession.active) {
      setGuidedReviewSessionMessage(
        "Start a guided review session and select a review before clearing a local mark."
      );
      return;
    }

    setGuidedReviewSession((currentSession) =>
      clearAppointmentReviewGuidedSessionItem(currentSession, selectedReview)
    );
    setGuidedReviewSessionMessage(
      "Selected review local mark cleared. Server state was not changed."
    );
  }

  function openNextUnreviewedReview() {
    const nextReviewId = findNextUnreviewedAppointmentReviewId(
      guidedReviewSession,
      {
        selectedReviewId
      }
    );

    if (!nextReviewId) {
      setGuidedReviewSessionMessage(
        guidedReviewSession.active
          ? "No unreviewed session reviews remain. Local session progress is complete."
          : "Start a guided review session before opening the next unreviewed review."
      );
      return;
    }

    setSelectedReviewId(nextReviewId);
    setGuidedReviewSessionMessage(
      "Opened the next unreviewed review in queue order. Navigation wraps to the beginning when needed."
    );
  }

  return (
    <section
      className="appointment-reviews-workspace-section"
      aria-labelledby="appointment-reviews-workspace-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Secretary workspace</p>
          <h2 id="appointment-reviews-workspace-title">
            Pending Appointment Reviews
          </h2>
          <p>
            AI mesajlaşmadan gelen slot seçimlerini mock ve read-only sırada
            gösterir; gerçek randevu oluşturmaz.
          </p>
        </div>
        <span className="status-pill">Mock read-only</span>
      </div>

      <article className="appointment-reviews-workspace-card">
        <div className="appointment-reviews-summary-grid">
          <div>
            <span>Kaynak</span>
            <strong>{summary.source}</strong>
          </div>
          <div>
            <span>Mod</span>
            <strong>{summary.mode}</strong>
          </div>
          <div>
            <span>Kayıt</span>
            <strong>{summary.persistence}</strong>
          </div>
          <div>
            <span>Bekleyen inceleme</span>
            <strong>{reviews.length}</strong>
          </div>
        </div>

        <div className="appointment-reviews-safety-note">
          <strong>Read-only mock queue</strong>
          <span>
            No booking created. Calendar not checked. Secretary confirmation is
            required before any real booking workflow.
          </span>
          <small>
            Safety contract: bookingCreated=
            {String(summary.safety?.bookingCreated === true)}, calendarChecked=
            {String(summary.safety?.calendarChecked === true)}, usesDatabase=
            {String(summary.safety?.usesDatabase === true)}.
          </small>
        </div>

        {!loading && !loadError ? (
          <section
            className="appointment-review-guided-session"
            aria-labelledby="appointment-review-guided-session-title"
          >
            <div>
              <span>Local guided session · Not persisted</span>
              <h3 id="appointment-review-guided-session-title">
                Guided Review Session
              </h3>
              <p>
                Tracks which reviews were inspected locally during this
                component session. Local marks do not approve, reject, validate,
                authorize, execute, persist, book, check calendar availability,
                or change trusted review state.
              </p>
            </div>

            <div className="appointment-review-guided-session-controls">
              <button
                type="button"
                className="appointment-review-guided-session-button"
                onClick={startGuidedReviewSession}
              >
                Start Guided Review Session
              </button>
              <button
                type="button"
                className="appointment-review-guided-session-button"
                onClick={markSelectedReviewReviewedLocally}
                disabled={
                  !guidedReviewSession.active ||
                  !selectedReview ||
                  selectedGuidedSessionItem?.reviewedLocally === true
                }
              >
                Mark Reviewed Locally
              </button>
              <button
                type="button"
                className="appointment-review-guided-session-button secondary"
                onClick={markSelectedReviewUnreviewedLocally}
                disabled={
                  !guidedReviewSession.active ||
                  !selectedReview ||
                  selectedGuidedSessionItem?.reviewedLocally !== true
                }
              >
                Mark as Unreviewed Locally
              </button>
              <button
                type="button"
                className="appointment-review-guided-session-button secondary"
                onClick={openNextUnreviewedReview}
                disabled={!guidedReviewSession.active}
              >
                Open Next Unreviewed Review
              </button>
              <button
                type="button"
                className="appointment-review-guided-session-button secondary"
                onClick={resetGuidedReviewSession}
                disabled={!guidedReviewSession.active}
              >
                Reset Local Session
              </button>
              <label>
                Session filter
                <select
                  value={guidedReviewSessionFilter}
                  onChange={(event) =>
                    setGuidedReviewSessionFilter(event.target.value)
                  }
                >
                  {GUIDED_SESSION_FILTER_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="appointment-review-guided-session-state">
              {guidedReviewSession.active
                ? `${guidedReviewSession.totals.progressText}. ${guidedReviewSession.totals.remaining} remaining.`
                : "No guided review session is active."}
              {guidedReviewSession.totals.stale > 0
                ? ` ${guidedReviewSession.totals.stale} version reset.`
                : null}
              {guidedReviewSession.versionChangeNotice
                ? ` ${guidedReviewSession.versionChangeNotice}`
                : null}
              {guidedReviewSessionMessage
                ? ` ${guidedReviewSessionMessage}`
                : null}
            </p>

            <dl className="appointment-review-guided-session-summary">
              <div>
                <dt>Total session reviews</dt>
                <dd>{guidedReviewSession.totals.total}</dd>
              </div>
              <div>
                <dt>Reviewed locally</dt>
                <dd>{guidedReviewSession.totals.reviewed}</dd>
              </div>
              <div>
                <dt>Remaining</dt>
                <dd>{guidedReviewSession.totals.remaining}</dd>
              </div>
              <div>
                <dt>Version reset</dt>
                <dd>{guidedReviewSession.totals.stale}</dd>
              </div>
              <div>
                <dt>Selected local status</dt>
                <dd>
                  {selectedGuidedSessionItem?.status ||
                    (guidedReviewSession.active ? "not_in_session" : "inactive")}
                </dd>
              </div>
              <div>
                <dt>Session persistence</dt>
                <dd>{String(guidedReviewSession.persisted === true)}</dd>
              </div>
            </dl>

            <small>
              Readiness and session filters combine locally: a row must match
              both selected filters. Session marks are not sent to preview,
              comparison, readiness, guidance, handoff, collection, or detail
              routes.
            </small>
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-queue-readiness"
            aria-labelledby="appointment-review-queue-readiness-title"
          >
            <div>
              <span>Queue-wide dry-run · No recommendation</span>
              <h3 id="appointment-review-queue-readiness-title">
                Queue Readiness Scan
              </h3>
              <p>
                Scans the server-side review queue and compares approve/reject
                dry-run paths for each item. It does not recommend, select,
                execute, persist, book, or check calendar availability.
              </p>
            </div>

            <div className="appointment-review-queue-readiness-controls">
              <button
                type="button"
                className="appointment-review-queue-readiness-button"
                onClick={runQueueReadinessPreview}
                disabled={queueReadinessStatus === "loading"}
              >
                Run Queue Readiness Scan
              </button>
              <label>
                Readiness filter
                <select
                  value={queueReadinessFilter}
                  onChange={(event) =>
                    setQueueReadinessFilter(event.target.value)
                  }
                >
                  {QUEUE_READINESS_FILTERS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="appointment-review-queue-readiness-state">
              {queueReadinessStatus === "loading"
                ? "Queue readiness scan is running. Duplicate scans are ignored."
                : null}
              {queueReadinessStatus === "success"
                ? "Queue readiness scan result received. Queue rows are annotated without changing review state."
                : null}
              {queueReadinessStatus === "failure"
                ? queueReadinessError ||
                  "Queue readiness scan failed safely."
                : null}
              {queueReadinessStatus === "idle"
                ? "Idle: no queue readiness scan result for the current queue."
                : null}
            </p>

            <dl className="appointment-review-queue-readiness-summary">
              <div>
                <dt>Total scanned</dt>
                <dd>
                  {displayedQueueReadiness.summary.totalReviewsScanned}
                </dd>
              </div>
              <div>
                <dt>Both paths available</dt>
                <dd>{displayedQueueReadiness.summary.bothPathsAvailable}</dd>
              </div>
              <div>
                <dt>Approve path only</dt>
                <dd>{displayedQueueReadiness.summary.approvePathOnly}</dd>
              </div>
              <div>
                <dt>Reject path only</dt>
                <dd>{displayedQueueReadiness.summary.rejectPathOnly}</dd>
              </div>
              <div>
                <dt>Both paths blocked</dt>
                <dd>{displayedQueueReadiness.summary.bothPathsBlocked}</dd>
              </div>
              <div>
                <dt>persistence</dt>
                <dd>{displayedQueueReadiness.persistence}</dd>
              </div>
              <div>
                <dt>executionEnabled</dt>
                <dd>{String(displayedQueueReadiness.executionEnabled)}</dd>
              </div>
              <div>
                <dt>queueMutated</dt>
                <dd>{String(displayedQueueReadiness.queueMutated)}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-shift-handoff"
            aria-labelledby="appointment-review-shift-handoff-title"
          >
            <div>
              <span>Internal handoff preview · Not sent</span>
              <h3 id="appointment-review-shift-handoff-title">
                Secretary Shift Handoff Brief
              </h3>
              <p>
                Generates a server-controlled internal brief from the trusted
                queue. It does not recommend a decision, perform actions, save
                the handoff, send messages, book appointments, or check calendar
                availability.
              </p>
            </div>

            <div className="appointment-review-shift-handoff-controls">
              <button
                type="button"
                className="appointment-review-shift-handoff-button"
                onClick={runShiftHandoffPreview}
                disabled={shiftHandoffStatus === "loading"}
              >
                Generate Shift Handoff Preview
              </button>
              <button
                type="button"
                className="appointment-review-shift-handoff-button secondary"
                onClick={copyShiftHandoffBrief}
                disabled={
                  shiftHandoffStatus === "loading" ||
                  !shiftHandoffResult?.plainTextBrief
                }
              >
                Copy Internal Brief
              </button>
            </div>

            <p className="appointment-review-shift-handoff-state">
              {shiftHandoffStatus === "loading"
                ? "Shift handoff preview is running. Duplicate requests are ignored."
                : null}
              {shiftHandoffStatus === "success"
                ? "Shift handoff preview received. The brief is local and was not sent or saved."
                : null}
              {shiftHandoffStatus === "failure"
                ? shiftHandoffError ||
                  "Shift handoff preview failed safely."
                : null}
              {shiftHandoffStatus === "idle"
                ? "Idle: no shift handoff preview for the current queue."
                : null}
              {shiftHandoffCopyStatus !== "idle"
                ? ` ${shiftHandoffCopyStatus}.`
                : null}
            </p>

            <dl className="appointment-review-shift-handoff-summary">
              <div>
                <dt>Total reviews</dt>
                <dd>{displayedShiftHandoff.summary.totalReviews}</dd>
              </div>
              <div>
                <dt>Both paths available</dt>
                <dd>{displayedShiftHandoff.summary.bothPathsAvailable}</dd>
              </div>
              <div>
                <dt>Approve path only</dt>
                <dd>{displayedShiftHandoff.summary.approvePathOnly}</dd>
              </div>
              <div>
                <dt>Reject path only</dt>
                <dd>{displayedShiftHandoff.summary.rejectPathOnly}</dd>
              </div>
              <div>
                <dt>Both paths blocked</dt>
                <dd>{displayedShiftHandoff.summary.bothPathsBlocked}</dd>
              </div>
              <div>
                <dt>validationOnly</dt>
                <dd>{String(displayedShiftHandoff.validationOnly)}</dd>
              </div>
              <div>
                <dt>executionEnabled</dt>
                <dd>{String(displayedShiftHandoff.executionEnabled)}</dd>
              </div>
              <div>
                <dt>persistence</dt>
                <dd>{displayedShiftHandoff.persistence}</dd>
              </div>
            </dl>

            {shiftHandoffResult ? (
              <div className="appointment-review-shift-handoff-items">
                {shiftHandoffResult.items.length === 0 ? (
                  <p>No appointment reviews are currently in the queue.</p>
                ) : null}
                {shiftHandoffResult.items.map((item) => (
                  <article key={item.reviewId}>
                    <div>
                      <strong>{item.reviewId}</strong>
                      <span>
                        {QUEUE_READINESS_LABELS[item.readiness] ||
                          item.readiness}
                      </span>
                    </div>
                    <dl>
                      <div>
                        <dt>Trusted state</dt>
                        <dd>{item.trustedCurrentState}</dd>
                      </div>
                      <div>
                        <dt>Observed version</dt>
                        <dd>{item.observedReviewVersion}</dd>
                      </div>
                      <div>
                        <dt>Approve outcome</dt>
                        <dd>
                          {item.branches.find(
                            (branch) => branch.action === "approve"
                          )?.outcome || "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>Reject outcome</dt>
                        <dd>
                          {item.branches.find(
                            (branch) => branch.action === "reject"
                          )?.outcome || "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>Unresolved checks</dt>
                        <dd>
                          {item.unresolvedChecks.length > 0
                            ? item.unresolvedChecks.join(", ")
                            : "none"}
                        </dd>
                      </div>
                      <div>
                        <dt>Follow-up categories</dt>
                        <dd>
                          {item.followUpCategories.length > 0
                            ? item.followUpCategories.join(", ")
                            : "none"}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : null}

            <label className="appointment-review-shift-handoff-brief">
              Internal Shift Handoff Brief - not sent or saved
              <textarea
                readOnly
                rows={14}
                value={displayedShiftHandoff.plainTextBrief}
                placeholder="Generate a shift handoff preview to render the safe internal brief."
              />
            </label>
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-follow-up-board"
            aria-labelledby="appointment-review-follow-up-board-title"
          >
            <div>
              <span>Operational focus · Local filters</span>
              <h3 id="appointment-review-follow-up-board-title">
                Operational Follow-up Focus Board
              </h3>
              <p>
                Groups the current trusted handoff items by deterministic
                resolution-guidance categories. Categories are operational
                verification tags only; they do not recommend, rank, assign,
                execute, persist, book, or check calendar availability.
              </p>
            </div>

            <div className="appointment-review-follow-up-board-controls">
              <button
                type="button"
                className="appointment-review-follow-up-board-button"
                onClick={() => loadFollowUpFocusBoard()}
                disabled={
                  followUpBoardStatus === "loading" ||
                  shiftHandoffStatus === "loading"
                }
              >
                Load Operational Follow-up Board
              </button>
              <button
                type="button"
                className="appointment-review-follow-up-board-button secondary"
                onClick={() => loadFollowUpFocusBoard({ forceRefresh: true })}
                disabled={
                  followUpBoardStatus === "loading" ||
                  shiftHandoffStatus === "loading"
                }
              >
                Refresh from Handoff Preview
              </button>
              <button
                type="button"
                className="appointment-review-follow-up-board-button secondary"
                onClick={openNextUnreviewedInFollowUpFocus}
                disabled={!currentShiftHandoffResult}
              >
                Open Next Unreviewed in Current Focus
              </button>
              <button
                type="button"
                className="appointment-review-follow-up-board-button secondary"
                onClick={clearFollowUpFocusFilters}
              >
                Clear Focus Filters
              </button>
              <label>
                Follow-up category
                <select
                  value={followUpBoardCategoryFilter}
                  onChange={(event) =>
                    setFollowUpBoardCategoryFilter(event.target.value)
                  }
                >
                  {followUpBoardCategoryOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Session status
                <select
                  value={followUpBoardSessionFilter}
                  onChange={(event) =>
                    setFollowUpBoardSessionFilter(event.target.value)
                  }
                >
                  {FOLLOW_UP_BOARD_SESSION_FILTER_OPTIONS.map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </label>
            </div>

            <p className="appointment-review-follow-up-board-state">
              {followUpBoardStatus === "loading"
                ? "Operational follow-up board is loading through the existing handoff preview route. Duplicate requests are ignored."
                : null}
              {followUpBoardStatus === "success"
                ? `${followUpFocusBoard.filteredReviewCount} focused reviews from ${followUpFocusBoard.totalReviews} trusted handoff reviews.`
                : null}
              {followUpBoardStatus === "failure"
                ? followUpBoardError ||
                  "Operational follow-up board failed safely."
                : null}
              {followUpBoardStatus === "idle"
                ? "Idle: load the board to focus by operational follow-up category."
                : null}
              {followUpBoardMessage ? ` ${followUpBoardMessage}` : null}
            </p>

            <dl className="appointment-review-follow-up-board-summary">
              <div>
                <dt>Total handoff reviews</dt>
                <dd>{followUpFocusBoard.totalReviews}</dd>
              </div>
              <div>
                <dt>Focused reviews</dt>
                <dd>{followUpFocusBoard.filteredReviewCount}</dd>
              </div>
              <div>
                <dt>Category count model</dt>
                <dd>overlapping</dd>
              </div>
              <div>
                <dt>Session state sent</dt>
                <dd>{String(followUpFocusBoard.sentToServer === true)}</dd>
              </div>
            </dl>

            {currentShiftHandoffResult ? (
              <>
                <div className="appointment-review-follow-up-board-categories">
                  {followUpFocusBoard.categories.length === 0 ? (
                    <span>No follow-up categories in the current handoff.</span>
                  ) : null}
                  {followUpFocusBoard.categories.map((category) => (
                    <button
                      key={category.code}
                      type="button"
                      className="appointment-review-follow-up-board-chip"
                      onClick={() => setFollowUpBoardCategoryFilter(category.code)}
                    >
                      <span>{category.label}</span>
                      <strong>{category.count}</strong>
                    </button>
                  ))}
                </div>

                <div className="appointment-review-follow-up-board-items">
                  {followUpFocusBoard.items.length === 0 ? (
                    <p>No reviews match the current follow-up focus filters.</p>
                  ) : null}
                  {followUpFocusBoard.items.map((item) => (
                    <article key={item.reviewId}>
                      <div>
                        <strong>{item.reviewId}</strong>
                        <span>
                          {QUEUE_READINESS_LABELS[item.readiness] ||
                            item.readiness}
                        </span>
                      </div>
                      <div className="appointment-review-follow-up-board-tags">
                        {item.followUpCategoryLabels.map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                      <dl>
                        <div>
                          <dt>Trusted state</dt>
                          <dd>{item.trustedCurrentState}</dd>
                        </div>
                        <div>
                          <dt>Observed version</dt>
                          <dd>{item.observedReviewVersion}</dd>
                        </div>
                        <div>
                          <dt>Session status</dt>
                          <dd>{item.sessionStatus}</dd>
                        </div>
                        <div>
                          <dt>Version reset</dt>
                          <dd>{String(item.sessionVersionChanged === true)}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="appointment-review-follow-up-board-button secondary"
                        onClick={() => setSelectedReviewId(item.reviewId)}
                      >
                        Open review
                      </button>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="appointment-review-follow-up-board-empty">
                <strong>No trusted handoff data loaded</strong>
                <span>
                  The board reuses the current Sprint 14F structured handoff
                  result or loads it through the existing handoff preview route
                  with an empty request body.
                </span>
              </div>
            )}

            <small>
              Category counts are not mutually exclusive: one review can appear
              in multiple deterministic categories. Session and checklist marks
              remain local and are not included in handoff requests or copied
              brief text.
            </small>
          </section>
        ) : null}

        {loading ? (
          <p className="appointment-reviews-state">
            Appointment review queue yükleniyor...
          </p>
        ) : null}

        {loadError ? <p className="manual-form-error">{loadError}</p> : null}

        {!loading && !loadError && reviews.length === 0 ? (
          <div className="appointment-reviews-empty-state">
            <strong>No pending appointment reviews</strong>
            <span>
              Mock route boş döndü. Bu panel kalıcı kayıt tutmaz, randevu
              oluşturmaz ve takvim çakışması kontrolü yapmaz.
            </span>
          </div>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-detail-preview"
            aria-labelledby="appointment-review-detail-preview-title"
          >
            <div>
              <span>Detail preview</span>
              <h3 id="appointment-review-detail-preview-title">
                Read-only review preview
              </h3>
              <p>
                No booking created. Calendar not checked. Secretary confirmation
                is required before any real booking workflow. No database
                persistence is used in this mock queue boundary.
              </p>
            </div>

            {selectedReview ? (
              <dl className="appointment-review-detail-grid">
                <div>
                  <dt>Review id</dt>
                  <dd>{selectedReview.id}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{selectedReview.status}</dd>
                </div>
                <div>
                  <dt>Selected slot</dt>
                  <dd>
                    {selectedReview.selectedSlot?.doctorName || "Mock doctor"} ·{" "}
                    {selectedReview.selectedSlot?.dayLabel ||
                      selectedReview.day ||
                      "Gün bekleniyor"}{" "}
                    · {selectedReview.selectedSlot?.time || "Saat bekleniyor"}
                  </dd>
                </div>
                <div>
                  <dt>Treatment</dt>
                  <dd>{selectedReview.treatment || "Belirtilmedi"}</dd>
                </div>
                <div>
                  <dt>Purpose</dt>
                  <dd>
                    {selectedReview.appointmentPurposeLabel ||
                      selectedReview.appointmentPurpose ||
                      "Belirtilmedi"}
                  </dd>
                </div>
                <div>
                  <dt>Read only</dt>
                  <dd>{String(summary.safety?.readOnly === true)}</dd>
                </div>
                <div>
                  <dt>Booking created</dt>
                  <dd>{String(selectedReview.bookingCreated === true)}</dd>
                </div>
                <div>
                  <dt>Calendar checked</dt>
                  <dd>{String(selectedReview.calendarChecked === true)}</dd>
                </div>
                <div>
                  <dt>Database persisted</dt>
                  <dd>{String(summary.safety?.databasePersisted === true)}</dd>
                </div>
                <div>
                  <dt>Booking actions</dt>
                  <dd>{String(summary.safety?.bookingActionsEnabled === true)}</dd>
                </div>
                <div>
                  <dt>Calendar actions</dt>
                  <dd>{String(summary.safety?.calendarActionsEnabled === true)}</dd>
                </div>
              </dl>
            ) : (
              <div className="appointment-review-detail-empty">
                <strong>No selected appointment review</strong>
                <span>
                  {reviews.length > 0
                    ? "Select a review to inspect details."
                    : "Select-ready preview is empty because the mock read-only queue has no pending review items."}
                </span>
              </div>
            )}
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-action-intent-preview"
            aria-labelledby="appointment-review-action-intent-preview-title"
          >
            <div>
              <span>Validation dry-run</span>
              <h3 id="appointment-review-action-intent-preview-title">
                Action intent dry-run preview
              </h3>
              <p>
                This is validation-only metadata for the selected review. It
                does not execute clinic decisions, book, open appointment
                records, check calendar availability, or persist data.
              </p>
            </div>

            {selectedReview ? (
              <>
                <button
                  type="button"
                  className="appointment-review-action-intent-button"
                  onClick={runActionIntentDryRun}
                  disabled={actionIntentDryRunStatus === "validating"}
                >
                  Run validation-only preview
                </button>

                <p className="appointment-review-action-intent-state">
                  {actionIntentDryRunStatus === "validating"
                    ? "Validation-only preview is running..."
                    : null}
                  {actionIntentDryRunStatus === "success"
                    ? "Validation-only route result received. No action was performed."
                    : null}
                  {actionIntentDryRunStatus === "error"
                    ? actionIntentDryRunError ||
                      "Validation-only preview failed safely."
                    : null}
                  {actionIntentDryRunStatus === "idle"
                    ? "Idle: route-backed validation-only preview has not run for this selected review."
                    : null}
                </p>

                <dl className="appointment-review-action-intent-grid">
                  <div>
                    <dt>Review id</dt>
                    <dd>{selectedReview.id}</dd>
                  </div>
                  <div>
                    <dt>Route action intent</dt>
                    <dd>needs_clinic_review</dd>
                  </div>
                  <div>
                    <dt>validationOnly</dt>
                    <dd>{String(displayedActionIntentDryRun.validationOnly)}</dd>
                  </div>
                  <div>
                    <dt>actionPerformed</dt>
                    <dd>
                      {String(displayedActionIntentDryRun.actionPerformed)}
                    </dd>
                  </div>
                  <div>
                    <dt>bookingCreated</dt>
                    <dd>{String(displayedActionIntentDryRun.bookingCreated)}</dd>
                  </div>
                  <div>
                    <dt>calendarChecked</dt>
                    <dd>{String(displayedActionIntentDryRun.calendarChecked)}</dd>
                  </div>
                  <div>
                    <dt>databasePersisted</dt>
                    <dd>
                      {String(displayedActionIntentDryRun.databasePersisted)}
                    </dd>
                  </div>
                  <div>
                    <dt>appointmentCreated</dt>
                    <dd>
                      {String(displayedActionIntentDryRun.appointmentCreated)}
                    </dd>
                  </div>
                  <div>
                    <dt>calendarEventCreated</dt>
                    <dd>
                      {String(displayedActionIntentDryRun.calendarEventCreated)}
                    </dd>
                  </div>
                  <div>
                    <dt>requiresSecretaryConfirmation</dt>
                    <dd>
                      {String(
                        displayedActionIntentDryRun.requiresSecretaryConfirmation
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="appointment-review-action-intent-list">
                  <strong>Controlled future intent names</strong>
                  <span>
                    {displayedActionIntentDryRun.allowedActionIntents.join(", ")}
                  </span>
                </div>
              </>
            ) : (
              <div className="appointment-review-action-intent-empty">
                <strong>No selected appointment review</strong>
                <span>
                  Select a review to inspect validation-only action intent
                  details.
                </span>
              </div>
            )}
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-state-transition-preview"
            aria-labelledby="appointment-review-state-transition-preview-title"
          >
            <div>
              <span>Validation only · Not persisted</span>
              <h3 id="appointment-review-state-transition-preview-title">
                State Transition Dry-run
              </h3>
              <p>
                Route-backed validation-only preview for the selected review.
                No action executed, no queue state changed, and no database
                persistence is used.
              </p>
            </div>

            {selectedReview ? (
              <>
                <div className="appointment-review-state-transition-controls">
                  <label>
                    Preview current state
                    <input
                      type="text"
                      value={stateTransitionPreviewCurrentState}
                      onChange={(event) =>
                        setStateTransitionPreviewCurrentState(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Dry-run event
                    <select
                      value={selectedStateTransitionEvent}
                      onChange={(event) =>
                        setSelectedStateTransitionEvent(event.target.value)
                      }
                    >
                      {STATE_TRANSITION_DRY_RUN_EVENTS.map((eventName) => (
                        <option key={eventName} value={eventName}>
                          {eventName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="appointment-review-state-transition-button"
                    onClick={runStateTransitionDryRun}
                    disabled={stateTransitionDryRunStatus === "loading"}
                  >
                    Run state transition dry-run
                  </button>
                </div>

                <p className="appointment-review-state-transition-state">
                  {stateTransitionDryRunStatus === "loading"
                    ? "State transition dry-run is running. No action executed."
                    : null}
                  {stateTransitionDryRunStatus === "success"
                    ? "State transition dry-run result received. Validation only. Not persisted."
                    : null}
                  {stateTransitionDryRunStatus === "failure"
                    ? stateTransitionDryRunError ||
                      "State transition dry-run failed safely. No transition occurred."
                    : null}
                  {stateTransitionDryRunStatus === "idle"
                    ? "Idle: no state transition dry-run result for this selected review."
                    : null}
                </p>

                <dl className="appointment-review-state-transition-grid">
                  <div>
                    <dt>Review id</dt>
                    <dd>{selectedReview.id}</dd>
                  </div>
                  <div>
                    <dt>accepted</dt>
                    <dd>
                      {stateTransitionDryRunResult
                        ? String(stateTransitionDryRunResult.accepted)
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>currentState</dt>
                    <dd>
                      {stateTransitionDryRunResult?.currentState ||
                        stateTransitionPreviewCurrentState}
                    </dd>
                  </div>
                  <div>
                    <dt>event</dt>
                    <dd>
                      {stateTransitionDryRunResult?.event ||
                        selectedStateTransitionEvent}
                    </dd>
                  </div>
                  <div>
                    <dt>Preview next state</dt>
                    <dd>{stateTransitionDryRunResult?.nextState || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>code</dt>
                    <dd>{stateTransitionDryRunResult?.code || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>reason</dt>
                    <dd>{stateTransitionDryRunResult?.reason || "none"}</dd>
                  </div>
                  <div>
                    <dt>validationOnly</dt>
                    <dd>
                      {String(displayedStateTransitionDryRun.validationOnly)}
                    </dd>
                  </div>
                  <div>
                    <dt>executionAvailable</dt>
                    <dd>
                      {String(displayedStateTransitionDryRun.executionAvailable)}
                    </dd>
                  </div>
                  <div>
                    <dt>actionPerformed</dt>
                    <dd>
                      {String(displayedStateTransitionDryRun.actionPerformed)}
                    </dd>
                  </div>
                  <div>
                    <dt>bookingCreated</dt>
                    <dd>
                      {String(displayedStateTransitionDryRun.bookingCreated)}
                    </dd>
                  </div>
                  <div>
                    <dt>calendarChecked</dt>
                    <dd>
                      {String(displayedStateTransitionDryRun.calendarChecked)}
                    </dd>
                  </div>
                  <div>
                    <dt>appointmentCreated</dt>
                    <dd>
                      {String(displayedStateTransitionDryRun.appointmentCreated)}
                    </dd>
                  </div>
                  <div>
                    <dt>calendarEventCreated</dt>
                    <dd>
                      {String(
                        displayedStateTransitionDryRun.calendarEventCreated
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>databasePersisted</dt>
                    <dd>
                      {String(displayedStateTransitionDryRun.databasePersisted)}
                    </dd>
                  </div>
                  <div>
                    <dt>persistence</dt>
                    <dd>{displayedStateTransitionDryRun.persistence}</dd>
                  </div>
                </dl>

                <div className="appointment-review-state-transition-list">
                  <strong>Dry-run event metadata</strong>
                  <span>{STATE_TRANSITION_DRY_RUN_EVENTS.join(", ")}</span>
                  <small>
                    Validation only. Not persisted. No action executed. Preview
                    result does not update the selected review object.
                  </small>
                </div>
              </>
            ) : (
              <div className="appointment-review-state-transition-empty">
                <strong>No selected appointment review</strong>
                <span>
                  Select a review to inspect state transition dry-run details.
                </span>
              </div>
            )}
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-decision-preview"
            aria-labelledby="appointment-review-decision-preview-title"
          >
            <div>
              <span>End-to-end dry-run · Trusted server context</span>
              <h3 id="appointment-review-decision-preview-title">
                Decision Preview Dry-run
              </h3>
              <p>
                Runs action intent, preconditions, state transition,
                controlled validation, and receipt assembly in preview mode.
                No approval or rejection is executed. Review unchanged. Not
                persisted.
              </p>
            </div>

            {selectedReview ? (
              <>
                <div className="appointment-review-decision-controls">
                  {DECISION_PREVIEW_ACTIONS.map((action) => (
                    <button
                      key={action}
                      type="button"
                      className="appointment-review-decision-button"
                      onClick={() => runDecisionPreview(action)}
                      disabled={decisionPreviewStatus === "loading"}
                    >
                      {action === "approve"
                        ? "Approve Preview (dry-run)"
                        : "Reject Preview (dry-run)"}
                    </button>
                  ))}
                </div>

                <p className="appointment-review-decision-state">
                  {decisionPreviewStatus === "loading"
                    ? "Decision preview dry-run is running. Duplicate preview clicks are ignored."
                    : null}
                  {decisionPreviewStatus === "success" &&
                  decisionPreviewResult?.accepted === true
                    ? "Decision preview passed. This is not approval or rejection execution."
                    : null}
                  {decisionPreviewStatus === "success" &&
                  decisionPreviewResult?.accepted === false
                    ? "Decision preview returned a controlled safe block. No review state changed."
                    : null}
                  {decisionPreviewStatus === "failure"
                    ? decisionPreviewError ||
                      "Decision preview dry-run failed safely."
                    : null}
                  {decisionPreviewStatus === "idle"
                    ? "Idle: no end-to-end decision preview result for this selected review."
                    : null}
                </p>

                <dl className="appointment-review-decision-grid">
                  <div>
                    <dt>reviewId</dt>
                    <dd>{decisionPreviewResult?.reviewId || selectedReview.id}</dd>
                  </div>
                  <div>
                    <dt>requested action</dt>
                    <dd>{decisionPreviewResult?.action || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>actionIntent</dt>
                    <dd>{decisionPreviewResult?.actionIntent || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>accepted</dt>
                    <dd>
                      {decisionPreviewResult
                        ? String(decisionPreviewResult.accepted)
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>previewPassed</dt>
                    <dd>
                      {decisionPreviewResult
                        ? String(decisionPreviewResult.previewPassed)
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>previewBlocked</dt>
                    <dd>
                      {decisionPreviewResult
                        ? String(decisionPreviewResult.previewBlocked)
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>completedStage</dt>
                    <dd>{decisionPreviewResult?.completedStage || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>blockingStage</dt>
                    <dd>{decisionPreviewResult?.blockingStage || "none"}</dd>
                  </div>
                  <div>
                    <dt>code</dt>
                    <dd>{decisionPreviewResult?.code || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>reason</dt>
                    <dd>{decisionPreviewResult?.reason || "none"}</dd>
                  </div>
                  <div>
                    <dt>trustedCurrentState</dt>
                    <dd>
                      {decisionPreviewResult?.trustedCurrentState || "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>projectedNextState</dt>
                    <dd>{decisionPreviewResult?.projectedNextState || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>observedReviewVersion</dt>
                    <dd>
                      {decisionPreviewResult?.observedReviewVersion || "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>receiptOutcome</dt>
                    <dd>{decisionPreviewResult?.receiptOutcome || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>dryRun</dt>
                    <dd>{String(displayedDecisionPreview.dryRun)}</dd>
                  </div>
                  <div>
                    <dt>decisionPreview</dt>
                    <dd>{String(displayedDecisionPreview.decisionPreview)}</dd>
                  </div>
                  <div>
                    <dt>validationOnly</dt>
                    <dd>{String(displayedDecisionPreview.validationOnly)}</dd>
                  </div>
                  <div>
                    <dt>executionEnabled</dt>
                    <dd>{String(displayedDecisionPreview.executionEnabled)}</dd>
                  </div>
                  <div>
                    <dt>executionAvailable</dt>
                    <dd>{String(displayedDecisionPreview.executionAvailable)}</dd>
                  </div>
                  <div>
                    <dt>actionPerformed</dt>
                    <dd>{String(displayedDecisionPreview.actionPerformed)}</dd>
                  </div>
                  <div>
                    <dt>bookingCreated</dt>
                    <dd>{String(displayedDecisionPreview.bookingCreated)}</dd>
                  </div>
                  <div>
                    <dt>calendarChecked</dt>
                    <dd>{String(displayedDecisionPreview.calendarChecked)}</dd>
                  </div>
                  <div>
                    <dt>appointmentCreated</dt>
                    <dd>{String(displayedDecisionPreview.appointmentCreated)}</dd>
                  </div>
                  <div>
                    <dt>calendarEventCreated</dt>
                    <dd>
                      {String(displayedDecisionPreview.calendarEventCreated)}
                    </dd>
                  </div>
                  <div>
                    <dt>databasePersisted</dt>
                    <dd>{String(displayedDecisionPreview.databasePersisted)}</dd>
                  </div>
                  <div>
                    <dt>persistence</dt>
                    <dd>{displayedDecisionPreview.persistence}</dd>
                  </div>
                  <div>
                    <dt>reviewMutated</dt>
                    <dd>{String(displayedDecisionPreview.reviewMutated)}</dd>
                  </div>
                  <div>
                    <dt>reviewStateChanged</dt>
                    <dd>{String(displayedDecisionPreview.reviewStateChanged)}</dd>
                  </div>
                  <div>
                    <dt>repositoryVersionChanged</dt>
                    <dd>
                      {String(displayedDecisionPreview.repositoryVersionChanged)}
                    </dd>
                  </div>
                </dl>

                <div className="appointment-review-decision-list">
                  <strong>Preview-only stages</strong>
                  <span>
                    action_intent, preconditions, state_transition,
                    controlled_action_validation, validation_decision_receipt
                  </span>
                  <small>
                    The client sends only action. Server-side trusted context
                    provides current state and observed version. No optimistic
                    update, route-to-route HTTP, booking, calendar, database,
                    persistence, or executor work is performed.
                  </small>
                </div>
              </>
            ) : (
              <div className="appointment-review-decision-empty">
                <strong>No selected appointment review</strong>
                <span>
                  Select a review to run approve or reject decision preview
                  dry-runs.
                </span>
              </div>
            )}
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-decision-execution"
            aria-labelledby="appointment-review-decision-execution-title"
          >
            <div>
              <span>Controlled execution · In-memory demo</span>
              <h3 id="appointment-review-decision-execution-title">
                Decision Execution Confirmation
              </h3>
              <p>
                Applies the current successful decision preview only after an
                explicit second confirmation. The server reruns trusted
                validation and may change review state/version in the active
                in-memory runtime. Durable persistence, booking, calendar, and
                messaging remain unavailable.
              </p>
            </div>

            {selectedReview ? (
              <>
                <div className="appointment-review-decision-execution-controls">
                  <button
                    type="button"
                    className="appointment-review-decision-execution-button"
                    onClick={openDecisionExecutionConfirmation}
                    disabled={
                      !executableDecisionPreview ||
                      decisionExecutionStatus === "loading"
                    }
                  >
                    {executableDecisionPreview?.action === "reject"
                      ? "Prepare Reject Decision Application"
                      : "Prepare Approve Decision Application"}
                  </button>
                  <button
                    type="button"
                    className="appointment-review-decision-execution-button secondary"
                    onClick={cancelDecisionExecutionConfirmation}
                    disabled={decisionExecutionStatus === "loading"}
                  >
                    Cancel Execution Confirmation
                  </button>
                </div>

                <p className="appointment-review-decision-execution-state">
                  {decisionExecutionStatus === "loading"
                    ? "Decision execution is applying through the controlled in-memory route. Duplicate submissions are disabled."
                    : null}
                  {decisionExecutionStatus === "confirming"
                    ? "Explicit confirmation is open. No request is sent until the in-memory application button is pressed."
                    : null}
                  {decisionExecutionStatus === "success" &&
                  decisionExecutionResult?.matchingReplay === true
                    ? "Matching replay returned the original receipt. No second mutation occurred."
                    : null}
                  {decisionExecutionStatus === "success" &&
                  decisionExecutionResult?.matchingReplay !== true
                    ? "Decision execution applied. Review state changed in the active in-memory runtime only."
                    : null}
                  {decisionExecutionStatus === "failure"
                    ? `${decisionExecutionError} Refresh and rerun preview for stale versions.`
                    : null}
                  {decisionExecutionStatus === "idle"
                    ? "Idle: run a successful current-version approve/reject preview before opening execution confirmation."
                    : null}
                </p>

                {decisionExecutionConfirmation ? (
                  <div className="appointment-review-decision-execution-confirmation">
                    <strong>
                      {decisionExecutionConfirmation.action === "approve"
                        ? "Apply Approve Decision — In-memory Demo"
                        : "Apply Reject Decision — In-memory Demo"}
                    </strong>
                    <dl>
                      <div>
                        <dt>reviewId</dt>
                        <dd>{decisionExecutionConfirmation.reviewId}</dd>
                      </div>
                      <div>
                        <dt>action</dt>
                        <dd>{decisionExecutionConfirmation.action}</dd>
                      </div>
                      <div>
                        <dt>preview observed version</dt>
                        <dd>
                          {decisionExecutionConfirmation.expectedReviewVersion}
                        </dd>
                      </div>
                      <div>
                        <dt>projected state</dt>
                        <dd>{decisionExecutionConfirmation.projectedNextState}</dd>
                      </div>
                    </dl>
                    <small>
                      This applies only an in-memory review state transition.
                      It does not create bookings, calendar events, patient
                      messages, durable database records, or receipt
                      persistence.
                    </small>
                    <button
                      type="button"
                      className="appointment-review-decision-execution-button"
                      onClick={confirmDecisionExecution}
                      disabled={decisionExecutionStatus === "loading"}
                    >
                      {decisionExecutionConfirmation.action === "approve"
                        ? "Apply Approve Decision — In-memory Demo"
                        : "Apply Reject Decision — In-memory Demo"}
                    </button>
                  </div>
                ) : null}

                <dl className="appointment-review-decision-execution-grid">
                  <div>
                    <dt>accepted</dt>
                    <dd>
                      {decisionExecutionResult
                        ? String(decisionExecutionResult.accepted)
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>code</dt>
                    <dd>{decisionExecutionResult?.code || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>matchingReplay</dt>
                    <dd>
                      {decisionExecutionResult
                        ? String(decisionExecutionResult.matchingReplay)
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>previous state</dt>
                    <dd>{decisionExecutionResult?.previousState || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>resulting state</dt>
                    <dd>{decisionExecutionResult?.resultingState || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>previous version</dt>
                    <dd>
                      {decisionExecutionResult?.previousReviewVersion ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>resulting version</dt>
                    <dd>
                      {decisionExecutionResult?.resultingReviewVersion ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>repository version</dt>
                    <dd>
                      {decisionExecutionResult?.resultingRepositoryVersion ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>reviewStateChanged</dt>
                    <dd>{String(displayedDecisionExecution.reviewStateChanged)}</dd>
                  </div>
                  <div>
                    <dt>durablePersistence</dt>
                    <dd>{String(displayedDecisionExecution.durablePersistence)}</dd>
                  </div>
                  <div>
                    <dt>bookingCreated</dt>
                    <dd>{String(displayedDecisionExecution.bookingCreated)}</dd>
                  </div>
                  <div>
                    <dt>calendarWritten</dt>
                    <dd>{String(displayedDecisionExecution.calendarWritten)}</dd>
                  </div>
                  <div>
                    <dt>messageSent</dt>
                    <dd>{String(displayedDecisionExecution.messageSent)}</dd>
                  </div>
                </dl>

                <small>
                  Execution eligibility never uses checklist marks, guided
                  session status, focus-board categories, handoff content, or
                  copied brief state. The request body contains action,
                  expectedReviewVersion, idempotencyKey, and explicit
                  confirmation only.
                </small>
              </>
            ) : (
              <div className="appointment-review-decision-execution-empty">
                <strong>No selected appointment review</strong>
                <span>
                  Select a review and run a decision preview before opening
                  controlled execution confirmation.
                </span>
              </div>
            )}
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-decision-execution"
            aria-labelledby="appointment-review-appointment-creation-title"
          >
            <div>
              <span>Appointment creation · In-memory only</span>
              <h3 id="appointment-review-appointment-creation-title">
                Approved Review Appointment Creation
              </h3>
              <p>
                Creates one appointment only from the current trusted approved
                review. The request never includes doctor, patient, slot, time,
                duration, treatment, or purpose overrides.
              </p>
            </div>

            {selectedReview ? (
              <>
                <div className="appointment-review-decision-execution-controls">
                  <button
                    type="button"
                    className="appointment-review-decision-execution-button"
                    onClick={openAppointmentCreationConfirmation}
                    disabled={
                      !appointmentCreationCandidate ||
                      appointmentCreationStatus === "loading"
                    }
                  >
                    Prepare In-memory Appointment
                  </button>
                  <button
                    type="button"
                    className="appointment-review-decision-execution-button secondary"
                    onClick={cancelAppointmentCreationConfirmation}
                    disabled={appointmentCreationStatus === "loading"}
                  >
                    Cancel Appointment Creation
                  </button>
                </div>

                <p className="appointment-review-decision-execution-state">
                  {appointmentCreationStatus === "idle"
                    ? "Idle: select a current approved review with no linked appointment."
                    : null}
                  {appointmentCreationStatus === "confirming"
                    ? "Explicit confirmation is open. No appointment request has been sent."
                    : null}
                  {appointmentCreationStatus === "loading"
                    ? "Creating the in-memory appointment through the controlled route. Duplicate submissions are disabled."
                    : null}
                  {appointmentCreationStatus === "success" &&
                  appointmentCreationResult?.matchingReplay === true
                    ? "Matching replay returned the original appointment receipt. No duplicate appointment was created."
                    : null}
                  {appointmentCreationStatus === "success" &&
                  appointmentCreationResult?.matchingReplay !== true
                    ? "Appointment created in the active in-memory runtime only."
                    : null}
                  {appointmentCreationStatus === "failure"
                    ? `${appointmentCreationError} Refresh trusted review state before retrying.`
                    : null}
                </p>

                {appointmentCreationConfirmation ? (
                  <div className="appointment-review-decision-execution-confirmation">
                    <strong>Create In-memory Appointment</strong>
                    <dl>
                      <div>
                        <dt>reviewId</dt>
                        <dd>{appointmentCreationConfirmation.reviewId}</dd>
                      </div>
                      <div>
                        <dt>doctor</dt>
                        <dd>
                          {
                            appointmentCreationConfirmation.candidate
                              .doctorName
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>start</dt>
                        <dd>
                          {appointmentCreationConfirmation.candidate.startAt}
                        </dd>
                      </div>
                      <div>
                        <dt>end</dt>
                        <dd>{appointmentCreationConfirmation.candidate.endAt}</dd>
                      </div>
                      <div>
                        <dt>duration</dt>
                        <dd>
                          {
                            appointmentCreationConfirmation.candidate
                              .durationMinutes
                          }{" "}
                          minutes
                        </dd>
                      </div>
                      <div>
                        <dt>purpose</dt>
                        <dd>
                          {
                            appointmentCreationConfirmation.candidate
                              .appointmentPurposeLabel
                          }
                        </dd>
                      </div>
                    </dl>
                    <small>
                      In-memory only. No calendar provider event, durable
                      persistence, patient message, email, or WhatsApp message
                      is created.
                    </small>
                    <button
                      type="button"
                      className="appointment-review-decision-execution-button"
                      onClick={confirmAppointmentCreation}
                      disabled={appointmentCreationStatus === "loading"}
                    >
                      Create In-memory Appointment
                    </button>
                  </div>
                ) : null}

                <dl className="appointment-review-decision-execution-grid">
                  <div>
                    <dt>accepted</dt>
                    <dd>
                      {appointmentCreationResult
                        ? String(appointmentCreationResult.accepted)
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>code</dt>
                    <dd>{appointmentCreationResult?.code || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>appointmentId</dt>
                    <dd>
                      {appointmentCreationResult?.appointmentId || "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>appointmentCreated</dt>
                    <dd>
                      {String(displayedAppointmentCreation.appointmentCreated)}
                    </dd>
                  </div>
                  <div>
                    <dt>calendarWritten</dt>
                    <dd>
                      {String(displayedAppointmentCreation.calendarWritten)}
                    </dd>
                  </div>
                  <div>
                    <dt>messageSent</dt>
                    <dd>{String(displayedAppointmentCreation.messageSent)}</dd>
                  </div>
                  <div>
                    <dt>durablePersistence</dt>
                    <dd>
                      {String(displayedAppointmentCreation.durablePersistence)}
                    </dd>
                  </div>
                </dl>

                <div className="appointment-review-decision-list">
                  <strong>Created in-memory appointments</strong>
	                  {createdAppointments.length ? (
	                    createdAppointments.map((appointment) => (
	                      <span key={appointment.id}>
	                        {appointment.id} · {appointment.doctor?.name} ·{" "}
	                        {appointment.startAt} · {appointment.appointmentPurposeLabel} ·{" "}
	                        calendarWritten {String(appointment.calendarWritten)} ·{" "}
	                        version {appointment.version} · status{" "}
	                        {appointment.appointmentStatus || "scheduled"} · calendar{" "}
	                        {appointment.calendarFollowUpStatus || "not_required"} · notification{" "}
	                        {appointment.notificationFollowUpStatus || "not_required"}
	                        <button
	                          type="button"
	                          className="appointment-review-decision-execution-button secondary"
	                          onClick={() => openCalendarSyncConfirmation(appointment)}
                          disabled={
                            !isCalendarSyncEligibleAppointment(appointment) ||
                            calendarSyncStatus === "loading"
                          }
                        >
                          Prepare Calendar Sync
                        </button>
                        <button
                          type="button"
                          className="appointment-review-decision-execution-button secondary"
                          onClick={() =>
                            openConfirmationDispatchConfirmation(appointment)
                          }
                          disabled={
                            !isConfirmationDispatchEligibleAppointment(
                              appointment
                            ) || confirmationDispatchStatus === "loading"
                          }
	                        >
	                          Prepare Appointment Confirmation
	                        </button>
	                        <button
	                          type="button"
	                          className="appointment-review-decision-execution-button secondary"
	                          onClick={() =>
	                            openAppointmentLifecycleConfirmation(
	                              appointment,
	                              "reschedule"
	                            )
	                          }
	                          disabled={
	                            !isScheduledAppointment(appointment) ||
	                            appointmentLifecycleStatus === "loading"
	                          }
	                        >
	                          Preview Reschedule
	                        </button>
	                        <button
	                          type="button"
	                          className="appointment-review-decision-execution-button secondary"
	                          onClick={() =>
	                            openAppointmentLifecycleConfirmation(
	                              appointment,
	                              "cancellation"
	                            )
	                          }
	                          disabled={
	                            !isScheduledAppointment(appointment) ||
	                            appointmentLifecycleStatus === "loading"
	                          }
	                        >
	                          Preview Cancellation
	                        </button>
	                        <button
	                          type="button"
	                          className="appointment-review-decision-execution-button secondary"
	                          onClick={() =>
	                            openAppointmentLifecycleConfirmation(
	                              appointment,
	                              "calendar_reschedule"
	                            )
	                          }
	                          disabled={
	                            !isCalendarChangeFollowUpEligible(
	                              appointment,
	                              "calendar_reschedule"
	                            ) || appointmentLifecycleStatus === "loading"
	                          }
	                        >
	                          Confirm Calendar Update
	                        </button>
	                        <button
	                          type="button"
	                          className="appointment-review-decision-execution-button secondary"
	                          onClick={() =>
	                            openAppointmentLifecycleConfirmation(
	                              appointment,
	                              "calendar_cancellation"
	                            )
	                          }
	                          disabled={
	                            !isCalendarChangeFollowUpEligible(
	                              appointment,
	                              "calendar_cancellation"
	                            ) || appointmentLifecycleStatus === "loading"
	                          }
	                        >
	                          Confirm Calendar Cancellation
	                        </button>
	                        <button
	                          type="button"
	                          className="appointment-review-decision-execution-button secondary"
	                          onClick={() =>
	                            openAppointmentLifecycleConfirmation(
	                              appointment,
	                              "reschedule_notification"
	                            )
	                          }
	                          disabled={
	                            !isNotificationFollowUpEligible(
	                              appointment,
	                              "reschedule_notification"
	                            ) || appointmentLifecycleStatus === "loading"
	                          }
	                        >
	                          Confirm Reschedule Notice
	                        </button>
	                        <button
	                          type="button"
	                          className="appointment-review-decision-execution-button secondary"
	                          onClick={() =>
	                            openAppointmentLifecycleConfirmation(
	                              appointment,
	                              "cancellation_notification"
	                            )
	                          }
	                          disabled={
	                            !isNotificationFollowUpEligible(
	                              appointment,
	                              "cancellation_notification"
	                            ) || appointmentLifecycleStatus === "loading"
	                          }
	                        >
	                          Confirm Cancellation Notice
	                        </button>
	                        <button
	                          type="button"
	                          className="appointment-review-decision-execution-button secondary"
	                          onClick={() =>
	                            refreshAppointmentLifecycleEvents(appointment.id)
	                          }
	                          disabled={appointmentLifecycleStatus === "loading"}
	                        >
	                          Refresh Timeline
	                        </button>
	                        {appointmentLifecycleEventsById[appointment.id]?.length ? (
	                          <small>
	                            {appointmentLifecycleEventsById[appointment.id]
	                              .map(
	                                (event) =>
	                                  `${event.createdSequence || "?"}:${event.eventType}`
	                              )
	                              .join(" | ")}
	                          </small>
	                        ) : null}
	                      </span>
	                    ))
	                  ) : (
	                    <span>No in-memory appointment has been created from this workspace session.</span>
	                  )}
	                </div>

	                {appointmentLifecycleConfirmation ? (
	                  <div className="appointment-review-decision-execution-confirmation">
	                    <strong>Lifecycle Operation Review</strong>
	                    <dl>
	                      <div>
	                        <dt>operation</dt>
	                        <dd>{appointmentLifecycleConfirmation.operation}</dd>
	                      </div>
	                      <div>
	                        <dt>appointmentId</dt>
	                        <dd>
	                          {appointmentLifecycleConfirmation.appointment.id}
	                        </dd>
	                      </div>
	                      <div>
	                        <dt>expectedVersion</dt>
	                        <dd>
	                          {
	                            appointmentLifecycleConfirmation.expectedAppointmentVersion
	                          }
	                        </dd>
	                      </div>
	                      <div>
	                        <dt>selectedSlotId</dt>
	                        <dd>
	                          {appointmentLifecycleConfirmation.selectedSlotId ||
	                            "not_required"}
	                        </dd>
	                      </div>
	                    </dl>
	                    <small>
	                      Calendar and patient notification follow-ups remain separate
	                      explicit operations after local reschedule or cancellation.
	                    </small>
	                    <button
	                      type="button"
	                      className="appointment-review-decision-execution-button"
	                      onClick={confirmAppointmentLifecycleOperation}
	                      disabled={appointmentLifecycleStatus === "loading"}
	                    >
	                      Run Lifecycle Operation
	                    </button>
	                    <button
	                      type="button"
	                      className="appointment-review-decision-execution-button secondary"
	                      onClick={cancelAppointmentLifecycleConfirmation}
	                      disabled={appointmentLifecycleStatus === "loading"}
	                    >
	                      Cancel Lifecycle Operation
	                    </button>
	                  </div>
	                ) : null}

	                <dl className="appointment-review-decision-execution-grid">
	                  <div>
	                    <dt>appointmentLifecycleStatus</dt>
	                    <dd>{appointmentLifecycleStatus}</dd>
	                  </div>
	                  <div>
	                    <dt>lifecycleCode</dt>
	                    <dd>{appointmentLifecycleResult?.code || "not_run"}</dd>
	                  </div>
	                  <div>
	                    <dt>providerCalled</dt>
	                    <dd>
	                      {appointmentLifecycleResult
	                        ? String(appointmentLifecycleResult.providerCalled)
	                        : "not_run"}
	                    </dd>
	                  </div>
	                  <div>
	                    <dt>messageSent</dt>
	                    <dd>
	                      {appointmentLifecycleResult
	                        ? String(appointmentLifecycleResult.messageSent)
	                        : "not_run"}
	                    </dd>
	                  </div>
	                </dl>
	                {appointmentLifecycleError ? (
	                  <p className="appointment-review-error">
	                    {appointmentLifecycleError}
	                  </p>
	                ) : null}

	                {calendarSyncConfirmation ? (
                  <div className="appointment-review-decision-execution-confirmation">
                    <strong>Sync to Configured Calendar</strong>
                    <dl>
                      <div>
                        <dt>appointmentId</dt>
                        <dd>{calendarSyncConfirmation.appointmentId}</dd>
                      </div>
                      <div>
                        <dt>doctor</dt>
                        <dd>
                          {calendarSyncConfirmation.appointment.doctor?.name}
                        </dd>
                      </div>
                      <div>
                        <dt>start</dt>
                        <dd>{calendarSyncConfirmation.appointment.startAt}</dd>
                      </div>
                      <div>
                        <dt>end</dt>
                        <dd>{calendarSyncConfirmation.appointment.endAt}</dd>
                      </div>
                      <div>
                        <dt>duration</dt>
                        <dd>
                          {calendarSyncConfirmation.appointment.durationMinutes}{" "}
                          minutes
                        </dd>
                      </div>
                      <div>
                        <dt>configured provider</dt>
                        <dd>server controlled</dd>
                      </div>
                    </dl>
                    <small>
                      This may create an external calendar event through the
                      configured provider. The appointment link is stored only
                      in memory, and no patient message is sent.
                    </small>
                    <button
                      type="button"
                      className="appointment-review-decision-execution-button"
                      onClick={confirmCalendarSync}
                      disabled={calendarSyncStatus === "loading"}
                    >
                      Sync to Configured Calendar
                    </button>
                    <button
                      type="button"
                      className="appointment-review-decision-execution-button secondary"
                      onClick={cancelCalendarSyncConfirmation}
                      disabled={calendarSyncStatus === "loading"}
                    >
                      Cancel Calendar Sync
                    </button>
                  </div>
                ) : null}

                <dl className="appointment-review-decision-execution-grid">
                  <div>
                    <dt>calendarSyncStatus</dt>
                    <dd>{calendarSyncStatus}</dd>
                  </div>
                  <div>
                    <dt>syncCode</dt>
                    <dd>{calendarSyncResult?.code || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>provider</dt>
                    <dd>{calendarSyncResult?.provider || "server_controlled"}</dd>
                  </div>
                  <div>
                    <dt>providerEventId</dt>
                    <dd>{calendarSyncResult?.providerEventId || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>externalEventCreated</dt>
                    <dd>{String(displayedCalendarSync.externalEventCreated)}</dd>
                  </div>
                  <div>
                    <dt>appointmentCalendarLinkRecorded</dt>
                    <dd>
                      {String(
                        displayedCalendarSync.appointmentCalendarLinkRecorded
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>messageSent</dt>
                    <dd>{String(displayedCalendarSync.messageSent)}</dd>
                  </div>
                </dl>
                {calendarSyncStatus === "failure" ? (
                  <p className="appointment-review-decision-execution-state">
                    {calendarSyncError}
                  </p>
                ) : null}

                {confirmationDispatchConfirmation ? (
                  <div className="appointment-review-decision-execution-confirmation">
                    <strong>Send Appointment Confirmation — Mock Provider</strong>
                    <dl>
                      <div>
                        <dt>appointmentId</dt>
                        <dd>
                          {confirmationDispatchConfirmation.appointmentId}
                        </dd>
                      </div>
                      <div>
                        <dt>masked destination</dt>
                        <dd>
                          {
                            confirmationDispatchConfirmation.appointment
                              .outboundDestination?.maskedLabel
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>doctor</dt>
                        <dd>
                          {
                            confirmationDispatchConfirmation.appointment.doctor
                              ?.name
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>start</dt>
                        <dd>
                          {confirmationDispatchConfirmation.appointment.startAt}
                        </dd>
                      </div>
                      <div>
                        <dt>end</dt>
                        <dd>
                          {confirmationDispatchConfirmation.appointment.endAt}
                        </dd>
                      </div>
                      <div>
                        <dt>purpose</dt>
                        <dd>
                          {
                            confirmationDispatchConfirmation.appointment
                              .appointmentPurposeLabel
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>configured provider</dt>
                        <dd>mock outbound provider</dd>
                      </div>
                    </dl>
                    <small>
                      Mock provider can accept this confirmation, but no real
                      patient message reaches a patient. The confirmation link
                      exists only in the current in-memory runtime and has no
                      durable persistence.
                    </small>
                    <button
                      type="button"
                      className="appointment-review-decision-execution-button"
                      onClick={confirmAppointmentConfirmationDispatch}
                      disabled={confirmationDispatchStatus === "loading"}
                    >
                      Send Appointment Confirmation — Mock Provider
                    </button>
                    <button
                      type="button"
                      className="appointment-review-decision-execution-button secondary"
                      onClick={cancelConfirmationDispatchConfirmation}
                      disabled={confirmationDispatchStatus === "loading"}
                    >
                      Cancel Appointment Confirmation
                    </button>
                  </div>
                ) : null}

                <dl className="appointment-review-decision-execution-grid">
                  <div>
                    <dt>confirmationDispatchStatus</dt>
                    <dd>{confirmationDispatchStatus}</dd>
                  </div>
                  <div>
                    <dt>dispatchCode</dt>
                    <dd>{confirmationDispatchResult?.code || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>provider</dt>
                    <dd>
                      {confirmationDispatchResult?.provider ||
                        "mock_outbound"}
                    </dd>
                  </div>
                  <div>
                    <dt>providerMessageId</dt>
                    <dd>
                      {confirmationDispatchResult?.providerMessageId ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>maskedDestination</dt>
                    <dd>
                      {confirmationDispatchResult?.maskedDestinationLabel ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>providerDispatchAccepted</dt>
                    <dd>
                      {String(
                        displayedConfirmationDispatch.providerDispatchAccepted
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>realPatientDelivery</dt>
                    <dd>
                      {String(displayedConfirmationDispatch.realPatientDelivery)}
                    </dd>
                  </div>
                  <div>
                    <dt>confirmationMessageLinkRecorded</dt>
                    <dd>
                      {String(
                        displayedConfirmationDispatch
                          .confirmationMessageLinkRecorded
                      )}
                    </dd>
                  </div>
                </dl>
                {confirmationDispatchStatus === "failure" ? (
                  <p className="appointment-review-decision-execution-state">
                    {confirmationDispatchError}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="appointment-review-decision-execution-empty">
                <strong>No selected appointment review</strong>
                <span>
                  Select an approved review before preparing appointment
                  creation.
                </span>
              </div>
            )}
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-decision-comparison"
            aria-labelledby="appointment-review-decision-comparison-title"
          >
            <div>
              <span>Two-path dry-run · No recommendation</span>
              <h3 id="appointment-review-decision-comparison-title">
                Decision Path Comparison Dry-run
              </h3>
              <p>
                Evaluates approve and reject preview paths in one server
                request against the same trusted review state and observed
                version. It does not recommend, select, execute, persist, book,
                or check calendar availability.
              </p>
            </div>

            {selectedReview ? (
              <>
                <button
                  type="button"
                  className="appointment-review-decision-comparison-button"
                  onClick={runDecisionComparison}
                  disabled={decisionComparisonStatus === "loading"}
                >
                  Compare Decision Paths (dry-run)
                </button>

                <p className="appointment-review-decision-comparison-state">
                  {decisionComparisonStatus === "loading"
                    ? "Decision path comparison dry-run is running. Duplicate comparison submissions are ignored."
                    : null}
                  {decisionComparisonStatus === "success"
                    ? "Decision path comparison result received. No action was selected or executed."
                    : null}
                  {decisionComparisonStatus === "failure"
                    ? decisionComparisonError ||
                      "Decision path comparison dry-run failed safely."
                    : null}
                  {decisionComparisonStatus === "idle"
                    ? "Idle: no approve/reject path comparison result for this selected review."
                    : null}
                </p>

                <dl className="appointment-review-decision-comparison-grid">
                  <div>
                    <dt>reviewId</dt>
                    <dd>
                      {decisionComparisonResult?.reviewId || selectedReview.id}
                    </dd>
                  </div>
                  <div>
                    <dt>trustedCurrentState</dt>
                    <dd>
                      {decisionComparisonResult?.trustedCurrentState ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>observedReviewVersion</dt>
                    <dd>
                      {decisionComparisonResult?.observedReviewVersion ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>dryRun</dt>
                    <dd>{String(displayedDecisionComparison.dryRun)}</dd>
                  </div>
                  <div>
                    <dt>decisionComparison</dt>
                    <dd>
                      {String(displayedDecisionComparison.decisionComparison)}
                    </dd>
                  </div>
                  <div>
                    <dt>executionEnabled</dt>
                    <dd>
                      {String(displayedDecisionComparison.executionEnabled)}
                    </dd>
                  </div>
                  <div>
                    <dt>reviewMutated</dt>
                    <dd>{String(displayedDecisionComparison.reviewMutated)}</dd>
                  </div>
                  <div>
                    <dt>repositoryVersionChanged</dt>
                    <dd>
                      {String(
                        displayedDecisionComparison.repositoryVersionChanged
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>persistence</dt>
                    <dd>{displayedDecisionComparison.persistence}</dd>
                  </div>
                </dl>

                <div className="appointment-review-decision-comparison-paths">
                  <article>
                    <span>Approve path</span>
                    <dl>
                      <div>
                        <dt>outcome</dt>
                        <dd>{approveComparisonPath?.outcome || "not_run"}</dd>
                      </div>
                      <div>
                        <dt>completedStage</dt>
                        <dd>
                          {approveComparisonPath?.completedStage || "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>blockingStage</dt>
                        <dd>{approveComparisonPath?.blockingStage || "none"}</dd>
                      </div>
                      <div>
                        <dt>projectedNextState</dt>
                        <dd>
                          {approveComparisonPath?.projectedNextState ||
                            "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>reason</dt>
                        <dd>{approveComparisonPath?.reason || "none"}</dd>
                      </div>
                      <div>
                        <dt>receiptOutcome</dt>
                        <dd>
                          {approveComparisonPath?.receiptOutcome || "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>not persisted</dt>
                        <dd>
                          {approveComparisonPath?.persistence ||
                            displayedDecisionComparison.persistence}
                        </dd>
                      </div>
                    </dl>
                  </article>
                  <article>
                    <span>Reject path</span>
                    <dl>
                      <div>
                        <dt>outcome</dt>
                        <dd>{rejectComparisonPath?.outcome || "not_run"}</dd>
                      </div>
                      <div>
                        <dt>completedStage</dt>
                        <dd>
                          {rejectComparisonPath?.completedStage || "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>blockingStage</dt>
                        <dd>{rejectComparisonPath?.blockingStage || "none"}</dd>
                      </div>
                      <div>
                        <dt>projectedNextState</dt>
                        <dd>
                          {rejectComparisonPath?.projectedNextState ||
                            "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>reason</dt>
                        <dd>{rejectComparisonPath?.reason || "none"}</dd>
                      </div>
                      <div>
                        <dt>receiptOutcome</dt>
                        <dd>
                          {rejectComparisonPath?.receiptOutcome || "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>not persisted</dt>
                        <dd>
                          {rejectComparisonPath?.persistence ||
                            displayedDecisionComparison.persistence}
                        </dd>
                      </div>
                    </dl>
                  </article>
                </div>

                <div className="appointment-review-decision-comparison-list">
                  <strong>Comparison boundary</strong>
                  <span>approve, reject</span>
                  <small>
                    Both paths are factual previews only. The comparison does
                    not rank paths, choose an action, mutate the review, create
                    a receipt record, create an appointment, access calendar
                    data, or persist anything.
                  </small>
                </div>
              </>
            ) : (
              <div className="appointment-review-decision-comparison-empty">
                <strong>No selected appointment review</strong>
                <span>
                  Select a review to compare approve and reject dry-run paths.
                </span>
              </div>
            )}
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-resolution-guidance-preview"
            aria-labelledby="appointment-review-resolution-guidance-preview-title"
          >
            <div>
              <span>Operational follow-up dry-run · No recommendation</span>
              <h3 id="appointment-review-resolution-guidance-preview-title">
                Resolution Guidance Preview
              </h3>
              <p>
                Generates factual approve and reject follow-up checks from the
                same server-side decision comparison boundary. It does not
                choose a path, execute, persist, book, send a message, assign a
                task, or access calendar data.
              </p>
            </div>

            {selectedReview ? (
              <>
                <div className="appointment-review-resolution-guidance-controls">
                  <button
                    type="button"
                    className="appointment-review-resolution-guidance-button"
                    onClick={runResolutionGuidancePreview}
                    disabled={resolutionGuidanceStatus === "loading"}
                  >
                    {resolutionGuidanceResult
                      ? "Re-run Trusted Guidance Preview"
                      : "Generate Resolution Guidance"}
                  </button>
                  <button
                    type="button"
                    className="appointment-review-resolution-guidance-button"
                    onClick={clearLocalResolutionChecklist}
                    disabled={
                      !resolutionGuidanceResult ||
                      resolutionGuidanceStatus === "loading"
                    }
                  >
                    Clear Local Checklist Marks
                  </button>
                </div>

                <p className="appointment-review-resolution-guidance-state">
                  {resolutionGuidanceStatus === "loading"
                    ? "Resolution guidance preview is running. Duplicate submissions are ignored."
                    : null}
                  {resolutionGuidanceStatus === "success"
                    ? "Resolution guidance preview received. No action was selected, assigned, sent, or executed."
                    : null}
                  {resolutionGuidanceStatus === "failure"
                    ? resolutionGuidanceError ||
                      "Resolution guidance preview failed safely."
                    : null}
                  {resolutionGuidanceStatus === "idle"
                    ? "Idle: no resolution guidance preview for this selected review."
                    : null}
                </p>

                {resolutionGuidanceResult ? (
                  <div className="appointment-review-resolution-guidance-notice">
                    <strong>Local checklist session</strong>
                    <span>
                      Checklist marks are local session notes only. They do not
                      change server validation, review state, authorization,
                      execution policy, persistence, booking, or calendar
                      behavior.
                    </span>
                    <small>
                      Total local progress:{" "}
                      {resolutionChecklistSession.totals.progressText}. Trusted
                      re-evaluation ignores these marks and sends no checklist
                      data.
                    </small>
                  </div>
                ) : null}

                <dl className="appointment-review-resolution-guidance-grid">
                  <div>
                    <dt>reviewId</dt>
                    <dd>
                      {resolutionGuidanceResult?.reviewId || selectedReview.id}
                    </dd>
                  </div>
                  <div>
                    <dt>trustedCurrentState</dt>
                    <dd>
                      {resolutionGuidanceResult?.trustedCurrentState ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>observedReviewVersion</dt>
                    <dd>
                      {resolutionGuidanceResult?.observedReviewVersion ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>readiness</dt>
                    <dd>{resolutionGuidanceResult?.readiness || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>dryRun</dt>
                    <dd>{String(displayedResolutionGuidance.dryRun)}</dd>
                  </div>
                  <div>
                    <dt>resolutionGuidancePreview</dt>
                    <dd>
                      {String(
                        displayedResolutionGuidance.resolutionGuidancePreview
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>executionEnabled</dt>
                    <dd>
                      {String(displayedResolutionGuidance.executionEnabled)}
                    </dd>
                  </div>
                  <div>
                    <dt>guidancePersisted</dt>
                    <dd>
                      {String(displayedResolutionGuidance.guidancePersisted)}
                    </dd>
                  </div>
                  <div>
                    <dt>summaryPersisted</dt>
                    <dd>
                      {String(displayedResolutionGuidance.summaryPersisted)}
                    </dd>
                  </div>
                  <div>
                    <dt>messageSent</dt>
                    <dd>{String(displayedResolutionGuidance.messageSent)}</dd>
                  </div>
                  <div>
                    <dt>taskAssigned</dt>
                    <dd>{String(displayedResolutionGuidance.taskAssigned)}</dd>
                  </div>
                  <div>
                    <dt>persistence</dt>
                    <dd>{displayedResolutionGuidance.persistence}</dd>
                  </div>
                  <div>
                    <dt>reviewMutated</dt>
                    <dd>{String(displayedResolutionGuidance.reviewMutated)}</dd>
                  </div>
                  <div>
                    <dt>repositoryVersionChanged</dt>
                    <dd>
                      {String(
                        displayedResolutionGuidance.repositoryVersionChanged
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="appointment-review-resolution-guidance-paths">
                  <article>
                    <span>Approve guidance</span>
                    <dl>
                      <div>
                        <dt>branchOutcome</dt>
                        <dd>
                          {approveResolutionGuidance?.branchOutcome ||
                            "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>category</dt>
                        <dd>
                          {approveResolutionGuidance?.category || "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>requiredCheck</dt>
                        <dd>
                          {approveResolutionGuidance?.requiredCheck ||
                            "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>reasonCode</dt>
                        <dd>
                          {approveResolutionGuidance?.reasonCode || "none"}
                        </dd>
                      </div>
                      <div>
                        <dt>blockingStage</dt>
                        <dd>
                          {approveResolutionGuidance?.blockingStage || "none"}
                        </dd>
                      </div>
                      <div>
                        <dt>rerunAfterVerification</dt>
                        <dd>
                          {String(
                            approveResolutionGuidance
                              ?.rerunAfterVerification === true
                          )}
                        </dd>
                      </div>
                    </dl>
                    <p className="appointment-review-resolution-guidance-progress">
                      Local progress: {approveResolutionChecklist.progressText}
                    </p>
                    {approveResolutionChecklist.total > 0 ? (
                      <ul>
                        {approveResolutionChecklist.items.map((item) => (
                          <li key={item.itemKey}>
                            <label>
                              <input
                                type="checkbox"
                                checked={item.reviewed}
                                onChange={() =>
                                  toggleResolutionChecklistReview({
                                    branchName: "approve",
                                    itemCode: item.code
                                  })
                                }
                              />
                              <span>{item.label}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="appointment-review-resolution-guidance-ready">
                        {approveResolutionGuidance?.explanation ||
                          "No checklist items are generated until trusted guidance is available."}{" "}
                        Execution remains disabled.
                      </p>
                    )}
                  </article>
                  <article>
                    <span>Reject guidance</span>
                    <dl>
                      <div>
                        <dt>branchOutcome</dt>
                        <dd>
                          {rejectResolutionGuidance?.branchOutcome ||
                            "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>category</dt>
                        <dd>
                          {rejectResolutionGuidance?.category || "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>requiredCheck</dt>
                        <dd>
                          {rejectResolutionGuidance?.requiredCheck ||
                            "not_run"}
                        </dd>
                      </div>
                      <div>
                        <dt>reasonCode</dt>
                        <dd>{rejectResolutionGuidance?.reasonCode || "none"}</dd>
                      </div>
                      <div>
                        <dt>blockingStage</dt>
                        <dd>
                          {rejectResolutionGuidance?.blockingStage || "none"}
                        </dd>
                      </div>
                      <div>
                        <dt>rerunAfterVerification</dt>
                        <dd>
                          {String(
                            rejectResolutionGuidance
                              ?.rerunAfterVerification === true
                          )}
                        </dd>
                      </div>
                    </dl>
                    <p className="appointment-review-resolution-guidance-progress">
                      Local progress: {rejectResolutionChecklist.progressText}
                    </p>
                    {rejectResolutionChecklist.total > 0 ? (
                      <ul>
                        {rejectResolutionChecklist.items.map((item) => (
                          <li key={item.itemKey}>
                            <label>
                              <input
                                type="checkbox"
                                checked={item.reviewed}
                                onChange={() =>
                                  toggleResolutionChecklistReview({
                                    branchName: "reject",
                                    itemCode: item.code
                                  })
                                }
                              />
                              <span>{item.label}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="appointment-review-resolution-guidance-ready">
                        {rejectResolutionGuidance?.explanation ||
                          "No checklist items are generated until trusted guidance is available."}{" "}
                        Execution remains disabled.
                      </p>
                    )}
                  </article>
                </div>

                <div className="appointment-review-resolution-guidance-summary">
                  <strong>Internal Follow-up Summary - not sent or saved</strong>
                  <pre>
                    {resolutionGuidanceResult?.internalFollowUpSummary ||
                      "No internal follow-up summary has been generated for this selected review."}
                  </pre>
                </div>
              </>
            ) : (
              <div className="appointment-review-resolution-guidance-empty">
                <strong>No selected appointment review</strong>
                <span>
                  Select a review to generate factual resolution guidance.
                </span>
              </div>
            )}
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-controlled-action-validation-preview"
            aria-labelledby="appointment-review-controlled-action-validation-preview-title"
          >
            <div>
              <span>
                Mock server context · Validation only · Controlled handling only
              </span>
              <h3 id="appointment-review-controlled-action-validation-preview-title">
                Controlled Action Validation Pipeline Dry-run
              </h3>
              <p>
                Route-backed full pipeline preview for selected metadata.
                Execution disabled. Executor unavailable. Not persisted. No
                action executed. The mock server boundary is not production
                authentication or authorization.
              </p>
            </div>

            {selectedReview ? (
              <>
                <div className="appointment-review-controlled-action-validation-badges">
                  <span>Mock server context</span>
                  <span>Validation only</span>
                  <span>Controlled handling only</span>
                  <span>Execution disabled</span>
                  <span>Executor unavailable</span>
                  <span>Not persisted</span>
                  <span>No action executed</span>
                </div>

                <div className="appointment-review-controlled-action-validation-controls">
                  <label>
                    Action intent metadata
                    <select
                      value={selectedControlledActionValidationIntent}
                      onChange={(event) =>
                        setSelectedControlledActionValidationIntent(
                          event.target.value
                        )
                      }
                    >
                      {CONTROLLED_ACTION_VALIDATION_INTENTS.map((actionIntent) => (
                        <option key={actionIntent} value={actionIntent}>
                          {actionIntent}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Request id preview
                    <input
                      type="text"
                      value={controlledActionValidationRequestId}
                      onChange={(event) =>
                        setControlledActionValidationRequestId(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Idempotency key preview
                    <input
                      type="text"
                      value={controlledActionValidationIdempotencyKey}
                      onChange={(event) =>
                        setControlledActionValidationIdempotencyKey(
                          event.target.value
                        )
                      }
                    />
                  </label>
                  <label>
                    Expected review version preview
                    <input
                      type="number"
                      min="1"
                      value={controlledActionValidationExpectedReviewVersion}
                      onChange={(event) =>
                        setControlledActionValidationExpectedReviewVersion(
                          event.target.value
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="appointment-review-controlled-action-validation-button"
                    onClick={runControlledActionValidationDryRun}
                    disabled={controlledActionValidationStatus === "loading"}
                  >
                    Run controlled action validation dry-run
                  </button>
                </div>

                <p className="appointment-review-controlled-action-validation-state">
                  {controlledActionValidationStatus === "loading"
                    ? "Controlled action validation dry-run is running. No action executed."
                    : null}
                  {controlledActionValidationStatus === "success" &&
                  controlledActionValidationResult?.accepted === true &&
                  controlledActionValidationResult?.eligibleForExecutorBoundary ===
                    true
                    ? "This validation-only mock pipeline passed all configured safety contracts. No executor exists and no action was executed."
                    : null}
                  {controlledActionValidationStatus === "success" &&
                  controlledActionValidationResult?.accepted === false
                    ? "Controlled action validation returned a safe rejection. No state or action changed."
                    : null}
                  {controlledActionValidationStatus === "success" &&
                  controlledActionValidationResult?.matchingReplay === true
                    ? "Matching replay returned by the route. replayExistingResultOnly is shown below; no new command or action was created."
                    : null}
                  {controlledActionValidationStatus === "failure"
                    ? controlledActionValidationError ||
                      "Controlled action validation dry-run failed safely."
                    : null}
                  {controlledActionValidationStatus === "idle"
                    ? "Idle: no controlled action validation pipeline result for this selected review."
                    : null}
                </p>

                <dl className="appointment-review-controlled-action-validation-grid">
                  <div>
                    <dt>reviewId</dt>
                    <dd>
                      {controlledActionValidationResult?.reviewId ||
                        selectedReview.id}
                    </dd>
                  </div>
                  <div>
                    <dt>accepted</dt>
                    <dd>
                      {controlledActionValidationResult
                        ? String(controlledActionValidationResult.accepted)
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>handlerCompleted</dt>
                    <dd>
                      {controlledActionValidationResult
                        ? String(
                            controlledActionValidationResult.handlerCompleted
                          )
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>failedStage</dt>
                    <dd>
                      {controlledActionValidationResult?.failedStage || "none"}
                    </dd>
                  </div>
                  <div>
                    <dt>matchingReplay</dt>
                    <dd>
                      {String(
                        controlledActionValidationResult?.matchingReplay === true
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>replayExistingResultOnly</dt>
                    <dd>
                      {String(
                        controlledActionValidationResult
                          ?.replayExistingResultOnly === true
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>eligibleForExecutorBoundary</dt>
                    <dd>
                      {controlledActionValidationResult
                        ? String(
                            controlledActionValidationResult
                              .eligibleForExecutorBoundary
                          )
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>code</dt>
                    <dd>
                      {controlledActionValidationResult?.code || "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>reason</dt>
                    <dd>{controlledActionValidationResult?.reason || "none"}</dd>
                  </div>
                  <div>
                    <dt>mock</dt>
                    <dd>{String(displayedControlledActionValidation.mock)}</dd>
                  </div>
                  <div>
                    <dt>dryRun</dt>
                    <dd>{String(displayedControlledActionValidation.dryRun)}</dd>
                  </div>
                  <div>
                    <dt>validationOnly</dt>
                    <dd>
                      {String(displayedControlledActionValidation.validationOnly)}
                    </dd>
                  </div>
                  <div>
                    <dt>controlledHandlingOnly</dt>
                    <dd>
                      {String(
                        displayedControlledActionValidation.controlledHandlingOnly
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>executionEnabled</dt>
                    <dd>
                      {String(
                        displayedControlledActionValidation.executionEnabled
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>executorAvailable</dt>
                    <dd>
                      {String(
                        displayedControlledActionValidation.executorAvailable
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>executionAvailable</dt>
                    <dd>
                      {String(
                        displayedControlledActionValidation.executionAvailable
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>executionRequested</dt>
                    <dd>
                      {String(
                        displayedControlledActionValidation.executionRequested
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>actionPerformed</dt>
                    <dd>
                      {String(displayedControlledActionValidation.actionPerformed)}
                    </dd>
                  </div>
                  <div>
                    <dt>commandDispatched</dt>
                    <dd>
                      {String(
                        displayedControlledActionValidation.commandDispatched
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>commandPersisted</dt>
                    <dd>
                      {String(
                        displayedControlledActionValidation.commandPersisted
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>bookingCreated</dt>
                    <dd>
                      {String(displayedControlledActionValidation.bookingCreated)}
                    </dd>
                  </div>
                  <div>
                    <dt>calendarChecked</dt>
                    <dd>
                      {String(displayedControlledActionValidation.calendarChecked)}
                    </dd>
                  </div>
                  <div>
                    <dt>appointmentCreated</dt>
                    <dd>
                      {String(
                        displayedControlledActionValidation.appointmentCreated
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>calendarEventCreated</dt>
                    <dd>
                      {String(
                        displayedControlledActionValidation.calendarEventCreated
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>databasePersisted</dt>
                    <dd>
                      {String(
                        displayedControlledActionValidation.databasePersisted
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>persistence</dt>
                    <dd>{displayedControlledActionValidation.persistence}</dd>
                  </div>
                </dl>

                <div className="appointment-review-controlled-action-validation-stages">
                  {controlledActionValidationStages.map((stage) => (
                    <div key={stage.key}>
                      <strong>{stage.label}</strong>
                      <span>status: {stage.status}</span>
                      <small>code: {stage.code}</small>
                    </div>
                  ))}
                </div>

                <div className="appointment-review-controlled-action-validation-list">
                  <strong>Pipeline display boundary</strong>
                  <span>
                    {CONTROLLED_ACTION_VALIDATION_INTENTS.join(", ")}
                  </span>
                  <small>
                    The request body contains only actionIntent, requestId,
                    idempotencyKey, and expectedReviewVersion. It never includes
                    reviewId, currentState, actor, permissions,
                    observedReviewVersion, priorIdempotencyObservation, or
                    executionPolicyContext.
                  </small>
                </div>
              </>
            ) : (
              <div className="appointment-review-controlled-action-validation-empty">
                <strong>No selected appointment review</strong>
                <span>
                  Select a review to inspect controlled action validation
                  pipeline dry-run details.
                </span>
              </div>
            )}
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-validation-receipt-preview"
            aria-labelledby="appointment-review-validation-receipt-preview-title"
          >
            <div>
              <span>Mock / dry-run context · Not persisted</span>
              <h3 id="appointment-review-validation-receipt-preview-title">
                Validation Decision Receipt Dry-run
              </h3>
              <p>
                Route-backed read-only receipt preview for the selected review.
                It displays the immutable validation decision receipt separately
                from the full pipeline preview.
              </p>
            </div>

            {selectedReview ? (
              <>
                <div className="appointment-review-validation-receipt-badges">
                  <span>Mock server context</span>
                  <span>Validation only</span>
                  <span>Read-only receipt</span>
                  <span>Receipt not persisted</span>
                  <span>No action executed</span>
                  <span>No command dispatched</span>
                  <span>No audit record stored</span>
                </div>

                <div className="appointment-review-validation-receipt-controls">
                  <label>
                    Proposed action intent
                    <select
                      value={selectedValidationReceiptActionIntent}
                      onChange={(event) =>
                        setSelectedValidationReceiptActionIntent(
                          event.target.value
                        )
                      }
                    >
                      {VALIDATION_RECEIPT_ACTION_INTENTS.map((actionIntent) => (
                        <option key={actionIntent} value={actionIntent}>
                          {actionIntent}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Request id preview
                    <input
                      type="text"
                      value={validationReceiptRequestId}
                      onChange={(event) =>
                        setValidationReceiptRequestId(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Idempotency key preview
                    <input
                      type="text"
                      value={validationReceiptIdempotencyKey}
                      onChange={(event) =>
                        setValidationReceiptIdempotencyKey(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Expected review version preview
                    <input
                      type="number"
                      min="1"
                      value={validationReceiptExpectedReviewVersion}
                      onChange={(event) =>
                        setValidationReceiptExpectedReviewVersion(
                          event.target.value
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="appointment-review-validation-receipt-button"
                    onClick={runValidationReceiptDryRun}
                    disabled={validationReceiptStatus === "loading"}
                  >
                    Run validation receipt dry-run
                  </button>
                </div>

                <p className="appointment-review-validation-receipt-state">
                  {validationReceiptStatus === "loading"
                    ? "Validation receipt dry-run is running. No action executed and no command dispatched."
                    : null}
                  {validationReceiptStatus === "success" &&
                  validationReceiptResult?.receiptOutcome === "validation_passed"
                    ? "The validation-only pipeline passed and an immutable in-memory decision receipt was constructed. No executor exists, no action was executed, and the receipt was not persisted."
                    : null}
                  {validationReceiptStatus === "success" &&
                  validationReceiptResult?.receiptOutcome === "validation_rejected"
                    ? "The validation request was rejected and an immutable rejection receipt was constructed. No action or state change occurred."
                    : null}
                  {validationReceiptStatus === "success" &&
                  validationReceiptResult?.receiptOutcome === "matching_replay"
                    ? "Matching replay returned by the route. replayExistingResultOnly is shown below; no new command or action was created."
                    : null}
                  {validationReceiptStatus === "failure"
                    ? validationReceiptError ||
                      "Validation receipt dry-run failed safely."
                    : null}
                  {validationReceiptStatus === "idle"
                    ? "Idle: no validation decision receipt result for this selected review."
                    : null}
                </p>

                <dl className="appointment-review-validation-receipt-grid">
                  <div>
                    <dt>reviewId</dt>
                    <dd>{validationReceiptResult?.reviewId || selectedReview.id}</dd>
                  </div>
                  <div>
                    <dt>accepted</dt>
                    <dd>
                      {validationReceiptResult
                        ? String(validationReceiptResult.accepted)
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>receiptHandlerCompleted</dt>
                    <dd>
                      {validationReceiptResult
                        ? String(validationReceiptResult.receiptHandlerCompleted)
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>validationReceiptConstructed</dt>
                    <dd>
                      {validationReceiptResult
                        ? String(
                            validationReceiptResult.validationReceiptConstructed
                          )
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>receiptOutcome</dt>
                    <dd>{validationReceiptResult?.receiptOutcome || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>code</dt>
                    <dd>{validationReceiptResult?.code || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>reason</dt>
                    <dd>{validationReceiptResult?.reason || "none"}</dd>
                  </div>
                  <div>
                    <dt>receiptPersisted</dt>
                    <dd>{String(displayedValidationReceipt.receiptPersisted)}</dd>
                  </div>
                  <div>
                    <dt>handlerResult.accepted</dt>
                    <dd>
                      {validationReceiptResult?.handlerResult
                        ? String(validationReceiptResult.handlerResult.accepted)
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>handlerResult.handlerCompleted</dt>
                    <dd>
                      {validationReceiptResult?.handlerResult
                        ? String(
                            validationReceiptResult.handlerResult.handlerCompleted
                          )
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>handlerResult.failedStage</dt>
                    <dd>
                      {validationReceiptResult?.handlerResult?.failedStage ||
                        "none"}
                    </dd>
                  </div>
                  <div>
                    <dt>handlerResult.matchingReplay</dt>
                    <dd>
                      {String(
                        validationReceiptResult?.handlerResult
                          ?.matchingReplay === true
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>handlerResult.replayExistingResultOnly</dt>
                    <dd>
                      {String(
                        validationReceiptResult?.handlerResult
                          ?.replayExistingResultOnly === true
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>handlerResult.eligibleForExecutorBoundary</dt>
                    <dd>
                      {validationReceiptResult?.handlerResult
                        ? String(
                            validationReceiptResult.handlerResult
                              .eligibleForExecutorBoundary
                          )
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>handlerResult.code</dt>
                    <dd>
                      {validationReceiptResult?.handlerResult?.code || "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>receiptType</dt>
                    <dd>
                      {validationReceiptResult?.validationReceipt?.receiptType ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>schemaVersion</dt>
                    <dd>
                      {validationReceiptResult?.validationReceipt?.schemaVersion ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>outcome</dt>
                    <dd>
                      {validationReceiptResult?.validationReceipt?.outcome ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>handlerCode</dt>
                    <dd>
                      {validationReceiptResult?.validationReceipt?.handlerCode ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>handlerCompleted</dt>
                    <dd>
                      {validationReceiptResult?.validationReceipt
                        ? String(
                            validationReceiptResult.validationReceipt
                              .handlerCompleted
                          )
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>failedStage</dt>
                    <dd>
                      {validationReceiptResult?.validationReceipt?.failedStage ||
                        "none"}
                    </dd>
                  </div>
                  <div>
                    <dt>matchingReplay</dt>
                    <dd>
                      {String(
                        validationReceiptResult?.validationReceipt
                          ?.matchingReplay === true
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>replayExistingResultOnly</dt>
                    <dd>
                      {String(
                        validationReceiptResult?.validationReceipt
                          ?.replayExistingResultOnly === true
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>eligibleForExecutorBoundary</dt>
                    <dd>
                      {validationReceiptResult?.validationReceipt
                        ? String(
                            validationReceiptResult.validationReceipt
                              .eligibleForExecutorBoundary
                          )
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>pipelineCode</dt>
                    <dd>
                      {validationReceiptResult?.validationReceipt?.pipelineCode ||
                        "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>mock</dt>
                    <dd>{String(displayedValidationReceipt.mock)}</dd>
                  </div>
                  <div>
                    <dt>dryRun</dt>
                    <dd>{String(displayedValidationReceipt.dryRun)}</dd>
                  </div>
                  <div>
                    <dt>validationOnly</dt>
                    <dd>{String(displayedValidationReceipt.validationOnly)}</dd>
                  </div>
                  <div>
                    <dt>controlledHandlingOnly</dt>
                    <dd>
                      {String(displayedValidationReceipt.controlledHandlingOnly)}
                    </dd>
                  </div>
                  <div>
                    <dt>executionEnabled</dt>
                    <dd>{String(displayedValidationReceipt.executionEnabled)}</dd>
                  </div>
                  <div>
                    <dt>executorAvailable</dt>
                    <dd>{String(displayedValidationReceipt.executorAvailable)}</dd>
                  </div>
                  <div>
                    <dt>executionAvailable</dt>
                    <dd>{String(displayedValidationReceipt.executionAvailable)}</dd>
                  </div>
                  <div>
                    <dt>executionRequested</dt>
                    <dd>{String(displayedValidationReceipt.executionRequested)}</dd>
                  </div>
                  <div>
                    <dt>actionPerformed</dt>
                    <dd>{String(displayedValidationReceipt.actionPerformed)}</dd>
                  </div>
                  <div>
                    <dt>commandDispatched</dt>
                    <dd>{String(displayedValidationReceipt.commandDispatched)}</dd>
                  </div>
                  <div>
                    <dt>commandPersisted</dt>
                    <dd>{String(displayedValidationReceipt.commandPersisted)}</dd>
                  </div>
                  <div>
                    <dt>bookingCreated</dt>
                    <dd>{String(displayedValidationReceipt.bookingCreated)}</dd>
                  </div>
                  <div>
                    <dt>calendarChecked</dt>
                    <dd>{String(displayedValidationReceipt.calendarChecked)}</dd>
                  </div>
                  <div>
                    <dt>appointmentCreated</dt>
                    <dd>{String(displayedValidationReceipt.appointmentCreated)}</dd>
                  </div>
                  <div>
                    <dt>calendarEventCreated</dt>
                    <dd>
                      {String(displayedValidationReceipt.calendarEventCreated)}
                    </dd>
                  </div>
                  <div>
                    <dt>databasePersisted</dt>
                    <dd>{String(displayedValidationReceipt.databasePersisted)}</dd>
                  </div>
                  <div>
                    <dt>persistence</dt>
                    <dd>{displayedValidationReceipt.persistence}</dd>
                  </div>
                </dl>

                <div className="appointment-review-validation-receipt-stages">
                  {validationReceiptStages.map((stage) => (
                    <div key={stage.key}>
                      <strong>{stage.label}</strong>
                      <span>status: {stage.status}</span>
                      <small>code: {stage.code}</small>
                    </div>
                  ))}
                </div>

                {validationReceiptCorrelation.length > 0 ? (
                  <div className="appointment-review-validation-receipt-correlation">
                    <strong>Validation correlation metadata</strong>
                    <span>Mock / dry-run context</span>
                    <small>Not persisted</small>
                    <dl>
                      {validationReceiptCorrelation.map(([fieldName, value]) => (
                        <div key={fieldName}>
                          <dt>{fieldName}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}

                <div className="appointment-review-validation-receipt-list">
                  <strong>Receipt display boundary</strong>
                  <span>{VALIDATION_RECEIPT_ACTION_INTENTS.join(", ")}</span>
                  <small>
                    The request body contains only actionIntent, requestId,
                    idempotencyKey, and expectedReviewVersion. It never includes
                    reviewId, currentState, actor, actorId, actorRole, role,
                    permissions, verifiedActorContext,
                    authenticationVerified, authorizationVerified,
                    observedReviewVersion, priorIdempotencyObservation,
                    executionPolicyContext, policy fields, execution claims, or
                    side-effect claims. Patient data, clinical data,
                    appointment details, calendar data, secrets, credentials,
                    tokens, cookies, headers, sessions, complete verified actor
                    context, complete execution policy context, and raw
                    dependency outputs are excluded.
                  </small>
                </div>
              </>
            ) : (
              <div className="appointment-review-validation-receipt-empty">
                <strong>No selected appointment review</strong>
                <span>
                  Select a review to inspect validation decision receipt
                  dry-run details.
                </span>
              </div>
            )}
          </section>
        ) : null}

        {!loading && !loadError ? (
          <section
            className="appointment-review-preconditions-preview"
            aria-labelledby="appointment-review-preconditions-preview-title"
          >
            <div>
              <span>
                Validation only · Controlled handling only · Not persisted
              </span>
              <h3 id="appointment-review-preconditions-preview-title">
                Controlled Action Preconditions Dry-run
              </h3>
              <p>
                Route-backed structural preview for future controlled handling.
                Not authenticated. Not authorized. No action executed. No
                booking, calendar, appointment, database, or persistence work is
                performed.
              </p>
            </div>

            {selectedReview ? (
              <>
                <div className="appointment-review-preconditions-controls">
                  <label>
                    Proposed action intent
                    <select
                      value={selectedPreconditionsActionIntent}
                      onChange={(event) =>
                        setSelectedPreconditionsActionIntent(event.target.value)
                      }
                    >
                      {PRECONDITIONS_ACTION_INTENTS.map((actionIntent) => (
                        <option key={actionIntent} value={actionIntent}>
                          {actionIntent}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Preview current state
                    <input
                      type="text"
                      value={preconditionsCurrentState}
                      onChange={(event) =>
                        setPreconditionsCurrentState(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Actor id
                    <input
                      type="text"
                      value={preconditionsActorId}
                      onChange={(event) =>
                        setPreconditionsActorId(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Actor role
                    <input
                      type="text"
                      value={preconditionsActorRole}
                      onChange={(event) =>
                        setPreconditionsActorRole(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Request id
                    <input
                      type="text"
                      value={preconditionsRequestId}
                      onChange={(event) =>
                        setPreconditionsRequestId(event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="appointment-review-preconditions-button"
                    onClick={runPreconditionsDryRun}
                    disabled={preconditionsDryRunStatus === "loading"}
                  >
                    Run preconditions dry-run
                  </button>
                </div>

                <p className="appointment-review-preconditions-state">
                  {preconditionsDryRunStatus === "loading"
                    ? "Preconditions dry-run is running. No action executed."
                    : null}
                  {preconditionsDryRunStatus === "success"
                    ? "Preconditions result received. Structural validation only; not authenticated, not authorized, not execution-ready."
                    : null}
                  {preconditionsDryRunStatus === "failure"
                    ? preconditionsDryRunError ||
                      "Preconditions dry-run failed safely. No action occurred."
                    : null}
                  {preconditionsDryRunStatus === "idle"
                    ? "Idle: no preconditions result for this selected review."
                    : null}
                </p>

                <dl className="appointment-review-preconditions-grid">
                  <div>
                    <dt>Review id</dt>
                    <dd>
                      {preconditionsDryRunResult?.reviewId || selectedReview.id}
                    </dd>
                  </div>
                  <div>
                    <dt>accepted</dt>
                    <dd>
                      {preconditionsDryRunResult
                        ? String(preconditionsDryRunResult.accepted)
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>eligibleForControlledHandling</dt>
                    <dd>
                      {preconditionsDryRunResult
                        ? String(
                            preconditionsDryRunResult.eligibleForControlledHandling
                          )
                        : "not_run"}
                    </dd>
                  </div>
                  <div>
                    <dt>controlledHandlingOnly</dt>
                    <dd>
                      {String(displayedPreconditionsDryRun.controlledHandlingOnly)}
                    </dd>
                  </div>
                  <div>
                    <dt>actionIntent</dt>
                    <dd>
                      {preconditionsDryRunResult?.actionIntent ||
                        selectedPreconditionsActionIntent}
                    </dd>
                  </div>
                  <div>
                    <dt>currentState</dt>
                    <dd>
                      {preconditionsDryRunResult?.currentState ||
                        preconditionsCurrentState}
                    </dd>
                  </div>
                  <div>
                    <dt>actorId</dt>
                    <dd>
                      {preconditionsDryRunResult?.actorId ||
                        preconditionsActorId}
                    </dd>
                  </div>
                  <div>
                    <dt>actorRole</dt>
                    <dd>
                      {preconditionsDryRunResult?.actorRole ||
                        preconditionsActorRole}
                    </dd>
                  </div>
                  <div>
                    <dt>requestId</dt>
                    <dd>
                      {preconditionsDryRunResult?.requestId ||
                        preconditionsRequestId}
                    </dd>
                  </div>
                  <div>
                    <dt>code</dt>
                    <dd>{preconditionsDryRunResult?.code || "not_run"}</dd>
                  </div>
                  <div>
                    <dt>reason</dt>
                    <dd>{preconditionsDryRunResult?.reason || "none"}</dd>
                  </div>
                  <div>
                    <dt>dryRun</dt>
                    <dd>{String(displayedPreconditionsDryRun.dryRun)}</dd>
                  </div>
                  <div>
                    <dt>validationOnly</dt>
                    <dd>
                      {String(displayedPreconditionsDryRun.validationOnly)}
                    </dd>
                  </div>
                  <div>
                    <dt>preconditionsChecked</dt>
                    <dd>
                      {String(displayedPreconditionsDryRun.preconditionsChecked)}
                    </dd>
                  </div>
                  <div>
                    <dt>executionAvailable</dt>
                    <dd>
                      {String(displayedPreconditionsDryRun.executionAvailable)}
                    </dd>
                  </div>
                  <div>
                    <dt>executionRequested</dt>
                    <dd>
                      {String(displayedPreconditionsDryRun.executionRequested)}
                    </dd>
                  </div>
                  <div>
                    <dt>actionPerformed</dt>
                    <dd>
                      {String(displayedPreconditionsDryRun.actionPerformed)}
                    </dd>
                  </div>
                  <div>
                    <dt>bookingCreated</dt>
                    <dd>
                      {String(displayedPreconditionsDryRun.bookingCreated)}
                    </dd>
                  </div>
                  <div>
                    <dt>calendarChecked</dt>
                    <dd>
                      {String(displayedPreconditionsDryRun.calendarChecked)}
                    </dd>
                  </div>
                  <div>
                    <dt>appointmentCreated</dt>
                    <dd>
                      {String(displayedPreconditionsDryRun.appointmentCreated)}
                    </dd>
                  </div>
                  <div>
                    <dt>calendarEventCreated</dt>
                    <dd>
                      {String(displayedPreconditionsDryRun.calendarEventCreated)}
                    </dd>
                  </div>
                  <div>
                    <dt>databasePersisted</dt>
                    <dd>
                      {String(displayedPreconditionsDryRun.databasePersisted)}
                    </dd>
                  </div>
                  <div>
                    <dt>persistence</dt>
                    <dd>{displayedPreconditionsDryRun.persistence}</dd>
                  </div>
                </dl>

                <div className="appointment-review-preconditions-list">
                  <strong>Preconditions result</strong>
                  <span>{PRECONDITIONS_ACTION_INTENTS.join(", ")}</span>
                  <small>
                    eligibleForControlledHandling true only means this structural
                    dry-run validation passed. It is not approval, rejection,
                    authentication, authorization, execution readiness, booking
                    readiness, or calendar readiness.
                  </small>
                </div>
              </>
            ) : (
              <div className="appointment-review-preconditions-empty">
                <strong>No selected appointment review</strong>
                <span>
                  Select a review to inspect controlled action preconditions
                  dry-run details.
                </span>
              </div>
            )}
          </section>
        ) : null}

        {!loading && !loadError && reviews.length > 0 ? (
          <div className="appointment-reviews-list">
            {filteredReviews.map((review) => {
              const readinessItem = queueReadinessItemsById[review.id] || null;
              const guidedSessionItem = getAppointmentReviewGuidedSessionItem(
                guidedReviewSession,
                review
              );

              return (
                <article className="appointment-review-item" key={review.id}>
                  <div>
                    <span>{review.status}</span>
                    <strong>
                      {review.selectedSlot?.doctorName || "Mock doctor"} ·{" "}
                      {review.selectedSlot?.time || "Saat bekleniyor"}
                    </strong>
                    {readinessItem ? (
                      <div className="appointment-review-readiness-badges">
                        <span>
                          {QUEUE_READINESS_LABELS[readinessItem.readiness] ||
                            readinessItem.readiness}
                        </span>
                        <small>
                          approve: {readinessItem.approve.outcome} · reject:{" "}
                          {readinessItem.reject.outcome}
                        </small>
                      </div>
                    ) : null}
                    {guidedSessionItem ? (
                      <div className="appointment-review-session-badges">
                        <span>{guidedSessionItem.status}</span>
                        <small>
                          version: {guidedSessionItem.observedReviewVersion}
                          {guidedSessionItem.versionChanged
                            ? " · local mark reset after version change"
                            : ""}
                        </small>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="appointment-review-preview-button"
                      onClick={() => setSelectedReviewId(review.id)}
                    >
                      Preview details
                    </button>
                  </div>
                  <dl>
                    <div>
                      <dt>Tedavi</dt>
                      <dd>{review.treatment || "Belirtilmedi"}</dd>
                    </div>
                    <div>
                      <dt>Gün</dt>
                      <dd>{review.selectedSlot?.dayLabel || review.day}</dd>
                    </div>
                    <div>
                      <dt>Readiness</dt>
                      <dd>
                        {readinessItem
                          ? QUEUE_READINESS_LABELS[readinessItem.readiness]
                          : "not_scanned"}
                      </dd>
                    </div>
                    <div>
                      <dt>Approve path</dt>
                      <dd>{readinessItem?.approve.outcome || "not_scanned"}</dd>
                    </div>
                    <div>
                      <dt>Reject path</dt>
                      <dd>{readinessItem?.reject.outcome || "not_scanned"}</dd>
                    </div>
                    <div>
                      <dt>Booking created</dt>
                      <dd>{String(review.bookingCreated === true)}</dd>
                    </div>
                    <div>
                      <dt>Calendar checked</dt>
                      <dd>{String(review.calendarChecked === true)}</dd>
                    </div>
                    <div>
                      <dt>Secretary confirmation</dt>
                      <dd>{String(review.requiresSecretaryConfirmation === true)}</dd>
                    </div>
                    <div>
                      <dt>Session status</dt>
                      <dd>{guidedSessionItem?.status || "not_started"}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        ) : null}

        {!loading &&
        !loadError &&
        reviews.length > 0 &&
        filteredReviews.length === 0 ? (
          <div className="appointment-reviews-empty-state">
            <strong>No reviews match the selected local filters</strong>
            <span>
              Readiness and guided-session filters combine locally. Filtering
              does not mutate, reorder, send, or persist the appointment review
              queue.
            </span>
          </div>
        ) : null}
      </article>
    </section>
  );
}

function isSafeActionIntentDryRunResponse(payload) {
  return (
    payload &&
    payload.status === "ok" &&
    payload.validationOnly === true &&
    payload.actionPerformed === false &&
    payload.bookingCreated === false &&
    payload.calendarChecked === false &&
    payload.databasePersisted === false &&
    payload.appointmentCreated === false &&
    payload.calendarEventCreated === false &&
    payload.requiresSecretaryConfirmation === true &&
    Array.isArray(payload.allowedActionIntents)
  );
}

function isSafeStateTransitionDryRunResponse(payload) {
  return (
    payload &&
    payload.dryRun === true &&
    payload.validationOnly === true &&
    payload.executionAvailable === false &&
    payload.actionPerformed === false &&
    payload.bookingCreated === false &&
    payload.calendarChecked === false &&
    payload.databasePersisted === false &&
    payload.appointmentCreated === false &&
    payload.calendarEventCreated === false &&
    payload.persistence === "not_persisted" &&
    typeof payload.accepted === "boolean" &&
    typeof payload.currentState === "string" &&
    typeof payload.event === "string" &&
    typeof payload.code === "string"
  );
}

function isSafePreconditionsDryRunResponse(payload) {
  return (
    payload &&
    payload.dryRun === true &&
    payload.validationOnly === true &&
    payload.preconditionsChecked === true &&
    payload.controlledHandlingOnly === true &&
    payload.executionAvailable === false &&
    payload.executionRequested === false &&
    payload.actionPerformed === false &&
    payload.bookingCreated === false &&
    payload.calendarChecked === false &&
    payload.databasePersisted === false &&
    payload.appointmentCreated === false &&
    payload.calendarEventCreated === false &&
    payload.persistence === "not_persisted" &&
    typeof payload.accepted === "boolean" &&
    typeof payload.eligibleForControlledHandling === "boolean" &&
    typeof payload.reviewId === "string" &&
    typeof payload.code === "string"
  );
}

function isSafeControlledActionValidationResponse(payload) {
  return (
    payload &&
    payload.mock === true &&
    payload.dryRun === true &&
    payload.validationOnly === true &&
    payload.controlledHandlingOnly === true &&
    payload.executionEnabled === false &&
    payload.executorAvailable === false &&
    payload.executionAvailable === false &&
    payload.executionRequested === false &&
    payload.actionPerformed === false &&
    payload.commandDispatched === false &&
    payload.commandPersisted === false &&
    payload.bookingCreated === false &&
    payload.calendarChecked === false &&
    payload.appointmentCreated === false &&
    payload.calendarEventCreated === false &&
    payload.databasePersisted === false &&
    payload.persistence === "not_persisted" &&
    typeof payload.accepted === "boolean" &&
    typeof payload.handlerCompleted === "boolean" &&
    typeof payload.matchingReplay === "boolean" &&
    typeof payload.replayExistingResultOnly === "boolean" &&
    typeof payload.eligibleForExecutorBoundary === "boolean" &&
    typeof payload.reviewId === "string" &&
    typeof payload.code === "string"
  );
}

function isSafeValidationReceiptResponse(payload) {
  return (
    payload &&
    payload.mock === true &&
    payload.dryRun === true &&
    payload.validationOnly === true &&
    payload.controlledHandlingOnly === true &&
    payload.executionEnabled === false &&
    payload.executorAvailable === false &&
    payload.executionAvailable === false &&
    payload.executionRequested === false &&
    payload.actionPerformed === false &&
    payload.commandDispatched === false &&
    payload.commandPersisted === false &&
    payload.receiptPersisted === false &&
    payload.bookingCreated === false &&
    payload.calendarChecked === false &&
    payload.appointmentCreated === false &&
    payload.calendarEventCreated === false &&
    payload.databasePersisted === false &&
    payload.persistence === "not_persisted" &&
    typeof payload.accepted === "boolean" &&
    typeof payload.receiptHandlerCompleted === "boolean" &&
    typeof payload.validationReceiptConstructed === "boolean" &&
    typeof payload.receiptOutcome === "string" &&
    typeof payload.reviewId === "string" &&
    typeof payload.code === "string" &&
    payload.validationReceipt &&
    typeof payload.validationReceipt === "object"
  );
}

function isSafeDecisionPreviewResponse(payload) {
  return (
    payload &&
    payload.mock === true &&
    payload.dryRun === true &&
    payload.decisionPreview === true &&
    payload.validationOnly === true &&
    payload.controlledHandlingOnly === true &&
    payload.executionEnabled === false &&
    payload.executorAvailable === false &&
    payload.executionAvailable === false &&
    payload.executionRequested === false &&
    payload.actionPerformed === false &&
    payload.commandDispatched === false &&
    payload.commandPersisted === false &&
    payload.receiptPersisted === false &&
    payload.bookingCreated === false &&
    payload.calendarChecked === false &&
    payload.appointmentCreated === false &&
    payload.calendarEventCreated === false &&
    payload.databasePersisted === false &&
    payload.persistence === "not_persisted" &&
    payload.reviewMutated === false &&
    payload.reviewStateChanged === false &&
    payload.repositoryVersionChanged === false &&
    typeof payload.accepted === "boolean" &&
    typeof payload.previewPassed === "boolean" &&
    typeof payload.previewBlocked === "boolean" &&
    typeof payload.reviewId === "string" &&
    typeof payload.code === "string" &&
    DECISION_PREVIEW_ACTIONS.includes(payload.action)
  );
}

function isSafeDecisionComparisonResponse(payload) {
  return (
    payload &&
    payload.mock === true &&
    payload.dryRun === true &&
    payload.decisionComparison === true &&
    payload.validationOnly === true &&
    payload.controlledHandlingOnly === true &&
    payload.executionEnabled === false &&
    payload.executorAvailable === false &&
    payload.executionAvailable === false &&
    payload.executionRequested === false &&
    payload.actionPerformed === false &&
    payload.commandDispatched === false &&
    payload.commandPersisted === false &&
    payload.receiptPersisted === false &&
    payload.bookingCreated === false &&
    payload.calendarChecked === false &&
    payload.appointmentCreated === false &&
    payload.calendarEventCreated === false &&
    payload.databasePersisted === false &&
    payload.persistence === "not_persisted" &&
    payload.reviewMutated === false &&
    payload.reviewStateChanged === false &&
    payload.repositoryVersionChanged === false &&
    typeof payload.accepted === "boolean" &&
    payload.mode === "validation_only" &&
    payload.comparison === "decision_paths" &&
    typeof payload.reviewId === "string" &&
    typeof payload.code === "string" &&
    Array.isArray(payload.actions) &&
    payload.actions.join(",") === "approve,reject" &&
    payload.paths &&
    typeof payload.paths === "object" &&
    payload.paths.approve &&
    payload.paths.reject &&
    payload.paths.approve.persistence === "not_persisted" &&
    payload.paths.reject.persistence === "not_persisted"
  );
}

function isSafeResolutionGuidanceResponse(payload) {
  return (
    payload &&
    payload.mock === true &&
    payload.dryRun === true &&
    payload.resolutionGuidancePreview === true &&
    payload.validationOnly === true &&
    payload.controlledHandlingOnly === true &&
    payload.executionEnabled === false &&
    payload.executorAvailable === false &&
    payload.executionAvailable === false &&
    payload.executionRequested === false &&
    payload.actionPerformed === false &&
    payload.commandDispatched === false &&
    payload.commandPersisted === false &&
    payload.receiptPersisted === false &&
    payload.bookingCreated === false &&
    payload.calendarChecked === false &&
    payload.appointmentCreated === false &&
    payload.calendarEventCreated === false &&
    payload.databasePersisted === false &&
    payload.persistence === "not_persisted" &&
    payload.reviewMutated === false &&
    payload.reviewStateChanged === false &&
    payload.repositoryVersionChanged === false &&
    payload.guidancePersisted === false &&
    payload.summaryPersisted === false &&
    payload.messageSent === false &&
    payload.taskAssigned === false &&
    typeof payload.accepted === "boolean" &&
    payload.mode === "validation_only" &&
    payload.preview === "resolution_guidance_preview" &&
    typeof payload.reviewId === "string" &&
    typeof payload.code === "string" &&
    ["both_paths_available", "approve_path_only", "reject_path_only", "both_paths_blocked"].includes(
      payload.readiness
    ) &&
    payload.approve &&
    payload.reject &&
    isSafeResolutionGuidanceBranch(payload.approve) &&
    isSafeResolutionGuidanceBranch(payload.reject) &&
    typeof payload.internalFollowUpSummary === "string"
  );
}

function isSafeResolutionGuidanceBranch(branch) {
  return (
    branch &&
    ["approve", "reject"].includes(branch.action) &&
    ["passed", "blocked"].includes(branch.branchOutcome) &&
    typeof branch.category === "string" &&
    typeof branch.requiredCheck === "string" &&
    Array.isArray(branch.checklist) &&
    branch.checklist.every(isSafeResolutionChecklistItem) &&
    branch.validationOnly === true &&
    branch.executionAvailable === false &&
    branch.actionPerformed === false &&
    branch.bookingCreated === false &&
    branch.calendarChecked === false &&
    branch.appointmentCreated === false &&
    branch.calendarEventCreated === false &&
    branch.databasePersisted === false &&
    branch.persistence === "not_persisted" &&
    branch.reviewMutated === false &&
    branch.repositoryVersionChanged === false &&
    branch.guidancePersisted === false &&
    branch.summaryPersisted === false &&
    branch.messageSent === false &&
    branch.taskAssigned === false
  );
}

function isSafeResolutionChecklistItem(item) {
  return (
    item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    typeof item.code === "string" &&
    typeof item.label === "string" &&
    item.code.length > 0 &&
    item.label.length > 0
  );
}

function isSafeQueueReadinessResponse(payload) {
  return (
    payload &&
    payload.mock === true &&
    payload.dryRun === true &&
    payload.queueReadinessPreview === true &&
    payload.validationOnly === true &&
    payload.controlledHandlingOnly === true &&
    payload.executionEnabled === false &&
    payload.executorAvailable === false &&
    payload.executionAvailable === false &&
    payload.executionRequested === false &&
    payload.actionPerformed === false &&
    payload.commandDispatched === false &&
    payload.commandPersisted === false &&
    payload.receiptPersisted === false &&
    payload.bookingCreated === false &&
    payload.calendarChecked === false &&
    payload.appointmentCreated === false &&
    payload.calendarEventCreated === false &&
    payload.databasePersisted === false &&
    payload.persistence === "not_persisted" &&
    payload.reviewMutated === false &&
    payload.reviewStateChanged === false &&
    payload.repositoryVersionChanged === false &&
    payload.queueMutated === false &&
    payload.queueCountChanged === false &&
    payload.mode === "validation_only" &&
    payload.preview === "queue_decision_readiness_preview" &&
    typeof payload.accepted === "boolean" &&
    payload.summary &&
    Number.isSafeInteger(payload.summary.totalReviewsScanned) &&
    Array.isArray(payload.items) &&
    payload.items.length === payload.summary.totalReviewsScanned &&
    payload.items.every(isSafeQueueReadinessItem)
  );
}

function isSafeQueueReadinessItem(item) {
  return (
    item &&
    typeof item.reviewId === "string" &&
    Object.hasOwn(QUEUE_READINESS_LABELS, item.readiness) &&
    item.validationOnly === true &&
    item.executionAvailable === false &&
    item.actionPerformed === false &&
    item.bookingCreated === false &&
    item.calendarChecked === false &&
    item.databasePersisted === false &&
    item.persistence === "not_persisted" &&
    item.reviewMutated === false &&
    item.repositoryVersionChanged === false &&
    item.approve &&
    item.reject &&
    ["passed", "blocked"].includes(item.approve.outcome) &&
    ["passed", "blocked"].includes(item.reject.outcome)
  );
}

function isSafeShiftHandoffResponse(payload) {
  return (
    payload &&
    payload.mock === true &&
    payload.dryRun === true &&
    payload.shiftHandoffPreview === true &&
    payload.validationOnly === true &&
    payload.controlledHandlingOnly === true &&
    payload.executionEnabled === false &&
    payload.executorAvailable === false &&
    payload.executionAvailable === false &&
    payload.executionRequested === false &&
    payload.actionPerformed === false &&
    payload.commandDispatched === false &&
    payload.commandPersisted === false &&
    payload.receiptPersisted === false &&
    payload.bookingCreated === false &&
    payload.calendarChecked === false &&
    payload.appointmentCreated === false &&
    payload.calendarEventCreated === false &&
    payload.databasePersisted === false &&
    payload.persistence === "not_persisted" &&
    payload.reviewMutated === false &&
    payload.reviewStateChanged === false &&
    payload.repositoryVersionChanged === false &&
    payload.queueMutated === false &&
    payload.queueCountChanged === false &&
    payload.handoffPersisted === false &&
    payload.handoffSent === false &&
    payload.mode === "validation_only" &&
    payload.preview === "secretary_shift_handoff_preview" &&
    payload.accepted === true &&
    payload.summary &&
    Number.isSafeInteger(payload.summary.totalReviews) &&
    Array.isArray(payload.items) &&
    payload.items.length === payload.summary.totalReviews &&
    payload.items.every(isSafeShiftHandoffItem) &&
    typeof payload.plainTextBrief === "string" &&
    !payload.plainTextBrief.includes("[object Object]")
  );
}

function isCurrentShiftHandoffResult(result, reviewIds) {
  return Boolean(
    result &&
      Array.isArray(result.items) &&
      reviewIdsMatch(
        result.items.map((item) => item.reviewId),
        reviewIds
      )
  );
}

function isExecutableDecisionPreviewForReview(result, review) {
  return Boolean(
    result &&
      review &&
      result.accepted === true &&
      result.previewPassed === true &&
      result.reviewId === review.id &&
      ["approve", "reject"].includes(result.action) &&
      typeof result.projectedNextState === "string" &&
      Number.isSafeInteger(result.observedReviewVersion) &&
      result.executionEnabled === false &&
      result.executionAvailable === false &&
      result.actionPerformed === false &&
      result.bookingCreated === false &&
      result.calendarChecked === false &&
      result.databasePersisted === false &&
      result.reviewStateChanged === false
  );
}

function isSafeDecisionExecutionResponse(payload) {
  return (
    payload &&
    payload.mock === true &&
    payload.dryRun === false &&
    payload.decisionExecution === true &&
    payload.validationOnly === false &&
    payload.controlledHandlingOnly === true &&
    payload.executionMode === "in_memory_demo" &&
    payload.storage === "in_memory" &&
    payload.durablePersistence === false &&
    payload.receiptPersisted === false &&
    payload.bookingCreated === false &&
    payload.calendarChecked === false &&
    payload.appointmentCreated === false &&
    payload.calendarEventCreated === false &&
    payload.calendarWritten === false &&
    payload.messageSent === false &&
    payload.emailSent === false &&
    payload.whatsappSent === false &&
    payload.databasePersisted === false &&
    payload.externalCallPerformed === false &&
    typeof payload.accepted === "boolean" &&
    typeof payload.reviewStateChanged === "boolean" &&
    typeof payload.repositoryVersionChanged === "boolean" &&
    (payload.accepted === false ||
      (payload.receipt &&
        payload.receipt.receiptKind ===
          "appointment_review_decision_execution_receipt_v1" &&
        payload.receipt.durablePersistence === false &&
        payload.receipt.receiptPersisted === false &&
        payload.receipt.bookingCreated === false &&
        payload.receipt.calendarWritten === false &&
        payload.receipt.messageSent === false))
  );
}

function isSafeAppointmentCreationResponse(payload) {
  return (
    payload &&
    payload.appointmentCreation === true &&
    payload.storage === "in_memory" &&
    payload.persistence === "not_persisted" &&
    payload.durablePersistence === false &&
    payload.calendarWritten === false &&
    payload.calendarEventCreated === false &&
    payload.messageSent === false &&
    payload.emailSent === false &&
    payload.whatsappSent === false &&
    payload.databasePersisted === false &&
    payload.externalCallPerformed === false &&
    typeof payload.accepted === "boolean" &&
    (payload.accepted === false ||
      (payload.receipt &&
        payload.receipt.receiptKind ===
          "appointment_review_appointment_creation_receipt_v1" &&
        payload.receipt.durablePersistence === false &&
        payload.receipt.calendarWritten === false &&
        payload.receipt.messageSent === false))
  );
}

function isSafeCalendarSyncResponse(payload) {
  return (
    payload &&
    payload.calendarSync === true &&
    payload.storage === "in_memory" &&
    payload.appointmentPersistence === "not_persisted" &&
    payload.durableAppointmentPersistence === false &&
    payload.messageSent === false &&
    payload.emailSent === false &&
    payload.whatsappSent === false &&
    payload.databasePersisted === false &&
    typeof payload.accepted === "boolean" &&
    (payload.accepted === false ||
      (payload.receipt &&
        payload.receipt.receiptKind === "appointment_calendar_sync_receipt_v1" &&
        payload.receipt.durableAppointmentPersistence === false &&
        payload.receipt.messageSent === false))
  );
}

function isSafeConfirmationDispatchResponse(payload) {
  return (
    payload &&
    payload.confirmationDispatch === true &&
    payload.storage === "in_memory" &&
    payload.appointmentPersistence === "not_persisted" &&
    payload.durableAppointmentPersistence === false &&
    payload.realPatientDelivery === false &&
    payload.whatsappSent === false &&
    payload.emailSent === false &&
    payload.smsSent === false &&
    payload.calendarWritten === false &&
    payload.calendarEventCreated === false &&
    payload.databasePersisted === false &&
    typeof payload.accepted === "boolean" &&
    !String(payload.maskedDestinationLabel || "").includes("+") &&
    (payload.accepted === false ||
      (payload.receipt &&
        payload.receipt.receiptKind ===
          "appointment_confirmation_dispatch_receipt_v1" &&
        payload.receipt.realPatientDelivery === false &&
        payload.receipt.durableAppointmentPersistence === false &&
        payload.receipt.calendarWritten === false &&
        !String(payload.receipt.maskedDestinationLabel || "").includes("+")))
  );
}

function getAppointmentCreationCandidate(review) {
  if (!review || review.metadata?.controlledActionState !== "needs_clinic_review") {
    return null;
  }

  if (review.metadata?.linkedAppointmentId) {
    return null;
  }

  const selectedSlot = review.selectedSlot || {};
  const startAt = selectedSlot.startAt || selectedSlot.start_at;
  const endAt = selectedSlot.endAt || selectedSlot.end_at;
  const appointmentPurpose =
    review.appointmentPurpose || selectedSlot.appointmentPurpose;
  const appointmentPurposeLabel =
    review.appointmentPurposeLabel || selectedSlot.appointmentPurposeLabel;

  if (
    !selectedSlot.id ||
    !selectedSlot.doctorId ||
    !selectedSlot.doctorName ||
    !startAt ||
    !endAt ||
    !Number.isSafeInteger(selectedSlot.durationMinutes) ||
    !appointmentPurpose ||
    !appointmentPurposeLabel
  ) {
    return null;
  }

  return {
    reviewId: review.id,
    expectedReviewVersion: inferReviewVersion(review),
    selectedSlotId: selectedSlot.id,
    doctorId: selectedSlot.doctorId,
    doctorName: selectedSlot.doctorName,
    startAt,
    endAt,
    durationMinutes: selectedSlot.durationMinutes,
    appointmentPurpose,
    appointmentPurposeLabel
  };
}

function isConfirmationDispatchEligibleAppointment(appointment) {
  return (
    appointment &&
    appointment.id &&
    Number.isSafeInteger(appointment.version) &&
    appointment.confirmationMessageLinked !== true &&
    !appointment.confirmationProviderMessageId &&
    appointment.outboundDestination?.maskedLabel &&
    !String(appointment.outboundDestination.maskedLabel).includes("+") &&
    appointment.doctor?.name &&
    appointment.startAt &&
    appointment.endAt &&
    appointment.appointmentPurposeLabel
  );
}

function buildConfirmationDispatchIdempotencyKey(appointment) {
  return ["confirmation_dispatch", appointment.id, appointment.version]
    .map((part) => String(part || "").replace(/[^A-Za-z0-9:_-]+/g, "_"))
    .join(":")
    .slice(0, 128);
}

function isCalendarSyncEligibleAppointment(appointment) {
  return (
    appointment &&
    appointment.id &&
    Number.isSafeInteger(appointment.version) &&
    appointment.calendarLinked !== true &&
    !appointment.calendarEventId &&
    appointment.doctor?.name &&
    appointment.startAt &&
    appointment.endAt &&
    Number.isSafeInteger(appointment.durationMinutes)
  );
}

function buildCalendarSyncIdempotencyKey(appointment) {
  return [
    "calendar_sync",
    appointment.id,
    appointment.version,
    appointment.startAt,
    appointment.endAt
  ]
    .map((part) => String(part || "").replace(/[^A-Za-z0-9:_-]+/g, "_"))
    .join(":")
    .slice(0, 128);
}

function getAppointmentLifecycleEndpoint(operation) {
  return {
    reschedule: "reschedule",
    cancellation: "cancel",
    calendar_reschedule: "calendar-reschedule-sync",
    calendar_cancellation: "calendar-cancellation-sync",
    reschedule_notification: "reschedule-notification",
    cancellation_notification: "cancellation-notification"
  }[operation];
}

function getAppointmentLifecycleConfirmation(operation) {
  return {
    reschedule: RESCHEDULE_CONFIRMATION,
    cancellation: CANCELLATION_CONFIRMATION,
    calendar_reschedule: CALENDAR_RESCHEDULE_CONFIRMATION,
    calendar_cancellation: CALENDAR_CANCELLATION_CONFIRMATION,
    reschedule_notification: RESCHEDULE_NOTIFICATION_CONFIRMATION,
    cancellation_notification: CANCELLATION_NOTIFICATION_CONFIRMATION
  }[operation];
}

function buildAppointmentLifecycleIdempotencyKey(appointment, operation, slotId) {
  return [
    "appointment_lifecycle",
    operation,
    appointment.id,
    appointment.version,
    slotId || ""
  ]
    .map((part) => String(part || "").replace(/[^A-Za-z0-9:_-]+/g, "_"))
    .join(":")
    .slice(0, 128);
}

function isScheduledAppointment(appointment) {
  return (appointment?.appointmentStatus || "scheduled") === "scheduled";
}

function isCalendarChangeFollowUpEligible(appointment, operation) {
  const expected =
    operation === "calendar_reschedule"
      ? "update_required"
      : "cancellation_required";
  return (
    appointment &&
    appointment.calendarFollowUpStatus === expected &&
    appointment.calendarEventId
  );
}

function isNotificationFollowUpEligible(appointment, operation) {
  const expected =
    operation === "reschedule_notification"
      ? "reschedule_required"
      : "cancellation_required";
  return appointment && appointment.notificationFollowUpStatus === expected;
}

function inferReviewVersion(review) {
  if (Number.isSafeInteger(review.version)) {
    return review.version;
  }

  if (review.metadata?.linkedAppointmentId) {
    return 3;
  }

  if (review.metadata?.controlledActionState === "needs_clinic_review") {
    return 2;
  }

  return 1;
}

function isSafeShiftHandoffItem(item) {
  return (
    item &&
    typeof item.reviewId === "string" &&
    typeof item.trustedCurrentState === "string" &&
    Number.isSafeInteger(item.observedReviewVersion) &&
    Object.hasOwn(QUEUE_READINESS_LABELS, item.readiness) &&
    Array.isArray(item.branches) &&
    item.branches.length === 2 &&
    item.branches.every(isSafeShiftHandoffBranch) &&
    Array.isArray(item.unresolvedChecks) &&
    Array.isArray(item.followUpCategories) &&
    item.branches.every((branch) => typeof branch.guidanceCategory === "string") &&
    item.validationOnly === true &&
    item.executionEnabled === false &&
    item.executionAvailable === false &&
    item.actionPerformed === false &&
    item.bookingCreated === false &&
    item.calendarChecked === false &&
    item.databasePersisted === false &&
    item.persistence === "not_persisted" &&
    item.reviewMutated === false &&
    item.repositoryVersionChanged === false
  );
}

function isSafeShiftHandoffBranch(branch) {
  return (
    branch &&
    ["approve", "reject"].includes(branch.action) &&
    ["passed", "blocked"].includes(branch.outcome) &&
    typeof branch.requiredCheck === "string" &&
    typeof branch.followUpCategory === "string" &&
    typeof branch.guidanceCategory === "string" &&
    branch.executionEnabled === false &&
    branch.executionAvailable === false &&
    branch.actionPerformed === false &&
    branch.bookingCreated === false &&
    branch.calendarChecked === false &&
    branch.databasePersisted === false &&
    branch.persistence === "not_persisted"
  );
}

function getCurrentQueueReadinessItems({ result, reviewIds }) {
  if (
    !result ||
    !Array.isArray(result.items) ||
    !reviewIdsMatch(
      result.items.map((item) => item.reviewId),
      reviewIds
    )
  ) {
    return [];
  }

  return result.items;
}

function reviewIdsMatch(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function getControlledActionValidationStages(result) {
  return CONTROLLED_ACTION_VALIDATION_STAGE_LABELS.map(([key, label]) => {
    const stage = result?.pipelineResult?.stages?.[key];

    return {
      key,
      label,
      status:
        stage && typeof stage.status === "string" ? stage.status : "not_run",
      code: stage && typeof stage.code === "string" ? stage.code : "not_run"
    };
  });
}

function getValidationReceiptStages(result) {
  return VALIDATION_RECEIPT_STAGE_LABELS.flatMap(([key, label]) => {
    const stage = result?.validationReceipt?.stages?.[key];

    if (!stage || typeof stage.status !== "string") {
      return [];
    }

    return [
      {
        key,
        label,
        status: stage.status,
        code: typeof stage.code === "string" ? stage.code : "not_run"
      }
    ];
  });
}

function getValidationReceiptCorrelation(result) {
  const correlation = result?.validationReceipt?.correlation;

  if (!correlation || typeof correlation !== "object") {
    return [];
  }

  return VALIDATION_RECEIPT_CORRELATION_FIELDS.flatMap((fieldName) => {
    const value = correlation[fieldName];

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return [[fieldName, value]];
    }

    return [];
  });
}

function isAbortError(error) {
  return Boolean(error && typeof error === "object" && error.name === "AbortError");
}
