const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  clearResolutionChecklistSession,
  createResolutionChecklistItemKey,
  createResolutionChecklistSession,
  createResolutionChecklistSessionKey,
  toggleResolutionChecklistItem,
} = require("../src/secretary/appointmentReviewResolutionChecklistSession");

function createGuidance(overrides = {}) {
  return {
    accepted: true,
    reviewId: overrides.reviewId || "review_checklist_session",
    observedReviewVersion: overrides.observedReviewVersion || 3,
    approve: {
      checklist: overrides.approveChecklist || [
        {
          code: "request_correction_required.verify_selected_review_id",
          label: "Verify the selected review id is present.",
        },
        {
          code: "request_correction_required.rerun_after_metadata_correction",
          label: "Rerun the preview only after metadata is corrected.",
        },
      ],
    },
    reject: {
      checklist: overrides.rejectChecklist || [
        {
          code: "request_correction_required.verify_selected_review_id",
          label: "Verify the selected review id is present.",
        },
      ],
    },
  };
}

test("checklist session initializes branch-scoped unreviewed progress", () => {
  const session = createResolutionChecklistSession(createGuidance());

  assert.equal(session.sessionKey, "review_checklist_session:3");
  assert.equal(session.localOnly, true);
  assert.equal(session.persisted, false);
  assert.equal(session.branches.approve.total, 2);
  assert.equal(session.branches.reject.total, 1);
  assert.equal(session.branches.approve.reviewed, 0);
  assert.equal(session.totals.progressText, "0 / 3 reviewed");
  assert.deepEqual(session.checkedItemKeys, []);
  assert.deepEqual(
    session.branches.approve.items.map((item) => item.itemKey),
    [
      "approve:request_correction_required.verify_selected_review_id",
      "approve:request_correction_required.rerun_after_metadata_correction",
    ]
  );
  assert.equal(Object.isFrozen(session), true);
});

test("checklist session toggles one local item without mutating guidance", () => {
  const guidance = createGuidance();
  const before = JSON.stringify(guidance);
  const session = createResolutionChecklistSession(guidance);
  const toggled = toggleResolutionChecklistItem(session, {
    branchName: "approve",
    itemCode: "request_correction_required.verify_selected_review_id",
  });

  assert.equal(JSON.stringify(guidance), before);
  assert.equal(toggled.branches.approve.reviewed, 1);
  assert.equal(toggled.branches.approve.progressText, "1 / 2 reviewed");
  assert.equal(toggled.branches.reject.reviewed, 0);
  assert.equal(
    toggled.branches.approve.items[0].reviewed,
    true
  );
  assert.equal(session.branches.approve.items[0].reviewed, false);
});

test("checklist session keeps identical item codes isolated by branch", () => {
  const session = createResolutionChecklistSession(createGuidance());
  const toggled = toggleResolutionChecklistItem(session, {
    branchName: "approve",
    itemCode: "request_correction_required.verify_selected_review_id",
  });

  assert.equal(
    createResolutionChecklistItemKey({
      branchName: "approve",
      itemCode: "request_correction_required.verify_selected_review_id",
    }),
    "approve:request_correction_required.verify_selected_review_id"
  );
  assert.equal(toggled.branches.approve.items[0].reviewed, true);
  assert.equal(toggled.branches.reject.items[0].reviewed, false);
});

test("checklist session clears local marks without changing guidance session identity", () => {
  const session = createResolutionChecklistSession(createGuidance());
  const toggled = toggleResolutionChecklistItem(session, {
    branchName: "approve",
    itemCode: "request_correction_required.verify_selected_review_id",
  });
  const cleared = clearResolutionChecklistSession(toggled);

  assert.equal(cleared.sessionKey, toggled.sessionKey);
  assert.equal(cleared.branches.approve.reviewed, 0);
  assert.equal(cleared.branches.reject.reviewed, 0);
  assert.equal(cleared.totals.progressText, "0 / 3 reviewed");
  assert.deepEqual(cleared.checkedItemKeys, []);
});

test("checklist session reconciles same-version checklist changes by exact item key", () => {
  const initial = createResolutionChecklistSession(createGuidance());
  const toggled = toggleResolutionChecklistItem(initial, {
    branchName: "approve",
    itemCode: "request_correction_required.verify_selected_review_id",
  });
  const fresh = createResolutionChecklistSession(
    createGuidance({
      approveChecklist: [
        {
          code: "request_correction_required.verify_selected_review_id",
          label: "Renamed display text must not change item identity.",
        },
        {
          code: "request_correction_required.verify_supported_action_metadata",
          label: "Verify supported action metadata.",
        },
      ],
    }),
    toggled
  );

  assert.equal(fresh.sessionKey, toggled.sessionKey);
  assert.equal(fresh.branches.approve.items[0].reviewed, true);
  assert.equal(fresh.branches.approve.items[1].reviewed, false);
  assert.equal(fresh.branches.approve.reviewed, 1);
  assert.deepEqual(fresh.checkedItemKeys, [
    "approve:request_correction_required.verify_selected_review_id",
  ]);
});

test("checklist session resets all marks for new trusted version or review", () => {
  const initial = createResolutionChecklistSession(createGuidance());
  const toggled = toggleResolutionChecklistItem(initial, {
    branchName: "approve",
    itemCode: "request_correction_required.verify_selected_review_id",
  });
  const newVersion = createResolutionChecklistSession(
    createGuidance({ observedReviewVersion: 4 }),
    toggled
  );
  const newReview = createResolutionChecklistSession(
    createGuidance({ reviewId: "review_other" }),
    toggled
  );

  assert.equal(createResolutionChecklistSessionKey(newVersion), "");
  assert.equal(newVersion.sessionKey, "review_checklist_session:4");
  assert.equal(newVersion.totals.reviewed, 0);
  assert.equal(newReview.sessionKey, "review_other:3");
  assert.equal(newReview.totals.reviewed, 0);
});

test("checklist session helper has no storage network or persistence access", () => {
  const source = fs.readFileSync(
    "src/secretary/appointmentReviewResolutionChecklistSession.js",
    "utf8"
  );

  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(
    source,
    new RegExp(
      [
        "local" + "Storage",
        "session" + "Storage",
        "indexed" + "DB",
        "cookie",
      ].join("|"),
      "i"
    )
  );
  assert.doesNotMatch(source, new RegExp(["process", "env"].join("[.]")));
  assert.doesNotMatch(source, /repository|adapter|runtime|provider/i);
  assert.doesNotMatch(
    source,
    new RegExp(
      [
        "create" + "Appointment",
        "create" + "CalendarEvent",
        "get" + "CalendarProvider",
      ].join("|")
    )
  );
  assert.doesNotMatch(
    source,
    new RegExp(["google" + "apis", "pris" + "ma", "supa" + "base", "red" + "is"].join("|"), "i")
  );
});
