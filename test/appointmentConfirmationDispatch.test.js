const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  dispatchAppointmentConfirmation,
} = require("../src/api/secretaryAppointmentConfirmationDispatchService");
const {
  buildAppointmentConfirmationMessage,
} = require("../src/secretary/appointmentConfirmationMessageBuilder");
const {
  constructAppointmentConfirmationDispatchReceipt,
} = require("../src/secretary/appointmentConfirmationDispatchReceipt");
const {
  createInMemoryAppointmentReviewAppointmentRepository,
} = require("../src/secretary/appointmentReviewAppointmentRepository");
const {
  createInMemoryAppointmentReviewExecutionIdempotencyStore,
} = require("../src/secretary/appointmentReviewExecutionIdempotencyStore");
const {
  createMockOutboundAppointmentConfirmationProvider,
} = require("../src/messaging/mockOutboundAppointmentConfirmationProvider");
const {
  createInMemoryMockAppointmentReviewServerRuntime,
} = require("../src/secretary/appointmentReviewInMemoryMockServerRuntime");
const {
  createAppointmentReviewRouteRuntimeAdapter,
} = require("../src/secretary/appointmentReviewRouteRuntimeAdapter");
const {
  createAppointmentReviewActiveRouteRuntimeCompositionRoot,
} = require("../src/secretary/appointmentReviewRouteRuntimeCompositionRoot");
const approveRoute = require("../app/api/secretary/appointment-reviews/[id]/decision-execution/route");
const createRoute = require("../app/api/secretary/appointment-reviews/[id]/appointment-creation/route");
const appointmentsRoute = require("../app/api/secretary/appointments/route");
const confirmationRoute = require("../app/api/secretary/appointments/[appointmentId]/confirmation-message/route");

function createAppointment(
  repository = createInMemoryAppointmentReviewAppointmentRepository(),
  overrides = {}
) {
  const result = repository.createAppointment({
    sourceReviewId: overrides.sourceReviewId || "review_confirmation_dispatch",
    selectedSlotId: "slot_confirmation_dispatch",
    doctorId: "dr-ayse-demir",
    doctorName: "Dr. Ayse Demir",
    treatment: "implant",
    appointmentPurpose: "initial_consultation",
    appointmentPurposeLabel: "Initial consultation",
    startAt: "2026-07-29T10:30:00+03:00",
    endAt: "2026-07-29T11:00:00+03:00",
    durationMinutes: 30,
    outboundDestination:
      overrides.outboundDestination === undefined
        ? {
            channel: "whatsapp",
            reference: "trusted_conversation_reference",
            maskedLabel: "whatsapp:***33",
          }
        : overrides.outboundDestination,
  });

  assert.equal(result.status, "ok");

  return result.appointment;
}

function createCountingOutboundProvider({ fail = false } = {}) {
  const calls = [];

  return {
    name: "mock_outbound",
    calls,
    sendAppointmentConfirmation(command) {
      calls.push(command);

      if (fail) {
        throw new Error("synthetic outbound provider failure");
      }

      return {
        accepted: true,
        provider: "mock_outbound",
        providerMessageId: `mock_confirmation_message_${command.operationReference}`,
        providerDispatchAccepted: true,
        realPatientDelivery: false,
      };
    },
  };
}

function createHarness({ provider = createCountingOutboundProvider() } = {}) {
  const appointmentRepository =
    createInMemoryAppointmentReviewAppointmentRepository();
  const appointment = createAppointment(appointmentRepository);
  const idempotencyStore =
    createInMemoryAppointmentReviewExecutionIdempotencyStore();

  return {
    appointment,
    appointmentRepository,
    idempotencyStore,
    provider,
    input(overrides = {}) {
      return {
        appointmentId: appointment.id,
        expectedAppointmentVersion: appointment.version,
        idempotencyKey: "confirmation_dispatch:appointment_1:1",
        confirmation: "send_mock_appointment_confirmation",
        appointmentRepository,
        outboundMessagingProvider: provider,
        idempotencyStore,
        ...overrides,
      };
    },
  };
}

test("confirmation message builder is deterministic trusted and non-mutating", () => {
  const appointment = createAppointment();
  const before = JSON.stringify(appointment);
  const first = buildAppointmentConfirmationMessage({
    ...appointment,
    patientMessage: "raw sensitive patient text",
    metadata: {
      controlledActionState: "internal",
    },
  });
  const second = buildAppointmentConfirmationMessage(appointment);

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.equal(first.text, second.text);
  assert.match(first.text, /Dr\. Ayse Demir/);
  assert.match(first.text, /Initial consultation/);
  assert.doesNotMatch(first.text, /raw sensitive|controlledActionState|repository|idempotency/i);
  assert.equal(JSON.stringify(appointment), before);
  assert.equal(Object.isFrozen(first), true);
});

