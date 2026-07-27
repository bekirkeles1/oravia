const crypto = require("node:crypto");

const {
  mapAppointmentConfirmationTemplateParameters,
} = require("./whatsappTemplateMapper");

function createMetaWhatsAppOutboundProvider({
  config,
  transport,
  identityCrypto,
  lifecycleRepository,
} = {}) {
  if (!config?.configurationComplete) {
    return createUnavailableProvider("incomplete_meta_whatsapp_config");
  }

  if (!transport || typeof transport.postJson !== "function") {
    return createUnavailableProvider("missing_whatsapp_transport");
  }

  return Object.freeze({
    name: "meta_cloud",
    async sendConversationReply(command) {
      const validation = validateReplyCommand(command);
      if (!validation.accepted) {
        return validation;
      }

      const decrypted = decryptDestination(validation.destination);
      if (!decrypted.accepted) {
        return decrypted;
      }

      return sendGraphMessage({
        operationKind: "conversation_reply",
        destination: validation.destination,
        graphBody: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: decrypted.rawIdentity,
          type: "text",
          text: {
            preview_url: false,
            body: validation.text,
          },
        },
        contentFingerprint: sha256(validation.text),
        conversationReference: validation.conversationReference,
      });
    },
    async sendAppointmentConfirmation(command) {
      const validation = validateAppointmentCommand(command);
      if (!validation.accepted) {
        return validation;
      }

      const decrypted = decryptDestination(validation.destination);
      if (!decrypted.accepted) {
        return decrypted;
      }

      const mapped = mapAppointmentConfirmationTemplateParameters({
        appointment: command.appointment,
        clinicDisplayName: command.clinicDisplayName,
        locale: config.templateLanguage,
        timeZone: command.message?.timezone || "Europe/Istanbul",
      });

      if (!mapped.accepted) {
        return mapped;
      }

      return sendGraphMessage({
        operationKind: "appointment_confirmation",
        appointmentId: validation.appointmentId,
        destination: validation.destination,
        graphBody: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: decrypted.rawIdentity,
          type: "template",
          template: {
            name: config.appointmentTemplateName,
            language: {
              code: config.templateLanguage,
            },
            components: [
              {
                type: "body",
                parameters: mapped.parameters.map((text) => ({
                  type: "text",
                  text,
                })),
              },
            ],
          },
        },
        contentFingerprint: sha256(JSON.stringify(mapped.parameters)),
      });
    },
    async sendAppointmentRescheduleNotification(command) {
      return sendAppointmentChangeTemplate({
        command,
        operationKind: "appointment_reschedule_notification",
        templateName: config.rescheduleTemplateName,
        language: config.rescheduleTemplateLanguage || config.templateLanguage,
      });
    },
    async sendAppointmentCancellationNotification(command) {
      return sendAppointmentChangeTemplate({
        command,
        operationKind: "appointment_cancellation_notification",
        templateName: config.cancellationTemplateName,
        language: config.cancellationTemplateLanguage || config.templateLanguage,
      });
    },
  });

  async function sendAppointmentChangeTemplate({
    command,
    operationKind,
    templateName,
    language,
  }) {
    const validation = validateAppointmentCommand({
      ...command,
      appointmentId: command?.appointment?.id,
    });
    if (!validation.accepted) {
      return validation;
    }

    if (!templateName || !language) {
      return safeReject("incomplete_meta_whatsapp_change_template_config");
    }

    const decrypted = decryptDestination(validation.destination);
    if (!decrypted.accepted) {
      return decrypted;
    }

    const parameters = buildChangeTemplateParameters(command.appointment);

    return sendGraphMessage({
      operationKind,
      appointmentId: validation.appointmentId,
      destination: validation.destination,
      graphBody: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: decrypted.rawIdentity,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: language,
          },
          components: [
            {
              type: "body",
              parameters: parameters.map((text) => ({
                type: "text",
                text,
              })),
            },
          ],
        },
      },
      contentFingerprint: sha256(JSON.stringify(parameters)),
    });
  }

  function decryptDestination(destination) {
    if (
      identityCrypto &&
      typeof identityCrypto.decryptIdentity === "function" &&
      destination.encryptedIdentity
    ) {
      return identityCrypto.decryptIdentity({
        clinicId: config.clinicId,
        provider: "meta_cloud",
        businessPhoneNumberId: config.phoneNumberId,
        encrypted: destination.encryptedIdentity,
      });
    }

    return safeReject("destination_decrypt_failed");
  }

  async function sendGraphMessage({
    operationKind,
    appointmentId,
    destination,
    graphBody,
    contentFingerprint,
    conversationReference,
  }) {
    const graphResult = await transport.postJson({
      url: `${config.graphBaseUrl}/${config.graphApiVersion}/${config.phoneNumberId}/messages`,
      accessToken: config.accessToken,
      body: graphBody,
    });

    if (!graphResult.accepted || graphResult.timeout) {
      return safeReject(graphResult.code || "whatsapp_graph_transport_failed", {
        timeout: graphResult.timeout === true,
      });
    }

    if (!graphResult.ok || !graphResult.parseOk) {
      return safeReject("whatsapp_graph_provider_failed", {
        status: graphResult.status,
        errorCode: normalizeMetaErrorCode(graphResult.body),
      });
    }

    const providerMessageId = normalizeProviderMessageId(
      graphResult.body?.messages?.[0]?.id
    );

    if (!providerMessageId) {
      return safeReject("malformed_whatsapp_provider_message_id");
    }

    if (lifecycleRepository) {
      const record = lifecycleRepository.recordOutboundAccepted({
        provider: "meta_cloud",
        providerMessageId,
        direction: "outbound",
        operationKind,
        appointmentId,
        conversationReference,
        contentFingerprint,
        destinationLookupHash: destination.lookupHash,
      });

      if (!record.accepted) {
        return {
          accepted: false,
          code: "whatsapp_outbound_ambiguous_local_record_failure",
          reason:
            "Provider accepted the message, but local lifecycle recording failed safely.",
          ambiguous: true,
          provider: "meta_cloud",
          providerMessageId,
          providerDispatchAccepted: true,
          realPatientDelivery: false,
        };
      }
    }

    return {
      accepted: true,
      provider: "meta_cloud",
      providerMessageId,
      providerDispatchAccepted: true,
      providerLifecycleStatus: "accepted",
      realPatientDelivery: false,
    };
  }
}

