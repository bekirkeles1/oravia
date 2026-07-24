const crypto = require("node:crypto");

function createWebhookSignature({ rawBody, appSecret }) {
  return `sha256=${crypto
    .createHmac("sha256", String(appSecret || ""))
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || "")))
    .digest("hex")}`;
}

function verifyWebhookSignature({ rawBody, signatureHeader, appSecret }) {
  const signature = String(signatureHeader || "").trim();
  const secret = String(appSecret || "").trim();

  if (!secret || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return reject("invalid_webhook_signature");
  }

  const expected = createWebhookSignature({ rawBody, appSecret: secret });
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return reject("invalid_webhook_signature");
  }

  return Object.freeze({ accepted: true });
}

function reject(code) {
  return Object.freeze({
    accepted: false,
    code,
    reason: "Webhook signature is invalid.",
  });
}

module.exports = {
  createWebhookSignature,
  verifyWebhookSignature,
};
