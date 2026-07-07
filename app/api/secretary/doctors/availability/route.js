const {
  handleGetSecretaryDoctorAvailability,
  handleUpdateSecretaryDoctorAvailability,
} = require("../../../../../src/api/secretaryDoctorsHandler");

async function GET() {
  const result = handleGetSecretaryDoctorAvailability();

  return Response.json(result.body, {
    status: result.statusCode,
  });
}

async function PATCH(request) {
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
