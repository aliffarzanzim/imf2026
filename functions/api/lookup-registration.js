// functions/api/lookup-registration.js
import { sendEmail, buildOtpEmail } from "./_email.js";
import { createDelegateToken } from "./_delegateAuth.js";

function maskEmail(email) {
  if (!email || !email.includes("@")) return "registered email";
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

// Generate cryptographically secure 6-digit numeric OTP
function generateSecureOtp() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(
        JSON.stringify({ error: "Database binding (DB) is missing. Please configure D1." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ensure otps table exists with attempts column
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS otps (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          reg_number  TEXT NOT NULL,
          email       TEXT NOT NULL,
          code        TEXT NOT NULL,
          attempts    INTEGER DEFAULT 0,
          expires_at  INTEGER NOT NULL,
          created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      try {
        await env.DB.prepare("ALTER TABLE otps ADD COLUMN attempts INTEGER DEFAULT 0").run();
      } catch (_) {}
    } catch (_) {}

    const body = await request.json();
    const { email, regNumber, otpCode } = body;

    const inputEmail = (email && String(email).trim().toLowerCase()) || "";
    const inputReg = (regNumber && String(regNumber).trim().toUpperCase()) || "";

    if (!inputEmail && !inputReg) {
      return new Response(
        JSON.stringify({ error: "Please enter your registered email address." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Query registration by email (preferred) or regNumber
    let reg = null;
    if (inputEmail) {
      reg = await env.DB.prepare(
        "SELECT * FROM registrations WHERE LOWER(TRIM(email)) = ? ORDER BY id DESC LIMIT 1"
      ).bind(inputEmail).first();
    } else {
      reg = await env.DB.prepare(
        "SELECT * FROM registrations WHERE UPPER(TRIM(reg_number)) = ? LIMIT 1"
      ).bind(inputReg).first();
    }

    if (!reg) {
      return new Response(
        JSON.stringify({
          error: inputEmail
            ? `No registration found matching email "${inputEmail}". Please verify your email or register as a new delegate.`
            : `No registration found matching "${inputReg}".`
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = reg.email.trim().toLowerCase();

    // ── STAGE 1: Send OTP if otpCode is not yet provided ──────────
    if (!otpCode || !String(otpCode).trim()) {
      // Cooldown check: prevent requesting an OTP more often than once every 60s
      const recentOtp = await env.DB.prepare(
        "SELECT created_at FROM otps WHERE LOWER(TRIM(email)) = ? ORDER BY id DESC LIMIT 1"
      ).bind(cleanEmail).first();

      if (recentOtp && recentOtp.created_at) {
        const lastSent = new Date(recentOtp.created_at + (recentOtp.created_at.endsWith("Z") ? "" : "Z")).getTime();
        const diff = Date.now() - lastSent;
        if (diff < 60 * 1000) {
          const waitSecs = Math.ceil((60 * 1000 - diff) / 1000);
          return new Response(
            JSON.stringify({
              error: `Please wait ${waitSecs} second${waitSecs === 1 ? "" : "s"} before requesting a new verification code.`,
              cooldown: waitSecs,
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      // Generate cryptographically secure 6-digit code
      const code = generateSecureOtp();
      const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes

      // Delete any previous unused OTPs for this email
      await env.DB.prepare("DELETE FROM otps WHERE LOWER(TRIM(email)) = ?").bind(cleanEmail).run();

      // Store new OTP
      await env.DB.prepare(
        "INSERT INTO otps (reg_number, email, code, attempts, expires_at) VALUES (?, ?, ?, 0, ?)"
      ).bind(reg.reg_number, cleanEmail, code, expiresAt).run();

      // Dispatch OTP email
      const emailResult = await sendEmail({
        env,
        to: cleanEmail,
        subject: `Your IMF 2026 Verification Code: ${code}`,
        html: buildOtpEmail({
          fullName: reg.full_name,
          regNumber: reg.reg_number,
          otpCode: code,
        }),
      });

      if (!emailResult.success) {
        return new Response(
          JSON.stringify({
            error: "Our email limit for today is over. Please wait and try again later, or contact the organizing committee.",
            limitReached: true,
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          requiresOtp: true,
          email: cleanEmail,
          maskedEmail: maskEmail(cleanEmail),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── STAGE 2: Verify OTP ───────────────────────────────────────
    const cleanOtp = String(otpCode).trim();
    const otpRow = await env.DB.prepare(
      "SELECT * FROM otps WHERE LOWER(TRIM(email)) = ? AND expires_at > ? ORDER BY id DESC LIMIT 1"
    ).bind(cleanEmail, Date.now()).first();

    if (!otpRow) {
      return new Response(
        JSON.stringify({ error: "Verification code expired or not requested. Please request a new one." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Brute force lockout check: max 5 attempts
    if ((otpRow.attempts || 0) >= 5) {
      await env.DB.prepare("DELETE FROM otps WHERE LOWER(TRIM(email)) = ?").bind(cleanEmail).run();
      return new Response(
        JSON.stringify({ error: "Too many incorrect attempts. For your security, this verification code was revoked. Please request a new one." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check code match
    if (otpRow.code !== cleanOtp) {
      await env.DB.prepare("UPDATE otps SET attempts = attempts + 1 WHERE id = ?").bind(otpRow.id).run();
      const attemptsLeft = 4 - (otpRow.attempts || 0);
      return new Response(
        JSON.stringify({
          error: attemptsLeft > 0
            ? `Invalid verification code. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.`
            : "Too many incorrect attempts. This code has been revoked. Please request a new one.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Consume OTP so it cannot be reused
    await env.DB.prepare("DELETE FROM otps WHERE LOWER(TRIM(email)) = ?").bind(cleanEmail).run();

    // Generate signed, tamper-proof session token for delegate updates (valid for 2 hours)
    const sessionToken = await createDelegateToken(
      {
        regNumber: reg.reg_number,
        email: cleanEmail,
      },
      env.EMAIL_SECRET || env.ADMIN_PASSWORD || "imf2026_delegate_session_secret"
    );

    // Parse activities JSON safely
    let parsedActivities = [];
    try {
      parsedActivities = reg.activities ? JSON.parse(reg.activities) : [];
    } catch (_) {
      parsedActivities = reg.activities || [];
    }

    // Look up linked abstracts
    let rawAbstracts = [];
    try {
      const absRes = await env.DB.prepare(
        "SELECT * FROM abstracts WHERE reg_number = ? OR LOWER(TRIM(email)) = ? ORDER BY id ASC"
      ).bind(reg.reg_number, cleanEmail).all();
      const allRows = (absRes && absRes.results) || [];
      const seenIds = new Set();
      rawAbstracts = allRows.filter((row) => {
        if (!row.id || seenIds.has(row.id)) return false;
        seenIds.add(row.id);
        return true;
      });
    } catch (_) {}

    const formattedAbstracts = rawAbstracts.map((row) => ({
      id: row.id,
      abstractNumber: row.abstract_number,
      regNumber: row.reg_number || reg.reg_number,
      title: row.title,
      submissionType: row.submission_type,
      presentationCategory: row.presentation_category,
      abstractBody: row.abstract_body,
      keywords: row.keywords,
      presenterName: row.presenter_name,
      coAuthors: row.co_authors,
      authorAffiliation: row.author_affiliation,
      supervisorName: row.supervisor_name,
      r2FileKey: row.r2_file_key,
      fileName: row.file_name,
      fileSize: row.file_size,
      presentationFileKey: row.presentation_file_key,
      presentationFileName: row.presentation_file_name,
      createdAt: row.created_at,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        verified: true,
        sessionToken, // 🛡️ Cryptographically signed authorization token
        registration: {
          id: reg.id,
          regNumber: reg.reg_number,
          fullName: reg.full_name,
          institution: reg.institution,
          batch: reg.batch,
          academicYear: reg.academic_year,
          phone: reg.phone,
          email: reg.email,
          activities: parsedActivities,
          competitionCategory: reg.competition_category,
          priorExperience: reg.prior_experience,
          queries: reg.queries,
          createdAt: reg.created_at,
        },
        abstracts: formattedAbstracts,
        abstract: formattedAbstracts[0] || null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Failed to lookup registration" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
