const crypto = require("node:crypto");

const REMINDER_JOB_STATUS = Object.freeze({
  PENDING: "pending",
  CLAIMED: "claimed",
  DISPATCHED: "dispatched",
  CANCELLED: "cancelled",
  SKIPPED: "skipped",
  FAILED: "failed",
  AMBIGUOUS: "ambiguous",
});

const TERMINAL_STATUSES = new Set([
  REMINDER_JOB_STATUS.DISPATCHED,
  REMINDER_JOB_STATUS.CANCELLED,
  REMINDER_JOB_STATUS.SKIPPED,
  REMINDER_JOB_STATUS.FAILED,
  REMINDER_JOB_STATUS.AMBIGUOUS,
]);

function createInMemoryAppointmentReminderRepository({
  clinicId = "oravia_demo_clinic",
} = {}) {
  const jobs = new Map();
  let sequence = 0;

  return Object.freeze({
    repositoryType: "in_memory_appointment_reminder_repository_v1",
    storage: "in_memory",
    durablePersistence: false,
    databasePersisted: false,
    createMissingJobs({ appointment, scheduledJobs }) {
      const created = [];
      for (const candidate of normalizeScheduledJobs({ appointment, scheduledJobs })) {
        const key = jobKey(candidate);
        if (jobs.has(key)) continue;
        sequence += 1;
        const now = new Date().toISOString();
        const job = {
          ...candidate,
          reminderJobId: `reminder_job_${sequence}`,
          status: REMINDER_JOB_STATUS.PENDING,
          attemptCount: 0,
          operationFingerprint: buildOperationFingerprint(candidate),
          providerMessageId: null,
          outboundLifecycleReference: null,
          safeFailureCategory: null,
          createdAt: now,
          updatedAt: now,
          sequence,
        };
        jobs.set(key, freezeClone(job));
        created.push(job);
      }
      return freezeClone({ accepted: true, createdCount: created.length, createdJobs: created });
    },
    listJobsForAppointment(appointmentId) {
      return Array.from(jobs.values())
        .filter((job) => job.clinicId === clinicId && job.appointmentId === appointmentId)
        .map(projectJob);
    },
    listOperationalJobs({ limit = 50, status } = {}) {
      return Array.from(jobs.values())
        .filter((job) => job.clinicId === clinicId && (!status || job.status === status))
        .sort((a, b) => String(a.scheduledDispatchAt).localeCompare(String(b.scheduledDispatchAt)))
        .slice(0, limit)
        .map(projectJob);
    },
    getSummary() {
      return summarize(Array.from(jobs.values()).filter((job) => job.clinicId === clinicId));
    },
    claimDueJobs({ now = new Date(), limit = 10 } = {}) {
      const nowMs = Date.parse(toIso(now));
      const due = Array.from(jobs.entries())
        .filter(([, job]) => job.clinicId === clinicId && job.status === REMINDER_JOB_STATUS.PENDING)
        .filter(([, job]) => Date.parse(job.scheduledDispatchAt) <= nowMs)
        .sort(([, a], [, b]) => String(a.scheduledDispatchAt).localeCompare(String(b.scheduledDispatchAt)))
        .slice(0, limit);
      const claimed = [];
      for (const [key, job] of due) {
        const updated = {
          ...job,
          status: REMINDER_JOB_STATUS.CLAIMED,
          attemptCount: job.attemptCount + 1,
          updatedAt: new Date().toISOString(),
        };
        jobs.set(key, freezeClone(updated));
        claimed.push(updated);
      }
      return freezeClone({ accepted: true, claimedCount: claimed.length, claimedJobs: claimed.map(projectJob) });
    },
    completeDispatched(input) {
      return updateJob(input.reminderJobId, {
        status: REMINDER_JOB_STATUS.DISPATCHED,
        providerMessageId: normalizeText(input.providerMessageId),
        outboundLifecycleReference: normalizeText(input.outboundLifecycleReference),
        safeFailureCategory: null,
      });
    },
    markSkipped(input) {
      return updateJob(input.reminderJobId, {
        status: REMINDER_JOB_STATUS.SKIPPED,
        safeFailureCategory: normalizeText(input.safeFailureCategory) || "domain_state_invalid",
      });
    },
    markCancelled(input) {
      return updateJob(input.reminderJobId, {
        status: REMINDER_JOB_STATUS.CANCELLED,
        safeFailureCategory: normalizeText(input.safeFailureCategory) || "appointment_obsolete",
      });
    },
    markFailed(input) {
      return updateJob(input.reminderJobId, {
        status: REMINDER_JOB_STATUS.FAILED,
        safeFailureCategory: normalizeText(input.safeFailureCategory) || "provider_failed",
      });
    },
    markAmbiguous(input) {
      return updateJob(input.reminderJobId, {
        status: REMINDER_JOB_STATUS.AMBIGUOUS,
        providerMessageId: normalizeText(input.providerMessageId),
        safeFailureCategory: normalizeText(input.safeFailureCategory) || "provider_success_local_write_ambiguous",
      });
    },
    cancelPendingForAppointmentVersion({ appointmentId, appointmentVersion, reason }) {
      let cancelledCount = 0;
      for (const [key, job] of jobs.entries()) {
        if (
          job.clinicId === clinicId &&
          job.appointmentId === appointmentId &&
          job.appointmentVersion === appointmentVersion &&
          job.status === REMINDER_JOB_STATUS.PENDING
        ) {
          jobs.set(key, freezeClone({ ...job, status: REMINDER_JOB_STATUS.CANCELLED, safeFailureCategory: reason || "appointment_version_obsolete", updatedAt: new Date().toISOString() }));
          cancelledCount += 1;
        }
      }
      return freezeClone({ accepted: true, cancelledCount });
    },
    resetFailedForRetry({ reminderJobId }) {
      const found = findById(reminderJobId);
      if (!found || found.job.status !== REMINDER_JOB_STATUS.FAILED) {
        return reject("reminder_job_not_retryable");
      }
      const updated = { ...found.job, status: REMINDER_JOB_STATUS.PENDING, safeFailureCategory: null, updatedAt: new Date().toISOString() };
      jobs.set(found.key, freezeClone(updated));
      return freezeClone({ accepted: true, job: projectJob(updated) });
    },
    getJobById(reminderJobId) {
      const found = findById(reminderJobId);
      return found ? projectJob(found.job) : null;
    },
  });

  function updateJob(reminderJobId, patch) {
    const found = findById(reminderJobId);
    if (!found) return reject("reminder_job_not_found");
    const updated = freezeClone({ ...found.job, ...patch, updatedAt: new Date().toISOString() });
    jobs.set(found.key, updated);
    return freezeClone({ accepted: true, job: projectJob(updated) });
  }

  function findById(reminderJobId) {
    for (const [key, job] of jobs.entries()) {
      if (job.clinicId === clinicId && job.reminderJobId === reminderJobId) {
        return { key, job };
      }
    }
    return null;
  }
}

