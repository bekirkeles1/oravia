const BRANCHES = Object.freeze(["approve", "reject"]);

function createResolutionChecklistSession(guidanceResult, previousSession = null) {
  const guidance = isAcceptedGuidance(guidanceResult) ? guidanceResult : null;

  if (!guidance) {
    return freezeClone(createEmptySession());
  }

  const sessionKey = createResolutionChecklistSessionKey(guidance);
  const previousCheckedKeys =
    previousSession && previousSession.sessionKey === sessionKey
      ? new Set(previousSession.checkedItemKeys || [])
      : new Set();
  const branches = Object.fromEntries(
    BRANCHES.map((branchName) => {
      const items = normalizeChecklistItems({
        branchName,
        checklist: guidance[branchName]?.checklist,
      });
      const itemKeys = new Set(items.map((item) => item.itemKey));
      const checkedItems = items.map((item) => ({
        ...item,
        reviewed: previousCheckedKeys.has(item.itemKey),
      }));

      return [
        branchName,
        createBranchProgress({
          branchName,
          items: checkedItems,
          itemKeys,
        }),
      ];
    })
  );
  const checkedItemKeys = BRANCHES.flatMap((branchName) =>
    branches[branchName].items
      .filter((item) => item.reviewed)
      .map((item) => item.itemKey)
  );

  return freezeClone({
    sessionKey,
    reviewId: String(guidance.reviewId || ""),
    observedReviewVersion: guidance.observedReviewVersion,
    checkedItemKeys,
    branches,
    totals: createTotals(branches),
    localOnly: true,
    persisted: false,
  });
}

function toggleResolutionChecklistItem(session, input) {
  if (!isValidSession(session) || !input || typeof input !== "object") {
    return freezeClone(session || createEmptySession());
  }

  const branchName = String(input.branchName || input.branch || "").trim();
  const itemCode = String(input.itemCode || input.code || "").trim();

  if (!BRANCHES.includes(branchName) || !itemCode) {
    return freezeClone(session);
  }

  const itemKey = createResolutionChecklistItemKey({
    branchName,
    itemCode,
  });
  const currentKeys = new Set(session.checkedItemKeys || []);
  const nextReviewed =
    typeof input.reviewed === "boolean"
      ? input.reviewed
      : !currentKeys.has(itemKey);

  if (nextReviewed) {
    currentKeys.add(itemKey);
  } else {
    currentKeys.delete(itemKey);
  }

  return reconcileSessionCheckedKeys(session, currentKeys);
}

function clearResolutionChecklistSession(session) {
  if (!isValidSession(session)) {
    return freezeClone(createEmptySession());
  }

  return reconcileSessionCheckedKeys(session, new Set());
}

function createResolutionChecklistSessionKey(guidanceResult) {
  if (!isAcceptedGuidance(guidanceResult)) {
    return "";
  }

  return [
    String(guidanceResult.reviewId || "").trim(),
    String(guidanceResult.observedReviewVersion),
  ].join(":");
}

function createResolutionChecklistItemKey({ branchName, itemCode }) {
  return `${String(branchName || "").trim()}:${String(itemCode || "").trim()}`;
}

function normalizeChecklistItems({ branchName, checklist }) {
  if (!Array.isArray(checklist)) {
    return [];
  }

  return checklist.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const code = String(item.code || "").trim();
    const label = String(item.label || "").trim();

    if (!code || !label) {
      return [];
    }

    return [
      {
        code,
        label,
        itemKey: createResolutionChecklistItemKey({
          branchName,
          itemCode: code,
        }),
      },
    ];
  });
}

function reconcileSessionCheckedKeys(session, checkedKeys) {
  const branches = Object.fromEntries(
    BRANCHES.map((branchName) => {
      const branch = session.branches[branchName];
      const items = branch.items.map((item) => ({
        ...item,
        reviewed: checkedKeys.has(item.itemKey),
      }));

      return [
        branchName,
        createBranchProgress({
          branchName,
          items,
          itemKeys: new Set(items.map((item) => item.itemKey)),
        }),
      ];
    })
  );
  const checkedItemKeys = BRANCHES.flatMap((branchName) =>
    branches[branchName].items
      .filter((item) => item.reviewed)
      .map((item) => item.itemKey)
  );

  return freezeClone({
    ...session,
    checkedItemKeys,
    branches,
    totals: createTotals(branches),
  });
}

function createBranchProgress({ branchName, items }) {
  const total = items.length;
  const reviewed = items.filter((item) => item.reviewed).length;

  return {
    branchName,
    items,
    reviewed,
    total,
    progressText: `${reviewed} / ${total} reviewed`,
  };
}

function createTotals(branches) {
  const total = BRANCHES.reduce((sum, branchName) => {
    return sum + branches[branchName].total;
  }, 0);
  const reviewed = BRANCHES.reduce((sum, branchName) => {
    return sum + branches[branchName].reviewed;
  }, 0);

  return {
    reviewed,
    total,
    progressText: `${reviewed} / ${total} reviewed`,
  };
}

function isAcceptedGuidance(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.accepted === true &&
      typeof value.reviewId === "string" &&
      Number.isSafeInteger(value.observedReviewVersion)
  );
}

function isValidSession(session) {
  return Boolean(
    session &&
      typeof session === "object" &&
      !Array.isArray(session) &&
      typeof session.sessionKey === "string" &&
      session.branches &&
      typeof session.branches === "object" &&
      BRANCHES.every(
        (branchName) =>
          session.branches[branchName] &&
          Array.isArray(session.branches[branchName].items)
      )
  );
}

function createEmptySession() {
  return {
    sessionKey: "",
    reviewId: "",
    observedReviewVersion: null,
    checkedItemKeys: [],
    branches: {
      approve: createBranchProgress({ branchName: "approve", items: [] }),
      reject: createBranchProgress({ branchName: "reject", items: [] }),
    },
    totals: {
      reviewed: 0,
      total: 0,
      progressText: "0 / 0 reviewed",
    },
    localOnly: true,
    persisted: false,
  };
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
  BRANCHES,
  clearResolutionChecklistSession,
  createResolutionChecklistItemKey,
  createResolutionChecklistSession,
  createResolutionChecklistSessionKey,
  toggleResolutionChecklistItem,
};
