// functions/api/admin/login.js
import { createToken } from "./_auth.js";

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { password } = body;

    const expectedPassword = env.ADMIN_PASSWORD;

    if (!expectedPassword) {
      // In development or if not yet set, reject or provide clear message
      return new Response(
        JSON.stringify({ error: "ADMIN_PASSWORD secret is not configured in Cloudflare environment." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!password || password !== expectedPassword) {
      return new Response(
        JSON.stringify({ error: "Invalid admin password." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = await createToken(expectedPassword);

    return new Response(
      JSON.stringify({ success: true, token }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Login failed." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
