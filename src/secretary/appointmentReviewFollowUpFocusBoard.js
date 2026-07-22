const {
  GUIDANCE_CATEGORIES,
} = require("./appointmentReviewResolutionGuidanceContract");
const {
  GUIDED_SESSION_FILTERS,
  GUIDED_SESSION_STATUSES,
  getAppointmentReviewGuidedSessionItem,
} = require("./appointmentReviewGuidedSession");

const FOLLOW_UP_CATEGORY_FILTER_ALL = "all_follow_up_categories";
const NO_SESSION_STATUS = "not_started";

const FOLLOW_UP_CATEGORY_LABELS = Object.freeze({
  [GUIDANCE_CATEGORIES.NO_ADDITIONAL_VALIDATION_CHECK]:
    "No current validation blocker",
  [GUIDANCE_CATEGORIES.REQUEST_CORRECTION_REQUIRED]:
    "Request correction required",
  [GUIDANCE_CATEGORIES.REVIEW_STATE_CHECK_REQUIRED]:
    "Review state check required",
  [GUIDANCE_CATEGORIES.REFRESH_REVIEW_REQUIRED]: "Refresh review required",
  [GUIDANCE_CATEGORIES.ACTOR_VERIFICATION_REQUIRED]:
    "Actor verification required",
  [GUIDANCE_CATEGORIES.IDEMPOTENCY_REVIEW_REQUIRED]:
    "Idempotency review required",
  [GUIDANCE_CATEGORIES.EXECUTION_POLICY_REVIEW_REQUIRED]:
    "Execution policy review required",
  [GUIDANCE_CATEGORIES.MANUAL_INTERNAL_REVIEW_REQUIRED]:
    "Manual internal review required",
});

const SUPPORTED_FOLLOW_UP_CATEGORIES = Object.freeze(
  Object.values(GUIDANCE_CATEGORIES)
);

function buildAppointmentReviewFollowUpFocusBoard(handoffResult, options = {}) {
  const allItems = normalizeHandoffItems(handoffResult);
  const categoryFilter = normalizeCategoryFilter(options.categoryFilter);
  const sessionFilter = normalizeSessionFilter(options.sessionFilter);
  const guidedSession = options.guidedSession || null;
  const filteredItems = filterAppointmentReviewFollowUpFocusItems(allItems, {
    categoryFilter,
    sessionFilter,
    guidedSession,
  });

  return freezeClone({
    active: isAcceptedHandoffResult(handoffResult),
    source: "secretary_shift_handoff_preview",
    categorySource: "appointment_review_resolution_guidance_v1",
    categoryFilter,
    sessionFilter,
    totalReviews: allItems.length,
    filteredReviewCount: filteredItems.length,
    categories: buildCategoryCounts(allItems),
    items: filteredItems,
    allItems,
    supportedCategories: SUPPORTED_FOLLOW_UP_CATEGORIES.map((code) => ({
      code,
      label: getAppointmentReviewFollowUpCategoryLabel(code),
    })),
    countsMayOverlap: true,
    localOnly: true,
    persisted: false,
    sentToServer: false,
  });
}

function filterAppointmentReviewFollowUpFocusItems(items, options = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const categoryFilter = normalizeCategoryFilter(options.categoryFilter);
  const sessionFilter = normalizeSessionFilter(options.sessionFilter);
  const guidedSession = options.guidedSession || null;

  return safeItems
    .map((item) => attachSessionStatus(item, guidedSession))
    .filter((item) => matchesCategoryFilter(item, categoryFilter))
    .filter((item) => matchesSessionFilter(item, sessionFilter));
}

function findNextUnreviewedAppointmentReviewInFocus(board, input = {}) {
  const items = board && Array.isArray(board.items) ? board.items : [];

  if (items.length === 0) {
    return null;
  }

  const selectedReviewId = normalizeText(input.selectedReviewId);
  const selectedIndex = items.findIndex(
    (item) => item.reviewId === selectedReviewId
  );
  const startIndex = selectedIndex >= 0 ? selectedIndex + 1 : 0;

  for (let offset = 0; offset < items.length; offset += 1) {
    const index = (startIndex + offset) % items.length;
    const item = items[index];

    if (item.sessionStatus !== GUIDED_SESSION_STATUSES.REVIEWED) {
      return item.reviewId;
    }
  }

  return null;
}

