// functions/api/admin/_auth.js
// Lightweight HMAC-SHA256 JWT using Web Crypto API

async function getSecretKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createToken(secret, expiresInMs = 24 * 60 * 60 * 1000) {
  const payload = {
    role: "admin",
    exp: Date.now() + expiresInMs,
  };
  const payloadB64 = btoa(JSON.stringify(payload));
  const key = await getSecretKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${payloadB64}.${sigB64}`;
}

export async function verifyToken(token, secret) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;

  try {
    const payload = JSON.parse(atob(payloadB64));
    if (!payload.exp || Date.now() > payload.exp) return false;

    const key = await getSecretKey(secret);
    const unpadded = sigB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = unpadded.length % 4;
    const base64 = pad ? unpadded + "=".repeat(4 - pad) : unpadded;
    const binStr = atob(base64);
    const sigBytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      sigBytes[i] = binStr.charCodeAt(i);
    }

    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(payloadB64)
    );
  } catch (_) {
    return false;
  }
}

export async function checkAdminAuth(request, env) {
  const secret = env.ADMIN_PASSWORD || "imf2026_admin_secret_key";
  const authHeader = request.headers.get("Authorization");
  let token = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else {
    const url = new URL(request.url);
    token = url.searchParams.get("token");
  }

  if (!token) return false;
  return verifyToken(token, secret);
}
