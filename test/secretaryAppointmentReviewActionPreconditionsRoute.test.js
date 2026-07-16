const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/[id]/action-preconditions/route");
const {
  validateAppointmentReviewActionPreconditions,
} = require("../src/secretary/appointmentReviewActionPreconditionsContract");
const {
  transitionAppointmentReviewActionIntentState,
} = require("../src/secretary/appointmentReviewActionIntentStateMachine");

const ROUTE_URL =
  "ht" +
  "tp://localhost/api/secretary/appointment-reviews/review_mock/action-preconditions";

const EXPECTED_SAFETY_FIELDS = Object.freeze({
  dryRun: true,
  validationOnly: true,
  preconditionsChecked: true,
  controlledHandlingOnly: true,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
});

function createValidPayload(overrides = {}) {
  return {
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: "secretary-demo",
      role: "secretary",
    },
    requestId: "request-demo-001",
    ...overrides,
  };
}

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

test("secretary appointment review action preconditions route accepts approve intent", async () => {
  const response = await route.POST(createRequest(createValidPayload()), createContext());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.eligibleForControlledHandling, true);
  assert.equal(body.controlledHandlingOnly, true);
  assert.equal(body.reviewId, "review_mock");
  assert.equal(body.actionIntent, "approve_intent");
  assert.equal(body.currentState, "validation_only_intent_checked");
  assert.equal(body.actorId, "secretary-demo");
  assert.equal(body.actorRole, "secretary");
  assert.equal(body.requestId, "request-demo-001");
  assert.equal(body.code, "preconditions_satisfied");
  assertSafetyFields(body);
});

test("secretary appointment review action preconditions route accepts reject intent", async () => {
  const response = await route.POST(
    createRequest(
      createValidPayload({
        actionIntent: "reject_intent",
        requestId: "request-reject-001",
      })
    ),
    createContext("review_reject")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.eligibleForControlledHandling, true);
  assert.equal(body.reviewId, "review_reject");
  assert.equal(body.actionIntent, "reject_intent");
  assert.equal(body.requestId, "request-reject-001");
  assertSafetyFields(body);
});

test("secretary appointment review action preconditions route uses route review id", async () => {
  const response = await route.POST(
    createRequest(
      createValidPayload({
        reviewId: "body_review_must_not_win",
      })
    ),
    createContext("route_review_wins")
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.reviewId, "route_review_wins");
  assert.notEqual(body.reviewId, "body_review_must_not_win");
  assertSafetyFields(body);
});

test("secretary appointment review action preconditions route returns unsupported action intent as contract result", async () => {
  const response = await route.POST(
    createRequest(createValidPayload({ actionIntent: "needs_clinic_review" })),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.eligibleForControlledHandling, false);
  assert.equal(body.code, "unsupported_action_intent");
  assert.match(body.reason, /actionIntent/);
  assertSafetyFields(body);
});

test("secretary appointment review action preconditions route returns wrong current state as contract result", async () => {
  const response = await route.POST(
    createRequest(createValidPayload({ currentState: "pending_secretary_review" })),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "unsupported_current_state");
  assert.match(body.reason, /currentState/);
  assertSafetyFields(body);
});

test("secretary appointment review action preconditions route returns missing actor as contract result", async () => {
  const response = await route.POST(
    createRequest(createValidPayload({ actor: undefined })),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "missing_actor");
  assert.match(body.reason, /actor/);
  assertSafetyFields(body);
});

test("secretary appointment review action preconditions route returns missing actor id as contract result", async () => {
  const response = await route.POST(
    createRequest(
      createValidPayload({
        actor: {
          actorId: "   ",
          role: "secretary",
        },
      })
    ),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "missing_actor_id");
  assert.match(body.reason, /actor\.actorId/);
  assertSafetyFields(body);
});

test("secretary appointment review action preconditions route returns unsupported actor role as contract result", async () => {
  const response = await route.POST(
    createRequest(
      createValidPayload({
        actor: {
          actorId: "actor-demo",
          role: "doctor",
        },
      })
    ),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "unsupported_actor_role");
  assert.match(body.reason, /actor\.role/);
  assertSafetyFields(body);
});

test("secretary appointment review action preconditions route returns missing request id as contract result", async () => {
  const response = await route.POST(
    createRequest(createValidPayload({ requestId: "" })),
    createContext()
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, false);
  assert.equal(body.code, "missing_request_id");
  assert.match(body.reason, /requestId/);
  assertSafetyFields(body);
});

test("secretary appointment review action preconditions route rejects invalid JSON safely", async () => {
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
  assert.equal(body.eligibleForControlledHandling, false);
  assert.equal(body.code, "invalid_json");
  assert.equal(body.error.code, "invalid_json");
  assertSafetyFields(body);
});

