// functions/api/career-club-qna.js
// Cloudflare Pages Function for Career Club Anonymous Q&A

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: JSON_HEADERS,
  });
}

// Ensure the questions table and index exist in D1
async function ensureTableExists(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS career_club_questions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        email       TEXT NOT NULL,
        question    TEXT NOT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_career_qna_email ON career_club_questions(email)
    `).run();
  } catch (err) {
    console.error("Failed to ensure career_club_questions table:", err);
  }
}

// GET: Fetch questions (anonymized; submitter email is never exposed)
export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: "Database not configured" }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    await ensureTableExists(env.DB);

    const url = new URL(request.url);
    const emailQuery = (url.searchParams.get("email") || "").trim().toLowerCase();

    const { results } = await env.DB.prepare(`
      SELECT id, question, email, created_at, updated_at
      FROM career_club_questions
      ORDER BY id DESC
    `).all();

    // Map rows to preserve complete anonymity while identifying own questions for edit/delete
    const questions = (results || []).map((row) => {
      const isOwner = Boolean(
        emailQuery &&
        row.email &&
        row.email.trim().toLowerCase() === emailQuery
      );

      return {
        id: row.id,
        question: row.question,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isOwner,
      };
    });

    return new Response(
      JSON.stringify({ success: true, questions }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err) {
    console.error("career-club-qna GET error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to fetch questions" }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}

// POST: Verify email OR Create new question
export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: "Database not configured" }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    await ensureTableExists(env.DB);

    const body = await request.json().catch(() => ({}));
    const action = body.action || "create";
    const email = (body.email && String(body.email).trim().toLowerCase()) || "";

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Please provide your registered email address." }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // 1. Action: Verify registered email (no OTP sent, just checking registration for anti-spam)
    if (action === "verify" || action === "verify-email") {
      const reg = await env.DB.prepare(
        "SELECT id, reg_number, full_name, email FROM registrations WHERE LOWER(TRIM(email)) = ? ORDER BY id DESC LIMIT 1"
      ).bind(email).first();

      if (!reg) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `No registration found matching "${email}". Please enter the email you used when registering for IMF 2026.`,
          }),
          { status: 404, headers: JSON_HEADERS }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          email: reg.email.trim().toLowerCase(),
          fullName: reg.full_name,
        }),
        { status: 200, headers: JSON_HEADERS }
      );
    }

    // 2. Action: Create a question
    const questionText = (body.question && String(body.question).trim()) || "";
    if (!questionText) {
      return new Response(
        JSON.stringify({ success: false, error: "Please enter your question before saving." }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    if (questionText.length < 5) {
      return new Response(
        JSON.stringify({ success: false, error: "Questions must be at least 5 characters long." }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    if (questionText.length > 2000) {
      return new Response(
        JSON.stringify({ success: false, error: "Question cannot exceed 2000 characters." }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // Verify email is registered
    const reg = await env.DB.prepare(
      "SELECT id FROM registrations WHERE LOWER(TRIM(email)) = ? LIMIT 1"
    ).bind(email).first();

    if (!reg) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Only registered participants can post questions. Please verify your email.",
        }),
        { status: 403, headers: JSON_HEADERS }
      );
    }

    const insertResult = await env.DB.prepare(
      "INSERT INTO career_club_questions (email, question) VALUES (?, ?)"
    ).bind(email, questionText).run();

    const newId = insertResult.meta?.last_row_id || insertResult.lastRowId;

    return new Response(
      JSON.stringify({
        success: true,
        question: {
          id: newId,
          question: questionText,
          createdAt: new Date().toISOString(),
          isOwner: true,
        },
      }),
      { status: 201, headers: JSON_HEADERS }
    );
  } catch (err) {
    console.error("career-club-qna POST error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to process request" }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}

// PUT: Edit an existing question (owner only)
export async function onRequestPut(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: "Database not configured" }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    await ensureTableExists(env.DB);

    const body = await request.json().catch(() => ({}));
    const id = body.id;
    const email = (body.email && String(body.email).trim().toLowerCase()) || "";
    const questionText = (body.question && String(body.question).trim()) || "";

    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Question ID is required" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Email is required to verify ownership" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    if (!questionText || questionText.length < 5) {
      return new Response(
        JSON.stringify({ success: false, error: "Question must be at least 5 characters long." }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // Check ownership
    const existing = await env.DB.prepare(
      "SELECT id, email FROM career_club_questions WHERE id = ? LIMIT 1"
    ).bind(id).first();

    if (!existing) {
      return new Response(
        JSON.stringify({ success: false, error: "Question not found" }),
        { status: 404, headers: JSON_HEADERS }
      );
    }

    if (existing.email.trim().toLowerCase() !== email) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: You can only edit your own questions." }),
        { status: 403, headers: JSON_HEADERS }
      );
    }

    await env.DB.prepare(
      "UPDATE career_club_questions SET question = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(questionText, id).run();

    return new Response(
      JSON.stringify({
        success: true,
        question: {
          id,
          question: questionText,
          updatedAt: new Date().toISOString(),
          isOwner: true,
        },
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err) {
    console.error("career-club-qna PUT error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to update question" }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}

// DELETE: Delete a question (owner only)
export async function onRequestDelete(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: "Database not configured" }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    await ensureTableExists(env.DB);

    const body = await request.json().catch(() => ({}));
    const id = body.id;
    const email = (body.email && String(body.email).trim().toLowerCase()) || "";

    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Question ID is required" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Email is required to verify ownership" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // Check ownership
    const existing = await env.DB.prepare(
      "SELECT id, email FROM career_club_questions WHERE id = ? LIMIT 1"
    ).bind(id).first();

    if (!existing) {
      return new Response(
        JSON.stringify({ success: false, error: "Question not found" }),
        { status: 404, headers: JSON_HEADERS }
      );
    }

    if (existing.email.trim().toLowerCase() !== email) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: You can only delete your own questions." }),
        { status: 403, headers: JSON_HEADERS }
      );
    }

    await env.DB.prepare(
      "DELETE FROM career_club_questions WHERE id = ?"
    ).bind(id).run();

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err) {
    console.error("career-club-qna DELETE error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to delete question" }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}
