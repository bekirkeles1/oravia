const WHATSAPP_PROVIDER_MODES = Object.freeze({
  MOCK: "mock",
  META_CLOUD: "meta_cloud",
});

const WHATSAPP_AUTO_REPLY_MODES = Object.freeze({
  DISABLED: "disabled",
  SAFE_REPLY: "safe_reply",
});

const DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com";

function resolveWhatsAppConfig(env = process.env) {
  const providerMode = normalizeMode(
    env.ORAVIA_WHATSAPP_PROVIDER_MODE,
    WHATSAPP_PROVIDER_MODES,
    WHATSAPP_PROVIDER_MODES.MOCK
  );
  const autoReplyMode = normalizeMode(
    env.ORAVIA_WHATSAPP_AUTO_REPLY_MODE,
    WHATSAPP_AUTO_REPLY_MODES,
    WHATSAPP_AUTO_REPLY_MODES.DISABLED
  );
  const clinicId = normalizeIdentifier(
    env.ORAVIA_CLINIC_ID || "oravia_demo_clinic"
  );

  if (!providerMode || !autoReplyMode || !clinicId) {
    return reject("invalid_whatsapp_config", "WhatsApp configuration is invalid.");
  }

  const config = {
    accepted: true,
    providerMode,
    autoReplyMode,
    clinicId,
    graphApiVersion: normalizeGraphVersion(env.ORAVIA_WHATSAPP_GRAPH_API_VERSION),
    graphBaseUrl: normalizeUrl(
      env.ORAVIA_WHATSAPP_GRAPH_BASE_URL,
      DEFAULT_GRAPH_BASE_URL
    ),
    phoneNumberId: normalizeProviderId(env.ORAVIA_WHATSAPP_PHONE_NUMBER_ID),
    wabaId: normalizeProviderId(env.ORAVIA_WHATSAPP_WABA_ID),
    accessToken: normalizeSecret(env.ORAVIA_WHATSAPP_ACCESS_TOKEN),
    appSecret: normalizeSecret(env.ORAVIA_WHATSAPP_APP_SECRET),
    webhookVerifyToken: normalizeSecret(
      env.ORAVIA_WHATSAPP_WEBHOOK_VERIFY_TOKEN
    ),
    appointmentTemplateName: normalizeTemplateName(
      env.ORAVIA_WHATSAPP_APPOINTMENT_TEMPLATE_NAME
    ),
    rescheduleTemplateName: normalizeTemplateName(
      env.ORAVIA_WHATSAPP_RESCHEDULE_TEMPLATE_NAME ||
        env.ORAVIA_WHATSAPP_APPOINTMENT_RESCHEDULE_TEMPLATE_NAME
    ),
    cancellationTemplateName: normalizeTemplateName(
      env.ORAVIA_WHATSAPP_CANCELLATION_TEMPLATE_NAME ||
        env.ORAVIA_WHATSAPP_APPOINTMENT_CANCELLATION_TEMPLATE_NAME
    ),
    reminderTemplateName: normalizeTemplateName(
      env.ORAVIA_WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_NAME ||
        env.ORAVIA_REMINDER_META_TEMPLATE_NAME
    ),
    emptySlotOfferTemplateName: normalizeTemplateName(
      env.ORAVIA_WHATSAPP_EMPTY_SLOT_OFFER_TEMPLATE_NAME ||
        env.ORAVIA_EMPTY_SLOT_META_TEMPLATE_NAME
    ),
    templateLanguage: normalizeTemplateLanguage(
      env.ORAVIA_WHATSAPP_TEMPLATE_LANGUAGE || "tr"
    ),
    rescheduleTemplateLanguage: normalizeTemplateLanguage(
      env.ORAVIA_WHATSAPP_RESCHEDULE_TEMPLATE_LANGUAGE ||
        env.ORAVIA_WHATSAPP_TEMPLATE_LANGUAGE ||
        "tr"
    ),
    cancellationTemplateLanguage: normalizeTemplateLanguage(
      env.ORAVIA_WHATSAPP_CANCELLATION_TEMPLATE_LANGUAGE ||
        env.ORAVIA_WHATSAPP_TEMPLATE_LANGUAGE ||
        "tr"
    ),
    reminderTemplateLanguage: normalizeTemplateLanguage(
      env.ORAVIA_WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_LANGUAGE ||
        env.ORAVIA_REMINDER_META_TEMPLATE_LANGUAGE ||
        env.ORAVIA_WHATSAPP_TEMPLATE_LANGUAGE ||
        "tr"
    ),
    emptySlotOfferTemplateLanguage: normalizeTemplateLanguage(
      env.ORAVIA_WHATSAPP_EMPTY_SLOT_OFFER_TEMPLATE_LANGUAGE ||
        env.ORAVIA_EMPTY_SLOT_META_TEMPLATE_LANGUAGE ||
        env.ORAVIA_WHATSAPP_TEMPLATE_LANGUAGE ||
        "tr"
    ),
    channelIdentityKey: normalizeSecret(
      env.ORAVIA_WHATSAPP_CHANNEL_IDENTITY_KEY
    ),
    transportTimeoutMs: normalizePositiveInteger(
      env.ORAVIA_WHATSAPP_TRANSPORT_TIMEOUT_MS,
      8000,
      30000
    ),
  };

  if (providerMode === WHATSAPP_PROVIDER_MODES.MOCK) {
    return freezeConfig({
      ...config,
      configurationComplete: true,
      webhookVerificationReady: false,
      safeConfig: projectSafeConfig(config, true),
    });
  }

  const missing = [];

  for (const [fieldName, value] of Object.entries({
    graphApiVersion: config.graphApiVersion,
    phoneNumberId: config.phoneNumberId,
    accessToken: config.accessToken,
    appSecret: config.appSecret,
    webhookVerifyToken: config.webhookVerifyToken,
    appointmentTemplateName: config.appointmentTemplateName,
    templateLanguage: config.templateLanguage,
    channelIdentityKey: config.channelIdentityKey,
  })) {
    if (!value) {
      missing.push(fieldName);
    }
  }

  if (missing.length > 0) {
    return freezeConfig({
      ...config,
      accepted: false,
      configurationComplete: false,
      webhookVerificationReady: false,
      code: "incomplete_meta_whatsapp_config",
      reason: "Meta WhatsApp configuration is incomplete.",
      missing,
      safeConfig: projectSafeConfig(config, false, missing),
    });
  }

  return freezeConfig({
    ...config,
    configurationComplete: true,
    webhookVerificationReady: true,
    safeConfig: projectSafeConfig(config, true),
  });
}

