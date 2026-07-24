function applySecurityHeaders(headers, env = process.env) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "form-action 'self'",
    ].join("; ")
  );

  if (
    String(env.NODE_ENV || "") === "production" &&
    isHttpsUrl(env.ORAVIA_PUBLIC_BASE_URL)
  ) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains"
    );
  }

  return headers;
}

function isHttpsUrl(value) {
  try {
    return new URL(String(value || "")).protocol === "https:";
  } catch {
    return false;
  }
}

module.exports = {
  applySecurityHeaders,
};
