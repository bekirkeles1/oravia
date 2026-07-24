const authCookies = require("../../../../src/auth/authCookies");
const authRepositoryFactory = require("../../../../src/auth/authRepositoryFactory");
const authService = require("../../../../src/auth/authService");

async function POST(request) {
  let runtime;

  try {
    runtime = authRepositoryFactory.createAuthRuntime({});
    const token = authCookies.parseSessionCookie(request.headers.get("cookie"));
    authService.revokeSession({ repository: runtime.repository, token });
  } catch {
  } finally {
    if (runtime) {
      runtime.close();
    }
  }

  const response = Response.json({ accepted: true, loggedOut: true });
  response.headers.set(
    "set-cookie",
    authCookies.serializeClearSessionCookie({
      secure: process.env.NODE_ENV === "production",
    })
  );
  return response;
}

module.exports = {
  POST,
};
