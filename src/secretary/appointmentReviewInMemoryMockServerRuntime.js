const {
  createInMemoryAppointmentReviewQueue,
} = require("./appointmentReviewQueue");
const {
  createInMemoryAppointmentReviewRepository,
} = require("./appointmentReviewRepository");
const {
  createInMemoryAppointmentReviewExecutionIdempotencyStore,
} = require("./appointmentReviewExecutionIdempotencyStore");
const {
  createInMemoryAppointmentReviewAppointmentRepository,
} = require("./appointmentReviewAppointmentRepository");
const {
  handleMessagingInbound,
} = require("../api/messagingInboundHandler");
const {
  createInMemoryConversationStateStore,
} = require("../messaging/conversationStateStore");
const {
  getCalendarProvider,
} = require("../calendar/calendarProvider");
const {
  createMockOutboundAppointmentConfirmationProvider,
} = require("../messaging/mockOutboundAppointmentConfirmationProvider");
const {
  createChannelIdentityCrypto,
} = require("../messaging/whatsappChannelIdentityCrypto");
const {
  resolveWhatsAppConfig,
  WHATSAPP_PROVIDER_MODES,
} = require("../messaging/whatsappConfig");
const {
  createFetchWhatsAppGraphTransport,
} = require("../messaging/whatsappGraphTransport");
const {
  createMetaWhatsAppOutboundProvider,
} = require("../messaging/metaWhatsAppOutboundProvider");
const {
  createSqliteMessagingLifecycleRepository,
} = require("../persistence/sqliteMessagingLifecycleRepository");
const {
  createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider,
} = require("./appointmentReviewInMemoryMockControlledActionRuntimeDependencyProvider");
const {
  applyAppointmentReviewDecision,
} = require("../api/secretaryAppointmentReviewDecisionExecutionService");
const {
  createAppointmentFromApprovedReview,
} = require("../api/secretaryAppointmentReviewAppointmentCreationService");
const {
  syncAppointmentToCalendar,
} = require("../api/secretaryAppointmentCalendarSyncService");
const {
  dispatchAppointmentConfirmation,
} = require("../api/secretaryAppointmentConfirmationDispatchService");
const {
  applyAppointmentCancellation,
  applyAppointmentReschedule,
  createAppointmentCancellationPreview,
  createAppointmentReschedulePreview,
  dispatchAppointmentChangeNotification,
  syncAppointmentChangeToCalendar,
} = require("../api/secretaryAppointmentChangeLifecycleService");
const {
  STORAGE_MODES,
  resolveServerStorageConfig,
} = require("../persistence/storageConfig");
const {
  createSqlitePersistenceProvider,
} = require("../persistence/sqliteProvider");
const {
  createSqliteConversationStateStore,
} = require("../persistence/sqliteConversationStateStore");
const {
  createSqliteOperationIdempotencyStore,
} = require("../persistence/sqliteIdempotencyStore");
const {
  createSqliteAppointmentReviewRepository,
} = require("../persistence/sqliteAppointmentReviewRepository");
const {
  createSqliteAppointmentReviewAppointmentRepository,
} = require("../persistence/sqliteAppointmentRepository");
const {
  createInMemoryAppointmentReminderRepository,
} = require("../reminders/appointmentReminderRepository");
const {
  cancelObsoleteAppointmentReminderJobs,
  reconcileAppointmentReminders,
  reconcileOneAppointmentReminders,
  retryFailedReminderJob,
  runAppointmentReminderCycle,
} = require("../reminders/appointmentReminderService");
const { resolveReminderConfig } = require("../reminders/reminderConfig");
const {
  createSqliteAppointmentReminderRepository,
} = require("../persistence/sqliteAppointmentReminderRepository");

const RUNTIME_TYPE = "appointment_review_server_runtime_v1";
const SCHEMA_VERSION = 1;
const RUNTIME_MODE = "in_memory_mock_validation_only";
const RUNTIME_SOURCE = "server_composition_root";
const NOT_PERSISTED = "not_persisted";

