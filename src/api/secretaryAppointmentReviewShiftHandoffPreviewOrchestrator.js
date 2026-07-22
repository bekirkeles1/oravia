const {
  QUEUE_READINESS_CLASSIFICATIONS,
  runAppointmentReviewQueueReadinessPreview,
} = require("./secretaryAppointmentReviewQueueReadinessPreviewOrchestrator");
const {
  buildAppointmentReviewResolutionGuidance,
} = require("../secretary/appointmentReviewResolutionGuidanceContract");

const SHIFT_HANDOFF_MODE = "validation_only";
const SHIFT_HANDOFF_PREVIEW_TYPE = "secretary_shift_handoff_preview";
const BRANCH_ORDER = Object.freeze(["approve", "reject"]);
const READINESS_ORDER = Object.freeze([
  QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_AVAILABLE,
  QUEUE_READINESS_CLASSIFICATIONS.APPROVE_PATH_ONLY,
  QUEUE_READINESS_CLASSIFICATIONS.REJECT_PATH_ONLY,
  QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_BLOCKED,
]);

const SHIFT_HANDOFF_SAFETY_FIELDS = Object.freeze({
  mock: true,
  dryRun: true,
  shiftHandoffPreview: true,
  validationOnly: true,
  controlledHandlingOnly: true,
  executionEnabled: false,
  executorAvailable: false,
  executionAvailable: false,
  executionRequested: false,
  actionPerformed: false,
  commandDispatched: false,
  commandPersisted: false,
  receiptPersisted: false,
  bookingCreated: false,
  calendarChecked: false,
  appointmentCreated: false,
  calendarEventCreated: false,
  databasePersisted: false,
  persistence: "not_persisted",
  reviewMutated: false,
  reviewStateChanged: false,
  repositoryVersionChanged: false,
  queueMutated: false,
  queueCountChanged: false,
  handoffPersisted: false,
  handoffSent: false,
});

async function runAppointmentReviewShiftHandoffPreview(input, contracts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectShiftHandoff({
      code: "invalid_shift_handoff_input",
      reason: "Appointment review shift handoff input must be an object.",
    });
  }

  const adapter = input.routeRuntimeAdapter;

  if (
    !adapter ||
    typeof adapter !== "object" ||
    Array.isArray(adapter) ||
    typeof adapter.listAppointmentReviews !== "function" ||
    typeof adapter.getControlledActionDependencies !== "function"
  ) {
    return rejectShiftHandoff({
      code: "missing_shift_handoff_route_runtime_adapter",
      reason: "A route runtime adapter is required for shift handoff preview.",
    });
  }

  const runQueueReadiness =
    contracts.runQueueReadiness || runAppointmentReviewQueueReadinessPreview;
  const createResolutionGuidance =
    contracts.createResolutionGuidance || buildAppointmentReviewResolutionGuidance;
  const formatBrief =
    contracts.formatBrief || formatAppointmentReviewShiftHandoffBrief;
  let readinessResult;

  try {
    readinessResult = await runQueueReadiness(
      { routeRuntimeAdapter: adapter },
      contracts.queueReadinessContracts
    );
  } catch {
    return rejectShiftHandoff({
      code: "shift_handoff_readiness_failed",
      reason: "Queue readiness evaluation failed safely for shift handoff.",
    });
  }

  if (!isAcceptedQueueReadiness(readinessResult)) {
    return rejectShiftHandoff({
      code: "shift_handoff_readiness_rejected",
      reason: "Queue readiness did not complete, so no handoff was created.",
    });
  }

  let items;

  try {
    items = readinessResult.items.map((item) =>
      createShiftHandoffItem({
        item,
        createResolutionGuidance,
      })
    );
  } catch {
    return rejectShiftHandoff({
      code: "shift_handoff_guidance_failed",
      reason: "Resolution guidance mapping failed safely for shift handoff.",
    });
  }

  const structured = freezeClone({
    accepted: true,
    handoffPreviewPassed: true,
    handoffPreviewBlocked: false,
    mode: SHIFT_HANDOFF_MODE,
    preview: SHIFT_HANDOFF_PREVIEW_TYPE,
    code: "shift_handoff_preview_completed",
    reason: null,
    summary: createSummary(items),
    items,
    queueUnchanged: true,
    briefPersisted: false,
    briefSent: false,
    ...createSafetyFields(),
  });
  let plainTextBrief;

  try {
    plainTextBrief = formatBrief(structured);
  } catch {
    return rejectShiftHandoff({
      code: "shift_handoff_formatter_failed",
      reason: "Shift handoff formatter failed safely.",
    });
  }

  if (typeof plainTextBrief !== "string" || !plainTextBrief.trim()) {
    return rejectShiftHandoff({
      code: "shift_handoff_formatter_malformed",
      reason: "Shift handoff formatter returned malformed output safely.",
    });
  }

  return freezeClone({
    ...structured,
    plainTextBrief,
  });
}

