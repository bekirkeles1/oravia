const SESSION_COOKIE_NAME = "oravia_session";
const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function serializeSessionCookie(token, options = {}) {
  const maxAge = Number.isSafeInteger(options.maxAgeSeconds)
    ? options.maxAgeSeconds
    : DEFAULT_SESSION_MAX_AGE_SECONDS;
  const secure = options.secure === true;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function serializeClearSessionCookie(options = {}) {
  const secure = options.secure === true;
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function parseSessionCookie(cookieHeader) {
  const header = String(cookieHeader || "");
  const parts = header.split(";").map((part) => part.trim());
  const sessionPart = parts.find((part) =>
    part.startsWith(`${SESSION_COOKIE_NAME}=`)
  );

  if (!sessionPart) {
    return "";
  }

  return decodeURIComponent(sessionPart.slice(SESSION_COOKIE_NAME.length + 1));
}

function shouldUseSecureSessionCookie() {
  if (process.env.NODE_ENV === "production") {
    return true;
  }

  return ["1", "true", "yes", "on"].includes(
    String(process.env.ORAVIA_SESSION_COOKIE_SECURE || "")
      .trim()
      .toLowerCase()
  );
}

module.exports = {
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  parseSessionCookie,
  shouldUseSecureSessionCookie,
  serializeClearSessionCookie,
  serializeSessionCookie,
};
