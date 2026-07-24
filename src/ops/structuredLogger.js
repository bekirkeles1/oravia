const LOG_LEVELS = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
});

const REDACTED = "[redacted]";
const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|credential|authorization|cookie|identity|phone|message|payload|sql|stack|databasePath|path|key)/i;

function createStructuredLogger(options = {}) {
  const levelName = normalizeLevel(
    options.level || process.env.ORAVIA_LOG_LEVEL || defaultLogLevel()
  );
  const sink = typeof options.sink === "function" ? options.sink : console.log;

  return Object.freeze({
    level: levelName,
    debug(event, metadata) {
      emit("debug", event, metadata);
    },
    info(event, metadata) {
      emit("info", event, metadata);
    },
    warn(event, metadata) {
      emit("warn", event, metadata);
    },
    error(event, metadata) {
      emit("error", event, metadata);
    },
  });

  function emit(level, event, metadata) {
    if (LOG_LEVELS[level] < LOG_LEVELS[levelName]) {
      return;
    }

    const record = {
      ts: new Date().toISOString(),
      level,
      event: normalizeToken(event) || "oravia_operation",
      ...redactMetadata(metadata),
    };

    sink(JSON.stringify(record));
  }
}

function redactMetadata(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) {
    return sanitizeScalar(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactMetadata(item, depth + 1));
  }

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = REDACTED;
      continue;
    }
    output[key] = redactMetadata(item, depth + 1);
  }
  return output;
}

function sanitizeScalar(value) {
  if (typeof value === "string") {
    if (looksSensitive(value)) {
      return REDACTED;
    }
    return value.slice(0, 180);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (value === undefined) {
    return undefined;
  }

  return REDACTED;
}

function looksSensitive(value) {
  const text = String(value || "");
  return (
    /Bearer\s+[a-z0-9._-]+/i.test(text) ||
    /sha256=[a-f0-9]{32,}/i.test(text) ||
    /\+?\d{10,15}/.test(text) ||
    /BEGIN [A-Z ]*PRIVATE KEY/.test(text)
  );
}

function normalizeLevel(value) {
  const level = String(value || "").trim().toLowerCase();
  return Object.hasOwn(LOG_LEVELS, level) ? level : "info";
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "_")
    .slice(0, 80);
}

function defaultLogLevel() {
  return process.env.NODE_ENV === "production" ? "info" : "warn";
}

module.exports = {
  REDACTED,
  createStructuredLogger,
  redactMetadata,
};
