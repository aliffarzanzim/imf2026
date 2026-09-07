// functions/api/upload-direct.js

async function verifyTicket(key, sig, secret) {
  if (!sig || !key) return false;
  const enc = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret || "imf2026_upload_default_signing_key"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  try {
    const unpadded = sig.replace(/-/g, "+").replace(/_/g, "/");
    const pad = unpadded.length % 4;
    const base64 = pad ? unpadded + "=".repeat(4 - pad) : unpadded;
    const binStr = atob(base64);
    const sigBytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      sigBytes[i] = binStr.charCodeAt(i);
    }
    return await crypto.subtle.verify("HMAC", hmacKey, sigBytes, enc.encode(key));
  } catch (_) {
    return false;
  }
}

export async function onRequestPut(context) {
  try {
    const { request, env } = context;

    if (!env.ABSTRACTS_BUCKET) {
      return new Response(
        JSON.stringify({
          error: "R2 storage bucket is pending activation in the Cloudflare Dashboard. Please enable R2 at https://dash.cloudflare.com to accept file uploads.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }


    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    const sig = url.searchParams.get("sig");

    if (!key || !key.startsWith("abstracts/")) {
      return new Response(
        JSON.stringify({ error: "Invalid storage destination path." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify cryptographic signature ticket issued by /api/get-upload-url
    const validTicket = await verifyTicket(key, sig, env.ADMIN_PASSWORD);
    if (!validTicket) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or forged upload signature ticket." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Size limit check via header if present (30 MB max)
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 30 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: "File exceeds the maximum allowed 30 MB limit." }),
        { status: 413, headers: { "Content-Type": "application/json" } }
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
