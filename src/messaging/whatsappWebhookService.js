const crypto = require("node:crypto");

const {
  WHATSAPP_AUTO_REPLY_MODES,
} = require("./whatsappConfig");
const {
  parseWhatsAppWebhookPayload,
} = require("./whatsappWebhookParser");

function createWhatsAppWebhookService({
  config,
  identityCrypto,
  lifecycleRepository,
  messagingRuntime,
  outboundProvider,
  emptySlotResponseHandler,
} = {}) {
  return Object.freeze({
    verifyChallenge({ mode, token, challenge }) {
      if (
        String(mode || "") === "subscribe" &&
        token &&
        config?.webhookVerifyToken &&
        timingSafeEqual(token, config.webhookVerifyToken) &&
        String(challenge || "")
      ) {
        return {
          accepted: true,
          challenge: String(challenge),
        };
      }

      return safeReject("invalid_whatsapp_webhook_verification", 403);
    },
    async handlePayload(payload) {
      const parsed = parseWhatsAppWebhookPayload(payload, config);

      if (!parsed.accepted) {
        return safeReject(parsed.code, 400);
      }

      const results = [];

      for (const event of parsed.events) {
        if (!event.accepted) {
          results.push({ accepted: false, code: event.code });
          continue;
        }

        if (event.eventKind === "message") {
          results.push(await handleMessageEvent(event));
        } else if (event.eventKind === "status") {
          results.push(handleStatusEvent(event));
        }
      }

      return {
        accepted: true,
        status: 200,
        body: {
          accepted: true,
          processed: results.length,
          results: results.map(safeProjectResult),
        },
      };
    },
  });

  async function handleMessageEvent(event) {
    const encrypted = identityCrypto.encryptIdentity({
      clinicId: config.clinicId,
      provider: "meta_cloud",
      businessPhoneNumberId: event.businessPhoneNumberId,
      rawIdentity: event.sender,
    });

    if (!encrypted.accepted) {
      return { accepted: false, code: encrypted.code };
    }

    lifecycleRepository.upsertChannelIdentity({
      provider: "meta_cloud",
      businessPhoneNumberId: event.businessPhoneNumberId,
      lookupHash: encrypted.lookupHash,
      encryptedIdentity: encrypted.encrypted,
      maskedLabel: encrypted.maskedLabel,
    });

    const reserved = lifecycleRepository.reserveInboundEvent({
      provider: "meta_cloud",
      providerEventId: event.providerEventId,
      businessPhoneNumberId: event.businessPhoneNumberId,
      senderLookupHash: encrypted.lookupHash,
      messageType: event.messageType,
      conversationReference: event.conversationReference,
      eventFingerprint: event.eventFingerprint,
    });

    if (reserved.duplicate) {
      return {
        accepted: true,
        duplicate: true,
        code: "duplicate_inbound_event",
        replyDispatched: false,
      };
    }

    if (!reserved.accepted) {
      return reserved;
    }

    if (!event.supported) {
      return completeInbound(event, {
        processingStatus: "unsupported",
        code: "unsupported_whatsapp_message_type",
      });
    }

    if (event.emptySlotResponse && emptySlotResponseHandler) {
      const response = await emptySlotResponseHandler({
        ...event.emptySlotResponse,
        senderLookupHash: encrypted.lookupHash,
      });
      return completeInbound(event, {
        processingStatus: "processed",
        code: response?.code || "empty_slot_response_processed",
        emptySlotResponseProcessed: response?.accepted === true,
        replyDispatched: false,
      });
    }

    const inboundResult = messagingRuntime.handleMessagingInbound({
      channel: "whatsapp",
      from: encrypted.maskedLabel,
      message: event.text,
      timestamp: event.timestamp,
    });
    let replyDispatched = false;

    if (
      config.autoReplyMode === WHATSAPP_AUTO_REPLY_MODES.SAFE_REPLY &&
      inboundResult?.body?.reply_draft
    ) {
      const reply = await outboundProvider.sendConversationReply({
        conversationReference: event.conversationReference,
        destination: {
          lookupHash: encrypted.lookupHash,
          encryptedIdentity: encrypted.encrypted,
          maskedLabel: encrypted.maskedLabel,
        },
        message: {
          text: inboundResult.body.reply_draft,
        },
      });
      replyDispatched = reply?.accepted === true;
    }

    return completeInbound(event, {
      processingStatus: "processed",
      code: "whatsapp_text_processed",
      intent: inboundResult?.body?.intent,
      replyDispatched,
    });
  }

  function completeInbound(event, safeResult) {
    lifecycleRepository.completeInboundEvent({
      provider: "meta_cloud",
      providerEventId: event.providerEventId,
      safeResult,
    });

    return {
      accepted: true,
      ...safeResult,
    };
  }

  function handleStatusEvent(event) {
    return lifecycleRepository.applyStatusEvent({
      provider: "meta_cloud",
      providerMessageId: event.providerMessageId,
      providerStatus: event.providerStatus,
      eventFingerprint: event.eventFingerprint,
      safeFailure: event.safeFailure,
    });
  }
}

function safeProjectResult(result) {
  return {
    accepted: result?.accepted === true,
    code: result?.code || null,
    duplicate: result?.duplicate === true,
    replyDispatched: result?.replyDispatched === true,
    providerStatus: result?.providerStatus || null,
  };
}

function timingSafeEqual(first, second) {
  const left = Buffer.from(String(first || ""));
  const right = Buffer.from(String(second || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function safeReject(code, status = 400) {
  return {
    accepted: false,
    status,
    body: {
      accepted: false,
      code,
      reason: "WhatsApp webhook request was rejected safely.",
    },
  };
}

module.exports = {
  createWhatsAppWebhookService,
};