test("mock outbound confirmation provider is safe immutable and isolated", () => {
  const firstProvider = createMockOutboundAppointmentConfirmationProvider();
  const secondProvider = createMockOutboundAppointmentConfirmationProvider();
  const command = {
    appointmentId: "appointment_1",
    operationReference: "appointment_1",
    destination: {
      channel: "whatsapp",
      reference: "trusted_conversation_reference",
      maskedLabel: "whatsapp:***33",
    },
    message: {
      text: "Safe message",
    },
  };
  const result = firstProvider.sendAppointmentConfirmation(command);

  assert.equal(result.accepted, true);
  assert.equal(result.provider, "mock_outbound");
  assert.equal(result.realPatientDelivery, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(firstProvider.getCallCount(), 1);
  assert.equal(secondProvider.getCallCount(), 0);
  assert.doesNotMatch(
    JSON.stringify(result),
    /SYNTHETIC_RECIPIENT_PLACEHOLDER|recipient|credential/i
  );
});

test("appointment repository records one confirmation link and versions once", () => {
  const repository = createInMemoryAppointmentReviewAppointmentRepository();
  const appointment = createAppointment(repository);
  const beforeSnapshot = repository.getAppointmentById(appointment.id);
  const linked = repository.linkAppointmentConfirmationMessage({
    appointmentId: appointment.id,
    expectedVersion: 1,
    provider: "mock_outbound",
    providerMessageId: "mock_confirmation_message_appointment_1",
  });
  const duplicate = repository.linkAppointmentConfirmationMessage({
    appointmentId: appointment.id,
    expectedVersion: 2,
    provider: "mock_outbound",
    providerMessageId: "mock_confirmation_message_appointment_1_again",
  });
  const isolated = createInMemoryAppointmentReviewAppointmentRepository();

  assert.equal(beforeSnapshot.confirmationMessageLinked, false);
  assert.equal(linked.status, "ok");
  assert.equal(linked.appointment.version, 2);
  assert.equal(linked.appointment.confirmationMessageLinked, true);
  assert.equal(
    linked.appointment.confirmationProviderMessageId,
    "mock_confirmation_message_appointment_1"
  );
  assert.equal(linked.appointmentRepositoryVersion, 2);
  assert.equal(repository.getVersion(), 2);
  assert.equal(duplicate.status, "error");
  assert.equal(
    duplicate.error.code,
    "appointment_already_confirmation_dispatched"
  );
  assert.equal(isolated.getVersion(), 0);
  assert.equal(beforeSnapshot.confirmationMessageLinked, false);
  assert.equal(Object.isFrozen(linked.appointment), true);
});

test("appointment repository rejects confirmation version conflict without mutation", () => {
  const repository = createInMemoryAppointmentReviewAppointmentRepository();
  const appointment = createAppointment(repository);
  const conflict = repository.linkAppointmentConfirmationMessage({
    appointmentId: appointment.id,
    expectedVersion: 2,
    provider: "mock_outbound",
    providerMessageId: "mock_confirmation_message_appointment_1",
  });

  assert.equal(conflict.status, "error");
  assert.equal(conflict.error.code, "appointment_version_conflict");
  assert.equal(
    repository.getAppointmentById(appointment.id).confirmationMessageLinked,
    false
  );
  assert.equal(repository.getVersion(), 1);
});

test("confirmation dispatch service uses trusted destination and appointment data", async () => {
  const harness = createHarness();
  const result = await dispatchAppointmentConfirmation(
    harness.input({
      recipientPhone: "SYNTHETIC_RECIPIENT_PLACEHOLDER",
      message: "client override",
      provider: "whatsapp",
    })
  );
  const command = harness.provider.calls[0];

  assert.equal(result.accepted, true);
  assert.equal(result.dispatched, true);
  assert.equal(result.provider, "mock_outbound");
  assert.equal(result.providerMessageId, "mock_confirmation_message_appointment_1");
  assert.equal(result.maskedDestinationLabel, "whatsapp:***33");
  assert.equal(result.previousAppointmentVersion, 1);
  assert.equal(result.resultingAppointmentVersion, 2);
  assert.equal(result.appointmentRepositoryVersion, 2);
  assert.equal(result.providerDispatchAccepted, true);
  assert.equal(result.realPatientDelivery, false);
  assert.equal(result.calendarWritten, false);
  assert.equal(result.databasePersisted, false);
  assert.equal(harness.provider.calls.length, 1);
  assert.equal(command.destination.maskedLabel, "whatsapp:***33");
  assert.equal(command.message.text.includes("client override"), false);
  assert.equal(command.message.text.includes("Dr. Ayse Demir"), true);
  assert.doesNotMatch(
    JSON.stringify(result),
    /SYNTHETIC_RECIPIENT_PLACEHOLDER|client override|recipientPhone/
  );
});

test("confirmation dispatch idempotency replay and already-confirmed avoid provider calls", async () => {
  const harness = createHarness();
  const first = await dispatchAppointmentConfirmation(harness.input());
  const replay = await dispatchAppointmentConfirmation(harness.input());
  const alreadyConfirmed = await dispatchAppointmentConfirmation(
    harness.input({
      expectedAppointmentVersion: 2,
      idempotencyKey: "confirmation_dispatch:appointment_1:different",
    })
  );
  const conflictHarness = createHarness();
  await dispatchAppointmentConfirmation(conflictHarness.input());
  const conflict = await dispatchAppointmentConfirmation(
    conflictHarness.input({
      idempotencyKey: "confirmation_dispatch:appointment_1:1",
      appointmentId: "appointment_2",
    })
  );

  assert.equal(first.accepted, true);
  assert.equal(replay.accepted, true);
  assert.equal(replay.matchingReplay, true);
  assert.equal(replay.providerCalled, false);
  assert.equal(replay.resultingAppointmentVersion, 2);
  assert.equal(harness.provider.calls.length, 1);
  assert.equal(alreadyConfirmed.accepted, false);
  assert.equal(
    alreadyConfirmed.code,
    "appointment_confirmation_already_dispatched"
  );
  assert.equal(harness.provider.calls.length, 1);
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.code, "idempotency_key_conflict");
});

