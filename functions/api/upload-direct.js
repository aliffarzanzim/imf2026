// functions/api/upload-direct.js
export async function onRequestPut(context) {
  try {
    const { request, env } = context;

    if (!env.ABSTRACTS_BUCKET) {
      return new Response(
        JSON.stringify({ error: "R2 bucket binding (ABSTRACTS_BUCKET) not configured." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (!key) {
      return new Response(
        JSON.stringify({ error: "Storage key is required in query params." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const contentType = request.headers.get("content-type") || "application/octet-stream";
    await env.ABSTRACTS_BUCKET.put(key, request.body, {
      httpMetadata: { contentType },
    });

    return new Response(
      JSON.stringify({ success: true, key }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Upload failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
