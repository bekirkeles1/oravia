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
  assert.doesNotMatch(workspaceSource, /approve|reject/i);
  assert.match(workspaceSource, /<button/);
  assert.match(workspaceSource, /Preview details/);
  assert.doesNotMatch(workspaceSource, /Approve details|Reject details/i);
  assert.doesNotMatch(workspaceSource, /Book appointment|Create appointment/i);
  assert.doesNotMatch(workspaceSource, /Calendar sync|Check calendar/i);
  assert.doesNotMatch(workspaceSource, /create appointment/i);
  assert.doesNotMatch(workspaceSource, /calendar sync/i);
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
  assert.match(cssSource, /\.appointment-review-item/);
  assert.match(cssSource, /\.appointment-review-preview-button/);
});
