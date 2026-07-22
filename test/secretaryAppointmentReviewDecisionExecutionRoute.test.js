const assert = require("node:assert/strict");
const test = require("node:test");

const route = require("../app/api/secretary/appointment-reviews/[id]/decision-execution/route");

const ROUTE_URL =
  "http://localhost/api/secretary/appointment-reviews/review_execution/decision-execution";

function createRequest(payload, method = "POST") {
  return new Request(ROUTE_URL, {
    method,
    headers: {
      "content-type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(payload) : undefined,
  });
}

function createContext(id = "review_execution") {
  return {
    params: {
      id,
    },
  };
}

function createAdapterFactory(result) {
  const calls = [];

  return {
    calls,
    createRouteRuntimeAdapter(options) {
      const call = {
        options,
        applicationCalls: [],
      };
      const adapter = Object.freeze({
        applyAppointmentReviewDecision(input) {
          call.applicationCalls.push(input);
          return result || {
            accepted: true,
            applied: true,
            matchingReplay: false,
            code: "appointment_review_decision_execution_applied",
            reviewId: input.reviewId,
            action: input.action,
            previousState: "validation_only_intent_checked",
            resultingState: "needs_clinic_review",
            previousReviewVersion: 1,
            resultingReviewVersion: 2,
            resultingRepositoryVersion: 2,
            reviewStateChanged: true,
            repositoryVersionChanged: true,
            receipt: {
              receiptKind: "appointment_review_decision_execution_receipt_v1",
              durablePersistence: false,
              receiptPersisted: false,
              bookingCreated: false,
              calendarWritten: false,
              messageSent: false,
            },
          };
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
  assert.equal(body.dryRun, false);
  assert.equal(body.decisionExecution, true);
  assert.equal(body.validationOnly, false);
  assert.equal(body.controlledHandlingOnly, true);
  assert.equal(body.executionMode, "in_memory_demo");
  assert.equal(body.durablePersistence, false);
  assert.equal(body.receiptPersisted, false);
  assert.equal(body.bookingCreated, false);
  assert.equal(body.calendarChecked, false);
  assert.equal(body.calendarWritten, false);
  assert.equal(body.messageSent, false);
  assert.equal(body.databasePersisted, false);
  assert.equal(body.externalCallPerformed, false);
}

test("decision execution route accepts safe payload through exactly one adapter", async () => {
  const instrumentation = createAdapterFactory();
  const response =
    await route.handleAppointmentReviewDecisionExecutionRouteRequest(
      createRequest({
        action: "approve",
        expectedReviewVersion: 1,
        idempotencyKey: "decision_execution:review_execution:approve:1",
        confirmation: "apply_in_memory",
      }),
      createContext(),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.reviewStateChanged, true);
  assert.equal(instrumentation.calls.length, 1);
  assert.equal(instrumentation.calls[0].applicationCalls.length, 1);
  assert.deepEqual(instrumentation.calls[0].applicationCalls[0], {
    reviewId: "review_execution",
    action: "approve",
    expectedReviewVersion: 1,
    idempotencyKey: "decision_execution:review_execution:approve:1",
    confirmation: "apply_in_memory",
  });
  assert.equal(Object.hasOwn(instrumentation.calls[0].options, "repository"), false);
  assertSafety(body);
});

test("decision execution route rejects invalid payloads before adapter creation", async () => {
  const invalidPayloads = [
    { action: "book", expectedReviewVersion: 1, idempotencyKey: "k", confirmation: "apply_in_memory" },
    { action: "approve", expectedReviewVersion: 0, idempotencyKey: "k", confirmation: "apply_in_memory" },
    { action: "approve", expectedReviewVersion: 1, idempotencyKey: "bad key", confirmation: "apply_in_memory" },
    { action: "approve", expectedReviewVersion: 1, idempotencyKey: "k", confirmation: "missing" },
    { action: "approve", expectedReviewVersion: 1, idempotencyKey: "k", confirmation: "apply_in_memory", nextState: "needs_clinic_review" },
  ];
  let adapterCalls = 0;

  for (const payload of invalidPayloads) {
    const response =
      await route.handleAppointmentReviewDecisionExecutionRouteRequest(
        createRequest(payload),
        createContext(),
        {
          createRouteRuntimeAdapter() {
            adapterCalls += 1;
            return Object.freeze({});
          },
        }
      );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.accepted, false);
    assertSafety(body);
  }

  assert.equal(adapterCalls, 0);
});

test("decision execution route maps conflicts and unsupported methods safely", async () => {
  const instrumentation = createAdapterFactory({
    accepted: false,
    applied: false,
    conflict: true,
    code: "review_version_conflict",
    reason: "Synthetic conflict.",
    reviewStateChanged: false,
    repositoryVersionChanged: false,
  });
  const conflict =
    await route.handleAppointmentReviewDecisionExecutionRouteRequest(
      createRequest({
        action: "approve",
        expectedReviewVersion: 1,
        idempotencyKey: "decision_execution:review_execution:approve:1",
        confirmation: "apply_in_memory",
      }),
      createContext(),
      {
        createRouteRuntimeAdapter: instrumentation.createRouteRuntimeAdapter,
      }
    );
  const conflictBody = await conflict.json();
  let adapterCalls = 0;
  const methodResponses = await Promise.all([
    route.GET(new Request(ROUTE_URL, { method: "GET" }), createContext(), {
      createRouteRuntimeAdapter() {
        adapterCalls += 1;
      },
    }),
    route.PUT(new Request(ROUTE_URL, { method: "PUT" }), createContext()),
    route.PATCH(new Request(ROUTE_URL, { method: "PATCH" }), createContext()),
    route.DELETE(new Request(ROUTE_URL, { method: "DELETE" }), createContext()),
  ]);
  const methodBodies = await Promise.all(
    methodResponses.map((response) => response.json())
  );

  assert.equal(conflict.status, 409);
  assert.equal(conflictBody.accepted, false);
  assert.equal(conflictBody.reviewStateChanged, false);
  assertSafety(conflictBody);
  assert.ok(methodResponses.every((response) => response.status === 405));
  assert.ok(methodBodies.every((body) => body.code === "method_not_allowed"));
  assert.equal(adapterCalls, 0);
  methodBodies.forEach(assertSafety);
});