test("confirmation dispatch blocks missing destination and provider failure before local link", async () => {
  const missingDestinationRepository =
    createInMemoryAppointmentReviewAppointmentRepository();
  const missingDestination = createAppointment(missingDestinationRepository, {
    sourceReviewId: "review_missing_destination",
    outboundDestination: null,
  });
  const provider = createCountingOutboundProvider();
  const blocked = await dispatchAppointmentConfirmation({
    appointmentId: missingDestination.id,
    expectedAppointmentVersion: missingDestination.version,
    idempotencyKey: "confirmation_dispatch:missing_destination",
    confirmation: "send_mock_appointment_confirmation",
    appointmentRepository: missingDestinationRepository,
    outboundMessagingProvider: provider,
    idempotencyStore: createInMemoryAppointmentReviewExecutionIdempotencyStore(),
  });
  const failureHarness = createHarness({
    provider: createCountingOutboundProvider({ fail: true }),
  });
  const providerFailure = await dispatchAppointmentConfirmation(
    failureHarness.input()
  );

  assert.equal(blocked.accepted, false);
  assert.equal(blocked.code, "missing_trusted_outbound_destination");
  assert.equal(blocked.providerCalled, false);
  assert.equal(provider.calls.length, 0);
  assert.equal(providerFailure.accepted, false);
  assert.equal(providerFailure.providerFailed, true);
  assert.equal(failureHarness.provider.calls.length, 1);
  assert.equal(
    failureHarness.appointmentRepository.getAppointmentById(
      failureHarness.appointment.id
    ).confirmationMessageLinked,
    false
  );
});

test("provider success followed by local confirmation link failure is ambiguous", async () => {
  const harness = createHarness();
  let linkCalls = 0;
  const result = await dispatchAppointmentConfirmation(
    harness.input({
      appointmentRepository: {
        getAppointmentById: harness.appointmentRepository.getAppointmentById,
        linkAppointmentConfirmationMessage() {
          linkCalls += 1;
          return {
            status: "error",
            error: {
              code: "synthetic_link_failure",
              message: "Synthetic link failure.",
            },
          };
        },
      },
    })
  );

  assert.equal(result.accepted, false);
  assert.equal(result.ambiguous, true);
  assert.equal(result.providerDispatchAccepted, true);
  assert.equal(result.messageSent, true);
  assert.equal(result.confirmationMessageLinkRecorded, false);
  assert.equal(result.providerMessageId, "mock_confirmation_message_appointment_1");
  assert.equal(harness.provider.calls.length, 1);
  assert.equal(linkCalls, 1);
  assert.doesNotMatch(
    JSON.stringify(result),
    /Synthetic link failure|SYNTHETIC_RECIPIENT_PLACEHOLDER/
  );
});

