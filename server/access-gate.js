const { URL } = require("node:url");
const crypto = require("node:crypto");

const parseCookies = (header) => {
  const raw = typeof header === "string" ? header : "";
  if (!raw.trim()) return {};
  const out = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
};

/**
 * Timing-safe string comparison to prevent timing attacks on token validation.
 * Returns true only when both strings are non-empty and equal.
 */
const timingSafeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length === 0 || b.length === 0) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const buildRedirectUrl = (req, nextPathWithQuery) => {
  // Use only the pathname+query from the parsed URL — never trust the Host header
  // for redirect targets. The redirect is always relative to the same origin.
  // Browsers resolve relative Location headers against the request origin.
  return nextPathWithQuery;
};

function createAccessGate(options) {
  const token = String(options?.token ?? "").trim();
  const cookieName = String(options?.cookieName ?? "studio_access").trim() || "studio_access";
  const queryParam = String(options?.queryParam ?? "access_token").trim() || "access_token";

  const enabled = Boolean(token);

  const isAuthorized = (req) => {
    if (!enabled) return true;
    const cookieHeader = req.headers?.cookie;
    const cookies = parseCookies(cookieHeader);
    const cookieValue = cookies[cookieName];
    return timingSafeEqual(cookieValue || "", token);
  };

  const handleHttp = (req, res) => {
    if (!enabled) return false;
    const host = req.headers?.host || "localhost";
    const url = new URL(req.url || "/", `http://${host}`);
    const provided = url.searchParams.get(queryParam);

    if (provided !== null) {
      if (!timingSafeEqual(provided, token)) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid Studio access token." }));
        return true;
      }

      url.searchParams.delete(queryParam);
      const isHttps =
        String(req.headers?.["x-forwarded-proto"] || "").toLowerCase() === "https";
      const secureFlag = isHttps ? " Secure;" : "";
      const cookieValue = `${cookieName}=${token}; HttpOnly;${secureFlag} Path=/; SameSite=Lax`;
      res.statusCode = 302;
      res.setHeader("Set-Cookie", cookieValue);
      res.setHeader("Location", buildRedirectUrl(req, url.pathname + url.search));
      res.end();
      return true;
    }

    // Guard ALL routes when access token is configured, not just /api/
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Studio access token required. Open /?access_token=... once to set a cookie.",
        })
      );
      return true;
    }

    return false;
  };

  const allowUpgrade = (req) => {
    if (!enabled) return true;
    return isAuthorized(req);
  };

  return { enabled, handleHttp, allowUpgrade };
}

module.exports = { createAccessGate };

