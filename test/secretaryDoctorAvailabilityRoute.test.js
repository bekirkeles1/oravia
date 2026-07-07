const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GET,
  PATCH,
} = require("../app/api/secretary/doctors/availability/route");

function createJsonRequest(payload) {
  return new Request("http://localhost/api/secretary/doctors/availability", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

test("secretary doctor availability GET route returns mock schedules", async () => {
  const response = await GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.source, "mock");
  assert.ok(Array.isArray(body.availability));
  assert.equal(body.availability.length, 4);
  assert.ok(body.availability[0].doctorId);
  assert.ok(Array.isArray(body.availability[0].weeklyAvailability));
});

test("secretary doctor availability PATCH route validates a mock update request", async () => {
  const response = await PATCH(
    createJsonRequest({
      doctorId: "dr-ayse-demir",
      day: "Çarşamba",
      enabled: true,
      windows: [
        { start: "09:00", end: "12:00" },
        { start: "13:00", end: "17:00" },
      ],
    })
  );

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.source, "mock");
  assert.equal(body.persistence, "not_persisted");
  assert.equal(body.doctor.id, "dr-ayse-demir");
  assert.equal(body.updatedAvailability.dayAvailability.day, "wednesday");
  assert.deepEqual(body.updatedAvailability.dayAvailability.windows, [
    { start: "09:00", end: "12:00" },
    { start: "13:00", end: "17:00" },
  ]);
  assert.equal(body.safety.createsAppointment, false);
  assert.equal(body.safety.writesCalendar, false);
  assert.equal(body.safety.checksCalendarConflict, false);
  assert.equal(body.safety.exposesPatientData, false);
});

test("secretary doctor availability PATCH route rejects invalid JSON", async () => {
  const request = new Request(
    "http://localhost/api/secretary/doctors/availability",
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: "{invalid-json",
    }
  );

  const response = await PATCH(request);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "error");
  assert.equal(body.source, "mock");
  assert.equal(body.error.code, "invalid_json");
});

test("secretary doctor availability PATCH route returns handler validation errors", async () => {
  const response = await PATCH(
    createJsonRequest({
      doctorId: "dr-ayse-demir",
      day: "Çarşamba",
      enabled: true,
      windows: [{ start: "17:00", end: "09:00" }],
    })
  );

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "error");
  assert.equal(body.source, "mock");
  assert.equal(body.error.code, "invalid_time_window");
  assert.match(body.error.message, /windows\[0\]/);
});