function createInMemoryMockAppointmentReviewServerRuntime(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw createRuntimeError(
      "invalid_factory_options",
      "Appointment review server runtime options must be an object."
    );
  }

  if (typeof options.resolveControlledActionState !== "function") {
    throw createRuntimeError(
      "missing_controlled_action_state_projection",
      "resolveControlledActionState dependency must be a function."
    );
  }

  const storageConfig = resolveServerStorageConfig(options);

  if (!storageConfig.accepted) {
    throw createRuntimeError(storageConfig.code, storageConfig.reason);
  }

  const sqlitePersistenceProvider =
    storageConfig.storageMode === STORAGE_MODES.SQLITE
      ? createSqlitePersistenceProvider({
          databasePath: storageConfig.databasePath,
          clinicId: storageConfig.clinicId,
        })
      : null;
  const repository = sqlitePersistenceProvider
    ? createSqliteAppointmentReviewRepository({
        persistenceProvider: sqlitePersistenceProvider,
      })
    : createInMemoryAppointmentReviewRepository({
        initialReviews: Array.isArray(options.initialReviews)
          ? options.initialReviews
          : [],
      });

  if (sqlitePersistenceProvider && Array.isArray(options.initialReviews)) {
    for (const review of options.initialReviews) {
      repository.add(review);
    }
  }

  const appointmentReviewQueue = createPublicAppointmentReviewQueue(
    createInMemoryAppointmentReviewQueue({ repository })
  );
  const controlledActionRuntimeDependencyProvider =
    createInMemoryMockAppointmentReviewControlledActionRuntimeDependencyProvider({
      repository,
      resolveControlledActionState: options.resolveControlledActionState,
    });
  const executionIdempotencyStore = createIdempotencyStore({
    sqlitePersistenceProvider,
    operationKind: "review_decision_execution",
  });
  const appointmentCreationIdempotencyStore = createIdempotencyStore({
    sqlitePersistenceProvider,
    operationKind: "appointment_creation",
  });
  const calendarSyncIdempotencyStore = createIdempotencyStore({
    sqlitePersistenceProvider,
    operationKind: "calendar_sync",
  });
  const confirmationDispatchIdempotencyStore = createIdempotencyStore({
    sqlitePersistenceProvider,
    operationKind: "confirmation_dispatch",
  });
  const appointmentRescheduleIdempotencyStore = createIdempotencyStore({
    sqlitePersistenceProvider,
    operationKind: "appointment_reschedule",
  });
  const appointmentCancellationIdempotencyStore = createIdempotencyStore({
    sqlitePersistenceProvider,
    operationKind: "appointment_cancellation",
  });
  const calendarRescheduleIdempotencyStore = createIdempotencyStore({
    sqlitePersistenceProvider,
    operationKind: "calendar_reschedule_sync",
  });
  const calendarCancellationIdempotencyStore = createIdempotencyStore({
    sqlitePersistenceProvider,
    operationKind: "calendar_cancellation_sync",
  });
  const rescheduleNotificationIdempotencyStore = createIdempotencyStore({
    sqlitePersistenceProvider,
    operationKind: "reschedule_notification_dispatch",
  });
  const cancellationNotificationIdempotencyStore = createIdempotencyStore({
    sqlitePersistenceProvider,
    operationKind: "cancellation_notification_dispatch",
  });
  const reminderDispatchIdempotencyStore = createIdempotencyStore({
    sqlitePersistenceProvider,
    operationKind: "appointment_reminder_dispatch",
  });
  const conversationStateStore = sqlitePersistenceProvider
    ? createSqliteConversationStateStore({
        persistenceProvider: sqlitePersistenceProvider,
      })
    : createInMemoryConversationStateStore();
  const appointmentRepository = sqlitePersistenceProvider
    ? createSqliteAppointmentReviewAppointmentRepository({
        persistenceProvider: sqlitePersistenceProvider,
      })
    : createInMemoryAppointmentReviewAppointmentRepository();
  const reminderConfig = resolveReminderConfig(options.env);
  const reminderRepository = sqlitePersistenceProvider
    ? createSqliteAppointmentReminderRepository({
        persistenceProvider: sqlitePersistenceProvider,
      })
    : createInMemoryAppointmentReminderRepository({
        clinicId: storageConfig.clinicId,
      });
  const calendarProvider =
    options.calendarProvider ||
    (typeof options.createCalendarProvider === "function"
      ? options.createCalendarProvider()
      : getCalendarProvider(options.calendarProviderName));
  const lifecycleRepository = sqlitePersistenceProvider
    ? createSqliteMessagingLifecycleRepository({
        persistenceProvider: sqlitePersistenceProvider,
      })
    : null;
  const outboundMessagingProvider =
    options.outboundMessagingProvider ||
    (typeof options.createOutboundMessagingProvider === "function"
      ? options.createOutboundMessagingProvider()
      : createDefaultOutboundMessagingProvider({
          sqlitePersistenceProvider,
          lifecycleRepository,
          transport: options.whatsappTransport,
        }));

  const runtime = {
    runtimeType: RUNTIME_TYPE,
    schemaVersion: SCHEMA_VERSION,
    runtimeMode: RUNTIME_MODE,
    runtimeSource: RUNTIME_SOURCE,
    mock: true,
    inMemory: true,
    validationOnly: true,
    controlledHandlingOnly: true,
    persistence: NOT_PERSISTED,
    databasePersisted: sqlitePersistenceProvider ? true : false,
    executionEnabled: false,
    executorAvailable: false,
    executionAvailable: false,
    getAppointmentReviewQueue() {
      return appointmentReviewQueue;
    },
    getControlledActionRuntimeDependencyProvider() {
      return controlledActionRuntimeDependencyProvider;
    },
    getControlledActionDependencies() {
      return controlledActionRuntimeDependencyProvider.getControlledActionDependencies();
    },
    applyAppointmentReviewDecision(input) {
      return runMaybeTransaction(sqlitePersistenceProvider, () =>
        applyAppointmentReviewDecision({
          ...input,
          dependencies:
            controlledActionRuntimeDependencyProvider.getControlledActionDependencies(),
          idempotencyStore: executionIdempotencyStore,
          applyReviewControlledActionStateTransition:
            repository.applyReviewControlledActionStateTransition,
        })
      );
    },
    createAppointmentFromApprovedReview(input) {
      return runMaybeTransaction(sqlitePersistenceProvider, () =>
        Promise.resolve(createAppointmentFromApprovedReview({
          ...input,
          resolveReviewSnapshot(reviewId) {
            return repository.getVersionedSnapshotById(reviewId);
          },
          appointmentRepository,
          idempotencyStore: appointmentCreationIdempotencyStore,
          previewReviewAppointmentCreationLink:
            repository.previewReviewAppointmentCreationLink,
          applyReviewAppointmentCreationLink:
            repository.applyReviewAppointmentCreationLink,
        })).then((result) => {
          if (result?.accepted && result.appointment) {
            const reminders = reconcileOneAppointmentReminders({
              appointment: result.appointment,
              reminderRepository,
              reminderConfig,
            });
            return { ...result, reminderReconciliation: reminders };
          }
          return result;
        })
      );
    },
    listCreatedAppointments() {
      return appointmentRepository.listAppointments();
    },
    syncAppointmentToCalendar(input) {
      return runMaybeTransaction(sqlitePersistenceProvider, () =>
        syncAppointmentToCalendar({
          ...input,
          appointmentRepository,
          calendarProvider,
          idempotencyStore: calendarSyncIdempotencyStore,
        })
      );
    },
    dispatchAppointmentConfirmation(input) {
      return runMaybeTransaction(sqlitePersistenceProvider, () =>
        dispatchAppointmentConfirmation({
          ...input,
          appointmentRepository,
          outboundMessagingProvider,
          idempotencyStore: confirmationDispatchIdempotencyStore,
        })
      );
    },
    createAppointmentReschedulePreview(input) {
      return createAppointmentReschedulePreview({
        ...input,
        appointmentRepository,
      });
    },
    applyAppointmentReschedule(input) {
      return runMaybeTransaction(sqlitePersistenceProvider, () =>
        Promise.resolve(applyAppointmentReschedule({
          ...input,
          appointmentRepository,
          idempotencyStore: appointmentRescheduleIdempotencyStore,
        })).then((result) => {
          if (result?.accepted && result.appointment) {
            const cancelled = cancelObsoleteAppointmentReminderJobs({
              reminderRepository,
              appointmentId: result.appointmentId,
              appointmentVersion: result.previousAppointmentVersion,
              reason: "appointment_rescheduled",
            });
            const reminders = reconcileOneAppointmentReminders({
              appointment: result.appointment,
              reminderRepository,
              reminderConfig,
            });
            return {
              ...result,
              reminderCancellation: cancelled,
              reminderReconciliation: reminders,
            };
          }
          return result;
        })
      );
    },
    createAppointmentCancellationPreview(input) {
      return createAppointmentCancellationPreview({
        ...input,
        appointmentRepository,
      });
    },
    applyAppointmentCancellation(input) {
      return runMaybeTransaction(sqlitePersistenceProvider, () =>
        Promise.resolve(applyAppointmentCancellation({
          ...input,
          appointmentRepository,
          idempotencyStore: appointmentCancellationIdempotencyStore,
        })).then((result) => {
          if (result?.accepted) {
            const cancelled = cancelObsoleteAppointmentReminderJobs({
              reminderRepository,
              appointmentId: result.appointmentId,
              appointmentVersion: result.previousAppointmentVersion,
              reason: "appointment_cancelled",
            });
            return { ...result, reminderCancellation: cancelled };
          }
          return result;
        })
      );
    },
    listAppointmentLifecycleEvents(input) {
      return appointmentRepository.listLifecycleEvents(input?.appointmentId);
    },
    syncAppointmentChangeToCalendar(input) {
      const operationName = String(input?.operationName || "").trim();
      return runMaybeTransaction(sqlitePersistenceProvider, () =>
        syncAppointmentChangeToCalendar({
          ...input,
          appointmentRepository,
          provider: calendarProvider,
          idempotencyStore:
            operationName === "cancellation"
              ? calendarCancellationIdempotencyStore
              : calendarRescheduleIdempotencyStore,
        })
      );
    },
    dispatchAppointmentChangeNotification(input) {
      const operationName = String(input?.operationName || "").trim();
      return runMaybeTransaction(sqlitePersistenceProvider, () =>
        dispatchAppointmentChangeNotification({
          ...input,
          appointmentRepository,
          provider: outboundMessagingProvider,
          idempotencyStore:
            operationName === "cancellation"
              ? cancellationNotificationIdempotencyStore
              : rescheduleNotificationIdempotencyStore,
        })
      );
    },
    getReminderState(input = {}) {
      return {
        accepted: true,
        config: reminderConfig.safeConfig,
        summary: reminderRepository.getSummary(),
        jobs: reminderRepository.listOperationalJobs({
          limit: input.limit,
          status: input.status,
        }),
      };
    },
    listAppointmentReminderHistory(input = {}) {
      return {
        accepted: true,
        appointmentId: String(input.appointmentId || "").trim(),
        jobs: reminderRepository.listJobsForAppointment(
          String(input.appointmentId || "").trim()
        ),
      };
    },
    reconcileAppointmentReminders(input = {}) {
      return runMaybeTransaction(sqlitePersistenceProvider, () =>
        reconcileAppointmentReminders({
          appointmentRepository,
          reminderRepository,
          reminderConfig,
          now: input.now || new Date(),
        })
      );
    },
    runAppointmentReminderCycle(input = {}) {
      return runAppointmentReminderCycle({
        appointmentRepository,
        reminderRepository,
        reminderConfig,
        outboundMessagingProvider,
        idempotencyStore: reminderDispatchIdempotencyStore,
        now: input.now || new Date(),
        manualDispatch: input.manualDispatch === true,
      });
    },
    retryFailedReminder(input = {}) {
      return retryFailedReminderJob({
        reminderRepository,
        reminderJobId: input.reminderJobId,
      });
    },
  };

  Object.defineProperties(runtime, {
    storageMode: {
      enumerable: false,
      value: storageConfig.storageMode,
    },
    clinicId: {
      enumerable: false,
      value: storageConfig.clinicId,
    },
    durablePersistence: {
      enumerable: false,
      value: sqlitePersistenceProvider ? true : false,
    },
    handleMessagingInbound: {
      enumerable: false,
      value(payload) {
        const result = handleMessagingInbound(payload, {
          conversationStateStore,
        });

        if (result?.body?.appointmentSelectionReview) {
          appointmentReviewQueue.addAppointmentReview(
            result.body.appointmentSelectionReview,
            {
              conversationKey: `${result.body.channel}:${result.body.from}`,
            }
          );
        }

        return result;
      },
    },
    close: {
      enumerable: false,
      value() {
        if (sqlitePersistenceProvider) {
          sqlitePersistenceProvider.close();
        }
      },
    },
  });

  return Object.freeze(runtime);
}

