const {
  createWhatsAppRuntime,
} = require("../../../../src/messaging/whatsappRuntime");
const {
  verifyWebhookSignature,
} = require("../../../../src/messaging/whatsappWebhookSignature");

const MAX_WEBHOOK_BYTES = 256 * 1024;

async function GET(request) {
  const runtime = createWhatsAppRuntime({});

  try {
    if (!runtime.accepted) {
      return Response.json(
        {
          accepted: false,
          code: "whatsapp_webhook_not_configured",
        },
        { status: 503 }
      );
    }

    const url = new URL(request.url);
    const result = runtime.service.verifyChallenge({
      mode: url.searchParams.get("hub.mode"),
      token: url.searchParams.get("hub.verify_token"),
      challenge: url.searchParams.get("hub.challenge"),
    });

    return result.accepted
      ? new Response(result.challenge, { status: 200 })
      : Response.json(result.body, { status: result.status });
  } finally {
    runtime.close();
  }
}

async function POST(request) {
  const runtime = createWhatsAppRuntime({});

  try {
    if (!runtime.accepted) {
      return safeJson("whatsapp_webhook_not_configured", 503);
    }

    const rawBody = Buffer.from(await request.arrayBuffer());

    if (rawBody.length > MAX_WEBHOOK_BYTES) {
      return safeJson("whatsapp_webhook_payload_too_large", 413);
    }

    const signatureResult = verifyWebhookSignature({
      rawBody,
      signatureHeader: request.headers.get("x-hub-signature-256"),
      appSecret: runtime.config.appSecret,
    });

    if (!signatureResult.accepted) {
      return safeJson(signatureResult.code, 401);
    }

    let payload;

    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return safeJson("malformed_whatsapp_webhook_json", 400);
    }

    const result = await runtime.service.handlePayload(payload);
    return Response.json(result.body, { status: result.status });
  } catch {
    return safeJson("whatsapp_webhook_failed_safely", 500);
  } finally {
    runtime.close();
  }
}

function safeJson(code, status) {
  return Response.json(
    {
      accepted: false,
      code,
      reason: "WhatsApp webhook request was rejected safely.",
    },
    { status }
  );
}

module.exports = {
  GET,
  POST,
};
