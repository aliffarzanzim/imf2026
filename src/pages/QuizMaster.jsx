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

const OPTION_THEMES = {
  A: { bg: "bg-gradient-to-br from-rose-500 to-red-600", border: "border-red-400" },
  B: { bg: "bg-gradient-to-br from-sky-500 to-blue-600", border: "border-blue-400" },
  C: { bg: "bg-gradient-to-br from-amber-500 to-orange-600", border: "border-amber-400" },
  D: { bg: "bg-gradient-to-br from-emerald-500 to-teal-600", border: "border-emerald-400" },
  E: { bg: "bg-gradient-to-br from-purple-500 to-indigo-600", border: "border-purple-400" },
};

const DEFAULT_WS_URL = "ws://localhost:3001";
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

  const wsRef = useRef(null);
  const timerRef = useRef(null);

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
          setTimeout(connect, 3000);
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
        break;

      case "HOST_LOGIN_FAILED":
        alert("Incorrect Host PIN. Default is 2026.");
        break;

      case "LOBBY_STATE":
        setLobbyPlayers(msg.players || []);
        break;

      case "QUESTION_START":
        setGameState("QUESTION");
        setCurrentQIndex(msg.question.index);
        setTimeLeft(msg.question.durationSec || QUESTION_TIMER_SEC);
        setRevealStats(null);
        setLiveAnswerCount(0);
        startClientTimer(msg.question.durationSec || QUESTION_TIMER_SEC);
        break;

      case "LIVE_ANSWER_COUNT":
        setLiveAnswerCount(msg.count || 0);
        break;

      case "HOST_REVEAL":
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState("ANSWER_REVEAL");
        setRevealStats(msg.stats);
        break;

      case "LEADERBOARD_VIEW":
        setGameState("LEADERBOARD");
        setLeaderboardData(msg.top10 || []);
        break;

      case "QUIZ_FINISHED":
        setGameState("PODIUM");
        setLeaderboardData(msg.fullLeaderboard || []);
        playFanfareSound(muted);
        break;

      case "RESET_TO_LOBBY":
        setGameState("LOBBY");
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

  function sendHostAction(action) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "HOST_ACTION",
          action,
          pin: hostPin,
        })
      );
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

      {/* Host Stage Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-8 flex flex-col justify-between">
        {/* Stage Host Controls Bar */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 mb-6 shadow-xl">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">
              STAGE CONTROL
            </span>
            <span className="text-xs text-slate-400">
              Round: <strong className="text-white font-mono uppercase">{gameState}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
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
              <button
                onClick={() => sendHostAction("SHOW_LEADERBOARD")}
                className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-lg shadow-sky-500/20"
              >
                🏆 Show Leaderboard
              </button>
            )}

            {gameState === "LEADERBOARD" && (
              <button
                onClick={() => sendHostAction("NEXT_QUESTION")}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-lg shadow-emerald-500/20"
              >
                Next Question →
              </button>
            )}

            <button
              onClick={() => {
                if (confirm("Reset the entire live quiz back to lobby?")) {
                  sendHostAction("RESET");
                }
              }}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold"
            >
              Reset
            </button>
          </div>
        </div>

        {/* ── STAGE LOBBY SCREEN ── */}
        {gameState === "LOBBY" && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center shadow-2xl my-auto">
            <div className="max-w-2xl mx-auto">
              <span className="px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-block mb-4">
                IMF 2026 OFFICIAL CLINICAL QUIZ ARENA
              </span>
              <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
                Join on your mobile phone!
              </h1>

              <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 my-6 text-center">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Open browser &amp; go to:
                </div>
                <div className="text-2xl sm:text-4xl font-black text-emerald-400 tracking-tight font-mono">
                  imf2026.pages.dev/quiz
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 text-lg text-slate-300 font-bold mb-6">
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 animate-ping" />
                <span>
                  {lobbyPlayers.length} {lobbyPlayers.length === 1 ? "Doctor" : "Doctors"} Joined
                </span>
              </div>

              <div className="flex flex-wrap gap-2 justify-center max-h-48 overflow-hidden mb-8">
                {lobbyPlayers.map((p, i) => (
                  <span
                    key={p.id || i}
                    className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs text-slate-200 font-medium animate-in fade-in zoom-in-95"
                  >
                    {p.name}
                  </span>
                ))}
                {lobbyPlayers.length === 0 && (
                  <span className="text-xs text-slate-500 italic">
                    Waiting for doctors to join from their phones...
                  </span>
                )}
              </div>

              <div>
                <button
                  onClick={() => sendHostAction("START_QUIZ")}
                  className="px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-base shadow-2xl shadow-emerald-500/30 transition-transform active:scale-95 flex items-center justify-center gap-3 mx-auto"
                >
                  <span>🚀 Launch Live Quiz (Question 1)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STAGE ACTIVE QUESTION SCREEN ── */}
        {gameState === "QUESTION" && (
          <div className="space-y-6 my-auto animate-in fade-in duration-150">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl">
              <div>
                <span className="px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-sky-500/10 text-sky-400 border border-sky-500/20 inline-block mb-2">
                  {activeQuestion.specialty}
                </span>
                <div className="text-xs text-slate-400 font-bold">
                  Question {currentQIndex + 1} of {QUIZ_QUESTIONS.length}
                </div>
                <h2 className="text-lg sm:text-2xl font-black text-white mt-1">
                  {activeQuestion.prompt}
                </h2>
              </div>

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
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                Clinical Case Presentation
              </div>
              <p className="text-base sm:text-xl text-slate-200 leading-relaxed font-medium">
                {activeQuestion.scenario}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeQuestion.options.map((opt) => {
                const theme = OPTION_THEMES[opt.key];
                return (
                  <div
                    key={opt.key}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-lg"
                  >
                    <span
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-lg shrink-0 shadow-lg ${theme.bg}`}
                    >
                      {opt.key}
                    </span>
                    <span className="text-base sm:text-lg font-bold text-slate-100">
                      {opt.text}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center text-xs text-slate-400 px-2 font-mono">
              <span>
                Responses Recorded:{" "}
                <strong className="text-emerald-400 font-bold">{liveAnswerCount}</strong>
              </span>
              <span>Audience Total: {lobbyPlayers.length || "Live Room"}</span>
            </div>
          </div>
        )}

        {/* ── STAGE REVEAL SCREEN ── */}
        {gameState === "ANSWER_REVEAL" && (
          <div className="space-y-6 my-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 border-2 border-emerald-500/80 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                  Correct Option
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center text-lg font-black">
                    {activeQuestion.correctAnswer}
                  </span>
                  <span>
                    {activeQuestion.options.find((o) => o.key === activeQuestion.correctAnswer)?.text}
                  </span>
                </h2>
              </div>
            </div>

            {revealStats && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
                  Audience Response Breakdown
                </div>
                <div className="space-y-3">
                  {activeQuestion.options.map((opt) => {
                    const count = revealStats.distribution?.[opt.key] || 0;
                    const total = revealStats.totalAnswers || 1;
                    const pct = Math.round((count / total) * 100);
                    const isCorrect = opt.key === activeQuestion.correctAnswer;

                    return (
                      <div key={opt.key} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className={isCorrect ? "text-emerald-400" : "text-slate-300"}>
                            {opt.key}. {opt.text} {isCorrect && "✓"}
                          </span>
                          <span className="font-mono text-slate-400">
                            {count} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            style={{ width: `${pct}%` }}
                            className={`h-full rounded-full transition-all duration-500 ${
                              isCorrect ? "bg-emerald-500" : "bg-slate-700"
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
                Clinical Rationale &amp; Key Learning Point
              </div>
              <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
                {activeQuestion.explanation}
              </p>
            </div>
          </div>
        )}

        {/* ── STAGE LEADERBOARD SCREEN ── */}
        {gameState === "LEADERBOARD" && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl my-auto">
            <div className="text-center mb-8">
              <span className="px-4 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-block mb-3">
                LIVE ARENA STANDINGS
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-white">Top Contenders</h2>
            </div>

            <div className="space-y-3 max-w-3xl mx-auto">
              {leaderboardData.slice(0, 10).map((p, idx) => (
                <div
                  key={p.id || idx}
                  className={`flex items-center justify-between p-4 rounded-2xl border text-sm font-bold transition ${
                    idx === 0
                      ? "bg-amber-500/20 border-amber-400 text-amber-200 shadow-lg scale-[1.02]"
                      : idx === 1
                      ? "bg-slate-800/90 border-slate-600 text-slate-200"
                      : idx === 2
                      ? "bg-amber-900/20 border-amber-800/40 text-amber-400"
                      : "bg-slate-950/60 border-slate-800 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="w-8 font-black text-slate-400 text-base">#{idx + 1}</span>
                    <span className="text-base">{p.name}</span>
                    {p.regNumber && (
                      <span className="text-xs text-slate-500 font-mono hidden sm:inline">
                        [{p.regNumber}]
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-emerald-400 text-base font-black">
                    {p.score.toLocaleString()} pts
                  </span>
                </div>
              ))}
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
          </div>
        )}
      </main>
    </div>
  );
}
