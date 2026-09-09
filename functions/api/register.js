import { sendEmail, buildRegistrationEmail, buildPosterSelectionEmail } from "./_email.js";

// Generate deterministic HMAC-SHA256 badge verification signature (16 hex characters)
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
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, length);
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(
        JSON.stringify({ error: "Database binding (DB) is missing. Please configure D1 in wrangler.toml." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ensure reg_number and verify_sig columns exist
    try {
      await env.DB.prepare("ALTER TABLE abstracts ADD COLUMN reg_number TEXT").run();
    } catch (_) {}
    try {
      await env.DB.prepare("ALTER TABLE registrations ADD COLUMN verify_sig TEXT").run();
    } catch (_) {}

    // Check if registration is turned off by admin
    try {
      const regConfig = await env.DB.prepare(
        "SELECT value FROM system_config WHERE key = 'registration_open' LIMIT 1"
      ).first();
      if (regConfig && regConfig.value === "false") {
        return new Response(
          JSON.stringify({ error: "Registration is currently closed by the organizing committee." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    } catch (_) {}

    const data = await request.json();

    // Check if abstract submission during registration is turned off
    if (data.abstracts && Array.isArray(data.abstracts) && data.abstracts.length > 0) {
      try {
        const absConfig = await env.DB.prepare(
          "SELECT value FROM system_config WHERE key = 'abstract_edit_open' LIMIT 1"
        ).first();
        if (absConfig && absConfig.value === "false") {
          return new Response(
            JSON.stringify({ error: "Abstract submission is currently closed by the organizing committee." }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (_) {}
    }

    // Check if registration is open for abstract submission only
    try {
      const absOnlyConfig = await env.DB.prepare(
        "SELECT value FROM system_config WHERE key = 'registration_abstract_only' LIMIT 1"
      ).first();
      if (absOnlyConfig && absOnlyConfig.value === "true") {
        const hasValidAbstract =
          (Array.isArray(data.abstracts) &&
            data.abstracts.length > 0 &&
            data.abstracts.some((a) => a && (a.title || a.abstractTitle) && (a.abstractBody || a.r2FileKey))) ||
          (data.abstractTitle && (data.abstractBody || data.r2FileKey));

        if (!hasValidAbstract) {
          return new Response(
            JSON.stringify({
              error: "Registration is currently open for abstract submission only. You must submit a scientific abstract to complete registration.",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    } catch (_) {}

    // Required personal info validation
    const required = ["fullName", "institution", "batch", "academicYear", "phone", "email"];
    for (const field of required) {
      if (!data[field] || typeof data[field] !== "string" || !data[field].trim()) {
        return new Response(
          JSON.stringify({ error: `Missing required field: ${field}` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmail = data.email.trim().toLowerCase();
    if (!emailRegex.test(cleanEmail)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Unique email check: strictly one user per email
    const existingUser = await env.DB.prepare(
      "SELECT reg_number FROM registrations WHERE LOWER(TRIM(email)) = ? LIMIT 1"
    ).bind(cleanEmail).first();

    if (existingUser) {
      return new Response(
        JSON.stringify({
          error: `This email is already registered (${existingUser.reg_number}). Please use the already registered tab.`,
          code: "EMAIL_ALREADY_REGISTERED",
          regNumber: existingUser.reg_number,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    // Abstract validation if user opted into submitting abstracts
    const hasAbstract = Boolean(data.hasAbstract || data.submitAbstract);
    let rawAbstracts = [];
    if (Array.isArray(data.abstracts) && data.abstracts.length > 0) {
      rawAbstracts = data.abstracts;
    } else if (hasAbstract && data.abstractTitle) {
      rawAbstracts = [{
        title: data.abstractTitle,
        submissionType: data.submissionType,
        presentationCategory: data.presentationCategory,
        abstractBody: data.abstractBody,
        keywords: data.keywords,
        presenterName: data.presenterName,
        coAuthors: data.coAuthors,
        authorAffiliation: data.authorAffiliation,
        supervisorName: data.supervisorName,
        r2FileKey: data.r2FileKey,
        fileName: data.fileName,
        fileSize: data.fileSize,
        presentationFileKey: data.presentationFileKey,
        presentationFileName: data.presentationFileName,
      }];
    }

    if (hasAbstract && rawAbstracts.length > 0) {
      for (let i = 0; i < rawAbstracts.length; i++) {
        const item = rawAbstracts[i];
        const num = rawAbstracts.length > 1 ? ` (Abstract #${i + 1})` : "";
        if (!item.title || !item.title.trim()) {
          return new Response(
            JSON.stringify({ error: `Title of the Abstract is required${num}.` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!item.submissionType || !item.submissionType.trim()) {
          return new Response(
            JSON.stringify({ error: `Please select a submission type${num}.` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!item.presentationCategory || !item.presentationCategory.trim()) {
          return new Response(
            JSON.stringify({ error: `Please select a presentation category${num}.` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!item.abstractBody || !item.abstractBody.trim()) {
          return new Response(
            JSON.stringify({ error: `Abstract text is required${num}.` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!item.r2FileKey || !item.fileName) {
          return new Response(
            JSON.stringify({ error: `Please upload your abstract file (PDF or DOCX)${num}.` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Determine sequential registration number
    const maxRow = await env.DB.prepare("SELECT MAX(id) as maxId FROM registrations").first();
    const nextSeq = ((maxRow && maxRow.maxId) || 0) + 1;
    const regNumber = `IMF-REG-${String(nextSeq).padStart(4, "0")}`;
    const verifySig = await generateVerifySig(regNumber, env.VERIFY_SECRET || env.EMAIL_SECRET || "IMF2026_SECRET_KEY");

    // Store Registration in D1
    await env.DB.prepare(`
      INSERT INTO registrations (
        reg_number, full_name, institution, batch, academic_year,
        phone, email, activities, competition_category, prior_experience, queries, verify_sig
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      regNumber,
      data.fullName.trim(),
      data.institution.trim(),
      data.batch.trim(),
      data.academicYear.trim(),
      data.phone.trim(),
      data.email.trim().toLowerCase(),
      JSON.stringify(data.activities || []),
      Array.isArray(data.competitionCategory)
        ? data.competitionCategory.join(", ")
        : (data.competitionCategory ? String(data.competitionCategory).trim() : null),
      data.priorExperience ? String(data.priorExperience).trim() : null,
      data.queries ? String(data.queries).trim() : null,
      verifySig
    ).run();

    const createdAbstractNumbers = [];
    const abstractsWithFiles = [];

    // If abstracts were included, insert each into abstracts table
    if (hasAbstract && rawAbstracts.length > 0) {
      for (const item of rawAbstracts) {
        const maxAbsRow = await env.DB.prepare("SELECT MAX(id) as maxId FROM abstracts").first();
        const nextAbsSeq = ((maxAbsRow && maxAbsRow.maxId) || 0) + 1;
        const currentAbsNumber = `IMF-ABS-${String(nextAbsSeq).padStart(4, "0")}`;
        createdAbstractNumbers.push(currentAbsNumber);

        const hasValidFile = Boolean(
          item.r2FileKey &&
          item.r2FileKey.trim() &&
          item.r2FileKey !== "pending" &&
          item.fileName &&
          item.fileName.trim()
        );
        if (hasValidFile) {
          abstractsWithFiles.push({
            title: (item.title && item.title.trim()) || "",
          });
        }

        await env.DB.prepare(`
          INSERT INTO abstracts (
            abstract_number, reg_number, full_name, institution, batch, academic_year,
            phone, email, title, submission_type, presentation_category,
            abstract_body, keywords, presenter_name, co_authors,
            author_affiliation, supervisor_name, r2_file_key, file_name,
            file_size, presentation_file_key, presentation_file_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          currentAbsNumber,
          regNumber,
          data.fullName.trim(),
          data.institution.trim(),
          data.batch.trim(),
          data.academicYear.trim(),
          data.phone.trim(),
          data.email.trim().toLowerCase(),
          item.title.trim(),
          item.submissionType.trim(),
          item.presentationCategory.trim(),
          item.abstractBody.trim(),
          item.keywords ? String(item.keywords).trim() : null,
          (item.presenterName && item.presenterName.trim()) || data.fullName.trim(),
          item.coAuthors ? String(item.coAuthors).trim() : null,
          item.authorAffiliation ? String(item.authorAffiliation).trim() : null,
          item.supervisorName ? String(item.supervisorName).trim() : null,
          item.r2FileKey.trim(),
          item.fileName.trim(),
          Number(item.fileSize) || 0,
          item.presentationFileKey ? String(item.presentationFileKey).trim() : null,
          item.presentationFileName ? String(item.presentationFileName).trim() : null
        ).run();
      }
    }

    const abstractNumber = createdAbstractNumbers.join(", ") || null;

    // Send registration confirmation email via Resend (non-blocking)
    try {
      const emailPromise = sendEmail({
        env,
        to: data.email.trim().toLowerCase(),
        subject: `IMF 2026 Registration Confirmation [${regNumber}]`,
        html: buildRegistrationEmail({
          fullName: data.fullName.trim(),
          regNumber,
          email: data.email.trim().toLowerCase(),
          abstractNumber,
          abstractTitle: hasAbstract ? data.abstractTitle?.trim() : null,
          submissionType: hasAbstract ? data.submissionType?.trim() : null,
          presentationCategory: hasAbstract ? data.presentationCategory?.trim() : null,
          phone: data.phone.trim(),
          institution: data.institution.trim(),
          batch: data.batch.trim(),
          activities: data.activities || [],
          competitionCategory: data.competitionCategory,
        }),
      });

      if (context.waitUntil && typeof context.waitUntil === "function") {
        context.waitUntil(emailPromise);
      } else {
        emailPromise.catch((e) => console.error("[Email Error]", e));
      }
    } catch (emailErr) {
      console.error("[Email Dispatch Error]", emailErr);
    }

    // Send Poster Presentation Selection & Guidelines email for each abstract with uploaded file
    for (const abs of abstractsWithFiles) {
      try {
        const posterPromise = sendEmail({
          env,
          to: data.email.trim().toLowerCase(),
          subject: "IMF 2026 — Abstract Selected for Poster Presentation",
          html: buildPosterSelectionEmail({
            fullName: data.fullName.trim(),
            regNumber,
            abstractTitle: abs.title,
          }),
        });

        if (context.waitUntil && typeof context.waitUntil === "function") {
          context.waitUntil(posterPromise);
        } else {
          posterPromise.catch((e) => console.error("[Poster Email Error]", e));
        }
      } catch (posterErr) {
        console.error("[Poster Email Dispatch Error]", posterErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        regNumber,
        verifySig,
        abstractNumber,
        abstractNumbers: createdAbstractNumbers,
        hasAbstract,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
