const {
  AUTH_PERMISSIONS,
} = require("../../../../../src/auth/authRoles");
const { resolveRouteActor } = require("../../../../../src/auth/routeAuth");
const {
  createWhatsAppRuntime,
} = require("../../../../../src/messaging/whatsappRuntime");

async function GET(request) {
  const authResult = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.MANAGE_AUTH,
  });

  if (!authResult.accepted) {
    return Response.json(authResult.body, { status: authResult.status });
  }

  const runtime = createWhatsAppRuntime({});

  try {
    return Response.json(runtime.getSafeIntegrationStatus(), {
      status: runtime.accepted ? 200 : 503,
    });
  } finally {
    runtime.close();
  }
}

module.exports = {
  GET,
};
