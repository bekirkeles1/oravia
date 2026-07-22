const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/[id]/resolution-guidance-preview/route");
const {
  createMockAppointmentReviewControlledActionDependencies,
} = require("../src/secretary/appointmentReviewMockControlledActionDependencies");

const ROUTE_URL =
  "http://localhost/api/secretary/appointment-reviews/review_resolution/resolution-guidance-preview";

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

function createContext(id = "review_resolution") {
  return {
    params: {
      id,
    },
  };
}

function createInstrumentedAdapterFactory(contextsByRequest = []) {
  const calls = [];

  return {
    calls,
    createRouteRuntimeAdapter(options) {
      const call = {
        options,
        adapter: null,
        dependencyResolutionCount: 0,
        reviewContextResolutionCount: 0,
        actorInputs: [],
        idempotencyInputs: [],
        policyInputs: [],
      };
      const base = createMockAppointmentReviewControlledActionDependencies();
      const reviewContext = Object.hasOwn(contextsByRequest, calls.length)
        ? contextsByRequest[calls.length]
        : {};
      const dependencies = Object.freeze({
        resolveVerifiedActorContext(input) {
          call.actorInputs.push(input);
          return base.resolveVerifiedActorContext(input);
        },
        resolveAppointmentReviewContext(input) {
          call.reviewContextResolutionCount += 1;

          if (reviewContext === null) {
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
              reviewContext.currentState || "validation_only_intent_checked",
            observedReviewVersion: reviewContext.observedReviewVersion || 1,
          });
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
      const adapter = Object.freeze({
        getControlledActionDependencies() {
          call.dependencyResolutionCount += 1;

          if (reviewContext?.dependenciesThrow) {
            throw new Error("Synthetic dependency failure.");
          }

          return dependencies;
        },
      });

      call.adapter = adapter;
      calls.push(call);

      return adapter;
    },
  };
}

function assertSafety(body) {
  assert.equal(body.mock, true);
  assert.equal(body.dryRun, true);
  assert.equal(body.resolutionGuidancePreview, true);
  assert.equal(body.validationOnly, true);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.executionAvailable, false);
  assert.equal(body.actionPerformed, false);
  assert.equal(body.bookingCreated, false);
  assert.equal(body.calendarChecked, false);
  assert.equal(body.appointmentCreated, false);
  assert.equal(body.calendarEventCreated, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.persistence, "not_persisted");
  assert.equal(body.reviewMutated, false);
  assert.equal(body.repositoryVersionChanged, false);
  assert.equal(body.guidancePersisted, false);
  assert.equal(body.summaryPersisted, false);
  assert.equal(body.messageSent, false);
  assert.equal(body.taskAssigned, false);
}

test("resolution guidance route returns factual guidance through one adapter", async () => {
  const instrumentation = createInstrumentedAdapterFactory([
    {
      observedReviewVersion: 6,
    },
  ]);
  const response =
    await route.handleAppointmentReviewResolutionGuidancePreviewRouteRequest(
      createRequest(),
      createContext("review_resolution_route"),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.mode, "validation_only");
  assert.equal(body.preview, "resolution_guidance_preview");
  assert.equal(body.reviewId, "review_resolution_route");
  assert.equal(body.trustedCurrentState, "validation_only_intent_checked");
  assert.equal(body.observedReviewVersion, 6);
  assert.equal(body.readiness, "both_paths_available");
  assert.equal(body.approve.branchOutcome, "passed");
  assert.equal(body.reject.branchOutcome, "passed");
  assert.deepEqual(body.approve.checklist, []);
  assert.deepEqual(body.reject.checklist, []);
  assert.equal(typeof body.internalFollowUpSummary, "string");
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].dependencyResolutionCount, 1);
  assert.equal(instrumentation.calls[0].reviewContextResolutionCount, 1);
  assert.equal(instrumentation.calls[0].actorInputs.length, 4);
  assert.equal(instrumentation.calls[0].idempotencyInputs.length, 2);
  assert.equal(Object.isFrozen(instrumentation.calls[0].adapter), true);
  assert.equal(instrumentation.calls[0].options.initialReviews.length, 1);
  assert.equal(
    instrumentation.calls[0].options.initialReviews[0].id,
    "review_resolution_route"
  );
  assert.equal(
    instrumentation.calls[0].options.initialReviews[0].requiresSecretaryConfirmation,
    true
  );
  assert.equal(
    instrumentation.calls[0].options.initialReviews[0].bookingCreated,
    false
  );
  assert.equal(
    instrumentation.calls[0].options.initialReviews[0].calendarChecked,
    false
  );
  assertSafety(body);
});

test("resolution guidance route accepts empty body and rejects client-supplied trusted or guidance fields before adapter", async () => {
  const emptyResponse = await route.POST(
    createEmptyRequest(),
    createContext("review_resolution_empty")
  );
  const emptyBody = await emptyResponse.json();
  let adapterFactoryCalls = 0;
  const injectedResponse =
    await route.handleAppointmentReviewResolutionGuidancePreviewRouteRequest(
      createRequest({
        currentState: "needs_clinic_review",
        ["recommended" + "Action"]: "approve",
      }),
      createContext(),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          return Object.freeze({});
        },
      }
    );
  const injectedBody = await injectedResponse.json();

  assert.equal(emptyResponse.status, 200);
  assert.equal(emptyBody.accepted, true);
  assert.equal(injectedResponse.status, 400);
  assert.equal(injectedBody.accepted, false);
  assert.equal(injectedBody.code, "client_trusted_context_injection");
  assert.equal(adapterFactoryCalls, 0);
  assertSafety(emptyBody);
  assertSafety(injectedBody);
});

