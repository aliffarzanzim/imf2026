// functions/api/register.js
import { sendEmail, buildRegistrationEmail } from "./_email.js";

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(
        JSON.stringify({ error: "Database binding (DB) is missing. Please configure D1 in wrangler.toml." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ensure reg_number column exists in abstracts if migrated from earlier schema
    try {
      await env.DB.prepare("ALTER TABLE abstracts ADD COLUMN reg_number TEXT").run();
    } catch (_) {
      // Column already exists
    }

    const data = await request.json();

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
    if (!emailRegex.test(data.email.trim())) {
      return new Response(
        JSON.stringify({ error: "Invalid email address format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Abstract validation if user opted into submitting an abstract
    const hasAbstract = Boolean(data.hasAbstract || data.submitAbstract);
    if (hasAbstract) {
      if (!data.abstractTitle || !data.abstractTitle.trim()) {
        return new Response(
          JSON.stringify({ error: "Abstract title is required when submitting an abstract." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      if (!data.submissionType || !data.submissionType.trim()) {
        return new Response(
          JSON.stringify({ error: "Please select a submission type for your abstract." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      if (!data.presentationCategory || !data.presentationCategory.trim()) {
        return new Response(
          JSON.stringify({ error: "Please select a presentation preference (Oral / Poster)." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      if (!data.abstractBody || data.abstractBody.trim().length < 50) {
        return new Response(
          JSON.stringify({ error: "Abstract body must be at least 50 characters." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      if (!data.r2FileKey || !data.fileName) {
        return new Response(
          JSON.stringify({ error: "Please upload your abstract manuscript document (PDF or DOCX)." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Determine sequential registration number
    const maxRow = await env.DB.prepare("SELECT MAX(id) as maxId FROM registrations").first();
    const nextSeq = ((maxRow && maxRow.maxId) || 0) + 1;
    const regNumber = `IMF-REG-${String(nextSeq).padStart(4, "0")}`;

    // Store Registration in D1
    await env.DB.prepare(`
      INSERT INTO registrations (
        reg_number, full_name, institution, batch, academic_year,
        phone, email, activities, competition_category, prior_experience, queries
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      regNumber,
      data.fullName.trim(),
      data.institution.trim(),
      data.batch.trim(),
      data.academicYear.trim(),
      data.phone.trim(),
      data.email.trim().toLowerCase(),
      JSON.stringify(data.activities || []),
      data.competitionCategory ? String(data.competitionCategory).trim() : null,
      data.priorExperience ? String(data.priorExperience).trim() : null,
      data.queries ? String(data.queries).trim() : null
    ).run();

    let abstractNumber = null;

    // If abstract was included, insert into abstracts table using registration info directly
    if (hasAbstract) {
      const maxAbsRow = await env.DB.prepare("SELECT MAX(id) as maxId FROM abstracts").first();
      const nextAbsSeq = ((maxAbsRow && maxAbsRow.maxId) || 0) + 1;
      abstractNumber = `IMF-ABS-${String(nextAbsSeq).padStart(4, "0")}`;

      await env.DB.prepare(`
        INSERT INTO abstracts (
          abstract_number, reg_number, full_name, institution, batch, academic_year,
          phone, email, title, submission_type, presentation_category,
          abstract_body, keywords, presenter_name, co_authors,
          author_affiliation, supervisor_name, r2_file_key, file_name,
          file_size, presentation_file_key, presentation_file_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        abstractNumber,
        regNumber,
        data.fullName.trim(),
        data.institution.trim(),
        data.batch.trim(),
        data.academicYear.trim(),
        data.phone.trim(),
        data.email.trim().toLowerCase(),
        data.abstractTitle.trim(),
        data.submissionType.trim(),
        data.presentationCategory.trim(),
        data.abstractBody.trim(),
        data.keywords ? String(data.keywords).trim() : null,
        (data.presenterName && data.presenterName.trim()) || data.fullName.trim(),
        data.coAuthors ? String(data.coAuthors).trim() : null,
        data.authorAffiliation ? String(data.authorAffiliation).trim() : data.institution.trim(),
        data.supervisorName ? String(data.supervisorName).trim() : null,
        data.r2FileKey.trim(),
        data.fileName.trim(),
        Number(data.fileSize) || 0,
        data.presentationFileKey ? String(data.presentationFileKey).trim() : null,
        data.presentationFileName ? String(data.presentationFileName).trim() : null
      ).run();
    }

    // Send registration confirmation email via Resend (non-blocking)
    try {
      const emailPromise = sendEmail({
        env,
        to: data.email.trim().toLowerCase(),
        subject: `IMF 2026 Registration Confirmation [${regNumber}]`,
        html: buildRegistrationEmail({
          fullName: data.fullName.trim(),
          regNumber,
          abstractNumber,
          abstractTitle: hasAbstract ? data.abstractTitle?.trim() : null,
          submissionType: hasAbstract ? data.submissionType?.trim() : null,
          presentationCategory: hasAbstract ? data.presentationCategory?.trim() : null,
          phone: data.phone.trim(),
          institution: data.institution.trim(),
          batch: data.batch.trim(),
          activities: data.activities || [],
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

    return new Response(
      JSON.stringify({
        success: true,
        regNumber,
        abstractNumber,
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
