// functions/api/quiz-player-lookup.js
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

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Please enter your registered email address." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Query registration by email (no emails sent, strictly read-only lookup for quiz)
    const reg = await env.DB.prepare(
      "SELECT id, reg_number, full_name, institution, batch, academic_year, email FROM registrations WHERE LOWER(TRIM(email)) = ? ORDER BY id DESC LIMIT 1"
    ).bind(email).first();

    if (!reg) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No registration found for "${email}". Please enter the exact email you registered with for IMF 2026.`,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
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
