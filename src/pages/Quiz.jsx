// src/pages/Quiz.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { QUIZ_QUESTIONS } from "../data/quizQuestions";
import {
  playSelectSound,
  playTickSound,
  playCorrectSound,
  playIncorrectSound,
  playFanfareSound,
  setQuizMuted,
} from "../utils/quizAudio";

// Distinct Kahoot-style color themes for options A, B, C, D, E
const OPTION_THEMES = {
  A: {
    bg: "bg-gradient-to-br from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700",
    border: "border-red-400",
    icon: "▲",
    shadow: "shadow-red-500/25",
    lightBg: "bg-rose-50 border-rose-200 text-rose-700",
  },
  B: {
    bg: "bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700",
    border: "border-blue-400",
    icon: "◆",
    shadow: "shadow-blue-500/25",
    lightBg: "bg-sky-50 border-sky-200 text-sky-700",
  },
  C: {
    bg: "bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700",
    border: "border-amber-400",
    icon: "●",
    shadow: "shadow-amber-500/25",
    lightBg: "bg-amber-50 border-amber-200 text-amber-700",
  },
  D: {
    bg: "bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700",
    border: "border-emerald-400",
    icon: "■",
    shadow: "shadow-emerald-500/25",
    lightBg: "bg-emerald-50 border-emerald-200 text-emerald-700",
  },
  E: {
    bg: "bg-gradient-to-br from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700",
    border: "border-purple-400",
    icon: "★",
    shadow: "shadow-purple-500/25",
    lightBg: "bg-purple-50 border-purple-200 text-purple-700",
  },
};

const DEFAULT_WS_URL = "wss://imf2026-quiz.crcck.workers.dev/ws";
const QUESTION_TIMER_SEC = 60;

