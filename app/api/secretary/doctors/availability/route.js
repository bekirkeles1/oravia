const {
  handleGetSecretaryDoctorAvailability,
  handleUpdateSecretaryDoctorAvailability,
} = require("../../../../../src/api/secretaryDoctorsHandler");
const {
  AUTH_PERMISSIONS,
} = require("../../../../../src/auth/authRoles");
const {
  resolveRouteActor,
  validateMutationOrigin,
} = require("../../../../../src/auth/routeAuth");

async function GET(request) {
  const authResult = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.READ_OPERATIONAL,
  });

  if (!authResult.accepted) {
    return Response.json(authResult.body, { status: authResult.status });
  }

  const result = handleGetSecretaryDoctorAvailability();

  return Response.json(result.body, {
    status: result.statusCode,
  });
}

async function PATCH(request) {
  const authResult = resolveRouteActor(request, {
    permission: AUTH_PERMISSIONS.MUTATE_DOCTOR_AVAILABILITY,
  });

  if (!authResult.accepted) {
    return Response.json(authResult.body, { status: authResult.status });
  }

  const originResult = validateMutationOrigin(request);

  if (!originResult.accepted) {
    return Response.json(originResult.body, { status: originResult.status });
  }

  let payload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      {
        status: "error",
        source: "mock",
        error: {
          code: "invalid_json",
          message: "Geçerli JSON gövdesi gönderilmelidir.",
        },
      },
      {
        status: 400,
      }
    );
  }

  const result = handleUpdateSecretaryDoctorAvailability(payload);

  return Response.json(result.body, {
    status: result.statusCode,
  });
}

module.exports = {
  GET,
  PATCH,
};
