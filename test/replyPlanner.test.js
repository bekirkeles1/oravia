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

test("reply planner answers doctor availability questions with treatment and day", () => {
  const result = planMessagingReply({
    message: "İmplant için çarşamba müsait doktor var mı?",
    classification: {
      intent: "unknown_intent",
      requires_handoff: true,
      reply:
        "Merhaba, sizi daha doğru yönlendirebilmem için mesajınızı klinik ekibimize aktaracağım."
    }
  });

  assert.equal(result.intent, "doctor_availability");
  assert.equal(result.requires_handoff, false);
  assert.equal(result.reply_source, "doctor_availability_mock");
  assert.equal(result.treatment_id, "implant");
  assert.match(result.reply_draft, /implant için Çarşamba günü/);
  assert.match(result.reply_draft, /Dr. Ayşe Demir/);
  assert.match(result.reply_draft, /10:00-13:00/);
  assert.match(result.reply_draft, /takvim çakışması/);
  assert.doesNotMatch(result.reply_draft, /randevunuz oluşturuldu/i);
});

test("reply planner summarizes doctor availability when no day is given", () => {
  const result = planMessagingReply({
    message: "Kanal tedavisi için müsait doktor var mı?",
    classification: {
      intent: "unknown_intent",
      requires_handoff: true,
      reply:
        "Merhaba, sizi daha doğru yönlendirebilmem için mesajınızı klinik ekibimize aktaracağım."
    }
  });

  assert.equal(result.intent, "doctor_availability");
  assert.equal(result.requires_handoff, false);
  assert.equal(result.reply_source, "doctor_availability_mock");
  assert.match(result.reply_draft, /kanal tedavisi için mock doktor çalışma programı/);
  assert.match(result.reply_draft, /Dr. Emre Kaya/);
  assert.match(result.reply_draft, /Pazartesi/);
  assert.match(result.reply_draft, /gerçek randevu oluşturmadan önce/);
  assert.doesNotMatch(result.reply_draft, /randevunuz oluşturuldu/i);
});

test("reply planner keeps handoff rules above doctor availability answers", () => {
  const result = planMessagingReply({
    message: "İmplant için çarşamba müsait doktor var mı, yüzüm şişti ve çok ağrıyor.",
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
});

test("reply planner does not treat general treatment info as availability", () => {
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
});
