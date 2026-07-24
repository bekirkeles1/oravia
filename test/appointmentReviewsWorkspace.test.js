const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const pageSource = fs.readFileSync("app/page.js", "utf8");
const workspaceSource = fs.readFileSync(
  "app/components/AppointmentReviewsWorkspace.js",
  "utf8"
);
const cssSource = fs.readFileSync("app/globals.css", "utf8");
const followUpBoardHelperSource = fs.readFileSync(
  "src/secretary/appointmentReviewFollowUpFocusBoard.js",
  "utf8"
);
const decisionExecutionRouteSource = fs.readFileSync(
  "app/api/secretary/appointment-reviews/[id]/decision-execution/route.js",
  "utf8"
);

test("dashboard page exposes appointment reviews as a separate workspace panel", () => {
  assert.match(
    pageSource,
    /import AppointmentReviewsWorkspace from "\.\/components\/AppointmentReviewsWorkspace"/
  );
  assert.match(pageSource, /href="#appointment-reviews"/);
  assert.match(pageSource, /Appointment Reviews/);
  assert.match(pageSource, /<section id="appointment-reviews">/);
  assert.match(pageSource, /<AppointmentReviewsWorkspace \/>/);
});

test("appointment reviews workspace fetches the read-only mock route", () => {
  assert.match(
    workspaceSource,
    /fetch\("\/api\/secretary\/appointment-reviews"\)/
  );
  assert.match(workspaceSource, /Pending Appointment Reviews/);
  assert.match(workspaceSource, /No pending appointment reviews/);
  assert.match(workspaceSource, /Read-only mock queue/);
  assert.match(workspaceSource, /Appointment review queue yükleniyor/);
  assert.match(workspaceSource, /Appointment review queue API yanıtı başarısız oldu/);
});

test("appointment reviews workspace keeps safety boundaries visible", () => {
  assert.match(workspaceSource, /Mock read-only/);
  assert.match(workspaceSource, /read_only/);
  assert.match(workspaceSource, /not_persisted/);
  assert.match(workspaceSource, /No booking created/);
  assert.match(workspaceSource, /Calendar not checked/);
  assert.match(workspaceSource, /Secretary confirmation is\s+required/);
  assert.match(workspaceSource, /Safety contract/);
  assert.match(workspaceSource, /usesDatabase/);
  assert.match(workspaceSource, /No database\s+ persistence is used/);
  assert.match(workspaceSource, /randevu\s+oluşturmaz/);
  assert.match(workspaceSource, /takvim çakışması kontrolü yapmaz/);
});

