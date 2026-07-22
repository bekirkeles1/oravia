const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/shift-handoff-preview/route");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

const ROUTE_URL =
  "http://localhost/api/secretary/appointment-reviews/shift-handoff-preview";

function createRequest(payload = {}) {
  return new Request(ROUTE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function createEmptyRequest() {
  return new Request(ROUTE_URL, {
    method: "POST",
  });
}

function createReview(id, controlledActionState = "validation_only_intent_checked") {
  return Object.freeze({
    id,
    patientName: "SYNTHETIC_SENSITIVE_NAME_PLACEHOLDER",
    patientPhone: "SYNTHETIC_PHONE_PLACEHOLDER",
    patientEmail: "SYNTHETIC_EMAIL_PLACEHOLDER",
    rawMessage: "Synthetic raw message",
    status: "pending_secretary_review",
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
    metadata: Object.freeze({
      controlledActionState,
    }),
  });
}

function createInstrumentedAdapterFactory(requestReviews = []) {
  const calls = [];

  return {
    calls,
    createRouteRuntimeAdapter(options) {
      const call = {
        options,
        listCount: 0,
        dependencyResolutionCount: 0,
        reviewContextResolutionCount: 0,
        actorInputs: [],
        idempotencyInputs: [],
        policyInputs: [],
      };
      const base = createMockAppointmentReviewControlledActionDependencies();
      const reviews = Object.hasOwn(requestReviews, calls.length)
        ? requestReviews[calls.length]
        : [];
      const dependencies = Object.freeze({
        resolveAppointmentReviewContext(input) {
          call.reviewContextResolutionCount += 1;

          const review = reviews.find((item) => item.id === input.reviewId);

          if (!review) {
            throw Object.freeze({
              code: "appointment_review_snapshot_not_found",
              reason: "Synthetic not found.",
            });
          }

          return Object.freeze({
            contextType: "appointment_review_snapshot_context_v1",
            contextSource: "server_review_boundary",
            reviewId: input.reviewId,
            currentState:
              review.metadata?.controlledActionState ||
              "validation_only_intent_checked",
            observedReviewVersion:
              review.metadata?.observedReviewVersion || call.listCount,
          });
        },
        resolveVerifiedActorContext(input) {
          call.actorInputs.push(input);
          return base.resolveVerifiedActorContext(input);
        },
        resolveIdempotencyContext(input) {
          call.idempotencyInputs.push(input);
          return base.resolveIdempotencyContext(input);
        },
        resolveExecutionPolicyContext(input) {
          call.policyInputs.push(input);
          return base.resolveExecutionPolicyContext(input);
        },
      });

      calls.push(call);

      return Object.freeze({
        listAppointmentReviews() {
          call.listCount += 1;
          return reviews;
        },
        getControlledActionDependencies() {
          call.dependencyResolutionCount += 1;
          return dependencies;
        },
      });
    },
  };
}

function assertSafety(body) {
  assert.equal(body.mock, true);
  assert.equal(body.dryRun, true);
  assert.equal(body.shiftHandoffPreview, true);
  assert.equal(body.validationOnly, true);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.executionAvailable, false);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.bookingCreated, false);
  assert.equal(body.calendarChecked, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.persistence, "not_persisted");
  assert.equal(body.reviewMutated, false);
  assert.equal(body.reviewStateChanged, false);
  assert.equal(body.repositoryVersionChanged, false);
  assert.equal(body.queueMutated, false);
  assert.equal(body.queueCountChanged, false);
  assert.equal(body.handoffPersisted, false);
  assert.equal(body.handoffSent, false);
}

test("shift handoff route uses exactly one adapter and trusted queue membership", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [
      createReview("review_route_handoff_a"),
      createReview("review_route_handoff_b", "pending_secretary_review"),
    ],
  ]);
  const response =
    await route.handleAppointmentReviewShiftHandoffPreviewRouteRequest(
      createRequest(),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.preview, "secretary_shift_handoff_preview");
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].listCount, 1);
  assert.equal(instrumentation.calls[0].dependencyResolutionCount, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 2);
  assert.deepEqual(
    body.items.map((item) => item.reviewId),
    ["review_route_handoff_a", "review_route_handoff_b"]
  );
  assert.equal(body.items[1].readiness, "both_paths_blocked");
  assert.match(body.plainTextBrief, /INTERNAL APPOINTMENT REVIEW SHIFT HANDOFF/);
  assert.match(body.plainTextBrief, /This brief was not sent or saved/);
  assertSafety(body);
});

