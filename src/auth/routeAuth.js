const { roleHasPermission } = require("./authRoles");
const { parseSessionCookie } = require("./authCookies");
const { createAuthRuntime } = require("./authRepositoryFactory");
const { resolveCurrentSession } = require("./authService");
const {
  isProductionRuntime,
  resolveTrustedOrigin,
} = require("../ops/productionConfig");

function resolveRouteActor(request, { permission } = {}) {
  if (!isAuthEnforced()) {
    return {
      accepted: true,
      actor: {
        actorId: "auth_disabled_local_actor",
        role: "manager",
        clinicId: "oravia_demo_clinic",
        verified: true,
      },
      clinicId: "oravia_demo_clinic",
      authDisabled: true,
    };
  }

  const runtime = createAuthRuntime({});

  try {
    const token = parseSessionCookie(request?.headers?.get?.("cookie"));
    const sessionResult = resolveCurrentSession({
      repository: runtime.repository,
      token,
    });

    if (!sessionResult.accepted) {
      return deny(401, "unauthorized", "Authentication is required.");
    }

    if (permission && !roleHasPermission(sessionResult.actor.role, permission)) {
      return deny(403, "forbidden", "This role is not allowed for this action.");
    }

    return {
      accepted: true,
      actor: sessionResult.actor,
      clinicId: sessionResult.actor.clinicId,
    };
  } finally {
    runtime.close();
  }
}

function validateMutationOrigin(request) {
  if (!isAuthEnforced()) {
    return { accepted: true };
  }

  const method = String(request?.method || "GET").toUpperCase();

  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return { accepted: true };
  }

  const origin = request?.headers?.get?.("origin");
  const host = request?.headers?.get?.("host");

  if (!origin || !host) {
    return isProductionRuntime()
      ? deny(403, "missing_origin", "Request origin is required.")
      : { accepted: true };
  }

  try {
    const parsed = new URL(origin);
    const trustedOrigin = resolveTrustedOrigin();
    if (trustedOrigin && parsed.origin !== trustedOrigin) {
      return deny(403, "invalid_origin", "Request origin is not allowed.");
    }

    if (isTrustedRequestHost(request, parsed.host)) {
      return { accepted: true };
    }
  } catch {}

  return deny(403, "invalid_origin", "Request origin is not allowed.");
}

function isTrustedRequestHost(request, originHost) {
  const host = String(request?.headers?.get?.("host") || "").trim();

  if (host === originHost) {
    return true;
  }

  if (!isProductionRuntime()) {
    return false;
  }

  const trustProxy = ["1", "true", "yes", "on"].includes(
    String(process.env.ORAVIA_TRUST_PROXY_HEADERS || "")
      .trim()
      .toLowerCase()
  );

  if (!trustProxy) {
    return false;
  }

  const forwardedHost = String(
    request?.headers?.get?.("x-forwarded-host") || ""
  ).trim();
  const forwardedProto = String(
    request?.headers?.get?.("x-forwarded-proto") || ""
  )
    .trim()
    .toLowerCase();

  return forwardedHost === originHost && forwardedProto === "https";
}

function isAuthEnforced() {
  return String(process.env.ORAVIA_AUTH_REQUIRED || "").trim() === "true";
}

function deny(status, code, reason) {
  return {
    accepted: false,
    status,
    body: {
      accepted: false,
      code,
      reason,
      authenticated: status !== 401,
      authorized: false,
    },
  };
}

module.exports = {
  isAuthEnforced,
  resolveRouteActor,
  validateMutationOrigin,
};
