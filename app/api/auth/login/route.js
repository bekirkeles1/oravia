const authCookies = require("../../../../src/auth/authCookies");
const authRepositoryFactory = require("../../../../src/auth/authRepositoryFactory");
const authService = require("../../../../src/auth/authService");
const loginThrottle = require("../../../../src/auth/loginThrottle");

async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return loginFailure(400);
  }

  const username = String(payload?.username || "").trim().toLowerCase();
  const password = String(payload?.password || "");
  const throttleKey = `${request.headers.get("x-forwarded-for") || "local"}:${username}`;

  if (!loginThrottle.activeLoginThrottle.check(throttleKey).accepted) {
    return loginFailure(429);
  }

  let runtime;

  try {
    runtime = authRepositoryFactory.createAuthRuntime({});
    const result = authService.authenticateCredentials({
      repository: runtime.repository,
      clinicId: runtime.clinicId,
      username,
      password,
    });

    if (!result.accepted) {
      loginThrottle.activeLoginThrottle.recordFailure(throttleKey);
      return loginFailure(401);
    }

    loginThrottle.activeLoginThrottle.reset(throttleKey);

    const response = Response.json({
      accepted: true,
      user: result.user,
      session: {
        expiresAt: result.session.expiresAt,
      },
    });
    response.headers.set(
      "set-cookie",
      authCookies.serializeSessionCookie(result.token, {
        secure: process.env.NODE_ENV === "production",
      })
    );
    return response;
  } catch {
    return loginFailure(500);
  } finally {
    if (runtime) {
      runtime.close();
    }
  }
}

function loginFailure(status) {
  return Response.json(
    {
      accepted: false,
      code: status === 429 ? "login_throttled" : "invalid_credentials",
      reason: "Invalid username or password.",
    },
    { status }
  );
}

module.exports = {
  POST,
};
