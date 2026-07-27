const { getReadinessStatus } = require("./healthReadiness");
const { validateProductionRuntimeConfig } = require("./productionConfig");
const { resolveCalendarProviderConfig } = require("../calendar/calendarProvider");
const { resolveReminderConfig } = require("../reminders/reminderConfig");
const { resolveServerStorageConfig, STORAGE_MODES } = require("../persistence/storageConfig");
const { createSqlitePersistenceProvider } = require("../persistence/sqliteProvider");
const {
  createSqliteAppointmentReminderRepository,
} = require("../persistence/sqliteAppointmentReminderRepository");

function getOperationsStatus(options = {}) {
  const env = options.env || process.env;
  const config = validateProductionRuntimeConfig(env, {
    createDataDirectory: options.createDataDirectory !== false,
  });
  const readiness = getReadinessStatus(options);
  const calendar = resolveCalendarProviderConfig(env);
  const reminders = buildReminderOperationsProjection(env);

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
    reminders,
  });
}

function buildReminderOperationsProjection(env) {
  const config = resolveReminderConfig(env);
  const projection = {
    config: config.safeConfig,
    pendingCount: 0,
    failedCount: 0,
    ambiguousCount: 0,
    lastCycle: null,
  };
  const storage = resolveServerStorageConfig({});
  if (!storage.accepted || storage.storageMode !== STORAGE_MODES.SQLITE) {
    return Object.freeze(projection);
  }
  let provider;
  try {
    provider = createSqlitePersistenceProvider({
      databasePath: storage.databasePath,
      clinicId: storage.clinicId,
    });
    const repository = createSqliteAppointmentReminderRepository({
      persistenceProvider: provider,
    });
    const summary = repository.getSummary();
    projection.pendingCount = summary.counts.pending;
    projection.failedCount = summary.counts.failed;
    projection.ambiguousCount = summary.counts.ambiguous;
    projection.nextDueAt = summary.nextDueAt;
  } catch {
    projection.status = "unavailable";
  } finally {
    provider?.close?.();
  }
  return Object.freeze(projection);
}

module.exports = {
  getOperationsStatus,
};
