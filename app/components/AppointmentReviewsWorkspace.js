"use client";

import { useEffect, useRef, useState } from "react";

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
  const [decisionComparisonStatus, setDecisionComparisonStatus] =
    useState("idle");
  const [decisionComparisonResult, setDecisionComparisonResult] =
    useState(null);
  const [decisionComparisonError, setDecisionComparisonError] = useState("");
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
  const decisionComparisonRequestSequenceRef = useRef(0);
  const activeDecisionComparisonRequestRef = useRef(null);
  const activeDecisionComparisonAbortRef = useRef(null);
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
  const displayedDecisionComparison =
    decisionComparisonResult || INITIAL_DECISION_COMPARISON;
  const approveComparisonPath = decisionComparisonResult?.paths?.approve || null;
  const rejectComparisonPath = decisionComparisonResult?.paths?.reject || null;

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

        setReviews(nextReviews);
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
        setSelectedReviewId("");
        setLoading(false);
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
      invalidateDecisionComparisonRequest();
    };
  }, []);

  useEffect(() => {
    selectedReviewIdRef.current = selectedReviewId;
    invalidateStateTransitionDryRunRequest();
    invalidatePreconditionsDryRunRequest();
    invalidateControlledActionValidationRequest();
    invalidateValidationReceiptRequest();
    invalidateDecisionPreviewRequest();
    invalidateDecisionComparisonRequest();
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
    setDecisionComparisonStatus("idle");
    setDecisionComparisonResult(null);
    setDecisionComparisonError("");
  }, [selectedReviewId]);

  async function runActionIntentDryRun() {
    invalidateDecisionComparisonRequest();

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
            {reviews.map((review) => (
              <article className="appointment-review-item" key={review.id}>
                <div>
                  <span>{review.status}</span>
                  <strong>
                    {review.selectedSlot?.doctorName || "Mock doctor"} ·{" "}
                    {review.selectedSlot?.time || "Saat bekleniyor"}
                  </strong>
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
                </dl>
              </article>
            ))}
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
