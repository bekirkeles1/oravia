const { classifyPatientMessage } = require("../ai/intentClassifier");

const SUPPORTED_CHANNELS = new Set(["whatsapp"]);

function handleMessagingInbound(input = {}, options = {}) {
  const validation = validateInboundPayload(input);

  if (validation.error) {
    return validation.error;
  }

  const classifier = options.classifier || classifyPatientMessage;
  const classification = classifier(validation.payload.message);

  return ok({
    status: "received",
    channel: validation.payload.channel,
    from: validation.payload.from,
    intent: classification.intent,
    requires_handoff: classification.requires_handoff,
    reply_draft: buildReplyDraft(classification)
  });
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

function buildReplyDraft(classification) {
  const treatmentInterest = classification.extracted_data?.treatment_interest;

  if (
    classification.intent === "appointment_request" &&
    treatmentInterest === "implant"
  ) {
    return "İmplant randevusu için uygun saatleri kontrol ediyorum.";
  }

  return classification.reply;
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
