// quiz-worker/src/index.js
export { QuizRoom } from "./room.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = [
      "https://imf2026.pages.dev",
      "https://imf.aurum.eu.org",
      "http://localhost:5173", // local dev
    ];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Vary": "Origin",
        },
      });
    }

    // Single synchronized live auditorium room
    const roomId = env.QUIZ_ROOM.idFromName("imf2026-main-auditorium");
    const room = env.QUIZ_ROOM.get(roomId);

    // Forward WebSocket or API request into the Durable Object using internal scheme
    const doUrl = new URL(request.url);
    doUrl.protocol = "http:";
    doUrl.hostname = "quiz-room.internal";
    const doRequest = new Request(doUrl.toString(), request);
    const response = await room.fetch(doRequest);

    // Pass through WebSocket handshake directly
    if (response.status === 101 || request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return response;
    }

    // Inject restricted CORS for standard HTTP endpoints
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", corsOrigin);
    newHeaders.set("Vary", "Origin");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