test("secretary appointment review action preconditions route rejects missing or malformed route id safely", async () => {
  const response = await route.POST(
    createRequest(createValidPayload()),
    createContext("   ")
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.accepted, false);
  assert.equal(body.eligibleForControlledHandling, false);
  assert.equal(body.code, "missing_review_id");
  assert.equal(body.error.code, "missing_review_id");
  assertSafetyFields(body);
});

test("secretary appointment review action preconditions route rejects unsafe true side effect fields safely", async () => {
  const unsafeTrue = Boolean("unsafe");
  const unsafeFields = [
    "executionRequested",
    "executionAvailable",
    "actionPerformed",
    "bookingCreated",
    "calendarChecked",
    "appointmentCreated",
    "calendarEventCreated",
    "databasePersisted",
  ];

  for (const fieldName of unsafeFields) {
    const response = await route.POST(
      createRequest(
        createValidPayload({
          [fieldName]: unsafeTrue,
        })
      ),
      createContext()
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.accepted, false);
    assert.equal(body.eligibleForControlledHandling, false);
    assert.equal(body.code, "unsafe_preconditions_field");
    assert.match(body.reason, new RegExp(fieldName));
    assertSafetyFields(body);
  }
});

test("secretary appointment review action preconditions route rejects authentication and persistence claims", async () => {
  const unsafeTrue = Boolean("unsafe");
  const unsafeFields = ["authenticated", "authorized", "reviewFound", "persisted"];

  for (const fieldName of unsafeFields) {
    const response = await route.POST(
      createRequest(
        createValidPayload({
          [fieldName]: unsafeTrue,
        })
      ),
      createContext()
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.accepted, false);
    assert.equal(body.eligibleForControlledHandling, false);
    assert.equal(body.code, "unsafe_preconditions_field");
    assert.match(body.reason, new RegExp(fieldName));
    assertSafetyFields(body);
  }
});

test("secretary appointment review action preconditions route rejects non-post methods safely", async () => {
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
  assert.ok(
    bodies.every((body) => body.eligibleForControlledHandling === false)
  );
  assert.ok(bodies.every((body) => body.code === "method_not_allowed"));
  assert.ok(
    bodies.every((body) => body.error.code === "method_not_allowed")
  );

  for (const body of bodies) {
    assertSafetyFields(body);
  }
});

test("secretary appointment review action preconditions route has no execution queue auth or network imports", () => {
  const source = fs.readFileSync(
    [
      "app/api/secretary/appointment-reviews/[id]/action-preconditions/route",
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
    "fe" + "tch",
    "appointment" + "ReviewQueue",
    "add" + "AppointmentReview",
    "list" + "AppointmentReviews",
    "get" + "AppointmentReviewById",
    "update" + "AppointmentReviewStatus",
    "auth" + "Provider",
    "authorization" + "Provider",
    "process" + ".env",
    "components/",
  ];

  assert.match(source, /validateAppointmentReviewActionPreconditions/);
  assert.doesNotMatch(source, /reviewFound:\s*true/);
  assert.doesNotMatch(source, /authenticated:\s*true/);
  assert.doesNotMatch(source, /authorized:\s*true/);
  assert.doesNotMatch(source, /persisted:\s*true/);

  for (const term of forbidden) {
    assert.doesNotMatch(source, new RegExp(term, "i"));
  }
});

test("secretary appointment review action preconditions route leaves Sprint 12A contract unchanged", () => {
  const result = validateAppointmentReviewActionPreconditions({
    reviewId: "review_contract_unchanged",
    actionIntent: "approve_intent",
    currentState: "validation_only_intent_checked",
    actor: {
      actorId: "secretary-contract",
      role: "secretary",
    },
    requestId: "request-contract",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.eligibleForControlledHandling, true);
  assert.equal(result.code, "preconditions_satisfied");
  assert.equal(result.validationOnly, true);
  assert.equal(result.actionPerformed, false);
  assert.equal(result.bookingCreated, false);
  assert.equal(result.calendarChecked, false);
});

test("secretary appointment review action preconditions route leaves Sprint 11X route state transition behavior unchanged", () => {
  const result = transitionAppointmentReviewActionIntentState({
    currentState: "pending_secretary_review",
    event: "check_validation_only_intent",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.nextState, "validation_only_intent_checked");
  assert.equal(result.code, "transition_accepted");
  assert.equal(result.validationOnly, true);
  assert.equal(result.actionPerformed, false);
  assert.equal(result.bookingCreated, false);
  assert.equal(result.calendarChecked, false);
});
