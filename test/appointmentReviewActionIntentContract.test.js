const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  ALLOWED_ACTION_INTENTS,
  listAppointmentReviewActionIntents,
  validateAppointmentReviewActionIntent,
} = require("../src/secretary/appointmentReviewActionIntentContract");

function createValidPayload(overrides = {}) {
  return {
    reviewId: "review_mock_whatsapp_905322223333_slot_1030",
    actionIntent: "needs_clinic_review",
    actorRole: "secretary",
    reason: "Needs clinic-side confirmation before any real booking workflow.",
    metadata: {
      conversationKey: "whatsapp:+905322223333",
    },
    ...overrides,
  };
}

test("allowed appointment review action intents are accepted as validation-only", () => {
  const results = ALLOWED_ACTION_INTENTS.map((actionIntent) =>
    validateAppointmentReviewActionIntent(createValidPayload({ actionIntent }))
  );

  assert.deepEqual(listAppointmentReviewActionIntents(), [
    "approve_intent",
    "reject_intent",
    "needs_clinic_review",
    "ask_patient_clarification",
  ]);
  assert.ok(results.every((result) => result.status === "ok"));

  for (const result of results) {
    assert.equal(result.reviewId, createValidPayload().reviewId);
    assert.equal(result.validationOnly, true);
    assert.equal(result.actionPerformed, false);
    assert.equal(result.bookingCreated, false);
    assert.equal(result.calendarChecked, false);
    assert.equal(result.databasePersisted, false);
    assert.equal(result.appointmentCreated, false);
    assert.equal(result.calendarEventCreated, false);
    assert.equal(result.requiresSecretaryConfirmation, true);
    assert.deepEqual(result.allowedActionIntents, ALLOWED_ACTION_INTENTS);
  }
});

test("invalid and unsafe action intents are rejected safely", () => {
  const unsafeActionIntents = [
    "approve",
    "reject",
    "book",
    "booked",
    "create_appointment",
    "calendar_sync",
    "create_calendar_event",
  ];
  const unsafeResults = unsafeActionIntents.map((actionIntent) =>
    validateAppointmentReviewActionIntent(createValidPayload({ actionIntent }))
  );
  const unsupportedResult = validateAppointmentReviewActionIntent(
    createValidPayload({ actionIntent: "send_invoice" })
  );

  assert.ok(unsafeResults.every((result) => result.status === "error"));
  assert.ok(
    unsafeResults.every(
      (result) => result.error.code === "unsafe_action_intent"
    )
  );
  assert.equal(unsupportedResult.status, "error");
  assert.equal(unsupportedResult.error.code, "unsupported_action_intent");
  assert.equal(unsupportedResult.validationOnly, true);
  assert.equal(unsupportedResult.actionPerformed, false);
});

test("missing review id and missing action intent are rejected safely", () => {
  const missingReviewIdResults = [
    validateAppointmentReviewActionIntent(createValidPayload({ reviewId: "" })),
    validateAppointmentReviewActionIntent(
      createValidPayload({ reviewId: "   " })
    ),
  ];
  const missingActionIntentResult = validateAppointmentReviewActionIntent(
    createValidPayload({ actionIntent: "" })
  );

  assert.ok(
    missingReviewIdResults.every((result) => result.status === "error")
  );
  assert.ok(
    missingReviewIdResults.every(
      (result) => result.error.code === "missing_review_id"
    )
  );
  assert.equal(missingActionIntentResult.status, "error");
  assert.equal(missingActionIntentResult.error.code, "missing_action_intent");
});

test("unsafe booking calendar and database flags are rejected safely", () => {
  const unsafeFlagNames = [
    "bookingCreated",
    "calendarChecked",
    "databasePersisted",
    "appointmentCreated",
    "calendarEventCreated",
  ];
  const results = unsafeFlagNames.map((flagName) =>
    validateAppointmentReviewActionIntent(
      createValidPayload({
        [flagName]: true,
      })
    )
  );

  assert.ok(results.every((result) => result.status === "error"));
  assert.ok(
    results.every((result) => result.error.code === "unsafe_side_effect_flag")
  );

  for (const result of results) {
    assert.equal(result.validationOnly, true);
    assert.equal(result.actionPerformed, false);
    assert.equal(result.bookingCreated, false);
    assert.equal(result.calendarChecked, false);
    assert.equal(result.databasePersisted, false);
    assert.equal(result.appointmentCreated, false);
    assert.equal(result.calendarEventCreated, false);
  }
});

test("action intent validation does not call appointment creation or calendar provider", () => {
  let appointmentCreationCalled = false;
  let calendarProviderCalled = false;
  const result = validateAppointmentReviewActionIntent(
    createValidPayload({
      metadata: {
        createAppointment() {
          appointmentCreationCalled = true;
        },
        calendarProvider() {
          calendarProviderCalled = true;
        },
      },
    })
  );

  assert.equal(result.status, "ok");
  assert.equal(result.validationOnly, true);
  assert.equal(result.actionPerformed, false);
  assert.equal(result.bookingCreated, false);
  assert.equal(result.calendarChecked, false);
  assert.equal(appointmentCreationCalled, false);
  assert.equal(calendarProviderCalled, false);
});

test("action intent contract does not import execution layers", () => {
  const source = fs.readFileSync(
    "src/secretary/appointmentReviewActionIntentContract.js",
    "utf8"
  );

  assert.doesNotMatch(source, /appointmentCreation/);
  assert.doesNotMatch(source, /calendarProvider/);
  assert.doesNotMatch(source, /Google Calendar/);
  assert.doesNotMatch(source, /google/i);
  assert.doesNotMatch(source, /prisma|supabase|redis/i);
  assert.doesNotMatch(source, /route\.js|components\//);
});
