// functions/api/_email.js
// Server-side transactional email dispatcher (Runs exclusively on Cloudflare Pages backend)
// Secrets are read ONLY from environment variables (never exposed to client-side or git)

/**
 * Send an email via Google Apps Script Webhook or Resend REST API
 * All credentials are read securely from Cloudflare env variables:
 * - env.GOOGLE_SCRIPT_URL (for sending directly from personal Gmail with 0 spam & no domain)
 * - env.EMAIL_SECRET (optional webhook verification token)
 * - env.RESEND_API_KEY (if using Resend with a verified custom domain)
 *
 * @param {Object} options
 * @param {Object} options.env Cloudflare environment variables
 * @param {string|string[]} options.to Recipient email(s)
 * @param {string} options.subject Email subject line
 * @param {string} options.html HTML email body
 * @param {string} [options.text] Plaintext fallback
 * @param {string} [options.from] Sender address
 * @param {string} [options.replyTo] Reply-To address
 */
export async function sendEmail({ env, to, subject, html, text, from, replyTo }) {
  const recipient = Array.isArray(to) ? to[0] : to;
  const reply = replyTo || (env && env.REPLY_TO_EMAIL) || "";

  // Collect all configured Google Script Webhook URLs (primary + fallbacks)
  const scriptUrls = [];
  if (env?.GOOGLE_SCRIPT_URL) {
    env.GOOGLE_SCRIPT_URL.split(",").forEach((u) => {
      const trimmed = u.trim();
      if (trimmed && !scriptUrls.includes(trimmed)) scriptUrls.push(trimmed);
    });
  }
  if (env?.GOOGLE_SCRIPT_URL_2) {
    const trimmed = env.GOOGLE_SCRIPT_URL_2.trim();
    if (trimmed && !scriptUrls.includes(trimmed)) scriptUrls.push(trimmed);
  }
  if (env?.GOOGLE_SCRIPT_URL_3) {
    const trimmed = env.GOOGLE_SCRIPT_URL_3.trim();
    if (trimmed && !scriptUrls.includes(trimmed)) scriptUrls.push(trimmed);
  }
  if (env?.GOOGLE_SCRIPT_URL_4) {
    const trimmed = env.GOOGLE_SCRIPT_URL_4.trim();
    if (trimmed && !scriptUrls.includes(trimmed)) scriptUrls.push(trimmed);
  }
  if (env?.GOOGLE_SCRIPT_URL_5) {
    const trimmed = env.GOOGLE_SCRIPT_URL_5.trim();
    if (trimmed && !scriptUrls.includes(trimmed)) scriptUrls.push(trimmed);
  }
  for (let idx = 6; idx <= 30; idx++) {
    const key = `GOOGLE_SCRIPT_URL_${idx}`;
    if (env?.[key]) {
      const trimmed = env[key].trim();
      if (trimmed && !scriptUrls.includes(trimmed)) scriptUrls.push(trimmed);
    }
  }
  if (env?.GOOGLE_SCRIPT_FALLBACKS) {
    env.GOOGLE_SCRIPT_FALLBACKS.split(",").forEach((u) => {
      const trimmed = u.trim();
      if (trimmed && !scriptUrls.includes(trimmed)) scriptUrls.push(trimmed);
    });
  }

  // 1. Try Google Apps Script Webhooks with automatic failover
  if (scriptUrls.length > 0) {
    const payload = {
      secret: env?.EMAIL_SECRET || "IMF2026_SECRET_KEY",
      to: recipient,
      subject,
      html,
      text: text || "",
      replyTo: reply,
      name: "IMF 2026",
      fromName: "IMF 2026",
      senderName: "IMF 2026",
      displayName: "IMF 2026",
      sender: "IMF 2026",
      from: "IMF 2026",
    };

    for (let i = 0; i < scriptUrls.length; i++) {
      const url = scriptUrls[i];
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "follow",
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok && result.success) {
          return { success: true, provider: `google_script_${i + 1}`, data: result };
        }

        console.warn(
          `[Email Service] Webhook #${i + 1} did not succeed (status: ${response.status}, error: ${result.error || "limit/unknown"}). Attempting fallback #${i + 2}...`
        );
      } catch (err) {
        console.warn(`[Email Service] Webhook #${i + 1} error:`, err.message);
      }
    }
    console.error("[Email Service] All configured Google Script webhooks failed or reached daily limit.");
  }

  // 2. Alternative safety net: Resend API (if configured)
  if (env && env.RESEND_API_KEY) {
    try {
      const sender = from || env.EMAIL_FROM || "IMF 2026 <onboarding@resend.dev>";
      const payload = {
        from: sender,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      };
      if (reply) payload.reply_to = reply;
      if (text) payload.text = text;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      return { success: response.ok, provider: "resend", data: result };
    } catch (err) {
      console.error("[Email Service] Resend fallback error:", err);
      return { success: false, error: err.message };
    }
  }

  return {
    success: false,
    reason: "limit_exceeded",
    error: "Our email delivery limit for today has been reached. Please wait and try again later, or contact the organizing committee.",
  };
}

