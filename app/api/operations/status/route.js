const { AUTH_PERMISSIONS } = require("../../../../src/auth/authRoles");
const { resolveRouteActor } = require("../../../../src/auth/routeAuth");
const { getOperationsStatus } = require("../../../../src/ops/operationsStatus");
const {
  attachCorrelationHeader,
  resolveRequestCorrelationId,
} = require("../../../../src/ops/requestCorrelation");

async function GET(request) {
  const correlationId = resolveRequestCorrelationId(request);
  const authResult = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.MANAGE_AUTH,
  });

  if (!authResult.accepted) {
    return attachCorrelationHeader(
      Response.json({ ...authResult.body, correlationId }, { status: authResult.status }),
      correlationId
    );
  }

  return attachCorrelationHeader(
    Response.json({
      ...getOperationsStatus({}),
      correlationId,
    }),
    correlationId
  );
}

module.exports = {
  GET,
};