function getAppointmentReviewFollowUpCategoryLabel(category) {
  const normalized = normalizeText(category);

  return (
    FOLLOW_UP_CATEGORY_LABELS[normalized] ||
    normalized
      .split("_")
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() || ""}${part.slice(1)}`)
      .join(" ")
  );
}

function normalizeHandoffItems(handoffResult) {
  if (!isAcceptedHandoffResult(handoffResult)) {
    return [];
  }

  return handoffResult.items.flatMap(normalizeHandoffItem);
}

function normalizeHandoffItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return [];
  }

  const reviewId = normalizeText(item.reviewId);
  const observedReviewVersion = item.observedReviewVersion;

  if (!reviewId || !Number.isSafeInteger(observedReviewVersion)) {
    return [];
  }

  const followUpCategories = collectGuidanceCategories(item);

  return [
    freezeClone({
      reviewId,
      trustedCurrentState: normalizeText(item.trustedCurrentState),
      observedReviewVersion,
      readiness: normalizeText(item.readiness),
      followUpCategories,
      followUpCategoryLabels: followUpCategories.map(
        getAppointmentReviewFollowUpCategoryLabel
      ),
      sessionStatus: NO_SESSION_STATUS,
      sessionVersionChanged: false,
      executionEnabled: false,
      persistence: "not_persisted",
    }),
  ];
}

function collectGuidanceCategories(item) {
  const branchCategories = Array.isArray(item.branches)
    ? item.branches.map((branch) => branch && branch.guidanceCategory)
    : [];
  const fallbackCategories = Array.isArray(item.followUpCategories)
    ? item.followUpCategories
    : [];
  const categories = createUniqueList([...branchCategories, ...fallbackCategories])
    .filter((category) => SUPPORTED_FOLLOW_UP_CATEGORIES.includes(category));

  return categories.length > 0
    ? categories
    : [GUIDANCE_CATEGORIES.MANUAL_INTERNAL_REVIEW_REQUIRED];
}

function buildCategoryCounts(items) {
  const countsByCategory = new Map(
    SUPPORTED_FOLLOW_UP_CATEGORIES.map((category) => [category, 0])
  );

  for (const item of items) {
    for (const category of createUniqueList(item.followUpCategories)) {
      if (countsByCategory.has(category)) {
        countsByCategory.set(category, countsByCategory.get(category) + 1);
      }
    }
  }

  return [...countsByCategory.entries()]
    .map(([code, count]) => ({
      code,
      label: getAppointmentReviewFollowUpCategoryLabel(code),
      count,
    }))
    .filter((category) => category.count > 0);
}

function attachSessionStatus(item, guidedSession) {
  const sessionItem = getAppointmentReviewGuidedSessionItem(guidedSession, {
    id: item.reviewId,
    observedReviewVersion: item.observedReviewVersion,
  });

  return freezeClone({
    ...item,
    sessionStatus: sessionItem?.status || NO_SESSION_STATUS,
    sessionVersionChanged: sessionItem?.versionChanged === true,
  });
}

function matchesCategoryFilter(item, categoryFilter) {
  return (
    categoryFilter === FOLLOW_UP_CATEGORY_FILTER_ALL ||
    item.followUpCategories.includes(categoryFilter)
  );
}

function matchesSessionFilter(item, sessionFilter) {
  if (sessionFilter === GUIDED_SESSION_FILTERS.ALL) {
    return true;
  }

  if (sessionFilter === GUIDED_SESSION_FILTERS.UNREVIEWED) {
    return item.sessionStatus !== GUIDED_SESSION_STATUSES.REVIEWED;
  }

  if (sessionFilter === GUIDED_SESSION_FILTERS.REVIEWED) {
    return item.sessionStatus === GUIDED_SESSION_STATUSES.REVIEWED;
  }

  if (sessionFilter === GUIDED_SESSION_FILTERS.VERSION_CHANGED) {
    return item.sessionVersionChanged === true;
  }

  return true;
}

function normalizeCategoryFilter(value) {
  const normalized = normalizeText(value);

  return SUPPORTED_FOLLOW_UP_CATEGORIES.includes(normalized)
    ? normalized
    : FOLLOW_UP_CATEGORY_FILTER_ALL;
}

function normalizeSessionFilter(value) {
  const normalized = normalizeText(value);
  const supportedSessionFilters = Object.values(GUIDED_SESSION_FILTERS);

  return supportedSessionFilters.includes(normalized)
    ? normalized
    : GUIDED_SESSION_FILTERS.ALL;
}

function isAcceptedHandoffResult(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.accepted === true &&
      value.preview === "secretary_shift_handoff_preview" &&
      value.validationOnly === true &&
      Array.isArray(value.items)
  );
}

function createUniqueList(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
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
  FOLLOW_UP_CATEGORY_FILTER_ALL,
  FOLLOW_UP_CATEGORY_LABELS,
  NO_SESSION_STATUS,
  SUPPORTED_FOLLOW_UP_CATEGORIES,
  buildAppointmentReviewFollowUpFocusBoard,
  filterAppointmentReviewFollowUpFocusItems,
  findNextUnreviewedAppointmentReviewInFocus,
  getAppointmentReviewFollowUpCategoryLabel,
};
