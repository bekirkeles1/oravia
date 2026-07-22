const GUIDED_SESSION_FILTERS = Object.freeze({
  ALL: "all_session_reviews",
  UNREVIEWED: "unreviewed",
  REVIEWED: "reviewed_locally",
  VERSION_CHANGED: "version_changed",
});

const GUIDED_SESSION_STATUSES = Object.freeze({
  UNREVIEWED: "unreviewed",
  REVIEWED: "reviewed_locally",
});

function initializeAppointmentReviewGuidedSession(reviews, previousSession = null) {
  const safeReviews = normalizeReviews(reviews);
  const previousItemsById = createPreviousItemsById(previousSession);
  const items = safeReviews.map((review) => {
    const previousItem = previousItemsById.get(review.reviewId);
    const itemKey = getAppointmentReviewGuidedSessionItemKey(review);
    const sameVersion = previousItem && previousItem.itemKey === itemKey;
    const wasReviewed =
      sameVersion &&
      previousItem.status === GUIDED_SESSION_STATUSES.REVIEWED;
    const versionChanged = Boolean(
      previousItem &&
        previousItem.status === GUIDED_SESSION_STATUSES.REVIEWED &&
        !sameVersion
    );

    return {
      reviewId: review.reviewId,
      observedReviewVersion: review.observedReviewVersion,
      itemKey,
      status: wasReviewed
        ? GUIDED_SESSION_STATUSES.REVIEWED
        : GUIDED_SESSION_STATUSES.UNREVIEWED,
      reviewedLocally: wasReviewed,
      versionChanged,
    };
  });

  return freezeClone({
    active: true,
    items,
    reviewedItemKeys: items
      .filter((item) => item.reviewedLocally)
      .map((item) => item.itemKey),
    totals: createTotals(items),
    versionChangeNotice: createVersionChangeNotice(items),
    localOnly: true,
    persisted: false,
    sentToServer: false,
  });
}

function getEmptyAppointmentReviewGuidedSession() {
  return freezeClone({
    active: false,
    items: [],
    reviewedItemKeys: [],
    totals: createTotals([]),
    versionChangeNotice: "",
    localOnly: true,
    persisted: false,
    sentToServer: false,
  });
}

function markAppointmentReviewGuidedSessionItem(session, input) {
  if (!isActiveSession(session) || !input || typeof input !== "object") {
    return freezeClone(session || getEmptyAppointmentReviewGuidedSession());
  }

  const reviewId = normalizeText(input.reviewId || input.id);
  const observedReviewVersion = normalizeVersion(input.observedReviewVersion);
  const itemKey = getAppointmentReviewGuidedSessionItemKey({
    reviewId,
    observedReviewVersion,
  });
  const reviewedLocally = input.reviewedLocally !== false;
  const items = session.items.map((item) => {
    if (item.itemKey !== itemKey) {
      return item;
    }

    return {
      ...item,
      status: reviewedLocally
        ? GUIDED_SESSION_STATUSES.REVIEWED
        : GUIDED_SESSION_STATUSES.UNREVIEWED,
      reviewedLocally,
      versionChanged: false,
    };
  });

  return createSessionFromItems(items);
}

function clearAppointmentReviewGuidedSessionItem(session, input) {
  return markAppointmentReviewGuidedSessionItem(session, {
    ...input,
    reviewedLocally: false,
  });
}

function reconcileAppointmentReviewGuidedSession(session, reviews) {
  if (!isActiveSession(session)) {
    return freezeClone(session || getEmptyAppointmentReviewGuidedSession());
  }

  return initializeAppointmentReviewGuidedSession(reviews, session);
}

function findNextUnreviewedAppointmentReviewId(session, input = {}) {
  if (!isActiveSession(session) || session.items.length === 0) {
    return null;
  }

  const selectedReviewId = normalizeText(input.selectedReviewId);
  const selectedIndex = session.items.findIndex(
    (item) => item.reviewId === selectedReviewId
  );
  const startIndex = selectedIndex >= 0 ? selectedIndex + 1 : 0;

  for (let offset = 0; offset < session.items.length; offset += 1) {
    const index = (startIndex + offset) % session.items.length;
    const item = session.items[index];

    if (item.status === GUIDED_SESSION_STATUSES.UNREVIEWED) {
      return item.reviewId;
    }
  }

  return null;
}

