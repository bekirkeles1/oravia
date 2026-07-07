const {
  handleGetSecretaryDoctorAvailability,
} = require("../../../../../src/api/secretaryDoctorsHandler");

async function GET() {
  const result = handleGetSecretaryDoctorAvailability();

  return Response.json(result.body, {
    status: result.statusCode,
  });
}

module.exports = {
  GET,
};
