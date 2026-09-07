// functions/api/admin/file.js
import { checkAdminAuth } from "./_auth.js";

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    const isAuthed = await checkAdminAuth(request, env);
    if (!isAuthed) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!env.ABSTRACTS_BUCKET) {
      return new Response("Storage bucket binding missing", { status: 500 });
    }

    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    const downloadName = url.searchParams.get("name") || "abstract_document";

    if (!key) {
      return new Response("Missing file key parameter", { status: 400 });
    }

    const object = await env.ABSTRACTS_BUCKET.get(key);
    if (!object) {
      return new Response("File not found in storage", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(downloadName)}"`
    );

    return new Response(object.body, {
      headers,
    });
  } catch (err) {
    return new Response(`Download error: ${err.message}`, { status: 500 });
  }
}
