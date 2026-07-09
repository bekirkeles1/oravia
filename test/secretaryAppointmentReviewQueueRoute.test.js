const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} = require("../app/api/secretary/appointment-reviews/route");
const detailRoute = require("../app/api/secretary/appointment-reviews/[id]/route");

test("secretary appointment review queue GET route returns safe empty mock response", async () => {
  const response = await GET(
    new Request("http://localhost/api/secretary/appointment-reviews")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.source, "mock");
  assert.equal(body.mode, "read_only");
  assert.equal(body.persistence, "not_persisted");
  assert.equal(body.persisted, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.appointmentCreated, false);
  assert.deepEqual(body.reviews, []);
  assert.equal(body.count, 0);
  assert.equal(body.safety.readOnly, true);
  assert.equal(body.safety.mode, "read_only");
  assert.equal(body.safety.bookingCreated, false);
  assert.equal(body.safety.calendarChecked, false);
  assert.equal(body.safety.requiresSecretaryConfirmation, true);
  assert.equal(body.safety.createsAppointment, false);
  assert.equal(body.safety.writesCalendar, false);
  assert.equal(body.safety.checksCalendarConflict, false);
  assert.equal(body.safety.usesDatabase, false);
  assert.equal(body.safety.approvalActionsEnabled, false);
  assert.equal(body.safety.bookingActionsEnabled, false);
  assert.equal(body.safety.calendarActionsEnabled, false);
});

test("secretary appointment review queue GET route does not claim booking or calendar checks", async () => {
  const response = await GET(
    new Request("http://localhost/api/secretary/appointment-reviews")
  );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.doesNotMatch(serialized, /"bookingCreated":true/);
  assert.doesNotMatch(serialized, /"calendarChecked":true/);
  assert.doesNotMatch(serialized, /randevunuz oluşturuldu|booked|confirmed/i);
});

test("secretary appointment review detail route returns safe not found without persistent queue", async () => {
  const response = await detailRoute.GET(
    new Request("http://localhost/api/secretary/appointment-reviews/review_demo"),
    {
      params: {
        id: "review_demo",
      },
    }
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.status, "error");
  assert.equal(body.source, "mock");
  assert.equal(body.mode, "read_only");
  assert.equal(body.persistence, "not_persisted");
  assert.equal(body.persisted, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.appointmentCreated, false);
  assert.equal(body.safety.readOnly, true);
  assert.equal(body.safety.bookingCreated, false);
  assert.equal(body.safety.calendarChecked, false);
  assert.equal(body.safety.usesDatabase, false);
  assert.equal(body.error.code, "review_not_found");
});

test("secretary appointment review detail route rejects malformed empty id safely", async () => {
  const response = await detailRoute.GET(
    new Request("http://localhost/api/secretary/appointment-reviews/%20"),
    {
      params: {
        id: "   ",
      },
    }
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "error");
  assert.equal(body.source, "mock");
  assert.equal(body.mode, "read_only");
  assert.equal(body.safety.readOnly, true);
  assert.equal(body.error.code, "missing_review_id");
});

test("secretary appointment review queue route rejects non-read methods", async () => {
  const requestUrl = "http://localhost/api/secretary/appointment-reviews";
  const responses = await Promise.all([
    POST(new Request(requestUrl, { method: "POST" })),
    PUT(new Request(requestUrl, { method: "PUT" })),
    PATCH(new Request(requestUrl, { method: "PATCH" })),
    DELETE(new Request(requestUrl, { method: "DELETE" })),
  ]);
  const bodies = await Promise.all(
    responses.map((response) => response.json())
  );

  assert.ok(responses.every((response) => response.status === 405));
  assert.ok(bodies.every((body) => body.status === "error"));
  assert.ok(bodies.every((body) => body.source === "mock"));
  assert.ok(bodies.every((body) => body.mode === "read_only"));
  assert.ok(bodies.every((body) => body.safety.readOnly === true));
  assert.ok(
    bodies.every((body) => body.error.code === "method_not_allowed")
  );
});

test("secretary appointment review detail route rejects non-read methods", async () => {
  const requestUrl = "http://localhost/api/secretary/appointment-reviews/review_demo";
  const context = {
    params: {
      id: "review_demo",
    },
  };
  const responses = await Promise.all([
    detailRoute.POST(new Request(requestUrl, { method: "POST" }), context),
    detailRoute.PUT(new Request(requestUrl, { method: "PUT" }), context),
    detailRoute.PATCH(new Request(requestUrl, { method: "PATCH" }), context),
    detailRoute.DELETE(new Request(requestUrl, { method: "DELETE" }), context),
  ]);
  const bodies = await Promise.all(
    responses.map((response) => response.json())
  );

  assert.ok(responses.every((response) => response.status === 405));
  assert.ok(bodies.every((body) => body.status === "error"));
  assert.ok(bodies.every((body) => body.source === "mock"));
  assert.ok(bodies.every((body) => body.mode === "read_only"));
  assert.ok(bodies.every((body) => body.safety.readOnly === true));
  assert.ok(
    bodies.every((body) => body.error.code === "method_not_allowed")
  );
});

test("secretary appointment review queue route has no appointment or calendar side effects", async () => {
  let appointmentCreationCalled = false;
  let calendarProviderCalled = false;

  const response = await GET(
    new Request("http://localhost/api/secretary/appointment-reviews")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.safety.createsAppointment, false);
  assert.equal(body.safety.writesCalendar, false);
  assert.equal(body.safety.usesDatabase, false);
  assert.equal(appointmentCreationCalled, false);
  assert.equal(calendarProviderCalled, false);
});
