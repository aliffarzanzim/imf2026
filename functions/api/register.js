// functions/api/register.js
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

    // Determine sequential registration number
    const maxRow = await env.DB.prepare("SELECT MAX(id) as maxId FROM registrations").first();
    const nextSeq = ((maxRow && maxRow.maxId) || 0) + 1;
    const regNumber = `IMF-REG-${String(nextSeq).padStart(4, "0")}`;

    // Store in D1
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

    return new Response(
      JSON.stringify({ success: true, regNumber }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
