const {
  handleGetSecretaryDoctors,
} = require("../../../../src/api/secretaryDoctorsHandler");

async function GET() {
  const result = handleGetSecretaryDoctors();

  return Response.json(result.body, {
    status: result.statusCode,
  });
}

module.exports = {
  GET,
};
