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
  const selectedReviewIdRef = useRef("");
  const selectedReview =
    reviews.find((review) => review.id === selectedReviewId) || null;
  const displayedActionIntentDryRun =
    actionIntentDryRunResult || ACTION_INTENT_DRY_RUN;
  const displayedStateTransitionDryRun =
    stateTransitionDryRunResult || INITIAL_STATE_TRANSITION_DRY_RUN;

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
    selectedReviewIdRef.current = selectedReviewId;
    setActionIntentDryRunStatus("idle");
    setActionIntentDryRunResult(null);
    setActionIntentDryRunError("");
    setStateTransitionDryRunStatus("idle");
    setStateTransitionDryRunResult(null);
    setStateTransitionDryRunError("");
    setStateTransitionPreviewCurrentState(INITIAL_PREVIEW_CURRENT_STATE);
    setSelectedStateTransitionEvent(INITIAL_PREVIEW_EVENT);
  }, [selectedReviewId]);

  async function runActionIntentDryRun() {
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
          body: JSON.stringify({
            currentState: currentStateForRequest,
            event: eventForRequest
          })
        }
      );
      const payload = await response.json();

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

      if (selectedReviewIdRef.current !== reviewIdForRequest) {
        return;
      }

      setStateTransitionDryRunResult(payload);
      setStateTransitionDryRunStatus("success");
    } catch (error) {
      if (selectedReviewIdRef.current !== reviewIdForRequest) {
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