test("confirmation dispatch receipt is immutable and excludes recipient PII", () => {
  const receipt = constructAppointmentConfirmationDispatchReceipt({
    appointmentId: "appointment_1",
    sourceReviewId: "review_1",
    provider: "mock_outbound",
    providerMessageId: "mock_confirmation_message_appointment_1",
    maskedDestinationLabel: "whatsapp:***33",
    startAt: "2026-07-29T10:30:00+03:00",
    endAt: "2026-07-29T11:00:00+03:00",
    previousAppointmentVersion: 1,
    resultingAppointmentVersion: 2,
    appointmentRepositoryVersion: 2,
  });

  assert.equal(receipt.accepted, true);
  assert.equal(
    receipt.receiptKind,
    "appointment_confirmation_dispatch_receipt_v1"
  );
  assert.equal(receipt.realPatientDelivery, false);
  assert.equal(receipt.whatsappSent, false);
  assert.equal(receipt.messageSent, true);
  assert.equal(Object.isFrozen(receipt), true);
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /SYNTHETIC_RECIPIENT_PLACEHOLDER|recipient|credential|private_key/i
  );
});

test("runtime and route adapter expose narrow isolated confirmation capability", async () => {
  const firstProvider = createCountingOutboundProvider();
  const secondProvider = createCountingOutboundProvider();
  const resolveControlledActionState = ({ review }) =>
    review?.metadata?.controlledActionState || "";
  const firstRuntime = createInMemoryMockAppointmentReviewServerRuntime({
    resolveControlledActionState,
    outboundMessagingProvider: firstProvider,
  });
  const secondRuntime = createInMemoryMockAppointmentReviewServerRuntime({
    resolveControlledActionState,
    outboundMessagingProvider: secondProvider,
  });
  const adapter = createAppointmentReviewRouteRuntimeAdapter({
    resolveControlledActionState,
    outboundMessagingProvider: createCountingOutboundProvider(),
  });

  assert.equal(typeof firstRuntime.dispatchAppointmentConfirmation, "function");
  assert.equal(typeof adapter.dispatchAppointmentConfirmation, "function");
  assert.equal(Object.hasOwn(adapter, "outboundMessagingProvider"), false);
  assert.equal(Object.hasOwn(adapter, "appointmentRepository"), false);
  assert.equal(firstRuntime.listCreatedAppointments().length, 0);
  assert.equal(secondRuntime.listCreatedAppointments().length, 0);
});

test("confirmation route validates payload and maps safe outcomes", async () => {
  const calls = [];
  const adapter = Object.freeze({
    dispatchAppointmentConfirmation(input) {
      calls.push(input);

      return {
        accepted: true,
        dispatched: true,
        confirmationDispatch: true,
        code: "appointment_confirmation_dispatch_completed",
        appointmentId: input.appointmentId,
        provider: "mock_outbound",
        providerMessageId: "mock_confirmation_message_appointment_1",
        maskedDestinationLabel: "whatsapp:***33",
        confirmationMessageLinkRecorded: true,
        providerDispatchAccepted: true,
        realPatientDelivery: false,
        messageSent: true,
        whatsappSent: false,
        emailSent: false,
        smsSent: false,
        calendarWritten: false,
        calendarEventCreated: false,
        databasePersisted: false,
        storage: "in_memory",
        appointmentPersistence: "not_persisted",
        durableAppointmentPersistence: false,
      };
    },
  });
  const createRouteRuntimeAdapter = () => adapter;
  const validResponse =
    await confirmationRoute.handleAppointmentConfirmationMessageRouteRequest(
      new Request(
        "http://localhost/api/secretary/appointments/appointment_1/confirmation-message",
        {
          method: "POST",
          body: JSON.stringify({
            expectedAppointmentVersion: 1,
            idempotencyKey: "confirmation_dispatch:appointment_1:1",
            confirmation: "send_mock_appointment_confirmation",
          }),
        }
      ),
      { params: { appointmentId: "appointment_1" } },
      { createRouteRuntimeAdapter }
    );
  const validBody = await validResponse.json();
  const invalidResponse =
    await confirmationRoute.handleAppointmentConfirmationMessageRouteRequest(
      new Request(
        "http://localhost/api/secretary/appointments/appointment_1/confirmation-message",
        {
          method: "POST",
          body: JSON.stringify({
            expectedAppointmentVersion: 1,
            idempotencyKey: "confirmation_dispatch:appointment_1:1",
            confirmation: "send_mock_appointment_confirmation",
            recipientPhone: "SYNTHETIC_RECIPIENT_PLACEHOLDER",
          }),
        }
      ),
      { params: { appointmentId: "appointment_1" } },
      {
        createRouteRuntimeAdapter() {
          throw new Error("adapter must not be created");
        },
      }
    );

  assert.equal(validResponse.status, 200);
  assert.equal(validBody.accepted, true);
  assert.equal(validBody.provider, "mock_outbound");
  assert.equal(validBody.realPatientDelivery, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    appointmentId: "appointment_1",
    expectedAppointmentVersion: 1,
    idempotencyKey: "confirmation_dispatch:appointment_1:1",
    confirmation: "send_mock_appointment_confirmation",
  });
  assert.equal(invalidResponse.status, 400);
  assert.equal(calls.length, 1);
  assert.equal((await confirmationRoute.GET()).status, 405);
});

