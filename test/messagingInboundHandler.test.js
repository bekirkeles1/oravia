const assert = require("node:assert/strict");
const test = require("node:test");

const {
  handleMessagingInbound
} = require("../src/api/messagingInboundHandler");

const validInput = {
  channel: "whatsapp",
  from: "+905322223333",
  message: "İmplant için randevu almak istiyorum",
  timestamp: "2026-07-06T15:30:00+03:00"
};

test("messaging inbound handler validates missing required fields", () => {
  const result = handleMessagingInbound({});

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "Missing required messaging inbound fields.");
  assert.deepEqual(result.body.missing_fields, [
    "channel",
    "from",
    "message",
    "timestamp"
  ]);
});

test("messaging inbound handler rejects unsupported channel", () => {
  const result = handleMessagingInbound({
    ...validInput,
    channel: "instagram"
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Unsupported messaging channel "instagram".');
  assert.deepEqual(result.body.supported_channels, ["whatsapp"]);
});

test("messaging inbound handler rejects blank message", () => {
  const result = handleMessagingInbound({
    ...validInput,
    message: "   "
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "Missing required messaging inbound fields.");
  assert.deepEqual(result.body.missing_fields, ["message"]);
});

test("messaging inbound handler rejects invalid timestamp", () => {
  const result = handleMessagingInbound({
    ...validInput,
    timestamp: "not-a-date"
  });

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error,
    "timestamp must be a valid date/time string."
  );
  assert.equal(result.body.field, "timestamp");
});

test("messaging inbound handler returns appointment_request for WhatsApp implant appointment message", () => {
  const result = handleMessagingInbound(validInput);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    status: "received",
    channel: "whatsapp",
    from: "+905322223333",
    intent: "appointment_request",
    requires_handoff: false,
    reply_draft: "İmplant randevusu için uygun saatleri kontrol ediyorum."
  });
});

test("messaging inbound handler returns requires_handoff true for unknown intent", () => {
  const result = handleMessagingInbound({
    ...validInput,
    message: "Merhaba, nasılsınız?"
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.status, "received");
  assert.equal(result.body.intent, "unknown_intent");
  assert.equal(result.body.requires_handoff, true);
  assert.match(result.body.reply_draft, /klinik ekibimize aktaracağım/);
});

test("messaging inbound handler does not call calendar provider or appointment creation", () => {
  let calendarProviderCalled = false;
  let appointmentCreationCalled = false;
  const result = handleMessagingInbound(validInput, {
    calendarProvider() {
      calendarProviderCalled = true;
    },
    createAppointment() {
      appointmentCreationCalled = true;
    }
  });

  assert.equal(result.status, 200);
  assert.equal(calendarProviderCalled, false);
  assert.equal(appointmentCreationCalled, false);
});

test("messaging inbound handler preserves channel and from in response", () => {
  const result = handleMessagingInbound({
    ...validInput,
    from: "+905551112233"
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.channel, "whatsapp");
  assert.equal(result.body.from, "+905551112233");
});

test("messaging inbound handler can return treatment info reply through reply planner", () => {
  const result = handleMessagingInbound({
    channel: "whatsapp",
    from: "+905322223333",
    message: "İmplant nedir, bilgi alabilir miyim?",
    timestamp: "2026-07-06T15:35:00+03:00"
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.status, "received");
  assert.equal(result.body.channel, "whatsapp");
  assert.equal(result.body.from, "+905322223333");
  assert.equal(result.body.intent, "treatment_info");
  assert.equal(result.body.requires_handoff, false);
  assert.match(result.body.reply_draft, /eksik dişlerin yerine/);
  assert.match(result.body.reply_draft, /hekim muayenesi/);
});
