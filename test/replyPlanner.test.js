const assert = require("node:assert/strict");
const test = require("node:test");

const { planMessagingReply } = require("../src/messaging/replyPlanner");

test("reply planner preserves appointment request reply draft", () => {
  const result = planMessagingReply({
    message: "İmplant için randevu almak istiyorum",
    classification: {
      intent: "appointment_request",
      requires_handoff: false,
      extracted_data: {
        treatment_interest: "implant"
      },
      reply:
        "Merhaba, yardımcı olmaktan memnuniyet duyarım. İmplant muayenesi için uygun randevu saatlerini kontrol ediyorum."
    }
  });

  assert.equal(result.intent, "appointment_request");
  assert.equal(result.requires_handoff, false);
  assert.equal(
    result.reply_draft,
    "İmplant randevusu için uygun saatleri kontrol ediyorum."
  );
  assert.equal(result.reply_source, "classifier");
  assert.equal(result.treatment_id, "implant");
});

test("reply planner answers treatment information from knowledge base", () => {
  const result = planMessagingReply({
    message: "İmplant nedir, bilgi alabilir miyim?",
    classification: {
      intent: "unknown_intent",
      requires_handoff: true,
      reply:
        "Merhaba, sizi daha doğru yönlendirebilmem için mesajınızı klinik ekibimize aktaracağım."
    }
  });

  assert.equal(result.intent, "treatment_info");
  assert.equal(result.requires_handoff, false);
  assert.equal(result.reply_source, "treatment_knowledge_base");
  assert.equal(result.treatment_id, "implant");
  assert.match(result.reply_draft, /eksik dişlerin yerine/);
  assert.match(result.reply_draft, /hekim muayenesi/);
  assert.match(result.reply_draft, /uygun randevu saatlerini kontrol edebilirim/);
});

test("reply planner answers dental cleaning information from knowledge base", () => {
  const result = planMessagingReply({
    message: "Diş taşı temizliği ne sıklıkla yapılmalı?",
    classification: {
      intent: "unknown_intent",
      requires_handoff: true,
      reply:
        "Merhaba, sizi daha doğru yönlendirebilmem için mesajınızı klinik ekibimize aktaracağım."
    }
  });

  assert.equal(result.intent, "treatment_info");
  assert.equal(result.requires_handoff, false);
  assert.equal(result.reply_source, "treatment_knowledge_base");
  assert.equal(result.treatment_id, "dental_cleaning");
  assert.match(result.reply_draft, /Diş taşı temizliği/);
});

test("reply planner falls back to classifier handoff for unknown messages", () => {
  const result = planMessagingReply({
    message: "Merhaba, nasılsınız?",
    classification: {
      intent: "unknown_intent",
      requires_handoff: true,
      reply:
        "Merhaba, sizi daha doğru yönlendirebilmem için mesajınızı klinik ekibimize aktaracağım."
    }
  });

  assert.equal(result.intent, "unknown_intent");
  assert.equal(result.requires_handoff, true);
  assert.equal(result.reply_source, "classifier");
  assert.equal(result.treatment_id, null);
  assert.match(result.reply_draft, /klinik ekibimize aktaracağım/);
});

test("reply planner prioritizes handoff rules over treatment answers", () => {
  const result = planMessagingReply({
    message: "İmplant yaptırdım, yüzüm şişti ve çok ağrıyor.",
    classification: {
      intent: "unknown_intent",
      requires_handoff: true,
      reply:
        "Merhaba, sizi daha doğru yönlendirebilmem için mesajınızı klinik ekibimize aktaracağım."
    }
  });

  assert.equal(result.intent, "handoff_required");
  assert.equal(result.requires_handoff, true);
  assert.equal(result.reply_source, "handoff_rules");
  assert.equal(result.treatment_id, null);
  assert.match(result.reply_draft, /klinik ekibimizin değerlendirmesini gerektiriyor/);
  assert.equal(
    result.handoff_reasons.some((reason) => reason.id === "swelling"),
    true
  );
});
