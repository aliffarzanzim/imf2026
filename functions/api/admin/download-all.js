// functions/api/admin/download-all.js
import { downloadZip } from "client-zip";
import { checkAdminAuth } from "./_auth.js";

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    const isAuthed = await checkAdminAuth(request, env);
    if (!isAuthed) {
      return new Response("Unauthorized: Invalid admin token.", { status: 401 });
    }

    if (!env.DB) {
      return new Response("Database binding not found.", { status: 500 });
    }

    if (!env.ABSTRACTS_BUCKET) {
      return new Response("Storage bucket binding not found.", { status: 500 });
    }

    const { results } = await env.DB.prepare(
      "SELECT abstract_number, full_name, file_name, r2_file_key FROM abstracts"
    ).all();

    if (!results || results.length === 0) {
      return new Response("No abstracts available to download.", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    async function* getFiles() {
      for (const row of results) {
        if (!row.r2_file_key) continue;
        try {
          const obj = await env.ABSTRACTS_BUCKET.get(row.r2_file_key);
          if (obj) {
            const ext = row.file_name?.includes(".")
              ? "." + row.file_name.split(".").pop()
              : "";
            const safeName = `${row.abstract_number}_${(row.full_name || "Author").replace(/[^a-zA-Z0-9_-]/g, "_")}${ext}`;
            yield {
              name: safeName,
              input: obj.body,
              lastModified: obj.uploaded ? new Date(obj.uploaded) : new Date(),
            };
          }
        } catch (_) {
          // Continue with next file if one fails
        }
      }
    }

    const zipResponse = downloadZip(getFiles());
    const timestamp = new Date().toISOString().slice(0, 10);

    return new Response(zipResponse.body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="IMF_2026_Abstracts_${timestamp}.zip"`,
      },
    });
  } catch (err) {
    return new Response(`Export failed: ${err.message}`, { status: 500 });
  }
}