function createDefaultOutboundMessagingProvider({
  sqlitePersistenceProvider,
  lifecycleRepository,
  transport,
}) {
  const config = resolveWhatsAppConfig();

  if (config.providerMode !== WHATSAPP_PROVIDER_MODES.META_CLOUD) {
    return createMockOutboundAppointmentConfirmationProvider();
  }

  if (!config.configurationComplete || !sqlitePersistenceProvider) {
    return Object.freeze({
      name: "meta_cloud",
    sendAppointmentConfirmation() {
      return {
          accepted: false,
          code: config.code || "meta_whatsapp_provider_unavailable",
          reason: "Meta WhatsApp provider configuration is incomplete.",
          provider: "meta_cloud",
          providerDispatchAccepted: false,
          realPatientDelivery: false,
        };
      },
      sendAppointmentRescheduleNotification() {
        return {
          accepted: false,
          code: config.code || "meta_whatsapp_provider_unavailable",
          reason: "Meta WhatsApp provider configuration is incomplete.",
          provider: "meta_cloud",
          providerDispatchAccepted: false,
          realPatientDelivery: false,
        };
      },
    sendAppointmentCancellationNotification() {
        return {
          accepted: false,
          code: config.code || "meta_whatsapp_provider_unavailable",
          reason: "Meta WhatsApp provider configuration is incomplete.",
          provider: "meta_cloud",
          providerDispatchAccepted: false,
          realPatientDelivery: false,
        };
      },
      sendAppointmentReminder() {
        return {
          accepted: false,
          code: config.code || "meta_whatsapp_provider_unavailable",
          reason: "Meta WhatsApp reminder provider configuration is incomplete.",
          provider: "meta_cloud",
          providerDispatchAccepted: false,
          realPatientDelivery: false,
        };
      },
    });
  }

  return createMetaWhatsAppOutboundProvider({
    config,
    transport:
      transport ||
      createFetchWhatsAppGraphTransport({
        timeoutMs: config.transportTimeoutMs,
      }),
    identityCrypto: createChannelIdentityCrypto({
      masterKey: config.channelIdentityKey,
    }),
    lifecycleRepository,
  });
}

function createIdempotencyStore({ sqlitePersistenceProvider, operationKind }) {
  return sqlitePersistenceProvider
    ? createSqliteOperationIdempotencyStore({
        persistenceProvider: sqlitePersistenceProvider,
        operationKind,
      })
    : createInMemoryAppointmentReviewExecutionIdempotencyStore();
}

async function runMaybeTransaction(sqlitePersistenceProvider, work) {
  if (!sqlitePersistenceProvider) {
    return work();
  }

  return sqlitePersistenceProvider.withTransactionAsync(work);
}

function createPublicAppointmentReviewQueue(queue) {
  return Object.freeze({
    addAppointmentReview(appointmentSelectionReview, metadata) {
      return queue.addAppointmentReview(appointmentSelectionReview, metadata);
    },
    listAppointmentReviews() {
      return queue.listAppointmentReviews();
    },
    getAppointmentReviewById(reviewId) {
      return queue.getAppointmentReviewById(reviewId);
    },
  });
}

function createRuntimeError(code, reason) {
  return Object.freeze({
    code,
    reason,
  });
}

module.exports = {
  createInMemoryMockAppointmentReviewServerRuntime,
};
