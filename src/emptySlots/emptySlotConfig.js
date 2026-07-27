const { resolveWhatsAppConfig, WHATSAPP_PROVIDER_MODES } = require("../messaging/whatsappConfig");

function resolveEmptySlotConfig(env = process.env) {
  const whatsapp = resolveWhatsAppConfig(env);
  const engineEnabled = parseBoolean(env.ORAVIA_EMPTY_SLOT_ENGINE_ENABLED, false);
  const automaticOpportunityCreationEnabled = parseBoolean(
    env.ORAVIA_EMPTY_SLOT_AUTOMATIC_OPPORTUNITY_CREATION_ENABLED,
    false
  );
  const automaticOutreachEnabled = parseBoolean(
    env.ORAVIA_EMPTY_SLOT_AUTOMATIC_OUTREACH_ENABLED,
    false
  );
  const maxCandidatesPerWave = boundedInteger(
    env.ORAVIA_EMPTY_SLOT_MAX_CANDIDATES_PER_WAVE,
    3,
    1,
    10
  );
  const maxCandidatesPerOpportunity = boundedInteger(
    env.ORAVIA_EMPTY_SLOT_MAX_CANDIDATES_PER_OPPORTUNITY,
    10,
    1,
    50
  );
  const offerValidityMinutes = boundedInteger(
    env.ORAVIA_EMPTY_SLOT_OFFER_VALIDITY_MINUTES,
    60,
    5,
    24 * 60
  );
  const outreachCooldownMinutes = boundedInteger(
    env.ORAVIA_EMPTY_SLOT_OUTREACH_COOLDOWN_MINUTES,
    24 * 60,
    1,
    30 * 24 * 60
  );
  const patientOfferWindowMinutes = boundedInteger(
    env.ORAVIA_EMPTY_SLOT_PATIENT_OFFER_WINDOW_MINUTES,
    7 * 24 * 60,
    60,
    90 * 24 * 60
  );
  const maxOffersPerPatientWindow = boundedInteger(
    env.ORAVIA_EMPTY_SLOT_MAX_OFFERS_PER_PATIENT_WINDOW,
    2,
    1,
    10
  );
  const opportunityHorizonMinutes = boundedInteger(
    env.ORAVIA_EMPTY_SLOT_OPPORTUNITY_HORIZON_MINUTES,
    14 * 24 * 60,
    30,
    90 * 24 * 60
  );
  const metaTemplateName = normalizeTemplateName(
    env.ORAVIA_WHATSAPP_EMPTY_SLOT_OFFER_TEMPLATE_NAME ||
      env.ORAVIA_EMPTY_SLOT_META_TEMPLATE_NAME
  );
  const metaTemplateLanguage = normalizeLanguage(
    env.ORAVIA_WHATSAPP_EMPTY_SLOT_OFFER_TEMPLATE_LANGUAGE ||
      env.ORAVIA_EMPTY_SLOT_META_TEMPLATE_LANGUAGE ||
      env.ORAVIA_WHATSAPP_TEMPLATE_LANGUAGE ||
      "tr"
  );
  const acceptPayload = normalizePayload(
    env.ORAVIA_EMPTY_SLOT_ACCEPT_REPLY_PAYLOAD || "EMPTY_SLOT_ACCEPT"
  );
  const declinePayload = normalizePayload(
    env.ORAVIA_EMPTY_SLOT_DECLINE_REPLY_PAYLOAD || "EMPTY_SLOT_DECLINE"
  );
  const optOutPayload = normalizePayload(
    env.ORAVIA_EMPTY_SLOT_OPT_OUT_REPLY_PAYLOAD || "EMPTY_SLOT_OPT_OUT"
  );

  const errors = [];
  if (automaticOutreachEnabled && !engineEnabled) {
    errors.push("automatic_outreach_requires_empty_slot_engine");
  }
  if (automaticOpportunityCreationEnabled && !engineEnabled) {
    errors.push("automatic_opportunity_creation_requires_empty_slot_engine");
  }
  if (
    engineEnabled &&
    automaticOutreachEnabled &&
    whatsapp.providerMode === WHATSAPP_PROVIDER_MODES.META_CLOUD &&
    (!whatsapp.configurationComplete || !metaTemplateName || !metaTemplateLanguage)
  ) {
    errors.push("incomplete_meta_empty_slot_offer_template_config");
  }

  return freezeClone({
    accepted: errors.length === 0,
    code: errors.length ? "invalid_empty_slot_config" : "empty_slot_config_ready",
    errors,
    engineEnabled,
    automaticOpportunityCreationEnabled,
    automaticOutreachEnabled,
    maxCandidatesPerWave,
    maxCandidatesPerOpportunity,
    offerValidityMinutes,
    outreachCooldownMinutes,
    patientOfferWindowMinutes,
    maxOffersPerPatientWindow,
    opportunityHorizonMinutes,
    providerMode: whatsapp.providerMode || WHATSAPP_PROVIDER_MODES.MOCK,
    metaTemplateName,
    metaTemplateLanguage,
    acceptPayload,
    declinePayload,
    optOutPayload,
    safeConfig: {
      engineEnabled,
      automaticOpportunityCreationEnabled,
      automaticOutreachEnabled,
      maxCandidatesPerWave,
      maxCandidatesPerOpportunity,
      offerValidityMinutes,
      outreachCooldownMinutes,
      patientOfferWindowMinutes,
      maxOffersPerPatientWindow,
      opportunityHorizonMinutes,
      providerMode: whatsapp.providerMode || WHATSAPP_PROVIDER_MODES.MOCK,
      metaOfferTemplateConfigured: Boolean(metaTemplateName),
      metaOfferTemplateLanguage: metaTemplateLanguage || null,
      acceptPayload,
      declinePayload,
      optOutPayload,
      configurationComplete: errors.length === 0,
      errors,
    },
  });
}

function parseBoolean(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  return ["1", "true", "yes", "on"].includes(text);
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

function normalizeTemplateName(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_:-]{1,128}$/.test(text) ? text : "";
}

function normalizeLanguage(value) {
  const text = String(value || "").trim();
  return /^[a-z]{2}([_-][A-Z]{2})?$/.test(text) ? text : "";
}

function normalizePayload(value) {
  const text = String(value || "").trim();
  return /^[A-Z0-9_:-]{3,80}$/.test(text) ? text : "";
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  resolveEmptySlotConfig,
};
