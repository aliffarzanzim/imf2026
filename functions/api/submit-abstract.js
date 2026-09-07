// functions/api/submit-abstract.js
export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(
        JSON.stringify({ error: "Database binding (DB) is missing. Please configure D1 in wrangler.toml." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await request.json();

    // Required fields validation
    const required = [
      "fullName", "institution", "batch", "academicYear", "phone", "email",
      "title", "submissionType", "presentationCategory", "abstractBody",
      "presenterName", "r2FileKey", "fileName"
    ];

    for (const field of required) {
      if (!data[field] || (typeof data[field] === "string" && !data[field].trim())) {
        return new Response(
          JSON.stringify({ error: `Missing required field: ${field}` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Determine sequential abstract number
    const maxRow = await env.DB.prepare("SELECT MAX(id) as maxId FROM abstracts").first();
    const nextSeq = ((maxRow && maxRow.maxId) || 0) + 1;
    const abstractNumber = `IMF-ABS-${String(nextSeq).padStart(4, "0")}`;

    await env.DB.prepare(`
      INSERT INTO abstracts (
        abstract_number, full_name, institution, batch, academic_year,
        phone, email, title, submission_type, presentation_category,
        abstract_body, keywords, presenter_name, co_authors,
        author_affiliation, supervisor_name, r2_file_key, file_name,
        file_size, presentation_file_key, presentation_file_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      abstractNumber,
      data.fullName.trim(),
      data.institution.trim(),
      data.batch.trim(),
      data.academicYear.trim(),
      data.phone.trim(),
      data.email.trim().toLowerCase(),
      data.title.trim(),
      data.submissionType.trim(),
      data.presentationCategory.trim(),
      data.abstractBody.trim(),
      data.keywords ? String(data.keywords).trim() : null,
      data.presenterName.trim(),
      data.coAuthors ? String(data.coAuthors).trim() : null,
      data.authorAffiliation ? String(data.authorAffiliation).trim() : null,
      data.supervisorName ? String(data.supervisorName).trim() : null,
      data.r2FileKey.trim(),
      data.fileName.trim(),
      Number(data.fileSize) || 0,
      data.presentationFileKey ? String(data.presentationFileKey).trim() : null,
      data.presentationFileName ? String(data.presentationFileName).trim() : null
    ).run();

    return new Response(
      JSON.stringify({ success: true, abstractNumber }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
