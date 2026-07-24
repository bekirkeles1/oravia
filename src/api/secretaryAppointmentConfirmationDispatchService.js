const {
  buildAppointmentConfirmationMessage,
} = require("../secretary/appointmentConfirmationMessageBuilder");
const {
  constructAppointmentConfirmationDispatchReceipt,
} = require("../secretary/appointmentConfirmationDispatchReceipt");

const CONFIRMATION_DISPATCH_CONFIRMATION =
  "send_mock_appointment_confirmation";
const CONFIRMATION_DISPATCH_CODES = Object.freeze({
  DISPATCHED: "appointment_confirmation_dispatch_completed",
  REPLAY: "appointment_confirmation_dispatch_matching_replay",
  ALREADY_CONFIRMED: "appointment_confirmation_already_dispatched",
  CONFLICT: "appointment_confirmation_dispatch_conflict",
  NOT_FOUND: "appointment_confirmation_dispatch_appointment_not_found",
  PROVIDER_UNAVAILABLE: "appointment_confirmation_provider_unavailable",
  PROVIDER_FAILED: "appointment_confirmation_provider_failed",
  AMBIGUOUS: "appointment_confirmation_dispatch_ambiguous_local_link_failure",
});

const DISPATCH_SAFETY_FIELDS = Object.freeze({
  confirmationDispatch: true,
  storage: "in_memory",
  appointmentPersistence: "not_persisted",
  durableAppointmentPersistence: false,
  calendarWritten: false,
  calendarEventCreated: false,
  databasePersisted: false,
  whatsappSent: false,
  emailSent: false,
  smsSent: false,
  realPatientDelivery: false,
});