test("resolution guidance route rejects unsafe true and unsupported guidance fields before adapter", async () => {
  let adapterFactoryCalls = 0;
  const unsafeResponse =
    await route.handleAppointmentReviewResolutionGuidancePreviewRouteRequest(
      createRequest({ ["booking" + "Created"]: true }),
      createContext(),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          return Object.freeze({});
        },
      }
    );
  const guidanceResponse =
    await route.handleAppointmentReviewResolutionGuidancePreviewRouteRequest(
      createRequest({ guidance: { approve: {} } }),
      createContext(),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          return Object.freeze({});
        },
      }
    );
  const unsafeBody = await unsafeResponse.json();
  const guidanceBody = await guidanceResponse.json();

  assert.equal(unsafeResponse.status, 400);
  assert.equal(unsafeBody.code, "unsafe_resolution_guidance_field");
  assert.equal(guidanceResponse.status, 400);
  assert.equal(guidanceBody.code, "client_resolution_guidance_injection");
  assert.equal(adapterFactoryCalls, 0);
  assertSafety(unsafeBody);
  assertSafety(guidanceBody);
});

test("resolution guidance route rejects client checklist state before adapter", async () => {
  let adapterFactoryCalls = 0;
  const response =
    await route.handleAppointmentReviewResolutionGuidancePreviewRouteRequest(
      createRequest({
        ["checked" + "ItemCodes"]: [
          "approve:request_correction_required.verify_selected_review_id",
        ],
      }),
      createContext(),
      {
        createRouteRuntimeAdapter() {
          adapterFactoryCalls += 1;
          return Object.freeze({});
        },
      }
    );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.code, "client_trusted_context_injection");
  assert.equal(adapterFactoryCalls, 0);
  assertSafety(body);
});

test("resolution guidance route returns safe not found and internal errors without guidance payloads", async () => {
  const missing = createInstrumentedAdapterFactory([null]);
  const missingResponse =
    await route.handleAppointmentReviewResolutionGuidancePreviewRouteRequest(
      createRequest(),
      createContext("review_resolution_missing"),
      {
        createRouteRuntimeAdapter: missing.createRouteRuntimeAdapter,
      }
    );
  const missingBody = await missingResponse.json();
  const dependencyFailure = createInstrumentedAdapterFactory([
    {
      dependenciesThrow: true,
    },
  ]);
  const failureResponse =
    await route.handleAppointmentReviewResolutionGuidancePreviewRouteRequest(
      createRequest(),
      createContext("review_resolution_dependency_failure"),
      {
        createRouteRuntimeAdapter: dependencyFailure.createRouteRuntimeAdapter,
      }
    );
  const failureBody = await failureResponse.json();

  assert.equal(missingResponse.status, 404);
  assert.equal(missingBody.code, "review_not_found");
  assert.equal(missingBody.approve, null);
  assert.equal(missingBody.internalFollowUpSummary, null);
  assert.equal(failureResponse.status, 500);
  assert.equal(failureBody.code, "controlled_action_dependencies_failed");
  assert.equal(failureBody.reject, null);
  assertSafety(missingBody);
  assertSafety(failureBody);
});

test("resolution guidance route rejects unsupported methods before adapter creation", async () => {
  const getResponse = await route.GET(createRequest(), createContext());
  const putResponse = await route.PUT(createRequest(), createContext());
  const patchResponse = await route.PATCH(createRequest(), createContext());
  const deleteResponse = await route.DELETE(createRequest(), createContext());

  assert.equal(getResponse.status, 405);
  assert.equal(putResponse.status, 405);
  assert.equal(patchResponse.status, 405);
  assert.equal(deleteResponse.status, 405);
  assertSafety(await getResponse.json());
  assertSafety(await putResponse.json());
  assertSafety(await patchResponse.json());
  assertSafety(await deleteResponse.json());
});

test("resolution guidance route source has no direct booking, calendar, database, or network integration", () => {
  const source = fs.readFileSync(
    "app/api/secretary/appointment-reviews/[id]/resolution-guidance-preview/route.js",
    "utf8"
  );

  assert.match(source, /async function POST/);
  assert.match(source, /GET: rejectMethod/);
  assert.match(source, /PUT: rejectMethod/);
  assert.match(source, /PATCH: rejectMethod/);
  assert.match(source, /DELETE: rejectMethod/);
  assert.match(source, /body field/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, new RegExp(["process", "env"].join("[.]")));
  assert.doesNotMatch(source, new RegExp("create" + "Appointment"));
  assert.doesNotMatch(source, new RegExp("create" + "CalendarEvent"));
  assert.doesNotMatch(source, new RegExp("get" + "CalendarProvider"));
  assert.doesNotMatch(source, new RegExp("manual" + "AppointmentCalendarSync"));
  assert.doesNotMatch(
    source,
    new RegExp(["google" + "apis", "pris" + "ma", "supa" + "base", "red" + "is"].join("|"))
  );
  assert.doesNotMatch(source, /bookingCreated:\s+true/);
  assert.doesNotMatch(source, /calendarChecked:\s+true/);
  assert.doesNotMatch(source, /databasePersisted:\s+true/);
});
