// functions/api/quiz-player-lookup.js

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
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

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: "Database not configured." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = (body.email && String(body.email).trim().toLowerCase()) || "";
    const regNumber = (body.regNumber && String(body.regNumber).trim().toUpperCase()) || "";
    const sig = (body.sig && String(body.sig).trim().toLowerCase()) || "";

    if (!email && !regNumber) {
      return new Response(
        JSON.stringify({ success: false, error: "Please enter your registered email address or scan your badge QR code." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Query registration by email or regNumber (no emails sent, strictly read-only lookup for quiz)
    let reg = null;
    if (email) {
      reg = await env.DB.prepare(
        "SELECT id, reg_number, full_name, institution, batch, academic_year, email, verify_sig FROM registrations WHERE LOWER(TRIM(email)) = ? ORDER BY id DESC LIMIT 1"
      ).bind(email).first();
    } else if (regNumber) {
      reg = await env.DB.prepare(
        "SELECT id, reg_number, full_name, institution, batch, academic_year, email, verify_sig FROM registrations WHERE UPPER(TRIM(reg_number)) = ? ORDER BY id DESC LIMIT 1"
      ).bind(regNumber).first();
    }

    if (!reg) {
      return new Response(
        JSON.stringify({
          success: false,
          error: regNumber
            ? `No registration found for ID "${regNumber}". Please enter your registered email.`
            : `No registration found for "${email}". Please enter the exact email you registered with for IMF 2026.`,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Cryptographic signature check when scanning ID card QR code
    if (sig && reg) {
      const secret = env.VERIFY_SECRET || env.EMAIL_SECRET || "IMF2026_SECRET_KEY";
      const computedSig16 = (await generateVerifySig(reg.reg_number, secret, 16)).toLowerCase();
      const computedSig8 = computedSig16.slice(0, 8);
      const dbSig = (reg.verify_sig || "").trim().toLowerCase();

      const isDbValid = dbSig.length > 0 && timingSafeEqual(dbSig, sig);
      const isHmac16Valid = timingSafeEqual(computedSig16, sig);
      const isHmac8Valid = timingSafeEqual(computedSig8, sig);

      if (!isDbValid && !isHmac16Valid && !isHmac8Valid) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid or forged badge signature. QR code verification failed.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const yearDisplay = reg.academic_year || reg.batch || "Participant";

    return new Response(
      JSON.stringify({
        success: true,
        player: {
          name: reg.full_name,
          regNumber: reg.reg_number,
          institution: reg.institution || "Medical College",
          academicYear: yearDisplay,
          email: reg.email,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Quiz player lookup error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to look up registration details. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
