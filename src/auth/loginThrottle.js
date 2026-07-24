const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000;

function createInMemoryLoginThrottle() {
  const attempts = new Map();

  return Object.freeze({
    check(key, now = Date.now()) {
      const safeKey = normalizeKey(key);

      if (!safeKey) {
        return { accepted: false };
      }

      const record = attempts.get(safeKey);

      if (!record || record.resetAt <= now) {
        return { accepted: true };
      }

      return { accepted: record.count < MAX_ATTEMPTS };
    },
    recordFailure(key, now = Date.now()) {
      const safeKey = normalizeKey(key);

      if (!safeKey) {
        return;
      }

      const record = attempts.get(safeKey);

      if (!record || record.resetAt <= now) {
        attempts.set(safeKey, { count: 1, resetAt: now + WINDOW_MS });
        return;
      }

      attempts.set(safeKey, {
        count: record.count + 1,
        resetAt: record.resetAt,
      });
    },
    reset(key) {
      attempts.delete(normalizeKey(key));
    },
  });
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().slice(0, 160);
}

const activeLoginThrottle = createInMemoryLoginThrottle();

module.exports = {
  MAX_ATTEMPTS,
  activeLoginThrottle,
  createInMemoryLoginThrottle,
};
