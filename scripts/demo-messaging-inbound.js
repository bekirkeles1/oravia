const { handleMessagingInbound } = require("../src/api/messagingInboundHandler");

const sampleInboundMessage = {
  channel: "whatsapp",
  from: "+905322223333",
  message: "İmplant için randevu almak istiyorum",
  timestamp: "2026-07-06T15:30:00+03:00"
};

const result = handleMessagingInbound(sampleInboundMessage);

console.log(JSON.stringify(result.body, null, 2));

if (result.status >= 400) {
  process.exitCode = 1;
}