/**
 * Generate Registration Confirmation HTML Email
 */
export function buildRegistrationEmail({
  fullName,
  regNumber,
  email,
  abstractNumber,
  abstractTitle,
  presentationCategory,
  submissionType,
  phone,
  institution,
  batch,
  activities,
  competitionCategory,
}) {
  const activitiesList = Array.isArray(activities) && activities.length > 0
    ? activities.map(a => `<li style="margin-bottom: 4px; color: #1e293b;">${a}</li>`).join("")
    : `<li style="color: #64748b;">General Delegate</li>`;

  const competitionList = Array.isArray(competitionCategory)
    ? competitionCategory
    : (competitionCategory ? String(competitionCategory).split(",").map(s => s.trim()).filter(Boolean) : []);
  const competitionHtml = competitionList.length > 0
    ? competitionList.map(c => `<li style="margin-bottom: 4px; color: #1e293b;">${c}</li>`).join("")
    : `<li style="color: #64748b;">Not participating in a competition (Attendee only)</li>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IMF 2026 Registration Confirmation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0284c7 0%, #0f766e 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Internal Medicine Festival 2026</h1>
      <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Registration Confirmation &amp; Official Pass</p>
    </div>

    <!-- Content -->
    <div style="padding: 32px 24px;">
      <p style="font-size: 16px; margin: 0 0 16px 0; color: #334155;">
        Dear <strong>${fullName}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; color: #475569;">
        Thank you for registering for the <strong>National Internal Medicine Festival 2026</strong>. Your registration has been successfully processed and recorded in the official database.
      </p>

      <!-- Reg & Abstract Card -->
      <div style="background-color: #f0fdf4; border: 2px dashed #86efac; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <div>
          <span style="font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Official Registration Number:</span>
          <div style="font-size: 26px; font-weight: 800; color: #14532d; letter-spacing: 1px; font-family: monospace; margin-top: 4px;">${regNumber}</div>
        </div>
        ${abstractNumber ? `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #cbd5e1;">
          <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Linked Abstract ID:</span>
          <div style="font-size: 18px; font-weight: 700; color: #047857; letter-spacing: 0.5px; font-family: monospace; margin-top: 4px;">${abstractNumber}</div>
          ${abstractTitle ? `
          <div style="margin-top: 8px; font-size: 13px; color: #334155; line-height: 1.5;">
            <strong>Title:</strong> ${abstractTitle}<br>
            ${submissionType ? `<span style="display:inline-block; margin-top:2px;"><strong>Type:</strong> ${submissionType}</span> &bull; ` : ""}${presentationCategory ? `<span><strong>Category:</strong> ${presentationCategory}</span>` : ""}
          </div>` : ""}
        </div>
        ` : ""}
      </div>

      <!-- Delegate Details -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; width: 35%;">Institution:</td>
          <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${institution}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Batch:</td>
          <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${batch}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Phone:</td>
          <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${phone}</td>
        </tr>
        ${email ? `
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Email:</td>
          <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${email}</td>
        </tr>` : ""}
      </table>

      <!-- Activities Section -->
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #334155;">Registered Activities & Events:</h4>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
          ${activitiesList}
        </ul>
      </div>

      <!-- Competition Preference(s) Section -->
      <div style="margin-bottom: 24px;">
        <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #334155;">Competition Preference(s):</h4>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
          ${competitionHtml}
        </ul>
      </div>

      <!-- Manage Notice -->
      <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px 16px; border-radius: 4px; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 13px; color: #1e40af; line-height: 1.5;">
          <strong>Need to submit an abstract or update your profile?</strong><br>
          Visit the IMF 2026 website anytime and click <em>"Already Registered?"</em> using your registered <strong>Email Address</strong>${email ? ` (<code>${email}</code>)` : ""} to receive a secure one-time access code.
        </p>
      </div>

      <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0;">
        Warm regards,<br>
        <strong>Organizing Committee</strong><br>
        Internal Medicine Festival 2026
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
      This is an automated confirmation email. For queries, reply directly to this email or contact the organizing committee.
    </div>

  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate 6-Digit OTP Email for Self-Service Delegate Editing
 */
export function buildOtpEmail({ fullName, regNumber, otpCode }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your IMF 2026 Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
    
    <div style="background: #0b1c3d; padding: 24px; text-align: center; color: #ffffff;">
      <h2 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 700;">IMF 2026 Delegate Portal</h2>
      <p style="margin: 0; font-size: 13px; color: #93c5fd;">Identity Verification Code</p>
    </div>

    <div style="padding: 28px 24px; text-align: center;">
      <p style="color: #475569; font-size: 15px; margin: 0 0 20px 0; text-align: left;">
        Hello <strong>${fullName}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 24px 0; text-align: left;">
        A request was made to access and edit the festival registration details for <strong>${regNumber}</strong>. Use the 6-digit verification code below to proceed:
      </p>

      <!-- OTP Box -->
      <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 18px; margin: 0 auto 24px auto; max-width: 280px;">
        <div style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1e3a8a;">
          ${otpCode}
        </div>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Valid for 10 minutes</div>
      </div>

      <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0; text-align: left;">
        If you did not request this verification code, you can safely ignore this email. Your registration details remain secure.
      </p>
    </div>

    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px; text-align: center; font-size: 11px; color: #94a3b8;">
      Internal Medicine Festival 2026 • DMC IMIG • ACP Bangladesh Chapter
    </div>

  </div>
</body>
</html>
  `.trim();
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate Registration/Abstract Update Confirmation HTML Email
 */
export function buildUpdateConfirmationEmail({ fullName, regNumber, abstractNumber, isAbstractUpdate, changes = [] }) {
  const changesList = Array.isArray(changes) ? changes : [];

  const changesHtml = changesList.length > 0 ? `
      <!-- Changes Log Table / List -->
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
        <div style="background-color: #f1f5f9; border-bottom: 1px solid #cbd5e1; padding: 12px 16px; font-size: 12px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">
          Details of Changes Made (${changesList.length})
        </div>
        <div style="padding: 14px 16px;">
          ${changesList.map((c) => {
            if (typeof c === "string") {
              return `<div style="padding: 8px 12px; margin-bottom: 8px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; color: #334155;">${escapeHtml(c)}</div>`;
            }
            const label = c.label || c.field || "Updated Field";
            const before = c.before;
            const after = c.after;
            const details = Array.isArray(c.details) ? c.details : [];
            const description = c.description;

            return `
            <div style="padding: 10px 14px; margin-bottom: 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;">
              <div style="font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 4px;">
                ${escapeHtml(label)}
              </div>
              ${before !== undefined && after !== undefined ? `
              <div style="font-size: 13px; color: #475569; line-height: 1.5;">
                <span style="color: #dc2626; text-decoration: line-through; margin-right: 6px;">${escapeHtml(before || "(Empty)")}</span>
                <span style="color: #16a34a; font-weight: 600;">&rarr; ${escapeHtml(after || "(Empty)")}</span>
              </div>
              ` : ""}
              ${details.length > 0 ? `
              <ul style="margin: 6px 0 0 0; padding-left: 18px; font-size: 12px; color: #334155; line-height: 1.5;">
                ${details.map(d => `<li style="margin-bottom: 2px;">${escapeHtml(d)}</li>`).join("")}
              </ul>
              ` : ""}
              ${description ? `
              <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${escapeHtml(description)}</div>
              ` : ""}
            </div>
            `;
          }).join("")}
        </div>
      </div>
  ` : `
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px; font-size: 13px; color: #64748b;">
        Your festival registration details and abstracts have been re-verified and saved.
      </div>
  `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IMF 2026 Profile Updated</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
    
    <div style="background: linear-gradient(135deg, #0b1c3d 0%, #173b75 100%); padding: 24px; text-align: center; color: #ffffff;">
      <h2 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 700;">IMF 2026 Delegate Portal</h2>
      <p style="margin: 0; font-size: 13px; color: #93c5fd;">Update Confirmation &amp; Change Summary</p>
    </div>

    <div style="padding: 28px 24px;">
      <div style="display: inline-block; background-color: #ecfdf5; color: #047857; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; margin-bottom: 16px; border: 1px solid #a7f3d0;">
        ✓ CHANGES SAVED SUCCESSFULLY
      </div>

      <p style="color: #475569; font-size: 15px; margin: 0 0 14px 0;">
        Dear <strong>${escapeHtml(fullName)}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
        Your ${isAbstractUpdate ? "scientific abstract submission and delegate details" : "delegate registration details"} for Registration ID <strong>${escapeHtml(regNumber)}</strong> ${abstractNumber ? `(Abstract: <strong>${escapeHtml(abstractNumber)}</strong>)` : ""} have been successfully updated in the festival database.
      </p>

      ${changesHtml}

      <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 4px; margin-bottom: 20px; font-size: 13px; color: #1e40af; line-height: 1.5;">
        <strong>Need further adjustments?</strong><br>
        You can return to the IMF 2026 website anytime and click <em>"Already Registered?"</em> to review or update your registration details.
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; font-size: 12px; color: #64748b; margin-bottom: 20px;">
        Timestamp: <strong>${new Date().toLocaleString()}</strong><br>
        Status: <strong>Active &amp; Confirmed</strong>
      </div>

      <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
        If you did not make these changes, please contact the organizers.
      </p>
    </div>

    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px; text-align: center; font-size: 11px; color: #94a3b8;">
      Internal Medicine Festival 2026 • DMC IMIG • ACP Bangladesh Chapter
    </div>

  </div>
</body>
</html>
  `.trim();
}