async function dispatchAppointmentConfirmation(input) {
  const inputIssue = validateDispatchInput(input);

  if (inputIssue.code) {
    return rejectDispatch(inputIssue);
  }

  const {
    appointmentId,
    expectedAppointmentVersion,
    idempotencyKey,
    appointmentRepository,
    outboundMessagingProvider,
  } = inputIssue.value;
  const priorObservation = input.idempotencyStore.observe(idempotencyKey);

  if (
    priorObservation &&
    !String(priorObservation.requestFingerprint || "").includes(
      `appointmentId:${appointmentId}|`
    )
  ) {
    return rejectDispatch({
      code: "idempotency_key_conflict",
      reason:
        "idempotencyKey was previously used for a different confirmation dispatch request.",
      appointmentId,
      conflict: true,
    });
  }

  let appointment;

  try {
    appointment = appointmentRepository.getAppointmentById(appointmentId);
  } catch {
    return rejectDispatch({
      code: "appointment_resolution_failed",
      reason: "Trusted appointment resolution failed safely.",
      appointmentId,
      internal: true,
    });
  }

  if (!appointment) {
    return rejectDispatch({
      code: CONFIRMATION_DISPATCH_CODES.NOT_FOUND,
      reason: "Appointment was not found.",
      appointmentId,
      notFound: true,
    });
  }

  const destinationResult = resolveTrustedDestination(appointment);

  if (!destinationResult.accepted) {
    return rejectDispatch({
      code: destinationResult.code,
      reason: destinationResult.reason,
      appointmentId,
      blocked: true,
    });
  }

  const messageResult = buildAppointmentConfirmationMessage(appointment);

  if (!messageResult.accepted) {
    return rejectDispatch({
      code: messageResult.code,
      reason: messageResult.reason,
      appointmentId,
      blocked: true,
    });
  }

  const providerName = normalizeText(outboundMessagingProvider.name);
  const messageFingerprint = buildMessageFingerprint(messageResult);
  const destinationFingerprint = buildDestinationFingerprint(
    destinationResult.destination
  );
  const requestFingerprint = buildDispatchFingerprint({
    appointmentId,
    expectedAppointmentVersion,
    providerName,
    destinationFingerprint,
    messageFingerprint,
  });

  if (priorObservation) {
    if (priorObservation.requestFingerprint === requestFingerprint) {
      const storedResult = input.idempotencyStore.getResult(idempotencyKey);

      if (storedResult) {
        return freezeClone({
          ...storedResult,
          accepted: true,
          dispatched: false,
          matchingReplay: true,
          idempotencyStatus: "matching_replay",
          code: CONFIRMATION_DISPATCH_CODES.REPLAY,
          providerCalled: false,
          appointmentVersionChanged: false,
          appointmentRepositoryVersionChanged: false,
          replayedResultOnly: true,
          receipt: {
            ...storedResult.receipt,
            matchingReplay: true,
            idempotencyStatus: "matching_replay",
          },
          ...createSafetyFields(),
        });
      }
    }

    return rejectDispatch({
      code: "idempotency_key_conflict",
      reason:
        "idempotencyKey was previously used for a different confirmation dispatch request.",
      appointmentId,
      conflict: true,
    });
  }

  if (appointment.version !== expectedAppointmentVersion) {
    return rejectDispatch({
      code: "appointment_version_conflict",
      reason:
        "expectedAppointmentVersion must match the current trusted appointment version.",
      appointmentId,
      expectedAppointmentVersion,
      observedAppointmentVersion: appointment.version,
      conflict: true,
    });
  }

  if (
    appointment.confirmationMessageLinked === true ||
    appointment.confirmationProviderMessageId
  ) {
    return rejectDispatch({
      code: CONFIRMATION_DISPATCH_CODES.ALREADY_CONFIRMED,
      reason: "Appointment already has a linked confirmation message.",
      appointmentId,
      provider: appointment.confirmationMessagingProvider,
      providerMessageId: appointment.confirmationProviderMessageId,
      maskedDestinationLabel: destinationResult.destination.maskedLabel,
      alreadyConfirmed: true,
      conflict: true,
    });
  }

  let reserveResult;

  try {
    reserveResult = input.idempotencyStore.reserveResult({
      idempotencyKey,
      requestFingerprint,
    });
  } catch {
    return rejectDispatch({
      code: "confirmation_dispatch_idempotency_reserve_failed",
      reason:
        "Confirmation dispatch idempotency reserve failed before provider call.",
      appointmentId,
      internal: true,
    });
  }

  if (!reserveResult || reserveResult.accepted !== true) {
    return rejectDispatch({
      code:
        reserveResult?.code ||
        "confirmation_dispatch_idempotency_reserve_failed",
      reason:
        reserveResult?.reason ||
        "Confirmation dispatch idempotency reserve failed before provider call.",
      appointmentId,
      conflict: reserveResult?.code === "idempotency_key_conflict",
      internal: reserveResult?.code !== "idempotency_key_conflict",
    });
  }

  const operationReference = buildOperationReference(appointmentId);
  const providerCommand = freezeClone({
    commandKind: "appointment_confirmation_dispatch_command_v1",
    appointmentId,
    appointment,
    operationReference,
    destination: destinationResult.destination,
    message: {
      kind: messageResult.messageKind,
      text: messageResult.text,
      locale: messageResult.locale,
      timezone: messageResult.timezone,
    },
  });
  let providerResult;

  try {
    providerResult =
      await outboundMessagingProvider.sendAppointmentConfirmation(
        providerCommand
      );
  } catch {
    return rejectDispatch({
      code: CONFIRMATION_DISPATCH_CODES.PROVIDER_FAILED,
      reason: "Configured outbound messaging provider failed safely.",
      appointmentId,
      provider: providerName,
      providerFailed: true,
    });
  }

  const safeProviderResult = normalizeProviderResult({
    providerResult,
    providerName,
  });

  if (!safeProviderResult.accepted) {
    return rejectDispatch({
      code: safeProviderResult.code,
      reason: safeProviderResult.reason,
      appointmentId,
      provider: providerName,
      providerFailed: true,
    });
  }

  let linkResult;

  try {
    linkResult = appointmentRepository.linkAppointmentConfirmationMessage({
      appointmentId,
      expectedVersion: expectedAppointmentVersion,
      provider: safeProviderResult.provider,
      providerMessageId: safeProviderResult.providerMessageId,
      initialStatus: safeProviderResult.providerLifecycleStatus,
    });
  } catch {
    return ambiguousProviderSucceeded({
      appointmentId,
      provider: safeProviderResult.provider,
      providerMessageId: safeProviderResult.providerMessageId,
      maskedDestinationLabel: destinationResult.destination.maskedLabel,
    });
  }

  if (!linkResult || linkResult.status !== "ok") {
    return ambiguousProviderSucceeded({
      appointmentId,
      provider: safeProviderResult.provider,
      providerMessageId: safeProviderResult.providerMessageId,
      maskedDestinationLabel: destinationResult.destination.maskedLabel,
    });
  }

  const receipt = constructAppointmentConfirmationDispatchReceipt({
    appointmentId,
    sourceReviewId: linkResult.appointment.sourceReviewId,
    appointment: linkResult.appointment,
    provider: safeProviderResult.provider,
    providerMessageId: safeProviderResult.providerMessageId,
    maskedDestinationLabel: destinationResult.destination.maskedLabel,
    previousAppointmentVersion: linkResult.previousAppointmentVersion,
    resultingAppointmentVersion: linkResult.nextAppointmentVersion,
    appointmentRepositoryVersion: linkResult.appointmentRepositoryVersion,
    idempotencyStatus: "new_request",
    matchingReplay: false,
  });

  if (!receipt.accepted) {
    return ambiguousProviderSucceeded({
      appointmentId,
      provider: safeProviderResult.provider,
      providerMessageId: safeProviderResult.providerMessageId,
      maskedDestinationLabel: destinationResult.destination.maskedLabel,
      confirmationMessageLinkRecorded: true,
      appointmentVersionChanged: true,
      appointmentRepositoryVersionChanged: true,
    });
  }

  const result = freezeClone({
    accepted: true,
    dispatched: true,
    matchingReplay: false,
    replayedResultOnly: false,
    alreadyConfirmed: false,
    ambiguous: false,
    idempotencyStatus: "new_request",
    code: CONFIRMATION_DISPATCH_CODES.DISPATCHED,
    appointmentId,
    sourceReviewId: linkResult.appointment.sourceReviewId,
    provider: safeProviderResult.provider,
    providerMessageId: safeProviderResult.providerMessageId,
    maskedDestinationLabel: destinationResult.destination.maskedLabel,
    appointment: linkResult.appointment,
    previousAppointmentVersion: linkResult.previousAppointmentVersion,
    resultingAppointmentVersion: linkResult.nextAppointmentVersion,
    appointmentRepositoryVersion: linkResult.appointmentRepositoryVersion,
    confirmationMessageLinkRecorded: true,
    appointmentVersionChanged: true,
    appointmentRepositoryVersionChanged: true,
    providerCalled: true,
    providerDispatchAccepted: true,
    realPatientDelivery: false,
    messageSent:
      safeProviderResult.providerLifecycleStatus === "accepted" ? false : true,
    receipt,
    ...createSafetyFields(),
  });
  const storeResult = input.idempotencyStore.storeResult({
    idempotencyKey,
    requestFingerprint,
    result,
  });

  if (!storeResult || storeResult.accepted !== true) {
    return rejectDispatch({
      code: CONFIRMATION_DISPATCH_CODES.AMBIGUOUS,
      reason:
        "Provider dispatch and local link succeeded, but confirmation result storage failed. Manual internal reconciliation may be required.",
      appointmentId,
      provider: safeProviderResult.provider,
      providerMessageId: safeProviderResult.providerMessageId,
      maskedDestinationLabel: destinationResult.destination.maskedLabel,
      ambiguous: true,
      providerDispatchAccepted: true,
      confirmationMessageLinkRecorded: true,
      appointmentVersionChanged: true,
      appointmentRepositoryVersionChanged: true,
      messageSent: true,
      internal: true,
    });
  }

  return result;
}

