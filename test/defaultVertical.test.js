const assert = require("node:assert/strict");
const test = require("node:test");

const {
  clearVerticalRegistryForTests,
  getActiveVertical,
  registerVertical,
} = require("../src/assistant/verticalRegistry");
const {
  getActiveAssistantVertical,
  getDefaultAssistantVertical,
} = require("../src/assistant/defaultVertical");
const { planMessagingReply } = require("../src/messaging/replyPlanner");

test.beforeEach(() => {
  clearVerticalRegistryForTests();
});

test("default assistant vertical resolver registers dental for Oravia", () => {
  const defaultVertical = getDefaultAssistantVertical();

  assert.equal(defaultVertical.id, "dental");
  assert.equal(defaultVertical.name, "Dental clinic");
  assert.equal(getActiveVertical(), defaultVertical);
  assert.equal(getActiveAssistantVertical(), defaultVertical);
});

test("default assistant vertical does not replace an explicitly active vertical", () => {
  const fakeVertical = {
    id: "fake",
    name: "Fake vertical",
  };

  registerVertical(fakeVertical, { active: true });

  assert.equal(getDefaultAssistantVertical().id, "dental");
  assert.equal(getActiveAssistantVertical(), fakeVertical);
});

test("reply planner works through the default app vertical", () => {
  const result = planMessagingReply({
    message: "İmplant nedir, bilgi alabilir miyim?",
    classification: {
      intent: "unknown_intent",
      requires_handoff: true,
      reply:
        "Merhaba, sizi daha doğru yönlendirebilmem için mesajınızı klinik ekibimize aktaracağım.",
    },
  });

  assert.equal(result.intent, "treatment_info");
  assert.equal(result.requires_handoff, false);
  assert.equal(result.treatment_id, "implant");
  assert.match(result.reply_draft, /eksik dişlerin yerine/);
});
