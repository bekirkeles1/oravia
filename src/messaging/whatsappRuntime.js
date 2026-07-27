const {
  createSqlitePersistenceProvider,
} = require("../persistence/sqliteProvider");
const {
  STORAGE_MODES,
  resolveServerStorageConfig,
} = require("../persistence/storageConfig");
const {
  createSqliteConversationStateStore,
} = require("../persistence/sqliteConversationStateStore");
const {
  createInMemoryConversationStateStore,
} = require("./conversationStateStore");
const {
  createSqliteMessagingLifecycleRepository,
} = require("../persistence/sqliteMessagingLifecycleRepository");
const {
  createChannelIdentityCrypto,
} = require("./whatsappChannelIdentityCrypto");
const {
  createFetchWhatsAppGraphTransport,
} = require("./whatsappGraphTransport");
const {
  createMetaWhatsAppOutboundProvider,
} = require("./metaWhatsAppOutboundProvider");
const {
  createWhatsAppWebhookService,
} = require("./whatsappWebhookService");
const {
  createAppointmentReviewActiveRouteRuntimeCompositionRoot,
} = require("../secretary/appointmentReviewRouteRuntimeCompositionRoot");
const { handleMessagingInbound } = require("../api/messagingInboundHandler");
const {
  resolveWhatsAppConfig,
  WHATSAPP_PROVIDER_MODES,
} = require("./whatsappConfig");

function createWhatsAppRuntime(options = {}) {
  const config = options.config || resolveWhatsAppConfig(options.env);
  const storageConfig = resolveServerStorageConfig(options);
  let persistenceProvider = null;

  if (
    config.providerMode === WHATSAPP_PROVIDER_MODES.META_CLOUD &&
    !config.configurationComplete
  ) {
    return createClosedRuntime({ config, code: config.code });
  }

  if (!storageConfig.accepted) {
    return createClosedRuntime({ config, code: storageConfig.code });
  }

  if (
    config.providerMode === WHATSAPP_PROVIDER_MODES.META_CLOUD &&
    storageConfig.storageMode !== STORAGE_MODES.SQLITE
  ) {
    return createClosedRuntime({
      config,
      code: "meta_whatsapp_requires_sqlite_storage",
    });
  }

  if (storageConfig.storageMode === STORAGE_MODES.SQLITE) {
    persistenceProvider = createSqlitePersistenceProvider({
      databasePath: storageConfig.databasePath,
      clinicId: storageConfig.clinicId,
    });
  }

  const lifecycleRepository =
    options.lifecycleRepository ||
    (persistenceProvider
      ? createSqliteMessagingLifecycleRepository({ persistenceProvider })
      : null);
  const conversationStateStore = persistenceProvider
    ? createSqliteConversationStateStore({ persistenceProvider })
    : createInMemoryConversationStateStore();
  const identityCrypto =
    options.identityCrypto ||
    (config.channelIdentityKey
      ? createChannelIdentityCrypto({ masterKey: config.channelIdentityKey })
      : null);
  const transport =
    options.transport ||
    globalThis.__ORAVIA_WHATSAPP_TEST_TRANSPORT__ ||
    createFetchWhatsAppGraphTransport({
      timeoutMs: config.transportTimeoutMs,
    });
  const outboundProvider =
    options.outboundProvider ||
    createMetaWhatsAppOutboundProvider({
      config,
      transport,
      identityCrypto,
      lifecycleRepository,
    });
  const messagingRuntime = {
    handleMessagingInbound(payload) {
      return handleMessagingInbound(payload, { conversationStateStore });
    },
  };
  const emptySlotRuntimeRoot =
    options.emptySlotRuntimeRoot ||
    (storageConfig.storageMode === STORAGE_MODES.SQLITE
      ? createAppointmentReviewActiveRouteRuntimeCompositionRoot(options)
      : null);

  return Object.freeze({
    accepted: true,
    config,
    lifecycleRepository,
    outboundProvider,
    service: createWhatsAppWebhookService({
      config,
      identityCrypto,
      lifecycleRepository,
      messagingRuntime,
      outboundProvider,
      emptySlotResponseHandler: emptySlotRuntimeRoot
        ? (input) =>
            emptySlotRuntimeRoot
              .getRouteRuntimeAdapter()
              .respondToEmptySlotOffer(input)
        : null,
    }),
    getSafeIntegrationStatus() {
      return {
        accepted: true,
        ...config.safeConfig,
        latest: lifecycleRepository?.getLatestSummary?.() || null,
      };
    },
    close() {
      persistenceProvider?.close();
      emptySlotRuntimeRoot?.close?.();
    },
  });
}

function createClosedRuntime({ config, code }) {
  return Object.freeze({
    accepted: false,
    config,
    code,
    getSafeIntegrationStatus() {
      return {
        accepted: false,
        code,
        ...(config?.safeConfig || {}),
      };
    },
    close() {},
  });
}

module.exports = {
  createWhatsAppRuntime,
};
