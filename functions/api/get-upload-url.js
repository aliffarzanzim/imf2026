// functions/api/get-upload-url.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { fileName, fileType } = body;

    if (!fileName) {
      return new Response(
        JSON.stringify({ error: "fileName is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
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

    // Option 2: Fallback to direct upload endpoint using ABSTRACTS_BUCKET binding
    const uploadUrl = `/api/upload-direct?key=${encodeURIComponent(fileKey)}`;
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
