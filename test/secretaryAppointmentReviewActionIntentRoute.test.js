const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/[id]/action-intent/route");

const ROUTE_URL =
  "http://localhost/api/secretary/appointment-reviews/review_mock/action-intent";

function createRequest(payload) {
  return new Request(ROUTE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function createContext(id = "review_mock") {
  return {
    params: {
      id,
    },
  };
}

test("secretary appointment review action intent route validates approve intent only", async () => {
  const response = await route.POST(
    createRequest({
      actionIntent: "approve_intent",
      actorRole: "secretary",
      reason: "Future approval intent only.",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.reviewId, "review_mock");
  assert.equal(body.actionIntent, "approve_intent");
  assert.equal(body.validationOnly, true);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.bookingCreated, false);
  assert.equal(body.calendarChecked, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.appointmentCreated, false);
  assert.equal(body.calendarEventCreated, false);
  assert.equal(body.requiresSecretaryConfirmation, true);
});

test("secretary appointment review action intent route validates reject intent only", async () => {
  const response = await route.POST(
    createRequest({
      actionIntent: "reject_intent",
      actorRole: "secretary",
      note: "Future rejection intent only.",
    }),
    createContext("review_reject_demo")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.reviewId, "review_reject_demo");
  assert.equal(body.actionIntent, "reject_intent");
  assert.equal(body.validationOnly, true);
  assert.equal(body.actionPerformed, false);
});

test("secretary appointment review action intent route rejects unsafe intents safely", async () => {
  const response = await route.POST(
    createRequest({
      actionIntent: "book",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "unsafe_action_intent");
  assert.equal(body.validationOnly, true);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.bookingCreated, false);
  assert.equal(body.calendarChecked, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.appointmentCreated, false);
  assert.equal(body.calendarEventCreated, false);
});

test("secretary appointment review action intent route rejects missing id and action intent safely", async () => {
  const missingIdResponse = await route.POST(
    createRequest({
      actionIntent: "needs_clinic_review",
    }),
    createContext("   ")
  );
  const missingIntentResponse = await route.POST(
    createRequest({}),
    createContext("review_missing_intent")
  );
  const missingIdBody = await missingIdResponse.json();
  const missingIntentBody = await missingIntentResponse.json();

  assert.equal(missingIdResponse.status, 400);
  assert.equal(missingIdBody.status, "error");
  assert.equal(missingIdBody.error.code, "missing_review_id");
  assert.equal(missingIdBody.validationOnly, true);
  assert.equal(missingIntentResponse.status, 400);
  assert.equal(missingIntentBody.status, "error");
  assert.equal(missingIntentBody.error.code, "missing_action_intent");
  assert.equal(missingIntentBody.validationOnly, true);
});

test("secretary appointment review action intent route rejects invalid JSON safely", async () => {
  const response = await route.POST(
    new Request(ROUTE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "invalid_json");
  assert.equal(body.validationOnly, true);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.bookingCreated, false);
  assert.equal(body.calendarChecked, false);
});

test("secretary appointment review action intent route rejects unsafe side effect flags", async () => {
  const response = await route.POST(
    createRequest({
      actionIntent: "ask_patient_clarification",
      bookingCreated: true,
      calendarChecked: true,
      databasePersisted: true,
      appointmentCreated: true,
      calendarEventCreated: true,
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "unsafe_side_effect_flag");
  assert.equal(body.validationOnly, true);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.bookingCreated, false);
  assert.equal(body.calendarChecked, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.appointmentCreated, false);
  assert.equal(body.calendarEventCreated, false);
});

test("secretary appointment review action intent route rejects non-post methods safely", async () => {
  const responses = await Promise.all([
    route.GET(new Request(ROUTE_URL, { method: "GET" }), createContext()),
    route.PUT(new Request(ROUTE_URL, { method: "PUT" }), createContext()),
    route.PATCH(new Request(ROUTE_URL, { method: "PATCH" }), createContext()),
    route.DELETE(new Request(ROUTE_URL, { method: "DELETE" }), createContext()),
  ]);
  const bodies = await Promise.all(
    responses.map((response) => response.json())
  );

  assert.ok(responses.every((response) => response.status === 405));
  assert.ok(bodies.every((body) => body.status === "error"));
  assert.ok(bodies.every((body) => body.error.code === "method_not_allowed"));
  assert.ok(bodies.every((body) => body.validationOnly === true));
  assert.ok(bodies.every((body) => body.actionPerformed === false));
  assert.ok(bodies.every((body) => body.bookingCreated === false));
  assert.ok(bodies.every((body) => body.calendarChecked === false));
  assert.ok(bodies.every((body) => body.databasePersisted === false));
  assert.ok(bodies.every((body) => body.appointmentCreated === false));
  assert.ok(bodies.every((body) => body.calendarEventCreated === false));
});

test("secretary appointment review action intent route has no execution imports", () => {
  const source = fs.readFileSync(
    "app/api/secretary/appointment-reviews/[id]/action-intent/route.js",
    "utf8"
  );

  assert.match(source, /validateAppointmentReviewActionIntent/);
  assert.doesNotMatch(source, /appointmentCreation/);
  assert.doesNotMatch(source, /calendarProvider/);
  assert.doesNotMatch(source, /Google Calendar/);
  assert.doesNotMatch(source, /prisma|supabase|redis/i);
  assert.doesNotMatch(source, /require\(.+db|require\(.+database/i);
});
