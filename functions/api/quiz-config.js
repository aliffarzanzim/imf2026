import { verifyToken } from "./admin/_auth.js";

// functions/api/quiz-config.js
// Provides the active live WebSocket tunnel endpoint to all player mobile phones and stage host

export async function onRequestGet(context) {
  try {
    const { env } = context;
    if (!env.DB) {
      return new Response(
        JSON.stringify({ ws_url: null, error: "DB binding missing" }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    }

    // Ensure system_config table exists
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `).run();

    const row = await env.DB.prepare(
      "SELECT value, updated_at FROM system_config WHERE key = 'quiz_ws_url'"
    ).first();

    return new Response(
      JSON.stringify({
        ws_url: row ? row.value : null,
        updated_at: row ? row.updated_at : null,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ws_url: null, error: err.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    if (!env.DB) {
      return new Response(
        JSON.stringify({ error: "DB binding missing" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { ws_url, pin } = body;

    // PIN or Admin Token protection
    let isAuthed = pin === "2026";
    if (!isAuthed) {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (token && env.ADMIN_PASSWORD) {
        isAuthed = await verifyToken(token, env.ADMIN_PASSWORD);
      }
    }

    if (!isAuthed) {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Valid PIN or admin authentication required." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!ws_url || typeof ws_url !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid or missing ws_url" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const cleanUrl = ws_url.trim();

    // Ensure table exists
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `).run();

    // Upsert into system_config
    await env.DB.prepare(`
      INSERT INTO system_config (key, value, updated_at)
      VALUES ('quiz_ws_url', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).bind(cleanUrl).run();

    return new Response(
      JSON.stringify({
        success: true,
        ws_url: cleanUrl,
        message: "Quiz WebSocket tunnel URL updated and synced to all participants",
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
