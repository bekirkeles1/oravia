const {
  handleGetSecretaryDoctors,
} = require("../../../../src/api/secretaryDoctorsHandler");
const {
  AUTH_PERMISSIONS,
} = require("../../../../src/auth/authRoles");
const { resolveRouteActor } = require("../../../../src/auth/routeAuth");

async function GET(request) {
  const authResult = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.READ_OPERATIONAL,
  });

  if (!authResult.accepted) {
    return Response.json(authResult.body, { status: authResult.status });
  }

  const result = handleGetSecretaryDoctors();

  return Response.json(result.body, {
    status: result.statusCode,
  });
}

module.exports = {
  GET,
};