function projectSafeConfig(config, complete, missing = []) {
  return {
    providerMode: config.providerMode,
    autoReplyMode: config.autoReplyMode,
    clinicId: config.clinicId,
    graphApiVersionConfigured: Boolean(config.graphApiVersion),
    phoneNumberIdMasked: maskIdentifier(config.phoneNumberId),
    wabaIdMasked: maskIdentifier(config.wabaId),
    appointmentTemplateConfigured: Boolean(config.appointmentTemplateName),
    rescheduleTemplateConfigured: Boolean(config.rescheduleTemplateName),
    cancellationTemplateConfigured: Boolean(config.cancellationTemplateName),
    reminderTemplateConfigured: Boolean(config.reminderTemplateName),
    emptySlotOfferTemplateConfigured: Boolean(config.emptySlotOfferTemplateName),
    templateLanguage: config.templateLanguage || null,
    configurationComplete: complete,
    webhookVerificationReady:
      config.providerMode === WHATSAPP_PROVIDER_MODES.META_CLOUD &&
      Boolean(config.webhookVerifyToken && config.appSecret && config.phoneNumberId),
    missing,
  };
}

function normalizeMode(value, modes, fallback) {
  const normalized = String(value || fallback || "").trim().toLowerCase();
  return Object.values(modes).includes(normalized) ? normalized : "";
}

function normalizeGraphVersion(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^v\d+\.\d+$/.test(normalized) ? normalized : "";
}

function normalizeProviderId(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9_:-]{3,128}$/.test(normalized) ? normalized : "";
}

function normalizeIdentifier(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function normalizeSecret(value) {
  const secret = String(value || "").trim();
  return secret.length >= 8 && secret.length <= 4096 ? secret : "";
}

function normalizeTemplateName(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9_:-]{1,128}$/.test(normalized) ? normalized : "";
}

function normalizeTemplateLanguage(value) {
  const normalized = String(value || "").trim();
  return /^[a-z]{2}([_-][A-Z]{2})?$/.test(normalized) ? normalized : "";
}

function normalizeUrl(value, fallback) {
  const raw = String(value || fallback || "").trim();

  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.hostname === "127.0.0.1"
      ? url.origin
      : "";
  } catch {
    return "";
  }
}

function normalizePositiveInteger(value, fallback, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max) {
    return parsed;
  }
  return fallback;
}

function maskIdentifier(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  return text.length <= 4 ? "***" : `***${text.slice(-4)}`;
}

function reject(code, reason) {
  return freezeConfig({
    accepted: false,
    code,
    reason,
    configurationComplete: false,
    webhookVerificationReady: false,
    safeConfig: {
      providerMode: WHATSAPP_PROVIDER_MODES.MOCK,
      configurationComplete: false,
      webhookVerificationReady: false,
    },
  });
}

function freezeConfig(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  WHATSAPP_AUTO_REPLY_MODES,
  WHATSAPP_PROVIDER_MODES,
  resolveWhatsAppConfig,
};