function createShiftHandoffItem({ item, createResolutionGuidance }) {
  const comparisonResult = createGuidanceComparison(item);
  const guidance = createResolutionGuidance(comparisonResult);

  if (!guidance || guidance.accepted !== true) {
    throw new Error("Resolution guidance rejected.");
  }

  const branches = BRANCH_ORDER.map((branchName) =>
    createBranchHandoff({
      branchName,
      readinessPath: item[branchName],
      guidanceBranch: guidance[branchName],
    })
  );

  return freezeClone({
    reviewId: normalizeText(item.reviewId),
    trustedCurrentState: normalizeText(item.trustedCurrentState),
    observedReviewVersion: Number.isSafeInteger(item.observedReviewVersion)
      ? item.observedReviewVersion
      : null,
    readiness: normalizeText(item.readiness),
    branches,
    unresolvedChecks: createUniqueList(
      branches
        .filter((branch) => branch.outcome === "blocked")
        .map((branch) => branch.requiredCheck)
    ),
    followUpCategories: createUniqueList(
      branches
        .filter((branch) => branch.outcome === "blocked")
        .map((branch) => branch.followUpCategory)
    ),
    blockingStages: createUniqueList(
      branches
        .filter((branch) => branch.outcome === "blocked")
        .map((branch) => branch.blockingStage)
    ),
    executionEnabled: false,
    persistence: "not_persisted",
    reviewUnchanged: true,
    ...createSafetyFields(),
  });
}

function createGuidanceComparison(item) {
  return freezeClone({
    accepted: true,
    mode: SHIFT_HANDOFF_MODE,
    comparison: "decision_paths",
    reviewId: normalizeText(item.reviewId),
    trustedCurrentState: normalizeText(item.trustedCurrentState),
    observedReviewVersion: item.observedReviewVersion,
    paths: {
      approve: item.approve,
      reject: item.reject,
    },
  });
}

function createBranchHandoff({ branchName, readinessPath, guidanceBranch }) {
  return freezeClone({
    action: branchName,
    outcome: normalizeText(readinessPath && readinessPath.outcome) || "blocked",
    completedStage: normalizeNullableText(readinessPath && readinessPath.completedStage),
    blockingStage: normalizeNullableText(readinessPath && readinessPath.blockingStage),
    projectedNextState: normalizeNullableText(
      readinessPath && readinessPath.projectedNextState
    ),
    reasonCode: normalizeNullableText(guidanceBranch && guidanceBranch.reasonCode),
    requiredCheck:
      normalizeText(guidanceBranch && guidanceBranch.requiredCheck) || "none",
    followUpCategory:
      normalizeText(guidanceBranch && guidanceBranch.escalationCategory) ||
      "none",
    guidanceCategory:
      normalizeText(guidanceBranch && guidanceBranch.category) ||
      "manual_internal_review_required",
    executionEnabled: false,
    persistence: "not_persisted",
    ...createSafetyFields(),
  });
}