test("in-process production confirmation route smoke dispatches once replays and blocks already confirmed", async () => {
  const outboundProvider = createCountingOutboundProvider();
  const root = createAppointmentReviewActiveRouteRuntimeCompositionRoot({
    outboundMessagingProvider: outboundProvider,
  });
  const createRouteRuntimeAdapter = () => root.getRouteRuntimeAdapter();
  const reviewId = "review_route_runtime_demo";
  const executionResponse =
    await approveRoute.handleAppointmentReviewDecisionExecutionRouteRequest(
      new Request(
        `http://localhost/api/secretary/appointment-reviews/${reviewId}/decision-execution`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "approve",
            expectedReviewVersion: 1,
            idempotencyKey: "decision_execution:route_demo:approve",
            confirmation: "apply_in_memory",
          }),
        }
      ),
      { params: { id: reviewId } },
      { createRouteRuntimeAdapter }
    );
  const executionBody = await executionResponse.json();
  const creationResponse =
    await createRoute.handleAppointmentReviewAppointmentCreationRouteRequest(
      new Request(
        `http://localhost/api/secretary/appointment-reviews/${reviewId}/appointment-creation`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedReviewVersion: executionBody.resultingReviewVersion,
            idempotencyKey: "appointment_creation:route_demo",
            confirmation: "create_in_memory_appointment",
          }),
        }
      ),
      { params: { id: reviewId } },
      { createRouteRuntimeAdapter }
    );
  const creationBody = await creationResponse.json();
  const appointmentId = creationBody.appointmentId;
  const firstResponse =
    await confirmationRoute.handleAppointmentConfirmationMessageRouteRequest(
      new Request(
        `http://localhost/api/secretary/appointments/${appointmentId}/confirmation-message`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedAppointmentVersion: creationBody.appointment.version,
            idempotencyKey: "confirmation_dispatch:route_demo",
            confirmation: "send_mock_appointment_confirmation",
          }),
        }
      ),
      { params: { appointmentId } },
      { createRouteRuntimeAdapter }
    );
  const firstBody = await firstResponse.json();
  const replayResponse =
    await confirmationRoute.handleAppointmentConfirmationMessageRouteRequest(
      new Request(
        `http://localhost/api/secretary/appointments/${appointmentId}/confirmation-message`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedAppointmentVersion: creationBody.appointment.version,
            idempotencyKey: "confirmation_dispatch:route_demo",
            confirmation: "send_mock_appointment_confirmation",
          }),
        }
      ),
      { params: { appointmentId } },
      { createRouteRuntimeAdapter }
    );
  const replayBody = await replayResponse.json();
  const alreadyResponse =
    await confirmationRoute.handleAppointmentConfirmationMessageRouteRequest(
      new Request(
        `http://localhost/api/secretary/appointments/${appointmentId}/confirmation-message`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedAppointmentVersion: 2,
            idempotencyKey: "confirmation_dispatch:route_demo:different",
            confirmation: "send_mock_appointment_confirmation",
          }),
        }
      ),
      { params: { appointmentId } },
      { createRouteRuntimeAdapter }
    );
  const alreadyBody = await alreadyResponse.json();
  const listResponse = await appointmentsRoute.GET(
    new Request("http://localhost/api/secretary/appointments"),
    { createRouteRuntimeAdapter }
  );
  const listBody = await listResponse.json();
  const linkedAppointment = listBody.appointments.find(
    (appointment) => appointment.id === appointmentId
  );

  assert.equal(firstResponse.status, 200);
  assert.equal(firstBody.accepted, true);
  assert.equal(firstBody.provider, "mock_outbound");
  assert.equal(firstBody.providerMessageId, "mock_confirmation_message_appointment_1");
  assert.equal(firstBody.confirmationMessageLinkRecorded, true);
  assert.equal(firstBody.previousAppointmentVersion, 1);
  assert.equal(firstBody.resultingAppointmentVersion, 2);
  assert.equal(firstBody.providerDispatchAccepted, true);
  assert.equal(firstBody.realPatientDelivery, false);
  assert.equal(firstBody.calendarWritten, false);
  assert.equal(outboundProvider.calls.length, 1);
  assert.equal(replayResponse.status, 200);
  assert.equal(replayBody.matchingReplay, true);
  assert.equal(replayBody.providerCalled, false);
  assert.equal(replayBody.resultingAppointmentVersion, 2);
  assert.equal(outboundProvider.calls.length, 1);
  assert.equal(alreadyResponse.status, 409);
  assert.equal(alreadyBody.alreadyConfirmed, true);
  assert.equal(outboundProvider.calls.length, 1);
  assert.equal(linkedAppointment.version, 2);
  assert.equal(linkedAppointment.confirmationMessageLinked, true);
  assert.equal(linkedAppointment.realPatientDelivery, false);
  assert.doesNotMatch(
    JSON.stringify([firstBody, replayBody, alreadyBody]),
    /"repository"\s*:|"adapter"\s*:|"runtime"\s*:|provider object|credential|private_key|stack|SYNTHETIC_RECIPIENT_PLACEHOLDER|patientPhone|patientId|raw/i
  );
});

