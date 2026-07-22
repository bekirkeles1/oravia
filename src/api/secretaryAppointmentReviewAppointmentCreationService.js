const {
  constructAppointmentReviewAppointmentCreationReceipt,
} = require("../secretary/appointmentReviewAppointmentCreationReceipt");

const APPOINTMENT_CREATION_CONFIRMATION = "create_in_memory_appointment";
const APPROVED_REVIEW_STATE = "needs_clinic_review";

const CREATION_CODES = Object.freeze({
  CREATED: "appointment_review_appointment_created",
  REPLAY: "appointment_review_appointment_creation_matching_replay",
  BLOCKED: "appointment_review_appointment_creation_blocked",
  CONFLICT: "appointment_review_appointment_creation_conflict",
  NOT_FOUND: "appointment_review_appointment_creation_review_not_found",
  INTERNAL_ERROR: "appointment_review_appointment_creation_failed_safely",
});

const CREATION_SAFETY_FIELDS = Object.freeze({
  appointmentCreation: true,
  storage: "in_memory",
  persistence: "not_persisted",
  durablePersistence: false,
  calendarWritten: false,
  calendarEventCreated: false,
  messageSent: false,
  emailSent: false,
  whatsappSent: false,
  databasePersisted: false,
  externalCallPerformed: false,
});

