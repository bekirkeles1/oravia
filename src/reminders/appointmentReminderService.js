const crypto = require("node:crypto");
const { APPOINTMENT_STATUS } = require("../secretary/appointmentReviewAppointmentRepository");
const { buildAppointmentReminderMessage } = require("./appointmentReminderMessageMapper");
const { REMINDER_JOB_STATUS } = require("./appointmentReminderRepository");

function reconcileAppointmentReminders({
  appointmentRepository,
  reminderRepository,
  reminderConfig,
  now = new Date(),
} = {}) {
  if (!reminderConfig?.engineEnabled) {
    return freezeClone({ accepted: true, code: "reminder_engine_disabled", createdCount: 0, cancelledCount: 0 });
  }
  const nowMs = Date.parse(toIso(now));
  const appointments =
    typeof appointmentRepository?.listAppointments === "function"
      ? appointmentRepository.listAppointments()
      : [];
  let createdCount = 0;
  let cancelledCount = 0;
  let eligibleAppointmentCount = 0;

  for (const appointment of appointments) {
    const status = normalizeText(appointment.appointmentStatus || appointment.status);
    if (status !== APPOINTMENT_STATUS.SCHEDULED) {
      const cancel = cancelAllPendingVersions({ reminderRepository, appointment });
      cancelledCount += cancel.cancelledCount || 0;
      continue;
    }

    const startMs = Date.parse(normalizeText(appointment.startAt));
    if (!Number.isFinite(startMs) || startMs <= nowMs) continue;
    eligibleAppointmentCount += 1;
    const scheduledJobs = reminderConfig.offsetsMinutes.flatMap((offsetMinutes) => {
      const scheduledMs = startMs - offsetMinutes * 60_000;
      if (scheduledMs <= nowMs) return [];
      return [{ offsetMinutes, scheduledDispatchAt: new Date(scheduledMs).toISOString() }];
    });
    const create = reminderRepository.createMissingJobs({ appointment, scheduledJobs });
    if (create?.accepted) createdCount += create.createdCount || 0;
  }

  return freezeClone({
    accepted: true,
    code: "appointment_reminder_reconciliation_completed",
    eligibleAppointmentCount,
    createdCount,
    cancelledCount,
    providerCalled: false,
    messageSent: false,
  });
}

function reconcileOneAppointmentReminders({
  appointment,
  reminderRepository,
  reminderConfig,
  now = new Date(),
} = {}) {
  if (!appointment || !reminderConfig?.engineEnabled) {
    return freezeClone({ accepted: true, createdCount: 0, cancelledCount: 0 });
  }
  const status = normalizeText(appointment.appointmentStatus || appointment.status);
  if (status !== APPOINTMENT_STATUS.SCHEDULED) {
    return cancelAllPendingVersions({ reminderRepository, appointment });
  }
  const nowMs = Date.parse(toIso(now));
  const startMs = Date.parse(normalizeText(appointment.startAt));
  if (!Number.isFinite(startMs) || startMs <= nowMs) {
    return freezeClone({ accepted: true, createdCount: 0, cancelledCount: 0 });
  }
  const scheduledJobs = reminderConfig.offsetsMinutes.flatMap((offsetMinutes) => {
    const scheduledMs = startMs - offsetMinutes * 60_000;
    if (scheduledMs <= nowMs) return [];
    return [{ offsetMinutes, scheduledDispatchAt: new Date(scheduledMs).toISOString() }];
  });
  const create = reminderRepository.createMissingJobs({ appointment, scheduledJobs });
  return freezeClone({
    accepted: create?.accepted === true,
    createdCount: create?.createdCount || 0,
    cancelledCount: 0,
  });
}

function cancelObsoleteAppointmentReminderJobs({
  reminderRepository,
  appointmentId,
  appointmentVersion,
  reason = "appointment_version_obsolete",
} = {}) {
  if (!reminderRepository || typeof reminderRepository.cancelPendingForAppointmentVersion !== "function") {
    return freezeClone({ accepted: false, code: "missing_reminder_repository" });
  }
  return reminderRepository.cancelPendingForAppointmentVersion({
    appointmentId,
    appointmentVersion,
    reason,
  });
}