function createUnavailableProvider(code) {
  return Object.freeze({
    name: "meta_cloud",
    sendConversationReply() {
      return safeReject(code || "meta_whatsapp_provider_unavailable");
    },
    sendAppointmentConfirmation() {
      return safeReject(code || "meta_whatsapp_provider_unavailable");
    },
    sendAppointmentRescheduleNotification() {
      return safeReject(code || "meta_whatsapp_provider_unavailable");
    },
    sendAppointmentCancellationNotification() {
      return safeReject(code || "meta_whatsapp_provider_unavailable");
    },
  });
}

function buildChangeTemplateParameters(appointment) {
  return [
    "Oravia",
    normalizeText(appointment?.doctor?.name),
    normalizeText(appointment?.startAt).slice(0, 10),
    normalizeText(appointment?.startAt).slice(11, 16),
    normalizeText(appointment?.appointmentPurposeLabel),
  ].filter(Boolean);
}

function validateReplyCommand(command) {
  const text = normalizeText(command?.message?.text || command?.text);
  const destination = command?.destination || {};

  if (!text || !destination.lookupHash || !destination.maskedLabel) {
    return safeReject("invalid_whatsapp_reply_command");
  }

  return {
    accepted: true,
    text,
    destination,
    conversationReference: normalizeText(command.conversationReference),
  };
}

function validateAppointmentCommand(command) {
  const appointmentId = normalizeText(command?.appointmentId);
  const destination = command?.destination || {};

  if (!appointmentId || !destination.lookupHash || !destination.maskedLabel) {
    return safeReject("invalid_whatsapp_template_command");
  }

  return {
    accepted: true,
    appointmentId,
    destination,
  };
}

function normalizeProviderMessageId(value) {
  const id = normalizeText(value);
  return id && id.length <= 256 ? id : "";
}

function normalizeMetaErrorCode(body) {
  const code = body?.error?.code;
  return Number.isSafeInteger(code) ? code : null;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("base64url");
}

function safeReject(code, extra = {}) {
  return {
    accepted: false,
    code,
    reason: "WhatsApp provider operation failed safely.",
    provider: "meta_cloud",
    providerDispatchAccepted: false,
    realPatientDelivery: false,
    ...extra,
  };
}

module.exports = {
  createMetaWhatsAppOutboundProvider,
};
