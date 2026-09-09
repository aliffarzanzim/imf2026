// functions/api/verify.js
// Secure, anti-scraping delegate badge verification endpoint for IMF 2026

// Constant-time string comparison to prevent timing side-channel attacks
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// In-memory sliding-window rate limiter per Edge Worker instance
// Limits scanning bursts to prevent automated brute force and scraping
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // Max 30 verification queries / minute per IP

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    // Keep memory clean
    if (rateLimitMap.size > 2000) {
      for (const [k, v] of rateLimitMap.entries()) {
        if (now - v.startTime > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(k);
      }
    }
    return false;
  }
  record.count++;
  return record.count > MAX_REQUESTS_PER_WINDOW;
}

async function generateVerifySig(regNumber, secret = "IMF2026_SECRET_KEY", length = 16) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(String(regNumber).trim().toUpperCase()));
  const hex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, length);
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    // 1. Rate Limiting Check (Anti-Scraping / Anti-Brute-Force)
    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip") || "unknown";
    if (isRateLimited(clientIp)) {
      return new Response(
        JSON.stringify({
          verified: false,
          error: "Too many verification requests from this IP. Please wait a minute before scanning again.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    const url = new URL(request.url);
    const regParam = url.searchParams.get("reg");
    const sigParam = url.searchParams.get("sig");

    if (!regParam || !sigParam) {
      return new Response(
        JSON.stringify({
          verified: false,
          error: "Missing verification parameters. Both 'reg' and 'sig' are required.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    if (!env.DB) {
      return new Response(
        JSON.stringify({
          verified: false,
          error: "Database configuration unavailable.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const cleanReg = regParam.trim().toUpperCase();
    const cleanSig = sigParam.trim().toLowerCase();

    // 2. Query registration details from D1
    const row = await env.DB.prepare(`
      SELECT id, reg_number, full_name, institution, batch, academic_year, role, verify_sig, created_at
      FROM registrations
      WHERE UPPER(TRIM(reg_number)) = ?
      LIMIT 1
    `).bind(cleanReg).first();

    if (!row) {
      return new Response(
        JSON.stringify({
          verified: false,
          error: "Invalid badge. No participant found with this Registration ID.",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    // 3. Cryptographic Verification with Dual-Length Support (16-char high entropy & 8-char legacy)
    const secret = env.VERIFY_SECRET || env.EMAIL_SECRET || "IMF2026_SECRET_KEY";
    const computedSig16 = (await generateVerifySig(row.reg_number, secret, 16)).toLowerCase();
    const computedSig8 = computedSig16.slice(0, 8);
    const dbSig = (row.verify_sig || "").trim().toLowerCase();

    // Constant-time checks
    const isDbValid = dbSig.length > 0 && timingSafeEqual(dbSig, cleanSig);
    const isHmac16Valid = timingSafeEqual(computedSig16, cleanSig);
    const isHmac8Valid = timingSafeEqual(computedSig8, cleanSig);

    if (!isDbValid && !isHmac16Valid && !isHmac8Valid) {
      return new Response(
        JSON.stringify({
          verified: false,
          error: "Invalid or forged badge signature. Verification failed.",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    // 4. Upgrade legacy/missing DB signatures to high-entropy 16-char format
    if ((!row.verify_sig || row.verify_sig.length < 16) && (isHmac16Valid || isHmac8Valid)) {
      try {
        await env.DB.prepare("UPDATE registrations SET verify_sig = ? WHERE id = ?").bind(computedSig16, row.id).run();
      } catch (_) {}
    }

    // 5. Return safe, verified attendee attributes with zero-cache headers
    return new Response(
      JSON.stringify({
        verified: true,
        regNumber: row.reg_number,
        fullName: row.full_name,
        institution: row.institution,
        batch: row.batch,
        academicYear: row.academic_year,
        role: row.role || "PARTICIPANT",
        status: "Official Delegate Verified",
        event: "Internal Medicine Festival 2026",
        verifiedAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        verified: false,
        error: err.message || "Internal server error during verification.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
