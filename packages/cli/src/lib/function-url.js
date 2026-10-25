const { DEFAULT_BASE_URL } = require("./runtime-config");

// token-usage serves the CLI contract under /api/functions/<slug> from the
// Next.js app itself — no separate edge-function host, no legacy fallback.
function functionUrlFor(baseUrl, slug) {
  const root = String(baseUrl || "").trim().replace(/\/$/, "");
  return `${root}/api/functions/${slug}`;
}

async function fetchFunctionResponse(url, init = {}, fetchImpl = fetch) {
  return fetchImpl(url, init);
}

module.exports = { functionUrlFor, fetchFunctionResponse };
