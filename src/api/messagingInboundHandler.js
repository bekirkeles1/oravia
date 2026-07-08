const { classifyPatientMessage } = require("../ai/intentClassifier");
const { planMessagingReply } = require("../messaging/replyPlanner");
const { buildConversationStateKey } = require("../messaging/conversationStateStore");

const SUPPORTED_CHANNELS = new Set(["whatsapp"]);

function handleMessagingInbound(input = {}, options = {}) {
  const validation = validateInboundPayload(input);

  if (validation.error) {
    return validation.error;
  }

  const classifier = options.classifier || classifyPatientMessage;
  const replyPlanner = options.replyPlanner || planMessagingReply;
  const conversationStateStore = options.conversationStateStore || null;
  const conversationStateKey = buildConversationStateKey(validation.payload);
  const explicitAppointmentFlowState =
    options.appointmentFlowState ||
    input.appointmentFlowState ||
    input.appointment_flow_state ||
    null;
  const storedAppointmentFlowState =
    !explicitAppointmentFlowState &&
    conversationStateStore &&
    typeof conversationStateStore.getAppointmentFlowState === "function"
      ? conversationStateStore.getAppointmentFlowState(conversationStateKey)
      : null;
  const classification = classifier(validation.payload.message);
  const replyPlan = replyPlanner({
    message: validation.payload.message,
    classification,
    appointmentFlowState: explicitAppointmentFlowState || storedAppointmentFlowState,
    selected_slot_id: input.selected_slot_id || input.selectedSlotId || null
  });

  const responseBody = {
    status: "received",
    channel: validation.payload.channel,
    from: validation.payload.from,
    intent: replyPlan.intent,
    requires_handoff: replyPlan.requires_handoff,
    reply_draft: replyPlan.reply_draft
  };

  if (replyPlan.reply_source === "appointment_flow_state") {
    responseBody.appointment_selection_status =
      replyPlan.appointment_selection_status;
    responseBody.selected_slot = replyPlan.selected_slot;
  }

  if (replyPlan.appointmentFlowState) {
    responseBody.appointmentFlowState = replyPlan.appointmentFlowState;
  }

  persistAppointmentFlowState({
    conversationStateStore,
    conversationStateKey,
    replyPlan,
  });

  return ok(responseBody);
}

function persistAppointmentFlowState({
  conversationStateStore,
  conversationStateKey,
  replyPlan,
}) {
  if (!conversationStateStore || !conversationStateKey) {
    return;
  }

  if (
    replyPlan.reply_source === "appointment_flow_state" &&
    replyPlan.appointment_selection_status === "selected_slot_matched" &&
    typeof conversationStateStore.clearAppointmentFlowState === "function"
  ) {
    conversationStateStore.clearAppointmentFlowState(conversationStateKey);
    return;
  }

  if (
    replyPlan.appointmentFlowState &&
    typeof conversationStateStore.setAppointmentFlowState === "function"
  ) {
    conversationStateStore.setAppointmentFlowState(
      conversationStateKey,
      replyPlan.appointmentFlowState
    );
  }
}

function validateInboundPayload(input) {
  const payload = {
    channel: normalizeText(input.channel),
    from: normalizeText(input.from),
    message: normalizeText(input.message),
    timestamp: normalizeText(input.timestamp)
  };
  const missingFields = [];

  for (const field of ["channel", "from", "message", "timestamp"]) {
    if (!payload[field]) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return {
      error: errorResponse(400, "Missing required messaging inbound fields.", {
        missing_fields: missingFields
      })
    };
  }

  if (!SUPPORTED_CHANNELS.has(payload.channel)) {
    return {
      error: errorResponse(400, `Unsupported messaging channel "${payload.channel}".`, {
        supported_channels: Array.from(SUPPORTED_CHANNELS)
      })
    };
  }

  if (Number.isNaN(new Date(payload.timestamp).getTime())) {
    return {
      error: errorResponse(400, "timestamp must be a valid date/time string.", {
        field: "timestamp"
      })
    };
  }

  return { payload };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function ok(body) {
  return {
    status: 200,
    body
  };
}

function errorResponse(status, message, details = {}) {
  return {
    status,
    body: {
      error: message,
      ...details
    }
  };
}

module.exports = {
  handleMessagingInbound
};
