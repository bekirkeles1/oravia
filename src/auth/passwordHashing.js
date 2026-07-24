const {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} = require("node:crypto");

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});

function hashPassword(password) {
  const normalized = normalizePassword(password);

  if (!normalized) {
    return reject("invalid_password", "Password is required.");
  }

  const salt = randomBytes(16).toString("base64url");
  const hash = derivePasswordHash(normalized, salt);

  return freezeClone({
    accepted: true,
    algorithm: "scrypt",
    passwordHash: hash,
    passwordSalt: salt,
  });
}

function verifyPassword({ password, passwordHash, passwordSalt }) {
  const normalized = normalizePassword(password);
  const storedHash = normalizeText(passwordHash);
  const salt = normalizeText(passwordSalt);

  if (!normalized || !storedHash || !salt) {
    return false;
  }

  try {
    const derived = Buffer.from(derivePasswordHash(normalized, salt), "base64url");
    const stored = Buffer.from(storedHash, "base64url");

    if (derived.length !== stored.length) {
      return false;
    }

    return timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}

function derivePasswordHash(password, salt) {
  return scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS).toString(
    "base64url"
  );
}

function normalizePassword(value) {
  const password = String(value || "");
  return password.length >= 8 && password.length <= 256 ? password : "";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function reject(code, reason) {
  return freezeClone({ accepted: false, code, reason });
}

function freezeClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

module.exports = {
  hashPassword,
  verifyPassword,
};