function resolveTrustedDestination(appointment) {
  const destination = appointment?.outboundDestination;
  const channel = normalizeText(destination?.channel);
  const reference = normalizeText(destination?.reference);
  const maskedLabel = normalizeText(destination?.maskedLabel);
  const lookupHash = normalizeText(destination?.lookupHash);
  const encryptedIdentity =
    destination?.encryptedIdentity &&
    typeof destination.encryptedIdentity === "object" &&
    !Array.isArray(destination.encryptedIdentity)
      ? destination.encryptedIdentity
      : null;

  if (!channel || !maskedLabel || (!reference && !lookupHash)) {
    return rejectCommand(
      "missing_trusted_outbound_destination",
      "Trusted appointment does not contain a safe outbound destination."
    );
  }

  return freezeClone({
    accepted: true,
    destination: {
      channel,
      reference,
      maskedLabel,
      lookupHash,
      encryptedIdentity,
    },
  });
}

function validateDispatchInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      code: "invalid_confirmation_dispatch_input",
      reason: "Confirmation dispatch input must be an object.",
    };
  }

  const appointmentId = normalizeText(input.appointmentId);
  const idempotencyKey = normalizeText(input.idempotencyKey);

  if (!appointmentId || !/^[a-z0-9_:-]+$/.test(appointmentId)) {
    return {
      code: "invalid_appointment_id",
      reason: "appointmentId is required and must be safe.",
    };
  }

  if (
    !Number.isSafeInteger(input.expectedAppointmentVersion) ||
    input.expectedAppointmentVersion < 1
  ) {
    return {
      code: "invalid_expected_appointment_version",
      reason: "expectedAppointmentVersion must be a positive safe integer.",
      appointmentId,
    };
  }

  if (!idempotencyKey || idempotencyKey.length > 128) {
    return {
      code: idempotencyKey
        ? "invalid_idempotency_key"
        : "missing_idempotency_key",
      reason:
        "idempotencyKey is required and must be 128 characters or fewer.",
      appointmentId,
    };
  }

  if (!/^[A-Za-z0-9:_-]+$/.test(idempotencyKey)) {
    return {
      code: "invalid_idempotency_key",
      reason:
        "idempotencyKey may contain only letters, numbers, hyphen, underscore, and colon.",
      appointmentId,
    };
  }

  if (normalizeText(input.confirmation) !== CONFIRMATION_DISPATCH_CONFIRMATION) {
    return {
      code: "missing_confirmation_dispatch_confirmation",
      reason: "Explicit mock appointment confirmation dispatch is required.",
      appointmentId,
    };
  }

  if (!input.appointmentRepository || typeof input.appointmentRepository !== "object") {
    return {
      code: "missing_appointment_repository",
      reason: "Appointment repository is required.",
      appointmentId,
    };
  }

  for (const methodName of [
    "getAppointmentById",
    "linkAppointmentConfirmationMessage",
  ]) {
    if (typeof input.appointmentRepository[methodName] !== "function") {
      return {
        code: "invalid_appointment_repository",
        reason: "Appointment repository contract is invalid.",
        appointmentId,
      };
    }
  }

  if (
    !input.outboundMessagingProvider ||
    typeof input.outboundMessagingProvider !== "object" ||
    typeof input.outboundMessagingProvider.sendAppointmentConfirmation !== "function" ||
    !normalizeText(input.outboundMessagingProvider.name)
  ) {
    return {
      code: CONFIRMATION_DISPATCH_CODES.PROVIDER_UNAVAILABLE,
      reason: "Configured outbound messaging provider is unavailable.",
      appointmentId,
      providerUnavailable: true,
    };
  }

  if (
    !input.idempotencyStore ||
    typeof input.idempotencyStore.observe !== "function" ||
    typeof input.idempotencyStore.getResult !== "function" ||
    typeof input.idempotencyStore.reserveResult !== "function" ||
    typeof input.idempotencyStore.storeResult !== "function"
  ) {
    return {
      code: "invalid_confirmation_dispatch_idempotency_store",
      reason: "Confirmation dispatch idempotency store contract is invalid.",
      appointmentId,
    };
  }

  return {
    value: {
      appointmentId,
      expectedAppointmentVersion: input.expectedAppointmentVersion,
      idempotencyKey,
      appointmentRepository: input.appointmentRepository,
      outboundMessagingProvider: input.outboundMessagingProvider,
    },
  };
}