async function dispatchClaimedAppointmentReminder({
  job,
  appointmentRepository,
  reminderRepository,
  outboundMessagingProvider,
  idempotencyStore,
} = {}) {
  if (!job || job.status !== REMINDER_JOB_STATUS.CLAIMED) {
    return markSkipped(reminderRepository, job, "job_not_claimed");
  }
  const appointment = appointmentRepository.getAppointmentById(job.appointmentId);
  const invalid = validateCurrentAppointmentForJob({ appointment, job });
  if (invalid) {
    return markSkipped(reminderRepository, job, invalid);
  }
  const destination = resolveTrustedDestination(appointment);
  if (!destination.accepted) {
    return markSkipped(reminderRepository, job, destination.code);
  }
  const message = buildAppointmentReminderMessage({
    appointment,
    offsetMinutes: job.offsetMinutes,
  });
  if (!message.accepted) {
    return markSkipped(reminderRepository, job, message.code);
  }

  const providerName = normalizeText(outboundMessagingProvider?.name);
  const idempotencyKey = `appointment_reminder:${job.reminderJobId}`;
  const requestFingerprint = buildDispatchFingerprint({
    job,
    appointment,
    providerName,
    message,
  });
  const observed = idempotencyStore.observe(idempotencyKey);
  if (observed) {
    if (observed.requestFingerprint !== requestFingerprint) {
      const failed = reminderRepository.markFailed({
        reminderJobId: job.reminderJobId,
        safeFailureCategory: "idempotency_key_conflict",
      });
      return freezeClone({ accepted: false, code: "idempotency_key_conflict", job: failed.job, providerCalled: false });
    }
    const stored = idempotencyStore.getResult(idempotencyKey);
    if (stored) {
      return freezeClone({ ...stored, matchingReplay: true, providerCalled: false });
    }
    return freezeClone({ accepted: false, code: "reminder_dispatch_reserved_without_result", providerCalled: false });
  }
  const reserve = idempotencyStore.reserveResult({ idempotencyKey, requestFingerprint });
  if (!reserve?.accepted) {
    const failed = reminderRepository.markFailed({
      reminderJobId: job.reminderJobId,
      safeFailureCategory: reserve?.code || "idempotency_reserve_failed",
    });
    return freezeClone({ accepted: false, code: reserve?.code || "idempotency_reserve_failed", job: failed.job, providerCalled: false });
  }

  let providerResult;
  try {
    providerResult = await outboundMessagingProvider.sendAppointmentReminder({
      commandKind: "appointment_reminder_dispatch_command_v1",
      appointmentId: appointment.id,
      appointment,
      offsetMinutes: job.offsetMinutes,
      operationReference: job.reminderJobId,
      destination: destination.destination,
      message,
    });
  } catch {
    return markFailed(reminderRepository, job, "provider_exception");
  }

  const safeProvider = normalizeProviderResult(providerResult, providerName);
  if (!safeProvider.accepted) {
    return markFailed(reminderRepository, job, safeProvider.code);
  }

  const result = freezeClone({
    accepted: true,
    code: "appointment_reminder_dispatched",
    reminderJobId: job.reminderJobId,
    appointmentId: appointment.id,
    appointmentVersion: appointment.version,
    offsetMinutes: job.offsetMinutes,
    provider: safeProvider.provider,
    providerMessageId: safeProvider.providerMessageId,
    providerCalled: true,
    providerDispatchAccepted: true,
    realPatientDelivery: false,
    messageSent: false,
    matchingReplay: false,
  });

  const complete = reminderRepository.completeDispatched({
    reminderJobId: job.reminderJobId,
    providerMessageId: safeProvider.providerMessageId,
    safeResult: result,
  });
  if (!complete?.accepted) {
    const ambiguous = reminderRepository.markAmbiguous({
      reminderJobId: job.reminderJobId,
      providerMessageId: safeProvider.providerMessageId,
      safeFailureCategory: "provider_success_local_write_ambiguous",
      safeResult: result,
    });
    return freezeClone({ ...result, accepted: false, code: "appointment_reminder_ambiguous_local_write", ambiguous: true, job: ambiguous.job });
  }

  const stored = idempotencyStore.storeResult({
    idempotencyKey,
    requestFingerprint,
    result,
  });
  if (!stored?.accepted) {
    const ambiguous = reminderRepository.markAmbiguous({
      reminderJobId: job.reminderJobId,
      providerMessageId: safeProvider.providerMessageId,
      safeFailureCategory: "idempotency_store_ambiguous_after_provider_success",
      safeResult: result,
    });
    return freezeClone({ ...result, accepted: false, code: "appointment_reminder_ambiguous_idempotency_store", ambiguous: true, job: ambiguous.job });
  }

  return freezeClone({ ...result, job: complete.job });
}

