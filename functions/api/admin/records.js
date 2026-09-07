// functions/api/admin/records.js
import { checkAdminAuth } from "./_auth.js";

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    const isAuthed = await checkAdminAuth(request, env);
    if (!isAuthed) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or expired admin token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!env.DB) {
      return new Response(
        JSON.stringify({ error: "Database binding not available" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { results: regResults } = await env.DB.prepare(
      "SELECT * FROM registrations ORDER BY id DESC"
    ).all();

    const registrations = (regResults || []).map((r) => {
      let parsedActivities = [];
      try {
        parsedActivities = r.activities ? JSON.parse(r.activities) : [];
      } catch (_) {
        parsedActivities = r.activities || [];
      }
      return {
        ...r,
        activities: parsedActivities,
      };
    });

    const { results: absResults } = await env.DB.prepare(
      "SELECT * FROM abstracts ORDER BY id DESC"
    ).all();

    return new Response(
      JSON.stringify({ registrations, abstracts: absResults || [] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Failed to fetch records" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function onRequestPut(context) {
  try {
    const { request, env } = context;

    const isAuthed = await checkAdminAuth(request, env);
    if (!isAuthed) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();
    const { id, fullName, institution, batch, academicYear, phone } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ error: "Record ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    await env.DB.prepare(`
      UPDATE registrations
      SET full_name = ?, institution = ?, batch = ?, academic_year = ?, phone = ?
      WHERE id = ?
    `).bind(
      fullName || "",
      institution || "",
      batch || "",
      academicYear || "",
      phone || "",
      id
    ).run();

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Update failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function onRequestDelete(context) {
  try {
    const { request, env } = context;

    const isAuthed = await checkAdminAuth(request, env);
    if (!isAuthed) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();
    const { type, id } = body;

    if (!id || !type) {
      return new Response(
        JSON.stringify({ error: "Both type and id are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (type === "registration") {
      await env.DB.prepare("DELETE FROM registrations WHERE id = ?").bind(id).run();
    } else if (type === "abstract") {
      // Fetch file keys to clean up R2 objects
      const row = await env.DB.prepare(
        "SELECT r2_file_key, presentation_file_key FROM abstracts WHERE id = ?"
      ).bind(id).first();

      if (row && env.ABSTRACTS_BUCKET) {
        if (row.r2_file_key) {
          try { await env.ABSTRACTS_BUCKET.delete(row.r2_file_key); } catch (_) {}
        }
        if (row.presentation_file_key) {
          try { await env.ABSTRACTS_BUCKET.delete(row.presentation_file_key); } catch (_) {}
        }
      }

      await env.DB.prepare("DELETE FROM abstracts WHERE id = ?").bind(id).run();
    } else {
      return new Response(
        JSON.stringify({ error: "Unknown record type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Delete failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