function normalizeProviderResult({ providerResult, providerName }) {
  if (!providerResult || typeof providerResult !== "object") {
    return rejectCommand(
      "invalid_confirmation_provider_result",
      "Configured outbound messaging provider returned malformed output."
    );
  }

  const provider = normalizeText(providerResult.provider);
  const providerMessageId = normalizeText(providerResult.providerMessageId);

  if (
    provider !== providerName ||
    !providerMessageId ||
    providerResult.providerDispatchAccepted !== true ||
    providerResult.realPatientDelivery !== false
  ) {
    return rejectCommand(
      "unsafe_confirmation_provider_result",
      "Configured outbound messaging provider result was unsafe."
    );
  }

  return freezeClone({
    accepted: true,
    provider,
    providerMessageId,
    providerLifecycleStatus: normalizeText(
      providerResult.providerLifecycleStatus
    ),
  });
}

function ambiguousProviderSucceeded({
  appointmentId,
  provider,
  providerMessageId,
  maskedDestinationLabel,
  confirmationMessageLinkRecorded = false,
  appointmentVersionChanged = false,
  appointmentRepositoryVersionChanged = false,
}) {
  return rejectDispatch({
    code: CONFIRMATION_DISPATCH_CODES.AMBIGUOUS,
    reason:
      "Provider dispatch succeeded, but local in-memory confirmation link failed. Manual internal reconciliation may be required.",
    appointmentId,
    provider,
    providerMessageId,
    maskedDestinationLabel,
    ambiguous: true,
    providerDispatchAccepted: true,
    confirmationMessageLinkRecorded,
    appointmentVersionChanged,
    appointmentRepositoryVersionChanged,
    messageSent: true,
    internal: true,
  });
}

