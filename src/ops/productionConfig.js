const fs = require("node:fs");
const path = require("node:path");

const { resolveServerStorageConfig, STORAGE_MODES } = require("../persistence/storageConfig");
const { resolveWhatsAppConfig, WHATSAPP_PROVIDER_MODES } = require("../messaging/whatsappConfig");

function validateProductionRuntimeConfig(env = process.env, options = {}) {
  const production = isProductionRuntime(env);
  const errors = [];
  const storage = resolveServerStorageConfig({
    storageMode: env.ORAVIA_STORAGE_MODE,
    databasePath: env.ORAVIA_SQLITE_DATABASE_PATH,
    clinicId: env.ORAVIA_CLINIC_ID,
  });
  const publicBaseUrl = normalizeHttpsUrl(env.ORAVIA_PUBLIC_BASE_URL);
  const trustedOrigin = normalizeHttpsUrl(
    env.ORAVIA_TRUSTED_ORIGIN || env.ORAVIA_PUBLIC_BASE_URL
  );
  const webhookCallbackUrl = publicBaseUrl
    ? `${publicBaseUrl.origin}/api/webhooks/whatsapp`
    : "";
  const sessionCookieSecure = parseBoolean(env.ORAVIA_SESSION_COOKIE_SECURE);
  const authRequired = parseBoolean(env.ORAVIA_AUTH_REQUIRED);
  const trustProxyHeaders = parseBoolean(env.ORAVIA_TRUST_PROXY_HEADERS);
  const sessionSecret = normalizeSecret(env.ORAVIA_SESSION_SECRET);
  const channelIdentityKey = normalizeSecret(env.ORAVIA_WHATSAPP_CHANNEL_IDENTITY_KEY);
  const whatsApp = resolveWhatsAppConfig(env);

  if (production) {
    if (!publicBaseUrl) {
      errors.push("missing_production_base_url");
    }
    if (!trustedOrigin) {
      errors.push("invalid_trusted_origin");
    }
    if (!authRequired) {
      errors.push("production_auth_required");
    }
    if (!sessionCookieSecure) {
      errors.push("insecure_production_cookie_configuration");
    }
    if (!storage.accepted || storage.storageMode !== STORAGE_MODES.SQLITE) {
      errors.push("production_requires_sqlite_storage");
    }
    if (!sessionSecret) {
      errors.push("missing_session_secret");
    }
    if (!channelIdentityKey) {
      errors.push("missing_channel_identity_key");
    }
  }

  if (storage.storageMode === STORAGE_MODES.SQLITE && storage.databasePath) {
    const dataDirectory = path.dirname(storage.databasePath);
    if (!isWritableDirectory(dataDirectory, { create: options.createDataDirectory !== false })) {
      errors.push("unavailable_sqlite_path");
    }
  }

  if (
    whatsApp.providerMode === WHATSAPP_PROVIDER_MODES.META_CLOUD &&
    !whatsApp.accepted
  ) {
    errors.push(whatsApp.code || "incomplete_meta_whatsapp_config");
  }

  const accepted = errors.length === 0;
  return Object.freeze({
    accepted,
    production,
    code: accepted ? "production_config_ready" : "production_config_invalid",
    errors: Object.freeze(Array.from(new Set(errors))),
    summary: createSafeConfigSummary({
      production,
      storage,
      publicBaseUrl,
      trustedOrigin,
      webhookCallbackUrl,
      authRequired,
      sessionCookieSecure,
      trustProxyHeaders,
      whatsApp,
      sessionSecretConfigured: Boolean(sessionSecret),
      channelIdentityKeyConfigured: Boolean(channelIdentityKey),
    }),
  });
}

function createSafeConfigSummary(input) {
  return Object.freeze({
    environment: input.production ? "production" : "development",
    publicBaseUrlConfigured: Boolean(input.publicBaseUrl),
    trustedOriginConfigured: Boolean(input.trustedOrigin),
    trustedOriginHost: input.trustedOrigin ? input.trustedOrigin.host : "",
    webhookCallbackConfigured: Boolean(input.webhookCallbackUrl),
    webhookCallbackPath: input.webhookCallbackUrl ? "/api/webhooks/whatsapp" : "",
    authRequired: input.authRequired,
    secureSessionCookies: input.sessionCookieSecure,
    trustProxyHeaders: input.trustProxyHeaders,
    storage: Object.freeze({
      mode: input.storage.storageMode || "invalid",
      sqliteConfigured: Boolean(input.storage.databasePath),
      durablePersistence: input.storage.durablePersistence === true,
      clinicIdConfigured: Boolean(input.storage.clinicId),
    }),
    secrets: Object.freeze({
      sessionSecretConfigured: input.sessionSecretConfigured,
      channelIdentityKeyConfigured: input.channelIdentityKeyConfigured,
    }),
    providers: Object.freeze({
      whatsapp: input.whatsApp.safeSummary || {
        providerMode: input.whatsApp.providerMode || "mock",
        configurationComplete: input.whatsApp.accepted === true,
      },
    }),
  });
}

function resolveTrustedOrigin(env = process.env) {
  const trusted = normalizeHttpsUrl(env.ORAVIA_TRUSTED_ORIGIN || env.ORAVIA_PUBLIC_BASE_URL);
  return trusted ? trusted.origin : "";
}

function isProductionRuntime(env = process.env) {
  return (
    String(env.NODE_ENV || "").trim() === "production" ||
    String(env.ORAVIA_RUNTIME_ENV || "").trim() === "production"
  );
}

function normalizeHttpsUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeSecret(value) {
  const text = String(value || "").trim();
  return text.length >= 24 && !text.includes("\0") ? text : "";
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function isWritableDirectory(directory, { create } = {}) {
  try {
    if (create) {
      fs.mkdirSync(directory, { recursive: true });
    }
    fs.accessSync(directory, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  isProductionRuntime,
  resolveTrustedOrigin,
  validateProductionRuntimeConfig,
};
