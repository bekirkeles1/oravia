const { getReadinessStatus } = require("../../../../src/ops/healthReadiness");
const {
  attachCorrelationHeader,
  resolveRequestCorrelationId,
} = require("../../../../src/ops/requestCorrelation");

async function GET(request) {
  const correlationId = resolveRequestCorrelationId(request);
  const readiness = getReadinessStatus({});
  return attachCorrelationHeader(
    Response.json(
      {
        ...readiness,
        correlationId,
      },
      { status: readiness.accepted ? 200 : 503 }
    ),
    correlationId
  );
}

module.exports = {
  GET,
};
