// functions/api/admin/login.js
import { createToken } from "./_auth.js";

// In-memory rate limiting map for login attempts per IP
const loginAttempts = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return false;

  // Clear if lockout expired (15 minutes)
  if (now - record.firstAttempt > 15 * 60 * 1000) {
    loginAttempts.delete(ip);
    return false;
  }

  return record.count >= 5; // Lock after 5 consecutive failures
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, firstAttempt: now };
  record.count += 1;
  loginAttempts.set(ip, record);
}

function resetAttempts(ip) {
  loginAttempts.delete(ip);
}

async function timingSafeCheck(a, b) {
  const enc = new TextEncoder();
  const hashA = await crypto.subtle.digest("SHA-256", enc.encode(a || ""));
  const hashB = await crypto.subtle.digest("SHA-256", enc.encode(b || ""));
  const bufA = new Uint8Array(hashA);
  const bufB = new Uint8Array(hashB);

  let mismatch = 0;
  for (let i = 0; i < bufA.length; i++) {
    mismatch |= bufA[i] ^ bufB[i];
  }
  return mismatch === 0;
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";

    if (isRateLimited(clientIp)) {
      return new Response(
        JSON.stringify({
          error: "Too many failed login attempts. Account locked for 15 minutes.",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();
    const { password } = body;
    const expectedPassword = env.ADMIN_PASSWORD;

    const isValid = await timingSafeCheck(password, expectedPassword);

    if (!isValid) {
      recordFailedAttempt(clientIp);
      // Introduce an intentional delay to mitigate automated brute-force timing
      await new Promise((resolve) => setTimeout(resolve, 800));

      return new Response(
        JSON.stringify({ error: "Invalid admin password." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Success: reset rate limit tracking for IP
    resetAttempts(clientIp);

    const token = await createToken(expectedPassword);

    return new Response(
      JSON.stringify({ success: true, token }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Login failed." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