function createSummary(items) {
  const summary = {
    totalReviews: items.length,
    bothPathsAvailable: 0,
    approvePathOnly: 0,
    rejectPathOnly: 0,
    bothPathsBlocked: 0,
    requiresFollowUp: 0,
    noCurrentValidationBlocker: 0,
  };

  for (const item of items) {
    if (item.readiness === QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_AVAILABLE) {
      summary.bothPathsAvailable += 1;
      summary.noCurrentValidationBlocker += 1;
    }

    if (item.readiness === QUEUE_READINESS_CLASSIFICATIONS.APPROVE_PATH_ONLY) {
      summary.approvePathOnly += 1;
      summary.requiresFollowUp += 1;
    }

    if (item.readiness === QUEUE_READINESS_CLASSIFICATIONS.REJECT_PATH_ONLY) {
      summary.rejectPathOnly += 1;
      summary.requiresFollowUp += 1;
    }

    if (item.readiness === QUEUE_READINESS_CLASSIFICATIONS.BOTH_PATHS_BLOCKED) {
      summary.bothPathsBlocked += 1;
      summary.requiresFollowUp += 1;
    }
  }

  return freezeClone(summary);
}

function formatAppointmentReviewShiftHandoffBrief(handoff) {
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) {
    throw new Error("A safe structured handoff is required.");
  }

  const summary = handoff.summary || createSummary([]);
  const lines = [
    "INTERNAL APPOINTMENT REVIEW SHIFT HANDOFF",
    "Validation-only preview - not sent or saved",
    "",
    "Queue summary",
    `- Total reviews: ${summary.totalReviews}`,
    `- Both paths available: ${summary.bothPathsAvailable}`,
    `- Approve path only: ${summary.approvePathOnly}`,
    `- Reject path only: ${summary.rejectPathOnly}`,
    `- Both paths blocked: ${summary.bothPathsBlocked}`,
    `- Requires follow-up: ${summary.requiresFollowUp}`,
    "",
  ];

  if (!Array.isArray(handoff.items) || handoff.items.length === 0) {
    lines.push("Queue items", "- No appointment reviews are currently in the queue.", "");
  } else {
    for (const item of handoff.items) {
      lines.push(`Review: ${item.reviewId}`);
      lines.push(`Trusted state: ${item.trustedCurrentState}`);
      lines.push(`Observed version: ${item.observedReviewVersion}`);
      lines.push(`Readiness: ${item.readiness}`);

      for (const branchName of BRANCH_ORDER) {
        const branch = item.branches.find(
          (candidate) => candidate.action === branchName
        );

        lines.push(
          `${capitalize(branchName)} path: ${branch.outcome}`,
          `Required check: ${branch.requiredCheck}`,
          `Follow-up category: ${branch.followUpCategory}`,
          `Blocking stage: ${branch.blockingStage || "none"}`,
          `Projected next state: ${branch.projectedNextState || "none"}`
        );
      }

      lines.push("Execution: disabled", "Persistence: not performed", "");
    }
  }

  lines.push(
    "Safety",
    "- No review state was changed.",
    "- No action was performed.",
    "- No appointment was created.",
    "- No calendar event was created.",
    "- This brief was not sent or saved."
  );

  return lines.join("\n");
}

function isAcceptedQueueReadiness(result) {
  return Boolean(
    result &&
      typeof result === "object" &&
      result.accepted === true &&
      result.preview === "queue_decision_readiness_preview" &&
      result.validationOnly === true &&
      result.executionEnabled === false &&
      result.persistence === "not_persisted" &&
      result.summary &&
      Array.isArray(result.items)
  );
}

function rejectShiftHandoff({ code, reason }) {
  return freezeClone({
    accepted: false,
    handoffPreviewPassed: false,
    handoffPreviewBlocked: true,
    mode: SHIFT_HANDOFF_MODE,
    preview: SHIFT_HANDOFF_PREVIEW_TYPE,
    code,
    reason,
    summary: null,
    items: null,
    plainTextBrief: null,
    queueUnchanged: true,
    briefPersisted: false,
    briefSent: false,
    ...createSafetyFields(),
  });
}

function createUniqueList(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function createSafetyFields() {
  return { ...SHIFT_HANDOFF_SAFETY_FIELDS };
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);

  return normalized || null;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function capitalize(value) {
  const normalized = normalizeText(value);

  return normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)}` : "";
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
  BRANCH_ORDER,
  READINESS_ORDER,
  SHIFT_HANDOFF_MODE,
  SHIFT_HANDOFF_PREVIEW_TYPE,
  formatAppointmentReviewShiftHandoffBrief,
  runAppointmentReviewShiftHandoffPreview,
};
