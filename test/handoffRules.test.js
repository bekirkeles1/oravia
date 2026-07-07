const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_HANDOFF_REPLY,
  evaluateHandoff
} = require("../src/messaging/handoffRules");

test("handoff rules return false for safe messages", () => {
  const result = evaluateHandoff("İmplant nedir, bilgi alabilir miyim?");

  assert.equal(result.requires_handoff, false);
  assert.deepEqual(result.matched_rules, []);
  assert.equal(result.reply_draft, null);
});

test("handoff rules detect severe pain", () => {
  const result = evaluateHandoff("Dişimde şiddetli ağrı var.");

  assert.equal(result.requires_handoff, true);
  assert.equal(result.matched_rules[0].id, "severe_pain");
  assert.equal(result.reply_draft, DEFAULT_HANDOFF_REPLY);
});

test("handoff rules detect swelling and bleeding", () => {
  const result = evaluateHandoff("Yüzüm şişti ve dişim kanıyor.");

  assert.equal(result.requires_handoff, true);
  assert.deepEqual(
    result.matched_rules.map((rule) => rule.id),
    ["swelling", "bleeding"]
  );
});

test("handoff rules detect medication questions", () => {
  const result = evaluateHandoff("Hangi antibiyotik kullanmalıyım?");

  assert.equal(result.requires_handoff, true);
  assert.equal(result.matched_rules[0].id, "medication_question");
});

test("handoff rules detect human contact request", () => {
  const result = evaluateHandoff("Sekreter ile konuşmak istiyorum.");

  assert.equal(result.requires_handoff, true);
  assert.equal(result.matched_rules[0].id, "human_requested");
});