function normalizeScheduledJobs({ appointment, scheduledJobs }) {
  const clinicId = normalizeText(appointment?.clinicId || "oravia_demo_clinic");
  const appointmentId = normalizeText(appointment?.id);
  const appointmentVersion = Number(appointment?.version);
  if (!clinicId || !appointmentId || !Number.isSafeInteger(appointmentVersion)) return [];
  return (Array.isArray(scheduledJobs) ? scheduledJobs : []).flatMap((job) => {
    const offsetMinutes = Number(job.offsetMinutes);
    const scheduledDispatchAt = normalizeText(job.scheduledDispatchAt);
    if (!Number.isSafeInteger(offsetMinutes) || offsetMinutes < 1 || !scheduledDispatchAt) return [];
    return [{
      clinicId,
      appointmentId,
      appointmentVersion,
      offsetMinutes,
      offsetIdentifier: `minutes_before_${offsetMinutes}`,
      scheduledDispatchAt,
    }];
  });
}

function jobKey(job) {
  return `${job.clinicId}:${job.appointmentId}:${job.appointmentVersion}:${job.offsetMinutes}`;
}

function buildOperationFingerprint(job) {
  return crypto
    .createHash("sha256")
    .update(jobKey(job))
    .digest("hex");
}

function summarize(jobs) {
  const counts = {
    pending: 0,
    claimed: 0,
    dispatched: 0,
    cancelled: 0,
    skipped: 0,
    failed: 0,
    ambiguous: 0,
  };
  let nextDueAt = null;
  for (const job of jobs) {
    counts[job.status] = (counts[job.status] || 0) + 1;
    if (job.status === REMINDER_JOB_STATUS.PENDING) {
      nextDueAt =
        !nextDueAt || job.scheduledDispatchAt < nextDueAt
          ? job.scheduledDispatchAt
          : nextDueAt;
    }
  }
  return freezeClone({ accepted: true, counts, nextDueAt, totalCount: jobs.length });
}

function projectJob(job) {
  return freezeClone({
    reminderJobId: job.reminderJobId,
    clinicId: job.clinicId,
    appointmentId: job.appointmentId,
    appointmentVersion: job.appointmentVersion,
    offsetMinutes: job.offsetMinutes,
    offsetIdentifier: job.offsetIdentifier,
    scheduledDispatchAt: job.scheduledDispatchAt,
    status: job.status,
    attemptCount: job.attemptCount,
    providerMessageReference: job.providerMessageId || null,
    outboundLifecycleReference: job.outboundLifecycleReference || null,
    safeFailureCategory: job.safeFailureCategory || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    retryEligible: job.status === REMINDER_JOB_STATUS.FAILED,
    terminal: TERMINAL_STATUSES.has(job.status),
  });
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : normalizeText(value);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function reject(code) {
  return freezeClone({ accepted: false, code, reason: "Reminder repository operation failed safely." });
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  REMINDER_JOB_STATUS,
  createInMemoryAppointmentReminderRepository,
  projectReminderJob: projectJob,
};
