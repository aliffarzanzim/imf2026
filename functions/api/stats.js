// functions/api/stats.js
// Public endpoint to get live festival registration and college count milestones

export async function onRequestGet(context) {
  try {
    const { env } = context;

    // Fallback baseline if DB is not bound
    const fallback = {
      totalRegistrations: 615,
      totalColleges: 34,
    };

    if (!env.DB) {
      return new Response(JSON.stringify(fallback), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Run queries concurrently
    const [regRow, collegeRow] = await Promise.all([
      env.DB.prepare("SELECT COUNT(id) as total FROM registrations").first(),
      env.DB.prepare(
        "SELECT COUNT(DISTINCT TRIM(LOWER(institution))) as total FROM registrations WHERE institution IS NOT NULL AND TRIM(institution) != ''"
      ).first(),
    ]);

    const totalRegistrations = regRow?.total ?? fallback.totalRegistrations;
    const totalColleges = collegeRow?.total ?? fallback.totalColleges;

    return new Response(
      JSON.stringify({
        totalRegistrations,
        totalColleges,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60, s-maxage=60",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        totalRegistrations: 615,
        totalColleges: 34,
        error: err.message,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
