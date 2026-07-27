const crypto = require("node:crypto");
const {
  REMINDER_JOB_STATUS,
  projectReminderJob,
} = require("../reminders/appointmentReminderRepository");
const { freezeClone, stringifyJson } = require("./sqliteJson");

function createSqliteAppointmentReminderRepository({ persistenceProvider }) {
  const database = persistenceProvider.getDatabase();
  const clinicId = persistenceProvider.getClinicId();

  return Object.freeze({
    repositoryType: "sqlite_appointment_reminder_repository_v1",
    storage: "sqlite",
    durablePersistence: true,
    databasePersisted: true,
    createMissingJobs({ appointment, scheduledJobs }) {
      const candidates = normalizeScheduledJobs({
        clinicId,
        appointment,
        scheduledJobs,
      });
      let createdCount = 0;
      const createdJobs = [];
      const now = new Date().toISOString();

      for (const candidate of candidates) {
        const jobId = `reminder_job_${crypto.randomBytes(12).toString("base64url")}`;
        const result = database
          .prepare(
            `INSERT OR IGNORE INTO appointment_reminder_jobs (
              clinic_id, reminder_job_id, appointment_id, appointment_version,
              offset_identifier, offset_minutes, scheduled_dispatch_at, status,
              attempt_count, operation_fingerprint, provider_message_reference,
              outbound_lifecycle_reference, safe_failure_category, result_json,
              created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, NULL, NULL, ?, ?)`
          )
          .run(
            clinicId,
            jobId,
            candidate.appointmentId,
            candidate.appointmentVersion,
            candidate.offsetIdentifier,
            candidate.offsetMinutes,
            candidate.scheduledDispatchAt,
            REMINDER_JOB_STATUS.PENDING,
            candidate.operationFingerprint,
            now,
            now
          );
        if (result.changes > 0) {
          createdCount += 1;
          createdJobs.push(getJobById(database, clinicId, jobId));
        }
      }

      return freezeClone({ accepted: true, createdCount, createdJobs: createdJobs.map(projectReminderJob) });
    },
    listJobsForAppointment(appointmentId) {
      return database
        .prepare(
          `SELECT * FROM appointment_reminder_jobs
           WHERE clinic_id = ? AND appointment_id = ?
           ORDER BY scheduled_dispatch_at, offset_minutes`
        )
        .all(clinicId, normalizeText(appointmentId))
        .map(rowToJob)
        .map(projectReminderJob);
    },
    listOperationalJobs({ limit = 50, status } = {}) {
      const safeLimit = normalizeLimit(limit);
      const safeStatus = normalizeStatus(status);
      const rows = safeStatus
        ? database
            .prepare(
              `SELECT * FROM appointment_reminder_jobs
               WHERE clinic_id = ? AND status = ?
               ORDER BY scheduled_dispatch_at, created_at
               LIMIT ?`
            )
            .all(clinicId, safeStatus, safeLimit)
        : database
            .prepare(
              `SELECT * FROM appointment_reminder_jobs
               WHERE clinic_id = ?
               ORDER BY scheduled_dispatch_at, created_at
               LIMIT ?`
            )
            .all(clinicId, safeLimit);
      return rows.map(rowToJob).map(projectReminderJob);
    },
    getSummary() {
      const rows = database
        .prepare(
          `SELECT status, COUNT(*) AS count
           FROM appointment_reminder_jobs
           WHERE clinic_id = ?
           GROUP BY status`
        )
        .all(clinicId);
      const counts = {
        pending: 0,
        claimed: 0,
        dispatched: 0,
        cancelled: 0,
        skipped: 0,
        failed: 0,
        ambiguous: 0,
      };
      for (const row of rows) counts[row.status] = row.count;
      const nextDue = database
        .prepare(
          `SELECT scheduled_dispatch_at
           FROM appointment_reminder_jobs
           WHERE clinic_id = ? AND status = ?
           ORDER BY scheduled_dispatch_at
           LIMIT 1`
        )
        .get(clinicId, REMINDER_JOB_STATUS.PENDING);
      return freezeClone({
        accepted: true,
        counts,
        nextDueAt: nextDue?.scheduled_dispatch_at || null,
        totalCount: Object.values(counts).reduce((sum, count) => sum + count, 0),
      });
    },
    claimDueJobs({ now = new Date(), limit = 10 } = {}) {
      const safeLimit = normalizeLimit(limit);
      const nowIso = toIso(now);
      const claimedJobs = [];
      database.exec("BEGIN IMMEDIATE");
      try {
        const dueRows = database
          .prepare(
            `SELECT reminder_job_id
             FROM appointment_reminder_jobs
             WHERE clinic_id = ? AND status = ? AND scheduled_dispatch_at <= ?
             ORDER BY scheduled_dispatch_at, created_at
             LIMIT ?`
          )
          .all(clinicId, REMINDER_JOB_STATUS.PENDING, nowIso, safeLimit);
        const updatedAt = new Date().toISOString();
        for (const row of dueRows) {
          const result = database
            .prepare(
              `UPDATE appointment_reminder_jobs
               SET status = ?, attempt_count = attempt_count + 1, updated_at = ?
               WHERE clinic_id = ? AND reminder_job_id = ? AND status = ?`
            )
            .run(
              REMINDER_JOB_STATUS.CLAIMED,
              updatedAt,
              clinicId,
              row.reminder_job_id,
              REMINDER_JOB_STATUS.PENDING
            );
          if (result.changes > 0) {
            claimedJobs.push(getJobById(database, clinicId, row.reminder_job_id));
          }
        }
        database.exec("COMMIT");
      } catch (error) {
        try {
          database.exec("ROLLBACK");
        } catch {}
        throw error;
      }
      return freezeClone({
        accepted: true,
        claimedCount: claimedJobs.length,
        claimedJobs: claimedJobs.map(projectReminderJob),
      });
    },
    completeDispatched(input) {
      return updateJob(database, clinicId, input?.reminderJobId, {
        status: REMINDER_JOB_STATUS.DISPATCHED,
        providerMessageReference: normalizeText(input?.providerMessageId),
        outboundLifecycleReference: normalizeText(input?.outboundLifecycleReference),
        safeFailureCategory: "",
        result: input?.safeResult || null,
      });
    },
    markSkipped(input) {
      return updateJob(database, clinicId, input?.reminderJobId, {
        status: REMINDER_JOB_STATUS.SKIPPED,
        safeFailureCategory: normalizeText(input?.safeFailureCategory) || "domain_state_invalid",
        result: input?.safeResult || null,
      });
    },
    markCancelled(input) {
      return updateJob(database, clinicId, input?.reminderJobId, {
        status: REMINDER_JOB_STATUS.CANCELLED,
        safeFailureCategory: normalizeText(input?.safeFailureCategory) || "appointment_obsolete",
        result: input?.safeResult || null,
      });
    },
    markFailed(input) {
      return updateJob(database, clinicId, input?.reminderJobId, {
        status: REMINDER_JOB_STATUS.FAILED,
        safeFailureCategory: normalizeText(input?.safeFailureCategory) || "provider_failed",
        result: input?.safeResult || null,
      });
    },
    markAmbiguous(input) {
      return updateJob(database, clinicId, input?.reminderJobId, {
        status: REMINDER_JOB_STATUS.AMBIGUOUS,
        providerMessageReference: normalizeText(input?.providerMessageId),
        safeFailureCategory:
          normalizeText(input?.safeFailureCategory) ||
          "provider_success_local_write_ambiguous",
        result: input?.safeResult || null,
      });
    },
    cancelPendingForAppointmentVersion({ appointmentId, appointmentVersion, reason }) {
      const result = database
        .prepare(
          `UPDATE appointment_reminder_jobs
           SET status = ?, safe_failure_category = ?, updated_at = ?
           WHERE clinic_id = ? AND appointment_id = ? AND appointment_version = ?
             AND status = ?`
        )
        .run(
          REMINDER_JOB_STATUS.CANCELLED,
          normalizeText(reason) || "appointment_version_obsolete",
          new Date().toISOString(),
          clinicId,
          normalizeText(appointmentId),
          Number(appointmentVersion),
          REMINDER_JOB_STATUS.PENDING
        );
      return freezeClone({ accepted: true, cancelledCount: result.changes });
    },
    resetFailedForRetry({ reminderJobId }) {
      const result = database
        .prepare(
          `UPDATE appointment_reminder_jobs
           SET status = ?, safe_failure_category = NULL, updated_at = ?
           WHERE clinic_id = ? AND reminder_job_id = ? AND status = ?`
        )
        .run(
          REMINDER_JOB_STATUS.PENDING,
          new Date().toISOString(),
          clinicId,
          normalizeText(reminderJobId),
          REMINDER_JOB_STATUS.FAILED
        );
      if (result.changes < 1) {
        return reject("reminder_job_not_retryable");
      }
      return freezeClone({
        accepted: true,
        job: projectReminderJob(getJobById(database, clinicId, normalizeText(reminderJobId))),
      });
    },
    getJobById(reminderJobId) {
      const job = getJobById(database, clinicId, normalizeText(reminderJobId));
      return job ? projectReminderJob(job) : null;
    },
  });
}