test("confirmation architecture source stays narrow and side-effect safe", () => {
  const files = [
    "src/api/secretaryAppointmentConfirmationDispatchService.js",
    "src/secretary/appointmentConfirmationMessageBuilder.js",
    "src/secretary/appointmentConfirmationDispatchReceipt.js",
    "src/messaging/mockOutboundAppointmentConfirmationProvider.js",
    "app/api/secretary/appointments/[appointmentId]/confirmation-message/route.js",
  ];
  const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

  assert.doesNotMatch(
    source,
    /whatsapp-web|@whiskeysockets|twilio|nodemailer|sendgrid|meta|facebook|googleapis|prisma|supabase|redis|sqlite|postgres|fetch\(|process\.env|node:fs|require\("fs"\)|commandBus|eventBus|jobQueue|worker|dispatcher|outbox|retry|authProvider|authenticationProvider|createCalendarEvent|manualAppointmentCalendarSync/
  );
  assert.doesNotMatch(source, /new Provider|class .*Provider|global|singleton/);
});

test("appointment reviews workspace exposes safe two-step confirmation dispatch", () => {
  const source = fs.readFileSync(
    "app/components/AppointmentReviewsWorkspace.js",
    "utf8"
  );
  const submitSource = source.slice(
    source.indexOf("async function confirmAppointmentConfirmationDispatch"),
    source.indexOf("function startConfirmationDispatchRequest")
  );

  assert.match(source, /Prepare Appointment Confirmation/);
  assert.match(source, /Send Appointment Confirmation — Mock Provider/);
  assert.match(source, /mock provider/i);
  assert.match(source, /no real\s+patient message reaches a patient/i);
  assert.match(source, /masked destination/i);
  assert.match(source, /isConfirmationDispatchEligibleAppointment/);
  assert.match(source, /confirmationDispatchStatus === "loading"/);
  assert.match(source, /refreshCreatedAppointmentsFromTrustedServer/);
  assert.match(submitSource, /\/confirmation-message/);
  assert.match(submitSource, /body: JSON\.stringify\(\{/);
  assert.match(
    submitSource,
    /expectedAppointmentVersion:\s+confirmation\.expectedAppointmentVersion/
  );
  assert.match(submitSource, /idempotencyKey: confirmation\.idempotencyKey/);
  assert.match(
    submitSource,
    /confirmation: APPOINTMENT_CONFIRMATION_DISPATCH_CONFIRMATION/
  );
  assert.doesNotMatch(
    submitSource,
    /recipient|phone|messageBody|message:|providerName|providerMessageId|doctor|startAt|endAt|durationMinutes|patient|selectedSlot|timezone|treatment/
  );
});
