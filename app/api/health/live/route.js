const { getLivenessStatus } = require("../../../../src/ops/healthReadiness");
const {
  attachCorrelationHeader,
  resolveRequestCorrelationId,
} = require("../../../../src/ops/requestCorrelation");

async function GET(request) {
  const correlationId = resolveRequestCorrelationId(request);
  return attachCorrelationHeader(
    Response.json({
      ...getLivenessStatus(),
      correlationId,
    }),
    correlationId
  );
}

module.exports = {
  GET,
};
