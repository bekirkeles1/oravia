const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/[id]/state-transition/route");

const ROUTE_URL =
  "ht" +
  "tp://localhost/api/secretary/appointment-reviews/review_mock/state-transition";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
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
  requiresSecretaryConfirmation: true,
});

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

function assertSafetyFields(body) {
  for (const [field, value] of Object.entries(EXPECTED_SAFETY_FIELDS)) {
    assert.equal(body[field], value);
  }
}

test("secretary appointment review state transition route accepts pending secretary review validation check", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "pending_secretary_review",
      event: "check_validation_only_intent",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reviewId, "review_mock");
  assert.equal(body.accepted, true);
  assert.equal(body.currentState, "pending_secretary_review");
  assert.equal(body.event, "check_validation_only_intent");
  assert.equal(body.nextState, "validation_only_intent_checked");
  assert.equal(body.code, "transition_accepted");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route accepts clinic review requirement", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "validation_only_intent_checked",
      event: "require_clinic_review",
    }),
    createContext("review_needs_clinic")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reviewId, "review_needs_clinic");
  assert.equal(body.accepted, true);
  assert.equal(body.nextState, "needs_clinic_review");
  assert.equal(body.code, "transition_accepted");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route accepts action intent rejection", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "validation_only_intent_checked",
      event: "reject_action_intent",
    }),
    createContext("review_reject_intent")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reviewId, "review_reject_intent");
  assert.equal(body.accepted, true);
  assert.equal(body.nextState, "action_intent_rejected");
  assert.equal(body.code, "transition_accepted");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route returns invalid transition as dry-run result", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "pending_secretary_review",
      event: "require_clinic_review",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.currentState, "pending_secretary_review");
  assert.equal(body.nextState, "pending_secretary_review");
  assert.equal(body.code, "invalid_transition");
  assert.match(body.reason, /not allowed/);
  assertSafetyFields(body);
});

test("secretary appointment review state transition route returns terminal state transition as dry-run result", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "needs_clinic_review",
      event: "reject_action_intent",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.currentState, "needs_clinic_review");
  assert.equal(body.nextState, "needs_clinic_review");
  assert.equal(body.code, "terminal_state_transition_rejected");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route returns unknown state as dry-run result", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "waiting_for_manager",
      event: "check_validation_only_intent",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.currentState, "waiting_for_manager");
  assert.equal(body.nextState, null);
  assert.equal(body.code, "unknown_state");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route returns unknown event as dry-run result", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "pending_secretary_review",
      event: "start_booking",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.currentState, "pending_secretary_review");
  assert.equal(body.nextState, "pending_secretary_review");
  assert.equal(body.code, "unknown_event");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route rejects missing current state safely", async () => {
  const response = await route.POST(
    createRequest({
      event: "check_validation_only_intent",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "missing_current_state");
  assert.equal(body.error.code, "missing_current_state");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route rejects missing event safely", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "pending_secretary_review",
    }),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "missing_event");
  assert.equal(body.error.code, "missing_event");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route rejects invalid JSON safely", async () => {
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
  assert.equal(body.accepted, false);
  assert.equal(body.code, "invalid_json");
  assert.equal(body.error.code, "invalid_json");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route rejects missing or malformed review id safely", async () => {
  const response = await route.POST(
    createRequest({
      currentState: "pending_secretary_review",
      event: "check_validation_only_intent",
    }),
    createContext("   ")
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "missing_review_id");
  assert.equal(body.error.code, "missing_review_id");
  assertSafetyFields(body);
});

test("secretary appointment review state transition route rejects unsafe true side effect flags", async () => {
  const unsafeTrue = Boolean("unsafe");
  const unsafeFields = [
    "executionRequested",
    "actionPerformed",
    "bookingCreated",
    "calendarChecked",
    "appointmentCreated",
    "calendarEventCreated",
    "databasePersisted",
  ];

  for (const fieldName of unsafeFields) {
    const response = await route.POST(
      createRequest({
        currentState: "pending_secretary_review",
        event: "check_validation_only_intent",
        [fieldName]: unsafeTrue,
      }),
      createContext()
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.accepted, false);
    assert.equal(body.code, "unsafe_side_effect_field");
    assert.match(body.reason, new RegExp(fieldName));
    assertSafetyFields(body);
  }
});

test("secretary appointment review state transition route rejects non-post methods safely", async () => {
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
  assert.ok(bodies.every((body) => body.accepted === false));
  assert.ok(bodies.every((body) => body.code === "method_not_allowed"));
  assert.ok(
    bodies.every((body) => body.error.code === "method_not_allowed")
  );
  assert.ok(bodies.every((body) => body.dryRun === true));
  assert.ok(bodies.every((body) => body.validationOnly === true));
  assert.ok(bodies.every((body) => body.actionPerformed === false));
  assert.ok(bodies.every((body) => body.bookingCreated === false));
  assert.ok(bodies.every((body) => body.calendarChecked === false));
  assert.ok(bodies.every((body) => body.databasePersisted === false));
});

test("secretary appointment review state transition route has no execution imports or stateful store access", () => {
  const source = fs.readFileSync(
    [
      "app/api/secretary/appointment-reviews/[id]/state-transition/route",
      "js",
    ].join("."),
    "utf8"
  );
  const forbidden = [
    "create" + "Appointment",
    "create" + "CalendarEvent",
    "get" + "CalendarProvider",
    "manual" + "AppointmentCalendarSync",
    "google" + "apis",
    "pri" + "sma",
    "supa" + "base",
    "re" + "dis",
    "appointment" + "ReviewQueue",
    "list" + "AppointmentReviews",
    "get" + "AppointmentReviewById",
    "update" + "AppointmentReviewStatus",
    "process" + ".env",
    "fe" + "tch",
  ];

  assert.match(source, /transitionAppointmentReviewActionIntentState/);

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
});
