// src/pages/QuizMaster.jsx
import React, { useState, useEffect, useRef } from "react";
import { QUIZ_QUESTIONS } from "../data/quizQuestions";
import {
  playSelectSound,
  playTickSound,
  playCorrectSound,
  playIncorrectSound,
  playFanfareSound,
} from "../utils/quizAudio";
import { adminLogin, adminLogout, isAdminAuthed } from "../utils/api";
import { AnimatedScoreboardList } from "../components/quiz/AnimatedScoreboard";

const KAHOOT_OPTION_THEMES = {
  A: { bg: "bg-[#e21b3c]", border: "border-[#b0132c]", shape: "▲" },
  B: { bg: "bg-[#1368ce]", border: "border-[#0d478d]", shape: "◆" },
  C: { bg: "bg-[#d89e00]", border: "border-[#966d00]", shape: "●" },
  D: { bg: "bg-[#26890c]", border: "border-[#195a07]", shape: "■" },
  E: { bg: "bg-[#864cbf]", border: "border-[#5c3088]", shape: "★" },
};

const DEFAULT_WS_URL = "wss://imf2026-quiz.crcck.workers.dev/ws";
const QUESTION_TIMER_SEC = 25;

export function QuizMaster() {
  const [authed, setAuthed] = useState(isAdminAuthed());
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Connection & Host State
  const [wsConnected, setWsConnected] = useState(false);
  const [wsUrl, setWsUrl] = useState(() => {
    return (
      localStorage.getItem("imf_quiz_ws") ||
      (typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? DEFAULT_WS_URL
        : "")
    );
  });
  const [hostPin, setHostPin] = useState("2026");
  const [hostAuthed, setHostAuthed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [muted, setMuted] = useState(false);

  // Game Sync State
  const [gameState, setGameState] = useState("LOBBY"); // LOBBY, QUESTION, ANSWER_REVEAL, LEADERBOARD, PODIUM
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIMER_SEC);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [revealStats, setRevealStats] = useState(null);
  const [liveAnswerCount, setLiveAnswerCount] = useState(0);
  const [pacingMode, setPacingMode] = useState("auto"); // "auto" or "manual"
  const [stageCountdown, setStageCountdown] = useState(0);

  // Session & Lobby Management State
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [newSessionName, setNewSessionName] = useState("");
  const [autoActivateNew, setAutoActivateNew] = useState(true);
  const [showSessionModal, setShowSessionModal] = useState(false);

  const wsRef = useRef(null);
  const timerRef = useRef(null);

  // Stage countdown for auto-advance in ANSWER_REVEAL and LEADERBOARD
  useEffect(() => {
    if (stageCountdown <= 0) return;
    const interval = setInterval(() => {
      setStageCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [stageCountdown]);

  // Check auth on mount
  useEffect(() => {
    setAuthed(isAdminAuthed());
  }, []);

  // Auto-fetch active tunnel URL from /api/quiz-config
  useEffect(() => {
    if (!authed) return;

    let isMounted = true;
    async function fetchConfig() {
      try {
        const res = await fetch("/api/quiz-config");
        if (res.ok) {
          const data = await res.json();
          if (data.ws_url && isMounted) {
            setWsUrl((prev) => {
              if (prev !== data.ws_url) {
                localStorage.setItem("imf_quiz_ws", data.ws_url);
                return data.ws_url;
              }
              return prev;
            });
            return;
          }
        }
      } catch (err) {
        // ignore
      }

      if (
        isMounted &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ) {
        setWsUrl((prev) => prev || DEFAULT_WS_URL);
      }
    }

    fetchConfig();

    const poll = setInterval(() => {
      if (!wsConnected && isMounted) {
        fetchConfig();
      }
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(poll);
    };
  }, [authed, wsConnected]);

  // WebSocket Connection for Host
  useEffect(() => {
    if (!authed || !wsUrl) return;

    let isUnmounted = false;
    let ws = null;

    function connect() {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isUnmounted) return;
          setWsConnected(true);
          ws.send(JSON.stringify({ type: "HOST_LOGIN", pin: hostPin }));
        };

        ws.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const msg = JSON.parse(event.data);
            handleServerMessage(msg);
          } catch (e) {
            console.error("Failed to parse WS msg", e);
          }
        };

        ws.onclose = () => {
          if (isUnmounted) return;
          setWsConnected(false);
          if (wsUrl !== DEFAULT_WS_URL) {
            console.log("[WS] Tunnel unreachable, falling back to localhost:", DEFAULT_WS_URL);
            setWsUrl(DEFAULT_WS_URL);
          } else {
            setTimeout(connect, 3000);
          }
        };

        ws.onerror = (err) => {
          console.warn("[WS] Error encountered", err);
          ws.close();
        };
      } catch (e) {
        setWsConnected(false);
      }
    }

    connect();

    return () => {
      isUnmounted = true;
      if (ws) ws.close();
    };
  }, [authed, wsUrl, hostPin]);

  function handleServerMessage(msg) {
    switch (msg.type) {
      case "HOST_LOGIN_SUCCESS":
        setHostAuthed(true);
        setGameState(msg.gameState || "LOBBY");
        setCurrentQIndex(msg.currentQuestionIdx || 0);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        if (msg.players) setLobbyPlayers(msg.players);
        if (msg.sessions) setSessions(msg.sessions);
        if (msg.activeSession !== undefined) setActiveSession(msg.activeSession);
        break;

      case "PACING_MODE_UPDATED":
        setPacingMode(msg.pacingMode || "auto");
        if (msg.pacingMode === "manual") setStageCountdown(0);
        break;

      case "HOST_LOGIN_FAILED":
        alert("Incorrect Host PIN. Default is 2026.");
        break;

      case "LOBBY_STATE":
        setLobbyPlayers(msg.players || []);
        if (msg.sessions) setSessions(msg.sessions);
        if (msg.activeSession !== undefined) setActiveSession(msg.activeSession);
        break;

      case "SESSIONS_UPDATED":
        if (msg.sessions) setSessions(msg.sessions);
        setActiveSession(msg.activeSession || null);
        break;

      case "LOBBY_ACTIVATED":
        setActiveSession(msg.session || null);
        setGameState(msg.gameState || "LOBBY");
        setCurrentQIndex(msg.currentQuestionIdx || 0);
        break;

      case "LOBBY_INACTIVATED":
        setActiveSession(null);
        break;

      case "QUESTION_START":
        setGameState("QUESTION");
        setCurrentQIndex(msg.question.index);
        setTimeLeft(msg.question.durationSec || QUESTION_TIMER_SEC);
        setRevealStats(null);
        setLiveAnswerCount(0);
        setStageCountdown(0);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        startClientTimer(msg.question.durationSec || QUESTION_TIMER_SEC);
        break;

      case "LIVE_ANSWER_COUNT":
        setLiveAnswerCount(msg.count || 0);
        break;

      case "HOST_REVEAL":
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState("ANSWER_REVEAL");
        setRevealStats(msg.stats);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        setStageCountdown(msg.autoNextSec || (msg.pacingMode === "auto" ? 6 : 0));
        break;

      case "LEADERBOARD_VIEW":
        setGameState("LEADERBOARD");
        setLeaderboardData(msg.top10 || []);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        setStageCountdown(msg.autoNextSec || (msg.pacingMode === "auto" ? 6 : 0));
        break;

      case "QUIZ_FINISHED":
        setGameState("PODIUM");
        setLeaderboardData(msg.fullLeaderboard || []);
        setStageCountdown(0);
        playFanfareSound(muted);
        break;

      case "RESET_TO_LOBBY":
        setGameState("LOBBY");
        setStageCountdown(0);
        break;

      default:
        break;
    }
  }

  function startClientTimer(sec) {
    if (timerRef.current) clearInterval(timerRef.current);
    let remaining = sec;
    setTimeLeft(remaining);

    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);

      if (remaining <= 5 && remaining > 0) {
        playTickSound(muted);
      }

      if (remaining <= 0) {
        clearInterval(timerRef.current);
      }
    }, 1000);
  }

  function sendHostAction(action, extra = {}) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "HOST_ACTION",
          action,
          pin: hostPin,
          ...extra,
        })
      );
    }
  }

  function handleSetPacingMode(mode) {
    setPacingMode(mode);
    if (mode === "manual") setStageCountdown(0);
    sendHostAction("SET_PACING_MODE", { mode });
  }

  function handleCreateSession(e) {
    if (e) e.preventDefault();
    if (!newSessionName.trim()) return;
    sendHostAction("CREATE_SESSION", {
      name: newSessionName.trim(),
      activate: autoActivateNew,
    });
    setNewSessionName("");
    setShowSessionModal(false);
  }

  function handleActivateSession(sessionId) {
    sendHostAction("ACTIVATE_SESSION", { sessionId });
  }

  function handleInactivateSession(sessionId) {
    if (confirm("Inactivate this lobby? Connected doctors will be put in waiting queue until a lobby is activated.")) {
      sendHostAction("INACTIVATE_SESSION", { sessionId });
    }
  }

  function handleDeleteSession(sessionId, sessionName) {
    if (confirm(`Delete session "${sessionName}"? This cannot be undone.`)) {
      sendHostAction("DELETE_SESSION", { sessionId });
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (!password.trim()) {
      setAuthError("Please enter the admin password.");
      return;
    }
    setAuthError("");
    setAuthLoading(true);
    try {
      await adminLogin(password);
      setAuthed(true);
      setPassword("");
    } catch (err) {
      setAuthError(err.message || "Invalid admin credentials.");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    adminLogout();
    setAuthed(false);
    if (wsRef.current) wsRef.current.close();
  }

  const activeQuestion = QUIZ_QUESTIONS[currentQIndex] || QUIZ_QUESTIONS[0];

  // ── 1. LOGIN GATE FOR QUIZ MASTER ──
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 font-sans selection:bg-purple-500 selection:text-white">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-3xl mx-auto mb-6 shadow-xl shadow-purple-500/20">
            🎬
          </div>

          <h1 className="text-2xl font-black text-white text-center mb-1 tracking-tight">
            Stage Quiz Master
          </h1>
          <p className="text-xs text-slate-400 text-center mb-6">
            Auditorium Projector &amp; Live Control Console
          </p>

          {authError && (
            <div className="p-3.5 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center font-medium">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Admin Security Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password (same as Admin)"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:border-purple-500 focus:outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm shadow-xl shadow-purple-500/20 transition-transform active:scale-95 disabled:opacity-50"
            >
              {authLoading ? "Verifying..." : "Unlock Stage Controls 🚀"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a href="/quiz" className="text-xs text-slate-500 hover:text-slate-300 transition">
              ← Switch to Player Mode
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── 2. STAGE MASTER CONSOLE & AUDITORIUM PROJECTOR ──
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-500 selection:text-white">
      {/* Top Projector Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center font-black text-white text-sm shadow-md shadow-purple-500/20">
                IMF
              </div>
              <span className="font-extrabold text-base tracking-tight text-white group-hover:text-purple-400 transition-colors hidden sm:inline">
                IMF 2026 Quiz Master
              </span>
            </a>

            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase tracking-wider">
              Auditorium Projector
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                wsConnected
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  wsConnected ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <span className="hidden sm:inline">
                {wsConnected ? "Stage Connected" : "Connecting..."}
              </span>
            </div>

            <button
              onClick={() => setMuted(!muted)}
              title={muted ? "Unmute" : "Mute"}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 transition"
            >
              {muted ? "🔇" : "🔊"}
            </button>

            <button
              onClick={() => setShowSessionModal(true)}
              title="Manage Sessions & Lobbies"
              className="px-3 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 text-xs font-bold border border-purple-500/40 transition flex items-center gap-1.5"
            >
              <span>🗂️</span>
              <span className="hidden sm:inline">Sessions</span>
              <span className="px-1.5 py-0.2 rounded-full bg-purple-500/40 text-[10px] text-white">
                {sessions.length}
              </span>
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 transition"
            >
              ⚙️
            </button>

            <button
              onClick={handleLogout}
              title="Logout"
              className="px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold border border-rose-500/30 transition"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              ⚙️ Live Arena WebSocket &amp; Tunnel
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Auto-configured via Cloudflare. When running the tunnel on the laptop, click "Broadcast" to sync this endpoint to all delegate phones automatically.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  WebSocket Server / Tunnel URL
                </label>
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => {
                    setWsUrl(e.target.value);
                    localStorage.setItem("imf_quiz_ws", e.target.value);
                  }}
                  placeholder="wss://...trycloudflare.com or ws://localhost:3001"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-emerald-400 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Host Admin PIN
                </label>
                <input
                  type="password"
                  value={hostPin}
                  onChange={(e) => setHostPin(e.target.value)}
                  placeholder="Default: 2026"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                disabled={isBroadcasting || !wsUrl}
                onClick={async () => {
                  setIsBroadcasting(true);
                  try {
                    const res = await fetch("/api/quiz-config", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ws_url: wsUrl, pin: hostPin }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      alert("✅ Broadcast Successful!\nAll audience phones will automatically connect to:\n" + wsUrl);
                      setShowSettings(false);
                    } else {
                      alert("❌ Broadcast Failed: " + (data.error || "Unknown error"));
                    }
                  } catch (err) {
                    alert("❌ Network Error: " + err.message);
                  } finally {
                    setIsBroadcasting(false);
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span>{isBroadcasting ? "Syncing..." : "📡 Broadcast & Auto-Sync to All Phones"}</span>
              </button>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sessions Management Modal */}
      {showSessionModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div>
                <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                  <span>🗂️</span>
                  <span>Arena Sessions &amp; Lobbies</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Only one lobby can be active at a time. Activating a lobby automatically pulls connected doctors into it.
                </p>
              </div>
              <button
                onClick={() => setShowSessionModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Create New Session Form */}
            <form onSubmit={handleCreateSession} className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 mb-5">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
                ➕ Create New Session / Lobby
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  required
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="e.g. IMF 2026 - Cardiology Round 1"
                  className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs shadow-md transition active:scale-95 shrink-0"
                >
                  Create &amp; Activate
                </button>
              </div>
              <label className="flex items-center gap-2 mt-2.5 text-[11px] text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoActivateNew}
                  onChange={(e) => setAutoActivateNew(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span>Activate immediately (doctors will automatically join this lobby)</span>
              </label>
            </form>

            {/* Existing Sessions List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Existing Sessions ({sessions.length})</span>
                {activeSession ? (
                  <span className="text-emerald-400 text-[11px] flex items-center gap-1 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    1 Active
                  </span>
                ) : (
                  <span className="text-amber-400 text-[11px] font-semibold">
                    0 Active (Paused)
                  </span>
                )}
              </div>

              {sessions.map((s) => {
                const isActive = activeSession && activeSession.id === s.id;
                return (
                  <div
                    key={s.id}
                    className={`rounded-2xl p-4 border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isActive
                        ? "bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-500/5"
                        : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            isActive ? "bg-emerald-400 animate-ping" : "bg-slate-600"
                          }`}
                        />
                        <span className="font-extrabold text-sm text-white">
                          {s.name}
                        </span>
                        {isActive ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700/60">
                            INACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Created: {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • ID: {s.id.slice(0, 14)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isActive ? (
                        <button
                          type="button"
                          onClick={() => handleInactivateSession(s.id)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs border border-amber-500/30 transition"
                        >
                          ⏸️ Inactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleActivateSession(s.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition shadow"
                        >
                          🟢 Activate
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteSession(s.id, s.name)}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-xs font-bold border border-rose-500/20 transition"
                        title="Delete session"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}

              {sessions.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-xs italic">
                  No sessions created yet. Create one above to get started.
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowSessionModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Host Stage Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-8 flex flex-col justify-between">
        {/* Stage Host Controls Bar */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 mb-6 shadow-xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">
              STAGE CONTROL
            </span>
            <span className="text-xs text-slate-400">
              Round: <strong className="text-white font-mono uppercase">{gameState}</strong>
            </span>

            {/* Dual Pacing Mode Switcher Pill */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 ml-2">
              <button
                type="button"
                onClick={() => handleSetPacingMode("auto")}
                title="Automatically reveals right/wrong and smoothly moves to leaderboard and next question like Kahoot"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                  pacingMode === "auto"
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>⚡</span>
                <span>Auto-Advance (Kahoot)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetPacingMode("manual")}
                title="Quiz master manually controls when to reveal answers, show leaderboard, and go to next question"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                  pacingMode === "manual"
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>🖐️</span>
                <span>Manual Control</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {gameState === "LOBBY" && (
              <button
                onClick={() => sendHostAction("START_QUIZ")}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-lg shadow-emerald-500/20"
              >
                🚀 Launch Quiz (Q1)
              </button>
            )}

            {gameState === "QUESTION" && (
              <button
                onClick={() => sendHostAction("REVEAL_ANSWER")}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-lg shadow-amber-500/20"
              >
                ⏱️ End Question &amp; Reveal
              </button>
            )}

            {gameState === "ANSWER_REVEAL" && (
              pacingMode === "auto" && stageCountdown > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-3 py-2 rounded-xl flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                    <span>Leaderboard in {stageCountdown}s...</span>
                  </span>
                  <button
                    onClick={() => sendHostAction("SHOW_LEADERBOARD")}
                    className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-lg shadow-sky-500/20"
                  >
                    Show Now →
                  </button>
                  <button
                    onClick={() => handleSetPacingMode("manual")}
                    title="Pause auto-advance and switch to manual control"
                    className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                  >
                    ⏸️ Pause
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => sendHostAction("SHOW_LEADERBOARD")}
                  className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-lg shadow-sky-500/20"
                >
                  🏆 Show Leaderboard
                </button>
              )
            )}

            {gameState === "LEADERBOARD" && (
              pacingMode === "auto" && stageCountdown > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Next Question in {stageCountdown}s...</span>
                  </span>
                  <button
                    onClick={() => sendHostAction("NEXT_QUESTION")}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-lg shadow-emerald-500/20"
                  >
                    Next Question →
                  </button>
                  <button
                    onClick={() => handleSetPacingMode("manual")}
                    title="Pause auto-advance and switch to manual control"
                    className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                  >
                    ⏸️ Pause
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => sendHostAction("NEXT_QUESTION")}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-lg shadow-emerald-500/20"
                >
                  Next Question →
                </button>
              )
            )}

            <button
              onClick={() => {
                if (confirm("Reset the entire live quiz back to lobby?")) {
                  sendHostAction("RESET");
                }
              }}
              className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold transition"
            >
              Reset
            </button>
          </div>
        </div>

        {/* ── STAGE LOBBY SCREEN ── */}
        {gameState === "LOBBY" && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-10 text-center shadow-2xl my-auto">
            <div className="max-w-3xl mx-auto">
              {/* Active Session Status Bar */}
              {activeSession ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/80 border border-emerald-500/30 rounded-2xl px-5 py-3.5 mb-6 shadow-inner">
                  <div className="flex items-center gap-3 text-left">
                    <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <div>
                      <div className="text-[10px] uppercase font-black tracking-widest text-emerald-400">
                        Active Stage Session
                      </div>
                      <div className="text-base sm:text-lg font-black text-white">
                        {activeSession.name}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleInactivateSession(activeSession.id)}
                      title="Deactivate lobby (doctors will wait on standby screen)"
                      className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30 transition"
                    >
                      ⏸️ Inactivate
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSessionModal(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow"
                    >
                      <span>🗂️ Sessions ({sessions.length})</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 mb-6 text-center animate-in fade-in zoom-in-95">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
                    ⏸️
                  </div>
                  <h2 className="text-xl font-black text-white mb-1.5">
                    No Lobby is Currently Active
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto mb-4">
                    Doctors visiting <span className="font-mono text-emerald-400 font-bold">imf2026.pages.dev/quiz</span> are currently waiting on the standby screen. Activate an existing lobby or create a new one to let them enter automatically.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowSessionModal(true)}
                    className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs shadow-lg transition active:scale-95"
                  >
                    ⚡ Choose or Create a Lobby to Activate
                  </button>
                </div>
              )}

              <span className="px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-block mb-3">
                IMF 2026 OFFICIAL CLINICAL QUIZ ARENA
              </span>
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-2">
                Join on your mobile phone!
              </h1>

              <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 my-5 text-center">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Open browser &amp; go to:
                </div>
                <div className="text-2xl sm:text-4xl font-black text-emerald-400 tracking-tight font-mono">
                  imf2026.pages.dev/quiz
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 text-base sm:text-lg text-slate-300 font-bold mb-4">
                <span className={`w-3.5 h-3.5 rounded-full ${activeSession ? "bg-emerald-400 animate-ping" : "bg-amber-400"}`} />
                <span>
                  {lobbyPlayers.length} {lobbyPlayers.length === 1 ? "Doctor" : "Doctors"} {activeSession ? "Joined in Lobby" : "Waiting in Standby Queue"}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 justify-center max-h-48 overflow-y-auto mb-6 p-2">
                {lobbyPlayers.map((p, i) => (
                  <span
                    key={p.id || i}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 text-xs text-slate-200 font-medium animate-in fade-in zoom-in-95 flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{p.name}</span>
                    {p.regNumber && (
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">
                        ({p.regNumber})
                      </span>
                    )}
                  </span>
                ))}
                {lobbyPlayers.length === 0 && (
                  <span className="text-xs text-slate-500 italic">
                    Waiting for doctors to connect from their phones...
                  </span>
                )}
              </div>

              <div>
                {activeSession ? (
                  <button
                    onClick={() => sendHostAction("START_QUIZ")}
                    className="px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-base shadow-2xl shadow-emerald-500/30 transition-transform active:scale-95 flex items-center justify-center gap-3 mx-auto"
                  >
                    <span>🚀 Launch Live Quiz (Question 1)</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowSessionModal(true)}
                    className="px-8 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition flex items-center justify-center gap-2 mx-auto border border-slate-700"
                  >
                    <span>⚠️ Activate a Lobby to Enable Launch</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── STAGE ACTIVE QUESTION & IN-PLACE ANSWER REVEAL ── */}
        {(gameState === "QUESTION" || gameState === "ANSWER_REVEAL") && (
          <div className="space-y-6 my-auto animate-in fade-in duration-150">
            {/* Header: Bigger 'Question X of Y' font, removed specialty */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl">
              <div>
                <div className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                  Question {currentQIndex + 1} of {QUIZ_QUESTIONS.length}
                </div>
              </div>

              {gameState === "QUESTION" ? (
                <div
                  className={`w-28 h-28 rounded-3xl flex flex-col items-center justify-center shrink-0 border-4 font-mono shadow-2xl transition-all ${
                    timeLeft <= 5
                      ? "bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse scale-105"
                      : "bg-slate-950 border-emerald-500 text-emerald-400"
                  }`}
                >
                  <span className="text-4xl font-black">{timeLeft}</span>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                    SEC
                  </span>
                </div>
              ) : (
                <div className="px-5 py-3 rounded-2xl bg-purple-500/20 border border-purple-500/30 text-purple-300 font-mono text-sm font-bold flex items-center gap-2 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping" />
                  <span>Scoreboard in {stageCountdown}s</span>
                </div>
              )}
            </div>

            {/* In-Place Kahoot Correct Answer Banner */}
            {gameState === "ANSWER_REVEAL" && (
              <div className="animate-in zoom-in-95 duration-200">
                <div className="py-4 px-8 rounded-2xl bg-[#26890c] border-2 border-emerald-300 text-white shadow-2xl shadow-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="w-11 h-11 rounded-full bg-white text-[#26890c] flex items-center justify-center font-black text-2xl shadow-lg">
                      ✔
                    </span>
                    <div>
                      <div className="text-xs uppercase font-extrabold tracking-widest text-emerald-200">
                        Official Answer
                      </div>
                      <div className="text-2xl sm:text-3xl font-black tracking-tight">
                        Option {activeQuestion.correctAnswer}: {activeQuestion.options.find((o) => o.key === activeQuestion.correctAnswer)?.text}
                      </div>
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 text-xs font-extrabold">
                    <span>Responses: {liveAnswerCount} / {lobbyPlayers.length || "All"}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Clean Merged Question Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
              <p className="text-lg sm:text-2xl text-slate-100 leading-relaxed font-bold">
                {activeQuestion.question || `${activeQuestion.scenario || ""} ${activeQuestion.prompt || ""}`.trim()}
              </p>
            </div>

            {/* Option Cards: Kahoot Full-Color Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeQuestion.options.map((opt) => {
                const theme = KAHOOT_OPTION_THEMES[opt.key] || KAHOOT_OPTION_THEMES.A;
                const isRevealed = gameState === "ANSWER_REVEAL";
                const isCorrect = isRevealed && opt.key === activeQuestion.correctAnswer;

                let cardStyle = "";
                let badge = null;

                if (isRevealed) {
                  if (isCorrect) {
                    cardStyle = "bg-[#26890c] text-white border-2 border-white ring-4 ring-green-400/50 shadow-2xl scale-[1.02] font-black";
                    badge = (
                      <span className="w-9 h-9 rounded-full bg-white text-[#26890c] flex items-center justify-center font-black text-lg shadow-md shrink-0">
                        ✔
                      </span>
                    );
                  } else {
                    cardStyle = "bg-[#250f3c] border-white/10 text-white/40 opacity-30";
                    badge = (
                      <span className="w-8 h-8 rounded-full bg-slate-900 text-slate-500 flex items-center justify-center font-bold text-sm shrink-0">
                        ✖
                      </span>
                    );
                  }
                } else {
                  cardStyle = `${theme.bg} text-white shadow-xl hover:brightness-110`;
                }

                return (
                  <div
                    key={opt.key}
                    className={`relative rounded-2xl p-5 sm:p-6 flex items-center justify-center text-center border border-white/10 transition-all min-h-[82px] sm:min-h-[96px] ${cardStyle}`}
                  >
                    {/* Shape smaller in upper-left corner only (Kahoot style) */}
                    <span className="absolute top-3 left-4 text-white/90 text-sm sm:text-base font-black select-none pointer-events-none drop-shadow">
                      {theme.shape}
                    </span>

                    {/* Option Text centered and bold for auditorium projection */}
                    <span className={`text-base sm:text-xl px-6 ${isRevealed && isCorrect ? "font-black" : "font-extrabold"}`}>
                      {opt.text}
                    </span>

                    {/* Reveal badge in upper-right corner */}
                    {badge && (
                      <div className="absolute top-3 right-4">
                        {badge}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {gameState === "QUESTION" && (
              <div className="flex justify-between items-center text-xs text-slate-400 px-2 font-mono">
                <span>
                  Responses Recorded:{" "}
                  <strong className="text-emerald-400 font-bold">{liveAnswerCount}</strong>
                </span>
                <span>Audience Total: {lobbyPlayers.length || "Live Room"}</span>
              </div>
            )}
          </div>
        )}

        {/* ── STAGE SCOREBOARD SCREEN (KAHOOT STYLE) ── */}
        {gameState === "LEADERBOARD" && (
          <div className="bg-[#2b0f42] border-2 border-[#572182] rounded-3xl p-8 sm:p-12 shadow-2xl my-auto text-white relative overflow-hidden max-w-4xl mx-auto w-full">
            <div className="absolute -top-32 -right-32 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

            <div className="text-center mb-8">
              <span className="px-4 py-1.5 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30 inline-block mb-3 uppercase tracking-widest">
                STAGE AUDITORIUM STANDINGS
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                Scoreboard
              </h2>
            </div>

            <div className="max-w-2xl mx-auto mb-6">
              <AnimatedScoreboardList
                players={leaderboardData}
                isHost={true}
              />
            </div>

            <div className="text-center text-xs text-purple-300 font-medium">
              {pacingMode === "auto" && stageCountdown > 0 ? (
                <span>Next question starting in {stageCountdown}s...</span>
              ) : (
                <span>Click "Next Question" in top stage controls to advance</span>
              )}
            </div>
          </div>
        )}

        {/* ── STAGE PODIUM SCREEN ── */}
        {gameState === "PODIUM" && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center shadow-2xl my-auto">
            <div className="text-5xl mb-3">🏆</div>
            <h1 className="text-3xl sm:text-5xl font-black text-white mb-2">Quiz Champions</h1>
            <p className="text-xs sm:text-sm text-slate-400 mb-8">
              National Internal Medicine Festival 2026 Live Arena
            </p>

            <div className="flex flex-col sm:flex-row items-end justify-center gap-4 max-w-2xl mx-auto">
              {/* 2nd Place */}
              {leaderboardData[1] && (
                <div className="w-full sm:w-1/3 bg-slate-950 border border-slate-800 rounded-3xl p-6 order-2 sm:order-1">
                  <div className="text-3xl mb-2">🥈</div>
                  <div className="text-xs text-slate-400 font-bold mb-1">2nd Place</div>
                  <div className="text-base font-black text-white mb-1 truncate">
                    {leaderboardData[1].name}
                  </div>
                  <div className="font-mono text-sm text-emerald-400 font-black">
                    {leaderboardData[1].score.toLocaleString()} pts
                  </div>
                </div>
              )}

              {/* 1st Place */}
              {leaderboardData[0] && (
                <div className="w-full sm:w-1/3 bg-gradient-to-b from-amber-500/20 to-slate-950 border-2 border-amber-400 rounded-3xl p-8 order-1 sm:order-2 shadow-2xl scale-105">
                  <div className="text-5xl mb-2">👑</div>
                  <div className="text-xs text-amber-400 font-bold uppercase mb-1">CHAMPION</div>
                  <div className="text-lg font-black text-white mb-1 truncate">
                    {leaderboardData[0].name}
                  </div>
                  <div className="font-mono text-lg text-amber-400 font-black">
                    {leaderboardData[0].score.toLocaleString()} pts
                  </div>
                </div>
              )}

              {/* 3rd Place */}
              {leaderboardData[2] && (
                <div className="w-full sm:w-1/3 bg-slate-950 border border-slate-800 rounded-3xl p-6 order-3">
                  <div className="text-3xl mb-2">🥉</div>
                  <div className="text-xs text-slate-400 font-bold mb-1">3rd Place</div>
                  <div className="text-base font-black text-white mb-1 truncate">
                    {leaderboardData[2].name}
                  </div>
                  <div className="font-mono text-sm text-emerald-400 font-black">
                    {leaderboardData[2].score.toLocaleString()} pts
                  </div>
                </div>
              )}
            </div>

            {/* Full Top Results Table */}
            <div className="mt-10 max-w-3xl mx-auto bg-slate-950/80 border border-slate-800 rounded-3xl p-6 text-left shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <span>📋</span>
                  <span>Top Results &amp; Final Rankings ({leaderboardData.length} Total)</span>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {activeSession?.name || "Active Round"}
                </span>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {leaderboardData.map((p, idx) => (
                  <div
                    key={p.id || idx}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border transition ${
                      idx === 0
                        ? "bg-amber-500/15 border-amber-500/50 text-white font-black"
                        : idx === 1
                        ? "bg-slate-800/80 border-slate-600 text-slate-100 font-bold"
                        : idx === 2
                        ? "bg-amber-950/30 border-amber-700/40 text-amber-100 font-bold"
                        : "bg-white/5 border-white/5 text-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 font-black text-purple-400 text-sm">
                        #{idx + 1}
                      </span>
                      <span className="font-bold truncate max-w-[240px] sm:max-w-[340px]">
                        {p.name}
                      </span>
                      {p.regNumber && (
                        <span className="text-xs text-slate-400 font-mono">
                          [{p.regNumber}]
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                        {p.streak || 0} streak 🔥
                      </span>
                      <span className="font-mono text-emerald-400 font-black text-sm sm:text-base">
                        {p.score.toLocaleString()} pts
                      </span>
                    </div>
                  </div>
                ))}

                {leaderboardData.length === 0 && (
                  <div className="text-center py-6 text-xs text-slate-500 italic">
                    No results recorded yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