function buildDispatchFingerprint({
  appointmentId,
  expectedAppointmentVersion,
  providerName,
  destinationFingerprint,
  messageFingerprint,
}) {
  return [
    "operation:appointment_confirmation_dispatch",
    `appointmentId:${appointmentId}`,
    `expectedAppointmentVersion:${expectedAppointmentVersion}`,
    `provider:${providerName}`,
    `destination:${destinationFingerprint}`,
    `message:${messageFingerprint}`,
  ].join("|");
}

function buildDestinationFingerprint(destination) {
  return [
    destination.channel,
    destination.reference,
    destination.maskedLabel,
  ].join("|");
}

function buildMessageFingerprint(messageResult) {
  return [
    messageResult.messageKind,
    messageResult.locale,
    messageResult.timezone,
    messageResult.dateLabel,
    messageResult.startTimeLabel,
    messageResult.endTimeLabel,
    messageResult.text,
  ].join("|");
}

function buildOperationReference(appointmentId) {
  return normalizeText(appointmentId).replace(/[^A-Za-z0-9:_-]+/g, "_");
}

function rejectCommand(code, reason) {
  return freezeClone({
    accepted: false,
    code,
    reason,
  });
}

function rejectDispatch({
  code,
  reason,
  appointmentId = "",
  expectedAppointmentVersion = null,
  observedAppointmentVersion = null,
  provider = null,
  providerMessageId = null,
  maskedDestinationLabel = null,
  blocked = false,
  conflict = false,
  notFound = false,
  internal = false,
  alreadyConfirmed = false,
  ambiguous = false,
  providerFailed = false,
  providerUnavailable = false,
  providerDispatchAccepted = false,
  confirmationMessageLinkRecorded = false,
  appointmentVersionChanged = false,
  appointmentRepositoryVersionChanged = false,
  messageSent = false,
}) {
  return freezeClone({
    accepted: false,
    dispatched: false,
    matchingReplay: false,
    replayedResultOnly: false,
    alreadyConfirmed: alreadyConfirmed === true,
    ambiguous: ambiguous === true,
    blocked: blocked === true,
    conflict: conflict === true,
    notFound: notFound === true,
    internal: internal === true,
    providerFailed: providerFailed === true,
    providerUnavailable: providerUnavailable === true,
    code,
    reason,
    appointmentId: normalizeText(appointmentId) || null,
    expectedAppointmentVersion,
    observedAppointmentVersion,
    provider: provider ? normalizeText(provider) : null,
    providerMessageId: providerMessageId ? normalizeText(providerMessageId) : null,
    maskedDestinationLabel: maskedDestinationLabel
      ? normalizeText(maskedDestinationLabel)
      : null,
    appointment: null,
    receipt: null,
    providerCalled: providerDispatchAccepted === true,
    providerDispatchAccepted: providerDispatchAccepted === true,
    realPatientDelivery: false,
    confirmationMessageLinkRecorded:
      confirmationMessageLinkRecorded === true,
    appointmentVersionChanged: appointmentVersionChanged === true,
    appointmentRepositoryVersionChanged:
      appointmentRepositoryVersionChanged === true,
    messageSent: messageSent === true,
    ...createSafetyFields(),
  });
}

function createSafetyFields() {
  return { ...DISPATCH_SAFETY_FIELDS };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function freezeClone(value) {
  return deepFreeze(cloneValue(value));
}

function cloneValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return value;
}

module.exports = {
  CONFIRMATION_DISPATCH_CODES,
  CONFIRMATION_DISPATCH_CONFIRMATION,
  dispatchAppointmentConfirmation,
  resolveTrustedDestination,
};
