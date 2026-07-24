const crypto = require("node:crypto");

const KEY_INFO_ENCRYPTION = "oravia-whatsapp-channel-identity-encryption-v1";
const KEY_INFO_LOOKUP = "oravia-whatsapp-channel-identity-lookup-v1";

function createChannelIdentityCrypto({ masterKey }) {
  const safeMasterKey = normalizeMasterKey(masterKey);

  if (!safeMasterKey) {
    throw new Error("Channel identity master key is required.");
  }

  const encryptionKey = deriveKey(safeMasterKey, KEY_INFO_ENCRYPTION);
  const lookupKey = deriveKey(safeMasterKey, KEY_INFO_LOOKUP);

  return Object.freeze({
    encryptIdentity({ clinicId, provider, businessPhoneNumberId, rawIdentity }) {
      const normalized = normalizeRawIdentity(rawIdentity);
      const aad = buildAssociatedData({
        clinicId,
        provider,
        businessPhoneNumberId,
      });

      if (!normalized || !aad) {
        return reject("invalid_channel_identity_input");
      }

      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
      cipher.setAAD(Buffer.from(aad));
      const ciphertext = Buffer.concat([
        cipher.update(normalized, "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      return freezeClone({
        accepted: true,
        encrypted: {
          alg: "aes-256-gcm",
          iv: iv.toString("base64url"),
          ciphertext: ciphertext.toString("base64url"),
          tag: tag.toString("base64url"),
        },
        lookupHash: createLookupHash({
          clinicId,
          provider,
          businessPhoneNumberId,
          rawIdentity: normalized,
        }),
        maskedLabel: maskIdentity(normalized),
      });
    },
    decryptIdentity({ clinicId, provider, businessPhoneNumberId, encrypted }) {
      const aad = buildAssociatedData({
        clinicId,
        provider,
        businessPhoneNumberId,
      });

      try {
        if (!aad || encrypted?.alg !== "aes-256-gcm") {
          return reject("invalid_encrypted_channel_identity");
        }

        const decipher = crypto.createDecipheriv(
          "aes-256-gcm",
          encryptionKey,
          Buffer.from(encrypted.iv, "base64url")
        );
        decipher.setAAD(Buffer.from(aad));
        decipher.setAuthTag(Buffer.from(encrypted.tag, "base64url"));
        const plaintext = Buffer.concat([
          decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
          decipher.final(),
        ]).toString("utf8");

        return freezeClone({
          accepted: true,
          rawIdentity: plaintext,
          maskedLabel: maskIdentity(plaintext),
        });
      } catch {
        return reject("channel_identity_decrypt_failed");
      }
    },
    createLookupHash,
    maskIdentity,
  });

  function createLookupHash({
    clinicId,
    provider,
    businessPhoneNumberId,
    rawIdentity,
  }) {
    const normalized = normalizeRawIdentity(rawIdentity);
    const aad = buildAssociatedData({
      clinicId,
      provider,
      businessPhoneNumberId,
    });

    if (!normalized || !aad) {
      return "";
    }

    return crypto
      .createHmac("sha256", lookupKey)
      .update(`${aad}|${normalized}`)
      .digest("base64url");
  }
}

function deriveKey(masterKey, info) {
  return crypto.hkdfSync(
    "sha256",
    Buffer.from(masterKey),
    Buffer.from("oravia-whatsapp-channel-identity"),
    Buffer.from(info),
    32
  );
}

function buildAssociatedData({ clinicId, provider, businessPhoneNumberId }) {
  const parts = [clinicId, provider, businessPhoneNumberId].map((value) =>
    String(value || "").trim()
  );
  return parts.every(Boolean) ? parts.join("|") : "";
}

function normalizeMasterKey(value) {
  const key = String(value || "").trim();
  return key.length >= 32 ? key : "";
}

function normalizeRawIdentity(value) {
  return String(value || "").trim();
}

function maskIdentity(value) {
  const text = normalizeRawIdentity(value);
  if (!text) {
    return "";
  }
  return `whatsapp:***${text.slice(-2)}`;
}

function reject(code) {
  return freezeClone({
    accepted: false,
    code,
    reason: "Channel identity operation failed safely.",
  });
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  createChannelIdentityCrypto,
};
