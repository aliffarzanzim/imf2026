// functions/api/_delegateAuth.js
// Cryptographically signed session tokens for delegate self-service portal

async function getSecretKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret || "imf2026_delegate_session_secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Issue a signed session token for a verified delegate
 * @param {Object} payload { regNumber, email }
 * @param {string} secret
 * @param {number} expiresInMs default 2 hours
 */
export async function createDelegateToken(payload, secret, expiresInMs = 2 * 60 * 60 * 1000) {
  const data = {
    regNumber: payload.regNumber,
    email: payload.email,
    exp: Date.now() + expiresInMs,
  };
  const payloadB64 = btoa(JSON.stringify(data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const key = await getSecretKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify and decode delegate session token
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<Object|null>} Decoded payload or null if invalid/expired
 */
export async function verifyDelegateToken(token, secret) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  try {
    const unpaddedPayload = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = unpaddedPayload.length % 4;
    const base64Payload = pad ? unpaddedPayload + "=".repeat(4 - pad) : unpaddedPayload;
    const data = JSON.parse(atob(base64Payload));

    if (!data.exp || Date.now() > data.exp) return null;

    const key = await getSecretKey(secret);
    const unpaddedSig = sigB64.replace(/-/g, "+").replace(/_/g, "/");
    const padSig = unpaddedSig.length % 4;
    const base64Sig = padSig ? unpaddedSig + "=".repeat(4 - padSig) : unpaddedSig;
    const binStr = atob(base64Sig);
    const sigBytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      sigBytes[i] = binStr.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(payloadB64)
    );

    return isValid ? data : null;
  } catch (_) {
    return null;
  }
}
