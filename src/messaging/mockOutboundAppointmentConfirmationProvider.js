function createMockOutboundAppointmentConfirmationProvider() {
  const calls = [];

  return Object.freeze({
    name: "mock_outbound",
    sendAppointmentConfirmation(command) {
      const result = createMockAppointmentConfirmationResult(command);
      calls.push(freezeClone(command));
      return result;
    },
    sendAppointmentRescheduleNotification(command) {
      const result = createMockAppointmentChangeNotificationResult(
        command,
        "reschedule"
      );
      calls.push(freezeClone(command));
      return result;
    },
    sendAppointmentCancellationNotification(command) {
      const result = createMockAppointmentChangeNotificationResult(
        command,
        "cancellation"
      );
      calls.push(freezeClone(command));
      return result;
    },
    sendAppointmentReminder(command) {
      const result = createMockAppointmentReminderResult(command);
      calls.push(freezeClone(command));
      return result;
    },
    getCallCount() {
      return calls.length;
    },
    getCalls() {
      return calls.map((call) => freezeClone(call));
    },
  });
}

function createMockAppointmentReminderResult(command) {
  const operationReference = normalizeText(command?.operationReference);
  const appointmentId = normalizeText(command?.appointment?.id || command?.appointmentId);

  if (!operationReference || !appointmentId) {
    return freezeClone({
      accepted: false,
      code: "invalid_mock_reminder_command",
      reason: "Mock appointment reminder command is incomplete.",
      provider: "mock_outbound",
      providerDispatchAccepted: false,
      realPatientDelivery: false,
    });
  }

  return freezeClone({
    accepted: true,
    provider: "mock_outbound",
    providerMessageId: `mock_reminder_${operationReference}`,
    providerDispatchAccepted: true,
    realPatientDelivery: false,
    providerLifecycleStatus: "accepted",
    safeNotice:
      "Mock provider accepted the appointment reminder; no real patient message was delivered.",
  });
}

function createMockAppointmentChangeNotificationResult(command, kind) {
  const operationReference = normalizeText(command?.operationReference);
  const appointmentId = normalizeText(command?.appointment?.id);

  if (!operationReference || !appointmentId) {
    return freezeClone({
      accepted: false,
      code: "invalid_mock_change_notification_command",
      reason: "Mock appointment change notification command is incomplete.",
      provider: "mock_outbound",
      providerDispatchAccepted: false,
      realPatientDelivery: false,
    });
  }

  return freezeClone({
    accepted: true,
    provider: "mock_outbound",
    providerMessageId: `mock_${kind}_notification_${operationReference}`,
    providerDispatchAccepted: true,
    realPatientDelivery: false,
    providerLifecycleStatus: "accepted",
  });
}

function createMockAppointmentConfirmationResult(command) {
  const operationReference = normalizeText(command?.operationReference);
  const appointmentId = normalizeText(command?.appointmentId);

  if (!operationReference || !appointmentId) {
    return freezeClone({
      accepted: false,
      code: "invalid_mock_confirmation_command",
      reason: "Mock confirmation command is incomplete.",
      provider: "mock_outbound",
      providerDispatchAccepted: false,
      realPatientDelivery: false,
    });
  }

  return freezeClone({
    accepted: true,
    provider: "mock_outbound",
    providerMessageId: `mock_confirmation_message_${operationReference}`,
    providerDispatchAccepted: true,
    realPatientDelivery: false,
  });
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
  createMockOutboundAppointmentConfirmationProvider,
};
