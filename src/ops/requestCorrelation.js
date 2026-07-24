const { randomUUID } = require("node:crypto");

const CORRELATION_ID_HEADER = "x-oravia-correlation-id";
const SAFE_CORRELATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,63}$/;

function resolveRequestCorrelationId(request) {
  const provided = String(
    request?.headers?.get?.(CORRELATION_ID_HEADER) ||
      request?.headers?.get?.("x-request-id") ||
      ""
  ).trim();

  if (SAFE_CORRELATION_ID_PATTERN.test(provided)) {
    return provided;
  }

  return `req_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function attachCorrelationHeader(response, correlationId) {
  if (response?.headers && SAFE_CORRELATION_ID_PATTERN.test(correlationId)) {
    response.headers.set(CORRELATION_ID_HEADER, correlationId);
  }
  return response;
}

module.exports = {
  CORRELATION_ID_HEADER,
  SAFE_CORRELATION_ID_PATTERN,
  attachCorrelationHeader,
  resolveRequestCorrelationId,
};