async function createAppointmentFromApprovedReview(input) {
  const inputIssue = validateCreationInput(input);

  if (inputIssue.code) {
    return rejectCreation(inputIssue);
  }

  const {
    reviewId,
    expectedReviewVersion,
    idempotencyKey,
    resolveReviewSnapshot,
    appointmentRepository,
    previewReviewAppointmentCreationLink,
    applyReviewAppointmentCreationLink,
  } = inputIssue.value;
  const priorObservation = input.idempotencyStore.observe(idempotencyKey);

  if (
    priorObservation &&
    !String(priorObservation.requestFingerprint || "").includes(
      `reviewId:${reviewId}|`
    )
  ) {
    return rejectCreation({
      code: "idempotency_key_conflict",
      reason:
        "idempotencyKey was previously used for a different appointment creation request.",
      reviewId,
      conflict: true,
    });
  }

  let snapshot;

  try {
    snapshot = await resolveReviewSnapshot(reviewId);
  } catch {
    return rejectCreation({
      code: "trusted_review_snapshot_failed",
      reason: "Trusted review snapshot resolution failed safely.",
      reviewId,
      internal: true,
    });
  }

  if (!snapshot) {
    return rejectCreation({
      code: CREATION_CODES.NOT_FOUND,
      reason: "Appointment review item was not found.",
      reviewId,
      notFound: true,
    });
  }

  const currentState = normalizeText(snapshot.review?.metadata?.controlledActionState);

  if (currentState !== APPROVED_REVIEW_STATE) {
    return rejectCreation({
      code: "review_not_approved_for_appointment_creation",
      reason: "Appointment creation requires an approved review state.",
      reviewId,
      currentState,
      blocked: true,
    });
  }

  const candidateResult = buildTrustedAppointmentCandidate(snapshot.review);

  if (!candidateResult.accepted) {
    return rejectCreation({
      code: candidateResult.code,
      reason: candidateResult.reason,
      reviewId,
      currentState,
      blocked: true,
    });
  }

  const candidateFingerprint = buildAppointmentCandidateFingerprint(
    candidateResult.candidate
  );
  const requestFingerprint = buildCreationFingerprint({
    reviewId,
    expectedReviewVersion,
    candidateFingerprint,
  });
  if (priorObservation) {
    if (priorObservation.requestFingerprint === requestFingerprint) {
      const storedResult = input.idempotencyStore.getResult(idempotencyKey);

      if (storedResult) {
        return freezeClone({
          ...storedResult,
          accepted: true,
          created: false,
          appointmentCreated: false,
          matchingReplay: true,
          idempotencyStatus: "matching_replay",
          code: CREATION_CODES.REPLAY,
          receipt: {
            ...storedResult.receipt,
            matchingReplay: true,
            idempotencyStatus: "matching_replay",
          },
          reviewVersionChanged: false,
          appointmentRepositoryVersionChanged: false,
          replayedResultOnly: true,
          ...createSafetyFields(),
        });
      }
    }

    return rejectCreation({
      code: "idempotency_key_conflict",
      reason:
        "idempotencyKey was previously used for a different appointment creation request.",
      reviewId,
      currentState,
      conflict: true,
    });
  }

  if (snapshot.version !== expectedReviewVersion) {
    return rejectCreation({
      code: "review_version_conflict",
      reason:
        "expectedReviewVersion must match the current trusted review version.",
      reviewId,
      currentState,
      expectedReviewVersion,
      observedReviewVersion: snapshot.version,
      conflict: true,
    });
  }

  const existingAppointment =
    appointmentRepository.findAppointmentBySourceReviewId(reviewId);

  if (existingAppointment) {
    return rejectCreation({
      code: "appointment_already_created_for_review",
      reason: "Appointment already exists for this approved review.",
      reviewId,
      currentState,
      appointmentId: existingAppointment.id,
      conflict: true,
    });
  }

  let reviewLinkPreview;

  try {
    reviewLinkPreview = previewReviewAppointmentCreationLink({
      reviewId,
      expectedState: currentState,
      expectedVersion: expectedReviewVersion,
      appointmentId: "appointment_receipt_preview",
    });
  } catch {
    return rejectCreation({
      code: "review_repository_link_preview_failed",
      reason: "Review repository appointment link preview failed safely.",
      reviewId,
      currentState,
      internal: true,
    });
  }

  if (!reviewLinkPreview || reviewLinkPreview.status !== "ok") {
    return rejectCreation({
      code: reviewLinkPreview?.error?.code || CREATION_CODES.CONFLICT,
      reason:
        reviewLinkPreview?.error?.message ||
        "Review repository rejected appointment link preview.",
      reviewId,
      currentState,
      conflict: reviewLinkPreview?.status === "conflict",
      blocked: reviewLinkPreview?.status === "error",
    });
  }

  const receiptPreview = constructAppointmentReviewAppointmentCreationReceipt({
    reviewId,
    appointment: {
      ...candidateResult.candidate,
      id: "appointment_receipt_preview",
    },
    resultingReviewState: currentState,
    resultingReviewVersion: expectedReviewVersion + 1,
    appointmentRepositoryVersion: appointmentRepository.getVersion() + 1,
    reviewRepositoryVersion: expectedReviewVersion + 1,
    idempotencyStatus: "new_request",
    matchingReplay: false,
  });

  if (!receiptPreview.accepted) {
    return rejectCreation({
      code: receiptPreview.code,
      reason: receiptPreview.reason,
      reviewId,
      currentState,
      internal: true,
    });
  }

  let reserveResult;

  try {
    reserveResult = input.idempotencyStore.reserveResult({
      idempotencyKey,
      requestFingerprint,
    });
  } catch {
    return rejectCreation({
      code: "appointment_creation_idempotency_reserve_failed",
      reason:
        "Appointment creation idempotency reserve failed safely before mutation.",
      reviewId,
      currentState,
      internal: true,
    });
  }

  if (!reserveResult || reserveResult.accepted !== true) {
    return rejectCreation({
      code: reserveResult?.code || "appointment_creation_idempotency_reserve_failed",
      reason:
        reserveResult?.reason ||
        "Appointment creation idempotency reserve failed safely before mutation.",
      reviewId,
      currentState,
      conflict: reserveResult?.code === "idempotency_key_conflict",
      internal: reserveResult?.code !== "idempotency_key_conflict",
    });
  }

  let appointmentResult;

  try {
    appointmentResult = appointmentRepository.createAppointment(
      candidateResult.candidate
    );
  } catch {
    return rejectCreation({
      code: "appointment_repository_failed",
      reason: "Appointment repository creation failed safely.",
      reviewId,
      currentState,
      internal: true,
    });
  }

  if (!appointmentResult || appointmentResult.status !== "ok") {
    return rejectCreation({
      code: appointmentResult?.error?.code || CREATION_CODES.CONFLICT,
      reason:
        appointmentResult?.error?.message ||
        "Appointment repository rejected creation.",
      reviewId,
      currentState,
      conflict:
        appointmentResult?.error?.code === "appointment_already_created_for_review",
    });
  }

  let reviewLinkResult;

  try {
    reviewLinkResult = applyReviewAppointmentCreationLink({
      reviewId,
      expectedState: currentState,
      expectedVersion: expectedReviewVersion,
      appointmentId: appointmentResult.appointment.id,
    });
  } catch {
    return rejectCreation({
      code: "review_repository_link_failed",
      reason: "Review repository appointment link failed safely.",
      reviewId,
      currentState,
      internal: true,
    });
  }

  if (!reviewLinkResult || reviewLinkResult.status !== "ok") {
    return rejectCreation({
      code: reviewLinkResult?.error?.code || CREATION_CODES.CONFLICT,
      reason:
        reviewLinkResult?.error?.message ||
        "Review repository rejected appointment link.",
      reviewId,
      currentState,
      conflict: reviewLinkResult?.status === "conflict",
    });
  }

  const receipt = constructAppointmentReviewAppointmentCreationReceipt({
    reviewId,
    appointment: appointmentResult.appointment,
    resultingReviewState: currentState,
    resultingReviewVersion: reviewLinkResult.nextReviewVersion,
    appointmentRepositoryVersion: appointmentResult.appointmentRepositoryVersion,
    reviewRepositoryVersion: reviewLinkResult.reviewSnapshot.version,
    idempotencyStatus: "new_request",
    matchingReplay: false,
  });

  if (!receipt.accepted) {
    return rejectCreation({
      code: receipt.code,
      reason: receipt.reason,
      reviewId,
      currentState,
      internal: true,
    });
  }

  const result = freezeClone({
    accepted: true,
    created: true,
    appointmentCreated: true,
    matchingReplay: false,
    replayedResultOnly: false,
    idempotencyStatus: "new_request",
    code: CREATION_CODES.CREATED,
    reviewId,
    appointmentId: appointmentResult.appointment.id,
    appointment: appointmentResult.appointment,
    review: reviewLinkResult.reviewSnapshot.review,
    previousReviewVersion: expectedReviewVersion,
    resultingReviewVersion: reviewLinkResult.nextReviewVersion,
    appointmentRepositoryVersion:
      appointmentResult.appointmentRepositoryVersion,
    reviewRepositoryVersion: reviewLinkResult.reviewSnapshot.version,
    resultingReviewState: currentState,
    receipt,
    reviewVersionChanged: true,
    appointmentRepositoryVersionChanged: true,
    ...createSafetyFields(),
  });
  const storeResult = input.idempotencyStore.storeResult({
    idempotencyKey,
    requestFingerprint,
    result,
  });

  if (!storeResult || storeResult.accepted !== true) {
    return rejectCreation({
      code: storeResult?.code || "appointment_creation_idempotency_store_failed",
      reason:
        storeResult?.reason ||
        "Appointment creation idempotency store failed safely.",
      reviewId,
      currentState,
      internal: true,
    });
  }

  return result;
}

