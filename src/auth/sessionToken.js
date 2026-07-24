const { createHash, randomBytes } = require("node:crypto");

function createSessionToken() {
  const token = randomBytes(32).toString("base64url");
  return Object.freeze({
    token,
    tokenHash: hashSessionToken(token),
  });
}

function hashSessionToken(token) {
  const normalized = String(token || "").trim();

  if (!normalized || normalized.length > 256) {
    return "";
  }

  return createHash("sha256").update(normalized).digest("base64url");
}

module.exports = {
  createSessionToken,
  hashSessionToken,
};
