// quiz-worker/src/room.js
import { DurableObject } from "cloudflare:workers";
import { QUIZ_QUESTIONS } from "./questions.js";

const QUESTION_DURATION_SEC = 25;
const REVEAL_DURATION_SEC = 6;
const LEADERBOARD_DURATION_SEC = 6;
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
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      return;
    }

    const meta = ws.deserializeAttachment() || { id: "unknown", role: "player" };
    const socketId = meta.id;

    // 1. Host Authentication
    if (msg.type === "HOST_LOGIN") {
      if (msg.pin === HOST_PIN) {
        meta.role = "host";
        ws.serializeAttachment(meta);

        ws.send(
          JSON.stringify({
            type: "HOST_LOGIN_SUCCESS",
            gameState: this.gameState,
            currentQuestionIdx: this.currentQuestionIdx,
            totalQuestions: QUIZ_QUESTIONS.length,
            playerCount: this.players.size,
            leaderboard: this.getLeaderboard(),
            pacingMode: this.quizPacingMode,
          })
        );
      } else {
        ws.send(JSON.stringify({ type: "HOST_LOGIN_FAILED", error: "Invalid Host PIN" }));
      }
      return;
    }

    // 2. Player Join
    if (msg.type === "JOIN") {
      const name = (msg.name || "Dr. Delegate").trim();
      const regNumber = (msg.regNumber || "").trim().toUpperCase();

      let player = this.players.get(socketId);
      if (!player) {
        player = {
          id: socketId,
          name,
          regNumber,
          score: 0,
          streak: 0,
          lastPoints: 0,
          answers: {},
        };
        this.players.set(socketId, player);
      } else {
        player.name = name;
        player.regNumber = regNumber;
      }

      ws.send(
        JSON.stringify({
          type: "JOINED_SUCCESS",
          player: { id: player.id, name: player.name, regNumber: player.regNumber },
          gameState: this.gameState,
          currentQuestionIdx: this.currentQuestionIdx,
          totalQuestions: QUIZ_QUESTIONS.length,
          pacingMode: this.quizPacingMode,
        })
      );

      // Catch up if question is actively running
      if (this.gameState === "QUESTION") {
        ws.send(
          JSON.stringify({
            type: "QUESTION_START",
            question: this.getPublicQuestion(this.currentQuestionIdx),
            serverTime: Date.now(),
            pacingMode: this.quizPacingMode,
          })
        );
      }

      this.broadcastLobbyStatus();
      return;
    }

    // 3. Player Submits Answer
    if (msg.type === "SUBMIT_ANSWER") {
      const player = this.players.get(socketId);
      if (!player || this.gameState !== "QUESTION") return;

      const qIdx = msg.questionIndex;
      if (qIdx !== this.currentQuestionIdx) return;
      if (player.answers[qIdx]) return; // prevent duplicate clicks

      const elapsedMs = Math.max(0, Date.now() - this.questionStartTime);
      const q = QUIZ_QUESTIONS[qIdx];
      const isCorrect = msg.optionKey === q.correctAnswer;

      // Speed scoring: 500 base + speed proportion up to 500 + streak bonus
      let points = 0;
      if (isCorrect) {
        const totalMs = QUESTION_DURATION_SEC * 1000;
        const remainingFraction = Math.max(0, (totalMs - elapsedMs) / totalMs);
        points = Math.round(500 + remainingFraction * 500);

        player.streak = (player.streak || 0) + 1;
        if (player.streak > 1) {
          points += Math.min(150, (player.streak - 1) * 50);
        }
      } else {
        player.streak = 0;
      }

      player.score += points;
      player.lastPoints = points;
      player.answers[qIdx] = {
        optionKey: msg.optionKey,
        elapsedMs,
        points,
        isCorrect,
      };

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

      this.sendToHost({
        type: "LIVE_ANSWER_COUNT",
        count: answerCount,
        total: this.players.size,
      });

      // If all connected players have answered, reveal immediately
      if (answerCount >= this.players.size && this.players.size > 0) {
        this.revealAnswer();
      }
      return;
    }

    // 4. Host Actions
    if (msg.type === "HOST_ACTION") {
      if (meta.role !== "host" && msg.pin !== HOST_PIN) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Unauthorized host action" }));
        return;
      }

      switch (msg.action) {
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
    const meta = ws.deserializeAttachment();
    if (meta && meta.id && this.players.has(meta.id)) {
      this.players.delete(meta.id);
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
      } else if (this.players.has(meta.id)) {
        const p = this.players.get(meta.id);
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

    // Auto-Advance: Smoothly transition to Leaderboard after 6s
    if (this.quizPacingMode === "auto") {
      this.scheduleTimer("SHOW_LEADERBOARD", REVEAL_DURATION_SEC);
    }
  }

  showLeaderboard() {
    this.clearAllTimers();
    this.gameState = "LEADERBOARD";
    const leaderboard = this.getLeaderboard();

    // Send personalized ranks
    const sorted = Array.from(this.players.values()).sort((a, b) => b.score - a.score);
    const rankMap = new Map();
    sorted.forEach((p, idx) => rankMap.set(p.id, idx + 1));

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
      } else if (this.players.has(meta.id)) {
        const p = this.players.get(meta.id);
        ws.send(
          JSON.stringify({
            type: "LEADERBOARD_VIEW",
            rank: rankMap.get(p.id) || 1,
            totalScore: p.score,
            streak: p.streak,
            top10: leaderboard.top10,
            totalPlayers: leaderboard.totalPlayers,
            pacingMode: this.quizPacingMode,
            autoNextSec: this.quizPacingMode === "auto" ? LEADERBOARD_DURATION_SEC : 0,
          })
        );
      }
    }

    // Auto-Advance: Smoothly transition to Next Question or Podium after 6s
    if (this.quizPacingMode === "auto") {
      const isLast = this.currentQuestionIdx + 1 >= QUIZ_QUESTIONS.length;
      this.scheduleTimer(isLast ? "END_QUIZ" : "NEXT_QUESTION", LEADERBOARD_DURATION_SEC);
    }
  }

  endQuiz() {
    this.clearAllTimers();
    this.gameState = "PODIUM";
    const leaderboard = this.getLeaderboard();

    this.broadcast({
      type: "QUIZ_FINISHED",
      podium: leaderboard.top10.slice(0, 3),
      fullLeaderboard: leaderboard.top10,
      pacingMode: this.quizPacingMode,
    });
  }

  resetQuiz() {
    this.clearAllTimers();
    this.gameState = "LOBBY";
    this.currentQuestionIdx = 0;
    this.questionStartTime = 0;

    for (const p of this.players.values()) {
      p.score = 0;
      p.streak = 0;
      p.lastPoints = 0;
      p.answers = {};
    }

    this.broadcast({ type: "RESET_TO_LOBBY" });
    this.broadcastLobbyStatus();
  }

  // Alarms & Timers for Auto-Advance
  scheduleTimer(action, delaySec) {
    this.clearAllTimers();
    this.pendingAction = action;

    // Both in-memory timeout and Durable Object Alarm for maximum reliability
    this.activeTimer = setTimeout(() => {
      this.executeAction(action);
    }, delaySec * 1000);

    try {
      this.ctx.storage.setAlarm(Date.now() + delaySec * 1000);
    } catch (e) {
      // ignore
    }
  }

  async alarm() {
    if (this.pendingAction) {
      const action = this.pendingAction;
      this.pendingAction = null;
      this.executeAction(action);
    }
  }

  executeAction(action) {
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
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    this.pendingAction = null;
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
      specialty: q.specialty,
      title: q.title,
      scenario: q.scenario,
      prompt: q.prompt,
      options: q.options,
      durationSec: QUESTION_DURATION_SEC,
    };
  }

  getLeaderboard() {
    const sorted = Array.from(this.players.values())
      .sort((a, b) => b.score - a.score)
      .map((p) => ({
        id: p.id,
        name: p.name,
        regNumber: p.regNumber,
        score: p.score,
        streak: p.streak,
      }));

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

  broadcastLobbyStatus() {
    const playerList = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      regNumber: p.regNumber,
    }));

    this.broadcast({
      type: "LOBBY_STATE",
      players: playerList,
      totalCount: playerList.length,
    });
  }
}
