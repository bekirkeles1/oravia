const { createStructuredLogger } = require("../ops/structuredLogger");

function createAppointmentReminderScheduler({
  runtime,
  reminderConfig,
  logger = createStructuredLogger(),
} = {}) {
  let timer = null;
  let running = false;

  return Object.freeze({
    schedulerType: "appointment_reminder_single_node_scheduler_v1",
    start() {
      if (timer || !reminderConfig?.schedulerEnabled) {
        return { accepted: true, started: false };
      }
      timer = setInterval(runCycle, reminderConfig.pollingIntervalMs);
      timer.unref?.();
      logger.info("appointment_reminder_scheduler_started", {
        operation: "appointment_reminder_scheduler",
        result: "started",
        pollingIntervalMs: reminderConfig.pollingIntervalMs,
        maxJobsPerCycle: reminderConfig.maxJobsPerCycle,
      });
      return { accepted: true, started: true };
    },
    async runOnce() {
      return runCycle();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      logger.info("appointment_reminder_scheduler_stopped", {
        operation: "appointment_reminder_scheduler",
        result: "stopped",
      });
      return { accepted: true, stopped: true };
    },
  });

  async function runCycle() {
    if (running) {
      return { accepted: true, skipped: true, code: "reminder_cycle_already_running" };
    }
    running = true;
    try {
      const result = await runtime.runAppointmentReminderCycle({});
      logger.info("appointment_reminder_cycle_completed", {
        operation: "appointment_reminder_cycle",
        result: result.accepted ? "completed" : "failed",
        code: result.code,
        claimedCount: result.claimedCount || 0,
        processedCount: result.processedCount || 0,
        resultCounts: result.resultCounts || {},
      });
      const emptySlotResult = typeof runtime.runEmptySlotCycle === "function"
        ? await runtime.runEmptySlotCycle({})
        : null;
      if (emptySlotResult) {
        logger.info("empty_slot_cycle_completed", {
          operation: "empty_slot_cycle",
          result: emptySlotResult.accepted ? "completed" : "failed",
          code: emptySlotResult.code,
          expiredOffers: emptySlotResult.expired?.expiredOffers || 0,
          expiredOpportunities: emptySlotResult.expired?.expiredOpportunities || 0,
        });
      }
      return emptySlotResult
        ? { ...result, emptySlotCycle: emptySlotResult }
        : result;
    } catch {
      logger.error("appointment_reminder_cycle_failed", {
        operation: "appointment_reminder_cycle",
        result: "failed",
        code: "appointment_reminder_cycle_failed",
      });
      return { accepted: false, code: "appointment_reminder_cycle_failed" };
    } finally {
      running = false;
    }
  }
}

module.exports = {
  createAppointmentReminderScheduler,
};