test("shift handoff route accepts empty body and rejects client supplied results", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [createReview("review_empty_handoff")],
  ]);
  const emptyBody =
    await route.handleAppointmentReviewShiftHandoffPreviewRouteRequest(
      createEmptyRequest(),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const injected =
    await route.handleAppointmentReviewShiftHandoffPreviewRouteRequest(
      createRequest({
        reviewIds: ["client_added_review"],
        items: [],
        plainTextBrief: "client text",
      }),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const emptyPayload = await emptyBody.json();
  const injectedPayload = await injected.json();

  assert.equal(emptyBody.status, 200);
  assert.deepEqual(
    emptyPayload.items.map((item) => item.reviewId),
    ["review_empty_handoff"]
  );
  assert.equal(injected.status, 400);
  assert.equal(injectedPayload.code, "client_shift_handoff_injection");
  assert.equal(instrumentation.calls.length, 1);
  assertSafety(emptyPayload);
  assertSafety(injectedPayload);
});

test("shift handoff route returns safe empty queue success", async () => {
  const instrumentation = createInstrumentedAdapterFactory([[]]);
  const response =
    await route.handleAppointmentReviewShiftHandoffPreviewRouteRequest(
      createRequest(),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.deepEqual(body.items, []);
  assert.equal(body.summary.totalReviews, 0);
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].listCount, 1);
  assert.equal(instrumentation.calls[0].dependencyResolutionCount, 0);
  assertSafety(body);
});

test("shift handoff route contains failures and unsupported methods safely", async () => {
  let adapterFactoryCalls = 0;
  const adapterFailure =
    await route.handleAppointmentReviewShiftHandoffPreviewRouteRequest(
      createRequest(),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          throw new Error("RAW_ADAPTER_MARKER");
        },
      }
    );
  const rejectedMethod = await route.GET(new Request(ROUTE_URL));
  const adapterBody = await adapterFailure.json();
  const methodBody = await rejectedMethod.json();

  assert.equal(adapterFailure.status, 500);
  assert.equal(adapterBody.code, "internal_error");
  assert.equal(adapterBody.items, null);
  assert.equal(adapterBody.plainTextBrief, null);
  assert.doesNotMatch(JSON.stringify(adapterBody), /RAW_|stack/);
  assert.equal(adapterFactoryCalls, 1);
  assert.equal(rejectedMethod.status, 405);
  assert.equal(methodBody.code, "method_not_allowed");
  assertSafety(adapterBody);
  assertSafety(methodBody);
});

test("shift handoff route response excludes sensitive queue fields", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    [createReview("review_route_safe_projection")],
  ]);
  const response =
    await route.handleAppointmentReviewShiftHandoffPreviewRouteRequest(
      createRequest(),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.doesNotMatch(serialized, /SYNTHETIC_SENSITIVE_NAME_PLACEHOLDER/);
  assert.doesNotMatch(serialized, /SYNTHETIC_PHONE_PLACEHOLDER/);
  assert.doesNotMatch(serialized, /SYNTHETIC_EMAIL_PLACEHOLDER/);
  assert.doesNotMatch(serialized, /Synthetic raw message/);
  assert.doesNotMatch(serialized, /patientName|patientPhone|patientEmail|rawMessage/);
});

test("shift handoff route avoids route-to-route and persistence integrations", () => {
  const source = fs.readFileSync(
    "app/api/secretary/appointment-reviews/shift-handoff-preview/route.js",
    "utf8"
  );

  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /require\([^)]*route["']\)/);
  assert.doesNotMatch(source, /new AppointmentReview|createAppointmentReviewRepository|createAppointmentReviewQueue/);
  assert.doesNotMatch(source, /createAppointment|createCalendarEvent|getCalendarProvider|googleapis|prisma|supabase|redis/);
  assert.doesNotMatch(source, /recommendedAction|preferredAction|bestAction|assignedTo/);
});
