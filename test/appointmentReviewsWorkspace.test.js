const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const pageSource = fs.readFileSync("app/page.js", "utf8");
const workspaceSource = fs.readFileSync(
  "app/components/AppointmentReviewsWorkspace.js",
  "utf8"
);
const cssSource = fs.readFileSync("app/globals.css", "utf8");

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
  assert.doesNotMatch(
    workspaceSource,
    /fetch\(`\/api\/secretary\/appointment-reviews\/\$\{/
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
  assert.doesNotMatch(workspaceSource, /<button[^>]*>\s*Approve\s*<\/button>/i);
  assert.doesNotMatch(workspaceSource, /<button[^>]*>\s*Reject\s*<\/button>/i);
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
  assert.doesNotMatch(workspaceSource, /calendar sync/i);
  assert.doesNotMatch(workspaceSource, /Google Calendar/);
  assert.doesNotMatch(workspaceSource, /prisma|supabase|redis/i);
  assert.doesNotMatch(
    workspaceSource,
    /appointmentReviewActionIntentStateMachine/
  );
  assert.doesNotMatch(workspaceSource, /transitionAppointmentReviewActionIntentState/);
  assert.doesNotMatch(workspaceSource, /createAppointment|createCalendarEvent|getCalendarProvider/);
  assert.doesNotMatch(workspaceSource, /manualAppointmentCalendarSync/);
  assert.doesNotMatch(workspaceSource, /googleapis/i);
  assert.doesNotMatch(workspaceSource, /bookingCreated:\s+true/);
  assert.doesNotMatch(workspaceSource, /calendarChecked:\s+true/);
  assert.doesNotMatch(workspaceSource, /databasePersisted:\s+true/);
  assert.doesNotMatch(workspaceSource, /appointmentCreated:\s+true/);
  assert.doesNotMatch(workspaceSource, /calendarEventCreated:\s+true/);
  assert.doesNotMatch(workspaceSource, /randevunuz oluşturuldu/i);
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
  assert.match(cssSource, /\.appointment-review-item/);
  assert.match(cssSource, /\.appointment-review-preview-button/);
});