export function Quiz() {
  // Mode: "player" | "host"
  const [appMode, setAppMode] = useState(() => {
    if (typeof window !== "undefined" && window.location.search.includes("mode=host")) {
      return "host";
    }
    return "player";
  });

  const [muted, setMuted] = useState(false);
  const [wsUrl, setWsUrl] = useState(() => {
    const saved = localStorage.getItem("imf_quiz_ws");
    if (saved) return saved;
    if (
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ) {
      return DEFAULT_WS_URL;
    }
    return "";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Player State
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("imf_quiz_name") || "");
  const [regNumber, setRegNumber] = useState(() => localStorage.getItem("imf_quiz_reg") || "");
  const [isJoined, setIsJoined] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [playerRank, setPlayerRank] = useState(null);

  // Host / Game Sync State
  const [gameState, setGameState] = useState("LOBBY"); // LOBBY, QUESTION, ANSWER_REVEAL, LEADERBOARD, PODIUM
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIMER_SEC);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [revealStats, setRevealStats] = useState(null);
  const [liveAnswerCount, setLiveAnswerCount] = useState(0);

  // Host Specific
  const [hostPin, setHostPin] = useState("2026");
  const [hostAuthed, setHostAuthed] = useState(false);

  // WebSocket Ref
  const wsRef = useRef(null);
  const timerRef = useRef(null);

  // -------------------------------------------------------------
  // Auto-Fetch Active Cloudflare Tunnel URL from Backend API
  // -------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    async function fetchTunnelConfig() {
      try {
        const res = await fetch("/api/quiz-config");
        if (res.ok) {
          const data = await res.json();
          if (data.ws_url && isMounted) {
            setWsUrl((prev) => {
              if (prev !== data.ws_url) {
                console.log("[Quiz] Auto-detected live tunnel URL:", data.ws_url);
                localStorage.setItem("imf_quiz_ws", data.ws_url);
                return data.ws_url;
              }
              return prev;
            });
            return;
          }
        }
      } catch (err) {
        console.warn("[Quiz] Failed to load quiz tunnel config:", err);
      }

      // Localhost fallback
      if (
        isMounted &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ) {
        setWsUrl((prev) => prev || DEFAULT_WS_URL);
      }
    }

    fetchTunnelConfig();

    // Periodic check if disconnected so players auto-reconnect as soon as host launches tunnel
    const poll = setInterval(() => {
      if (!wsConnected && isMounted) {
        fetchTunnelConfig();
      }
    }, 4000 + Math.floor(Math.random() * 2000));

    return () => {
      isMounted = false;
      clearInterval(poll);
    };
  }, [wsConnected]);

  // -------------------------------------------------------------
  // WebSocket Connection Lifecycle
  // -------------------------------------------------------------
  useEffect(() => {
    if (!wsUrl) return;

    let isUnmounted = false;
    let ws = null;

    function connect() {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isUnmounted) return;
          console.log("[WS] Connected to live quiz engine");
          setWsConnected(true);

          if (appMode === "host") {
            ws.send(JSON.stringify({ type: "HOST_LOGIN", pin: hostPin }));
          } else if (isJoined && playerName) {
            ws.send(JSON.stringify({ type: "JOIN", name: playerName, regNumber }));
          }
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
          console.log("[WS] Disconnected. Retrying with jitter...");
          setTimeout(connect, 3000 + Math.floor(Math.random() * 2000));
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
  }, [wsUrl, appMode, isJoined, hostPin]);

  // -------------------------------------------------------------
  // Handle Incoming WebSocket Messages
  // -------------------------------------------------------------
  function handleServerMessage(msg) {
    console.log("[WS Message]", msg.type, msg);

    switch (msg.type) {
      case "HOST_LOGIN_SUCCESS":
        setHostAuthed(true);
        setGameState(msg.gameState || "LOBBY");
        setCurrentQIndex(msg.currentQuestionIdx || 0);
        break;

      case "HOST_LOGIN_FAILED":
        alert("Incorrect Host PIN. Default is 2026.");
        break;

      case "JOINED_SUCCESS":
        setIsJoined(true);
        setGameState(msg.gameState || "LOBBY");
        setCurrentQIndex(msg.currentQuestionIdx || 0);
        break;

      case "LOBBY_STATE":
        setLobbyPlayers(msg.players || []);
        break;

      case "QUESTION_START":
        setGameState("QUESTION");
        setCurrentQIndex(msg.question.index);
        setTimeLeft(msg.question.durationSec || QUESTION_TIMER_SEC);
        setSelectedOption(null);
        setAnswerSubmitted(false);
        setLastResult(null);
        setRevealStats(null);
        setLiveAnswerCount(0);
        startClientTimer(msg.question.durationSec || QUESTION_TIMER_SEC);
        break;

      case "LIVE_ANSWER_COUNT":
        setLiveAnswerCount(msg.count || 0);
        break;

      case "ANSWER_ACK":
        setAnswerSubmitted(true);
        break;

      case "ANSWER_RESULT":
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState("ANSWER_REVEAL");
        setLastResult(msg);
        setScore(msg.totalScore || 0);
        setStreak(msg.streak || 0);
        setRevealStats(msg.stats || null);

        if (msg.isCorrect) {
          playCorrectSound(muted);
        } else {
          playIncorrectSound(muted);
        }
        break;

      case "HOST_REVEAL":
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState("ANSWER_REVEAL");
        setRevealStats(msg.stats);
        break;

      case "LEADERBOARD_VIEW":
        setGameState("LEADERBOARD");
        setLeaderboardData(msg.top10 || []);
        if (msg.rank) setPlayerRank(msg.rank);
        break;

      case "QUIZ_FINISHED":
        setGameState("PODIUM");
        setLeaderboardData(msg.fullLeaderboard || []);
        playFanfareSound(muted);
        break;

      case "RESET_TO_LOBBY":
        setGameState("LOBBY");
        setSelectedOption(null);
        setAnswerSubmitted(false);
        setLastResult(null);
        setScore(0);
        setStreak(0);
        break;

      default:
        break;
    }
  }

  // -------------------------------------------------------------
  // Countdown Timer
  // -------------------------------------------------------------
  function startClientTimer(seconds) {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(seconds);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        if (prev <= 6) {
          playTickSound(muted);
        }
        return prev - 1;
      });
    }, 1000);
  }

  // -------------------------------------------------------------
  // User Actions
  // -------------------------------------------------------------
  function handleJoinSubmit(e) {
    e.preventDefault();
    if (!playerName.trim()) return;

    localStorage.setItem("imf_quiz_name", playerName.trim());
    localStorage.setItem("imf_quiz_reg", regNumber.trim());

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "JOIN",
          name: playerName.trim(),
          regNumber: regNumber.trim(),
        })
      );
    } else {
      setIsJoined(true);
    }
  }

  function handleSelectOption(optionKey) {
    if (answerSubmitted || gameState !== "QUESTION") return;
    playSelectSound(muted);
    setSelectedOption(optionKey);
    setAnswerSubmitted(true);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "SUBMIT_ANSWER",
          questionIndex: currentQIndex,
          optionKey,
        })
      );
    }
  }

  // Host Action Dispatcher
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

  const activeQuestion = QUIZ_QUESTIONS[currentQIndex] || QUIZ_QUESTIONS[0];

  // =============================================================
  // RENDER: Top Navigation Bar
  // =============================================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center gap-2 group transition-transform active:scale-95"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-slate-950 text-sm shadow-md shadow-emerald-500/20">
                IMF
              </div>
              <span className="font-extrabold text-base tracking-tight text-white group-hover:text-emerald-400 transition-colors hidden sm:inline">
                IMF 2026 Live Arena
              </span>
            </a>

            {/* Mode Switch Pills: Player vs Stage Host */}
            <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs font-semibold">
              <button
                onClick={() => setAppMode("player")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  appMode === "player"
                    ? "bg-emerald-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                📱 Player
              </button>
              <button
                onClick={() => setAppMode("host")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  appMode === "host"
                    ? "bg-purple-500 text-white font-bold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                🎬 Stage Host
              </button>
            </div>
          </div>

          {/* Right Header Badges */}
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
                {wsConnected ? "Live Connected" : "Connecting..."}
              </span>
            </div>

            {/* Sound Toggle */}
            <button
              onClick={() => {
                const nextMuted = !muted;
                setMuted(nextMuted);
                setQuizMuted(nextMuted);
              }}
              title={muted ? "Unmute sound" : "Mute sound"}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 transition"
            >
              {muted ? "🔇" : "🔊"}
            </button>

            {/* Settings Drawer */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              title="Connection Settings"
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 transition"
            >
              ⚙️
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
              Auto-configured via Cloudflare. When running the tunnel from the stage laptop, click "Broadcast" to sync this endpoint to all delegate phones automatically.
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

              {appMode === "host" && (
                <>
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
                </>
              )}
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

      {/* ======================================================= */}
      {/* 2. PLAYER MODE (Auditorium Mobile View)                  */}
      {/* ======================================================= */}
      {appMode === "player" && (
        <main className="flex-1 max-w-xl mx-auto w-full p-4 flex flex-col justify-center">
          {/* Join Screen */}
          {!isJoined && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-slate-950 text-2xl mx-auto mb-4 shadow-xl shadow-emerald-500/20">
                ⚡
              </div>
              <h1 className="text-2xl font-black text-white mb-1">
                Enter Live Arena
              </h1>
              <p className="text-xs text-slate-400 mb-4">
                Internal Medicine Festival 2026 Live Quiz
              </p>

              {/* Connection Status Banner */}
              <div className="mb-6 flex items-center justify-center">
                {wsConnected ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Live Auditorium Tunnel Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Connecting to Stage Host...
                  </span>
                )}
              </div>

              <form onSubmit={handleJoinSubmit} className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Your Name / Title
                  </label>
                  <input
                    type="text"
                    required
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="e.g. Dr. Aiman Talukder"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Registration No. (Optional)
                  </label>
                  <input
                    type="text"
                    value={regNumber}
                    onChange={(e) => setRegNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. IMF-REG-0001"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-emerald-400 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Entering your reg number links your podium prizes directly to your badge.
                  </span>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/20 transition-transform active:scale-95 mt-4"
                >
                  Join Live Room 🚀
                </button>
              </form>
            </div>
          )}

          {/* Lobby Waiting Room */}
          {isJoined && gameState === "LOBBY" && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
              <div className="w-14 h-14 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin mx-auto mb-6" />
              <h2 className="text-xl font-black text-white mb-2">
                You're in, {playerName}!
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Waiting for the Quiz Master on stage to launch the first question...
              </p>

              <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">Your Badge:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {regNumber || "Guest Delegate"}
                </span>
              </div>
            </div>
          )}

          {/* Active Question: Player Mobile View */}
          {isJoined && gameState === "QUESTION" && (
            <div className="space-y-4">
              {/* Question Header & Timer Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                    {activeQuestion.specialty}
                  </span>
                  <div className="text-xs text-slate-400">
                    Question {currentQIndex + 1} of {QUIZ_QUESTIONS.length}
                  </div>
                </div>

                {/* Animated Timer Pill */}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-xs font-black ${
                    timeLeft <= 5
                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  }`}
                >
                  ⏱️ {timeLeft}s
                </div>
              </div>

              {/* Case Scenario & Prompt */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-3 line-clamp-4">
                  {activeQuestion.scenario}
                </p>
                <h3 className="text-sm sm:text-base font-bold text-white">
                  {activeQuestion.prompt}
                </h3>
              </div>

              {/* Big Kahoot Tap Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeQuestion.options.map((opt) => {
                  const theme = OPTION_THEMES[opt.key];
                  const isSelected = selectedOption === opt.key;

                  return (
                    <button
                      key={opt.key}
                      disabled={answerSubmitted}
                      onClick={() => handleSelectOption(opt.key)}
                      className={`p-4 rounded-2xl border text-left flex items-center gap-3.5 transition-all active:scale-95 ${
                        isSelected
                          ? "bg-white text-slate-950 border-white ring-4 ring-emerald-400/60 font-bold scale-[1.02]"
                          : answerSubmitted
                          ? "bg-slate-900/40 border-slate-800 opacity-40 text-slate-400"
                          : `bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-850 text-white ${theme.shadow}`
                      }`}
                    >
                      <span
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-white shrink-0 text-sm shadow-md ${theme.bg}`}
                      >
                        {opt.key}
                      </span>
                      <span className="text-xs sm:text-sm font-medium leading-snug">
                        {opt.text}
                      </span>
                    </button>
                  );
                })}
              </div>

              {answerSubmitted && (
                <div className="text-center py-2 animate-in fade-in">
                  <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20">
                    ✓ Answer Locked In! Waiting for timer to end...
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Reveal Screen (Player) */}
          {isJoined && gameState === "ANSWER_REVEAL" && lastResult && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-in zoom-in-95 duration-200">
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 ${
                  lastResult.isCorrect
                    ? "bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400"
                    : "bg-rose-500/20 border-2 border-rose-400 text-rose-400"
                }`}
              >
                {lastResult.isCorrect ? "✓" : "✗"}
              </div>

              <h2 className="text-2xl font-black text-white mb-1">
                {lastResult.isCorrect ? "Brilliant! Correct!" : "Not Quite!"}
              </h2>

              <div className="flex items-center justify-center gap-3 my-4">
                {lastResult.isCorrect && (
                  <span className="px-3.5 py-1 rounded-full bg-emerald-500 text-slate-950 font-black text-xs">
                    +{lastResult.pointsEarned} pts
                  </span>
                )}
                {streak > 1 && (
                  <span className="px-3.5 py-1 rounded-full bg-amber-500 text-slate-950 font-black text-xs">
                    🔥 {streak} Streak!
                  </span>
                )}
              </div>

              {/* Explanation Card */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-left my-4 text-xs text-slate-300 leading-relaxed">
                <span className="font-bold text-white block mb-1">
                  Correct Answer: Option {lastResult.correctAnswer}
                </span>
                {lastResult.explanation}
              </div>

              <div className="text-xs text-slate-400 mt-4">
                Total Score:{" "}
                <strong className="text-emerald-400 text-sm font-black">
                  {score.toLocaleString()} pts
                </strong>
              </div>
            </div>
          )}

          {/* Leaderboard Screen (Player) */}
          {isJoined && gameState === "LEADERBOARD" && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
              <h2 className="text-xl font-black text-center text-white mb-1">
                🏆 Top Contenders
              </h2>
              <p className="text-xs text-center text-slate-400 mb-6">
                Your Rank:{" "}
                <strong className="text-emerald-400 font-bold">
                  {playerRank ? `#${playerRank}` : "Top 10"}
                </strong>{" "}
                • {score.toLocaleString()} pts
              </p>

              <div className="space-y-2">
                {leaderboardData.slice(0, 5).map((p, idx) => (
                  <div
                    key={p.id || idx}
                    className={`flex items-center justify-between p-3 rounded-xl text-xs font-semibold ${
                      p.name === playerName
                        ? "bg-emerald-500/20 border border-emerald-400 text-white"
                        : "bg-slate-950/60 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 text-slate-500 font-black">
                        #{idx + 1}
                      </span>
                      <span>{p.name}</span>
                    </div>
                    <span className="font-mono font-bold text-emerald-400">
                      {p.score.toLocaleString()} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Podium Screen (Player) */}
          {isJoined && gameState === "PODIUM" && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl animate-in zoom-in-95">
              <div className="text-5xl mb-4">🏆</div>
              <h2 className="text-2xl font-black text-white mb-2">
                Festival Quiz Completed!
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Thank you for competing in the National Internal Medicine Festival 2026.
              </p>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 mb-6">
                <div className="text-xs text-slate-400 mb-1">Your Final Score</div>
                <div className="text-3xl font-black text-emerald-400">
                  {score.toLocaleString()} pts
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ======================================================= */}
      {/* 3. HOST / PROJECTOR MODE (Auditorium Stage Screen)       */}
      {/* ======================================================= */}
      {appMode === "host" && (
        <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-8 flex flex-col justify-between">
          {/* Top Host Control Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 mb-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">
                AUDITORIUM STAGE PROJECTOR
              </span>
              <span className="text-xs text-slate-400">
                Live State:{" "}
                <strong className="text-white font-mono uppercase">
                  {gameState}
                </strong>
              </span>
            </div>

            {/* Host Master Control Buttons */}
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
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition active:scale-95"
                >
                  ⏱️ End Question &amp; Reveal
                </button>
              )}

              {gameState === "ANSWER_REVEAL" && (
                <button
                  onClick={() => sendHostAction("SHOW_LEADERBOARD")}
                  className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs transition active:scale-95"
                >
                  🏆 Show Leaderboard
                </button>
              )}

              {gameState === "LEADERBOARD" && (
                <button
                  onClick={() => sendHostAction("NEXT_QUESTION")}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition active:scale-95"
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

          {/* Host Stage Lobby Screen */}
          {gameState === "LOBBY" && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center shadow-2xl my-auto">
              <div className="max-w-2xl mx-auto">
                <span className="px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-block mb-4">
                  IMF 2026 OFFICIAL CLINICAL QUIZ ARENA
                </span>
                <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
                  Join on your mobile phone!
                </h1>

                {/* Big URL Box */}
                <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 my-6 text-center">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Open browser &amp; go to:
                  </div>
                  <div className="text-2xl sm:text-4xl font-black text-emerald-400 tracking-tight font-mono">
                    imf2026.pages.dev/quiz
                  </div>
                </div>

                {/* Live Count */}
                <div className="flex items-center justify-center gap-3 text-lg text-slate-300 font-bold mb-6">
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>
                    {lobbyPlayers.length}{" "}
                    {lobbyPlayers.length === 1 ? "Doctor" : "Doctors"} Joined
                  </span>
                </div>

                {/* Live ticker of joined players */}
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

                {/* Big Launch Button in Center */}
                <div>
                  <button
                    onClick={() => sendHostAction("START_QUIZ")}
                    className="px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-base shadow-2xl shadow-emerald-500/30 transition-transform active:scale-95 flex items-center justify-center gap-3 mx-auto"
                  >
                    <span>🚀 Launch Live Quiz (Question 1)</span>
                  </button>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Clicking this will broadcast Question 1 to all connected phones immediately.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Host Stage Active Question Screen */}
          {gameState === "QUESTION" && (
            <div className="space-y-6 my-auto">
              {/* Question Banner & Giant Timer */}
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

                {/* Giant Stage Countdown Clock */}
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

              {/* Big Clinical Scenario Card */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                  Clinical Case Presentation
                </div>
                <p className="text-base sm:text-xl text-slate-200 leading-relaxed font-medium">
                  {activeQuestion.scenario}
                </p>
              </div>

              {/* 5 Massive Option Display Cards */}
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

              {/* Stage Answer Status Counter */}
              <div className="flex justify-between items-center text-xs text-slate-400 px-2 font-mono">
                <span>
                  Responses Recorded:{" "}
                  <strong className="text-emerald-400 font-bold">
                    {liveAnswerCount}
                  </strong>
                </span>
                <span>Audience Total: {lobbyPlayers.length || "Live Room"}</span>
              </div>
            </div>
          )}

          {/* Host Reveal Slide (Statistical Distribution + Explanation) */}
          {gameState === "ANSWER_REVEAL" && (
            <div className="space-y-6 my-auto animate-in fade-in zoom-in-95 duration-200">
              {/* Correct Answer Highlight */}
              <div className="bg-slate-900 border-2 border-emerald-500/80 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                    Correct Option
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
                      {activeQuestion.correctAnswer}
                    </span>
                    <span>
                      {
                        activeQuestion.options.find(
                          (o) => o.key === activeQuestion.correctAnswer
                        )?.text
                      }
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-400">Total Answered</span>
                  <div className="text-2xl font-black text-emerald-400">
                    {revealStats
                      ? Object.values(revealStats).reduce((a, b) => a + b, 0)
                      : 0}
                  </div>
                </div>
              </div>

              {/* Option Distribution Bars */}
              {revealStats && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                    Audience Response Breakdown
                  </div>
                  <div className="grid grid-cols-5 gap-3 text-center">
                    {["A", "B", "C", "D", "E"].map((k) => {
                      const count = revealStats[k] || 0;
                      const isCorrect = k === activeQuestion.correctAnswer;
                      return (
                        <div
                          key={k}
                          className={`p-4 rounded-2xl border ${
                            isCorrect
                              ? "bg-emerald-500/20 border-emerald-400 ring-2 ring-emerald-400/50"
                              : "bg-slate-950 border-slate-800"
                          }`}
                        >
                          <div
                            className={`text-xl font-black ${
                              isCorrect ? "text-emerald-400" : "text-white"
                            }`}
                          >
                            {k}
                          </div>
                          <div className="text-2xl font-black text-slate-200 my-1">
                            {count}
                          </div>
                          <span className="text-[10px] text-slate-500 font-bold uppercase">
                            Votes
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Clinical Explanation */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">
                  Clinical Pearl &amp; Key Rationale
                </div>
                <p className="text-sm sm:text-lg text-slate-200 leading-relaxed">
                  {activeQuestion.explanation}
                </p>
              </div>
            </div>
          )}

          {/* Host Stage Leaderboard */}
          {gameState === "LEADERBOARD" && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl my-auto max-w-4xl mx-auto w-full">
              <div className="text-center mb-8">
                <span className="px-4 py-1.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-block mb-2">
                  TOP CONTENDERS
                </span>
                <h2 className="text-3xl sm:text-5xl font-black text-white">
                  Leaderboard Podium
                </h2>
              </div>

              <div className="space-y-3">
                {leaderboardData.slice(0, 5).map((p, idx) => (
                  <div
                    key={p.id || idx}
                    className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-sm sm:text-base font-bold shadow-md animate-in slide-in-from-left duration-300"
                    style={{ animationDelay: `${idx * 80}ms` }}
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-slate-950 text-sm ${
                          idx === 0
                            ? "bg-amber-400"
                            : idx === 1
                            ? "bg-slate-300"
                            : idx === 2
                            ? "bg-amber-600 text-white"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-white text-base sm:text-lg">
                        {p.name}
                      </span>
                      {p.regNumber && (
                        <span className="text-xs font-mono text-slate-400 hidden sm:inline">
                          ({p.regNumber})
                        </span>
                      )}
                    </div>
                    <span className="text-emerald-400 font-mono text-lg sm:text-xl font-black">
                      {p.score.toLocaleString()} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Host Stage Podium / Grand Celebration */}
          {gameState === "PODIUM" && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center shadow-2xl my-auto max-w-4xl mx-auto w-full animate-in zoom-in-95">
              <div className="text-6xl mb-4">🏆</div>
              <span className="px-4 py-1.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-block mb-3">
                FESTIVAL CHAMPIONS
              </span>
              <h1 className="text-4xl sm:text-6xl font-black text-white mb-8">
                Quiz Grand Champions
              </h1>

              {/* 3 Step Podium */}
              <div className="grid grid-cols-3 items-end gap-4 max-w-xl mx-auto pt-8 pb-4">
                {/* 2nd Place */}
                <div className="flex flex-col items-center">
                  <div className="text-xs font-bold text-slate-300 truncate max-w-[120px] mb-2">
                    {leaderboardData[1]?.name || "2nd Place"}
                  </div>
                  <div className="w-full bg-slate-800 border border-slate-700 rounded-t-2xl h-36 flex flex-col items-center justify-center p-2">
                    <span className="text-2xl font-black text-slate-300">🥈 2nd</span>
                    <span className="text-xs font-mono text-emerald-400 font-bold mt-1">
                      {leaderboardData[1]?.score.toLocaleString()} pts
                    </span>
                  </div>
                </div>

                {/* 1st Place (Highest) */}
                <div className="flex flex-col items-center">
                  <div className="text-sm font-black text-amber-300 truncate max-w-[140px] mb-2">
                    {leaderboardData[0]?.name || "Champion"}
                  </div>
                  <div className="w-full bg-gradient-to-t from-amber-600 to-amber-500 rounded-t-2xl h-48 flex flex-col items-center justify-center p-2 shadow-2xl shadow-amber-500/30">
                    <span className="text-3xl font-black text-slate-950">🥇 1st</span>
                    <span className="text-sm font-mono text-slate-950 font-black mt-1">
                      {leaderboardData[0]?.score.toLocaleString()} pts
                    </span>
                  </div>
                </div>

                {/* 3rd Place */}
                <div className="flex flex-col items-center">
                  <div className="text-xs font-bold text-slate-300 truncate max-w-[120px] mb-2">
                    {leaderboardData[2]?.name || "3rd Place"}
                  </div>
                  <div className="w-full bg-slate-800 border border-slate-700 rounded-t-2xl h-28 flex flex-col items-center justify-center p-2">
                    <span className="text-2xl font-black text-amber-600">🥉 3rd</span>
                    <span className="text-xs font-mono text-emerald-400 font-bold mt-1">
                      {leaderboardData[2]?.score.toLocaleString()} pts
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

export default Quiz;
