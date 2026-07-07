const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const pageSource = fs.readFileSync("app/page.js", "utf8");
const workspaceSource = fs.readFileSync(
  "app/components/DoctorAvailabilityWorkspace.js",
  "utf8"
);
const cssSource = fs.readFileSync("app/globals.css", "utf8");

test("dashboard page exposes doctor availability as a separate workspace tab", () => {
  assert.match(
    pageSource,
    /import DoctorAvailabilityWorkspace from "\.\/components\/DoctorAvailabilityWorkspace"/
  );
  assert.match(pageSource, /href="#doctor-availability"/);
  assert.match(pageSource, /Doktor Müsaitlik/);
  assert.match(pageSource, /<section id="doctor-availability">/);
  assert.match(pageSource, /<DoctorAvailabilityWorkspace \/>/);
});

test("doctor availability workspace fetches mock doctors and availability", () => {
  assert.match(workspaceSource, /fetch\("\/api\/secretary\/doctors"\)/);
  assert.match(
    workspaceSource,
    /fetch\("\/api\/secretary\/doctors\/availability"\)/
  );
  assert.match(workspaceSource, /Doktor seçimi/);
  assert.match(workspaceSource, /Pazartesi/);
  assert.match(workspaceSource, /Pazar/);
});

test("doctor availability workspace sends PATCH updates to the safe mock endpoint", () => {
  assert.match(workspaceSource, /method: "PATCH"/);
  assert.match(workspaceSource, /Content-Type/);
  assert.match(
    workspaceSource,
    /patchJson\("\/api\/secretary\/doctors\/availability"/
  );
  assert.match(workspaceSource, /doctorId: selectedDoctorId/);
  assert.match(workspaceSource, /enabled: row\.enabled/);
  assert.match(workspaceSource, /windows/);
});

test("doctor availability workspace keeps mock safety boundaries visible", () => {
  assert.match(workspaceSource, /randevu oluşturmaz/);
  assert.match(workspaceSource, /takvime yazmaz/);
  assert.match(workspaceSource, /database’e kalıcı/);
  assert.match(workspaceSource, /Kalıcı kayıt yapılmadı/);
  assert.match(workspaceSource, /Mock doğrula/);
  assert.doesNotMatch(workspaceSource, /randevunuz oluşturuldu/i);
  assert.doesNotMatch(workspaceSource, /Google Calendar’a işlendi/i);
});

test("doctor availability workspace styles are present", () => {
  assert.match(cssSource, /Doctor Availability Workspace Tab/);
  assert.match(cssSource, /\.doctor-availability-workspace-section/);
  assert.match(cssSource, /\.doctor-availability-workspace-card/);
  assert.match(cssSource, /\.doctor-availability-day-row/);
  assert.match(cssSource, /\.doctor-availability-timeline-track/);
  assert.match(cssSource, /\.doctor-availability-day-button/);
});
