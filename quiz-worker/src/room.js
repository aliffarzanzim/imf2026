// quiz-worker/src/room.js
import { DurableObject } from "cloudflare:workers";
import { QUIZ_QUESTIONS } from "./questions.js";

const QUESTION_DURATION_SEC = 25;
const REVEAL_DURATION_SEC = 4;
const LEADERBOARD_DURATION_SEC = 5;
const HOST_PIN = "2026";

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

      const rows = [...this.ctx.storage.sql.exec("SELECT id, name, is_active, is_completed, completed_at, created_at FROM sessions ORDER BY created_at DESC")];
      if (rows.length === 0) {
        const defaultId = "session_" + Date.now().toString(36);
        this.ctx.storage.sql.exec(
          "INSERT INTO sessions (id, name, is_active, is_completed, created_at) VALUES (?, ?, 1, 0, ?)",
          defaultId,
          "IMF 2026 Clinical Grand Arena",
          Date.now()
        );
        this.sessions = [{
          id: defaultId,
          name: "IMF 2026 Clinical Grand Arena",
          isActive: true,
          isCompleted: false,
          completedAt: null,
          createdAt: Date.now(),
        }];
        this.activeSession = this.sessions[0];
      } else {
        this.sessions = rows.map((r) => ({
          id: r.id,
          name: r.name,
          isActive: Boolean(r.is_active),
          isCompleted: Boolean(r.is_completed),
          completedAt: r.completed_at || null,
          createdAt: r.created_at,
        }));
        this.activeSession = this.sessions.find((s) => s.isActive) || null;
      }

      // If active session was already completed, restore its permanent state and player scores
      if (this.activeSession && this.activeSession.isCompleted) {
        this.gameState = "PODIUM";
        this.restoreCompletedSessionScores(this.activeSession.id);
      } else if (this.activeSession) {
        this.loadLobbyPlayers(this.activeSession.id);
      }
    } catch (e) {
      console.error("Failed to initialize sessions table:", e);
      this.sessions = [{
        id: "session_default",
        name: "IMF 2026 Clinical Grand Arena",
        isActive: true,
        isCompleted: false,
        completedAt: null,
        createdAt: Date.now(),
      }];
      this.activeSession = this.sessions[0];
    }
  }

  loadLobbyPlayers(sessionId) {
    if (!sessionId) return;
    try {
      const rows = [
        ...this.ctx.storage.sql.exec(
          "SELECT player_id, name, reg_number, email, score, streak, connected, last_seen FROM lobby_players WHERE session_id = ?",
          sessionId
        ),
      ];
      const activeSockets = this.ctx.getWebSockets();
      for (const r of rows) {
        const hasSocket = activeSockets.some((s) => {
          const m = s.deserializeAttachment();
          return m && (m.playerId === r.player_id || m.id === r.player_id);
        });

        // In active LOBBY state, only load if active socket or seen within last 30 seconds
        if (this.gameState === "LOBBY" && !hasSocket && Date.now() - (r.last_seen || 0) > 30000) {
          continue;
        }

        if (!this.players.has(r.player_id)) {
          this.players.set(r.player_id, {
            id: r.player_id,
            name: r.name,
            regNumber: r.reg_number || "",
            email: r.email || "",
            score: r.score || 0,
            streak: r.streak || 0,
            lastPoints: 0,
            answers: {},
            connected: hasSocket,
            lastSeen: r.last_seen || Date.now(),
          });
        } else {
          const p = this.players.get(r.player_id);
          p.connected = hasSocket;
          if (r.email && !p.email) p.email = r.email;
        }
      }
    } catch (e) {
      console.error("Failed to load lobby players:", e);
    }
  }

  savePlayerToDb(sessionId, player) {
    if (!sessionId || !player) return;
    try {
      this.ctx.storage.sql.exec(
        `INSERT OR REPLACE INTO lobby_players (session_id, player_id, name, reg_number, email, score, streak, connected, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        sessionId,
        player.id,
        player.name,
        player.regNumber || "",
        player.email || "",
        player.score || 0,
        player.streak || 0,
        player.connected ? 1 : 0,
        player.lastSeen || Date.now()
      );
    } catch (e) {}
  }

  deletePlayerFromDb(sessionId, playerId) {
    if (!sessionId || !playerId) return;
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
      const rows = [...this.ctx.storage.sql.exec("SELECT player_id, player_name, reg_number, total_score, streak, final_rank FROM player_scores WHERE session_id = ? ORDER BY final_rank ASC", sessionId)];
      for (const r of rows) {
        this.players.set(r.player_id, {
          id: r.player_id,
          name: r.player_name,
          regNumber: r.reg_number,
          score: r.total_score,
          streak: r.streak || 0,
          finalRank: r.final_rank,
          lastPoints: 0,
          answers: {},
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
          ('questionStartTime', ?)`,
        this.gameState || "LOBBY",
        String(this.currentQuestionIdx || 0),
        this.quizPacingMode || "auto",
        this.pendingAction || "",
        String(this.pendingDueTime || 0),
        String(this.questionStartTime || 0)
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
      if (map.has("pendingAction") && map.get("pendingAction")) {
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
      this.activeSession = this.sessions.find((s) => s.id === id) || null;
      this.resetQuiz();
      this.broadcastLobbyActivated();
    } else {
      this.activeSession = this.sessions.find((s) => s.isActive) || null;
    }

    this.broadcastSessionsUpdated();
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
      this.broadcastSessionsUpdated();
      this.endQuiz();
    } else {
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
    this.players.clear();
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
    } catch (e) {}

    this.sessions = this.getAllSessions();

    if (wasActive || this.sessions.length === 0 || !this.activeSession) {
      this.activeSession = null;
      this.clearAllTimers();
      this.gameState = "LOBBY";
      this.currentQuestionIdx = 0;
      this.questionStartTime = 0;
      this.players.clear();
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
      try {
        ws.send(JSON.stringify({ type: "PONG" }));
      } catch (e) {}
      return;
    }

    // Handle Explicit Tab Close / Leave Page
    if (msg.type === "LEAVE") {
      const pId = msg.playerId || meta.playerId;
      try {
        ws.serializeAttachment({ role: "closed", playerId: null, email: null });
        ws.close(1000, "Normal leave");
      } catch (e) {}
      if (pId && this.players.has(pId)) {
        const p = this.players.get(pId);
        p.connected = false;
        p.lastSeen = Date.now();
        if (this.gameState === "LOBBY") {
          this.players.delete(pId);
          if (this.activeSession) {
            this.deletePlayerFromDb(this.activeSession.id, pId);
          }
          this.broadcastLobbyStatus();
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

    // 1. Host Authentication
    if (msg.type === "HOST_LOGIN") {
      const attempts = meta.failedPins || 0;
      if (attempts >= 5) {
        ws.send(JSON.stringify({ type: "HOST_LOGIN_FAILED", error: "Too many failed PIN attempts. Connection locked." }));
        ws.close(1008, "Rate limit exceeded");
        return;
      }

      if (msg.pin === HOST_PIN) {
        meta.role = "host";
        meta.failedPins = 0;
        ws.serializeAttachment(meta);

        // If there is NO active session, Host MUST see clean LOBBY state!
        if (!this.activeSession) {
          this.gameState = "LOBBY";
          this.currentQuestionIdx = 0;
          this.clearAllTimers();
          ws.send(
            JSON.stringify({
              type: "HOST_LOGIN_SUCCESS",
              gameState: "LOBBY",
              currentQuestionIdx: 0,
              totalQuestions: QUIZ_QUESTIONS.length,
              playerCount: 0,
              players: [],
              leaderboard: { top10: [], totalPlayers: 0 },
              pacingMode: this.quizPacingMode,
              sessions: this.sessions,
              activeSession: null,
            })
          );
          ws.send(
            JSON.stringify({
              type: "LOBBY_STATE",
              players: [],
              totalCount: 0,
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
        if (this.gameState === "QUESTION") {
          const q = this.getPublicQuestion(this.currentQuestionIdx);
          const remainingSec = this.pendingDueTime ? Math.max(1, Math.round((this.pendingDueTime - Date.now()) / 1000)) : QUESTION_DURATION_SEC;
          ws.send(
            JSON.stringify({
              type: "QUESTION_START",
              question: { ...q, durationSec: remainingSec },
              serverTime: Date.now(),
              pacingMode: this.quizPacingMode,
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
            })
          );
        } else if (this.gameState === "LEADERBOARD") {
          const lb = this.getLeaderboard();
          const remainingSec = this.pendingDueTime ? Math.max(0, Math.round((this.pendingDueTime - Date.now()) / 1000)) : 0;
          let pStats = {};
          if (meta.role !== "host") {
            const pId = meta.playerId || meta.id;
            const p = this.players.get(pId);
            if (p) {
              const lastAns = p.answers && p.answers[this.currentQuestionIdx];
              const pointsAdded = lastAns && lastAns.isCorrect ? (lastAns.points || 0) : 0;
              const prevScore = Math.max(0, (p.score || 0) - pointsAdded);
              const myEntry = lb.top10.find((x) => x.id === p.id);
              pStats = {
                rank: myEntry ? myEntry.rank : 1,
                prevRank: myEntry ? myEntry.prevRank : 1,
                totalScore: p.score,
                prevScore,
                pointsAdded,
                streak: p.streak,
              };
            }
          }
          ws.send(
            JSON.stringify({
              type: "LEADERBOARD_VIEW",
              top10: lb.top10,
              totalPlayers: lb.totalPlayers,
              pacingMode: this.quizPacingMode,
              autoNextSec: remainingSec,
              ...pStats,
            })
          );
        } else if (this.gameState === "PODIUM" || (this.activeSession && this.activeSession.isCompleted)) {
          const lb = this.getLeaderboard();
          ws.send(
            JSON.stringify({
              type: "QUIZ_FINISHED",
              podium: lb.top10.slice(0, 3),
              fullLeaderboard: lb.top10,
              session: this.activeSession,
              totalPlayers: this.players.size,
            })
          );
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
      const playerId = msg.playerId || socketId;

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
                // Check if other socket is genuinely responsive (ping received within last 6 seconds or joined within last 6 seconds)
                const lastHeard = otherMeta.lastPing || otherMeta.joinedAt || 0;
                const isAlive = (now - lastHeard) < 6000;
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
      meta.joinedAt = Date.now();
      meta.lastPing = Date.now();
      ws.serializeAttachment(meta);

      let player = this.players.get(playerId);

      // If not found by playerId, search for existing player by registered email or regNumber
      // (Applies when the doctor was previously live from another device, and that device is now closed)
      if (!player) {
        for (const existing of this.players.values()) {
          const matchEmail = email && existing.email && existing.email.toLowerCase() === email;
          const matchReg = regNumber && existing.regNumber && existing.regNumber.toUpperCase() === regNumber;
          if (matchEmail || matchReg) {
            player = existing;
            this.players.delete(existing.id);
            break;
          }
        }
      }

      const isReconnected = !!player;

      if (player) {
        // Reconnecting or transferring from a closed device:
        // Update device playerId, socket ID, refresh details, maintain score, streak, and answers
        player.id = playerId;
        player.socketId = socketId;
        if (name) player.name = name;
        if (regNumber) player.regNumber = regNumber;
        if (email) player.email = email;
        player.connected = true;
        player.lastSeen = Date.now();
      } else {
        // New player: starts fresh at 0 points
        player = {
          id: playerId,
          socketId,
          name,
          regNumber,
          email,
          score: 0,
          streak: 0,
          lastPoints: 0,
          answers: {},
          connected: true,
          lastSeen: Date.now(),
        };
      }
      this.players.set(playerId, player);

      // Persist to SQLite lobby_players
      if (this.activeSession) {
        this.savePlayerToDb(this.activeSession.id, player);
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
        this.broadcastLobbyStatus();
        return;
      }

      ws.send(
        JSON.stringify({
          type: "JOINED_SUCCESS",
          session: this.activeSession,
          player: { id: player.id, name: player.name, regNumber: player.regNumber, score: player.score, streak: player.streak },
          gameState: this.gameState,
          currentQuestionIdx: this.currentQuestionIdx,
          totalQuestions: QUIZ_QUESTIONS.length,
          pacingMode: this.quizPacingMode,
          isReconnected,
        })
      );

      // If a question is actively running, let late joiner jump in on the active question
      if (this.gameState === "QUESTION") {
        const remainingSec = this.pendingDueTime ? Math.max(1, Math.round((this.pendingDueTime - Date.now()) / 1000)) : QUESTION_DURATION_SEC;
        const pubQ = this.getPublicQuestion(this.currentQuestionIdx);
        ws.send(
          JSON.stringify({
            type: "QUESTION_START",
            question: { ...pubQ, durationSec: remainingSec },
            serverTime: Date.now(),
            pacingMode: this.quizPacingMode,
          })
        );
      }

      // If quiz is finished (PODIUM) or session is completed, immediately send their personalized final results!
      if (this.gameState === "PODIUM" || (this.activeSession && this.activeSession.isCompleted)) {
        const resultData = this.getParticipantFinalResult(player.id, player.name, player.regNumber);
        ws.send(
          JSON.stringify({
            type: "QUIZ_FINISHED",
            ...resultData,
            pacingMode: this.quizPacingMode,
          })
        );
      }

      this.broadcastLobbyStatus();
      return;
    }

    // 3. Player Submits Answer (Kahoot speed + streak scoring, NO negative marking)
    if (msg.type === "SUBMIT_ANSWER") {
      const pId = msg.playerId || meta.playerId || socketId;
      let player = this.players.get(pId) || (meta.playerId ? this.players.get(meta.playerId) : null) || this.players.get(socketId);
      
      // Auto-register player if missing so they appear on scoreboard immediately
      if (!player) {
        player = {
          id: pId,
          socketId,
          name: (msg.name || "Dr. Delegate").trim().slice(0, 40),
          regNumber: (msg.regNumber || "").trim().toUpperCase().slice(0, 15),
          score: 0,
          streak: 0,
          lastPoints: 0,
          answers: {},
          connected: true,
          lastSeen: Date.now(),
        };
        this.players.set(pId, player);
        if (this.activeSession) {
          this.savePlayerToDb(this.activeSession.id, player);
        }
      }

      if (this.gameState !== "QUESTION") return;

      const qIdx = msg.questionIndex;
      if (qIdx !== this.currentQuestionIdx) return;
      if (player.answers[qIdx]) return; // prevent duplicate clicks

      // Only allow valid options A, B, C, D
      const validOptions = ["A", "B", "C", "D"];
      if (!validOptions.includes(msg.optionKey)) return;

      const elapsedMs = Math.max(0, Date.now() - this.questionStartTime);
      const q = QUIZ_QUESTIONS[qIdx];
      const isCorrect = msg.optionKey === q.correctAnswer;

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

      // Persist updated player state to SQLite
      if (this.activeSession) {
        this.savePlayerToDb(this.activeSession.id, player);
      }

      ws.send(
        JSON.stringify({
          type: "ANSWER_ACK",
          questionIndex: qIdx,
          optionKey: msg.optionKey,
          receivedAt: Date.now(),
        })
      );

      // Notify Host with live count
      let answerCount = 0;
      for (const p of this.players.values()) {
        if (p.answers[qIdx]) answerCount++;
      }

      const connectedCount = Array.from(this.players.values()).filter((p) => p.connected !== false).length;

      this.sendToHost({
        type: "LIVE_ANSWER_COUNT",
        count: answerCount,
        total: connectedCount || this.players.size,
      });

      // If all connected active players have answered, reveal immediately
      if (answerCount >= connectedCount && connectedCount > 0) {
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
          this.startQuestion(0);
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
        case "SET_PACING_MODE":
          this.quizPacingMode = msg.mode === "manual" ? "manual" : "auto";
          if (this.quizPacingMode === "manual") {
            this.clearAllTimers();
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

        // In LOBBY state:
        // Grace period of 3.5s to distinguish between page reload and genuinely leaving the page.
        if (this.gameState === "LOBBY") {
          setTimeout(() => {
            const currentSockets = this.ctx.getWebSockets();
            const reconnected = currentSockets.some((s) => {
              const m = s.deserializeAttachment();
              return (
                m &&
                (m.playerId === pId ||
                  m.id === pId ||
                  (email && m.email && m.email.toLowerCase() === email.toLowerCase()))
              );
            });

            if (!reconnected && this.gameState === "LOBBY") {
              this.players.delete(pId);
              if (this.activeSession) {
                this.deletePlayerFromDb(this.activeSession.id, pId);
              }
              this.broadcastLobbyStatus();
            }
          }, 3500);
        }
      }
    }

    if (this.gameState === "LOBBY") {
      this.broadcastLobbyStatus();
    }
  }

  async webSocketError(ws, error) {
    ws.close(1011, "WebSocket error");
  }

  // Game Engine State Transitions
  startQuestion(index) {
    if (index < 0 || index >= QUIZ_QUESTIONS.length) {
      this.endQuiz();
      return;
    }

    this.clearAllTimers();
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

    // Schedule Question Countdown Expiration (25 seconds)
    this.scheduleTimer("REVEAL_ANSWER", QUESTION_DURATION_SEC);
  }

  revealAnswer() {
    this.clearAllTimers();
    this.gameState = "ANSWER_REVEAL";
    this.persistLiveState();

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

  showLeaderboard() {
    this.clearAllTimers();
    this.gameState = "LEADERBOARD";
    this.persistLiveState();
    const leaderboard = this.getLeaderboard();

    // Send personalized ranks
    const sorted = Array.from(this.players.values()).sort((a, b) => b.score - a.score);
    const rankMap = new Map();
    sorted.forEach((p, idx) => rankMap.set(p.id, idx + 1));

    const sortedPrev = Array.from(this.players.values()).sort((a, b) => {
      const aAns = a.answers && a.answers[this.currentQuestionIdx];
      const aPts = aAns && aAns.isCorrect ? (aAns.points || 0) : 0;
      const bAns = b.answers && b.answers[this.currentQuestionIdx];
      const bPts = bAns && bAns.isCorrect ? (bAns.points || 0) : 0;
      return ((b.score || 0) - bPts) - ((a.score || 0) - aPts);
    });

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
          })
        );
      } else {
        const pId = meta.playerId || meta.id;
        const p = this.players.get(pId);
        if (p) {
          const lastAns = p.answers && p.answers[this.currentQuestionIdx];
          const pointsAdded = lastAns && lastAns.isCorrect ? (lastAns.points || 0) : 0;
          const prevScore = Math.max(0, (p.score || 0) - pointsAdded);
          const prevRank = sortedPrev.findIndex((x) => x.id === p.id) + 1;
          const currentRank = rankMap.get(p.id) || 1;

          ws.send(
            JSON.stringify({
              type: "LEADERBOARD_VIEW",
              rank: currentRank,
              prevRank: prevRank || currentRank,
              totalScore: p.score,
              prevScore,
              pointsAdded,
              streak: p.streak,
              top10: leaderboard.top10,
              totalPlayers: leaderboard.totalPlayers,
              pacingMode: this.quizPacingMode,
              autoNextSec: this.quizPacingMode === "auto" ? LEADERBOARD_DURATION_SEC : 0,
            })
          );
        }
      }
    }

    // Auto-Advance: Smoothly transition to Next Question or Podium after 6s
    if (this.quizPacingMode === "auto") {
      const isLast = this.currentQuestionIdx + 1 >= QUIZ_QUESTIONS.length;
      this.scheduleTimer(isLast ? "END_QUIZ" : "NEXT_QUESTION", LEADERBOARD_DURATION_SEC);
    }
  }

  getParticipantFinalResult(playerId, name, regNumber) {
    const sorted = Array.from(this.players.values())
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
        score: p.score,
        streak: p.streak || 0,
      }));

    const totalPlayers = sorted.length;
    const podium = sorted.slice(0, 3);

    // Find index of this participant
    let myIndex = -1;
    if (playerId) {
      myIndex = sorted.findIndex((p) => p.id === playerId);
    }
    if (myIndex === -1 && regNumber) {
      myIndex = sorted.findIndex(
        (p) => p.regNumber && p.regNumber.toUpperCase() === regNumber.toUpperCase()
      );
    }
    if (myIndex === -1 && name) {
      myIndex = sorted.findIndex(
        (p) => (p.name || "").trim().toLowerCase() === name.trim().toLowerCase()
      );
    }

    if (myIndex === -1) {
      return {
        rank: totalPlayers + 1,
        totalScore: 0,
        streak: 0,
        podium,
        above5: sorted.slice(Math.max(0, totalPlayers - 5), totalPlayers),
        me: {
          rank: totalPlayers + 1,
          id: playerId,
          name: name || "Dr. Delegate",
          regNumber: regNumber || "",
          score: 0,
          streak: 0,
        },
        below5: [],
        surrounding: sorted.slice(Math.max(0, totalPlayers - 5), totalPlayers),
        totalPlayers,
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
      streak: me.streak,
      podium,
      above5,
      me,
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

    const sorted = Array.from(this.players.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.streak || 0) !== (a.streak || 0)) return (b.streak || 0) - (a.streak || 0);
      return (a.name || "").localeCompare(b.name || "");
    });

    if (this.activeSession) {
      try {
        for (let i = 0; i < sorted.length; i++) {
          const p = sorted[i];
          const rank = i + 1;
          p.finalRank = rank;
          this.ctx.storage.sql.exec(
            `INSERT OR REPLACE INTO player_scores (session_id, player_id, player_name, reg_number, total_score, streak, final_rank)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            this.activeSession.id,
            p.id,
            p.name,
            p.regNumber || "",
            p.score,
            p.streak || 0,
            rank
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
            fullLeaderboard: sorted.map((p, idx) => ({
              rank: idx + 1,
              id: p.id,
              name: p.name,
              regNumber: p.regNumber,
              score: p.score,
              streak: p.streak || 0,
            })),
            session: this.activeSession,
            totalPlayers: sorted.length,
            pacingMode: this.quizPacingMode,
          })
        );
      } else {
        const pId = meta.playerId || meta.id;
        const player = this.players.get(pId);
        const name = player ? player.name : "";
        const reg = player ? player.regNumber : "";
        const result = this.getParticipantFinalResult(pId, name, reg);

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

    if (action === "REVEAL_ANSWER" && this.gameState === "QUESTION") {
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
    const sortedPrev = Array.from(this.players.values()).sort((a, b) => {
      const aAns = a.answers && a.answers[this.currentQuestionIdx];
      const aPts = aAns && aAns.isCorrect ? (aAns.points || 0) : 0;
      const bAns = b.answers && b.answers[this.currentQuestionIdx];
      const bPts = bAns && bAns.isCorrect ? (bAns.points || 0) : 0;
      return ((b.score || 0) - bPts) - ((a.score || 0) - aPts);
    });

    const prevRankMap = new Map();
    sortedPrev.forEach((p, idx) => prevRankMap.set(p.id, idx + 1));

    const sorted = Array.from(this.players.values())
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => {
        const lastAns = p.answers && p.answers[this.currentQuestionIdx];
        const pointsAdded = lastAns && lastAns.isCorrect ? (lastAns.points || 0) : 0;
        const prevScore = Math.max(0, (p.score || 0) - pointsAdded);
        return {
          id: p.id,
          name: p.name,
          regNumber: p.regNumber || "",
          score: p.score || 0,
          prevScore,
          pointsAdded,
          rank: idx + 1,
          prevRank: prevRankMap.get(p.id) || (idx + 1),
          streak: p.streak || 0,
        };
      });

    return {
      top10: sorted.slice(0, 10),
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
    return Array.from(this.players.values())
      .filter((p) => {
        if (this.gameState === "LOBBY") {
          return p.connected !== false || (Date.now() - (p.lastSeen || 0) < 4000);
        }
        return true;
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        regNumber: p.regNumber || "",
        score: p.score || 0,
        streak: p.streak || 0,
        connected: p.connected !== false,
      }));
  }

  broadcastLobbyStatus() {
    const playerList = this.getPlayerList();

    this.broadcast({
      type: "LOBBY_STATE",
      players: playerList,
      totalCount: playerList.length,
      activeSession: this.activeSession,
      hasActiveSession: !!this.activeSession,
    });
  }
}
