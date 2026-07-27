const { resolveWhatsAppConfig, WHATSAPP_PROVIDER_MODES } = require("../messaging/whatsappConfig");

const DEFAULT_OFFSETS = Object.freeze([1440, 120]);
const MAX_OFFSET_MINUTES = 60 * 24 * 30;
const MIN_POLLING_INTERVAL_MS = 10_000;
const MAX_POLLING_INTERVAL_MS = 15 * 60_000;
const DEFAULT_POLLING_INTERVAL_MS = 60_000;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 50;
const DEFAULT_BATCH_SIZE = 10;

function resolveReminderConfig(env = process.env) {
  const whatsapp = resolveWhatsAppConfig(env);
  const engineEnabled = parseBoolean(env.ORAVIA_REMINDER_ENGINE_ENABLED, false);
  const schedulerEnabled = parseBoolean(
    env.ORAVIA_REMINDER_SCHEDULER_ENABLED,
    false
  );
  const automaticDispatchEnabled = parseBoolean(
    env.ORAVIA_REMINDER_AUTOMATIC_DISPATCH_ENABLED,
    false
  );
  const offsets = normalizeOffsets(
    env.ORAVIA_REMINDER_OFFSETS_MINUTES,
    DEFAULT_OFFSETS
  );
  const pollingIntervalMs = normalizeBoundedInteger(
    env.ORAVIA_REMINDER_SCHEDULER_POLLING_INTERVAL_MS,
    DEFAULT_POLLING_INTERVAL_MS,
    MIN_POLLING_INTERVAL_MS,
    MAX_POLLING_INTERVAL_MS
  );
  const maxJobsPerCycle = normalizeBoundedInteger(
    env.ORAVIA_REMINDER_MAX_JOBS_PER_CYCLE,
    DEFAULT_BATCH_SIZE,
    MIN_BATCH_SIZE,
    MAX_BATCH_SIZE
  );
  const retryFailedJobsEnabled = parseBoolean(
    env.ORAVIA_REMINDER_FAILED_JOB_RETRY_ENABLED,
    true
  );
  const metaTemplateName = normalizeTemplateName(
    env.ORAVIA_WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_NAME ||
      env.ORAVIA_REMINDER_META_TEMPLATE_NAME
  );
  const metaTemplateLanguage = normalizeTemplateLanguage(
    env.ORAVIA_WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_LANGUAGE ||
      env.ORAVIA_REMINDER_META_TEMPLATE_LANGUAGE ||
      env.ORAVIA_WHATSAPP_TEMPLATE_LANGUAGE ||
      "tr"
  );

  const errors = [];
  if (engineEnabled && offsets.length === 0) {
    errors.push("invalid_reminder_offsets");
  }
  if (schedulerEnabled && !engineEnabled) {
    errors.push("scheduler_requires_reminder_engine");
  }
  if (automaticDispatchEnabled && !engineEnabled) {
    errors.push("automatic_dispatch_requires_reminder_engine");
  }
  if (
    engineEnabled &&
    automaticDispatchEnabled &&
    whatsapp.providerMode === WHATSAPP_PROVIDER_MODES.META_CLOUD &&
    (!whatsapp.configurationComplete || !metaTemplateName || !metaTemplateLanguage)
  ) {
    errors.push("incomplete_meta_reminder_template_config");
  }

  return freezeClone({
    accepted: errors.length === 0,
    code: errors.length ? "invalid_reminder_config" : "reminder_config_ready",
    errors,
    engineEnabled,
    schedulerEnabled,
    automaticDispatchEnabled,
    offsetsMinutes: offsets,
    pollingIntervalMs,
    maxJobsPerCycle,
    retryFailedJobsEnabled,
    providerMode: whatsapp.providerMode || WHATSAPP_PROVIDER_MODES.MOCK,
    metaTemplateName,
    metaTemplateLanguage,
    safeConfig: {
      engineEnabled,
      schedulerEnabled,
      automaticDispatchEnabled,
      offsetsMinutes: offsets,
      pollingIntervalMs,
      maxJobsPerCycle,
      retryFailedJobsEnabled,
      providerMode: whatsapp.providerMode || WHATSAPP_PROVIDER_MODES.MOCK,
      metaReminderTemplateConfigured: Boolean(metaTemplateName),
      metaReminderTemplateLanguage: metaTemplateLanguage || null,
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

function normalizeOffsets(value, fallback) {
  const raw = String(value || "").trim();
  const source = raw ? raw.split(",") : fallback;
  const seen = new Set();
  const offsets = [];
  for (const entry of source) {
    const parsed = Number.parseInt(String(entry).trim(), 10);
    if (
      Number.isSafeInteger(parsed) &&
      parsed > 0 &&
      parsed <= MAX_OFFSET_MINUTES &&
      !seen.has(parsed)
    ) {
      seen.add(parsed);
      offsets.push(parsed);
    }
  }
  return offsets.sort((a, b) => b - a);
}

function normalizeBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isSafeInteger(parsed) && parsed >= min && parsed <= max) {
    return parsed;
  }
  return fallback;
}

function normalizeTemplateName(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_:-]{1,128}$/.test(text) ? text : "";
}

function normalizeTemplateLanguage(value) {
  const text = String(value || "").trim();
  return /^[a-z]{2}([_-][A-Z]{2})?$/.test(text) ? text : "";
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  DEFAULT_OFFSETS,
  resolveReminderConfig,
};
