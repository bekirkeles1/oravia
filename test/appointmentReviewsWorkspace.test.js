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
  assert.match(workspaceSource, /randevu\s+oluşturmaz/);
  assert.match(workspaceSource, /takvim çakışması kontrolü yapmaz/);
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
  assert.doesNotMatch(workspaceSource, /onClick=\{/);
  assert.doesNotMatch(workspaceSource, /<button/);
  assert.doesNotMatch(workspaceSource, /create appointment/i);
  assert.doesNotMatch(workspaceSource, /calendar sync/i);
  assert.doesNotMatch(workspaceSource, /randevunuz oluşturuldu/i);
});

test("appointment reviews workspace styles are present", () => {
  assert.match(cssSource, /Appointment Reviews Workspace/);
  assert.match(cssSource, /\.appointment-reviews-workspace-section/);
  assert.match(cssSource, /\.appointment-reviews-workspace-card/);
  assert.match(cssSource, /\.appointment-reviews-empty-state/);
  assert.match(cssSource, /\.appointment-review-item/);
});