async function runAppointmentReminderCycle({
  appointmentRepository,
  reminderRepository,
  reminderConfig,
  outboundMessagingProvider,
  idempotencyStore,
  now = new Date(),
  manualDispatch = false,
} = {}) {
  if (!reminderConfig?.engineEnabled) {
    return freezeClone({ accepted: true, code: "reminder_engine_disabled", reconciled: false, claimedCount: 0, processedCount: 0, results: [] });
  }
  const reconciliation = reconcileAppointmentReminders({
    appointmentRepository,
    reminderRepository,
    reminderConfig,
    now,
  });
  if (!reminderConfig.automaticDispatchEnabled && manualDispatch !== true) {
    return freezeClone({
      accepted: true,
      code: "reminder_dispatch_disabled",
      reconciliation,
      claimedCount: 0,
      processedCount: 0,
      results: [],
    });
  }
  const claim = reminderRepository.claimDueJobs({
    now,
    limit: reminderConfig.maxJobsPerCycle,
  });
  const results = [];
  for (const claimedJob of claim.claimedJobs || []) {
    results.push(
      await dispatchClaimedAppointmentReminder({
        job: claimedJob,
        appointmentRepository,
        reminderRepository,
        outboundMessagingProvider,
        idempotencyStore,
      })
    );
  }
  return freezeClone({
    accepted: true,
    code: "appointment_reminder_cycle_completed",
    reconciliation,
    claimedCount: claim.claimedCount || 0,
    processedCount: results.length,
    resultCounts: countResults(results),
    results: results.map((result) => ({
      accepted: result.accepted === true,
      code: result.code,
      reminderJobId: result.reminderJobId || result.job?.reminderJobId || null,
      providerCalled: result.providerCalled === true,
      ambiguous: result.ambiguous === true,
    })),
  });
}

function retryFailedReminderJob({ reminderRepository, reminderJobId } = {}) {
  return reminderRepository.resetFailedForRetry({ reminderJobId });
}

function cancelAllPendingVersions({ reminderRepository, appointment }) {
  let cancelledCount = 0;
  for (const job of reminderRepository.listJobsForAppointment(appointment.id)) {
    if (job.status === REMINDER_JOB_STATUS.PENDING) {
      const cancel = reminderRepository.cancelPendingForAppointmentVersion({
        appointmentId: appointment.id,
        appointmentVersion: job.appointmentVersion,
        reason: "appointment_cancelled",
      });
      cancelledCount += cancel.cancelledCount || 0;
    }
  }
  return freezeClone({ accepted: true, createdCount: 0, cancelledCount });
}

function validateCurrentAppointmentForJob({ appointment, job }) {
  if (!appointment) return "appointment_missing";
  if (normalizeText(appointment.appointmentStatus || appointment.status) !== APPOINTMENT_STATUS.SCHEDULED) return "appointment_not_scheduled";
  if (appointment.version !== job.appointmentVersion) return "appointment_version_changed";
  if (Date.parse(normalizeText(appointment.startAt)) <= Date.now()) return "appointment_not_future";
  return null;
}

function resolveTrustedDestination(appointment) {
  const destination = appointment?.outboundDestination || {};
  const channel = normalizeText(destination.channel);
  const reference = normalizeText(destination.reference);
  const maskedLabel = normalizeText(destination.maskedLabel);
  const lookupHash = normalizeText(destination.lookupHash);
  const encryptedIdentity =
    destination.encryptedIdentity &&
    typeof destination.encryptedIdentity === "object" &&
    !Array.isArray(destination.encryptedIdentity)
      ? destination.encryptedIdentity
      : null;
  if (!channel || !maskedLabel || (!reference && !lookupHash)) {
    return { accepted: false, code: "missing_trusted_outbound_destination" };
  }
  return freezeClone({
    accepted: true,
    destination: { channel, reference, maskedLabel, lookupHash, encryptedIdentity },
  });
}

function normalizeProviderResult(providerResult, providerName) {
  if (!providerResult?.accepted || !providerResult.providerMessageId) {
    return {
      accepted: false,
      code: providerResult?.code || "reminder_provider_failed",
    };
  }
  return {
    accepted: true,
    provider: normalizeText(providerResult.provider) || providerName,
    providerMessageId: normalizeText(providerResult.providerMessageId),
  };
}

function markSkipped(repository, job, category) {
  const skipped = repository.markSkipped({
    reminderJobId: job?.reminderJobId,
    safeFailureCategory: category,
  });
  return freezeClone({ accepted: true, code: "appointment_reminder_skipped", job: skipped.job, providerCalled: false });
}

function markFailed(repository, job, category) {
  const failed = repository.markFailed({
    reminderJobId: job.reminderJobId,
    safeFailureCategory: category,
  });
  return freezeClone({ accepted: false, code: "appointment_reminder_failed", job: failed.job, providerCalled: false });
}

function buildDispatchFingerprint({ job, appointment, providerName, message }) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        operation: "appointment_reminder_dispatch",
        reminderJobId: job.reminderJobId,
        appointmentId: appointment.id,
        appointmentVersion: appointment.version,
        offsetMinutes: job.offsetMinutes,
        providerName,
        templateParameters: message.templateParameters,
      })
    )
    .digest("hex");
}

function countResults(results) {
  return results.reduce((counts, result) => {
    const key = result.ambiguous ? "ambiguous" : result.accepted ? "dispatched" : "failed";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : normalizeText(value);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  cancelObsoleteAppointmentReminderJobs,
  dispatchClaimedAppointmentReminder,
  reconcileAppointmentReminders,
  reconcileOneAppointmentReminders,
  retryFailedReminderJob,
  runAppointmentReminderCycle,
};
