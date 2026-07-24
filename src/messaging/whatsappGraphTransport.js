const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;

function createFetchWhatsAppGraphTransport({
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  return Object.freeze({
    async postJson({ url, accessToken, body }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await readBoundedText(response, maxResponseBytes);
        const parsed = parseJson(text);

        return Object.freeze({
          accepted: true,
          status: response.status,
          ok: response.ok,
          body: parsed,
          parseOk: parsed !== null,
        });
      } catch (error) {
        return Object.freeze({
          accepted: false,
          timeout: error?.name === "AbortError",
          code: error?.name === "AbortError" ? "transport_timeout" : "transport_failed",
          reason: "WhatsApp Graph transport failed safely.",
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}

async function readBoundedText(response, maxBytes) {
  const text = await response.text();

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return "";
  }

  return text;
}

function parseJson(text) {
  try {
    return JSON.parse(String(text || ""));
  } catch {
    return null;
  }
}

module.exports = {
  createFetchWhatsAppGraphTransport,
};