function buildTrustedAppointmentCandidate(review) {
  const selectedSlot = review?.selectedSlot;

  if (!selectedSlot || typeof selectedSlot !== "object") {
    return rejectCandidate("missing_selected_slot", "Trusted review selectedSlot is required.");
  }

  const sourceReviewId = normalizeText(review.id);
  const selectedSlotId = normalizeText(selectedSlot.id);
  const doctorId = normalizeText(selectedSlot.doctorId);
  const doctorName = normalizeText(selectedSlot.doctorName);
  const appointmentPurpose = normalizeText(
    review.appointmentPurpose || selectedSlot.appointmentPurpose
  );
  const appointmentPurposeLabel = normalizeText(
    review.appointmentPurposeLabel || selectedSlot.appointmentPurposeLabel
  );
  const treatment = normalizeText(review.treatment || selectedSlot.treatment);
  const startAt = normalizeText(selectedSlot.startAt || selectedSlot.start_at);
  const endAt = normalizeText(selectedSlot.endAt || selectedSlot.end_at);
  const durationMinutes = selectedSlot.durationMinutes;

  if (
    !sourceReviewId ||
    !selectedSlotId ||
    !doctorId ||
    !doctorName ||
    !appointmentPurpose ||
    !appointmentPurposeLabel ||
    !treatment ||
    !startAt ||
    !endAt ||
    !Number.isSafeInteger(durationMinutes) ||
    durationMinutes < 1
  ) {
    return rejectCandidate(
      "incomplete_trusted_appointment_candidate",
      "Trusted review does not contain a complete appointment candidate."
    );
  }

  return freezeClone({
    accepted: true,
    candidate: {
      sourceReviewId,
      selectedSlotId,
      doctorId,
      doctorName,
      treatment,
      appointmentPurpose,
      appointmentPurposeLabel,
      startAt,
      endAt,
      durationMinutes,
    },
  });
}

function validateCreationInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      code: "invalid_appointment_creation_input",
      reason: "Appointment creation input must be an object.",
    };
  }

  const reviewId = normalizeText(input.reviewId);
  const idempotencyKey = normalizeText(input.idempotencyKey);

  if (!reviewId) {
    return {
      code: "missing_review_id",
      reason: "reviewId is required.",
    };
  }

  if (
    !Number.isSafeInteger(input.expectedReviewVersion) ||
    input.expectedReviewVersion < 1
  ) {
    return {
      code: "invalid_expected_review_version",
      reason: "expectedReviewVersion must be a positive safe integer.",
      reviewId,
    };
  }

  if (!idempotencyKey || idempotencyKey.length > 128) {
    return {
      code: idempotencyKey
        ? "invalid_idempotency_key"
        : "missing_idempotency_key",
      reason:
        "idempotencyKey is required and must be 128 characters or fewer.",
      reviewId,
    };
  }

  if (!/^[A-Za-z0-9:_-]+$/.test(idempotencyKey)) {
    return {
      code: "invalid_idempotency_key",
      reason:
        "idempotencyKey may contain only letters, numbers, hyphen, underscore, and colon.",
      reviewId,
    };
  }

  if (normalizeText(input.confirmation) !== APPOINTMENT_CREATION_CONFIRMATION) {
    return {
      code: "missing_appointment_creation_confirmation",
      reason: "Explicit in-memory appointment creation confirmation is required.",
      reviewId,
    };
  }

  if (typeof input.resolveReviewSnapshot !== "function") {
    return {
      code: "missing_review_snapshot_resolver",
      reason: "Trusted review snapshot resolver is required.",
      reviewId,
    };
  }

  if (!input.appointmentRepository || typeof input.appointmentRepository !== "object") {
    return {
      code: "missing_appointment_repository",
      reason: "Appointment repository is required.",
      reviewId,
    };
  }

  for (const methodName of [
    "createAppointment",
    "findAppointmentBySourceReviewId",
    "getVersion",
  ]) {
    if (typeof input.appointmentRepository[methodName] !== "function") {
      return {
        code: "invalid_appointment_repository",
        reason: "Appointment repository contract is invalid.",
        reviewId,
      };
    }
  }

  if (typeof input.applyReviewAppointmentCreationLink !== "function") {
    return {
      code: "missing_review_appointment_link_capability",
      reason: "Review appointment link capability is required.",
      reviewId,
    };
  }

  if (typeof input.previewReviewAppointmentCreationLink !== "function") {
    return {
      code: "missing_review_appointment_link_preview_capability",
      reason: "Review appointment link preview capability is required.",
      reviewId,
    };
  }

  if (
    !input.idempotencyStore ||
    typeof input.idempotencyStore.observe !== "function" ||
    typeof input.idempotencyStore.getResult !== "function" ||
    typeof input.idempotencyStore.reserveResult !== "function" ||
    typeof input.idempotencyStore.storeResult !== "function"
  ) {
    return {
      code: "invalid_appointment_creation_idempotency_store",
      reason: "Appointment creation idempotency store contract is invalid.",
      reviewId,
    };
  }

  return {
    value: {
      reviewId,
      expectedReviewVersion: input.expectedReviewVersion,
      idempotencyKey,
      resolveReviewSnapshot: input.resolveReviewSnapshot,
      appointmentRepository: input.appointmentRepository,
      previewReviewAppointmentCreationLink:
        input.previewReviewAppointmentCreationLink,
      applyReviewAppointmentCreationLink: input.applyReviewAppointmentCreationLink,
    },
  };
}

function buildCreationFingerprint({
  reviewId,
  expectedReviewVersion,
  candidateFingerprint,
}) {
  return [
    "operation:appointment_creation",
    `reviewId:${reviewId}`,
    `expectedReviewVersion:${expectedReviewVersion}`,
    `candidate:${candidateFingerprint}`,
  ].join("|");
}

function buildAppointmentCandidateFingerprint(candidate) {
  return [
    candidate.sourceReviewId,
    candidate.selectedSlotId,
    candidate.doctorId,
    candidate.doctorName,
    candidate.treatment,
    candidate.appointmentPurpose,
    candidate.appointmentPurposeLabel,
    candidate.startAt,
    candidate.endAt,
    candidate.durationMinutes,
  ].join("|");
}

function rejectCandidate(code, reason) {
  return freezeClone({
    accepted: false,
    code,
    reason,
  });
}

function rejectCreation({
  code,
  reason,
  reviewId = "",
  currentState = "",
  expectedReviewVersion = null,
  observedReviewVersion = null,
  appointmentId = null,
  blocked = false,
  conflict = false,
  notFound = false,
  internal = false,
}) {
  return freezeClone({
    accepted: false,
    created: false,
    appointmentCreated: false,
    matchingReplay: false,
    replayedResultOnly: false,
    blocked: blocked === true,
    conflict: conflict === true,
    notFound: notFound === true,
    internal: internal === true,
    code,
    reason,
    reviewId: normalizeText(reviewId) || null,
    currentState: normalizeText(currentState) || null,
    expectedReviewVersion,
    observedReviewVersion,
    appointmentId,
    appointment: null,
    review: null,
    receipt: null,
    reviewVersionChanged: false,
    appointmentRepositoryVersionChanged: false,
    ...createSafetyFields(),
  });
}

function createSafetyFields() {
  return { ...CREATION_SAFETY_FIELDS };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function freezeClone(value) {
  return deepFreeze(cloneValue(value));
}

function cloneValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return value;
}

module.exports = {
  APPOINTMENT_CREATION_CONFIRMATION,
  APPROVED_REVIEW_STATE,
  CREATION_CODES,
  buildTrustedAppointmentCandidate,
  createAppointmentFromApprovedReview,
};
