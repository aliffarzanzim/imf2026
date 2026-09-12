// quiz-worker/src/room.js
import { DurableObject } from "cloudflare:workers";
import { QUIZ_QUESTIONS } from "./questions.js";

const QUESTION_DURATION_SEC = 60;
const REVEAL_DURATION_SEC = 6;
const LEADERBOARD_DURATION_SEC = 5;
// HOST_PIN is read from env secret (set via: npx wrangler secret put HOST_PIN)
// Falls back to "2026" only if the secret is not configured
const DEFAULT_HOST_PIN = "2026";

export class QuizRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;

    // Initialize DO embedded SQLite database for permanent persistence
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS player_scores (
        player_id TEXT PRIMARY KEY,
        player_name TEXT,
        reg_number TEXT,
        total_score INTEGER,
        streak INTEGER
      );
      CREATE TABLE IF NOT EXISTS question_answers (
        question_idx INTEGER,
        player_id TEXT,
        option_key TEXT,
        is_correct INTEGER,
        points INTEGER,
        elapsed_ms INTEGER,
        PRIMARY KEY (question_idx, player_id)
      );
      -- Answer audit trail.  Scores alone cannot be used to reconstruct how
      -- many questions were answered correctly after a DO hibernates/restarts.
      CREATE TABLE IF NOT EXISTS session_question_answers (
        session_id TEXT NOT NULL,
        question_idx INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        email TEXT DEFAULT '',
        reg_number TEXT DEFAULT '',
        option_key TEXT,
        is_correct INTEGER NOT NULL,
        points INTEGER DEFAULT 0,
        elapsed_ms INTEGER DEFAULT 0,
        PRIMARY KEY (session_id, question_idx, player_id)
      );
    `);

    // In-Memory Live Game State (0ms latency, high-concurrency)
    this.gameState = "LOBBY"; // LOBBY, QUESTION, ANSWER_REVEAL, LEADERBOARD, PODIUM
    this.currentQuestionIdx = 0;
    this.questionStartTime = 0;
    this.quizPacingMode = "auto"; // "auto" or "manual"
    this.players = new Map(); // socketId -> playerObj
    this.activeTimer = null;
    this.timerSeq = 0;
    this.pendingToken = null;
    this.pendingAction = null;
    this.pendingDueTime = 0;
    this.isPaused = false;
    this.pausedRemainingMs = 0;
    this.savedPendingAction = null;

    // Tab-violation blocks: email.toLowerCase() -> { blockedUntil: timestamp, strikes: number }
    // In-memory only — intentionally resets if the DO restarts (sufficient for a single quiz event)
    this.tabViolations = new Map();

    // Throttle: last time LIVE_ANSWER_COUNT was sent to host (prevents 1000-msg burst)
    this._liveCountLastSent = 0;

    // Final standings are immutable. Keep one in-memory copy while this DO is
    // awake so ending a 1,000-player quiz does not rebuild the same ranking
    // once for every connected WebSocket.
    this.finalLeaderboard = null;
    this.finalResultsByPlayerId = new Map();

    // JOIN/LEAVE events can arrive in a large burst when the arena opens.
    // Coalesce those updates so one thousand joins produce a few lobby
    // broadcasts, rather than one roster rebuild and fan-out per join.
    this.lobbyStatusTimer = null;
    this.lobbyStatusQueued = false;

    // Initialize Sessions & Active Lobby
    this.sessions = [];
    this.activeSession = null;
    this.initSessions();

    // Persistent Live Game State table
    try {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS live_state (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);
      this.restoreLiveState();
      this.hydratePersistedAnswersForActiveSession();
    } catch (e) {
      console.error("Failed to init live_state:", e);
    }
  }

  initSessions() {
    try {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 0,
          is_completed INTEGER NOT NULL DEFAULT 0,
          completed_at INTEGER,
          created_at INTEGER NOT NULL
        );
      `);

      try {
        this.ctx.storage.sql.exec("ALTER TABLE sessions ADD COLUMN is_completed INTEGER NOT NULL DEFAULT 0");
      } catch (e) {}
      try {
        this.ctx.storage.sql.exec("ALTER TABLE sessions ADD COLUMN completed_at INTEGER");
      } catch (e) {}
      // Older deployed versions created player_scores before sessions existed,
      // so that table did not have session_id. Final-score reads/writes are
      // session-scoped; without this migration they fail silently and players
      // appear with zero after the live in-memory state is gone.
      try {
        this.ctx.storage.sql.exec("ALTER TABLE player_scores ADD COLUMN session_id TEXT");
      } catch (e) {}
      try {
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS player_scores (
            session_id TEXT,
            player_id TEXT,
            player_name TEXT,
            reg_number TEXT,
            total_score INTEGER,
            streak INTEGER,
            final_rank INTEGER,
            PRIMARY KEY (session_id, player_id)
          );
        `);
      } catch (e) {}

      try {
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS lobby_players (
            session_id TEXT,
            player_id TEXT,
            name TEXT,
            reg_number TEXT,
            score INTEGER DEFAULT 0,
            streak INTEGER DEFAULT 0,
            connected INTEGER DEFAULT 1,
            last_seen INTEGER,
            PRIMARY KEY (session_id, player_id)
          );
        `);
      } catch (e) {}

      try {
        this.ctx.storage.sql.exec("ALTER TABLE lobby_players ADD COLUMN email TEXT");
      } catch (e) {}
      try {
        this.ctx.storage.sql.exec("ALTER TABLE player_scores ADD COLUMN email TEXT");
      } catch (e) {}
      try {
        this.ctx.storage.sql.exec("ALTER TABLE player_scores ADD COLUMN institution TEXT");
      } catch (e) {}
      try {
        this.ctx.storage.sql.exec("ALTER TABLE player_scores ADD COLUMN academic_year TEXT");
      } catch (e) {}
      try {
        this.ctx.storage.sql.exec("ALTER TABLE player_scores ADD COLUMN correct_answers INTEGER DEFAULT 0");
      } catch (e) {}
      try {
        this.ctx.storage.sql.exec("ALTER TABLE lobby_players ADD COLUMN institution TEXT");
      } catch (e) {}
      try {
        this.ctx.storage.sql.exec("ALTER TABLE lobby_players ADD COLUMN academic_year TEXT");
      } catch (e) {}

      // A participant identity belongs to the session and is based on the
      // verified email/registration details, never a browser-generated ID.
      // This keeps answer history intact when somebody changes device.
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS session_participants (
          session_id TEXT NOT NULL,
          participant_id TEXT NOT NULL,
          email TEXT DEFAULT '',
          reg_number TEXT DEFAULT '',
          created_at INTEGER NOT NULL,
          PRIMARY KEY (session_id, participant_id)
        );
        CREATE INDEX IF NOT EXISTS idx_lobby_players_session_email ON lobby_players(session_id, email);
        CREATE INDEX IF NOT EXISTS idx_lobby_players_session_reg ON lobby_players(session_id, reg_number);
        CREATE INDEX IF NOT EXISTS idx_player_scores_session_email ON player_scores(session_id, email);
        CREATE INDEX IF NOT EXISTS idx_player_scores_session_reg ON player_scores(session_id, reg_number);
        CREATE INDEX IF NOT EXISTS idx_answers_session_player ON session_question_answers(session_id, player_id);
        CREATE INDEX IF NOT EXISTS idx_answers_session_email ON session_question_answers(session_id, email);
        CREATE INDEX IF NOT EXISTS idx_answers_session_reg ON session_question_answers(session_id, reg_number);
        CREATE INDEX IF NOT EXISTS idx_participants_session_email ON session_participants(session_id, email);
        CREATE INDEX IF NOT EXISTS idx_participants_session_reg ON session_participants(session_id, reg_number);
      `);

      // Clean up any default dummy sessions that may have been created earlier
      try {
        this.ctx.storage.sql.exec("DELETE FROM sessions WHERE name = 'IMF 2026 Clinical Grand Arena'");
      } catch (e) {}

      const rows = [...this.ctx.storage.sql.exec("SELECT id, name, is_active, is_completed, completed_at, created_at FROM sessions ORDER BY created_at DESC")];
      this.sessions = rows.map((r) => ({
        id: r.id,
        name: r.name,
        isActive: Boolean(r.is_active),
        isCompleted: Boolean(r.is_completed),
        completedAt: r.completed_at || null,
        createdAt: r.created_at,
      }));
      this.activeSession = this.sessions.find((s) => s.isActive) || null;

      // If active session was already completed, restore its permanent state and player scores
      if (this.activeSession && this.activeSession.isCompleted) {
        this.gameState = "PODIUM";
        this.restoreCompletedSessionScores(this.activeSession.id);
      } else if (this.activeSession) {
        this.loadLobbyPlayers(this.activeSession.id);
      }
    } catch (e) {
      console.error("Failed to initialize sessions table:", e);
      this.sessions = [];
      this.activeSession = null;
    }
  }

  loadLobbyPlayers(sessionId) {
    if (!sessionId) return;
    try {
      const rows = [
        ...this.ctx.storage.sql.exec(
          "SELECT player_id, name, reg_number, email, score, streak, connected, last_seen, institution, academic_year FROM lobby_players WHERE session_id = ?",
          sessionId
        ),
      ];
      const activeSockets = this.ctx.getWebSockets();
      for (const r of rows) {
        const hasSocket = activeSockets.some((s) => {
          const m = s.deserializeAttachment();
          return m && (m.playerId === r.player_id || m.id === r.player_id);
        });

        if (!this.players.has(r.player_id)) {
          this.players.set(r.player_id, {
            id: r.player_id,
            sessionId,
            name: r.name,
            regNumber: r.reg_number || "",
            email: r.email || "",
            institution: r.institution || "",
            academicYear: r.academic_year || "",
            college: r.institution || "",
            year: r.academic_year || "",
            score: r.score || 0,
            streak: r.streak || 0,
            lastPoints: 0,
            answers: {},
            connected: hasSocket,
            lastSeen: r.last_seen || Date.now(),
          });
        } else {
          const p = this.players.get(r.player_id);
          p.sessionId = sessionId;
          p.connected = hasSocket;
          if (r.email && !p.email) p.email = r.email;
          if (r.institution && !p.institution) p.institution = r.institution;
          if (r.academic_year && !p.academicYear) p.academicYear = r.academic_year;
        }
      }
    } catch (e) {
      console.error("Failed to load lobby players:", e);
    }
  }

  // Returns all participants who joined or took part in this session (even if currently disconnected)
  getActiveParticipants() {
    if (this.activeSession) {
      const sessId = this.activeSession.id;
      // Load any players in SQLite lobby_players for this session and deduplicate
      try {
        const rows = [
          ...this.ctx.storage.sql.exec(
            "SELECT player_id, name, reg_number, email, score, streak, connected, last_seen, institution, academic_year FROM lobby_players WHERE session_id = ?",
            sessId
          ),
        ];

        // Deduplicate rows by normalized reg_number and/or email: keep highest score
        const uniqueMap = new Map();
        const duplicateIdsToDelete = [];

        for (const r of rows) {
          const normReg = (r.reg_number || "").replace(/[\[\]]/g, "").trim().toUpperCase();
          const normEmail = (r.email || "").trim().toLowerCase();
          const dedupKey = normReg || normEmail || r.player_id;

          if (uniqueMap.has(dedupKey)) {
            const existing = uniqueMap.get(dedupKey);
            if ((r.score || 0) > (existing.score || 0)) {
              duplicateIdsToDelete.push(existing.player_id);
              uniqueMap.set(dedupKey, r);
            } else {
              duplicateIdsToDelete.push(r.player_id);
            }
          } else {
            uniqueMap.set(dedupKey, r);
          }
        }

        // Delete duplicate ghost IDs from SQLite ONLY if session is still in lobby/active (never when completed)
        if (!this.activeSession.isCompleted && this.gameState !== "PODIUM") {
          for (const dupId of duplicateIdsToDelete) {
            try {
              this.ctx.storage.sql.exec(
                "DELETE FROM lobby_players WHERE session_id = ? AND player_id = ?",
                sessId,
                dupId
              );
              this.players.delete(dupId);
            } catch (e) {}
          }
        }

        // Populate this.players from deduped rows
        for (const r of uniqueMap.values()) {
          if (!this.players.has(r.player_id)) {
            this.players.set(r.player_id, {
              id: r.player_id,
              sessionId: sessId,
              name: r.name,
              regNumber: r.reg_number || "",
              email: r.email || "",
              institution: r.institution || "",
              academicYear: r.academic_year || "",
              college: r.institution || "",
              year: r.academic_year || "",
              score: r.score || 0,
              streak: r.streak || 0,
              lastPoints: 0,
              answers: {},
              connected: false,
              lastSeen: r.last_seen || Date.now(),
            });
          } else {
            const p = this.players.get(r.player_id);
            p.sessionId = sessId;
            if ((p.score === 0 || !p.score) && r.score > 0) {
              p.score = r.score;
            }
            if (!p.streak && r.streak) {
              p.streak = r.streak;
            }
          }
        }
      } catch (e) {}

      // Filter this.players for activeSession and deduplicate in-memory as well
      const list = Array.from(this.players.values()).filter((p) => p.sessionId === sessId);
      const dedupedList = [];
      const seen = new Set();
      for (const p of list) {
        const normReg = (p.regNumber || "").replace(/[\[\]]/g, "").trim().toUpperCase();
        const normEmail = (p.email || "").trim().toLowerCase();
        const key = normReg || normEmail || p.id;
        if (!seen.has(key)) {
          seen.add(key);
          dedupedList.push(p);
        }
      }
      if (dedupedList.length > 0) return dedupedList;
    }
    // Fallback: deduplicate in-memory players by email/reg (standby queue / no active session)
    const all = Array.from(this.players.values());
    const fallbackDeduped = [];
    const fallbackSeen = new Set();
    for (const p of all) {
      const normReg = (p.regNumber || "").replace(/[\[\]]/g, "").trim().toUpperCase();
      const normEmail = (p.email || "").trim().toLowerCase();
      const key = normEmail || normReg || p.id;
      if (!fallbackSeen.has(key)) {
        fallbackSeen.add(key);
        fallbackDeduped.push(p);
      }
    }
    return fallbackDeduped;
  }

  getStableParticipantId(sessionId, browserPlayerId, email, regNumber) {
    if (!sessionId) return browserPlayerId;
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanReg = (regNumber || "").replace(/[\[\]]/g, "").trim().toUpperCase();
    if (!cleanEmail && !cleanReg) return browserPlayerId;

    try {
      const row = [...this.ctx.storage.sql.exec(
        `SELECT participant_id FROM session_participants
          WHERE session_id = ?
            AND ((email != '' AND email = ?) OR (reg_number != '' AND reg_number = ?))
          LIMIT 1`,
        sessionId,
        cleanEmail,
        cleanReg
      )][0];
      if (row?.participant_id) return row.participant_id;

      const participantId = "participant_" + crypto.randomUUID();
      this.ctx.storage.sql.exec(
        `INSERT INTO session_participants (session_id, participant_id, email, reg_number, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        sessionId,
        participantId,
        cleanEmail,
        cleanReg,
        Date.now()
      );
      return participantId;
    } catch (e) {
      console.error("Failed to resolve stable participant identity:", e);
      return browserPlayerId;
    }
  }

  migrateLiveParticipantId(sessionId, oldPlayerId, newPlayerId) {
    if (!sessionId || !oldPlayerId || !newPlayerId || oldPlayerId === newPlayerId) return;
    try {
      // If both IDs somehow answered the same question, retain the stable-ID
      // row and move every non-conflicting audit row to the stable identity.
      this.ctx.storage.sql.exec(
        `DELETE FROM session_question_answers
          WHERE session_id = ? AND player_id = ?
            AND question_idx IN (
              SELECT question_idx FROM session_question_answers
               WHERE session_id = ? AND player_id = ?
            )`,
        sessionId,
        oldPlayerId,
        sessionId,
        newPlayerId
      );
      this.ctx.storage.sql.exec(
        "UPDATE session_question_answers SET player_id = ? WHERE session_id = ? AND player_id = ?",
        newPlayerId,
        sessionId,
        oldPlayerId
      );
    } catch (e) {
      console.error("Failed to migrate participant answer identity:", e);
    }
  }

  queueLobbyStatus() {
    if (this.gameState !== "LOBBY") return;
    if (this.lobbyStatusQueued) return;
    this.lobbyStatusQueued = true;
    this.lobbyStatusTimer = setTimeout(() => {
      this.lobbyStatusTimer = null;
      this.lobbyStatusQueued = false;
      this.broadcastLobbyStatus();
    }, 350);
  }

  syncConnectedPlayersToSession(sessionId) {
    if (!sessionId) return;
    const activeSockets = this.ctx.getWebSockets();
    for (const ws of activeSockets) {
      const meta = ws.deserializeAttachment();
      if (meta && meta.role === "player" && meta.playerId) {
        if (!this.players.has(meta.playerId)) {
          // Brand-new socket not yet in memory — create fresh entry with score=0 for new session
          this.players.set(meta.playerId, {
            id: meta.playerId,
            socketId: meta.id,
            name: meta.name || "Dr. Delegate",
            regNumber: meta.regNumber || "",
            email: meta.email || "",
            institution: meta.institution || "",
            academicYear: meta.academicYear || "",
            college: meta.institution || "",
            year: meta.academicYear || "",
            score: 0,
            streak: 0,
            lastPoints: 0,
            answers: {},
            connected: true,
            lastSeen: Date.now(),
          });
        } else {
          // Player already in memory from previous session — reset their score/answers
          // for the NEW session (they'll re-JOIN and start fresh)
          const p = this.players.get(meta.playerId);
          p.score = 0;
          p.streak = 0;
          p.lastPoints = 0;
          p.answers = {};
          p.connected = true;
          p.lastSeen = Date.now();
          p.sessionId = sessionId;
          if (meta.institution && !p.institution) p.institution = meta.institution;
          if (meta.academicYear && !p.academicYear) p.academicYear = meta.academicYear;
        }
        const p = this.players.get(meta.playerId);
        p.connected = true;
        p.lastSeen = Date.now();
        this.savePlayerToDb(sessionId, p);
      }
    }
  }

  savePlayerToDb(sessionId, player) {
    if (!sessionId || !player) return;
    // CRITICAL IMMUTABILITY: If session is completed or in PODIUM, SQLite is 100% READ-ONLY! Never touch!
    if (this.activeSession && this.activeSession.id === sessionId && (this.activeSession.isCompleted || this.gameState === "PODIUM")) {
      return;
    }
    const sess = (this.sessions || []).find((s) => s.id === sessionId);
    if (sess && sess.isCompleted) return;

    try {
      const cleanEmail = (player.email || "").trim().toLowerCase();
      const cleanReg = (player.regNumber || "").replace(/[\[\]]/g, "").trim().toUpperCase();

      // Preserve the highest score across a reconnect, but never merge streaks
      // by maximum. A streak is the *current consecutive* run, so a wrong or
      // missed answer must be allowed to persist as zero.
      let effectiveScore = player.score || 0;
      let effectiveStreak = player.streak || 0;
      try {
        const existingRows = [
          ...this.ctx.storage.sql.exec(
            "SELECT score, streak FROM lobby_players WHERE session_id = ? AND (player_id = ? OR (email != '' AND LOWER(email) = ?) OR (reg_number != '' AND UPPER(reg_number) = ?)) ORDER BY score DESC LIMIT 1",
            sessionId,
            player.id,
            cleanEmail,
            cleanReg
          ),
        ];
        if (existingRows.length > 0) {
          const dbScore = existingRows[0].score || 0;
          if (dbScore > effectiveScore) {
            effectiveScore = dbScore;
            player.score = dbScore;
          }
        }
      } catch (e) {}

      // Delete any duplicate ghost rows with different player_id for this same doctor
      if (cleanEmail || cleanReg) {
        try {
          this.ctx.storage.sql.exec(
            "DELETE FROM lobby_players WHERE session_id = ? AND player_id != ? AND ((email != '' AND LOWER(email) = ?) OR (reg_number != '' AND UPPER(reg_number) = ?))",
            sessionId,
            player.id,
            cleanEmail,
            cleanReg
          );
        } catch (e) {}
      }

      this.ctx.storage.sql.exec(
        `INSERT OR REPLACE INTO lobby_players (session_id, player_id, name, reg_number, email, score, streak, connected, last_seen, institution, academic_year)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        sessionId,
        player.id,
        player.name,
        player.regNumber || "",
        cleanEmail,
        effectiveScore,
        effectiveStreak,
        player.connected ? 1 : 0,
        player.lastSeen || Date.now(),
        player.institution || player.college || "",
        player.academicYear || player.year || ""
      );
    } catch (e) {
      console.error("Error in savePlayerToDb:", e);
    }
  }

  // Store revealed answers separately from the live player object. The player
  // object is intentionally ephemeral and is rebuilt from lobby_players after
  // a Durable Object restart, whereas these rows are the permanent answer log.
  persistQuestionAnswers(sessionId, questionIndex) {
    if (!sessionId || questionIndex === undefined || questionIndex === null) return;

    try {
      for (const player of this.players.values()) {
        const answer = player.answers && player.answers[questionIndex];
        if (!answer || answer.persisted) continue;

        this.ctx.storage.sql.exec(
          `INSERT OR IGNORE INTO session_question_answers
             (session_id, question_idx, player_id, email, reg_number, option_key, is_correct, points, elapsed_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          sessionId,
          questionIndex,
          player.id,
          (player.email || "").trim().toLowerCase(),
          player.regNumber || "",
          answer.optionKey || "",
          answer.isCorrect ? 1 : 0,
          answer.points || 0,
          answer.elapsedMs || 0
        );
        answer.persisted = true;
      }
    } catch (e) {
      console.error("Failed to persist revealed answers:", e);
    }
  }

  // A submitted answer is the source of truth. Save the compact answer row
  // and the live score snapshot before acknowledging it to the browser. This
  // makes a Worker restart during a question recoverable without waiting for
  // the reveal screen.
  persistSubmittedAnswer(sessionId, player, questionIndex) {
    if (!sessionId || !player || !player.answers?.[questionIndex]) return;
    const answer = player.answers[questionIndex];
    const cleanEmail = (player.email || "").trim().toLowerCase();

    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO session_question_answers
         (session_id, question_idx, player_id, email, reg_number, option_key, is_correct, points, elapsed_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      sessionId,
      questionIndex,
      player.id,
      cleanEmail,
      player.regNumber || "",
      answer.optionKey || "",
      answer.isCorrect ? 1 : 0,
      answer.points || 0,
      answer.elapsedMs || 0
    );
    answer.persisted = true;

    this.ctx.storage.sql.exec(
      `INSERT INTO lobby_players
         (session_id, player_id, name, reg_number, email, score, streak, connected, last_seen, institution, academic_year)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, player_id) DO UPDATE SET
         name = excluded.name,
         reg_number = excluded.reg_number,
         email = excluded.email,
         score = excluded.score,
         streak = excluded.streak,
         connected = excluded.connected,
         last_seen = excluded.last_seen,
         institution = excluded.institution,
         academic_year = excluded.academic_year`,
      sessionId,
      player.id,
      player.name,
      player.regNumber || "",
      cleanEmail,
      player.score || 0,
      player.streak || 0,
      player.connected ? 1 : 0,
      player.lastSeen || Date.now(),
      player.institution || player.college || "",
      player.academicYear || player.year || ""
    );
  }

  // Rebuild answer selections after a cold start. The lobby snapshot restores
  // score/streak and this audit trail restores "already answered" state,
  // answer distribution, correct count, and best streak.
  hydratePersistedAnswersForActiveSession() {
    if (!this.activeSession || !this.players.size) return;
    try {
      const rows = [...this.ctx.storage.sql.exec(
        `SELECT question_idx, player_id, option_key, is_correct, points, elapsed_ms
           FROM session_question_answers WHERE session_id = ?`,
        this.activeSession.id
      )];
      const byPlayer = new Map();
      for (const row of rows) {
        if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, []);
        byPlayer.get(row.player_id).push(row);
      }
      for (const player of this.players.values()) {
        const answers = byPlayer.get(player.id) || [];
        if (!answers.length) continue;
        player.answers = player.answers || {};
        let correctAnswers = 0;
        let currentStreak = 0;
        let bestStreak = 0;
        let previousQuestion = -1;
        for (const row of answers.sort((a, b) => a.question_idx - b.question_idx)) {
          const isCorrect = Boolean(row.is_correct);
          player.answers[row.question_idx] = {
            optionKey: row.option_key || "",
            isCorrect,
            points: row.points || 0,
            elapsedMs: row.elapsed_ms || 0,
            streakBonus: 0,
            persisted: true,
          };
          if (previousQuestion !== -1 && row.question_idx !== previousQuestion + 1) currentStreak = 0;
          if (isCorrect) {
            correctAnswers++;
            currentStreak++;
            bestStreak = Math.max(bestStreak, currentStreak);
          } else {
            currentStreak = 0;
          }
          previousQuestion = row.question_idx;
        }
        player.correctAnswers = Math.max(player.correctAnswers || 0, correctAnswers);
        player.maxStreak = Math.max(player.maxStreak || 0, bestStreak);
        player.bestStreak = Math.max(player.bestStreak || 0, bestStreak);
        player.streak = currentStreak;
      }
    } catch (e) {
      console.error("Failed to restore persisted quiz answers:", e);
    }
  }

  getPersistedAnswerStats(sessionId, player) {
    if (!sessionId || !player) return { correctAnswers: 0, bestStreak: 0 };
    try {
      const email = (player.email || "").trim().toLowerCase();
      const regNumber = (player.regNumber || "").replace(/[\[\]]/g, "").trim().toUpperCase();
      const rows = [...this.ctx.storage.sql.exec(
        `SELECT question_idx, MAX(is_correct) AS is_correct
           FROM session_question_answers
          WHERE session_id = ?
            AND (player_id = ?
              OR (? != '' AND LOWER(email) = ?)
              OR (? != '' AND UPPER(reg_number) = ?))
          GROUP BY question_idx
          ORDER BY question_idx ASC`,
        sessionId,
        player.id,
        email,
        email,
        regNumber,
        regNumber
      )];

      let correctAnswers = 0;
      let bestStreak = 0;
      let currentStreak = 0;
      let previousQuestion = -1;
      for (const row of rows) {
        // A skipped question is a broken consecutive streak, even though it
        // has no answer-log row for this participant.
        if (previousQuestion !== -1 && row.question_idx !== previousQuestion + 1) {
          currentStreak = 0;
        }
        if (row.is_correct) {
          correctAnswers++;
          currentStreak++;
          bestStreak = Math.max(bestStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
        previousQuestion = row.question_idx;
      }
      return { correctAnswers, bestStreak };
    } catch (e) {
      console.error("Failed to read persisted answer statistics:", e);
      return { correctAnswers: 0, bestStreak: 0 };
    }
  }

  getPersistedCorrectCount(sessionId, player) {
    return this.getPersistedAnswerStats(sessionId, player).correctAnswers;
  }

  // A browser/device has its own playerId. Always look up the durable identity
  // record as well, because a transient in-memory entry can exist with score 0
  // after reconnecting or waking the Durable Object.
  getStoredPlayerState(sessionId, playerId, email, regNumber) {
    if (!sessionId) return null;
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanReg = (regNumber || "").replace(/[\[\]]/g, "").trim().toUpperCase();
    const matchSql = "(player_id = ? OR (? != '' AND LOWER(email) = ?) OR (? != '' AND UPPER(reg_number) = ?))";
    const args = [sessionId, playerId, cleanEmail, cleanEmail, cleanReg, cleanReg];
    let lobbyRow = null;
    let finalRow = null;
    try {
      lobbyRow = [...this.ctx.storage.sql.exec(
        `SELECT score, streak FROM lobby_players WHERE session_id = ? AND ${matchSql} ORDER BY score DESC LIMIT 1`,
        ...args
      )][0] || null;
    } catch (e) {}
    try {
      finalRow = [...this.ctx.storage.sql.exec(
        `SELECT total_score, streak, final_rank, correct_answers FROM player_scores WHERE session_id = ? AND ${matchSql} ORDER BY total_score DESC LIMIT 1`,
        ...args
      )][0] || null;
    } catch (e) {}

    if (!lobbyRow && !finalRow) return null;
    return {
      score: Math.max(lobbyRow?.score || 0, finalRow?.total_score || 0),
      streak: finalRow?.streak ?? lobbyRow?.streak ?? 0,
      finalRank: finalRow?.final_rank ?? null,
      correctAnswers: finalRow?.correct_answers ?? 0,
    };
  }

  deletePlayerFromDb(sessionId, playerId) {
    if (!sessionId || !playerId) return;
    // CRITICAL IMMUTABILITY: If session is completed or in PODIUM, SQLite is 100% READ-ONLY! Never touch!
    if (this.activeSession && this.activeSession.id === sessionId && (this.activeSession.isCompleted || this.gameState === "PODIUM")) {
      return;
    }
    const sess = (this.sessions || []).find((s) => s.id === sessionId);
    if (sess && sess.isCompleted) return;

    try {
      this.ctx.storage.sql.exec(
        "DELETE FROM lobby_players WHERE session_id = ? AND player_id = ?",
        sessionId,
        playerId
      );
    } catch (e) {}
  }

  restoreCompletedSessionScores(sessionId) {
    try {
      const rows = [...this.ctx.storage.sql.exec("SELECT * FROM player_scores WHERE session_id = ? ORDER BY final_rank ASC", sessionId)];
      for (const r of rows) {
        this.players.set(r.player_id, {
          id: r.player_id,
          sessionId: sessionId,
          name: r.player_name,
          regNumber: r.reg_number,
          email: r.email || "",
          institution: r.institution || "",
          academicYear: r.academic_year || "",
          college: r.institution || "",
          year: r.academic_year || "",
          score: r.total_score,
          streak: r.streak || 0,
          bestStreak: r.streak || 0,
          maxStreak: r.streak || 0,
          correctAnswers: r.correct_answers || 0,
          finalRank: r.final_rank,
          lastPoints: 0,
          answers: {},
          connected: false,
          lastSeen: Date.now(),
        });
      }
    } catch (e) {
      console.error("Failed to restore completed session scores:", e);
    }
  }

  persistLiveState() {
    try {
      this.ctx.storage.sql.exec(
        `INSERT OR REPLACE INTO live_state (key, value) VALUES
          ('gameState', ?),
          ('currentQuestionIdx', ?),
          ('quizPacingMode', ?),
          ('pendingAction', ?),
          ('pendingDueTime', ?),
          ('questionStartTime', ?),
          ('isPaused', ?),
          ('pausedRemainingMs', ?)`,
        this.gameState || "LOBBY",
        String(this.currentQuestionIdx || 0),
        this.quizPacingMode || "auto",
        this.pendingAction || "",
        String(this.pendingDueTime || 0),
        String(this.questionStartTime || 0),
        this.isPaused ? "1" : "0",
        String(this.pausedRemainingMs || 0)
      );
    } catch (e) {
      console.error("Failed to persist live state:", e);
    }
  }

  restoreLiveState() {
    try {
      const rows = [...this.ctx.storage.sql.exec("SELECT key, value FROM live_state")];
      const map = new Map();
      for (const r of rows) map.set(r.key, r.value);

      if (map.has("gameState") && map.get("gameState")) {
        this.gameState = map.get("gameState");
      }
      if (map.has("currentQuestionIdx")) {
        this.currentQuestionIdx = parseInt(map.get("currentQuestionIdx"), 10) || 0;
      }
      if (map.has("quizPacingMode")) {
        this.quizPacingMode = map.get("quizPacingMode") || "auto";
      }
      if (map.has("questionStartTime")) {
        this.questionStartTime = parseInt(map.get("questionStartTime"), 10) || 0;
      }
      if (map.has("isPaused")) {
        this.isPaused = map.get("isPaused") === "1";
      }
      if (this.gameState === "LOBBY" || this.gameState === "PODIUM") {
        this.isPaused = false;
        this.pausedRemainingMs = 0;
      }
      if (map.has("pausedRemainingMs")) {
        this.pausedRemainingMs = parseInt(map.get("pausedRemainingMs"), 10) || 0;
      }
      if (!this.isPaused && map.has("pendingAction") && map.get("pendingAction")) {
        this.pendingAction = map.get("pendingAction");
        this.pendingDueTime = parseInt(map.get("pendingDueTime"), 10) || 0;
        const remainingMs = this.pendingDueTime - Date.now();
        if (remainingMs > 0) {
          const delaySec = Math.max(0.2, remainingMs / 1000);
          this.scheduleTimer(this.pendingAction, delaySec);
        } else if (this.quizPacingMode === "auto" && this.gameState !== "LOBBY" && this.gameState !== "PODIUM") {
          // Auto transition expired while sleeping/refreshing: trigger immediately
          setTimeout(() => {
            this.executeAction(this.pendingAction);
          }, 100);
        }
      }
    } catch (e) {
      console.error("Failed to restore live state:", e);
    }
  }

  getAllSessions() {
    try {
      const rows = [...this.ctx.storage.sql.exec("SELECT id, name, is_active, is_completed, completed_at, created_at FROM sessions ORDER BY created_at DESC")];
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        isActive: Boolean(r.is_active),
        isCompleted: Boolean(r.is_completed),
        completedAt: r.completed_at || null,
        createdAt: r.created_at,
      }));
    } catch (e) {
      return this.sessions || [];
    }
  }

  createSession(name, activate = false) {
    const id = "session_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
    const sessionName = (name || "").trim() || "IMF 2026 Clinical Quiz Round";
    const now = Date.now();

    if (activate) {
      this.ctx.storage.sql.exec("UPDATE sessions SET is_active = 0");
    }

    this.ctx.storage.sql.exec(
      "INSERT INTO sessions (id, name, is_active, created_at) VALUES (?, ?, ?, ?)",
      id,
      sessionName,
      activate ? 1 : 0,
      now
    );

    this.sessions = this.getAllSessions();
    if (activate) {
      this.activateSession(id);
    } else {
      this.activeSession = this.sessions.find((s) => s.isActive) || null;
      this.broadcastSessionsUpdated();
    }

    return id;
  }

  activateSession(sessionId) {
    this.ctx.storage.sql.exec("UPDATE sessions SET is_active = 0");
    this.ctx.storage.sql.exec("UPDATE sessions SET is_active = 1 WHERE id = ?", sessionId);

    this.sessions = this.getAllSessions();
    this.activeSession = this.sessions.find((s) => s.id === sessionId) || null;

    if (this.activeSession && this.activeSession.isCompleted) {
      this.clearAllTimers();
      this.gameState = "PODIUM";
      this.players.clear();
      this.restoreCompletedSessionScores(sessionId);
      this.persistLiveState();
      this.broadcastSessionsUpdated();
      const lb = this.getLeaderboard();
      this.broadcast({
        type: "QUIZ_FINISHED",
        podium: lb.top10.slice(0, 3),
        fullLeaderboard: lb.fullLeaderboard || lb.top10,
        session: this.activeSession,
        totalPlayers: lb.totalPlayers || this.players.size,
        pacingMode: this.quizPacingMode,
      });

      // Send personalized results to each participant for this completed session
      for (const ws of this.ctx.getWebSockets()) {
        const meta = ws.deserializeAttachment();
        if (meta && meta.role === "player") {
          const res = this.getParticipantFinalResult(meta.playerId, meta.name, meta.regNumber, meta.email);
          ws.send(
            JSON.stringify({
              type: "QUIZ_FINISHED",
              ...res,
              session: this.activeSession,
              pacingMode: this.quizPacingMode,
            })
          );
        }
      }
    } else {
      this.clearAllTimers();
      this.gameState = "LOBBY";
      this.currentQuestionIdx = 0;
      this.questionStartTime = 0;
      this.players.clear();
      this.loadLobbyPlayers(sessionId);
      this.syncConnectedPlayersToSession(sessionId);
      this.resetQuiz();
      this.broadcastLobbyActivated();
      this.broadcastSessionsUpdated();
    }
  }

  inactivateSession(sessionId) {
    if (sessionId) {
      this.ctx.storage.sql.exec("UPDATE sessions SET is_active = 0 WHERE id = ?", sessionId);
    } else {
      this.ctx.storage.sql.exec("UPDATE sessions SET is_active = 0");
    }

    this.sessions = this.getAllSessions();
    this.activeSession = null;
    this.clearAllTimers();
    this.gameState = "LOBBY";
    this.currentQuestionIdx = 0;
    this.questionStartTime = 0;
    // Keep connected players in memory so they remain in standby queue!
    try {
      this.ctx.storage.sql.exec("DELETE FROM live_state");
    } catch (e) {}
    this.persistLiveState();

    this.broadcast({ type: "RESET_TO_LOBBY" });
    this.broadcast({
      type: "LOBBY_INACTIVATED",
      message: "Please wait while Quiz Master activates the lobby...",
    });
    this.broadcastLobbyStatus();
    this.broadcastSessionsUpdated();
  }

  deleteSession(sessionId) {
    const wasActive = this.activeSession && this.activeSession.id === sessionId;

    try {
      this.ctx.storage.sql.exec("DELETE FROM sessions WHERE id = ?", sessionId);
      this.ctx.storage.sql.exec("DELETE FROM lobby_players WHERE session_id = ?", sessionId);
      this.ctx.storage.sql.exec("DELETE FROM player_scores WHERE session_id = ?", sessionId);
      this.ctx.storage.sql.exec("DELETE FROM session_question_answers WHERE session_id = ?", sessionId);
      this.ctx.storage.sql.exec("DELETE FROM session_participants WHERE session_id = ?", sessionId);
    } catch (e) {}

    this.sessions = this.getAllSessions();

    if (wasActive || this.sessions.length === 0 || !this.activeSession) {
      this.activeSession = null;
      this.clearAllTimers();
      this.gameState = "LOBBY";
      this.currentQuestionIdx = 0;
      this.questionStartTime = 0;
      // Keep connected players in memory so they remain in standby queue!
      try {
        this.ctx.storage.sql.exec("DELETE FROM live_state");
        this.ctx.storage.sql.exec("DELETE FROM question_answers");
      } catch (e) {}
      this.persistLiveState();

      this.broadcast({ type: "RESET_TO_LOBBY" });
      this.broadcast({
        type: "LOBBY_INACTIVATED",
        message: "The active session was removed. Please wait while Quiz Master activates a lobby.",
      });
      this.broadcastLobbyStatus();
    }

    this.broadcastSessionsUpdated();
  }

  broadcastLobbyActivated() {
    this.broadcast({
      type: "LOBBY_ACTIVATED",
      session: this.activeSession,
      gameState: this.gameState,
      currentQuestionIdx: this.currentQuestionIdx,
      totalQuestions: QUIZ_QUESTIONS.length,
      pacingMode: this.quizPacingMode,
    });
    this.broadcastLobbyStatus();
  }

  broadcastSessionsUpdated() {
    this.sendToHost({
      type: "SESSIONS_UPDATED",
      sessions: this.sessions,
      activeSession: this.activeSession,
    });
  }

  // HTTP Fetch & WebSocket Upgrade
  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket Handshake
    if (request.headers.get("Upgrade") === "websocket") {
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      // Cloudflare Hibernatable WebSockets API
      this.ctx.acceptWebSocket(server);

      const socketId = crypto.randomUUID().slice(0, 8);
      server.serializeAttachment({ id: socketId, role: "player" });

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // REST /status endpoint
    return Response.json(
      {
        status: "online",
        engine: "Cloudflare Durable Object (SQLite + Hibernation)",
        gameState: this.gameState,
        currentQuestionIdx: this.currentQuestionIdx + 1,
        totalQuestions: QUIZ_QUESTIONS.length,
        pacingMode: this.quizPacingMode,
        activePlayers: this.players.size,
        connectedSockets: this.ctx.getWebSockets().length,
        activeSession: this.activeSession,
        sessionsCount: this.sessions ? this.sessions.length : 0,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  }

  // WebSocket Message Handler (Hibernation API)
  async webSocketMessage(ws, message) {
    // Zero-Day Protection: Prevent DoS via oversized payloads
    if (typeof message === "string" && message.length > 65536) {
      ws.close(1009, "Payload too large");
      return;
    }

    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      return;
    }

    if (!msg || typeof msg.type !== "string") return;

    const meta = ws.deserializeAttachment() || { id: "unknown", role: "player" };
    const socketId = meta.id;

    // Handle Heartbeat Ping (keeps connection active)
    if (msg.type === "PING") {
      meta.lastPing = Date.now();
      ws.serializeAttachment(meta);

      let rosterChanged = false;
      if (meta.role === "player" && meta.playerId) {
        if (!this.players.has(meta.playerId)) {
          this.players.set(meta.playerId, {
            id: meta.playerId,
            socketId: meta.id,
            name: meta.name || "Dr. Delegate",
            regNumber: meta.regNumber || "",
            email: meta.email || "",
            institution: meta.institution || "",
            academicYear: meta.academicYear || "",
            college: meta.institution || "",
            year: meta.academicYear || "",
            score: 0,
            streak: 0,
            lastPoints: 0,
            answers: {},
            connected: true,
            lastSeen: Date.now(),
          });
          if (this.activeSession) {
            this.savePlayerToDb(this.activeSession.id, this.players.get(meta.playerId));
          }
          rosterChanged = true;
        } else {
          const p = this.players.get(meta.playerId);
          if (!p.connected) {
            p.connected = true;
            rosterChanged = true;
          }
          if (meta.institution && !p.institution) p.institution = meta.institution;
          if (meta.academicYear && !p.academicYear) p.academicYear = meta.academicYear;
          p.lastSeen = Date.now();
        }
      }

      try {
        // A heartbeat is only a connection check. Building the full roster
        // here made 1,000 clients trigger 100 database/roster scans per
        // second. Actual JOIN/LEAVE events still broadcast lobby changes.
        ws.send(JSON.stringify({ type: "PONG" }));

        if (rosterChanged && this.gameState === "LOBBY") {
          this.queueLobbyStatus();
        }
      } catch (e) {}
      return;
    }

    // On-demand lobby state refresh (sent by client right after JOINED_SUCCESS)
    if (msg.type === "REQUEST_LOBBY_STATE") {
      const playerList = this.getPlayerList();
      try {
        const isHost = meta.role === "host";
        ws.send(
          JSON.stringify({
            type: "LOBBY_STATE",
            ...(isHost ? { players: playerList } : { recentPlayers: playerList.slice(-25) }),
            totalCount: playerList.length,
            activeSession: this.activeSession,
            hasActiveSession: !!this.activeSession,
          })
        );
      } catch (e) {}
      return;
    }

    // Handle Explicit Tab Close / Leave Page
    if (msg.type === "LEAVE") {
      const pId = meta.playerId || msg.playerId;
      try {
        ws.serializeAttachment({ role: "closed", playerId: null, email: null });
        ws.close(1000, "Normal leave");
      } catch (e) {}
      if (pId && this.players.has(pId)) {
        const p = this.players.get(pId);
        p.connected = false;
        p.lastSeen = Date.now();
        if (this.activeSession) {
          this.savePlayerToDb(this.activeSession.id, p);
        }
        if (this.gameState === "LOBBY") {
          this.queueLobbyStatus();
        }
      }
      return;
    }

    // Handle Force Join / Session Takeover
    if (msg.type === "FORCE_JOIN") {
      const email = (msg.email || "").trim().toLowerCase();
      const regNumber = (msg.regNumber || "").trim().toUpperCase();
      for (const otherWs of this.ctx.getWebSockets()) {
        if (otherWs !== ws) {
          const otherMeta = otherWs.deserializeAttachment();
          if (otherMeta) {
            const sameEmail = email && otherMeta.email && otherMeta.email.toLowerCase() === email;
            const sameReg = regNumber && otherMeta.regNumber && otherMeta.regNumber.toUpperCase() === regNumber;
            if (sameEmail || sameReg) {
              try {
                otherWs.send(
                  JSON.stringify({
                    type: "SESSION_TRANSFERRED",
                    message: "Your quiz session was transferred to another device.",
                  })
                );
                otherWs.close(1000, "Transferred to new device");
              } catch (e) {}
              try {
                otherWs.serializeAttachment({ role: "closed", playerId: null, email: null });
              } catch (e) {}
            }
          }
        }
      }
      msg.type = "JOIN";
    }

    // TAB_VIOLATION — client reports that a player exceeded tab-switch limit
    // Server records a 2-minute block keyed by email so it survives tab refreshes and new tabs
    if (msg.type === "TAB_VIOLATION") {
      const email = (msg.email || (ws.deserializeAttachment()?.email) || "").trim().toLowerCase();
      if (!email) return;

      const existing = this.tabViolations.get(email) || { strikes: 0, blockedUntil: 0 };
      existing.strikes = (existing.strikes || 0) + 1;

      // Block for 2 minutes on first violation report (client already showed 2 warnings before sending this)
      existing.blockedUntil = Date.now() + 2 * 60 * 1000;
      this.tabViolations.set(email, existing);

      // Confirm block to the reporting socket
      const remainingSec = Math.ceil((existing.blockedUntil - Date.now()) / 1000);
      try {
        ws.send(
          JSON.stringify({
            type: "TAB_BLOCKED",
            remainingSec,
            blockedUntil: existing.blockedUntil,
            message: `You switched away from the quiz too many times. You are blocked for ${remainingSec} seconds.`,
          })
        );
      } catch (e) {}
      return;
    }

    // 1. Host Authentication
    if (msg.type === "HOST_LOGIN") {
      const attempts = meta.failedPins || 0;
      if (attempts >= 5) {
        ws.send(JSON.stringify({ type: "HOST_LOGIN_FAILED", error: "Too many failed PIN attempts. Connection locked." }));
        ws.close(1008, "Rate limit exceeded");
        return;
      }

      const HOST_PIN = this.env.HOST_PIN || DEFAULT_HOST_PIN;
      if (msg.pin === HOST_PIN) {
        meta.role = "host";
        meta.failedPins = 0;
        ws.serializeAttachment(meta);

        // If there is NO active session, Host MUST see clean LOBBY state!
        if (!this.activeSession) {
          this.gameState = "LOBBY";
          this.currentQuestionIdx = 0;
          this.clearAllTimers();
          const playerList = this.getPlayerList();
          ws.send(
            JSON.stringify({
              type: "HOST_LOGIN_SUCCESS",
              gameState: "LOBBY",
              currentQuestionIdx: 0,
              totalQuestions: QUIZ_QUESTIONS.length,
              playerCount: playerList.length,
              players: playerList,
              leaderboard: { top10: [], totalPlayers: 0 },
              pacingMode: this.quizPacingMode,
              sessions: this.sessions,
              activeSession: null,
            })
          );
          ws.send(
            JSON.stringify({
              type: "LOBBY_STATE",
              players: playerList,
              totalCount: playerList.length,
              activeSession: null,
              sessions: this.sessions,
              hasActiveSession: false,
            })
          );
          return;
        }

        // Re-load lobby players from SQLite to guarantee all joined players are visible
        if (this.activeSession) {
          this.loadLobbyPlayers(this.activeSession.id);
        }

        const playerList = this.getPlayerList();
        ws.send(
          JSON.stringify({
            type: "HOST_LOGIN_SUCCESS",
            gameState: this.gameState,
            currentQuestionIdx: this.currentQuestionIdx,
            totalQuestions: QUIZ_QUESTIONS.length,
            playerCount: playerList.length,
            players: playerList,
            leaderboard: this.getLeaderboard(),
            pacingMode: this.quizPacingMode,
            sessions: this.sessions,
            activeSession: this.activeSession,
            isPaused: this.isPaused,
            pausedRemainingSec: Math.max(0, Math.ceil(this.pausedRemainingMs / 1000)),
          })
        );

        // Only push LOBBY_STATE if the quiz is genuinely in LOBBY state
        if (this.gameState === "LOBBY") {
          ws.send(
            JSON.stringify({
              type: "LOBBY_STATE",
              players: playerList,
              totalCount: playerList.length,
              activeSession: this.activeSession,
              sessions: this.sessions,
              hasActiveSession: !!this.activeSession,
            })
          );
        }

        // Reconnect sync if Quiz Master reloaded during an active stage
        if (this.gameState === "COUNTDOWN") {
          const remainingSec = this.pendingDueTime ? Math.max(1, Math.round((this.pendingDueTime - Date.now()) / 1000)) : 3;
          ws.send(
            JSON.stringify({
              type: "QUIZ_COUNTDOWN",
              durationSec: remainingSec,
              startsAt: this.pendingDueTime || (Date.now() + remainingSec * 1000),
              serverTime: Date.now(),
              questionIndex: 0,
              totalQuestions: QUIZ_QUESTIONS.length,
              nextQuestion: this.getPublicQuestion(0),
            })
          );
        } else if (this.gameState === "QUESTION") {
          const q = this.getPublicQuestion(this.currentQuestionIdx);
          const remainingSec = this.isPaused
            ? Math.max(1, Math.ceil(this.pausedRemainingMs / 1000))
            : (this.pendingDueTime ? Math.max(1, Math.round((this.pendingDueTime - Date.now()) / 1000)) : QUESTION_DURATION_SEC);
          ws.send(
            JSON.stringify({
              type: "QUESTION_START",
              question: { ...q, durationSec: remainingSec },
              serverTime: Date.now(),
              pacingMode: this.quizPacingMode,
              isPaused: this.isPaused,
            })
          );
          let answerCount = 0;
          for (const p of this.players.values()) {
            if (p.answers && p.answers[this.currentQuestionIdx]) answerCount++;
          }
          ws.send(
            JSON.stringify({
              type: "LIVE_ANSWER_COUNT",
              count: answerCount,
              total: playerList.length,
            })
          );
        } else if (this.gameState === "ANSWER_REVEAL") {
          const q = QUIZ_QUESTIONS[this.currentQuestionIdx];
          const stats = { A: 0, B: 0, C: 0, D: 0 };
          let totalAnswered = 0;
          for (const p of this.players.values()) {
            const ans = p.answers && p.answers[this.currentQuestionIdx];
            if (ans && ans.optionKey && stats[ans.optionKey] !== undefined) {
              stats[ans.optionKey]++;
              totalAnswered++;
            }
          }
          const correctOptionText = q ? (q.options.find((o) => o.key === q.correctAnswer)?.text || "") : "";
          const remainingSec = this.pendingDueTime ? Math.max(0, Math.round((this.pendingDueTime - Date.now()) / 1000)) : 0;
          const nextQIdx = this.currentQuestionIdx + 1;
          const nextQuestion = nextQIdx < QUIZ_QUESTIONS.length ? this.getPublicQuestion(nextQIdx) : null;
          ws.send(
            JSON.stringify({
              type: "HOST_REVEAL",
              questionIndex: this.currentQuestionIdx,
              correctAnswer: q?.correctAnswer,
              correctOption: q?.correctAnswer,
              correctText: correctOptionText,
              explanation: q?.explanation,
              stats,
              distribution: stats,
              totalAnswered,
              pacingMode: this.quizPacingMode,
              autoNextSec: remainingSec,
              nextQuestion,
            })
          );
        } else if (this.gameState === "LEADERBOARD") {
          const lb = this.getLeaderboard();
          const remainingSec = this.pendingDueTime ? Math.max(0, Math.round((this.pendingDueTime - Date.now()) / 1000)) : 0;
          let pStats = {};
          let cluster = lb.top10.slice(0, 5);
          if (meta.role !== "host") {
            const pId = meta.playerId || meta.id;
            const p = this.players.get(pId);
            if (p) {
              const activeList = this.getActiveParticipants();
              const sortedPrev = [...activeList].sort((a, b) => {
                const aAns = a.answers && a.answers[this.currentQuestionIdx];
                const aPts = aAns && aAns.isCorrect ? (aAns.points || 0) : 0;
                const bAns = b.answers && b.answers[this.currentQuestionIdx];
                const bPts = bAns && bAns.isCorrect ? (bAns.points || 0) : 0;
                const diff = ((b.score || 0) - bPts) - ((a.score || 0) - aPts);
                if (diff !== 0) return diff;
                return (a.name || "").localeCompare(b.name || "");
              });
              const prevRankMap = new Map();
              sortedPrev.forEach((x, idx) => prevRankMap.set(x.id, idx + 1));
              const sortedCurrent = [...activeList].sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return (a.name || "").localeCompare(b.name || "");
              });
              const currentRankMap = new Map();
              sortedCurrent.forEach((x, idx) => currentRankMap.set(x.id, idx + 1));

              const lastAns = p.answers && p.answers[this.currentQuestionIdx];
              const pointsAdded = lastAns && lastAns.isCorrect ? (lastAns.points || 0) : 0;
              const prevScore = Math.max(0, (p.score || 0) - pointsAdded);
              pStats = {
                rank: currentRankMap.get(p.id) || 1,
                prevRank: prevRankMap.get(p.id) || 1,
                totalScore: p.score,
                prevScore,
                pointsAdded,
                streak: p.streak,
              };

              cluster = this.getParticipantNeighborhoodCluster(p, sortedPrev, sortedCurrent, prevRankMap, currentRankMap);
            }
          }
          const nextQIdx = this.currentQuestionIdx + 1;
          const nextQuestion = nextQIdx < QUIZ_QUESTIONS.length ? this.getPublicQuestion(nextQIdx) : null;
          ws.send(
            JSON.stringify({
              type: "LEADERBOARD_VIEW",
              top10: lb.top10,
              cluster,
              totalPlayers: lb.totalPlayers,
              pacingMode: this.quizPacingMode,
              autoNextSec: remainingSec,
              nextQuestion,
              nextQuestionStartsAt: this.pendingDueTime || (Date.now() + remainingSec * 1000),
              ...pStats,
            })
          );
        } else if (this.gameState === "PODIUM" || (this.activeSession && this.activeSession.isCompleted)) {
          if (meta && meta.role === "host") {
            const lb = this.getLeaderboard();
            ws.send(
              JSON.stringify({
                type: "QUIZ_FINISHED",
                podium: lb.top10.slice(0, 3),
                fullLeaderboard: lb.fullLeaderboard || lb.top10,
                session: this.activeSession,
                totalPlayers: lb.totalPlayers || this.players.size,
              })
            );
          } else {
            const pId = meta.playerId || meta.id;
            const player = this.players.get(pId);
            const name = player ? player.name : meta.name || "";
            const reg = player ? player.regNumber : meta.regNumber || "";
            const email = player ? player.email : meta.email || "";
            const result = this.getParticipantFinalResult(pId, name, reg, email);
            ws.send(
              JSON.stringify({
                type: "QUIZ_FINISHED",
                ...result,
                session: this.activeSession,
                pacingMode: this.quizPacingMode,
              })
            );
          }
        }
      } else {
        meta.failedPins = attempts + 1;
        ws.serializeAttachment(meta);
        ws.send(JSON.stringify({ type: "HOST_LOGIN_FAILED", error: "Invalid Host PIN" }));
      }
      return;
    }

    // 2. Player Join (tracks uniquely by persistent playerId, supports single active device per email/reg, and seamless transfer if previous device closed)
    if (msg.type === "JOIN") {
      const name = (msg.name || "Dr. Delegate").trim().slice(0, 40);
      const regNumber = (msg.regNumber || "").trim().toUpperCase().slice(0, 15);
      const email = (msg.email || "").trim().toLowerCase().slice(0, 80);
      const institution = (msg.institution || "").trim().slice(0, 100);
      const academicYear = (msg.academicYear || "").trim().slice(0, 50);
      const browserPlayerId = msg.playerId || socketId;
      const playerId = this.getStableParticipantId(
        this.activeSession?.id,
        browserPlayerId,
        email,
        regNumber
      );

      // Enforce single active device per registered email or registration number
      let activeOtherWs = null;
      const now = Date.now();
      for (const otherWs of this.ctx.getWebSockets()) {
        if (otherWs !== ws) {
          const otherMeta = otherWs.deserializeAttachment();
          if (otherMeta && otherMeta.role === "player") {
            const sameEmail = email && otherMeta.email && otherMeta.email.toLowerCase() === email;
            const sameReg = regNumber && otherMeta.regNumber && otherMeta.regNumber.toUpperCase() === regNumber;

            if (sameEmail || sameReg) {
              if (otherMeta.playerId === playerId) {
                // Same device reload/reconnection: cleanly terminate old zombie socket
                try {
                  otherWs.close(1000, "Replaced by reload");
                } catch (e) {}
                try {
                  otherWs.serializeAttachment({ role: "closed", playerId: null, email: null });
                } catch (e) {}
              } else {
                // Check if other socket is genuinely responsive (ping received within last 25 seconds or joined within last 25 seconds)
                const lastHeard = otherMeta.lastPing || otherMeta.joinedAt || 0;
                const isAlive = (now - lastHeard) < 25000;
                if (otherWs.readyState === 1 && isAlive) {
                  activeOtherWs = otherWs;
                  break;
                } else {
                  // Stale / dead socket whose tab was closed: terminate and purge it!
                  try {
                    otherWs.close(1000, "Stale socket purged");
                  } catch (e) {}
                  try {
                    otherWs.serializeAttachment({ role: "closed", playerId: null, email: null });
                  } catch (e) {}
                }
              }
            }
          }
        }
      }

      // Check if player is currently tab-blocked (server-side 2-minute penalty)
      if (email) {
        const violation = this.tabViolations.get(email);
        if (violation && violation.blockedUntil > Date.now()) {
          const remainingSec = Math.ceil((violation.blockedUntil - Date.now()) / 1000);
          ws.send(
            JSON.stringify({
              type: "TAB_BLOCKED",
              remainingSec,
              blockedUntil: violation.blockedUntil,
              message: `You switched away from the quiz too many times. You are blocked for ${remainingSec} more seconds. Please wait and then refresh to continue.`,
            })
          );
          return;
        }
      }

      if (activeOtherWs) {
        ws.send(
          JSON.stringify({
            type: "DEVICE_ALREADY_ACTIVE",
            message: "You are currently active on another device or browser tab with this registered email. Please close that device or tab first to enter here.",
            email,
          })
        );
        return;
      }

      meta.playerId = playerId;
      meta.role = "player";
      meta.email = email;
      meta.regNumber = regNumber;
      meta.name = name;
      meta.institution = institution;
      meta.academicYear = academicYear;
      meta.joinedAt = Date.now();
      meta.lastPing = Date.now();
      ws.serializeAttachment(meta);

      const cleanEmail = (email || "").trim().toLowerCase();
      const cleanReg = (regNumber || "").replace(/[\[\]]/g, "").trim().toUpperCase();

      let player = this.players.get(playerId);

      // 1. Search in-memory players by email or regNumber
      if (!player && (cleanEmail || cleanReg)) {
        for (const existing of this.players.values()) {
          const matchEmail = cleanEmail && existing.email && existing.email.toLowerCase() === cleanEmail;
          const matchReg = cleanReg && existing.regNumber && existing.regNumber.replace(/[\[\]]/g, "").trim().toUpperCase() === cleanReg;
          if (matchEmail || matchReg) {
            player = existing;
            const oldId = existing.id;
            this.players.delete(oldId);
            if (this.activeSession && !this.activeSession.isCompleted && this.gameState !== "PODIUM") {
              this.migrateLiveParticipantId(this.activeSession.id, oldId, playerId);
              this.deletePlayerFromDb(this.activeSession.id, oldId);
            }
            break;
          }
        }
      }

      // 2. Search SQLite player_scores & lobby_players by email or regNumber
      if (!player && this.activeSession && (cleanEmail || cleanReg)) {
        let restoredScore = 0;
        let restoredStreak = 0;
        let restoredBestStreak = 0;
        let restoredRank = null;
        let restoredCorrect = 0;

        // Check player_scores first (the immutable final truth)
        try {
          const pRows = [
            ...this.ctx.storage.sql.exec(
              "SELECT * FROM player_scores WHERE session_id = ? AND ((email != '' AND LOWER(email) = ?) OR (reg_number != '' AND UPPER(reg_number) = ?) OR player_id = ?) ORDER BY total_score DESC LIMIT 1",
              this.activeSession.id,
              cleanEmail,
              cleanReg,
              playerId
            ),
          ];
          if (pRows.length > 0) {
            const row = pRows[0];
            restoredScore = row.total_score || 0;
            restoredStreak = row.streak || 0;
            restoredBestStreak = row.streak || 0;
            restoredRank = row.final_rank;
            restoredCorrect = row.correct_answers || 0;
          }
        } catch (e) {}

        // Check lobby_players if not yet found and session is NOT completed
        if (restoredScore === 0 && restoredRank === null && !this.activeSession.isCompleted && this.gameState !== "PODIUM") {
          try {
            const lRows = [
              ...this.ctx.storage.sql.exec(
                "SELECT * FROM lobby_players WHERE session_id = ? AND ((email != '' AND LOWER(email) = ?) OR (reg_number != '' AND UPPER(reg_number) = ?) OR player_id = ?) ORDER BY score DESC LIMIT 1",
                this.activeSession.id,
                cleanEmail,
                cleanReg,
                playerId
              ),
            ];
            if (lRows.length > 0) {
              const row = lRows[0];
              restoredScore = row.score || 0;
              restoredStreak = row.streak || 0;
              restoredBestStreak = row.streak || 0;
            }
          } catch (e) {}
        }

        if (restoredScore > 0 || restoredRank !== null) {
          player = {
            id: playerId,
            socketId,
            name: name || "Dr. Delegate",
            regNumber,
            email: cleanEmail,
            institution,
            academicYear,
            college: institution,
            year: academicYear,
            score: restoredScore,
            streak: restoredStreak,
            bestStreak: restoredBestStreak,
            maxStreak: restoredBestStreak,
            finalRank: restoredRank,
            correctAnswers: restoredCorrect,
            lastPoints: 0,
            answers: {},
            connected: true,
            lastSeen: Date.now(),
          };
        }
      }

      const isReconnected = !!player;

      if (player) {
        player.id = playerId;
        player.socketId = socketId;
        if (name) player.name = name;
        if (regNumber) player.regNumber = regNumber;
        if (cleanEmail) player.email = cleanEmail;
        if (institution) player.institution = institution;
        if (academicYear) player.academicYear = academicYear;
        player.connected = true;
        player.lastSeen = Date.now();
      } else {
        player = {
          id: playerId,
          socketId,
          name,
          regNumber,
          email: cleanEmail,
          institution,
          academicYear,
          college: institution,
          year: academicYear,
          score: 0,
          streak: 0,
          lastPoints: 0,
          answers: {},
          connected: true,
          lastSeen: Date.now(),
        };
      }

      // Never let a new browser's zero-value player object win over an
      // existing session record. This also covers a DO wake-up where the
      // in-memory map was rebuilt before the participant re-joined.
      if (this.activeSession) {
        const storedState = this.getStoredPlayerState(
          this.activeSession.id,
          playerId,
          cleanEmail,
          cleanReg
        );
        if (storedState) {
          player.score = Math.max(player.score || 0, storedState.score || 0);
          if (storedState.finalRank !== null) {
            player.streak = storedState.streak || 0;
            player.bestStreak = storedState.streak || 0;
            player.maxStreak = storedState.streak || 0;
            player.finalRank = storedState.finalRank;
            player.correctAnswers = Math.max(player.correctAnswers || 0, storedState.correctAnswers || 0);
          }
        }
      }
      this.players.set(playerId, player);

      // Persist to SQLite lobby_players & restore settled score if quiz completed or user reconnected
      if (this.activeSession) {
        player.sessionId = this.activeSession.id;
        if (this.gameState === "PODIUM" || this.activeSession.isCompleted) {
          try {
            const rows = [
              ...this.ctx.storage.sql.exec(
                "SELECT * FROM player_scores WHERE session_id = ? AND ((email != '' AND LOWER(email) = ?) OR (reg_number != '' AND UPPER(reg_number) = ?) OR player_id = ?) ORDER BY total_score DESC LIMIT 1",
                this.activeSession.id,
                cleanEmail,
                cleanReg,
                player.id
              ),
            ];
            if (rows.length > 0) {
              const savedRow = rows[0];
              player.score = savedRow.total_score || 0;
              player.streak = savedRow.streak || 0;
              player.bestStreak = savedRow.streak || 0;
              player.maxStreak = savedRow.streak || 0;
              player.finalRank = savedRow.final_rank;
              player.correctAnswers = savedRow.correct_answers || 0;
            }
          } catch (e) {
            console.error("Error restoring player_scores in JOIN:", e);
          }
          // IMMUTABLE: Zero SQLite writes when quiz completed!
        } else {
          if (player.score === 0 || !player.score) {
            try {
              const lobbyRows = [
                ...this.ctx.storage.sql.exec(
                  "SELECT score, streak FROM lobby_players WHERE session_id = ? AND ((email != '' AND LOWER(email) = ?) OR (reg_number != '' AND UPPER(reg_number) = ?) OR player_id = ?) ORDER BY score DESC LIMIT 1",
                  this.activeSession.id,
                  cleanEmail,
                  cleanReg,
                  player.id
                ),
              ];
              if (lobbyRows.length > 0 && lobbyRows[0].score > 0) {
                player.score = lobbyRows[0].score;
                player.streak = lobbyRows[0].streak || 0;
                player.bestStreak = lobbyRows[0].streak || 0;
              }
            } catch (e) {}
          }
          this.savePlayerToDb(this.activeSession.id, player);
        }
      }

      // Correct-answer count and best streak are not browser state. Rehydrate
      // them for every join, including a brand-new device during a live quiz.
      if (this.activeSession) {
        const persistedStats = this.getPersistedAnswerStats(this.activeSession.id, player);
        player.correctAnswers = Math.max(player.correctAnswers || 0, persistedStats.correctAnswers);
        player.bestStreak = Math.max(player.bestStreak || 0, player.maxStreak || 0, persistedStats.bestStreak);
        player.maxStreak = Math.max(player.maxStreak || 0, player.bestStreak || 0, persistedStats.bestStreak);
      }

      // Check if a lobby is active
      if (!this.activeSession) {
        ws.send(
          JSON.stringify({
            type: "LOBBY_INACTIVE",
            message: "Please wait while Quiz Master activates the lobby.",
            player: { id: player.id, name: player.name, regNumber: player.regNumber },
            isWaiting: true,
          })
        );
        this.queueLobbyStatus();
        return;
      }

      ws.send(
        JSON.stringify({
          type: "JOINED_SUCCESS",
          session: this.activeSession,
          player: {
            id: player.id,
            name: player.name,
            regNumber: player.regNumber,
            score: player.score,
            streak: player.streak,
            bestStreak: player.bestStreak || player.maxStreak || player.streak || 0,
            correctAnswers: player.correctAnswers || 0,
            answers: player.answers || {},
          },
          gameState: this.gameState,
          currentQuestionIdx: this.currentQuestionIdx,
          totalQuestions: QUIZ_QUESTIONS.length,
          pacingMode: this.quizPacingMode,
          isReconnected,
        })
      );

      // If a question is actively running, restore question state and player's selected option if already answered
      if (this.gameState === "COUNTDOWN") {
        const remainingSec = this.pendingDueTime ? Math.max(1, Math.round((this.pendingDueTime - Date.now()) / 1000)) : 3;
        ws.send(
          JSON.stringify({
            type: "QUIZ_COUNTDOWN",
            durationSec: remainingSec,
            startsAt: this.pendingDueTime || (Date.now() + remainingSec * 1000),
            serverTime: Date.now(),
            questionIndex: 0,
            totalQuestions: QUIZ_QUESTIONS.length,
            nextQuestion: this.getPublicQuestion(0),
          })
        );
      } else if (this.gameState === "QUESTION") {
        const remainingSec = this.pendingDueTime ? Math.max(1, Math.round((this.pendingDueTime - Date.now()) / 1000)) : QUESTION_DURATION_SEC;
        const pubQ = this.getPublicQuestion(this.currentQuestionIdx);
        const existingAns = player.answers && player.answers[this.currentQuestionIdx];
        ws.send(
          JSON.stringify({
            type: "QUESTION_START",
            question: { ...pubQ, durationSec: remainingSec },
            serverTime: Date.now(),
            pacingMode: this.quizPacingMode,
            alreadyAnswered: !!existingAns,
            selectedOption: existingAns ? existingAns.optionKey : null,
          })
        );
      } else if (this.gameState === "ANSWER_REVEAL") {
        const q = QUIZ_QUESTIONS[this.currentQuestionIdx];
        const existingAns = player.answers && player.answers[this.currentQuestionIdx];
        const isCorrect = existingAns ? existingAns.isCorrect : false;
        const points = existingAns ? existingAns.points : 0;
        const stats = { A: 0, B: 0, C: 0, D: 0, E: 0 };
        let totalAnswered = 0;
        for (const p of this.players.values()) {
          const a = p.answers && p.answers[this.currentQuestionIdx];
          if (a && a.optionKey && stats[a.optionKey] !== undefined) {
            stats[a.optionKey]++;
            totalAnswered++;
          }
        }
        const correctOptionText = q ? (q.options.find((o) => o.key === q.correctAnswer)?.text || "") : "";
        const remainingSec = this.pendingDueTime ? Math.max(0, Math.round((this.pendingDueTime - Date.now()) / 1000)) : 0;
        const nextQIdx = this.currentQuestionIdx + 1;
        const nextQuestion = nextQIdx < QUIZ_QUESTIONS.length ? this.getPublicQuestion(nextQIdx) : null;
        ws.send(
          JSON.stringify({
            type: "ANSWER_RESULT",
            questionIndex: this.currentQuestionIdx,
            isCorrect,
            correctAnswer: q?.correctAnswer,
            correctOption: q?.correctAnswer,
            correctText: correctOptionText,
            explanation: q?.explanation,
            selectedOption: existingAns ? existingAns.optionKey : null,
            pointsEarned: points,
            streakBonus: existingAns ? existingAns.streakBonus || 0 : 0,
            totalScore: player.score,
            streak: player.streak,
            stats,
            distribution: stats,
            totalAnswered,
            pacingMode: this.quizPacingMode,
            autoNextSec: remainingSec,
            nextQuestion,
          })
        );
      } else if (this.gameState === "LEADERBOARD") {
        const lb = this.getLeaderboard();
        const cluster = this.getPlayerCluster(player.id);
        const remainingSec = this.pendingDueTime ? Math.max(0, Math.round((this.pendingDueTime - Date.now()) / 1000)) : 0;
        const lastAns = player.answers && player.answers[this.currentQuestionIdx];
        const pointsAdded = lastAns && lastAns.isCorrect ? (lastAns.points || 0) : 0;
        const prevScore = Math.max(0, (player.score || 0) - pointsAdded);
        const myEntry = (cluster || []).find((x) => x.id === player.id) || (lb.top10 || []).find((x) => x.id === player.id);
        const nextQIdx = this.currentQuestionIdx + 1;
        const nextQuestion = nextQIdx < QUIZ_QUESTIONS.length ? this.getPublicQuestion(nextQIdx) : null;
        ws.send(
          JSON.stringify({
            type: "LEADERBOARD_VIEW",
            top10: lb.top10,
            cluster,
            totalPlayers: lb.totalPlayers,
            pacingMode: this.quizPacingMode,
            autoNextSec: remainingSec,
            nextQuestion,
            nextQuestionStartsAt: this.pendingDueTime || (Date.now() + remainingSec * 1000),
            rank: myEntry ? myEntry.rank : 1,
            prevRank: myEntry ? myEntry.prevRank : 1,
            totalScore: player.score,
            prevScore,
            pointsAdded,
            streak: player.streak,
          })
        );
      }

      // If quiz is finished (PODIUM) or session is completed, immediately send their personalized final results!
      if (this.gameState === "PODIUM" || (this.activeSession && this.activeSession.isCompleted)) {
        const resultData = this.getParticipantFinalResult(player.id, player.name, player.regNumber, player.email);
        ws.send(
          JSON.stringify({
            type: "QUIZ_FINISHED",
            ...resultData,
            session: this.activeSession,
            pacingMode: this.quizPacingMode,
          })
        );
      }

      this.queueLobbyStatus();
      return;
    }

    // 3. Player Submits Answer (Kahoot speed + streak scoring, NO negative marking)
    if (msg.type === "SUBMIT_ANSWER") {
      if (this.isPaused) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Quiz countdown is currently paused by Quiz Master." }));
        return;
      }
      // Never trust a playerId supplied by the browser: a connected player
      // must only be able to submit an answer for their own WebSocket identity.
      const pId = meta.playerId || socketId;
      const player = this.players.get(pId) || this.players.get(socketId);

      // SEC: Only allow players who joined via JOIN to submit answers (prevent ghost injection)
      if (!player) return;

      if (this.gameState !== "QUESTION") return;

      const qIdx = msg.questionIndex;
      if (qIdx !== this.currentQuestionIdx) return;
      if (player.answers[qIdx]) return; // prevent duplicate clicks

      // Allow valid options A–E (some questions have 5 options)
      const validOptions = ["A", "B", "C", "D", "E"];
      if (!validOptions.includes(msg.optionKey)) return;

      const elapsedMs = Math.max(0, Date.now() - this.questionStartTime);
      const q = QUIZ_QUESTIONS[qIdx];
      const isCorrect = msg.optionKey === q.correctAnswer;
      const previousScore = player.score || 0;
      const previousStreak = player.streak || 0;
      const previousMaxStreak = player.maxStreak || 0;
      const previousBestStreak = player.bestStreak || 0;
      const previousCorrectAnswers = player.correctAnswers || 0;

      // Authentic Kahoot Streak Bonus Scale:
      // 1st correct: standard speed points (no streak yet)
      // 2 in a row: +100 bonus pts
      // 3 in a row: +200 bonus pts
      // 4 in a row: +300 bonus pts
      // 5+ in a row: +500 bonus pts
      // Miss / Wrong: Streak resets to 0. Score remains untouched (no negative marking).
      let streakBonus = 0;
      let points = 0;
      let baseSpeedPoints = 0;

      if (isCorrect) {
        player.streak = (player.streak || 0) + 1;
        player.maxStreak = Math.max(player.maxStreak || 0, player.streak);
        if (player.streak === 2) streakBonus = 100;
        else if (player.streak === 3) streakBonus = 200;
        else if (player.streak === 4) streakBonus = 300;
        else if (player.streak >= 5) streakBonus = 500;

        const totalMs = QUESTION_DURATION_SEC * 1000;
        const remainingFraction = Math.max(0, (totalMs - elapsedMs) / totalMs);
        baseSpeedPoints = Math.round(500 + remainingFraction * 500); // 500 to 1000 points
        points = baseSpeedPoints + streakBonus;
      } else {
        player.streak = 0;
        points = 0; // No penalty, score never decreases
      }

      player.score += points;
      player.lastPoints = points;
      player.answers[qIdx] = {
        optionKey: msg.optionKey,
        elapsedMs,
        points,
        streakBonus,
        isCorrect,
      };

      if (isCorrect) {
        player.correctAnswers = (player.correctAnswers || 0) + 1;
        player.bestStreak = Math.max(player.bestStreak || 0, player.maxStreak || 0, player.streak || 0);
      }

      // Persist the answer and score before acknowledging it. Each player
      // writes one small answer row and one compact lobby snapshot, rather
      // than a large all-player flush at reveal time.
      try {
        if (this.activeSession) this.persistSubmittedAnswer(this.activeSession.id, player, qIdx);
      } catch (e) {
        delete player.answers[qIdx];
        player.score = previousScore;
        player.streak = previousStreak;
        player.maxStreak = previousMaxStreak;
        player.bestStreak = previousBestStreak;
        player.correctAnswers = previousCorrectAnswers;
        ws.send(JSON.stringify({ type: "ERROR", message: "Your answer could not be saved. Please select again." }));
        return;
      }

      ws.send(
        JSON.stringify({
          type: "ANSWER_ACK",
          questionIndex: qIdx,
          optionKey: msg.optionKey,
          receivedAt: Date.now(),
        })
      );

      // Count active connected players and how many have answered
      const activeSockets = this.ctx.getWebSockets();
      const activePlayerIds = new Set();
      for (const s of activeSockets) {
        const m = s.deserializeAttachment();
        if (m && m.role === "player" && m.playerId) activePlayerIds.add(m.playerId);
      }

      let activeAnswerCount = 0;
      let totalAnswerCount = 0;
      for (const p of this.players.values()) {
        if (p.answers && p.answers[qIdx]) {
          totalAnswerCount++;
          if (activePlayerIds.has(p.id)) activeAnswerCount++;
        }
      }

      // Throttle LIVE_ANSWER_COUNT to host: max once per 500ms to avoid 1000-msg burst
      const now = Date.now();
      if (now - this._liveCountLastSent >= 500) {
        this._liveCountLastSent = now;
        this.sendToHost({
          type: "LIVE_ANSWER_COUNT",
          count: totalAnswerCount,
          total: Math.max(activePlayerIds.size, totalAnswerCount, 1),
        });
      }

      // Auto-reveal when 100% of connected active players have answered
      if (activePlayerIds.size > 0 && activeAnswerCount >= activePlayerIds.size) {
        this.revealAnswer();
      }
      return;
    }

    // 4. Host Actions (Strictly verified by role)
    if (msg.type === "HOST_ACTION") {
      if (meta.role !== "host") {
        ws.send(JSON.stringify({ type: "ERROR", message: "Unauthorized host action. Please authenticate." }));
        return;
      }

      switch (msg.action) {
        case "CREATE_SESSION":
          this.createSession(msg.name, msg.activate !== false);
          break;
        case "ACTIVATE_SESSION":
          this.activateSession(msg.sessionId);
          break;
        case "INACTIVATE_SESSION":
          this.inactivateSession(msg.sessionId);
          break;
        case "DELETE_SESSION":
          this.deleteSession(msg.sessionId);
          break;
        case "GET_SESSIONS":
          ws.send(
            JSON.stringify({
              type: "SESSIONS_UPDATED",
              sessions: this.sessions,
              activeSession: this.activeSession,
            })
          );
          break;
        case "START_QUIZ":
          this.startQuizCountdown();
          break;
        case "NEXT_QUESTION":
          this.startQuestion(this.currentQuestionIdx + 1);
          break;
        case "REVEAL_ANSWER":
          this.revealAnswer();
          break;
        case "SHOW_LEADERBOARD":
          this.showLeaderboard();
          break;
        case "END_QUIZ":
          this.endQuiz();
          break;
        case "RESET":
          this.resetQuiz();
          break;
        case "PAUSE_QUIZ":
          this.pauseQuiz();
          break;
        case "RESUME_QUIZ":
          this.resumeQuiz();
          break;
        case "SET_PACING_MODE":
          this.quizPacingMode = msg.mode === "manual" ? "manual" : "auto";
          if (this.quizPacingMode === "manual") {
            this.clearAllTimers();
          } else if (this.quizPacingMode === "auto") {
            if (this.gameState === "ANSWER_REVEAL") {
              this.scheduleTimer("SHOW_LEADERBOARD", REVEAL_DURATION_SEC);
            } else if (this.gameState === "LEADERBOARD") {
              const isLast = this.currentQuestionIdx + 1 >= QUIZ_QUESTIONS.length;
              this.scheduleTimer(isLast ? "END_QUIZ" : "NEXT_QUESTION", LEADERBOARD_DURATION_SEC);
            }
          }
          this.broadcast({ type: "PACING_MODE_UPDATED", pacingMode: this.quizPacingMode });
          break;
        default:
          break;
      }
    }
  }

  // WebSocket Close Handler (Hibernation API)
  async webSocketClose(ws, code, reason, wasClean) {
    const meta = ws.deserializeAttachment() || {};
    const pId = meta.playerId || meta.id;
    const email = meta.email;

    // Immediately mark socket as closed in attachment so subsequent scans ignore it!
    try {
      ws.serializeAttachment({ role: "closed", playerId: null, email: null });
    } catch (e) {}

    if (!pId) return;

    // Check if player still has another active WebSocket (e.g. refreshed or opened in new tab)
    let hasOtherSocket = false;
    for (const otherWs of this.ctx.getWebSockets()) {
      if (otherWs !== ws) {
        const otherMeta = otherWs.deserializeAttachment();
        if (
          otherMeta &&
          (otherMeta.playerId === pId ||
            otherMeta.id === pId ||
            (email && otherMeta.email && otherMeta.email.toLowerCase() === email.toLowerCase()))
        ) {
          hasOtherSocket = true;
          break;
        }
      }
    }

    if (this.players.has(pId)) {
      const p = this.players.get(pId);
      if (!hasOtherSocket) {
        p.connected = false;
        p.lastSeen = Date.now();
        if (this.activeSession) {
          this.savePlayerToDb(this.activeSession.id, p);
        }
      }
    }

    if (this.gameState === "LOBBY") {
      this.queueLobbyStatus();
    }
  }

  async webSocketError(ws, error) {
    ws.close(1011, "WebSocket error");
  }

  // Game Engine State Transitions
  startQuizCountdown() {
    this.clearAllTimers();
    this.finalLeaderboard = null;
    this.finalResultsByPlayerId = new Map();
    this.isPaused = false;
    this.pausedRemainingMs = 0;
    this.savedPendingAction = null;
    this.gameState = "COUNTDOWN";
    this.currentQuestionIdx = 0;
    this.persistLiveState();

    const firstQuestion = this.getPublicQuestion(0);
    const durationSec = 3;
    const startsAt = Date.now() + durationSec * 1000;

    this.broadcast({
      type: "QUIZ_COUNTDOWN",
      durationSec,
      startsAt,
      serverTime: Date.now(),
      questionIndex: 0,
      totalQuestions: QUIZ_QUESTIONS.length,
      nextQuestion: firstQuestion,
    });

    this.scheduleTimer("START_FIRST_QUESTION", durationSec);
  }

  startQuestion(index) {
    if (index < 0 || index >= QUIZ_QUESTIONS.length) {
      this.endQuiz();
      return;
    }

    this.clearAllTimers();
    this.isPaused = false;
    this.pausedRemainingMs = 0;
    this.savedPendingAction = null;
    this.gameState = "QUESTION";
    this.currentQuestionIdx = index;
    this.questionStartTime = Date.now();
    this.persistLiveState();

    const publicQuestion = this.getPublicQuestion(index);

    this.broadcast({
      type: "QUESTION_START",
      question: publicQuestion,
      serverTime: Date.now(),
      pacingMode: this.quizPacingMode,
    });

    // Schedule Question Countdown Expiration (60 seconds)
    this.scheduleTimer("REVEAL_ANSWER", QUESTION_DURATION_SEC);
  }

  revealAnswer() {
    this.clearAllTimers();
    this.isPaused = false;
    this.pausedRemainingMs = 0;
    this.savedPendingAction = null;
    this.gameState = "ANSWER_REVEAL";
    this.persistLiveState();

    // Reset streak for any player who did NOT answer this question (time-up = missed = streak broken)
    const qIdxAtReveal = this.currentQuestionIdx;
    for (const p of this.players.values()) {
      if (!p.answers || !p.answers[qIdxAtReveal]) {
        p.streak = 0; // missed this question — streak broken
      }
    }

    // Answers are persisted at submission time. Keep this idempotent fallback
    // for records made by an older Worker version, but avoid re-saving every
    // player and re-querying their answer history at every reveal.
    if (this.activeSession) {
      this.persistQuestionAnswers(this.activeSession.id, qIdxAtReveal);
      for (const p of this.players.values()) {
        p.correctAnswers = Object.values(p.answers || {}).filter((a) => a && a.isCorrect).length;
        p.bestStreak = Math.max(p.bestStreak || 0, p.maxStreak || 0, p.streak || 0);
      }
    }
    // Send final LIVE_ANSWER_COUNT to host immediately at reveal
    this._liveCountLastSent = Date.now();
    const qIdxFinal = this.currentQuestionIdx;
    let finalCount = 0;
    for (const p of this.players.values()) {
      if (p.answers && p.answers[qIdxFinal]) finalCount++;
    }
    this.sendToHost({ type: "LIVE_ANSWER_COUNT", count: finalCount, total: Math.max(finalCount, 1) });

    const q = QUIZ_QUESTIONS[this.currentQuestionIdx];
    if (!q) return;

    // Calculate answer distribution breakdown
    const stats = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    let totalAnswered = 0;

    for (const p of this.players.values()) {
      const ans = p.answers[this.currentQuestionIdx];
      if (ans && ans.optionKey && stats[ans.optionKey] !== undefined) {
        stats[ans.optionKey]++;
        totalAnswered++;
      }
    }

    const correctOptionText = q.options.find((o) => o.key === q.correctAnswer)?.text || "";
    const nextQIdx = this.currentQuestionIdx + 1;
    const nextQuestion = nextQIdx < QUIZ_QUESTIONS.length ? this.getPublicQuestion(nextQIdx) : null;

    // Send personalized results to each connected socket
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment();
      if (!meta) continue;

      if (meta.role === "host") {
        ws.send(
          JSON.stringify({
            type: "HOST_REVEAL",
            questionIndex: this.currentQuestionIdx,
            correctAnswer: q.correctAnswer,
            correctOption: q.correctAnswer,
            correctText: correctOptionText,
            explanation: q.explanation,
            stats,
            distribution: stats,
            totalAnswered,
            pacingMode: this.quizPacingMode,
            autoNextSec: this.quizPacingMode === "auto" ? REVEAL_DURATION_SEC : 0,
            nextQuestion,
          })
        );
      } else {
        const pId = meta.playerId || meta.id;
        const p = this.players.get(pId);
        if (p) {
          const ans = p.answers[this.currentQuestionIdx];
          const isCorrect = ans && ans.optionKey === q.correctAnswer;
          const points = isCorrect ? ans.points : 0;

          ws.send(
            JSON.stringify({
              type: "ANSWER_RESULT",
              questionIndex: this.currentQuestionIdx,
              isCorrect,
              correctAnswer: q.correctAnswer,
              correctOption: q.correctAnswer,
              correctText: correctOptionText,
              explanation: q.explanation,
              selectedOption: ans ? ans.optionKey : null,
              pointsEarned: points,
              streakBonus: ans ? ans.streakBonus || 0 : 0,
              totalScore: p.score,
              streak: p.streak,
              stats,
              distribution: stats,
              totalAnswered,
              pacingMode: this.quizPacingMode,
              autoNextSec: this.quizPacingMode === "auto" ? REVEAL_DURATION_SEC : 0,
              nextQuestion,
            })
          );
        }
      }
    }

    // Auto-Advance: Smoothly transition to Leaderboard after 6s
    if (this.quizPacingMode === "auto") {
      this.scheduleTimer("SHOW_LEADERBOARD", REVEAL_DURATION_SEC);
    }
  }

  getPlayerCluster(playerId) {
    const activeList = this.getActiveParticipants();
    if (!activeList || activeList.length === 0) return [];

    // Current scores & ranks
    const sorted = [...activeList].sort((a, b) => {
      const diff = (b.score || 0) - (a.score || 0);
      if (diff !== 0) return diff;
      return (a.name || "").localeCompare(b.name || "");
    });
    const rankMap = new Map();
    sorted.forEach((p, idx) => rankMap.set(p.id, idx + 1));

    // Previous scores & ranks (before this question's points)
    const sortedPrev = [...activeList].sort((a, b) => {
      const aAns = a.answers && a.answers[this.currentQuestionIdx];
      const aPts = aAns && aAns.isCorrect ? (aAns.points || 0) : 0;
      const bAns = b.answers && b.answers[this.currentQuestionIdx];
      const bPts = bAns && bAns.isCorrect ? (bAns.points || 0) : 0;
      const diff = ((b.score || 0) - bPts) - ((a.score || 0) - aPts);
      if (diff !== 0) return diff;
      return (a.name || "").localeCompare(b.name || "");
    });
    const prevRankMap = new Map();
    sortedPrev.forEach((p, idx) => prevRankMap.set(p.id, idx + 1));

    const p = this.players.get(playerId) || activeList.find((x) => x.id === playerId);
    return this.getParticipantNeighborhoodCluster(p, sortedPrev, sorted, prevRankMap, rankMap);
  }

  getParticipantNeighborhoodCluster(p, sortedPrev, sortedCurrent, prevRankMap, currentRankMap) {
    if (!p) return [];
    const prevRank = prevRankMap.get(p.id) || 1;
    const currentRank = currentRankMap.get(p.id) || 1;

    // Exactly up to 2 above, the participant, and up to 2 below (based on prevRank)
    const myPrevIdx = Math.max(0, prevRank - 1);
    let prevStart = Math.max(0, myPrevIdx - 2);
    if (prevStart + 5 > sortedPrev.length) {
      prevStart = Math.max(0, sortedPrev.length - 5);
    }
    const initial5 = sortedPrev.slice(prevStart, prevStart + 5);

    // Exactly up to 2 above, the participant, and up to 2 below (based on currentRank)
    const myCurrIdx = Math.max(0, currentRank - 1);
    let currStart = Math.max(0, myCurrIdx - 2);
    if (currStart + 5 > sortedCurrent.length) {
      currStart = Math.max(0, sortedCurrent.length - 5);
    }
    const final5 = sortedCurrent.slice(currStart, currStart + 5);

    // Combine all candidate participants involved in this transition
    const combinedMap = new Map();
    initial5.forEach((item) => combinedMap.set(item.id, item));
    final5.forEach((item) => combinedMap.set(item.id, item));

    return Array.from(combinedMap.values()).map((item) => {
      const itemAns = item.answers && item.answers[this.currentQuestionIdx];
      const itemPts = itemAns && itemAns.isCorrect ? itemAns.points || 0 : 0;
      const itemPrevScore = Math.max(0, (item.score || 0) - itemPts);
      let inst = item.institution || item.college || "";
      let yr = item.academicYear || item.year || "";
      if (!inst || !yr) {
        for (const s of this.ctx.getWebSockets()) {
          const m = s.deserializeAttachment();
          if (m && (m.playerId === item.id || m.id === item.id)) {
            if (!inst && m.institution) inst = m.institution;
            if (!yr && m.academicYear) yr = m.academicYear;
            break;
          }
        }
      }
      const initialSlot = initial5.findIndex((x) => x.id === item.id);
      const finalSlot = final5.findIndex((x) => x.id === item.id);
      return {
        id: item.id,
        name: item.name,
        regNumber: item.regNumber || "",
        college: inst,
        year: yr,
        institution: inst,
        academicYear: yr,
        isMe: item.id === p.id,
        prevRank: prevRankMap.get(item.id) || 1,
        rank: currentRankMap.get(item.id) || 1,
        prevScore: itemPrevScore,
        score: item.score || 0,
        pointsAdded: itemPts,
        initialSlot,
        finalSlot,
        inInitial: initialSlot >= 0,
        inFinal: finalSlot >= 0,
      };
    });
  }

  showLeaderboard() {
    this.clearAllTimers();
    this.gameState = "LEADERBOARD";
    this.persistLiveState();
    const leaderboard = this.getLeaderboard();

    // Send personalized ranks among active participants
    const activeList = this.getActiveParticipants();
    const sorted = [...activeList].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.name || "").localeCompare(b.name || "");
    });
    const rankMap = new Map();
    sorted.forEach((p, idx) => rankMap.set(p.id, idx + 1));

    const sortedPrev = [...activeList].sort((a, b) => {
      const aAns = a.answers && a.answers[this.currentQuestionIdx];
      const aPts = aAns && aAns.isCorrect ? aAns.points || 0 : 0;
      const bAns = b.answers && b.answers[this.currentQuestionIdx];
      const bPts = bAns && bAns.isCorrect ? bAns.points || 0 : 0;
      const diff = ((b.score || 0) - bPts) - ((a.score || 0) - aPts);
      if (diff !== 0) return diff;
      return (a.name || "").localeCompare(b.name || "");
    });
    const prevRankMap = new Map();
    sortedPrev.forEach((p, idx) => prevRankMap.set(p.id, idx + 1));

    const nextQIdx = this.currentQuestionIdx + 1;
    const nextQuestion = nextQIdx < QUIZ_QUESTIONS.length ? this.getPublicQuestion(nextQIdx) : null;
    const nextQuestionStartsAt = Date.now() + LEADERBOARD_DURATION_SEC * 1000;

    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment();
      if (!meta) continue;

      if (meta.role === "host") {
        ws.send(
          JSON.stringify({
            type: "LEADERBOARD_VIEW",
            top10: leaderboard.top10,
            totalPlayers: leaderboard.totalPlayers,
            pacingMode: this.quizPacingMode,
            autoNextSec: this.quizPacingMode === "auto" ? LEADERBOARD_DURATION_SEC : 0,
            nextQuestion,
            nextQuestionStartsAt,
          })
        );
      } else {
        const pId = meta.playerId || meta.id;
        let p = pId ? this.players.get(pId) : null;
        if (!p && meta.regNumber) {
          p = Array.from(this.players.values()).find(
            (x) => x.regNumber && x.regNumber.toUpperCase() === meta.regNumber.toUpperCase()
          );
        }
        if (!p && meta.name) {
          p = Array.from(this.players.values()).find(
            (x) => (x.name || "").trim().toLowerCase() === meta.name.trim().toLowerCase()
          );
        }
        if (p) {
          const lastAns = p.answers && p.answers[this.currentQuestionIdx];
          const pointsAdded = lastAns && lastAns.isCorrect ? lastAns.points || 0 : 0;
          const prevScore = Math.max(0, (p.score || 0) - pointsAdded);
          const prevRank = prevRankMap.get(p.id) || 1;
          const currentRank = rankMap.get(p.id) || 1;

          const cluster = this.getParticipantNeighborhoodCluster(p, sortedPrev, sorted, prevRankMap, rankMap);

          ws.send(
            JSON.stringify({
              type: "LEADERBOARD_VIEW",
              rank: currentRank,
              prevRank,
              totalScore: p.score,
              prevScore,
              pointsAdded,
              streak: p.streak,
              cluster,
              totalPlayers: leaderboard.totalPlayers,
              pacingMode: this.quizPacingMode,
              autoNextSec: this.quizPacingMode === "auto" ? LEADERBOARD_DURATION_SEC : 0,
              nextQuestion,
              nextQuestionStartsAt,
            })
          );
        }
      }
    }

    // Auto-Advance: Smoothly transition to Next Question or Podium after 5s
    if (this.quizPacingMode === "auto") {
      const isLast = this.currentQuestionIdx + 1 >= QUIZ_QUESTIONS.length;
      this.scheduleTimer(isLast ? "END_QUIZ" : "NEXT_QUESTION", LEADERBOARD_DURATION_SEC);
    }
  }

  cacheFinalResults(settled) {
    this.finalLeaderboard = settled;
    this.finalResultsByPlayerId = new Map();
    const totalPlayers = settled.length;
    const champions = settled.slice(0, 10);

    for (let index = 0; index < totalPlayers; index++) {
      const me = settled[index];
      const startIndex = Math.max(0, index - 5);
      const endIndex = Math.min(totalPlayers, index + 6);
      const bestStreak = me.bestStreak || me.streak || 0;
      this.finalResultsByPlayerId.set(me.id, {
        rank: me.rank,
        totalScore: me.score || 0,
        streak: bestStreak,
        bestStreak,
        maxStreak: bestStreak,
        correctAnswers: me.correctAnswers || 0,
        totalQuestions: QUIZ_QUESTIONS.length,
        champions,
        top10: champions,
        podium: champions,
        above5: settled.slice(startIndex, index),
        me: { ...me, streak: bestStreak, bestStreak, maxStreak: bestStreak },
        below5: settled.slice(index + 1, endIndex),
        surrounding: settled.slice(startIndex, endIndex),
        totalPlayers,
      });
    }
  }

  getCachedFinalResult(playerId, name, regNumber, email = "") {
    if (!this.finalLeaderboard?.length) return null;
    if (playerId && this.finalResultsByPlayerId.has(playerId)) {
      return this.finalResultsByPlayerId.get(playerId);
    }
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanReg = (regNumber || "").replace(/[\[\]]/g, "").trim().toUpperCase();
    const cleanName = (name || "").trim().toLowerCase();
    const match = this.finalLeaderboard.find((p) =>
      (cleanEmail && (p.email || "").toLowerCase() === cleanEmail) ||
      (cleanReg && (p.regNumber || "").replace(/[\[\]]/g, "").trim().toUpperCase() === cleanReg) ||
      (cleanName && (p.name || "").trim().toLowerCase() === cleanName)
    );
    return match ? this.finalResultsByPlayerId.get(match.id) || null : null;
  }

  getParticipantFinalResult(playerId, name, regNumber, email = "") {
    const cachedResult = this.getCachedFinalResult(playerId, name, regNumber, email);
    if (cachedResult) return cachedResult;
    const cleanReg = (regNumber || "").replace(/[\[\]]/g, "").trim().toUpperCase();
    const cleanName = (name || "").trim().toLowerCase();
    const cleanEmail = (email || "").trim().toLowerCase();

    if (this.activeSession) {
      try {
        const rows = [
          ...this.ctx.storage.sql.exec(
            "SELECT * FROM player_scores WHERE session_id = ? ORDER BY final_rank ASC",
            this.activeSession.id
          ),
        ];
        if (rows.length > 0) {
          const sorted = rows.map((r) => {
            const bestStreak = r.streak || 0;
            return {
              rank: r.final_rank,
              id: r.player_id,
              name: r.player_name,
              regNumber: r.reg_number || "",
              email: r.email || "",
              institution: r.institution || "",
              academicYear: r.academic_year || "",
              college: r.institution || "",
              year: r.academic_year || "",
              score: r.total_score || 0,
              streak: bestStreak,
              bestStreak,
              maxStreak: bestStreak,
              correctAnswers: r.correct_answers || 0,
            };
          });
          this.cacheFinalResults(sorted);

          const totalPlayers = sorted.length;
          const champions = sorted.slice(0, 10);
          const podium = champions;

          let myIndex = -1;
          if (cleanEmail) {
            myIndex = sorted.findIndex(
              (p) => p.email && p.email.toLowerCase() === cleanEmail
            );
          }
          if (myIndex === -1 && cleanReg) {
            myIndex = sorted.findIndex(
              (p) =>
                p.regNumber &&
                p.regNumber.replace(/[\[\]]/g, "").trim().toUpperCase() === cleanReg
            );
          }
          if (myIndex === -1 && playerId) {
            myIndex = sorted.findIndex((p) => p.id === playerId);
          }
          if (myIndex === -1 && cleanName) {
            myIndex = sorted.findIndex(
              (p) => (p.name || "").trim().toLowerCase() === cleanName
            );
          }

          if (myIndex !== -1) {
            const me = sorted[myIndex];
            const startIndex = Math.max(0, myIndex - 5);
            const endIndex = Math.min(totalPlayers, myIndex + 6);
            const above5 = sorted.slice(startIndex, myIndex);
            const below5 = sorted.slice(myIndex + 1, endIndex);
            const surrounding = sorted.slice(startIndex, endIndex);

            return {
              rank: me.rank,
              totalScore: me.score,
              streak: me.bestStreak,
              bestStreak: me.bestStreak,
              maxStreak: me.bestStreak,
              correctAnswers: me.correctAnswers,
              totalQuestions: QUIZ_QUESTIONS.length,
              champions,
              top10: champions,
              podium,
              above5,
              me: {
                ...me,
                streak: me.bestStreak,
                bestStreak: me.bestStreak,
                maxStreak: me.bestStreak,
              },
              below5,
              surrounding,
              totalPlayers,
            };
          } else {
            // Unranked visitor, newly joined user, or doctor with different email:
            // Champions, Top 10, and Podium MUST REMAIN 100% IMMUTABLE!
            const visitorMe = {
              rank: "-",
              score: 0,
              totalScore: 0,
              streak: 0,
              bestStreak: 0,
              maxStreak: 0,
              correctAnswers: 0,
              name: name || "Participant",
              regNumber: cleanReg || "",
              email: cleanEmail || "",
              institution: "",
              academicYear: "",
              college: "",
              year: "",
            };
            return {
              rank: "-",
              totalScore: 0,
              streak: 0,
              bestStreak: 0,
              maxStreak: 0,
              correctAnswers: 0,
              totalQuestions: QUIZ_QUESTIONS.length,
              champions,
              top10: champions,
              podium,
              above5: [],
              me: visitorMe,
              below5: [],
              surrounding: champions,
              totalPlayers,
            };
          }
        }
      } catch (e) {
        console.error("Failed to query player_scores in getParticipantFinalResult:", e);
      }
    }

    const eligible = this.getActiveParticipants();
    for (const p of eligible) {
      const computedScore = Object.values(p.answers || {}).reduce(
        (sum, a) => sum + (a && a.points ? a.points : 0),
        0
      );
      p.score = Math.max(p.score || 0, computedScore);
    }

    const sorted = eligible
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if ((b.streak || 0) !== (a.streak || 0)) return (b.streak || 0) - (a.streak || 0);
        return (a.name || "").localeCompare(b.name || "");
      })
      .map((p, idx) => ({
        rank: idx + 1,
        id: p.id,
        name: p.name,
        regNumber: p.regNumber || "",
        institution: p.institution || p.college || "",
        academicYear: p.academicYear || p.year || "",
        score: p.score,
        streak: p.maxStreak || p.bestStreak || p.streak || 0,
        bestStreak: p.maxStreak || p.bestStreak || p.streak || 0,
        correctAnswers:
          p.correctAnswers !== undefined
            ? p.correctAnswers
            : p.answers
            ? Object.values(p.answers).filter((a) => a && a.isCorrect).length
            : 0,
      }));

    const totalPlayers = sorted.length;
    const champions = sorted.slice(0, 10);
    const podium = champions; // top 10 champions

    // Find index of this participant
    let myIndex = -1;
    if (playerId) {
      myIndex = sorted.findIndex((p) => p.id === playerId);
    }
    if (myIndex === -1 && cleanReg) {
      myIndex = sorted.findIndex(
        (p) =>
          p.regNumber &&
          p.regNumber.replace(/[\[\]]/g, "").trim().toUpperCase() === cleanReg
      );
    }
    if (myIndex === -1 && cleanName) {
      myIndex = sorted.findIndex(
        (p) => (p.name || "").trim().toLowerCase() === cleanName
      );
    }

    let targetP = playerId ? this.players.get(playerId) : null;
    if (!targetP && myIndex !== -1 && sorted[myIndex]) {
      targetP = this.players.get(sorted[myIndex].id);
    }
    if (!targetP && cleanReg) {
      targetP = Array.from(this.players.values()).find(
        (p) => p.regNumber && p.regNumber.replace(/[\[\]]/g, "").trim().toUpperCase() === cleanReg
      );
    }
    if (!targetP && cleanName) {
      targetP = Array.from(this.players.values()).find(
        (p) => (p.name || "").trim().toLowerCase() === cleanName
      );
    }

    // Prefer DB-sourced value first (player_scores has correct_answers persisted at endQuiz)
    // In-memory targetP.answers is empty on reconnect, so must not be the primary source.
    let correctAnswers = 0;
    if (myIndex !== -1 && sorted[myIndex]?.correctAnswers) {
      // DB truth — always authoritative when available
      correctAnswers = sorted[myIndex].correctAnswers;
    } else if (targetP) {
      if (targetP.correctAnswers !== undefined && targetP.correctAnswers > 0) {
        correctAnswers = targetP.correctAnswers;
      } else if (targetP.answers && Object.keys(targetP.answers).length > 0) {
        correctAnswers = Object.values(targetP.answers).filter((a) => a && a.isCorrect).length;
      }
    }
    const bestStreak = Math.max(
      targetP?.maxStreak || 0,
      targetP?.bestStreak || 0,
      targetP?.streak || 0,
      myIndex !== -1 ? sorted[myIndex]?.bestStreak || sorted[myIndex]?.streak || 0 : 0
    );
    const totalQuestions = QUIZ_QUESTIONS.length;

    if (myIndex === -1) {
      // Person was NOT in the quiz at all (joined after it ended or never answered)
      return {
        rank: null,
        didNotParticipate: true,
        totalScore: 0,
        streak: 0,
        bestStreak: 0,
        maxStreak: 0,
        correctAnswers: 0,
        totalQuestions,
        champions,
        top10: champions,
        podium,
        // Show top 5 and bottom 5 of leaderboard so they can see standings
        above5: sorted.slice(0, Math.min(5, totalPlayers)),
        below5: sorted.slice(Math.max(0, totalPlayers - 5), totalPlayers),
        surrounding: sorted.slice(0, Math.min(10, totalPlayers)),
        totalPlayers,
        me: null,
      };
    }

    const me = sorted[myIndex];
    const startIndex = Math.max(0, myIndex - 5);
    const endIndex = Math.min(totalPlayers, myIndex + 6); // up to 5 below me

    const above5 = sorted.slice(startIndex, myIndex);
    const below5 = sorted.slice(myIndex + 1, endIndex);
    const surrounding = sorted.slice(startIndex, endIndex);

    return {
      rank: me.rank,
      totalScore: me.score,
      streak: bestStreak,
      bestStreak,
      maxStreak: bestStreak,
      correctAnswers,
      totalQuestions,
      champions,
      top10: champions,
      podium,
      above5,
      me: {
        ...me,
        streak: bestStreak,
        bestStreak,
        maxStreak: bestStreak,
      },
      below5,
      surrounding,
      totalPlayers,
    };
  }

  endQuiz() {
    this.clearAllTimers();
    this.gameState = "PODIUM";
    this.persistLiveState();
    const now = Date.now();
    if (this.activeSession) {
      try {
        this.ctx.storage.sql.exec(
          "UPDATE sessions SET is_completed = 1, completed_at = ? WHERE id = ?",
          now,
          this.activeSession.id
        );
      } catch (e) {
        console.error("Failed to mark session completed:", e);
      }
      this.sessions = this.getAllSessions();
      this.activeSession = this.sessions.find((s) => s.id === this.activeSession.id) || this.activeSession;
      if (this.activeSession) {
        this.activeSession.isCompleted = true;
        this.activeSession.completedAt = now;
      }
    }

    // Always upsert the final rows. This keeps END_QUIZ idempotent while also
    // repairing a partial/older settlement instead of preserving stale zeros.
    if (this.activeSession) {
      const eligible = this.getActiveParticipants();
      for (const p of eligible) {
        const computedScore = Object.values(p.answers || {}).reduce(
          (sum, a) => sum + (a && a.points ? a.points : 0),
          0
        );
        p.score = Math.max(p.score || 0, computedScore);
      }

      const sorted = eligible.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if ((b.streak || 0) !== (a.streak || 0)) return (b.streak || 0) - (a.streak || 0);
        return (a.name || "").localeCompare(b.name || "");
      });

      try {
        for (let i = 0; i < sorted.length; i++) {
          const p = sorted[i];
          const rank = i + 1;
          p.finalRank = rank;
          const inMemoryCorrectCount = Object.values(p.answers || {}).filter((a) => a && a.isCorrect).length;
          const persistedStats = this.getPersistedAnswerStats(this.activeSession.id, p);
          p.correctAnswers = Math.max(p.correctAnswers || 0, inMemoryCorrectCount, persistedStats.correctAnswers);
          p.bestStreak = Math.max(p.bestStreak || 0, p.maxStreak || 0, p.streak || 0, persistedStats.bestStreak);
          const computedScore = Object.values(p.answers || {}).reduce(
            (sum, a) => sum + (a && a.points ? a.points : 0),
            0
          );
          p.score = Math.max(p.score || 0, computedScore);

          this.ctx.storage.sql.exec(
            `INSERT OR REPLACE INTO player_scores (session_id, player_id, player_name, reg_number, total_score, streak, final_rank, institution, academic_year, correct_answers, email)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            this.activeSession.id,
            p.id,
            p.name,
            p.regNumber || "",
            p.score,
            p.bestStreak,
            rank,
            p.institution || p.college || "",
            p.academicYear || p.year || "",
            p.correctAnswers,
            (p.email || "").toLowerCase()
          );
        }
      } catch (e) {
        console.error("Failed to store player scores in SQLite:", e);
      }
    }

    const leaderboard = this.getLeaderboard();

    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment();
      if (!meta) continue;

      if (meta.role === "host") {
        ws.send(
          JSON.stringify({
            type: "QUIZ_FINISHED",
            podium: leaderboard.top10.slice(0, 3),
            fullLeaderboard: leaderboard.fullLeaderboard || leaderboard.top10,
            session: this.activeSession,
            totalPlayers: leaderboard.totalPlayers,
            pacingMode: this.quizPacingMode,
          })
        );
      } else {
        const pId = meta.playerId || meta.id;
        const player = this.players.get(pId);
        const name = player ? player.name : meta.name || "";
        const reg = player ? player.regNumber : meta.regNumber || "";
        const email = player ? player.email : meta.email || "";
        const result = this.getParticipantFinalResult(pId, name, reg, email);

        ws.send(
          JSON.stringify({
            type: "QUIZ_FINISHED",
            ...result,
            session: this.activeSession,
            pacingMode: this.quizPacingMode,
          })
        );
      }
    }

    this.broadcastSessionsUpdated();
  }

  resetQuiz() {
    this.clearAllTimers();
    this.finalLeaderboard = null;
    this.finalResultsByPlayerId = new Map();
    this.isPaused = false;
    this.pausedRemainingMs = 0;
    this.savedPendingAction = null;
    this.gameState = "LOBBY";
    this.currentQuestionIdx = 0;
    this.questionStartTime = 0;
    this.persistLiveState();

    for (const p of this.players.values()) {
      p.score = 0;
      p.streak = 0;
      p.lastPoints = 0;
      p.answers = {};
    }

    if (this.activeSession) {
      try {
        this.ctx.storage.sql.exec(
          "UPDATE lobby_players SET score = 0, streak = 0 WHERE session_id = ?",
          this.activeSession.id
        );
      } catch (e) {}
    }

    this.broadcast({ type: "RESET_TO_LOBBY" });
    this.broadcastLobbyStatus();
  }

  // Alarms & Timers for Auto-Advance
  scheduleTimer(action, delaySec) {
    this.clearAllTimers();
    const token = ++this.timerSeq;
    this.pendingAction = action;
    this.pendingToken = token;
    this.pendingDueTime = Date.now() + delaySec * 1000;
    this.persistLiveState();

    // Both in-memory timeout and Durable Object Alarm for maximum reliability
    this.activeTimer = setTimeout(() => {
      this.executeAction(action, token);
    }, delaySec * 1000);

    try {
      this.ctx.storage.setAlarm(this.pendingDueTime);
    } catch (e) {
      // ignore
    }
  }

  async alarm() {
    if (!this.pendingToken || !this.pendingAction || !this.pendingDueTime) {
      return;
    }
    const remainingMs = this.pendingDueTime - Date.now();
    if (remainingMs > 150) {
      // Alarm fired prematurely (likely an old alarm event from a previous state)
      try {
        this.ctx.storage.setAlarm(this.pendingDueTime);
      } catch (e) {}
      return;
    }

    const token = this.pendingToken;
    const action = this.pendingAction;
    this.executeAction(action, token);
  }

  executeAction(action, token) {
    if (token !== undefined && this.pendingToken !== token) {
      return; // Superseded or already executed
    }
    this.pendingToken = null;
    this.pendingAction = null;
    this.pendingDueTime = 0;
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    try {
      this.ctx.storage.deleteAlarm();
    } catch (e) {
      // ignore
    }

    if (action === "START_FIRST_QUESTION" && this.gameState === "COUNTDOWN") {
      this.startQuestion(0);
    } else if (action === "REVEAL_ANSWER" && this.gameState === "QUESTION") {
      this.revealAnswer();
    } else if (action === "SHOW_LEADERBOARD" && this.gameState === "ANSWER_REVEAL") {
      this.showLeaderboard();
    } else if (action === "NEXT_QUESTION" && this.gameState === "LEADERBOARD") {
      this.startQuestion(this.currentQuestionIdx + 1);
    } else if (action === "END_QUIZ" && this.gameState === "LEADERBOARD") {
      this.endQuiz();
    }
  }

  clearAllTimers() {
    this.timerSeq = (this.timerSeq || 0) + 1;
    this.pendingToken = null;
    this.pendingAction = null;
    this.pendingDueTime = 0;
    this.persistLiveState();
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    try {
      this.ctx.storage.deleteAlarm();
    } catch (e) {
      // ignore
    }
  }

  pauseQuiz() {
    if (this.isPaused || this.gameState === "LOBBY" || this.gameState === "PODIUM") return;
    this.isPaused = true;

    if (this.gameState === "QUESTION") {
      const elapsed = Date.now() - (this.questionStartTime || Date.now());
      const totalMs = QUESTION_DURATION_SEC * 1000;
      this.pausedRemainingMs = Math.max(1000, totalMs - elapsed);
      this.savedPendingAction = "REVEAL_ANSWER";
      this.clearAllTimers();
    } else if (this.pendingAction && this.pendingDueTime) {
      this.pausedRemainingMs = Math.max(1000, this.pendingDueTime - Date.now());
      this.savedPendingAction = this.pendingAction;
      this.clearAllTimers();
    } else {
      this.pausedRemainingMs = 0;
      this.savedPendingAction = null;
    }

    this.persistLiveState();
    this.broadcast({
      type: "QUIZ_PAUSED",
      isPaused: true,
      gameState: this.gameState,
      remainingSec: Math.max(0, Math.ceil(this.pausedRemainingMs / 1000)),
      remainingMs: this.pausedRemainingMs,
    });
  }

  resumeQuiz() {
    if (!this.isPaused) return;
    this.isPaused = false;

    if (this.gameState === "QUESTION") {
      const remainingMs = Math.max(1000, this.pausedRemainingMs || QUESTION_DURATION_SEC * 1000);
      this.questionStartTime = Date.now() - (QUESTION_DURATION_SEC * 1000 - remainingMs);
      this.scheduleTimer("REVEAL_ANSWER", remainingMs / 1000);
    } else if (this.savedPendingAction) {
      const remainingMs = Math.max(1000, this.pausedRemainingMs || 3000);
      this.scheduleTimer(this.savedPendingAction, remainingMs / 1000);
    }

    const currentRemainingSec = this.gameState === "QUESTION"
      ? Math.max(0, Math.ceil((this.questionStartTime + QUESTION_DURATION_SEC * 1000 - Date.now()) / 1000))
      : 0;

    this.pausedRemainingMs = 0;
    this.savedPendingAction = null;
    this.persistLiveState();
    this.broadcast({
      type: "QUIZ_RESUMED",
      isPaused: false,
      gameState: this.gameState,
      serverTime: Date.now(),
      questionStartTime: this.questionStartTime,
      remainingSec: currentRemainingSec,
    });
  }

  // Helper Methods
  getPublicQuestion(index) {
    const q = QUIZ_QUESTIONS[index];
    if (!q) return null;
    return {
      index,
      total: QUIZ_QUESTIONS.length,
      id: q.id,
      question: q.question || `${q.scenario || ""} ${q.prompt || ""}`.trim(),
      options: q.options,
      durationSec: QUESTION_DURATION_SEC,
    };
  }

  getLeaderboard() {
    if (this.finalLeaderboard?.length) {
      return {
        top10: this.finalLeaderboard.slice(0, 10),
        fullLeaderboard: this.finalLeaderboard,
        totalPlayers: this.finalLeaderboard.length,
      };
    }
    // If session is completed or in PODIUM, check SQLite player_scores for permanently settled scores
    if (this.activeSession && (this.gameState === "PODIUM" || this.activeSession.isCompleted)) {
      try {
        const rows = [
          ...this.ctx.storage.sql.exec(
            "SELECT * FROM player_scores WHERE session_id = ? ORDER BY final_rank ASC",
            this.activeSession.id
          ),
        ];
        if (rows.length > 0) {
          const settled = rows.map((r) => {
            const bestStreak = r.streak || 0;
            return {
              id: r.player_id,
              name: r.player_name,
              regNumber: r.reg_number || "",
              college: r.institution || "",
              year: r.academic_year || "",
              institution: r.institution || "",
              academicYear: r.academic_year || "",
              score: r.total_score,
              prevScore: r.total_score,
              pointsAdded: 0,
              rank: r.final_rank,
              prevRank: r.final_rank,
              streak: bestStreak,
              bestStreak,
              correctAnswers: r.correct_answers || 0,
            };
          });
          this.cacheFinalResults(settled);
          return {
            top10: settled.slice(0, 10),
            fullLeaderboard: settled,
            totalPlayers: settled.length,
          };
        }
      } catch (e) {
        console.error("Failed to read player_scores in getLeaderboard:", e);
      }
    }

    const eligible = this.getActiveParticipants();
    const sortedPrev = [...eligible].sort((a, b) => {
      const aAns = a.answers && a.answers[this.currentQuestionIdx];
      const aPts = aAns && aAns.isCorrect ? (aAns.points || 0) : 0;
      const bAns = b.answers && b.answers[this.currentQuestionIdx];
      const bPts = bAns && bAns.isCorrect ? (bAns.points || 0) : 0;
      const diff = ((b.score || 0) - bPts) - ((a.score || 0) - aPts);
      if (diff !== 0) return diff;
      return (a.name || "").localeCompare(b.name || "");
    });

    const prevRankMap = new Map();
    sortedPrev.forEach((p, idx) => prevRankMap.set(p.id, idx + 1));

    const sorted = [...eligible]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (a.name || "").localeCompare(b.name || "");
      })
      .map((p, idx) => {
        const lastAns = p.answers && p.answers[this.currentQuestionIdx];
        const pointsAdded = lastAns && lastAns.isCorrect ? (lastAns.points || 0) : 0;
        const prevScore = Math.max(0, (p.score || 0) - pointsAdded);
        const inst = p.institution || p.college || "";
        const yr = p.academicYear || p.year || "";
        return {
          id: p.id,
          name: p.name,
          regNumber: p.regNumber || "",
          college: inst,
          year: yr,
          institution: inst,
          academicYear: yr,
          score: p.score || 0,
          prevScore,
          pointsAdded,
          rank: idx + 1,
          prevRank: prevRankMap.get(p.id) || (idx + 1),
          streak: p.maxStreak || p.streak || 0,
          bestStreak: p.maxStreak || p.streak || 0,
        };
      });

    return {
      top10: sorted.slice(0, 10),
      fullLeaderboard: sorted,
      totalPlayers: sorted.length,
    };
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch (e) {}
    }
  }

  sendToHost(message) {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment();
      if (meta && meta.role === "host") {
        try {
          ws.send(payload);
        } catch (e) {}
      }
    }
  }

  getPlayerList() {
    const activeSockets = this.ctx.getWebSockets();
    // Auto-recover and re-enroll any active player sockets that are missing from this.players
    for (const ws of activeSockets) {
      const meta = ws.deserializeAttachment();
      if (meta && meta.role === "player" && meta.playerId) {
        if (!this.players.has(meta.playerId)) {
          // Avoid enrolling a duplicate if already registered by email or reg
          const cleanEmail = (meta.email || "").trim().toLowerCase();
          const cleanReg = (meta.regNumber || "").replace(/[\[\]]/g, "").trim().toUpperCase();
          const alreadyExists = cleanEmail || cleanReg
            ? Array.from(this.players.values()).some((p) => {
                const pe = (p.email || "").trim().toLowerCase();
                const pr = (p.regNumber || "").replace(/[\[\]]/g, "").trim().toUpperCase();
                return (cleanEmail && pe === cleanEmail) || (cleanReg && pr === cleanReg);
              })
            : false;
          if (!alreadyExists) {
            this.players.set(meta.playerId, {
              id: meta.playerId,
              socketId: meta.id,
              name: meta.name || "Dr. Delegate",
              regNumber: meta.regNumber || "",
              email: meta.email || "",
              institution: meta.institution || "",
              academicYear: meta.academicYear || "",
              college: meta.institution || "",
              year: meta.academicYear || "",
              score: 0,
              streak: 0,
              lastPoints: 0,
              answers: {},
              connected: true,
              lastSeen: Date.now(),
            });
            if (this.activeSession) {
              this.savePlayerToDb(this.activeSession.id, this.players.get(meta.playerId));
            }
          }
        } else {
          const p = this.players.get(meta.playerId);
          p.connected = true;
          if (meta.institution && !p.institution) p.institution = meta.institution;
          if (meta.academicYear && !p.academicYear) p.academicYear = meta.academicYear;
          p.lastSeen = Date.now();
        }
      }
    }

    const connectedPlayerIds = new Set();
    for (const s of activeSockets) {
      const m = s.deserializeAttachment();
      if (m) {
        if (m.playerId) connectedPlayerIds.add(m.playerId);
        if (m.id) connectedPlayerIds.add(m.id);
      }
    }

    const participants = this.getActiveParticipants();
    return participants.map((p) => {
      const inst = p.institution || p.college || "";
      const yr = p.academicYear || p.year || "";
      return {
        id: p.id,
        name: p.name,
        regNumber: p.regNumber || "",
        institution: inst,
        academicYear: yr,
        college: inst,
        year: yr,
        score: p.score || 0,
        streak: p.streak || 0,
        connected: connectedPlayerIds.has(p.id),
      };
    });
  }

  broadcastLobbyStatus() {
    const playerList = this.getPlayerList();
    const totalCount = playerList.length;
    const hasActiveSession = !!this.activeSession;
    const payload = JSON.stringify({
      type: "LOBBY_STATE",
      recentPlayers: playerList.slice(-25),
      totalCount,
      activeSession: this.activeSession,
      hasActiveSession,
    });
    // Participants receive only a small recent-join ticker plus the count;
    // the host receives the full roster. This keeps a 1,000-person lobby
    // responsive without losing the live-arena feeling.
    const hostPayload = JSON.stringify({
      type: "LOBBY_STATE",
      players: playerList,
      totalCount,
      activeSession: this.activeSession,
      hasActiveSession,
    });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const meta = ws.deserializeAttachment();
        if (meta && meta.role === "host") {
          ws.send(hostPayload);
        } else {
          ws.send(payload);
        }
      } catch (e) {}
    }
  }
}
