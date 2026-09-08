// functions/api/config.js
// Public endpoint to get system configuration status (registration & abstract editing toggles)

export async function onRequestGet(context) {
  try {
    const { env } = context;
    if (!env.DB) {
      return new Response(
        JSON.stringify({ registration_open: true, abstract_edit_open: true }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Read all keys from system_config
    const rows = await env.DB.prepare("SELECT key, value FROM system_config").all();
    const config = {
      registration_open: true,
      abstract_edit_open: true,
    };

    if (rows && rows.results) {
      for (const row of rows.results) {
        if (row.key === "registration_open") {
          config.registration_open = row.value === "true";
        } else if (row.key === "abstract_edit_open") {
          config.abstract_edit_open = row.value === "true";
        }
      }
    }

    return new Response(JSON.stringify(config), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ registration_open: true, abstract_edit_open: true, error: err.message }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}
