// functions/api/admin/config.js
// Admin endpoint to read and update system toggles (registration & abstract editing)
import { checkAdminAuth } from "./_auth.js";

export async function onRequest(context) {
  const { request, env } = context;

  const isAuthed = await checkAdminAuth(request, env);
  if (!isAuthed) {
    return new Response(
      JSON.stringify({ error: "Unauthorized. Admin credentials required." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!env.DB) {
    return new Response(
      JSON.stringify({ error: "Database binding missing." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Ensure system_config table exists
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `).run();
  } catch (_) {}

  if (request.method === "GET") {
    const rows = await env.DB.prepare("SELECT key, value, updated_at FROM system_config").all();
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
      headers: { "Content-Type": "application/json" },
    });
  }

  if (request.method === "POST" || request.method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const { registration_open, abstract_edit_open } = body;

    const updates = [];
    if (typeof registration_open === "boolean") {
      updates.push(
        env.DB.prepare(
          "INSERT INTO system_config (key, value, updated_at) VALUES ('registration_open', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
        ).bind(String(registration_open))
      );
    }
    if (typeof abstract_edit_open === "boolean") {
      updates.push(
        env.DB.prepare(
          "INSERT INTO system_config (key, value, updated_at) VALUES ('abstract_edit_open', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
        ).bind(String(abstract_edit_open))
      );
    }

    if (updates.length > 0) {
      await env.DB.batch(updates);
    }

    // Return the updated config
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

    return new Response(JSON.stringify({ success: true, config }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}
