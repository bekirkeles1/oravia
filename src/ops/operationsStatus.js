const { getReadinessStatus } = require("./healthReadiness");
const { validateProductionRuntimeConfig } = require("./productionConfig");
const { resolveCalendarProviderConfig } = require("../calendar/calendarProvider");

function getOperationsStatus(options = {}) {
  const env = options.env || process.env;
  const config = validateProductionRuntimeConfig(env, {
    createDataDirectory: options.createDataDirectory !== false,
  });
  const readiness = getReadinessStatus(options);
  const calendar = resolveCalendarProviderConfig(env);

  return Object.freeze({
    accepted: true,
    environment: config.summary.environment,
    runtime: Object.freeze({
      configComplete: config.accepted,
      startupStatus: config.accepted ? "ready" : "blocked",
      configErrors: config.errors,
    }),
    storage: config.summary.storage,
    database: Object.freeze({
      ready: readiness.checks?.databaseReady === true,
      migrationsCurrent: readiness.checks?.migrationsCurrent === true,
      schema: readiness.schema || null,
    }),
    backup: Object.freeze({
      ready: readiness.operations?.backupReady === true,
    }),
    providers: Object.freeze({
      whatsapp: config.summary.providers.whatsapp,
      googleCalendar: Object.freeze({
        mode: calendar.provider,
        configurationComplete: calendar.accepted === true,
      }),
    }),
    publicEndpoints: Object.freeze({
      webhookCallbackConfigured: config.summary.webhookCallbackConfigured,
      webhookCallbackPath: config.summary.webhookCallbackPath,
      trustedOriginConfigured: config.summary.trustedOriginConfigured,
      trustedOriginHost: config.summary.trustedOriginHost,
    }),
    security: Object.freeze({
      authRequired: config.summary.authRequired,
      secureSessionCookies: config.summary.secureSessionCookies,
      trustProxyHeaders: config.summary.trustProxyHeaders,
    }),
  });
}

module.exports = {
  getOperationsStatus,
};
