const authCookies = require("../../../../src/auth/authCookies");
const authRepositoryFactory = require("../../../../src/auth/authRepositoryFactory");
const authService = require("../../../../src/auth/authService");

async function GET(request) {
  let runtime;

  try {
    runtime = authRepositoryFactory.createAuthRuntime({});
    const token = authCookies.parseSessionCookie(request.headers.get("cookie"));
    const result = authService.resolveCurrentSession({
      repository: runtime.repository,
      token,
    });

    if (!result.accepted) {
      return Response.json(result, { status: 401 });
    }

    return Response.json({
      accepted: true,
      user: result.actor,
      session: result.session,
    });
  } catch {
    return Response.json(
      {
        accepted: false,
        code: "auth_session_resolution_failed",
        reason: "Authentication failed safely.",
      },
      { status: 500 }
    );
  } finally {
    if (runtime) {
      runtime.close();
    }
  }
}

module.exports = {
  GET,
};