test("appointment reviews workspace shows validation-only action intent dry-run preview", () => {
  assert.match(workspaceSource, /ACTION_INTENT_DRY_RUN/);
  assert.match(workspaceSource, /runActionIntentDryRun/);
  assert.match(workspaceSource, /isSafeActionIntentDryRunResponse/);
  assert.match(workspaceSource, /selectedReviewIdRef/);
  assert.match(workspaceSource, /Action intent dry-run preview/);
  assert.match(workspaceSource, /Validation dry-run/);
  assert.match(workspaceSource, /Run validation-only preview/);
  assert.match(
    workspaceSource,
    /\/api\/secretary\/appointment-reviews\/\$\{encodeURIComponent/
  );
  assert.match(workspaceSource, /\/action-intent`/);
  assert.match(workspaceSource, /method: "POST"/);
  assert.match(workspaceSource, /actionIntent: "needs_clinic_review"/);
  assert.match(workspaceSource, /selectedReview \?/);
  assert.match(workspaceSource, /Review id/);
  assert.match(workspaceSource, /selectedReview\.id/);
  assert.match(workspaceSource, /Route action intent/);
  assert.match(workspaceSource, /validationOnly/);
  assert.match(workspaceSource, /validationOnly:\s+true/);
  assert.match(workspaceSource, /actionPerformed/);
  assert.match(workspaceSource, /actionPerformed:\s+false/);
  assert.match(workspaceSource, /bookingCreated/);
  assert.match(workspaceSource, /bookingCreated:\s+false/);
  assert.match(workspaceSource, /calendarChecked/);
  assert.match(workspaceSource, /calendarChecked:\s+false/);
  assert.match(workspaceSource, /databasePersisted/);
  assert.match(workspaceSource, /databasePersisted:\s+false/);
  assert.match(workspaceSource, /appointmentCreated/);
  assert.match(workspaceSource, /appointmentCreated:\s+false/);
  assert.match(workspaceSource, /calendarEventCreated/);
  assert.match(workspaceSource, /calendarEventCreated:\s+false/);
  assert.match(workspaceSource, /requiresSecretaryConfirmation/);
  assert.match(workspaceSource, /requiresSecretaryConfirmation:\s+true/);
  assert.match(workspaceSource, /approve_intent/);
  assert.match(workspaceSource, /reject_intent/);
  assert.match(workspaceSource, /needs_clinic_review/);
  assert.match(workspaceSource, /ask_patient_clarification/);
  assert.match(workspaceSource, /actionIntentDryRunStatus/);
  assert.match(workspaceSource, /setActionIntentDryRunStatus\("idle"\)/);
  assert.match(workspaceSource, /setActionIntentDryRunResult\(null\)/);
  assert.match(workspaceSource, /setActionIntentDryRunError\(""\)/);
  assert.match(workspaceSource, /selectedReviewIdRef\.current !== reviewIdForRequest/);
  assert.match(workspaceSource, /Validation-only preview is running/);
  assert.match(workspaceSource, /Validation-only route result received/);
  assert.match(workspaceSource, /Validation-only action intent preview failed safely/);
  assert.match(workspaceSource, /Validation-only route response was unsafe or incomplete/);
  assert.match(workspaceSource, /Idle: route-backed validation-only preview/);
  assert.match(
    workspaceSource,
    /Select a review to inspect validation-only action intent\s+details/
  );
});

test("appointment reviews workspace shows route-backed state transition dry-run preview", () => {
  assert.match(workspaceSource, /STATE_TRANSITION_DRY_RUN_EVENTS/);
  assert.match(workspaceSource, /INITIAL_PREVIEW_CURRENT_STATE/);
  assert.match(workspaceSource, /INITIAL_PREVIEW_EVENT/);
  assert.match(workspaceSource, /INITIAL_STATE_TRANSITION_DRY_RUN/);
  assert.match(workspaceSource, /runStateTransitionDryRun/);
  assert.match(workspaceSource, /isSafeStateTransitionDryRunResponse/);
  assert.match(workspaceSource, /State Transition Dry-run/);
  assert.match(workspaceSource, /Validation only · Not persisted/);
  assert.match(workspaceSource, /No action executed/);
  assert.match(workspaceSource, /Preview current state/);
  assert.match(workspaceSource, /Preview next state/);
  assert.match(workspaceSource, /pending_secretary_review/);
  assert.match(workspaceSource, /check_validation_only_intent/);
  assert.match(workspaceSource, /require_clinic_review/);
  assert.match(workspaceSource, /reject_action_intent/);
  assert.match(
    workspaceSource,
    /\/api\/secretary\/appointment-reviews\/\$\{encodeURIComponent/
  );
  assert.match(workspaceSource, /\/state-transition`/);
  assert.match(workspaceSource, /method: "POST"/);
  assert.match(workspaceSource, /currentState: currentStateForRequest/);
  assert.match(workspaceSource, /event: eventForRequest/);
  assert.match(workspaceSource, /accepted/);
  assert.match(workspaceSource, /nextState/);
  assert.match(workspaceSource, /code/);
  assert.match(workspaceSource, /reason/);
  assert.match(workspaceSource, /executionAvailable/);
  assert.match(workspaceSource, /persistence/);
  assert.match(workspaceSource, /stateTransitionDryRunStatus === "loading"/);
  assert.match(workspaceSource, /disabled=\{stateTransitionDryRunStatus === "loading"\}/);
  assert.match(workspaceSource, /State transition dry-run is running/);
  assert.match(workspaceSource, /State transition dry-run result received/);
  assert.match(workspaceSource, /State transition dry-run failed safely/);
  assert.match(workspaceSource, /No transition occurred/);
  assert.match(workspaceSource, /setStateTransitionDryRunStatus\("idle"\)/);
  assert.match(workspaceSource, /setStateTransitionDryRunResult\(null\)/);
  assert.match(workspaceSource, /setStateTransitionDryRunError\(""\)/);
  assert.match(
    workspaceSource,
    /setStateTransitionPreviewCurrentState\(INITIAL_PREVIEW_CURRENT_STATE\)/
  );
  assert.match(
    workspaceSource,
    /setSelectedStateTransitionEvent\(INITIAL_PREVIEW_EVENT\)/
  );
  assert.match(workspaceSource, /selectedReviewIdRef\.current !== reviewIdForRequest/);
  assert.match(
    workspaceSource,
    /Preview\s+result does not update the selected review object/
  );
});

test("appointment reviews workspace shows end-to-end decision preview dry-run controls", () => {
  const decisionRequestSource = workspaceSource.slice(
    workspaceSource.indexOf(")}/decision-preview`"),
    workspaceSource.indexOf(
      "const payload = await response.json();",
      workspaceSource.indexOf(")}/decision-preview`")
    )
  );

  assert.match(workspaceSource, /DECISION_PREVIEW_ACTIONS/);
  assert.match(workspaceSource, /INITIAL_DECISION_PREVIEW/);
  assert.match(workspaceSource, /runDecisionPreview/);
  assert.match(workspaceSource, /isSafeDecisionPreviewResponse/);
  assert.match(workspaceSource, /Decision Preview Dry-run/);
  assert.match(workspaceSource, /End-to-end dry-run · Trusted server context/);
  assert.match(workspaceSource, /Approve Preview \(dry-run\)/);
  assert.match(workspaceSource, /Reject Preview \(dry-run\)/);
  assert.match(workspaceSource, /No approval or rejection is executed/);
  assert.match(workspaceSource, /Review unchanged/);
  assert.match(workspaceSource, /Not\s+persisted/);
  assert.match(workspaceSource, /action_intent/);
  assert.match(workspaceSource, /preconditions/);
  assert.match(workspaceSource, /state_transition/);
  assert.match(workspaceSource, /controlled_action_validation/);
  assert.match(workspaceSource, /validation_decision_receipt/);
  assert.match(workspaceSource, /The client sends only action/);
  assert.match(
    workspaceSource,
    /Server-side trusted context\s+provides current state and observed version/
  );
  assert.match(
    workspaceSource,
    /\/api\/secretary\/appointment-reviews\/\$\{encodeURIComponent/
  );
  assert.match(workspaceSource, /\/decision-preview`/);
  assert.match(decisionRequestSource, /method: "POST"/);
  assert.match(decisionRequestSource, /body: JSON\.stringify\(/);
  assert.match(decisionRequestSource, /action: actionForRequest/);
  assert.doesNotMatch(decisionRequestSource, /reviewId:/);
  assert.doesNotMatch(decisionRequestSource, /currentState:/);
  assert.doesNotMatch(decisionRequestSource, /observedReviewVersion/);
  assert.doesNotMatch(decisionRequestSource, /expectedReviewVersion/);
  assert.doesNotMatch(decisionRequestSource, /actor:/);
  assert.doesNotMatch(decisionRequestSource, /idempotencyKey/);
  assert.match(workspaceSource, /requested action/);
  assert.match(workspaceSource, /trustedCurrentState/);
  assert.match(workspaceSource, /projectedNextState/);
  assert.match(workspaceSource, /observedReviewVersion/);
  assert.match(workspaceSource, /receiptOutcome/);
  assert.match(workspaceSource, /reviewMutated/);
  assert.match(workspaceSource, /reviewStateChanged/);
  assert.match(workspaceSource, /repositoryVersionChanged/);
});

test("appointment reviews workspace hardens decision preview against stale responses", () => {
  assert.match(workspaceSource, /decisionPreviewRequestSequenceRef/);
  assert.match(workspaceSource, /activeDecisionPreviewRequestRef/);
  assert.match(workspaceSource, /activeDecisionPreviewAbortRef/);
  assert.match(workspaceSource, /createDecisionPreviewRequest/);
  assert.match(workspaceSource, /invalidateDecisionPreviewRequest/);
  assert.match(workspaceSource, /isActiveDecisionPreviewRequest/);
  assert.match(workspaceSource, /new AbortController\(\)/);
  assert.match(workspaceSource, /activeDecisionPreviewAbortRef\.current\.abort\(\)/);
  assert.match(workspaceSource, /signal: activeAbortController\?\.signal/);
  assert.match(workspaceSource, /requestId/);
  assert.match(workspaceSource, /reviewId: reviewIdForRequest/);
  assert.match(workspaceSource, /action: actionForRequest/);
  assert.match(workspaceSource, /activeRequest\.requestId === requestId/);
  assert.match(workspaceSource, /activeRequest\.reviewId === reviewId/);
  assert.match(workspaceSource, /activeRequest\.action === action/);
  assert.match(workspaceSource, /selectedReviewIdRef\.current === reviewId/);
  assert.match(
    workspaceSource,
    /if \(\s+!\s*isActiveDecisionPreviewRequest\(\{[\s\S]*requestId,[\s\S]*reviewId: reviewIdForRequest,[\s\S]*action: actionForRequest[\s\S]*\}\)\s+\) \{\s+return;\s+\}/
  );
  assert.match(workspaceSource, /if \(isAbortError\(error\)\) \{\s+return;\s+\}/);
  assert.match(
    workspaceSource,
    /setDecisionPreviewResult\(payload\);\s+setDecisionPreviewStatus\("success"\);/
  );
  assert.match(
    workspaceSource,
    /setDecisionPreviewResult\(null\);\s+setDecisionPreviewStatus\("failure"\);/
  );
  assert.match(
    workspaceSource,
    /setDecisionPreviewStatus\("loading"\);\s+setDecisionPreviewResult\(null\);\s+setDecisionPreviewError\(""\);/
  );
  assert.match(
    workspaceSource,
    /if \(decisionPreviewStatus === "loading"\) \{\s+return;\s+\}/
  );
  assert.match(
    workspaceSource,
    /disabled=\{decisionPreviewStatus === "loading"\}/
  );
});

test("appointment reviews workspace keeps decision preview validation-only and non-mutating", () => {
  assert.match(workspaceSource, /decisionPreview:\s+true/);
  assert.match(workspaceSource, /validationOnly:\s+true/);
  assert.match(workspaceSource, /controlledHandlingOnly:\s+true/);
  assert.match(workspaceSource, /executionEnabled:\s+false/);
  assert.match(workspaceSource, /executorAvailable:\s+false/);
  assert.match(workspaceSource, /executionAvailable:\s+false/);
  assert.match(workspaceSource, /executionRequested:\s+false/);
  assert.match(workspaceSource, /actionPerformed:\s+false/);
  assert.match(workspaceSource, /commandDispatched:\s+false/);
  assert.match(workspaceSource, /commandPersisted:\s+false/);
  assert.match(workspaceSource, /receiptPersisted:\s+false/);
  assert.match(workspaceSource, /bookingCreated:\s+false/);
  assert.match(workspaceSource, /calendarChecked:\s+false/);
  assert.match(workspaceSource, /appointmentCreated:\s+false/);
  assert.match(workspaceSource, /calendarEventCreated:\s+false/);
  assert.match(workspaceSource, /databasePersisted:\s+false/);
  assert.match(workspaceSource, /persistence:\s+"not_persisted"/);
  assert.match(workspaceSource, /reviewMutated:\s+false/);
  assert.match(workspaceSource, /reviewStateChanged:\s+false/);
  assert.match(workspaceSource, /repositoryVersionChanged:\s+false/);
  assert.match(workspaceSource, /payload\.decisionPreview === true/);
  assert.match(workspaceSource, /payload\.executionEnabled === false/);
  assert.match(workspaceSource, /payload\.reviewMutated === false/);
  assert.match(workspaceSource, /payload\.reviewStateChanged === false/);
  assert.match(workspaceSource, /payload\.repositoryVersionChanged === false/);
  assert.doesNotMatch(workspaceSource, /setReviews\([^)]*decisionPreview/i);
  assert.doesNotMatch(workspaceSource, /selectedReview\.status\s*=/);
  assert.doesNotMatch(workspaceSource, /setSelectedReviewId\(.*projectedNextState/);
});

test("appointment reviews workspace exposes two-step in-memory decision execution", () => {
  assert.match(workspaceSource, /Decision Execution Confirmation/);
  assert.match(workspaceSource, /Prepare Approve Decision Application/);
  assert.match(workspaceSource, /Apply Approve Decision — In-memory Demo/);
  assert.match(workspaceSource, /Apply Reject Decision — In-memory Demo/);
  assert.match(workspaceSource, /explicit second confirmation/i);
  assert.match(workspaceSource, /in-memory review state transition/i);
  assert.match(workspaceSource, /does not create bookings, calendar events, patient\s+messages/i);
  assert.match(workspaceSource, /decisionExecutionStatus === "confirming"/);
  assert.match(workspaceSource, /No request is sent until the in-memory application button is pressed/);
  assert.doesNotMatch(workspaceSource, />Approve<\/button>|>Reject<\/button>/);
});

test("appointment reviews workspace sends only safe execution request fields", () => {
  const executionSource = workspaceSource.slice(
    workspaceSource.indexOf("async function confirmDecisionExecution"),
    workspaceSource.indexOf("function createDecisionExecutionRequest")
  );

  assert.match(executionSource, /decision-execution/);
  assert.match(executionSource, /body: JSON\.stringify\(\{/);
  assert.match(executionSource, /action: confirmation\.action/);
  assert.match(
    executionSource,
    /expectedReviewVersion: confirmation\.expectedReviewVersion/
  );
  assert.match(executionSource, /idempotencyKey: confirmation\.idempotencyKey/);
  assert.match(executionSource, /confirmation: DECISION_EXECUTION_CONFIRMATION/);
  assert.doesNotMatch(
    executionSource,
    /nextState|trustedCurrentState|validationResult|comparisonResult|guidanceResult/
  );
  assert.doesNotMatch(
    executionSource,
    /guidedReviewSession|resolutionChecklistSession|followUpFocusBoard|shiftHandoffResult|plainTextBrief/
  );
});

test("appointment reviews workspace invalidates old-version state after execution success", () => {
  const successSource = workspaceSource.slice(
    workspaceSource.indexOf("function invalidateOldVersionDecisionStateAfterExecution"),
    workspaceSource.indexOf("function buildDecisionExecutionIdempotencyKey")
  );

  assert.match(successSource, /invalidateDecisionPreviewRequest\(\)/);
  assert.match(successSource, /invalidateDecisionComparisonRequest\(\)/);
  assert.match(successSource, /invalidateResolutionGuidanceRequest\(\)/);
  assert.match(successSource, /invalidateQueueReadinessRequest\(\)/);
  assert.match(successSource, /invalidateShiftHandoffRequest\(\)/);
  assert.match(successSource, /resetFollowUpBoardState\(\)/);
  assert.match(successSource, /createResolutionChecklistSession\(null\)/);
  assert.match(successSource, /getEmptyAppointmentReviewGuidedSession\(\)/);
  assert.match(workspaceSource, /refreshAppointmentReviewsFromTrustedServer/);
  assert.match(workspaceSource, /Matching replay returned the original receipt/);
  assert.match(workspaceSource, /Refresh and rerun preview for stale versions/);
});

test("appointment reviews workspace hardens execution against stale responses and duplicate submit", () => {
  assert.match(workspaceSource, /activeDecisionExecutionRequestRef/);
  assert.match(workspaceSource, /isActiveDecisionExecutionRequest/);
  assert.match(workspaceSource, /decisionExecutionStatus === "loading"/);
  assert.match(workspaceSource, /Duplicate submissions are disabled/);
  assert.match(workspaceSource, /selectedReviewIdRef\.current === confirmation\.reviewId/);
  assert.match(workspaceSource, /isSafeDecisionExecutionResponse/);
});

test("appointment reviews workspace exposes two-step configured calendar sync", () => {
  assert.match(workspaceSource, /Prepare Calendar Sync/);
  assert.match(workspaceSource, /Sync to Configured Calendar/);
  assert.match(workspaceSource, /configured provider/);
  assert.match(workspaceSource, /external calendar event/);
  assert.match(workspaceSource, /stored only\s+in memory/i);
  assert.match(workspaceSource, /no patient message is sent/i);
  assert.match(workspaceSource, /calendarSyncStatus === "loading"/);
  assert.match(workspaceSource, /Cancel Calendar Sync/);
});

test("appointment reviews workspace sends only safe calendar sync request fields", () => {
  const syncSource = workspaceSource.slice(
    workspaceSource.indexOf("async function confirmCalendarSync"),
    workspaceSource.indexOf("function startCalendarSyncRequest")
  );

  assert.match(syncSource, /\/calendar-sync/);
  assert.match(syncSource, /body: JSON\.stringify\(\{/);
  assert.match(
    syncSource,
    /expectedAppointmentVersion:\s+confirmation\.expectedAppointmentVersion/
  );
  assert.match(syncSource, /idempotencyKey: confirmation\.idempotencyKey/);
  assert.match(syncSource, /confirmation: CALENDAR_SYNC_CONFIRMATION/);
  assert.doesNotMatch(
    syncSource,
    /provider|calendarEventId|doctorId|doctorName|startAt|endAt|durationMinutes|patient|selectedSlot|timezone|treatment/
  );
});

test("appointment reviews workspace hardens calendar sync against stale responses and duplicate submit", () => {
  assert.match(workspaceSource, /activeCalendarSyncRequestRef/);
  assert.match(workspaceSource, /isActiveCalendarSyncRequest/);
  assert.match(workspaceSource, /calendarSyncStatus === "loading"/);
  assert.match(workspaceSource, /isSafeCalendarSyncResponse/);
  assert.match(workspaceSource, /refreshCreatedAppointmentsFromTrustedServer/);
  assert.match(workspaceSource, /isCalendarSyncEligibleAppointment/);
  assert.match(workspaceSource, /appointment\.calendarLinked !== true/);
  assert.match(workspaceSource, /!appointment\.calendarEventId/);
});

test("appointment reviews workspace route source rejects client trusted execution fields", () => {
  assert.match(decisionExecutionRouteSource, /BODY_ALLOWED_FIELDS/);
  assert.match(decisionExecutionRouteSource, /"action"/);
  assert.match(decisionExecutionRouteSource, /"expectedReviewVersion"/);
  assert.match(decisionExecutionRouteSource, /"idempotencyKey"/);
  assert.match(decisionExecutionRouteSource, /"confirmation"/);
  assert.match(decisionExecutionRouteSource, /nextState/);
  assert.match(decisionExecutionRouteSource, /validationResult/);
  assert.match(decisionExecutionRouteSource, /checkedItems/);
  assert.match(decisionExecutionRouteSource, /guidedSession/);
  assert.match(decisionExecutionRouteSource, /followUpFocusBoard/);
  assert.match(decisionExecutionRouteSource, /plainTextBrief/);
});

test("appointment reviews workspace shows side-by-side decision path comparison dry-run", () => {
  const comparisonRequestSource = workspaceSource.slice(
    workspaceSource.indexOf(")}/decision-comparison`"),
    workspaceSource.indexOf(
      "const payload = await response.json();",
      workspaceSource.indexOf(")}/decision-comparison`")
    )
  );

  assert.match(workspaceSource, /INITIAL_DECISION_COMPARISON/);
  assert.match(workspaceSource, /runDecisionComparison/);
  assert.match(workspaceSource, /isSafeDecisionComparisonResponse/);
  assert.match(workspaceSource, /Decision Path Comparison Dry-run/);
  assert.match(workspaceSource, /Compare Decision Paths \(dry-run\)/);
  assert.match(workspaceSource, /Two-path dry-run · No recommendation/);
  assert.match(workspaceSource, /same trusted review state and observed\s+version/);
  assert.match(workspaceSource, /Approve path/);
  assert.match(workspaceSource, /Reject path/);
  assert.match(workspaceSource, /approveComparisonPath/);
  assert.match(workspaceSource, /rejectComparisonPath/);
  assert.match(workspaceSource, /trustedCurrentState/);
  assert.match(workspaceSource, /observedReviewVersion/);
  assert.match(workspaceSource, /projectedNextState/);
  assert.match(workspaceSource, /blockingStage/);
  assert.match(workspaceSource, /receiptOutcome/);
  assert.match(workspaceSource, /No action was selected or executed/);
  assert.match(workspaceSource, /does\s+not rank paths, choose an action/);
  assert.match(
    workspaceSource,
    /\/api\/secretary\/appointment-reviews\/\$\{encodeURIComponent/
  );
  assert.match(workspaceSource, /\/decision-comparison`/);
  assert.match(comparisonRequestSource, /method: "POST"/);
  assert.match(comparisonRequestSource, /body: JSON\.stringify\(\{\}\)/);
  assert.doesNotMatch(comparisonRequestSource, /action:/);
  assert.doesNotMatch(comparisonRequestSource, /actions:/);
  assert.doesNotMatch(comparisonRequestSource, /currentState:/);
  assert.doesNotMatch(comparisonRequestSource, /observedReviewVersion/);
  assert.doesNotMatch(comparisonRequestSource, /idempotencyKey/);
});

test("appointment reviews workspace hardens decision comparison against stale responses", () => {
  assert.match(workspaceSource, /decisionComparisonRequestSequenceRef/);
  assert.match(workspaceSource, /activeDecisionComparisonRequestRef/);
  assert.match(workspaceSource, /activeDecisionComparisonAbortRef/);
  assert.match(workspaceSource, /createDecisionComparisonRequest/);
  assert.match(workspaceSource, /invalidateDecisionComparisonRequest/);
  assert.match(workspaceSource, /isActiveDecisionComparisonRequest/);
  assert.match(workspaceSource, /activeDecisionComparisonAbortRef\.current\.abort\(\)/);
  assert.match(workspaceSource, /signal: activeAbortController\?\.signal/);
  assert.match(workspaceSource, /activeRequest\.requestId === requestId/);
  assert.match(workspaceSource, /activeRequest\.reviewId === reviewId/);
  assert.match(workspaceSource, /selectedReviewIdRef\.current === reviewId/);
  assert.match(
    workspaceSource,
    /if \(\s+!\s*isActiveDecisionComparisonRequest\(\{[\s\S]*requestId,[\s\S]*reviewId: reviewIdForRequest[\s\S]*\}\)\s+\) \{\s+return;\s+\}/
  );
  assert.match(
    workspaceSource,
    /setDecisionComparisonResult\(payload\);\s+setDecisionComparisonStatus\("success"\);/
  );
  assert.match(
    workspaceSource,
    /setDecisionComparisonResult\(null\);\s+setDecisionComparisonStatus\("failure"\);/
  );
  assert.match(
    workspaceSource,
    /setDecisionComparisonStatus\("loading"\);\s+setDecisionComparisonResult\(null\);\s+setDecisionComparisonError\(""\);/
  );
  assert.match(
    workspaceSource,
    /if \(decisionComparisonStatus === "loading"\) \{\s+return;\s+\}/
  );
  assert.match(
    workspaceSource,
    /disabled=\{decisionComparisonStatus === "loading"\}/
  );
  assert.match(
    workspaceSource,
    /async function runDecisionPreview\(action\) \{\s+invalidateDecisionComparisonRequest\(\);/
  );
  assert.match(
    workspaceSource,
    /function createDecisionComparisonRequest\(\{ reviewId \}\) \{\s+invalidateDecisionPreviewRequest\(\);/
  );
});

test("appointment reviews workspace keeps decision comparison non-executable and non-mutating", () => {
  assert.match(workspaceSource, /decisionComparison:\s+true/);
  assert.match(workspaceSource, /payload\.decisionComparison === true/);
  assert.match(workspaceSource, /payload\.mode === "validation_only"/);
  assert.match(workspaceSource, /payload\.comparison === "decision_paths"/);
  assert.match(workspaceSource, /payload\.actions\.join\(","\) === "approve,reject"/);
  assert.match(workspaceSource, /payload\.paths\.approve/);
  assert.match(workspaceSource, /payload\.paths\.reject/);
  assert.match(workspaceSource, /payload\.paths\.approve\.persistence === "not_persisted"/);
  assert.match(workspaceSource, /payload\.paths\.reject\.persistence === "not_persisted"/);
  assert.match(workspaceSource, /payload\.executionEnabled === false/);
  assert.match(workspaceSource, /payload\.actionPerformed === false/);
  assert.match(workspaceSource, /payload\.bookingCreated === false/);
  assert.match(workspaceSource, /payload\.calendarChecked === false/);
  assert.match(workspaceSource, /payload\.databasePersisted === false/);
  assert.match(workspaceSource, /payload\.reviewMutated === false/);
  assert.match(workspaceSource, /payload\.repositoryVersionChanged === false/);
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(
      [
        "recommended" + "Action",
        "best" + "Action",
        "preferred" + "Action",
        "automatic" + "Decision",
        "selected" + "Action",
      ].join("|")
    )
  );
  assert.doesNotMatch(workspaceSource, /setReviews\([^)]*decisionComparison/i);
  assert.doesNotMatch(workspaceSource, /setSelectedReviewId\(.*comparison/i);
});

test("appointment reviews workspace shows selected-review resolution guidance preview", () => {
  const routeMarker = ")}/resolution-guidance-preview`";
  const guidanceRequestSource = workspaceSource.slice(
    workspaceSource.indexOf(routeMarker),
    workspaceSource.indexOf(
      "const payload = await response.json();",
      workspaceSource.indexOf(routeMarker)
    )
  );

  assert.match(workspaceSource, /INITIAL_RESOLUTION_GUIDANCE_PREVIEW/);
  assert.match(workspaceSource, /runResolutionGuidancePreview/);
  assert.match(workspaceSource, /createResolutionChecklistSession/);
  assert.match(workspaceSource, /toggleResolutionChecklistItem/);
  assert.match(workspaceSource, /clearResolutionChecklistSession/);
  assert.match(workspaceSource, /isSafeResolutionGuidanceResponse/);
  assert.match(workspaceSource, /Resolution Guidance Preview/);
  assert.match(workspaceSource, /Generate Resolution Guidance/);
  assert.match(workspaceSource, /Re-run Trusted Guidance Preview/);
  assert.match(workspaceSource, /Clear Local Checklist Marks/);
  assert.match(workspaceSource, /Operational follow-up dry-run/);
  assert.match(workspaceSource, /Approve guidance/);
  assert.match(workspaceSource, /Reject guidance/);
  assert.match(workspaceSource, /approveResolutionGuidance/);
  assert.match(workspaceSource, /rejectResolutionGuidance/);
  assert.match(workspaceSource, /approveResolutionChecklist/);
  assert.match(workspaceSource, /rejectResolutionChecklist/);
  assert.match(workspaceSource, /Internal Follow-up Summary - not sent or saved/);
  assert.match(workspaceSource, /Local checklist session/);
  assert.match(workspaceSource, /local session notes only/);
  assert.match(workspaceSource, /do not\s+change server validation/);
  assert.match(workspaceSource, /not\s+persisted/i);
  assert.match(workspaceSource, /requiredCheck/);
  assert.match(workspaceSource, /rerunAfterVerification/);
  assert.match(workspaceSource, /guidancePersisted/);
  assert.match(workspaceSource, /summaryPersisted/);
  assert.match(workspaceSource, /messageSent/);
  assert.match(workspaceSource, /taskAssigned/);
  assert.match(
    workspaceSource,
    /\/api\/secretary\/appointment-reviews\/\$\{encodeURIComponent/
  );
  assert.match(workspaceSource, /\/resolution-guidance-preview`/);
  assert.match(guidanceRequestSource, /method: "POST"/);
  assert.match(guidanceRequestSource, /body: JSON\.stringify\(\{\}\)/);
  assert.doesNotMatch(guidanceRequestSource, new RegExp("checked" + "ItemKeys"));
  assert.doesNotMatch(guidanceRequestSource, new RegExp("checklist" + "Progress"));
  assert.doesNotMatch(guidanceRequestSource, new RegExp("local" + "ReviewState"));
  assert.doesNotMatch(guidanceRequestSource, new RegExp("completed" + "Checks"));
  assert.doesNotMatch(guidanceRequestSource, new RegExp("verified" + "Checks"));
  assert.doesNotMatch(guidanceRequestSource, /reviewId:/);
  assert.doesNotMatch(guidanceRequestSource, /currentState:/);
  assert.doesNotMatch(guidanceRequestSource, /observedReviewVersion/);
  assert.doesNotMatch(guidanceRequestSource, /paths:/);
  assert.doesNotMatch(guidanceRequestSource, /comparison:/);
  assert.doesNotMatch(guidanceRequestSource, /guidance:/);
});

test("appointment reviews workspace exposes guided review session controls", () => {
  assert.match(workspaceSource, /appointmentReviewGuidedSession/);
  assert.match(workspaceSource, /GUIDED_SESSION_FILTER_OPTIONS/);
  assert.match(workspaceSource, /Guided Review Session/);
  assert.match(workspaceSource, /Local guided session · Not persisted/);
  assert.match(workspaceSource, /No guided review session is active/);
  assert.match(workspaceSource, /Start Guided Review Session/);
  assert.match(workspaceSource, /Mark Reviewed Locally/);
  assert.match(workspaceSource, /Mark as Unreviewed Locally/);
  assert.match(workspaceSource, /Open Next Unreviewed Review/);
  assert.match(workspaceSource, /Reset Local Session/);
  assert.match(workspaceSource, /Session filter/);
  assert.match(workspaceSource, /All session reviews/);
  assert.match(workspaceSource, /Reviewed locally/);
  assert.match(workspaceSource, /Version reset/);
  assert.match(workspaceSource, /reviewed locally/);
  assert.match(workspaceSource, /remaining/);
  assert.match(workspaceSource, /Session persistence/);
  assert.match(workspaceSource, /not sent to preview/);
  assert.match(workspaceSource, /Session status/);
  assert.match(workspaceSource, /not_started/);
  assert.match(workspaceSource, /local mark reset after version change/);
  assert.match(workspaceSource, /versionChangeNotice/);
});

test("appointment reviews workspace keeps guided session local and separate from server workflows", () => {
  const startSessionSource = workspaceSource.slice(
    workspaceSource.indexOf("function startGuidedReviewSession"),
    workspaceSource.indexOf("function resetGuidedReviewSession")
  );
  const resetSessionSource = workspaceSource.slice(
    workspaceSource.indexOf("function resetGuidedReviewSession"),
    workspaceSource.indexOf("function markSelectedReviewReviewedLocally")
  );
  const markSessionSource = workspaceSource.slice(
    workspaceSource.indexOf("function markSelectedReviewReviewedLocally"),
    workspaceSource.indexOf("function markSelectedReviewUnreviewedLocally")
  );
  const clearSessionSource = workspaceSource.slice(
    workspaceSource.indexOf("function markSelectedReviewUnreviewedLocally"),
    workspaceSource.indexOf("function openNextUnreviewedReview")
  );
  const nextSessionSource = workspaceSource.slice(
    workspaceSource.indexOf("function openNextUnreviewedReview"),
    workspaceSource.indexOf(
      "return (",
      workspaceSource.indexOf("function openNextUnreviewedReview")
    )
  );
  const sessionSources = [
    startSessionSource,
    resetSessionSource,
    markSessionSource,
    clearSessionSource,
    nextSessionSource,
  ].join("\n");
  const handoffCopySource = workspaceSource.slice(
    workspaceSource.indexOf("async function copyShiftHandoffBrief"),
    workspaceSource.indexOf("function startGuidedReviewSession")
  );

  assert.match(
    startSessionSource,
    /initializeAppointmentReviewGuidedSession\(reviews\)/
  );
  assert.match(
    resetSessionSource,
    /getEmptyAppointmentReviewGuidedSession\(\)/
  );
  assert.match(
    markSessionSource,
    /markAppointmentReviewGuidedSessionItem\(currentSession, selectedReview\)/
  );
  assert.match(
    clearSessionSource,
    /clearAppointmentReviewGuidedSessionItem\(currentSession, selectedReview\)/
  );
  assert.match(
    nextSessionSource,
    /findNextUnreviewedAppointmentReviewId\(\s+guidedReviewSession/
  );
  assert.match(nextSessionSource, /setSelectedReviewId\(nextReviewId\)/);
  assert.match(nextSessionSource, /Navigation wraps to the beginning/);
  assert.doesNotMatch(sessionSources, /fetch\(/);
  assert.doesNotMatch(sessionSources, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(sessionSources, /document\.cookie|process\.env/);
  assert.doesNotMatch(sessionSources, /setDecisionPreviewResult/);
  assert.doesNotMatch(sessionSources, /setDecisionComparisonResult/);
  assert.doesNotMatch(sessionSources, /setResolutionGuidanceResult/);
  assert.doesNotMatch(sessionSources, /setResolutionChecklistSession/);
  assert.doesNotMatch(sessionSources, /setShiftHandoffResult/);
  assert.doesNotMatch(handoffCopySource, /guidedReviewSession/);
});

test("appointment reviews workspace reconciles guided session on queue refresh", () => {
  assert.match(workspaceSource, /reconcileAppointmentReviewGuidedSession/);
  assert.match(
    workspaceSource,
    /setGuidedReviewSession\(\(currentSession\) =>\s+currentSession\.active\s+\?\s+reconcileAppointmentReviewGuidedSession\(\s+currentSession,\s+nextReviews\s+\)\s+:\s+currentSession\s+\)/
  );
  assert.match(
    workspaceSource,
    /reconcileAppointmentReviewGuidedSession\(currentSession, \[\]\)/
  );
  assert.match(
    workspaceSource,
    /Readiness and guided-session filters combine locally/
  );
  assert.doesNotMatch(workspaceSource, /sessionCompleted|locallyResolved/);
});

test("appointment reviews workspace exposes operational follow-up focus board", () => {
  assert.match(workspaceSource, /appointmentReviewFollowUpFocusBoard/);
  assert.match(workspaceSource, /Operational Follow-up Focus Board/);
  assert.match(workspaceSource, /Load Operational Follow-up Board/);
  assert.match(workspaceSource, /Refresh from Handoff Preview/);
  assert.match(workspaceSource, /Open Next Unreviewed in Current Focus/);
  assert.match(workspaceSource, /Clear Focus Filters/);
  assert.match(workspaceSource, /All follow-up categories/);
  assert.match(workspaceSource, /Category count model/);
  assert.match(workspaceSource, /overlapping/);
  assert.match(followUpBoardHelperSource, /No current validation blocker/);
  assert.match(workspaceSource, /followUpCategoryLabels/);
  assert.match(workspaceSource, /sessionStatus/);
  assert.match(workspaceSource, /sessionVersionChanged/);
  assert.match(workspaceSource, /No trusted handoff data loaded/);
  assert.doesNotMatch(
    workspaceSource,
    /recommendedAction|preferredAction|bestAction|should approve|should reject/i
  );
  assert.doesNotMatch(workspaceSource, /high priority|low priority|risk score/i);
});

test("appointment reviews workspace reuses current handoff data for the follow-up board", () => {
  const loadBoardSource = workspaceSource.slice(
    workspaceSource.indexOf("async function loadFollowUpFocusBoard"),
    workspaceSource.indexOf("function resetInvalidFollowUpCategoryFilter")
  );

  assert.match(loadBoardSource, /currentShiftHandoffResult/);
  assert.match(loadBoardSource, /setFollowUpBoardStatus\("success"\)/);
  assert.match(loadBoardSource, /Operational follow-up board opened/);
  assert.match(loadBoardSource, /return;/);
  assert.match(loadBoardSource, /shift-handoff-preview/);
  assert.doesNotMatch(workspaceSource, /follow-up-board-preview/);
  assert.doesNotMatch(workspaceSource, /follow-up-focus-preview/);
  assert.doesNotMatch(loadBoardSource, /resolution-guidance-preview/);
});

test("appointment reviews workspace loads board through existing handoff route without local state payloads", () => {
  const loadBoardSource = workspaceSource.slice(
    workspaceSource.indexOf("async function loadFollowUpFocusBoard"),
    workspaceSource.indexOf("function resetInvalidFollowUpCategoryFilter")
  );
  const boardFetchSource = loadBoardSource.slice(
    loadBoardSource.indexOf("await fetch"),
    loadBoardSource.indexOf("const payload = await response.json();")
  );

  assert.match(
    boardFetchSource,
    /\/api\/secretary\/appointment-reviews\/shift-handoff-preview/
  );
  assert.match(boardFetchSource, /method: "POST"/);
  assert.match(boardFetchSource, /body: JSON\.stringify\(\{\}\)/);
  assert.doesNotMatch(
    boardFetchSource,
    /guidedReviewSession|resolutionChecklistSession|followUpBoardCategoryFilter/
  );
  assert.doesNotMatch(
    boardFetchSource,
    /reviewedLocally|sessionStatus|checkedItem|checklist|clipboard|plainTextBrief/
  );
  assert.match(loadBoardSource, /isActiveShiftHandoffRequest/);
  assert.match(workspaceSource, /Duplicate requests are ignored/);
});

test("appointment reviews workspace keeps follow-up board local and deterministic", () => {
  const nextFocusSource = workspaceSource.slice(
    workspaceSource.indexOf("function openNextUnreviewedInFollowUpFocus"),
    workspaceSource.indexOf("function createShiftHandoffRequest")
  );
  const clearFocusSource = workspaceSource.slice(
    workspaceSource.indexOf("function clearFollowUpFocusFilters"),
    workspaceSource.indexOf("function resetFollowUpBoardState")
  );
  const resetFocusSource = workspaceSource.slice(
    workspaceSource.indexOf("function resetFollowUpBoardState"),
    workspaceSource.indexOf("function openNextUnreviewedInFollowUpFocus")
  );

  assert.match(nextFocusSource, /findNextUnreviewedAppointmentReviewInFocus/);
  assert.match(nextFocusSource, /setSelectedReviewId\(nextReviewId\)/);
  assert.doesNotMatch(nextFocusSource, /fetch\(/);
  assert.doesNotMatch(nextFocusSource, /runDecision|runResolution|runShift/);
  assert.match(clearFocusSource, /FOLLOW_UP_CATEGORY_FILTER_ALL/);
  assert.match(clearFocusSource, /GUIDED_SESSION_FILTERS\.ALL/);
  assert.match(resetFocusSource, /setFollowUpBoardStatus\("idle"\)/);
  assert.match(workspaceSource, /resetFollowUpBoardState\(\);/);
  assert.match(workspaceSource, /isCurrentShiftHandoffResult/);
});

test("appointment reviews workspace preserves clipboard and checklist separation from follow-up board", () => {
  const copyFunctionStart = workspaceSource.indexOf("async function copyShiftHandoffBrief");
  const copyFunctionSource = workspaceSource.slice(copyFunctionStart, copyFunctionStart + 1200);
  const loadBoardSource = workspaceSource.slice(
    workspaceSource.indexOf("async function loadFollowUpFocusBoard"),
    workspaceSource.indexOf("function resetInvalidFollowUpCategoryFilter")
  );

  assert.doesNotMatch(copyFunctionSource, /followUpBoard|followUpFocusBoard/);
  assert.doesNotMatch(copyFunctionSource, /guidedReviewSession/);
  assert.doesNotMatch(copyFunctionSource, /resolutionChecklistSession/);
  assert.doesNotMatch(loadBoardSource, /setResolutionChecklistSession/);
  assert.doesNotMatch(loadBoardSource, /toggleResolutionChecklistItem/);
  assert.match(workspaceSource, /copied\s+brief text/i);
});

test("appointment reviews workspace follow-up board helper stays pure and source-safe", () => {
  assert.match(followUpBoardHelperSource, /GUIDANCE_CATEGORIES/);
  assert.match(followUpBoardHelperSource, /guidanceCategory/);
  assert.match(followUpBoardHelperSource, /countsMayOverlap/);
  assert.doesNotMatch(
    followUpBoardHelperSource,
    /fetch\(|localStorage|sessionStorage|indexedDB|document\.cookie/
  );
  assert.doesNotMatch(followUpBoardHelperSource, /process\.env|AsyncLocalStorage/);
  assert.doesNotMatch(
    followUpBoardHelperSource,
    /createAppointment|createCalendarEvent|googleapis|prisma|supabase|redis/
  );
  assert.doesNotMatch(
    followUpBoardHelperSource,
    /patientName|patientPhone|patientEmail|rawMessage|adapter|runtime/
  );
});

test("appointment reviews workspace hardens resolution guidance against stale responses", () => {
  assert.match(workspaceSource, /resolutionGuidanceRequestSequenceRef/);
  assert.match(workspaceSource, /activeResolutionGuidanceRequestRef/);
  assert.match(workspaceSource, /activeResolutionGuidanceAbortRef/);
  assert.match(workspaceSource, /createResolutionGuidanceRequest/);
  assert.match(workspaceSource, /invalidateResolutionGuidanceRequest/);
  assert.match(workspaceSource, /resetResolutionGuidanceState/);
  assert.match(workspaceSource, /setResolutionChecklistSession/);
  assert.match(workspaceSource, /isActiveResolutionGuidanceRequest/);
  assert.match(workspaceSource, /activeResolutionGuidanceAbortRef\.current\.abort\(\)/);
  assert.match(workspaceSource, /signal: activeAbortController\?\.signal/);
  assert.match(workspaceSource, /activeRequest\.requestId === requestId/);
  assert.match(workspaceSource, /activeRequest\.reviewId === reviewId/);
  assert.match(workspaceSource, /selectedReviewIdRef\.current === reviewId/);
  assert.match(
    workspaceSource,
    /if \(\s+!\s*isActiveResolutionGuidanceRequest\(\{[\s\S]*requestId,[\s\S]*reviewId: reviewIdForRequest[\s\S]*\}\)\s+\) \{\s+return;\s+\}/
  );
  assert.match(
    workspaceSource,
    /setResolutionGuidanceResult\(payload\);[\s\S]*createResolutionChecklistSession\(payload, currentSession\)[\s\S]*setResolutionGuidanceStatus\("success"\);/
  );
  assert.doesNotMatch(workspaceSource, /setResolutionGuidanceResult\(null\);\s+setResolutionGuidanceStatus\("failure"\);/);
  assert.match(
    workspaceSource,
    /setResolutionGuidanceStatus\("loading"\);\s+setResolutionGuidanceError\(""\);/
  );
  assert.match(
    workspaceSource,
    /if \(resolutionGuidanceStatus === "loading"\) \{\s+return;\s+\}/
  );
  assert.match(
    workspaceSource,
    /disabled=\{resolutionGuidanceStatus === "loading"\}/
  );
  assert.match(
    workspaceSource,
    /invalidateResolutionGuidanceRequest\(\);\s+resetResolutionGuidanceState\(\);[\s\S]*invalidateQueueReadinessRequest\(\);\s+resetQueueReadinessState\(\);\s+setReviews\(nextReviews\);/
  );
  assert.match(
    workspaceSource,
    /setResolutionGuidanceStatus\("idle"\);\s+setResolutionGuidanceResult\(null\);\s+setResolutionGuidanceError\(""\);/
  );
});

test("appointment reviews workspace keeps resolution guidance non-executable and non-mutating", () => {
  assert.match(workspaceSource, /resolutionGuidancePreview:\s+true/);
  assert.match(workspaceSource, /payload\.resolutionGuidancePreview === true/);
  assert.match(workspaceSource, /payload\.mode === "validation_only"/);
  assert.match(workspaceSource, /payload\.preview === "resolution_guidance_preview"/);
  assert.match(workspaceSource, /payload\.executionEnabled === false/);
  assert.match(workspaceSource, /payload\.actionPerformed === false/);
  assert.match(workspaceSource, /payload\.bookingCreated === false/);
  assert.match(workspaceSource, /payload\.calendarChecked === false/);
  assert.match(workspaceSource, /payload\.databasePersisted === false/);
  assert.match(workspaceSource, /payload\.reviewMutated === false/);
  assert.match(workspaceSource, /payload\.repositoryVersionChanged === false/);
  assert.match(workspaceSource, /payload\.guidancePersisted === false/);
  assert.match(workspaceSource, /payload\.summaryPersisted === false/);
  assert.match(workspaceSource, /payload\.messageSent === false/);
  assert.match(workspaceSource, /payload\.taskAssigned === false/);
  assert.match(workspaceSource, /branch\.validationOnly === true/);
  assert.match(workspaceSource, /branch\.executionAvailable === false/);
  assert.match(workspaceSource, /branch\.bookingCreated === false/);
  assert.match(workspaceSource, /branch\.calendarChecked === false/);
  assert.match(workspaceSource, /branch\.databasePersisted === false/);
  assert.match(workspaceSource, /branch\.guidancePersisted === false/);
  assert.match(workspaceSource, /branch\.summaryPersisted === false/);
  assert.match(workspaceSource, /branch\.messageSent === false/);
  assert.match(workspaceSource, /branch\.taskAssigned === false/);
  assert.match(workspaceSource, /branch\.checklist\.every\(isSafeResolutionChecklistItem\)/);
  assert.match(workspaceSource, /typeof item\.code === "string"/);
  assert.match(workspaceSource, /typeof item\.label === "string"/);
  assert.doesNotMatch(workspaceSource, new RegExp("ready to " + "execute", "i"));
  assert.doesNotMatch(workspaceSource, new RegExp("approval " + "authorized", "i"));
  assert.doesNotMatch(workspaceSource, new RegExp("rejection " + "authorized", "i"));
  assert.doesNotMatch(workspaceSource, new RegExp("action " + "completed", "i"));
  assert.doesNotMatch(workspaceSource, new RegExp("review " + "resolved", "i"));
  assert.doesNotMatch(workspaceSource, /setReviews\([^)]*resolutionGuidance/i);
  assert.doesNotMatch(workspaceSource, /setSelectedReviewId\(.*resolutionGuidance/i);
});

test("appointment reviews workspace renders interactive local checklist progress without validation claims", () => {
  assert.match(workspaceSource, /Local progress:/);
  assert.match(workspaceSource, /progressText/);
  assert.match(workspaceSource, /checked=\{item\.reviewed\}/);
  assert.match(workspaceSource, /branchName: "approve"/);
  assert.match(workspaceSource, /branchName: "reject"/);
  assert.match(workspaceSource, /itemCode: item\.code/);
  assert.match(workspaceSource, /clearLocalResolutionChecklist/);
  assert.match(workspaceSource, /trusted\s+re-evaluation ignores these marks/i);
  assert.doesNotMatch(workspaceSource, /\d+\s*%/);
  assert.doesNotMatch(workspaceSource, /probability/i);
  assert.doesNotMatch(workspaceSource, /confidence/i);
  assert.doesNotMatch(workspaceSource, /validation complete/i);
  assert.doesNotMatch(workspaceSource, /server verified/i);
  assert.doesNotMatch(workspaceSource, /blocker was cleared/i);
  assert.doesNotMatch(workspaceSource, /should approve/i);
  assert.doesNotMatch(workspaceSource, /should reject/i);
});

test("appointment reviews workspace styles resolution guidance preview responsively", () => {
  assert.match(cssSource, /appointment-review-resolution-guidance-preview/);
  assert.match(cssSource, /appointment-review-resolution-guidance-grid/);
  assert.match(cssSource, /appointment-review-resolution-guidance-paths/);
  assert.match(cssSource, /appointment-review-resolution-guidance-summary/);
  assert.match(cssSource, /appointment-review-resolution-guidance-controls/);
  assert.match(cssSource, /appointment-review-resolution-guidance-notice/);
  assert.match(cssSource, /appointment-review-resolution-guidance-progress/);
  assert.match(cssSource, /appointment-review-resolution-guidance-ready/);
  assert.match(cssSource, /appointment-review-resolution-guidance-button/);
  assert.match(cssSource, /appointment-review-resolution-guidance-state/);
  assert.match(
    cssSource,
    /appointment-review-resolution-guidance-grid,[\s\S]*appointment-review-resolution-guidance-paths,[\s\S]*grid-template-columns: 1fr;/
  );
});

test("appointment reviews workspace shows queue readiness scan controls and summary", () => {
  const routeMarker =
    "\"/api/secretary/appointment-reviews/decision-readiness-preview\"";
  const queueReadinessRequestSource = workspaceSource.slice(
    workspaceSource.indexOf(routeMarker),
    workspaceSource.indexOf(
      "const payload = await response.json();",
      workspaceSource.indexOf(routeMarker)
    )
  );

  assert.match(workspaceSource, /INITIAL_QUEUE_READINESS_PREVIEW/);
  assert.match(workspaceSource, /QUEUE_READINESS_FILTERS/);
  assert.match(workspaceSource, /QUEUE_READINESS_LABELS/);
  assert.match(workspaceSource, /runQueueReadinessPreview/);
  assert.match(workspaceSource, /isSafeQueueReadinessResponse/);
  assert.match(workspaceSource, /Queue Readiness Scan/);
  assert.match(workspaceSource, /Run Queue Readiness Scan/);
  assert.match(workspaceSource, /Queue-wide dry-run · No recommendation/);
  assert.match(workspaceSource, /Total scanned/);
  assert.match(workspaceSource, /Both paths available/);
  assert.match(workspaceSource, /Approve path only/);
  assert.match(workspaceSource, /Reject path only/);
  assert.match(workspaceSource, /Both paths blocked/);
  assert.match(workspaceSource, /Readiness filter/);
  assert.match(workspaceSource, /queueReadinessStatus === "loading"/);
  assert.match(workspaceSource, /disabled=\{queueReadinessStatus === "loading"\}/);
  assert.match(
    workspaceSource,
    /\/api\/secretary\/appointment-reviews\/decision-readiness-preview/
  );
  assert.match(queueReadinessRequestSource, /method: "POST"/);
  assert.match(queueReadinessRequestSource, /body: JSON\.stringify\(\{\}\)/);
  assert.doesNotMatch(queueReadinessRequestSource, /reviewId:/);
  assert.doesNotMatch(queueReadinessRequestSource, /reviewIds:/);
  assert.doesNotMatch(queueReadinessRequestSource, /currentState:/);
  assert.doesNotMatch(queueReadinessRequestSource, /observedReviewVersion/);
  assert.doesNotMatch(queueReadinessRequestSource, /action:/);
  assert.doesNotMatch(queueReadinessRequestSource, /actions:/);
});

test("appointment reviews workspace annotates queue rows and filters neutrally", () => {
  assert.match(workspaceSource, /filteredReviews/);
  assert.match(workspaceSource, /queueReadinessItemsById/);
  assert.match(workspaceSource, /getCurrentQueueReadinessItems/);
  assert.match(workspaceSource, /reviewIdsMatch/);
  assert.match(workspaceSource, /filteredReviews\.map/);
  assert.match(workspaceSource, /appointment-review-readiness-badges/);
  assert.match(workspaceSource, /Readiness/);
  assert.match(workspaceSource, /Approve path/);
  assert.match(workspaceSource, /Reject path/);
  assert.match(workspaceSource, /not_scanned/);
  assert.match(workspaceSource, /No reviews match the selected local filters/);
  assert.match(
    workspaceSource,
    /Readiness and guided-session filters combine locally/
  );
  assert.match(workspaceSource, /does not mutate, reorder, send, or persist/);
  assert.match(
    workspaceSource,
    /const readinessFilteredReviews =\s+queueReadinessFilter === "all"\s+\?\s+reviews\s+:\s+reviews\.filter/
  );
  assert.match(
    workspaceSource,
    /const filteredReviews = filterAppointmentReviewsByGuidedSession\(\s+readinessFilteredReviews,[\s\S]*guidedReviewSession,[\s\S]*guidedReviewSessionFilter/
  );
  assert.match(
    workspaceSource,
    /setQueueReadinessFilter\(event\.target\.value\)/
  );
  assert.doesNotMatch(workspaceSource, /setSelectedReviewId\(.*queueReadiness/i);
  assert.doesNotMatch(workspaceSource, /sort\(/);
});

test("appointment reviews workspace hardens queue readiness scan against stale responses", () => {
  assert.match(workspaceSource, /queueReadinessRequestSequenceRef/);
  assert.match(workspaceSource, /activeQueueReadinessRequestRef/);
  assert.match(workspaceSource, /activeQueueReadinessAbortRef/);
  assert.match(workspaceSource, /createQueueReadinessRequest/);
  assert.match(workspaceSource, /invalidateQueueReadinessRequest/);
  assert.match(workspaceSource, /isActiveQueueReadinessRequest/);
  assert.match(workspaceSource, /activeQueueReadinessAbortRef\.current\.abort\(\)/);
  assert.match(workspaceSource, /signal: activeAbortController\?\.signal/);
  assert.match(workspaceSource, /reviewIds: reviewIdsForRequest/);
  assert.match(workspaceSource, /reviewIdsMatch\(activeRequest\.reviewIds, reviewIds\)/);
  assert.match(workspaceSource, /reviewIdsMatch\(currentReviewIds, reviewIds\)/);
  assert.match(
    workspaceSource,
    /invalidateQueueReadinessRequest\(\);\s+resetQueueReadinessState\(\);\s+setReviews\(nextReviews\);/
  );
  assert.match(
    workspaceSource,
    /setQueueReadinessResult\(payload\);\s+setQueueReadinessStatus\("success"\);/
  );
  assert.match(
    workspaceSource,
    /setQueueReadinessResult\(null\);\s+setQueueReadinessStatus\("failure"\);/
  );
  assert.match(
    workspaceSource,
    /if \(queueReadinessStatus === "loading"\) \{\s+return;\s+\}/
  );
  assert.match(workspaceSource, /if \(isAbortError\(error\)\) \{\s+return;\s+\}/);
  assert.doesNotMatch(workspaceSource, /setDecisionComparisonResult\(queueReadiness/i);
  assert.doesNotMatch(workspaceSource, /setDecisionPreviewResult\(queueReadiness/i);
});

test("appointment reviews workspace keeps queue readiness non-executable and non-mutating", () => {
  assert.match(workspaceSource, /queueReadinessPreview:\s+true/);
  assert.match(workspaceSource, /payload\.queueReadinessPreview === true/);
  assert.match(workspaceSource, /payload\.mode === "validation_only"/);
  assert.match(
    workspaceSource,
    /payload\.preview === "queue_decision_readiness_preview"/
  );
  assert.match(workspaceSource, /payload\.executionEnabled === false/);
  assert.match(workspaceSource, /payload\.actionPerformed === false/);
  assert.match(workspaceSource, /payload\.bookingCreated === false/);
  assert.match(workspaceSource, /payload\.calendarChecked === false/);
  assert.match(workspaceSource, /payload\.databasePersisted === false/);
  assert.match(workspaceSource, /payload\.reviewMutated === false/);
  assert.match(workspaceSource, /payload\.queueMutated === false/);
  assert.match(workspaceSource, /payload\.queueCountChanged === false/);
  assert.match(workspaceSource, /item\.validationOnly === true/);
  assert.match(workspaceSource, /item\.executionAvailable === false/);
  assert.match(workspaceSource, /item\.bookingCreated === false/);
  assert.match(workspaceSource, /item\.calendarChecked === false/);
  assert.match(workspaceSource, /item\.repositoryVersionChanged === false/);
  assert.doesNotMatch(workspaceSource, new RegExp("recommended" + "Action"));
  assert.doesNotMatch(workspaceSource, new RegExp("preferred" + "Action"));
  assert.doesNotMatch(workspaceSource, new RegExp("best" + "Action"));
  assert.doesNotMatch(workspaceSource, new RegExp("automatic" + "Decision"));
  assert.doesNotMatch(workspaceSource, new RegExp("selected" + "Action"));
});

test("appointment reviews workspace shows controlled action preconditions dry-run preview", () => {
  const preconditionsRequestSource = workspaceSource.slice(
    workspaceSource.indexOf(")}/action-preconditions`"),
    workspaceSource.indexOf("const payload = await response.json();", workspaceSource.indexOf(")}/action-preconditions`"))
  );

  assert.match(workspaceSource, /PRECONDITIONS_ACTION_INTENTS/);
  assert.match(workspaceSource, /INITIAL_PRECONDITIONS_CURRENT_STATE/);
  assert.match(workspaceSource, /INITIAL_PRECONDITIONS_ACTOR_ID/);
  assert.match(workspaceSource, /INITIAL_PRECONDITIONS_ACTOR_ROLE/);
  assert.match(workspaceSource, /INITIAL_PRECONDITIONS_REQUEST_ID/);
  assert.match(workspaceSource, /INITIAL_PRECONDITIONS_DRY_RUN/);
  assert.match(workspaceSource, /runPreconditionsDryRun/);
  assert.match(workspaceSource, /isSafePreconditionsDryRunResponse/);
  assert.match(workspaceSource, /Controlled Action Preconditions Dry-run/);
  assert.match(workspaceSource, /Validation only/);
  assert.match(workspaceSource, /Controlled handling only/);
  assert.match(workspaceSource, /Not authenticated/);
  assert.match(workspaceSource, /Not authorized/);
  assert.match(workspaceSource, /Not persisted/);
  assert.match(workspaceSource, /No action executed/);
  assert.match(workspaceSource, /Proposed action intent/);
  assert.match(workspaceSource, /Run preconditions dry-run/);
  assert.match(workspaceSource, /Preconditions result/);
  assert.match(workspaceSource, /approve_intent/);
  assert.match(workspaceSource, /reject_intent/);
  assert.match(workspaceSource, /validation_only_intent_checked/);
  assert.match(workspaceSource, /secretary-preview/);
  assert.match(workspaceSource, /preconditions-preview/);
  assert.match(workspaceSource, /INITIAL_PRECONDITIONS_ACTOR_ROLE = "secretary"/);
  assert.match(
    workspaceSource,
    /\/api\/secretary\/appointment-reviews\/\$\{encodeURIComponent/
  );
  assert.match(workspaceSource, /\/action-preconditions`/);
  assert.match(workspaceSource, /method: "POST"/);
  assert.match(workspaceSource, /actionIntent: actionIntentForRequest/);
  assert.match(workspaceSource, /currentState: currentStateForRequest/);
  assert.match(workspaceSource, /actor:\s+\{\s+actorId: actorIdForRequest,\s+role: actorRoleForRequest\s+\}/);
  assert.match(workspaceSource, /requestId: requestIdForRequest/);
  assert.match(preconditionsRequestSource, /body: JSON\.stringify\(/);
  assert.doesNotMatch(preconditionsRequestSource, /reviewId:/);
  assert.match(workspaceSource, /accepted/);
  assert.match(workspaceSource, /eligibleForControlledHandling/);
  assert.match(workspaceSource, /controlledHandlingOnly/);
  assert.match(workspaceSource, /actorId/);
  assert.match(workspaceSource, /actorRole/);
  assert.match(workspaceSource, /requestId/);
  assert.match(workspaceSource, /code/);
  assert.match(workspaceSource, /reason/);
  assert.match(workspaceSource, /dryRun/);
  assert.match(workspaceSource, /preconditionsChecked/);
  assert.match(workspaceSource, /executionRequested/);
  assert.match(workspaceSource, /executionAvailable/);
  assert.match(workspaceSource, /persistence/);
  assert.match(workspaceSource, /Preconditions dry-run is running/);
  assert.match(workspaceSource, /Preconditions result received/);
  assert.match(workspaceSource, /Preconditions dry-run failed safely/);
  assert.match(workspaceSource, /No action occurred/);
  assert.match(workspaceSource, /not authenticated, not authorized, not execution-ready/);
  assert.match(
    workspaceSource,
    /eligibleForControlledHandling true only means this structural\s+dry-run validation passed/
  );
  assert.match(workspaceSource, /not approval, rejection,\s+authentication, authorization, execution readiness, booking\s+readiness, or calendar readiness/);
});

test("appointment reviews workspace shows controlled action validation pipeline preview", () => {
  assert.match(workspaceSource, /CONTROLLED_ACTION_VALIDATION_INTENTS/);
  assert.match(workspaceSource, /INITIAL_CONTROLLED_ACTION_VALIDATION_REQUEST_ID/);
  assert.match(
    workspaceSource,
    /INITIAL_CONTROLLED_ACTION_VALIDATION_IDEMPOTENCY_KEY/
  );
  assert.match(
    workspaceSource,
    /INITIAL_CONTROLLED_ACTION_VALIDATION_EXPECTED_REVIEW_VERSION/
  );
  assert.match(workspaceSource, /INITIAL_CONTROLLED_ACTION_VALIDATION_PREVIEW/);
  assert.match(workspaceSource, /runControlledActionValidationDryRun/);
  assert.match(workspaceSource, /isSafeControlledActionValidationResponse/);
  assert.match(
    workspaceSource,
    /Controlled Action Validation Pipeline Dry-run/
  );
  assert.match(workspaceSource, /Mock server context/);
  assert.match(workspaceSource, /Validation only/);
  assert.match(workspaceSource, /Controlled handling only/);
  assert.match(workspaceSource, /Execution disabled/);
  assert.match(workspaceSource, /Executor unavailable/);
  assert.match(workspaceSource, /Not persisted/);
  assert.match(workspaceSource, /No action executed/);
  assert.match(workspaceSource, /Action intent metadata/);
  assert.match(workspaceSource, /Request id preview/);
  assert.match(workspaceSource, /Idempotency key preview/);
  assert.match(workspaceSource, /Expected review version preview/);
  assert.match(workspaceSource, /Run controlled action validation dry-run/);
  assert.match(workspaceSource, /approve_intent/);
  assert.match(workspaceSource, /reject_intent/);
  assert.match(workspaceSource, /controlled-action-preview/);
  assert.match(workspaceSource, /controlled-action-preview-key/);
  assert.match(
    workspaceSource,
    /INITIAL_CONTROLLED_ACTION_VALIDATION_EXPECTED_REVIEW_VERSION = 1/
  );
});

test("appointment reviews workspace posts controlled action validation to the selected review route with client-safe metadata only", () => {
  const controlledActionRequestSource = workspaceSource.slice(
    workspaceSource.indexOf(")}/controlled-action-validation`"),
    workspaceSource.indexOf(
      "const payload = await response.json();",
      workspaceSource.indexOf(")}/controlled-action-validation`")
    )
  );

  assert.match(
    workspaceSource,
    /\/api\/secretary\/appointment-reviews\/\$\{encodeURIComponent/
  );
  assert.match(workspaceSource, /\/controlled-action-validation`/);
  assert.match(workspaceSource, /reviewIdForRequest = selectedReview\.id/);
  assert.match(workspaceSource, /method: "POST"/);
  assert.match(workspaceSource, /signal: activeAbortController\?\.signal/);
  assert.match(controlledActionRequestSource, /body: JSON\.stringify\(/);
  assert.match(
    controlledActionRequestSource,
    /actionIntent: actionIntentForRequest/
  );
  assert.match(controlledActionRequestSource, /requestId: requestIdForRequest/);
  assert.match(
    controlledActionRequestSource,
    /idempotencyKey: idempotencyKeyForRequest/
  );
  assert.match(
    controlledActionRequestSource,
    /expectedReviewVersion: expectedReviewVersionForRequest/
  );
  assert.doesNotMatch(controlledActionRequestSource, /reviewId:/);
  assert.doesNotMatch(controlledActionRequestSource, /currentState:/);
  assert.doesNotMatch(controlledActionRequestSource, /actor:/);
  assert.doesNotMatch(controlledActionRequestSource, /actorId:/);
  assert.doesNotMatch(controlledActionRequestSource, /role:/);
  assert.doesNotMatch(controlledActionRequestSource, /permissions:/);
  assert.doesNotMatch(controlledActionRequestSource, /verifiedActorContext/);
  assert.doesNotMatch(controlledActionRequestSource, /observedReviewVersion/);
  assert.doesNotMatch(controlledActionRequestSource, /priorIdempotencyObservation/);
  assert.doesNotMatch(controlledActionRequestSource, /executionPolicyContext/);
});

test("appointment reviews workspace displays controlled action validation handler result and safety fields", () => {
  assert.match(workspaceSource, /accepted/);
  assert.match(workspaceSource, /handlerCompleted/);
  assert.match(workspaceSource, /failedStage/);
  assert.match(workspaceSource, /matchingReplay/);
  assert.match(workspaceSource, /replayExistingResultOnly/);
  assert.match(workspaceSource, /eligibleForExecutorBoundary/);
  assert.match(workspaceSource, /code/);
  assert.match(workspaceSource, /reason/);
  assert.match(workspaceSource, /reviewId/);
  assert.match(workspaceSource, /mock/);
  assert.match(workspaceSource, /dryRun/);
  assert.match(workspaceSource, /validationOnly/);
  assert.match(workspaceSource, /controlledHandlingOnly/);
  assert.match(workspaceSource, /executionEnabled/);
  assert.match(workspaceSource, /executorAvailable/);
  assert.match(workspaceSource, /executionAvailable/);
  assert.match(workspaceSource, /executionRequested/);
  assert.match(workspaceSource, /actionPerformed/);
  assert.match(workspaceSource, /commandDispatched/);
  assert.match(workspaceSource, /commandPersisted/);
  assert.match(workspaceSource, /bookingCreated/);
  assert.match(workspaceSource, /calendarChecked/);
  assert.match(workspaceSource, /appointmentCreated/);
  assert.match(workspaceSource, /calendarEventCreated/);
  assert.match(workspaceSource, /databasePersisted/);
  assert.match(workspaceSource, /persistence/);
  assert.match(workspaceSource, /This validation-only mock pipeline passed all configured safety contracts/);
  assert.match(workspaceSource, /No executor exists and no action was executed/);
  assert.match(workspaceSource, /safe rejection/);
  assert.match(workspaceSource, /No state or action changed/);
  assert.doesNotMatch(workspaceSource, /Authorized for production/);
  assert.doesNotMatch(workspaceSource, /Ready to execute/);
  assert.doesNotMatch(workspaceSource, /Execution approved/);
  assert.doesNotMatch(workspaceSource, /Appointment approved/);
  assert.doesNotMatch(workspaceSource, /Appointment rejected/);
  assert.doesNotMatch(workspaceSource, /Booking ready/);
  assert.doesNotMatch(workspaceSource, /Calendar ready/);
});

test("appointment reviews workspace displays controlled action validation pipeline stages without fabricating decisions", () => {
  assert.match(workspaceSource, /CONTROLLED_ACTION_VALIDATION_STAGE_LABELS/);
  assert.match(workspaceSource, /getControlledActionValidationStages/);
  assert.match(workspaceSource, /Preconditions/);
  assert.match(workspaceSource, /Authorization/);
  assert.match(workspaceSource, /Idempotency and Version Guard/);
  assert.match(workspaceSource, /Command Envelope/);
  assert.match(workspaceSource, /Execution Policy/);
  assert.match(workspaceSource, /pipelineResult\?\.stages\?\.\[key\]/);
  assert.match(workspaceSource, /status: \{stage\.status\}/);
  assert.match(workspaceSource, /code: \{stage\.code\}/);
  assert.match(workspaceSource, /stage\.status === "string" \? stage\.status : "not_run"/);
  assert.match(workspaceSource, /stage\.code === "string" \? stage\.code : "not_run"/);
  assert.match(workspaceSource, /not_run/);
  assert.doesNotMatch(workspaceSource, /controlledActionValidationStages\s*=\s*\[/);
});

test("appointment reviews workspace hardens controlled action validation against stale responses", () => {
  assert.match(workspaceSource, /controlledActionValidationRequestSequenceRef/);
  assert.match(workspaceSource, /activeControlledActionValidationRequestRef/);
  assert.match(workspaceSource, /activeControlledActionValidationAbortRef/);
  assert.match(workspaceSource, /createControlledActionValidationRequest/);
  assert.match(workspaceSource, /invalidateControlledActionValidationRequest/);
  assert.match(workspaceSource, /isActiveControlledActionValidationRequest/);
  assert.match(workspaceSource, /new AbortController\(\)/);
  assert.match(
    workspaceSource,
    /activeControlledActionValidationAbortRef\.current\.abort\(\)/
  );
  assert.match(workspaceSource, /requestId,/);
  assert.match(workspaceSource, /reviewId: reviewIdForRequest/);
  assert.match(workspaceSource, /actionIntent: actionIntentForRequest/);
  assert.match(workspaceSource, /previewRequestId: requestIdForRequest/);
  assert.match(workspaceSource, /idempotencyKey: idempotencyKeyForRequest/);
  assert.match(
    workspaceSource,
    /expectedReviewVersion: expectedReviewVersionForRequest/
  );
  assert.match(workspaceSource, /activeRequest\.requestId === requestId/);
  assert.match(workspaceSource, /activeRequest\.reviewId === reviewId/);
  assert.match(workspaceSource, /activeRequest\.actionIntent === actionIntent/);
  assert.match(
    workspaceSource,
    /activeRequest\.previewRequestId === previewRequestId/
  );
  assert.match(
    workspaceSource,
    /activeRequest\.idempotencyKey === idempotencyKey/
  );
  assert.match(
    workspaceSource,
    /activeRequest\.expectedReviewVersion === expectedReviewVersion/
  );
  assert.match(workspaceSource, /selectedReviewIdRef\.current === reviewId/);
  assert.match(
    workspaceSource,
    /if \(\s+!\s*isActiveControlledActionValidationRequest\(\{[\s\S]*requestId,[\s\S]*reviewId: reviewIdForRequest,[\s\S]*actionIntent: actionIntentForRequest,[\s\S]*previewRequestId: requestIdForRequest,[\s\S]*idempotencyKey: idempotencyKeyForRequest,[\s\S]*expectedReviewVersion: expectedReviewVersionForRequest[\s\S]*\}\)\s+\) \{\s+return;\s+\}/
  );
  assert.match(workspaceSource, /if \(isAbortError\(error\)\) \{\s+return;\s+\}/);
  assert.match(
    workspaceSource,
    /setControlledActionValidationResult\(payload\);\s+setControlledActionValidationStatus\("success"\);/
  );
  assert.match(
    workspaceSource,
    /setControlledActionValidationResult\(null\);\s+setControlledActionValidationStatus\("failure"\);/
  );
  assert.match(
    workspaceSource,
    /setControlledActionValidationStatus\("loading"\);\s+setControlledActionValidationResult\(null\);\s+setControlledActionValidationError\(""\);/
  );
  assert.match(
    workspaceSource,
    /if \(controlledActionValidationStatus === "loading"\) \{\s+return;\s+\}/
  );
  assert.match(
    workspaceSource,
    /disabled=\{controlledActionValidationStatus === "loading"\}/
  );
});

test("appointment reviews workspace resets controlled action validation on review change and unmount", () => {
  assert.match(workspaceSource, /invalidateControlledActionValidationRequest\(\);/);
  assert.match(
    workspaceSource,
    /selectedReviewIdRef\.current = selectedReviewId;\s+invalidateStateTransitionDryRunRequest\(\);\s+invalidatePreconditionsDryRunRequest\(\);\s+invalidateControlledActionValidationRequest\(\);/
  );
  assert.match(workspaceSource, /setControlledActionValidationStatus\("idle"\)/);
  assert.match(workspaceSource, /setControlledActionValidationResult\(null\)/);
  assert.match(workspaceSource, /setControlledActionValidationError\(""\)/);
  assert.match(
    workspaceSource,
    /setSelectedControlledActionValidationIntent\(\s+CONTROLLED_ACTION_VALIDATION_INTENTS\[0\]\s+\)/
  );
  assert.match(
    workspaceSource,
    /setControlledActionValidationRequestId\(\s+INITIAL_CONTROLLED_ACTION_VALIDATION_REQUEST_ID\s+\)/
  );
  assert.match(
    workspaceSource,
    /setControlledActionValidationIdempotencyKey\(\s+INITIAL_CONTROLLED_ACTION_VALIDATION_IDEMPOTENCY_KEY\s+\)/
  );
  assert.match(
    workspaceSource,
    /setControlledActionValidationExpectedReviewVersion\(\s+INITIAL_CONTROLLED_ACTION_VALIDATION_EXPECTED_REVIEW_VERSION\s+\)/
  );
  assert.match(
    workspaceSource,
    /isMountedRef\.current = false;\s+invalidateStateTransitionDryRunRequest\(\);\s+invalidatePreconditionsDryRunRequest\(\);\s+invalidateControlledActionValidationRequest\(\);/
  );
});

test("appointment reviews workspace handles matching replay display without fabricating it", () => {
  assert.match(workspaceSource, /matchingReplay === true/);
  assert.match(workspaceSource, /replayExistingResultOnly/);
  assert.match(workspaceSource, /no new command or action was created/);
  assert.match(workspaceSource, /No new command or action was created/i);
  assert.doesNotMatch(workspaceSource, /matchingReplay:\s+true/);
  assert.doesNotMatch(workspaceSource, /replayExistingResultOnly:\s+true/);
  assert.doesNotMatch(workspaceSource, /previous result/i);
});

test("appointment reviews workspace keeps controlled action validation UI non-executable", () => {
  assert.match(workspaceSource, /mock:\s+true/);
  assert.match(workspaceSource, /dryRun:\s+true/);
  assert.match(workspaceSource, /validationOnly:\s+true/);
  assert.match(workspaceSource, /controlledHandlingOnly:\s+true/);
  assert.match(workspaceSource, /executionEnabled:\s+false/);
  assert.match(workspaceSource, /executorAvailable:\s+false/);
  assert.match(workspaceSource, /executionAvailable:\s+false/);
  assert.match(workspaceSource, /executionRequested:\s+false/);
  assert.match(workspaceSource, /actionPerformed:\s+false/);
  assert.match(workspaceSource, /commandDispatched:\s+false/);
  assert.match(workspaceSource, /commandPersisted:\s+false/);
  assert.match(workspaceSource, /bookingCreated:\s+false/);
  assert.match(workspaceSource, /calendarChecked:\s+false/);
  assert.match(workspaceSource, /appointmentCreated:\s+false/);
  assert.match(workspaceSource, /calendarEventCreated:\s+false/);
  assert.match(workspaceSource, /databasePersisted:\s+false/);
  assert.match(workspaceSource, /persistence:\s+"not_persisted"/);
  assert.match(workspaceSource, /payload\.executorAvailable === false/);
  assert.match(workspaceSource, /payload\.commandDispatched === false/);
  assert.match(workspaceSource, /payload\.commandPersisted === false/);
  assert.doesNotMatch(workspaceSource, /setReviews\([^)]*controlledAction/i);
  assert.doesNotMatch(workspaceSource, /selectedReview\.status\s*=/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewControlledActionValidationHandler/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewTrustedServerContextAssemblyContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewControlledActionValidationPipelineContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewControlledActionExecutionPolicyContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewControlledActionCommandEnvelopeContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewControlledActionGuardContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewVerifiedActorAuthorizationContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewActionIntentStateMachine/);
  assert.doesNotMatch(workspaceSource, /Date\.now|Math\.random|randomUUID|crypto/);
});

test("appointment reviews workspace shows validation decision receipt dry-run preview", () => {
  assert.match(workspaceSource, /VALIDATION_RECEIPT_ACTION_INTENTS/);
  assert.match(workspaceSource, /INITIAL_VALIDATION_RECEIPT_REQUEST_ID/);
  assert.match(workspaceSource, /INITIAL_VALIDATION_RECEIPT_IDEMPOTENCY_KEY/);
  assert.match(
    workspaceSource,
    /INITIAL_VALIDATION_RECEIPT_EXPECTED_REVIEW_VERSION = 1/
  );
  assert.match(workspaceSource, /INITIAL_VALIDATION_RECEIPT_PREVIEW/);
  assert.match(workspaceSource, /runValidationReceiptDryRun/);
  assert.match(workspaceSource, /isSafeValidationReceiptResponse/);
  assert.match(workspaceSource, /Validation Decision Receipt Dry-run/);
  assert.match(workspaceSource, /Mock server context/);
  assert.match(workspaceSource, /Validation only/);
  assert.match(workspaceSource, /Read-only receipt/);
  assert.match(workspaceSource, /Receipt not persisted/);
  assert.match(workspaceSource, /No action executed/);
  assert.match(workspaceSource, /No command dispatched/);
  assert.match(workspaceSource, /No audit record stored/);
  assert.match(workspaceSource, /Proposed action intent/);
  assert.match(workspaceSource, /Request id preview/);
  assert.match(workspaceSource, /Idempotency key preview/);
  assert.match(workspaceSource, /Expected review version preview/);
  assert.match(workspaceSource, /Run validation receipt dry-run/);
  assert.match(workspaceSource, /approve_intent/);
  assert.match(workspaceSource, /reject_intent/);
  assert.match(workspaceSource, /validation-receipt-preview/);
  assert.match(workspaceSource, /validation-receipt-preview-key/);
});

test("appointment reviews workspace posts validation receipt request with client-safe metadata only", () => {
  const validationReceiptRequestSource = workspaceSource.slice(
    workspaceSource.indexOf(")}/controlled-action-validation-receipt`"),
    workspaceSource.indexOf(
      "const payload = await response.json();",
      workspaceSource.indexOf(")}/controlled-action-validation-receipt`")
    )
  );

  assert.match(
    workspaceSource,
    /\/api\/secretary\/appointment-reviews\/\$\{encodeURIComponent/
  );
  assert.match(workspaceSource, /\/controlled-action-validation-receipt`/);
  assert.match(workspaceSource, /reviewIdForRequest = selectedReview\.id/);
  assert.match(workspaceSource, /method: "POST"/);
  assert.match(workspaceSource, /signal: activeAbortController\?\.signal/);
  assert.match(validationReceiptRequestSource, /body: JSON\.stringify\(/);
  assert.match(
    validationReceiptRequestSource,
    /actionIntent: actionIntentForRequest/
  );
  assert.match(validationReceiptRequestSource, /requestId: requestIdForRequest/);
  assert.match(
    validationReceiptRequestSource,
    /idempotencyKey: idempotencyKeyForRequest/
  );
  assert.match(
    validationReceiptRequestSource,
    /expectedReviewVersion: expectedReviewVersionForRequest/
  );
  assert.doesNotMatch(validationReceiptRequestSource, /reviewId:/);
  assert.doesNotMatch(validationReceiptRequestSource, /currentState:/);
  assert.doesNotMatch(validationReceiptRequestSource, /actor:/);
  assert.doesNotMatch(validationReceiptRequestSource, /actorId:/);
  assert.doesNotMatch(validationReceiptRequestSource, /actorRole:/);
  assert.doesNotMatch(validationReceiptRequestSource, /role:/);
  assert.doesNotMatch(validationReceiptRequestSource, /permissions:/);
  assert.doesNotMatch(validationReceiptRequestSource, /verifiedActorContext/);
  assert.doesNotMatch(validationReceiptRequestSource, /authenticationVerified/);
  assert.doesNotMatch(validationReceiptRequestSource, /authorizationVerified/);
  assert.doesNotMatch(validationReceiptRequestSource, /observedReviewVersion/);
  assert.doesNotMatch(validationReceiptRequestSource, /priorIdempotencyObservation/);
  assert.doesNotMatch(validationReceiptRequestSource, /executionPolicyContext/);
  assert.doesNotMatch(validationReceiptRequestSource, /executionEnabled/);
  assert.doesNotMatch(validationReceiptRequestSource, /bookingCreated/);
  assert.doesNotMatch(validationReceiptRequestSource, /calendarChecked/);
});

test("appointment reviews workspace displays validation receipt outcome stages correlation and safety fields", () => {
  assert.match(workspaceSource, /receiptHandlerCompleted/);
  assert.match(workspaceSource, /validationReceiptConstructed/);
  assert.match(workspaceSource, /receiptOutcome/);
  assert.match(workspaceSource, /receiptPersisted/);
  assert.match(workspaceSource, /handlerResult\.accepted/);
  assert.match(workspaceSource, /handlerResult\.handlerCompleted/);
  assert.match(workspaceSource, /handlerResult\.failedStage/);
  assert.match(workspaceSource, /handlerResult\.matchingReplay/);
  assert.match(workspaceSource, /handlerResult\.replayExistingResultOnly/);
  assert.match(workspaceSource, /handlerResult\.eligibleForExecutorBoundary/);
  assert.match(workspaceSource, /handlerResult\.code/);
  assert.match(workspaceSource, /receiptType/);
  assert.match(workspaceSource, /schemaVersion/);
  assert.match(workspaceSource, /outcome/);
  assert.match(workspaceSource, /handlerCode/);
  assert.match(workspaceSource, /handlerCompleted/);
  assert.match(workspaceSource, /failedStage/);
  assert.match(workspaceSource, /matchingReplay/);
  assert.match(workspaceSource, /replayExistingResultOnly/);
  assert.match(workspaceSource, /eligibleForExecutorBoundary/);
  assert.match(workspaceSource, /pipelineCode/);
  assert.match(workspaceSource, /validation_passed/);
  assert.match(workspaceSource, /validation_rejected/);
  assert.match(workspaceSource, /matching_replay/);
  assert.match(
    workspaceSource,
    /immutable in-memory decision receipt was constructed/
  );
  assert.match(
    workspaceSource,
    /immutable rejection receipt was constructed/
  );
  assert.match(workspaceSource, /no new command or action was created/);
  assert.doesNotMatch(workspaceSource, /matchingReplay:\s+true/);
  assert.doesNotMatch(workspaceSource, /replayExistingResultOnly:\s+true/);
  assert.match(workspaceSource, /VALIDATION_RECEIPT_STAGE_LABELS/);
  assert.match(workspaceSource, /getValidationReceiptStages/);
  assert.match(workspaceSource, /Preconditions/);
  assert.match(workspaceSource, /Authorization/);
  assert.match(workspaceSource, /Idempotency and Version Guard/);
  assert.match(workspaceSource, /Command Envelope/);
  assert.match(workspaceSource, /Execution Policy/);
  assert.match(workspaceSource, /validationReceipt\?\.stages\?\.\[key\]/);
  assert.match(workspaceSource, /return \[\];/);
  assert.match(workspaceSource, /status: stage\.status/);
  assert.match(
    workspaceSource,
    /code: typeof stage\.code === "string" \? stage\.code : "not_run"/
  );
  assert.doesNotMatch(workspaceSource, /validationReceiptStages\s*=\s*\[/);
  assert.match(workspaceSource, /VALIDATION_RECEIPT_CORRELATION_FIELDS/);
  assert.match(workspaceSource, /getValidationReceiptCorrelation/);
  assert.match(workspaceSource, /Validation correlation metadata/);
  assert.match(workspaceSource, /Mock \/ dry-run context/);
  assert.match(workspaceSource, /Not persisted/);
  assert.match(workspaceSource, /actionIntent/);
  assert.match(workspaceSource, /actorId/);
  assert.match(workspaceSource, /actorRole/);
  assert.match(workspaceSource, /requestId/);
  assert.match(workspaceSource, /idempotencyKey/);
  assert.match(workspaceSource, /expectedReviewVersion/);
  assert.match(workspaceSource, /observedReviewVersion/);
  assert.match(workspaceSource, /requestFingerprint/);
  assert.match(workspaceSource, /requiredPermission/);
  assert.match(workspaceSource, /mock:\s+true/);
  assert.match(workspaceSource, /dryRun:\s+true/);
  assert.match(workspaceSource, /validationOnly:\s+true/);
  assert.match(workspaceSource, /controlledHandlingOnly:\s+true/);
  assert.match(workspaceSource, /receiptPersisted:\s+false/);
  assert.match(workspaceSource, /executionEnabled:\s+false/);
  assert.match(workspaceSource, /executorAvailable:\s+false/);
  assert.match(workspaceSource, /executionAvailable:\s+false/);
  assert.match(workspaceSource, /executionRequested:\s+false/);
  assert.match(workspaceSource, /actionPerformed:\s+false/);
  assert.match(workspaceSource, /commandDispatched:\s+false/);
  assert.match(workspaceSource, /commandPersisted:\s+false/);
  assert.match(workspaceSource, /bookingCreated:\s+false/);
  assert.match(workspaceSource, /calendarChecked:\s+false/);
  assert.match(workspaceSource, /appointmentCreated:\s+false/);
  assert.match(workspaceSource, /calendarEventCreated:\s+false/);
  assert.match(workspaceSource, /databasePersisted:\s+false/);
  assert.match(workspaceSource, /persistence:\s+"not_persisted"/);
});

test("appointment reviews workspace hardens validation receipt preview against stale responses", () => {
  assert.match(workspaceSource, /validationReceiptStatus/);
  assert.match(workspaceSource, /validationReceiptRequestSequenceRef/);
  assert.match(workspaceSource, /activeValidationReceiptRequestRef/);
  assert.match(workspaceSource, /activeValidationReceiptAbortRef/);
  assert.match(workspaceSource, /createValidationReceiptRequest/);
  assert.match(workspaceSource, /invalidateValidationReceiptRequest/);
  assert.match(workspaceSource, /isActiveValidationReceiptRequest/);
  assert.match(workspaceSource, /new AbortController\(\)/);
  assert.match(workspaceSource, /activeValidationReceiptAbortRef\.current\.abort\(\)/);
  assert.match(workspaceSource, /requestId,/);
  assert.match(workspaceSource, /reviewId: reviewIdForRequest/);
  assert.match(workspaceSource, /actionIntent: actionIntentForRequest/);
  assert.match(workspaceSource, /previewRequestId: requestIdForRequest/);
  assert.match(workspaceSource, /idempotencyKey: idempotencyKeyForRequest/);
  assert.match(
    workspaceSource,
    /expectedReviewVersion: expectedReviewVersionForRequest/
  );
  assert.match(workspaceSource, /activeRequest\.requestId === requestId/);
  assert.match(workspaceSource, /activeRequest\.reviewId === reviewId/);
  assert.match(workspaceSource, /activeRequest\.actionIntent === actionIntent/);
  assert.match(workspaceSource, /activeRequest\.previewRequestId === previewRequestId/);
  assert.match(workspaceSource, /activeRequest\.idempotencyKey === idempotencyKey/);
  assert.match(
    workspaceSource,
    /activeRequest\.expectedReviewVersion === expectedReviewVersion/
  );
  assert.match(workspaceSource, /selectedReviewIdRef\.current === reviewId/);
  assert.match(
    workspaceSource,
    /if \(\s+!\s*isActiveValidationReceiptRequest\(\{[\s\S]*requestId,[\s\S]*reviewId: reviewIdForRequest,[\s\S]*actionIntent: actionIntentForRequest,[\s\S]*previewRequestId: requestIdForRequest,[\s\S]*idempotencyKey: idempotencyKeyForRequest,[\s\S]*expectedReviewVersion: expectedReviewVersionForRequest[\s\S]*\}\)\s+\) \{\s+return;\s+\}/
  );
  assert.match(workspaceSource, /if \(isAbortError\(error\)\) \{\s+return;\s+\}/);
  assert.match(
    workspaceSource,
    /setValidationReceiptResult\(payload\);\s+setValidationReceiptStatus\("success"\);/
  );
  assert.match(
    workspaceSource,
    /setValidationReceiptResult\(null\);\s+setValidationReceiptStatus\("failure"\);/
  );
  assert.match(
    workspaceSource,
    /setValidationReceiptStatus\("loading"\);\s+setValidationReceiptResult\(null\);\s+setValidationReceiptError\(""\);/
  );
  assert.match(
    workspaceSource,
    /if \(validationReceiptStatus === "loading"\) \{\s+return;\s+\}/
  );
  assert.match(
    workspaceSource,
    /disabled=\{validationReceiptStatus === "loading"\}/
  );
});

test("appointment reviews workspace resets validation receipt preview on review change and unmount", () => {
  assert.match(workspaceSource, /invalidateValidationReceiptRequest\(\);/);
  assert.match(
    workspaceSource,
    /selectedReviewIdRef\.current = selectedReviewId;[\s\S]*invalidateValidationReceiptRequest\(\);/
  );
  assert.match(workspaceSource, /setValidationReceiptStatus\("idle"\)/);
  assert.match(workspaceSource, /setValidationReceiptResult\(null\)/);
  assert.match(workspaceSource, /setValidationReceiptError\(""\)/);
  assert.match(
    workspaceSource,
    /setSelectedValidationReceiptActionIntent\(VALIDATION_RECEIPT_ACTION_INTENTS\[0\]\)/
  );
  assert.match(
    workspaceSource,
    /setValidationReceiptRequestId\(INITIAL_VALIDATION_RECEIPT_REQUEST_ID\)/
  );
  assert.match(
    workspaceSource,
    /setValidationReceiptIdempotencyKey\(\s+INITIAL_VALIDATION_RECEIPT_IDEMPOTENCY_KEY\s+\)/
  );
  assert.match(
    workspaceSource,
    /setValidationReceiptExpectedReviewVersion\(\s+INITIAL_VALIDATION_RECEIPT_EXPECTED_REVIEW_VERSION\s+\)/
  );
  assert.match(
    workspaceSource,
    /isMountedRef\.current = false;[\s\S]*invalidateValidationReceiptRequest\(\);/
  );
});

test("appointment reviews workspace keeps validation receipt preview sensitive-data safe and non-executable", () => {
  assert.match(workspaceSource, /Patient data, clinical data/);
  assert.match(workspaceSource, /appointment details, calendar data/);
  assert.match(workspaceSource, /secrets, credentials/);
  assert.match(workspaceSource, /tokens, cookies, headers, sessions/);
  assert.match(workspaceSource, /complete verified actor\s+context/);
  assert.match(workspaceSource, /complete execution policy context/);
  assert.match(workspaceSource, /raw\s+dependency outputs are excluded/);
  assert.doesNotMatch(workspaceSource, /JSON\.stringify\(validationReceiptResult/);
  assert.doesNotMatch(workspaceSource, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewControlledActionValidationReceiptHandler/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewValidationDecisionReceiptContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewControlledActionValidationHandler/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewTrustedServerContextAssemblyContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewControlledActionValidationPipelineContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewControlledActionExecutionPolicyContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewControlledActionCommandEnvelopeContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewControlledActionGuardContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewVerifiedActorAuthorizationContract/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewActionIntentStateMachine/);
  assert.doesNotMatch(workspaceSource, /setReviews\([^)]*validationReceipt/i);
  assert.doesNotMatch(workspaceSource, /selectedReview\.status\s*=/);
  assert.doesNotMatch(workspaceSource, /receiptPersisted:\s+true/);
  assert.doesNotMatch(workspaceSource, /commandDispatched:\s+true/);
  assert.doesNotMatch(workspaceSource, /actionPerformed:\s+true/);
  assert.doesNotMatch(workspaceSource, /bookingCreated:\s+true/);
  assert.doesNotMatch(workspaceSource, /calendarChecked:\s+true/);
  assert.doesNotMatch(workspaceSource, /databasePersisted:\s+true/);
  assert.doesNotMatch(workspaceSource, /Date\.now|Math\.random|randomUUID|crypto/);
});

test("appointment reviews workspace hardens preconditions dry-run against stale responses", () => {
  assert.match(workspaceSource, /preconditionsRequestSequenceRef/);
  assert.match(workspaceSource, /activePreconditionsRequestRef/);
  assert.match(workspaceSource, /activePreconditionsAbortRef/);
  assert.match(workspaceSource, /createPreconditionsDryRunRequest/);
  assert.match(workspaceSource, /invalidatePreconditionsDryRunRequest/);
  assert.match(workspaceSource, /isActivePreconditionsDryRunRequest/);
  assert.match(workspaceSource, /new AbortController\(\)/);
  assert.match(workspaceSource, /activePreconditionsAbortRef\.current\.abort\(\)/);
  assert.match(workspaceSource, /signal: activeAbortController\?\.signal/);
  assert.match(workspaceSource, /requestId: sequenceId/);
  assert.match(workspaceSource, /reviewId: reviewIdForRequest/);
  assert.match(workspaceSource, /actionIntent: actionIntentForRequest/);
  assert.match(workspaceSource, /currentState: currentStateForRequest/);
  assert.match(workspaceSource, /actorId: actorIdForRequest/);
  assert.match(workspaceSource, /actorRole: actorRoleForRequest/);
  assert.match(workspaceSource, /preconditionsRequestId: requestIdForRequest/);
  assert.match(workspaceSource, /activeRequest\.requestId === requestId/);
  assert.match(workspaceSource, /activeRequest\.reviewId === reviewId/);
  assert.match(workspaceSource, /activeRequest\.actionIntent === actionIntent/);
  assert.match(workspaceSource, /activeRequest\.currentState === currentState/);
  assert.match(workspaceSource, /activeRequest\.actorId === actorId/);
  assert.match(workspaceSource, /activeRequest\.actorRole === actorRole/);
  assert.match(
    workspaceSource,
    /activeRequest\.preconditionsRequestId === preconditionsRequestId/
  );
  assert.match(workspaceSource, /selectedReviewIdRef\.current === reviewId/);
  assert.match(
    workspaceSource,
    /if \(\s+!\s*isActivePreconditionsDryRunRequest\(\{[\s\S]*requestId,[\s\S]*reviewId: reviewIdForRequest,[\s\S]*actionIntent: actionIntentForRequest,[\s\S]*currentState: currentStateForRequest,[\s\S]*actorId: actorIdForRequest,[\s\S]*actorRole: actorRoleForRequest,[\s\S]*preconditionsRequestId: requestIdForRequest[\s\S]*\}\)\s+\) \{\s+return;\s+\}/
  );
  assert.match(workspaceSource, /if \(isAbortError\(error\)\) \{\s+return;\s+\}/);
  assert.match(
    workspaceSource,
    /setPreconditionsDryRunResult\(payload\);\s+setPreconditionsDryRunStatus\("success"\);/
  );
  assert.match(
    workspaceSource,
    /setPreconditionsDryRunResult\(null\);\s+setPreconditionsDryRunStatus\("failure"\);/
  );
  assert.match(
    workspaceSource,
    /setPreconditionsDryRunStatus\("loading"\);\s+setPreconditionsDryRunResult\(null\);\s+setPreconditionsDryRunError\(""\);/
  );
  assert.match(
    workspaceSource,
    /if \(preconditionsDryRunStatus === "loading"\) \{\s+return;\s+\}/
  );
  assert.match(
    workspaceSource,
    /disabled=\{preconditionsDryRunStatus === "loading"\}/
  );
});

test("appointment reviews workspace resets preconditions preview on review change and unmount", () => {
  assert.match(workspaceSource, /invalidatePreconditionsDryRunRequest\(\);/);
  assert.match(
    workspaceSource,
    /selectedReviewIdRef\.current = selectedReviewId;\s+invalidateStateTransitionDryRunRequest\(\);\s+invalidatePreconditionsDryRunRequest\(\);/
  );
  assert.match(workspaceSource, /setPreconditionsDryRunStatus\("idle"\)/);
  assert.match(workspaceSource, /setPreconditionsDryRunResult\(null\)/);
  assert.match(workspaceSource, /setPreconditionsDryRunError\(""\)/);
  assert.match(
    workspaceSource,
    /setSelectedPreconditionsActionIntent\(PRECONDITIONS_ACTION_INTENTS\[0\]\)/
  );
  assert.match(
    workspaceSource,
    /setPreconditionsCurrentState\(INITIAL_PRECONDITIONS_CURRENT_STATE\)/
  );
  assert.match(
    workspaceSource,
    /setPreconditionsActorId\(INITIAL_PRECONDITIONS_ACTOR_ID\)/
  );
  assert.match(
    workspaceSource,
    /setPreconditionsActorRole\(INITIAL_PRECONDITIONS_ACTOR_ROLE\)/
  );
  assert.match(
    workspaceSource,
    /setPreconditionsRequestId\(INITIAL_PRECONDITIONS_REQUEST_ID\)/
  );
  assert.match(
    workspaceSource,
    /isMountedRef\.current = false;\s+invalidateStateTransitionDryRunRequest\(\);\s+invalidatePreconditionsDryRunRequest\(\);/
  );
});

test("appointment reviews workspace keeps preconditions dry-run validation-only and not executable", () => {
  assert.match(workspaceSource, /dryRun:\s+true/);
  assert.match(workspaceSource, /validationOnly:\s+true/);
  assert.match(workspaceSource, /preconditionsChecked:\s+true/);
  assert.match(workspaceSource, /controlledHandlingOnly:\s+true/);
  assert.match(workspaceSource, /executionAvailable:\s+false/);
  assert.match(workspaceSource, /executionRequested:\s+false/);
  assert.match(workspaceSource, /actionPerformed:\s+false/);
  assert.match(workspaceSource, /bookingCreated:\s+false/);
  assert.match(workspaceSource, /calendarChecked:\s+false/);
  assert.match(workspaceSource, /appointmentCreated:\s+false/);
  assert.match(workspaceSource, /calendarEventCreated:\s+false/);
  assert.match(workspaceSource, /databasePersisted:\s+false/);
  assert.match(workspaceSource, /persistence:\s+"not_persisted"/);
  assert.match(workspaceSource, /payload\.preconditionsChecked === true/);
  assert.match(workspaceSource, /payload\.controlledHandlingOnly === true/);
  assert.match(workspaceSource, /payload\.executionRequested === false/);
  assert.match(workspaceSource, /payload\.executionAvailable === false/);
  assert.match(workspaceSource, /payload\.persistence === "not_persisted"/);
  assert.doesNotMatch(workspaceSource, /setReviews\([^)]*preconditions/i);
  assert.doesNotMatch(workspaceSource, /selectedReview\.status\s*=/);
  assert.doesNotMatch(workspaceSource, /appointmentReviewActionPreconditionsContract/);
  assert.doesNotMatch(workspaceSource, /authenticated:\s+true/);
  assert.doesNotMatch(workspaceSource, /authorized:\s+true/);
  assert.doesNotMatch(workspaceSource, /executionAvailable:\s+true/);
  assert.doesNotMatch(workspaceSource, /executionRequested:\s+true/);
  assert.doesNotMatch(workspaceSource, /actionPerformed:\s+true/);
});

test("appointment reviews workspace hardens state transition dry-run against stale responses", () => {
  assert.match(workspaceSource, /stateTransitionRequestSequenceRef/);
  assert.match(workspaceSource, /activeStateTransitionRequestRef/);
  assert.match(workspaceSource, /activeStateTransitionAbortRef/);
  assert.match(workspaceSource, /isMountedRef/);
  assert.match(workspaceSource, /createStateTransitionDryRunRequest/);
  assert.match(workspaceSource, /invalidateStateTransitionDryRunRequest/);
  assert.match(workspaceSource, /isActiveStateTransitionDryRunRequest/);
  assert.match(workspaceSource, /new AbortController\(\)/);
  assert.match(workspaceSource, /activeStateTransitionAbortRef\.current\.abort\(\)/);
  assert.match(workspaceSource, /signal: activeAbortController\?\.signal/);
  assert.match(workspaceSource, /isAbortError/);
  assert.match(workspaceSource, /typeof error === "object"/);
  assert.match(workspaceSource, /error\.name === "AbortError"/);
  assert.match(workspaceSource, /requestId/);
  assert.match(workspaceSource, /reviewId: reviewIdForRequest/);
  assert.match(workspaceSource, /currentState: currentStateForRequest/);
  assert.match(workspaceSource, /event: eventForRequest/);
  assert.match(workspaceSource, /activeRequest\.requestId === requestId/);
  assert.match(workspaceSource, /activeRequest\.reviewId === reviewId/);
  assert.match(workspaceSource, /activeRequest\.currentState === currentState/);
  assert.match(workspaceSource, /activeRequest\.event === event/);
  assert.match(workspaceSource, /selectedReviewIdRef\.current === reviewId/);
  assert.match(workspaceSource, /isMountedRef\.current/);
});

test("appointment reviews workspace invalidates state transition requests on review change and unmount", () => {
  assert.match(
    workspaceSource,
    /useEffect\(\(\) => \{\s+isMountedRef\.current = true;/
  );
  assert.match(workspaceSource, /isMountedRef\.current = false/);
  assert.match(workspaceSource, /invalidateStateTransitionDryRunRequest\(\);/);
  assert.match(
    workspaceSource,
    /selectedReviewIdRef\.current = selectedReviewId;\s+invalidateStateTransitionDryRunRequest\(\);/
  );
  assert.match(workspaceSource, /setStateTransitionDryRunStatus\("idle"\)/);
  assert.match(workspaceSource, /setStateTransitionDryRunResult\(null\)/);
  assert.match(workspaceSource, /setStateTransitionDryRunError\(""\)/);
  assert.match(
    workspaceSource,
    /setStateTransitionPreviewCurrentState\(INITIAL_PREVIEW_CURRENT_STATE\)/
  );
  assert.match(
    workspaceSource,
    /setSelectedStateTransitionEvent\(INITIAL_PREVIEW_EVENT\)/
  );
});

test("appointment reviews workspace resets decision preview on review change and unmount", () => {
  assert.match(workspaceSource, /invalidateDecisionPreviewRequest\(\);/);
  assert.match(
    workspaceSource,
    /selectedReviewIdRef\.current = selectedReviewId;[\s\S]*invalidateDecisionPreviewRequest\(\);/
  );
  assert.match(workspaceSource, /setDecisionPreviewStatus\("idle"\)/);
  assert.match(workspaceSource, /setDecisionPreviewResult\(null\)/);
  assert.match(workspaceSource, /setDecisionPreviewError\(""\)/);
  assert.match(
    workspaceSource,
    /isMountedRef\.current = false;[\s\S]*invalidateDecisionPreviewRequest\(\);/
  );
});

test("appointment reviews workspace resets decision comparison on review change and unmount", () => {
  assert.match(workspaceSource, /invalidateDecisionComparisonRequest\(\);/);
  assert.match(
    workspaceSource,
    /selectedReviewIdRef\.current = selectedReviewId;[\s\S]*invalidateDecisionComparisonRequest\(\);/
  );
  assert.match(workspaceSource, /setDecisionComparisonStatus\("idle"\)/);
  assert.match(workspaceSource, /setDecisionComparisonResult\(null\)/);
  assert.match(workspaceSource, /setDecisionComparisonError\(""\)/);
  assert.match(
    workspaceSource,
    /isMountedRef\.current = false;[\s\S]*invalidateDecisionComparisonRequest\(\);/
  );
});

test("appointment reviews workspace ignores stale state transition success and failure", () => {
  assert.match(
    workspaceSource,
    /if \(\s+!\s*isActiveStateTransitionDryRunRequest\(\{[\s\S]*requestId,[\s\S]*reviewId: reviewIdForRequest,[\s\S]*currentState: currentStateForRequest,[\s\S]*event: eventForRequest[\s\S]*\}\)\s+\) \{\s+return;\s+\}/
  );
  assert.match(
    workspaceSource,
    /if \(isAbortError\(error\)\) \{\s+return;\s+\}/
  );
  assert.match(
    workspaceSource,
    /setStateTransitionDryRunResult\(payload\);\s+setStateTransitionDryRunStatus\("success"\);/
  );
  assert.match(
    workspaceSource,
    /setStateTransitionDryRunResult\(null\);\s+setStateTransitionDryRunStatus\("failure"\);/
  );
  assert.match(
    workspaceSource,
    /setStateTransitionDryRunStatus\("loading"\);\s+setStateTransitionDryRunResult\(null\);\s+setStateTransitionDryRunError\(""\);/
  );
  assert.match(
    workspaceSource,
    /if \(stateTransitionDryRunStatus === "loading"\) \{\s+return;\s+\}/
  );
});

test("appointment reviews workspace keeps state transition dry-run validation-only and not persisted", () => {
  assert.match(workspaceSource, /dryRun:\s+true/);
  assert.match(workspaceSource, /validationOnly:\s+true/);
  assert.match(workspaceSource, /executionAvailable:\s+false/);
  assert.match(workspaceSource, /actionPerformed:\s+false/);
  assert.match(workspaceSource, /bookingCreated:\s+false/);
  assert.match(workspaceSource, /calendarChecked:\s+false/);
  assert.match(workspaceSource, /appointmentCreated:\s+false/);
  assert.match(workspaceSource, /calendarEventCreated:\s+false/);
  assert.match(workspaceSource, /databasePersisted:\s+false/);
  assert.match(workspaceSource, /persistence:\s+"not_persisted"/);
  assert.match(workspaceSource, /payload\.executionAvailable === false/);
  assert.match(workspaceSource, /payload\.persistence === "not_persisted"/);
  assert.match(workspaceSource, /Not persisted/);
  assert.match(workspaceSource, /Validation only/);
  assert.doesNotMatch(workspaceSource, /setReviews\([^)]*stateTransition/i);
  assert.doesNotMatch(workspaceSource, /selectedReview\.status\s*=/);
  assert.doesNotMatch(workspaceSource, /status:\s*stateTransitionDryRunResult/);
  assert.doesNotMatch(workspaceSource, /setStateTransitionPreviewCurrentState\(.*nextState/);
  assert.doesNotMatch(workspaceSource, /setSelectedReviewId\(.*nextState/);
});

test("appointment reviews workspace shows read-only detail preview states", () => {
  assert.match(workspaceSource, /selectedReviewId/);
  assert.match(workspaceSource, /setSelectedReviewId/);
  assert.match(workspaceSource, /reviews\.find\(\(review\) => review\.id === selectedReviewId\)/);
  assert.doesNotMatch(workspaceSource, /selectedReview = reviews\[0\]/);
  assert.match(workspaceSource, /nextReviews\[0\]\?\.id \|\| ""/);
  assert.match(workspaceSource, /Preview details/);
  assert.match(workspaceSource, /onClick=\{\(\) => setSelectedReviewId\(review\.id\)\}/);
  assert.match(workspaceSource, /Read-only review preview/);
  assert.match(workspaceSource, /No selected appointment review/);
  assert.match(workspaceSource, /Select a review to inspect details/);
  assert.match(workspaceSource, /Review id/);
  assert.match(workspaceSource, /Selected slot/);
  assert.match(workspaceSource, /Database persisted/);
  assert.match(workspaceSource, /Booking actions/);
  assert.match(workspaceSource, /Calendar actions/);
  assert.match(workspaceSource, /summary\.safety\?\.readOnly === true/);
  assert.match(workspaceSource, /summary\.safety\?\.databasePersisted === true/);
  assert.match(workspaceSource, /summary\.safety\?\.bookingActionsEnabled === true/);
  assert.match(workspaceSource, /summary\.safety\?\.calendarActionsEnabled === true/);
});

test("appointment reviews workspace renders pending review data defensively", () => {
  assert.match(workspaceSource, /reviews\.map/);
  assert.match(workspaceSource, /review\.status/);
  assert.match(workspaceSource, /review\.selectedSlot\?\.doctorName/);
  assert.match(workspaceSource, /review\.selectedSlot\?\.time/);
  assert.match(workspaceSource, /Booking created/);
  assert.match(workspaceSource, /Calendar checked/);
  assert.match(workspaceSource, /Secretary confirmation/);
  assert.match(workspaceSource, /String\(review\.bookingCreated === true\)/);
  assert.match(workspaceSource, /String\(review\.calendarChecked === true\)/);
});

test("appointment reviews workspace has no approval, booking, or calendar action buttons", () => {
  assert.match(workspaceSource, /<button/);
  assert.match(workspaceSource, /Preview details/);
  assert.match(workspaceSource, /Run state transition dry-run/);
  assert.match(workspaceSource, /Run preconditions dry-run/);
  assert.doesNotMatch(workspaceSource, /<button[^>]*>\s*Approve\s*<\/button>/i);
  assert.doesNotMatch(workspaceSource, /<button[^>]*>\s*Reject\s*<\/button>/i);
  assert.doesNotMatch(workspaceSource, /<button[^>]*>\s*Confirm\s*<\/button>/i);
  assert.doesNotMatch(workspaceSource, /<button[^>]*>\s*Execute\s*<\/button>/i);
  assert.doesNotMatch(workspaceSource, /<button[^>]*>\s*Save\s*<\/button>/i);
  assert.doesNotMatch(workspaceSource, /<button[^>]*>\s*Apply\s*<\/button>/i);
  assert.doesNotMatch(workspaceSource, /Confirm appointment/i);
  assert.doesNotMatch(
    workspaceSource,
    /<button[^>]*>\s*Book appointment\s*<\/button>/i
  );
  assert.doesNotMatch(
    workspaceSource,
    /<button[^>]*>\s*Create appointment\s*<\/button>/i
  );
  assert.doesNotMatch(
    workspaceSource,
    /<button[^>]*>\s*Sync calendar\s*<\/button>/i
  );
  assert.doesNotMatch(workspaceSource, /onClick=\{\(\) => approve/i);
  assert.doesNotMatch(workspaceSource, /onClick=\{\(\) => reject/i);
  assert.doesNotMatch(workspaceSource, /onClick=\{\(\) => book/i);
  assert.doesNotMatch(workspaceSource, /onClick=\{\(\) => sync/i);
  assert.doesNotMatch(workspaceSource, /Save state/i);
  assert.doesNotMatch(workspaceSource, /Apply transition/i);
  assert.doesNotMatch(workspaceSource, /create appointment/i);
  assert.match(workspaceSource, /Prepare Calendar Sync/);
  assert.match(workspaceSource, /Sync to Configured Calendar/);
  assert.doesNotMatch(workspaceSource, /Google Calendar/);
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(["pris" + "ma", "supa" + "base", "red" + "is"].join("|"), "i")
  );
  assert.doesNotMatch(
    workspaceSource,
    /appointmentReviewActionIntentStateMachine/
  );
  assert.doesNotMatch(
    workspaceSource,
    /appointmentReviewActionPreconditionsContract/
  );
  assert.doesNotMatch(workspaceSource, /transitionAppointmentReviewActionIntentState/);
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(
      [
        "create" + "Appointment",
        "create" + "CalendarEvent",
        "get" + "CalendarProvider",
      ].join("|")
    )
  );
  assert.doesNotMatch(
    workspaceSource,
    new RegExp("manual" + "AppointmentCalendarSync")
  );
  assert.doesNotMatch(workspaceSource, new RegExp("google" + "apis", "i"));
  assert.doesNotMatch(workspaceSource, /authenticated:\s+true/);
  assert.doesNotMatch(workspaceSource, /authorized:\s+true/);
  assert.doesNotMatch(workspaceSource, /executionAvailable:\s+true/);
  assert.doesNotMatch(workspaceSource, /executionRequested:\s+true/);
  assert.doesNotMatch(workspaceSource, /bookingCreated:\s+true/);
  assert.doesNotMatch(workspaceSource, /calendarChecked:\s+true/);
  assert.doesNotMatch(workspaceSource, /databasePersisted:\s+true/);
  assert.doesNotMatch(workspaceSource, /appointmentCreated:\s+true/);
  assert.doesNotMatch(workspaceSource, /calendarEventCreated:\s+true/);
  assert.doesNotMatch(workspaceSource, /randevunuz oluşturuldu/i);
});

test("appointment reviews workspace exposes queue-level shift handoff preview", () => {
  assert.match(workspaceSource, /shiftHandoffStatus/);
  assert.match(workspaceSource, /shiftHandoffResult/);
  assert.match(workspaceSource, /shiftHandoffCopyStatus/);
  assert.match(workspaceSource, /runShiftHandoffPreview/);
  assert.match(
    workspaceSource,
    /\/api\/secretary\/appointment-reviews\/shift-handoff-preview/
  );
  assert.match(workspaceSource, /method: "POST"/);
  assert.match(workspaceSource, /body: JSON\.stringify\(\{\}\)/);
  assert.match(workspaceSource, /Generate Shift Handoff Preview/);
  assert.match(workspaceSource, /Copy Internal Brief/);
  assert.match(workspaceSource, /Secretary Shift Handoff Brief/);
  assert.match(workspaceSource, /Internal Shift Handoff Brief - not sent or saved/);
  assert.match(workspaceSource, /readOnly/);
  assert.match(workspaceSource, /plainTextBrief/);
  const handoffRouteIndex = workspaceSource.indexOf(
    '"/api/secretary/appointment-reviews/shift-handoff-preview"'
  );
  const handoffRequestSource = workspaceSource.slice(
    handoffRouteIndex,
    handoffRouteIndex + 300
  );
  assert.match(handoffRequestSource, /body: JSON\.stringify\(\{\}\)/);
  assert.doesNotMatch(
    handoffRequestSource,
    /body: JSON\.stringify\(\{[\s\S]*(reviewId|reviewIds|items|plainTextBrief)/
  );
  assert.doesNotMatch(workspaceSource, /checkedItemKeys|completedChecks/);
});

test("appointment reviews workspace hardens shift handoff against stale responses", () => {
  assert.match(workspaceSource, /shiftHandoffRequestSequenceRef/);
  assert.match(workspaceSource, /activeShiftHandoffRequestRef/);
  assert.match(workspaceSource, /activeShiftHandoffAbortRef/);
  assert.match(workspaceSource, /createShiftHandoffRequest/);
  assert.match(workspaceSource, /invalidateShiftHandoffRequest/);
  assert.match(workspaceSource, /resetShiftHandoffState/);
  assert.match(workspaceSource, /isActiveShiftHandoffRequest/);
  assert.match(workspaceSource, /activeShiftHandoffAbortRef\.current\.abort\(\)/);
  assert.match(
    workspaceSource,
    /if \(\s+!\s*isActiveShiftHandoffRequest\(\{[\s\S]*requestId,[\s\S]*reviewIds: reviewIdsForRequest[\s\S]*\}\)\s+\) \{\s+return;\s+\}/
  );
  assert.match(
    workspaceSource,
    /reviewIdsMatch\(currentReviewIds, reviewIds\)/
  );
  assert.match(
    workspaceSource,
    /setReviews\(nextReviews\);[\s\S]*reconcileAppointmentReviewGuidedSession\(\s+currentSession,\s+nextReviews\s+\)[\s\S]*invalidateShiftHandoffRequest\(\);\s+resetShiftHandoffState\(\);/
  );
  assert.doesNotMatch(workspaceSource, /setSelectedReviewId\(.*shiftHandoff/i);
  assert.doesNotMatch(workspaceSource, /setResolutionGuidanceResult\(.*shiftHandoff/i);
  assert.doesNotMatch(workspaceSource, /setResolutionChecklistSession\(.*shiftHandoff/i);
});

test("appointment reviews workspace copies only the server-returned handoff brief after explicit action", () => {
  const copyFunctionStart = workspaceSource.indexOf("async function copyShiftHandoffBrief");
  const copyFunctionSource = workspaceSource.slice(copyFunctionStart, copyFunctionStart + 1200);
  const previewFunctionStart = workspaceSource.indexOf("async function runShiftHandoffPreview");
  const previewFunctionSource = workspaceSource.slice(previewFunctionStart, previewFunctionStart + 2600);

  assert.match(copyFunctionSource, /navigator\.clipboard\.writeText\(brief\)/);
  assert.match(copyFunctionSource, /const brief = shiftHandoffResult\?\.plainTextBrief/);
  assert.match(copyFunctionSource, /Copied locally/);
  assert.match(copyFunctionSource, /Clipboard is unavailable/);
  assert.match(copyFunctionSource, /Clipboard copy failed safely/);
  assert.doesNotMatch(previewFunctionSource, /clipboard\.writeText/);
  assert.doesNotMatch(copyFunctionSource, /resolutionChecklistSession/);
  assert.doesNotMatch(copyFunctionSource, /fetch\(/);
  assert.doesNotMatch(copyFunctionSource, /localStorage|sessionStorage|document\.execCommand/);
});

test("appointment reviews workspace validates shift handoff safety fields", () => {
  assert.match(workspaceSource, /isSafeShiftHandoffResponse/);
  assert.match(workspaceSource, /payload\.shiftHandoffPreview === true/);
  assert.match(workspaceSource, /payload\.executionEnabled === false/);
  assert.match(workspaceSource, /payload\.bookingCreated === false/);
  assert.match(workspaceSource, /payload\.calendarChecked === false/);
  assert.match(workspaceSource, /payload\.databasePersisted === false/);
  assert.match(workspaceSource, /payload\.handoffPersisted === false/);
  assert.match(workspaceSource, /payload\.handoffSent === false/);
  assert.match(workspaceSource, /payload\.preview === "secretary_shift_handoff_preview"/);
  assert.match(workspaceSource, /isSafeShiftHandoffItem/);
  assert.match(workspaceSource, /isSafeShiftHandoffBranch/);
});

test("appointment reviews workspace uses neutral handoff wording without automatic action claims", () => {
  assert.doesNotMatch(workspaceSource, /recommendedAction|preferredAction|bestAction/);
  assert.doesNotMatch(workspaceSource, /should approve|should reject/i);
  assert.doesNotMatch(workspaceSource, /automatic decision/i);
  assert.doesNotMatch(workspaceSource, /assignedTo/);
  assert.doesNotMatch(workspaceSource, /delivered|synchronized/i);
  assert.doesNotMatch(workspaceSource, /handoff saved|message sent|task assigned/i);
});

test("appointment reviews workspace styles are present", () => {
  assert.match(cssSource, /Appointment Reviews Workspace/);
  assert.match(cssSource, /\.appointment-reviews-workspace-section/);
  assert.match(cssSource, /\.appointment-reviews-workspace-card/);
  assert.match(cssSource, /\.appointment-reviews-empty-state/);
  assert.match(cssSource, /\.appointment-review-detail-preview/);
  assert.match(cssSource, /\.appointment-review-detail-grid/);
  assert.match(cssSource, /\.appointment-review-detail-empty/);
  assert.match(cssSource, /\.appointment-review-action-intent-preview/);
  assert.match(cssSource, /\.appointment-review-action-intent-grid/);
  assert.match(cssSource, /\.appointment-review-action-intent-list/);
  assert.match(cssSource, /\.appointment-review-action-intent-empty/);
  assert.match(cssSource, /\.appointment-review-action-intent-button/);
  assert.match(cssSource, /\.appointment-review-action-intent-state/);
  assert.match(cssSource, /\.appointment-review-state-transition-preview/);
  assert.match(cssSource, /\.appointment-review-state-transition-grid/);
  assert.match(cssSource, /\.appointment-review-state-transition-controls/);
  assert.match(cssSource, /\.appointment-review-state-transition-list/);
  assert.match(cssSource, /\.appointment-review-state-transition-empty/);
  assert.match(cssSource, /\.appointment-review-state-transition-button/);
  assert.match(cssSource, /\.appointment-review-state-transition-state/);
  assert.match(cssSource, /\.appointment-review-decision-preview/);
  assert.match(cssSource, /\.appointment-review-decision-grid/);
  assert.match(cssSource, /\.appointment-review-decision-controls/);
  assert.match(cssSource, /\.appointment-review-decision-list/);
  assert.match(cssSource, /\.appointment-review-decision-empty/);
  assert.match(cssSource, /\.appointment-review-decision-button/);
  assert.match(cssSource, /\.appointment-review-decision-state/);
  assert.match(cssSource, /\.appointment-review-decision-comparison/);
  assert.match(cssSource, /\.appointment-review-decision-comparison-grid/);
  assert.match(cssSource, /\.appointment-review-decision-comparison-paths/);
  assert.match(cssSource, /\.appointment-review-decision-comparison-list/);
  assert.match(cssSource, /\.appointment-review-decision-comparison-empty/);
  assert.match(cssSource, /\.appointment-review-decision-comparison-button/);
  assert.match(cssSource, /\.appointment-review-decision-comparison-state/);
  assert.match(cssSource, /\.appointment-review-decision-execution/);
  assert.match(cssSource, /\.appointment-review-decision-execution-controls/);
  assert.match(cssSource, /\.appointment-review-decision-execution-grid/);
  assert.match(cssSource, /\.appointment-review-decision-execution-button/);
  assert.match(cssSource, /\.appointment-review-decision-execution-state/);
  assert.match(cssSource, /\.appointment-review-decision-execution-confirmation/);
  assert.match(cssSource, /\.appointment-review-queue-readiness/);
  assert.match(cssSource, /\.appointment-review-queue-readiness-controls/);
  assert.match(cssSource, /\.appointment-review-queue-readiness-summary/);
  assert.match(cssSource, /\.appointment-review-queue-readiness-button/);
  assert.match(cssSource, /\.appointment-review-queue-readiness-state/);
  assert.match(cssSource, /\.appointment-review-readiness-badges/);
  assert.match(cssSource, /\.appointment-review-shift-handoff/);
  assert.match(cssSource, /\.appointment-review-shift-handoff-controls/);
  assert.match(cssSource, /\.appointment-review-shift-handoff-summary/);
  assert.match(cssSource, /\.appointment-review-shift-handoff-items/);
  assert.match(cssSource, /\.appointment-review-shift-handoff-button/);
  assert.match(cssSource, /\.appointment-review-shift-handoff-state/);
  assert.match(cssSource, /\.appointment-review-shift-handoff-brief/);
  assert.match(cssSource, /\.appointment-review-follow-up-board/);
  assert.match(cssSource, /\.appointment-review-follow-up-board-controls/);
  assert.match(cssSource, /\.appointment-review-follow-up-board-summary/);
  assert.match(cssSource, /\.appointment-review-follow-up-board-button/);
  assert.match(cssSource, /\.appointment-review-follow-up-board-state/);
  assert.match(cssSource, /\.appointment-review-follow-up-board-categories/);
  assert.match(cssSource, /\.appointment-review-follow-up-board-items/);
  assert.match(cssSource, /\.appointment-review-follow-up-board-tags/);
  assert.match(cssSource, /\.appointment-review-guided-session/);
  assert.match(cssSource, /\.appointment-review-guided-session-controls/);
  assert.match(cssSource, /\.appointment-review-guided-session-summary/);
  assert.match(cssSource, /\.appointment-review-guided-session-button/);
  assert.match(cssSource, /\.appointment-review-guided-session-state/);
  assert.match(cssSource, /\.appointment-review-session-badges/);
  assert.match(cssSource, /\.appointment-review-validation-receipt-preview/);
  assert.match(cssSource, /\.appointment-review-validation-receipt-grid/);
  assert.match(cssSource, /\.appointment-review-validation-receipt-controls/);
  assert.match(cssSource, /\.appointment-review-validation-receipt-stages/);
  assert.match(cssSource, /\.appointment-review-validation-receipt-badges/);
  assert.match(cssSource, /\.appointment-review-validation-receipt-correlation/);
  assert.match(cssSource, /\.appointment-review-validation-receipt-list/);
  assert.match(cssSource, /\.appointment-review-validation-receipt-empty/);
  assert.match(cssSource, /\.appointment-review-validation-receipt-button/);
  assert.match(cssSource, /\.appointment-review-validation-receipt-state/);
  assert.match(cssSource, /\.appointment-review-preconditions-preview/);
  assert.match(cssSource, /\.appointment-review-preconditions-grid/);
  assert.match(cssSource, /\.appointment-review-preconditions-controls/);
  assert.match(cssSource, /\.appointment-review-preconditions-list/);
  assert.match(cssSource, /\.appointment-review-preconditions-empty/);
  assert.match(cssSource, /\.appointment-review-preconditions-button/);
  assert.match(cssSource, /\.appointment-review-preconditions-state/);
  assert.match(cssSource, /\.appointment-review-item/);
  assert.match(cssSource, /\.appointment-review-preview-button/);
});
