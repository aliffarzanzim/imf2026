// functions/api/get-upload-url.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ALLOWED_EXTS = ["pdf", "docx", "doc", "ppt", "pptx"];
const ALLOWED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/octet-stream",
];

async function generateTicket(key, secret) {
  const enc = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret || "imf2026_upload_default_signing_key"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", hmacKey, enc.encode(key));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { fileName, fileType } = body;

    if (!fileName || typeof fileName !== "string") {
      return new Response(
        JSON.stringify({ error: "fileName is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Security check 1: File extension whitelist
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      return new Response(
        JSON.stringify({
          error: `Unsupported file format (.${ext}). Only PDF, Word, and PowerPoint files are allowed.`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Security check 2: Strict filename sanitization (prevent traversal)
    const baseName = fileName.replace(/[\/\\]/g, "").replace(/\.\./g, "");
    const sanitizedName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const fileKey = `abstracts/${timestamp}-${random}-${sanitizedName}`;

    const bucketName = env.R2_BUCKET_NAME || "imf-abstracts";

    // Option 1: S3 Presigned URL if R2 S3 credentials are provided
    if (env.CF_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
      const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
        ContentType: fileType || "application/octet-stream",
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
      return new Response(
        JSON.stringify({ uploadUrl, fileKey }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Option 2: Fallback to signed direct upload endpoint using R2 binding
    const ticket = await generateTicket(fileKey, env.ADMIN_PASSWORD);
    const uploadUrl = `/api/upload-direct?key=${encodeURIComponent(fileKey)}&sig=${encodeURIComponent(ticket)}`;

    return new Response(
      JSON.stringify({ uploadUrl, fileKey }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Failed to generate upload URL" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