function normalizeScheduledJobs({ clinicId, appointment, scheduledJobs }) {
  const appointmentId = normalizeText(appointment?.id);
  const appointmentVersion = Number(appointment?.version);
  if (!appointmentId || !Number.isSafeInteger(appointmentVersion)) return [];
  return (Array.isArray(scheduledJobs) ? scheduledJobs : []).flatMap((job) => {
    const offsetMinutes = Number(job.offsetMinutes);
    const scheduledDispatchAt = normalizeText(job.scheduledDispatchAt);
    if (!Number.isSafeInteger(offsetMinutes) || offsetMinutes < 1 || !scheduledDispatchAt) return [];
    const offsetIdentifier = `minutes_before_${offsetMinutes}`;
    const operationFingerprint = crypto
      .createHash("sha256")
      .update(`${clinicId}:${appointmentId}:${appointmentVersion}:${offsetMinutes}`)
      .digest("hex");
    return [{
      appointmentId,
      appointmentVersion,
      offsetMinutes,
      offsetIdentifier,
      scheduledDispatchAt,
      operationFingerprint,
    }];
  });
}

function updateJob(database, clinicId, reminderJobId, patch) {
  const id = normalizeText(reminderJobId);
  if (!id) return reject("invalid_reminder_job_id");
  const result = database
    .prepare(
      `UPDATE appointment_reminder_jobs
       SET status = ?, provider_message_reference = ?,
           outbound_lifecycle_reference = ?, safe_failure_category = ?,
           result_json = ?, updated_at = ?
       WHERE clinic_id = ? AND reminder_job_id = ?`
    )
    .run(
      patch.status,
      patch.providerMessageReference || null,
      patch.outboundLifecycleReference || null,
      patch.safeFailureCategory || null,
      patch.result ? stringifyJson(patch.result) : null,
      new Date().toISOString(),
      clinicId,
      id
    );
  if (result.changes < 1) return reject("reminder_job_not_found");
  return freezeClone({ accepted: true, job: projectReminderJob(getJobById(database, clinicId, id)) });
}

