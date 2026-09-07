// functions/api/update-registration.js
import { sendEmail, buildUpdateConfirmationEmail } from "./_email.js";

function normalizePhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/[^0-9]/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
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

    // Ensure reg_number column exists in abstracts
    try {
      await env.DB.prepare("ALTER TABLE abstracts ADD COLUMN reg_number TEXT").run();
    } catch (_) {
      // Column already exists
    }

    const body = await request.json();
    const { regNumber, email, phone, registration: regUpdates, abstract: absUpdates } = body;

    const identifierReg = (regNumber && String(regNumber).trim().toUpperCase()) || "";
    const identifierEmail = (email && String(email).trim().toLowerCase()) || "";

    if (!identifierReg && !identifierEmail) {
      return new Response(
        JSON.stringify({ error: "Registration Number or Email is required for update." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Authenticate delegate record
    let reg = null;
    if (identifierReg) {
      reg = await env.DB.prepare(
        "SELECT * FROM registrations WHERE UPPER(TRIM(reg_number)) = ? LIMIT 1"
      ).bind(identifierReg).first();
    } else {
      reg = await env.DB.prepare(
        "SELECT * FROM registrations WHERE LOWER(TRIM(email)) = ? ORDER BY id DESC LIMIT 1"
      ).bind(identifierEmail).first();
    }

    if (!reg) {
      return new Response(
        JSON.stringify({ error: "Registration record not found." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Update Registration if regUpdates provided
    let updatedFullName = reg.full_name;
    let updatedInstitution = reg.institution;
    let updatedBatch = reg.batch;
    let updatedYear = reg.academic_year;
    let updatedPhone = reg.phone;
    let updatedEmail = reg.email;

    if (regUpdates) {
      updatedFullName = (regUpdates.fullName && regUpdates.fullName.trim()) || reg.full_name;
      updatedInstitution = (regUpdates.institution && regUpdates.institution.trim()) || reg.institution;
      updatedBatch = (regUpdates.batch && regUpdates.batch.trim()) || reg.batch;
      updatedYear = (regUpdates.academicYear && regUpdates.academicYear.trim()) || reg.academic_year;
      updatedPhone = (regUpdates.phone && regUpdates.phone.trim()) || reg.phone;
      updatedEmail = (regUpdates.email && regUpdates.email.trim().toLowerCase()) || reg.email;

      await env.DB.prepare(`
        UPDATE registrations
        SET full_name = ?, institution = ?, batch = ?, academic_year = ?,
            phone = ?, email = ?, activities = ?, competition_category = ?,
            prior_experience = ?, queries = ?
        WHERE id = ?
      `).bind(
        updatedFullName,
        updatedInstitution,
        updatedBatch,
        updatedYear,
        updatedPhone,
        updatedEmail,
        JSON.stringify(regUpdates.activities || []),
        regUpdates.competitionCategory ? String(regUpdates.competitionCategory).trim() : null,
        regUpdates.priorExperience ? String(regUpdates.priorExperience).trim() : null,
        regUpdates.queries ? String(regUpdates.queries).trim() : null,
        reg.id
      ).run();
    }

    // 2. Abstract submission or update
    let abstractNumber = null;

    if (absUpdates && (absUpdates.title || absUpdates.abstractBody)) {
      // Find existing abstract
      let existingAbs = null;
      try {
        existingAbs = await env.DB.prepare(
          "SELECT * FROM abstracts WHERE reg_number = ? LIMIT 1"
        ).bind(reg.reg_number).first();
      } catch (_) {}

      if (!existingAbs) {
        existingAbs = await env.DB.prepare(
          "SELECT * FROM abstracts WHERE LOWER(TRIM(phone)) = ? AND LOWER(TRIM(email)) = ? ORDER BY id DESC LIMIT 1"
        ).bind(reg.phone.trim().toLowerCase(), reg.email.trim().toLowerCase()).first();
      }

      if (existingAbs) {
        // Update existing abstract
        abstractNumber = existingAbs.abstract_number;
        const newFileKey = absUpdates.r2FileKey || existingAbs.r2_file_key;
        const newFileName = absUpdates.fileName || existingAbs.file_name;
        const newFileSize = absUpdates.fileSize !== undefined ? Number(absUpdates.fileSize) : existingAbs.file_size;

        await env.DB.prepare(`
          UPDATE abstracts
          SET reg_number = ?,
              full_name = ?,
              institution = ?,
              batch = ?,
              academic_year = ?,
              phone = ?,
              email = ?,
              title = ?,
              submission_type = ?,
              presentation_category = ?,
              abstract_body = ?,
              keywords = ?,
              presenter_name = ?,
              co_authors = ?,
              author_affiliation = ?,
              supervisor_name = ?,
              r2_file_key = ?,
              file_name = ?,
              file_size = ?
          WHERE id = ?
        `).bind(
          reg.reg_number,
          updatedFullName,
          updatedInstitution,
          updatedBatch,
          updatedYear,
          updatedPhone,
          updatedEmail,
          (absUpdates.title && absUpdates.title.trim()) || existingAbs.title,
          (absUpdates.submissionType && absUpdates.submissionType.trim()) || existingAbs.submission_type,
          (absUpdates.presentationCategory && absUpdates.presentationCategory.trim()) || existingAbs.presentation_category,
          (absUpdates.abstractBody && absUpdates.abstractBody.trim()) || existingAbs.abstract_body,
          absUpdates.keywords ? String(absUpdates.keywords).trim() : existingAbs.keywords,
          (absUpdates.presenterName && absUpdates.presenterName.trim()) || existingAbs.presenter_name,
          absUpdates.coAuthors ? String(absUpdates.coAuthors).trim() : existingAbs.co_authors,
          (absUpdates.authorAffiliation && absUpdates.authorAffiliation.trim()) || existingAbs.author_affiliation,
          absUpdates.supervisorName ? String(absUpdates.supervisorName).trim() : existingAbs.supervisor_name,
          newFileKey,
          newFileName,
          newFileSize,
          existingAbs.id
        ).run();
      } else {
        // First-time abstract submission for this registered user!
        if (!absUpdates.title || !absUpdates.title.trim()) {
          return new Response(
            JSON.stringify({ error: "Abstract title is required." }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!absUpdates.r2FileKey || !absUpdates.fileName) {
          return new Response(
            JSON.stringify({ error: "Please attach your abstract manuscript document (PDF or DOCX)." }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

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
          reg.reg_number,
          updatedFullName,
          updatedInstitution,
          updatedBatch,
          updatedYear,
          updatedPhone,
          updatedEmail,
          absUpdates.title.trim(),
          (absUpdates.submissionType && absUpdates.submissionType.trim()) || "Original Research",
          (absUpdates.presentationCategory && absUpdates.presentationCategory.trim()) || "Oral Presentation",
          (absUpdates.abstractBody && absUpdates.abstractBody.trim()) || "",
          absUpdates.keywords ? String(absUpdates.keywords).trim() : null,
          (absUpdates.presenterName && absUpdates.presenterName.trim()) || updatedFullName,
          absUpdates.coAuthors ? String(absUpdates.coAuthors).trim() : null,
          (absUpdates.authorAffiliation && absUpdates.authorAffiliation.trim()) || updatedInstitution,
          absUpdates.supervisorName ? String(absUpdates.supervisorName).trim() : null,
          absUpdates.r2FileKey.trim(),
          absUpdates.fileName.trim(),
          Number(absUpdates.fileSize) || 0,
          absUpdates.presentationFileKey ? String(absUpdates.presentationFileKey).trim() : null,
          absUpdates.presentationFileName ? String(absUpdates.presentationFileName).trim() : null
        ).run();
      }
    }

    // Send confirmation email (non-blocking)
    try {
      const emailPromise = sendEmail({
        env,
        to: updatedEmail.trim().toLowerCase(),
        subject: `IMF 2026 Registration Details Updated [${reg.reg_number}]`,
        html: buildUpdateConfirmationEmail({
          fullName: updatedFullName,
          regNumber: reg.reg_number,
          abstractNumber,
          isAbstractUpdate: Boolean(absUpdates),
        }),
      });

      if (context.waitUntil && typeof context.waitUntil === "function") {
        context.waitUntil(emailPromise);
      } else {
        emailPromise.catch((e) => console.error("[Update Email Error]", e));
      }
    } catch (emailErr) {
      console.error("[Update Email Dispatch Error]", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        regNumber: reg.reg_number,
        abstractNumber,
        message: "Your registration details and abstract have been successfully updated.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Failed to update registration" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