function filterAppointmentReviewsByGuidedSession(reviews, session, filter) {
  const safeReviews = Array.isArray(reviews) ? reviews : [];
  const safeFilter = normalizeText(filter) || GUIDED_SESSION_FILTERS.ALL;

  if (!isActiveSession(session) || safeFilter === GUIDED_SESSION_FILTERS.ALL) {
    return [...safeReviews];
  }

  const itemsById = new Map(session.items.map((item) => [item.reviewId, item]));

  return safeReviews.filter((review) => {
    const reviewId = normalizeText(review && review.id);
    const item = itemsById.get(reviewId);

    if (!item) {
      return false;
    }

    if (safeFilter === GUIDED_SESSION_FILTERS.UNREVIEWED) {
      return item.status === GUIDED_SESSION_STATUSES.UNREVIEWED;
    }

    if (safeFilter === GUIDED_SESSION_FILTERS.REVIEWED) {
      return item.status === GUIDED_SESSION_STATUSES.REVIEWED;
    }

    if (safeFilter === GUIDED_SESSION_FILTERS.VERSION_CHANGED) {
      return item.versionChanged === true;
    }

    return true;
  });
}

function getAppointmentReviewGuidedSessionItem(session, review) {
  if (!isActiveSession(session)) {
    return null;
  }

  const projection = normalizeReview(review).at(0);

  if (!projection) {
    return null;
  }

  return (
    session.items.find(
      (item) =>
        item.reviewId === projection.reviewId &&
        item.observedReviewVersion === projection.observedReviewVersion
    ) || null
  );
}

function getAppointmentReviewGuidedSessionItemKey(review) {
  const reviewId = normalizeText(review && review.reviewId);
  const observedReviewVersion = normalizeVersion(
    review && review.observedReviewVersion
  );

  if (!reviewId) {
    return "";
  }

  return `${reviewId}:${observedReviewVersion}`;
}

function createSessionFromItems(items) {
  const safeItems = items.map((item) => ({
    reviewId: item.reviewId,
    observedReviewVersion: item.observedReviewVersion,
    itemKey: item.itemKey,
    status: item.status,
    reviewedLocally: item.reviewedLocally === true,
    versionChanged: item.versionChanged === true,
  }));

  return freezeClone({
    active: true,
    items: safeItems,
    reviewedItemKeys: safeItems
      .filter((item) => item.reviewedLocally)
      .map((item) => item.itemKey),
    totals: createTotals(safeItems),
    versionChangeNotice: createVersionChangeNotice(safeItems),
    localOnly: true,
    persisted: false,
    sentToServer: false,
  });
}

function createTotals(items) {
  const total = items.length;
  const reviewed = items.filter(
    (item) => item.status === GUIDED_SESSION_STATUSES.REVIEWED
  ).length;
  const stale = items.filter((item) => item.versionChanged === true).length;
  const remaining = total - reviewed;

  return {
    total,
    reviewed,
    remaining,
    stale,
    progressText: `${reviewed} / ${total} reviewed locally`,
  };
}

function createVersionChangeNotice(items) {
  return items.some((item) => item.versionChanged === true)
    ? "The trusted review version changed. Local reviewed status was reset."
    : "";
}

function createPreviousItemsById(session) {
  if (!isActiveSession(session)) {
    return new Map();
  }

  return new Map(session.items.map((item) => [item.reviewId, item]));
}

function normalizeReviews(reviews) {
  if (!Array.isArray(reviews)) {
    return [];
  }

  return reviews.flatMap(normalizeReview);
}

function normalizeReview(review) {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    return [];
  }

  const reviewId = normalizeText(review.id || review.reviewId);

  if (!reviewId) {
    return [];
  }

  return [
    {
      reviewId,
      observedReviewVersion: normalizeVersion(
        review.observedReviewVersion || review.version
      ),
    },
  ];
}

function normalizeVersion(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function isActiveSession(session) {
  return Boolean(
    session &&
      typeof session === "object" &&
      !Array.isArray(session) &&
      session.active === true &&
      Array.isArray(session.items)
  );
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
  GUIDED_SESSION_FILTERS,
  GUIDED_SESSION_STATUSES,
  clearAppointmentReviewGuidedSessionItem,
  initializeAppointmentReviewGuidedSession,
  getAppointmentReviewGuidedSessionItemKey,
  getEmptyAppointmentReviewGuidedSession,
  filterAppointmentReviewsByGuidedSession,
  findNextUnreviewedAppointmentReviewId,
  getAppointmentReviewGuidedSessionItem,
  markAppointmentReviewGuidedSessionItem,
  reconcileAppointmentReviewGuidedSession,
};