function getJobById(database, clinicId, reminderJobId) {
  const row = database
    .prepare(
      `SELECT * FROM appointment_reminder_jobs
       WHERE clinic_id = ? AND reminder_job_id = ?`
    )
    .get(clinicId, reminderJobId);
  return row ? rowToJob(row) : null;
}

function rowToJob(row) {
  return {
    reminderJobId: row.reminder_job_id,
    clinicId: row.clinic_id,
    appointmentId: row.appointment_id,
    appointmentVersion: row.appointment_version,
    offsetMinutes: row.offset_minutes,
    offsetIdentifier: row.offset_identifier,
    scheduledDispatchAt: row.scheduled_dispatch_at,
    status: row.status,
    attemptCount: row.attempt_count,
    operationFingerprint: row.operation_fingerprint,
    providerMessageId: row.provider_message_reference,
    outboundLifecycleReference: row.outbound_lifecycle_reference,
    safeFailureCategory: row.safe_failure_category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100 ? parsed : 50;
}

function normalizeStatus(value) {
  const status = normalizeText(value);
  return Object.values(REMINDER_JOB_STATUS).includes(status) ? status : "";
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : normalizeText(value);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function reject(code) {
  return freezeClone({
    accepted: false,
    code,
    reason: "SQLite reminder repository operation failed safely.",
  });
}

module.exports = {
  createSqliteAppointmentReminderRepository,
};
