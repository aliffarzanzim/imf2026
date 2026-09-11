// src/pages/QuizDashboard.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { QUIZ_QUESTIONS } from "../data/quizQuestions";
import {
  playSelectSound,
  playTickSound,
  playCorrectSound,
  playIncorrectSound,
  playFanfareSound,
} from "../utils/quizAudio";
import { navigate } from "../utils/navigation";
import { AnimatedScoreboardList, PinnedPersonalBar } from "../components/quiz/AnimatedScoreboard";

// Authentic Kahoot Color Themes & Symbols for options A, B, C, D, E (Matches Video Recording)
const KAHOOT_OPTION_THEMES = {
  A: {
    bg: "bg-[#e21b3c]",
    hover: "hover:bg-[#c91835]",
    shape: "▲",
    border: "border-[#b0132c]",
  },
  B: {
    bg: "bg-[#1368ce]",
    hover: "hover:bg-[#1056ab]",
    shape: "◆",
    border: "border-[#0d478d]",
  },
  C: {
    bg: "bg-[#d89e00]",
    hover: "hover:bg-[#b88600]",
    shape: "●",
    border: "border-[#966d00]",
  },
  D: {
    bg: "bg-[#26890c]",
    hover: "hover:bg-[#1f7009]",
    shape: "■",
    border: "border-[#195a07]",
  },
  E: {
    bg: "bg-[#864cbf]",
    hover: "hover:bg-[#713da4]",
    shape: "★",
    border: "border-[#5c3088]",
  },
};

const DEFAULT_WS_URL = "wss://imf2026-quiz.crcck.workers.dev/ws";
const QUESTION_TIMER_SEC = 25;

export function QuizDashboard() {
  const playerId = useMemo(() => {
    let pid = sessionStorage.getItem("imf_quiz_pid") || localStorage.getItem("imf_quiz_pid");
    if (!pid) {
      pid = "doc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem("imf_quiz_pid", pid);
      localStorage.setItem("imf_quiz_pid", pid);
    }
    return pid;
  }, []);

  const [playerName, setPlayerName] = useState(
    () => sessionStorage.getItem("imf_quiz_name") || localStorage.getItem("imf_quiz_name") || ""
  );
  const [regNumber, setRegNumber] = useState(
    () => sessionStorage.getItem("imf_quiz_reg") || localStorage.getItem("imf_quiz_reg") || ""
  );
  const [playerEmail, setPlayerEmail] = useState(
    () => sessionStorage.getItem("imf_quiz_email") || localStorage.getItem("imf_quiz_email") || ""
  );
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  const [deviceBlockedMsg, setDeviceBlockedMsg] = useState("");
  const [isRetrying, setIsRetrying] = useState(false);
  const [finalResults, setFinalResults] = useState(null);

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
  const [muted, setMuted] = useState(false);

  // Game / Session State
  const [gameState, setGameState] = useState("LOBBY"); // LOBBY, QUESTION, ANSWER_REVEAL, LEADERBOARD, PODIUM
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIMER_SEC);
  const [selectedOption, setSelectedOption] = useState(null);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [revealStats, setRevealStats] = useState(null);
  const [playerRank, setPlayerRank] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [revealCountdown, setRevealCountdown] = useState(0);
  const [leaderboardCountdown, setLeaderboardCountdown] = useState(0);
  const [pacingMode, setPacingMode] = useState("auto"); // "auto" or "manual"
  const [personalScoreInfo, setPersonalScoreInfo] = useState({
    prevScore: 0,
    score: 0,
    pointsAdded: 0,
    rank: 1,
    prevRank: 1,
  });

  // Active Session & Lobby Status State
  const [activeSession, setActiveSession] = useState(null);
  const [isLobbyActive, setIsLobbyActive] = useState(true);
  const [waitingMessage, setWaitingMessage] = useState("Please wait while Quiz Master activates the lobby...");
  const [institution, setInstitution] = useState(() => localStorage.getItem("imf_quiz_institution") || "");
  const [academicYear, setAcademicYear] = useState(() => localStorage.getItem("imf_quiz_year") || "");

  const wsRef = useRef(null);
  const timerRef = useRef(null);

  // Cosmetic countdown on ANSWER_REVEAL screen — state transition driven by server LEADERBOARD_VIEW
  useEffect(() => {
    if (gameState !== "ANSWER_REVEAL" || revealCountdown <= 0) return;
    const interval = setInterval(() => {
      setRevealCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState, revealCountdown]);

  // Cosmetic countdown on LEADERBOARD screen — next question driven by server QUESTION_START
  useEffect(() => {
    if (gameState !== "LEADERBOARD" || leaderboardCountdown <= 0) return;
    const interval = setInterval(() => {
      setLeaderboardCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState, leaderboardCountdown]);

  // If no name set, redirect to /quiz
  useEffect(() => {
    if (!playerName) {
      navigate("/quiz");
    }
  }, [playerName]);

  // Auto-fetch active tunnel URL from /api/quiz-config
  useEffect(() => {
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
  }, [wsConnected]);

  // WebSocket Connection
  useEffect(() => {
    if (!wsUrl || !playerName) return;

    let isUnmounted = false;
    let ws = null;

    function connect() {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isUnmounted) return;
          setWsConnected(true);
          ws.send(
            JSON.stringify({
              type: "JOIN",
              playerId,
              name: playerName,
              regNumber,
              email: playerEmail,
            })
          );
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
  }, [wsUrl, playerName, regNumber, playerId, playerEmail]);

  function handleRetryJoin() {
    setIsRetrying(true);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "JOIN",
          playerId,
          name: playerName,
          regNumber,
          email: playerEmail,
        })
      );
    } else if (wsUrl) {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => {
          setWsConnected(true);
          ws.send(
            JSON.stringify({
              type: "JOIN",
              playerId,
              name: playerName,
              regNumber,
              email: playerEmail,
            })
          );
        };
        ws.onmessage = (event) => {
          try {
            handleServerMessage(JSON.parse(event.data));
          } catch (e) {}
        };
      } catch (e) {}
    }
    setTimeout(() => {
      setIsRetrying(false);
    }, 1200);
  }

  function handleSwitchEmail() {
    sessionStorage.removeItem("imf_quiz_pid");
    localStorage.removeItem("imf_quiz_pid");
    sessionStorage.removeItem("imf_quiz_email");
    localStorage.removeItem("imf_quiz_email");
    sessionStorage.removeItem("imf_quiz_name");
    localStorage.removeItem("imf_quiz_name");
    sessionStorage.removeItem("imf_quiz_reg");
    localStorage.removeItem("imf_quiz_reg");
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
    }
    navigate("/quiz");
  }

  // Incoming WebSocket Messages
  function handleServerMessage(msg) {
    switch (msg.type) {
      case "DEVICE_ALREADY_ACTIVE":
        setDeviceBlocked(true);
        setDeviceBlockedMsg(
          msg.message || "You are currently active on another device or browser tab with this registered email."
        );
        break;

      case "JOINED_SUCCESS":
        setDeviceBlocked(false);
        setIsLobbyActive(true);
        if (msg.session) setActiveSession(msg.session);
        setGameState(msg.gameState || "LOBBY");
        setCurrentQIndex(msg.currentQuestionIdx || 0);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        if (msg.player) {
          if (typeof msg.player.score === "number") setScore(msg.player.score);
          if (typeof msg.player.streak === "number") setStreak(msg.player.streak);
        }
        setFinalResults(null);
        break;

      case "LOBBY_INACTIVE":
        setIsLobbyActive(false);
        setWaitingMessage(msg.message || "Please wait while Quiz Master activates the lobby.");
        break;

      case "LOBBY_INACTIVATED":
        setIsLobbyActive(false);
        setWaitingMessage(msg.message || "The lobby was paused by Quiz Master. Please wait while Quiz Master activates the lobby...");
        break;

      case "LOBBY_ACTIVATED":
        setIsLobbyActive(true);
        if (msg.session) setActiveSession(msg.session);
        setGameState(msg.gameState || "LOBBY");
        setCurrentQIndex(msg.currentQuestionIdx || 0);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        setSelectedOption(null);
        setAnswerSubmitted(false);
        setScore(0);
        setStreak(0);
        setLastResult(null);
        setFinalResults(null);
        break;

      case "PACING_MODE_UPDATED":
        setPacingMode(msg.pacingMode || "auto");
        break;

      case "LOBBY_STATE":
        setLobbyPlayers(msg.players || []);
        if (msg.activeSession !== undefined) {
          setActiveSession(msg.activeSession);
          setIsLobbyActive(!!msg.activeSession);
        }
        break;

      case "QUESTION_START":
        setGameState("QUESTION");
        setCurrentQIndex(msg.question.index);
        setTimeLeft(msg.question.durationSec || QUESTION_TIMER_SEC);
        setSelectedOption(null);
        setAnswerSubmitted(false);
        setLastResult(null);
        setRevealStats(null);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        startClientTimer(msg.question.durationSec || QUESTION_TIMER_SEC);
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
        setRevealStats(msg.stats);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        setRevealCountdown(msg.autoNextSec || (msg.pacingMode === "auto" ? 6 : 0));

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
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        setRevealCountdown(msg.autoNextSec || (msg.pacingMode === "auto" ? 6 : 0));
        break;

      case "LEADERBOARD_VIEW":
        setGameState("LEADERBOARD");
        setLeaderboardData(msg.top10 || []);
        if (msg.rank) setPlayerRank(msg.rank);
        if (msg.totalScore !== undefined) setScore(msg.totalScore);
        if (msg.streak !== undefined) setStreak(msg.streak);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        setLeaderboardCountdown(msg.autoNextSec || (msg.pacingMode === "auto" ? 6 : 0));
        setPersonalScoreInfo({
          prevScore: msg.prevScore ?? Math.max(0, (msg.totalScore ?? score) - (msg.pointsAdded || 0)),
          score: msg.totalScore ?? score,
          pointsAdded: msg.pointsAdded ?? 0,
          rank: msg.rank ?? playerRank,
          prevRank: msg.prevRank ?? (msg.rank ?? playerRank),
        });
        break;

      case "QUIZ_FINISHED":
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState("PODIUM");
        setFinalResults(msg);
        if (msg.rank) setPlayerRank(msg.rank);
        if (msg.totalScore !== undefined) setScore(msg.totalScore);
        if (msg.streak !== undefined) setStreak(msg.streak);
        if (msg.fullLeaderboard) setLeaderboardData(msg.fullLeaderboard);
        playFanfareSound(muted);
        break;

      case "RESET_TO_LOBBY":
        setGameState("LOBBY");
        setSelectedOption(null);
        setAnswerSubmitted(false);
        setScore(0);
        setStreak(0);
        setLastResult(null);
        setFinalResults(null);
        break;

      default:
        break;
    }
  }

  // Client Countdown
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

  function handleSelectOption(optionKey) {
    if (answerSubmitted || gameState !== "QUESTION") return;
    playSelectSound(muted);
    setSelectedOption(optionKey);
    setAnswerSubmitted(true);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "SUBMIT_ANSWER",
          playerId,
          name: playerName,
          questionIndex: currentQIndex,
          optionKey,
        })
      );
    }
  }

  const activeQuestion = QUIZ_QUESTIONS[currentQIndex] || QUIZ_QUESTIONS[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-slate-950 text-sm shadow-md shadow-emerald-500/20">
                IMF
              </div>
              <span className="font-extrabold text-base tracking-tight text-white group-hover:text-emerald-400 transition-colors hidden sm:inline">
                IMF 2026 Arena
              </span>
            </a>

            {/* Doctor Badge Pill */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700/80 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-bold text-slate-200 truncate max-w-[130px] sm:max-w-[200px]">
                {playerName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Connection Pill */}
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
                {wsConnected ? "Live Room" : "Reconnecting..."}
              </span>
            </div>

            {/* Sound Toggle */}
            <button
              onClick={() => setMuted(!muted)}
              title={muted ? "Unmute sound" : "Mute sound"}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 transition"
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 max-w-xl mx-auto w-full p-4 flex flex-col justify-center">
        {/* ── DEVICE CONCURRENCY LOCK SCREEN ── */}
        {deviceBlocked ? (
          <div className="bg-slate-900/95 border border-rose-500/30 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200 relative overflow-hidden my-auto">
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-rose-500/20 to-amber-500/20 border-2 border-rose-500/40 flex items-center justify-center mx-auto mb-5 shadow-xl relative">
              <span className="w-3.5 h-3.5 rounded-full bg-rose-400 animate-ping absolute" />
              <span className="text-3xl">📱</span>
            </div>

            <span className="px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30 inline-block mb-3">
              Single Active Device Restriction
            </span>

            <h2 className="text-xl sm:text-2xl font-black text-white mb-2 leading-snug">
              Active on Another Device
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 mb-3 leading-relaxed max-w-sm mx-auto">
              You are currently active in this quiz round on another device or browser tab with this registered email:
            </p>

            <div className="inline-block bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl font-mono text-sm font-bold text-amber-400 mb-5">
              {playerEmail || "Your Registered Email"}
            </div>

            <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-4 text-xs text-slate-400 mb-6 max-w-md mx-auto leading-relaxed text-left">
              <p className="mb-2">
                To guarantee fair play, each registered doctor can only participate from <strong className="text-slate-200">one active device at a time</strong>.
              </p>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-medium">
                👉 Please close the quiz tab or browser on your other device, then tap <strong>Check & Reconnect</strong> below.
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleRetryJoin}
                disabled={isRetrying}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isRetrying ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                    <span>Checking Connection...</span>
                  </>
                ) : (
                  <>
                    <span>🔄</span>
                    <span>Check & Reconnect</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSwitchEmail}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm border border-slate-700 transition active:scale-95"
              >
                Use Different Email
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── 0. STANDBY WAITING: NO LOBBY ACTIVE ── */}
        {!isLobbyActive && (
          <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border-2 border-amber-500/30 flex items-center justify-center mx-auto mb-5 shadow-xl relative">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-400 animate-ping absolute" />
              <span className="text-3xl">⏱️</span>
            </div>

            <span className="px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 inline-block mb-3 animate-pulse">
              Stage Standing By
            </span>

            <h2 className="text-xl sm:text-2xl font-black text-white mb-2 leading-snug">
              Please wait while Quiz Master activates the lobby...
            </h2>

            <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed max-w-sm mx-auto">
              You are connected and ready as <strong className="text-emerald-400">{playerName}</strong>. As soon as the Quiz Master activates a lobby on stage, your screen will automatically enter without needing to refresh!
            </p>

            <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/80 flex items-center justify-between text-xs mb-5">
              <span className="text-slate-400">Doctor Delegate:</span>
              <span className="font-mono text-emerald-400 font-bold">
                {playerName} {regNumber ? `(${regNumber})` : ""}
              </span>
            </div>

            {/* Radar Activity Scanner */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 flex items-center justify-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-mono text-slate-400">
                Connected • Auto-joining on stage activation...
              </span>
            </div>
          </div>
        )}

        {/* ── 1. ACTIVE LOBBY WAITING ROOM ── */}
        {isLobbyActive && gameState === "LOBBY" && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {activeSession && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-4">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Round: {activeSession.name}</span>
              </div>
            )}

            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
              <div className="w-8 h-8 rounded-full border-3 border-emerald-400 border-t-transparent animate-spin" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white mb-1.5 tracking-tight">
              You are in, "{playerName}"
            </h2>
            <p className="text-sm sm:text-base font-bold text-emerald-400 mb-6">
              from {institution || "Medical College"} ({academicYear || "Final Year"})
            </p>

            <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/80 flex items-center justify-between text-xs mb-6">
              <span className="text-slate-400">Delegate Badge:</span>
              <span className="font-mono text-emerald-400 font-bold">
                {regNumber || "Guest Delegate"}
              </span>
            </div>

            {/* Doctors in Arena Preview */}
            <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800/60">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Doctors in Live Arena ({lobbyPlayers.length})
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center max-h-28 overflow-y-auto">
                {lobbyPlayers.slice(-15).map((p, idx) => (
                  <span
                    key={p.id || idx}
                    className="px-2.5 py-1 rounded-lg bg-slate-800/70 text-[11px] text-slate-300 font-medium"
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 2. ACTIVE QUESTION (MOBILE TAP BUTTONS) ── */}
        {/* ── 2. ACTIVE QUESTION & IN-PLACE ANSWER REVEAL (KAHOOT STYLE) ── */}
        {(gameState === "QUESTION" || gameState === "ANSWER_REVEAL") && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Header: Bigger 'Question X of Y' font, removed specialty */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 flex items-center justify-between shadow-lg">
              <div className="text-base sm:text-xl font-black text-white tracking-tight">
                Question {currentQIndex + 1} of {QUIZ_QUESTIONS.length}
              </div>

              {gameState === "QUESTION" ? (
                <div
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-mono text-xs sm:text-sm font-black ${
                    timeLeft <= 5
                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse scale-105"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  }`}
                >
                  ⏱️ {timeLeft}s
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  <span>Scoreboard in {revealCountdown}s</span>
                </div>
              )}
            </div>

            {/* In-Place Kahoot Result Banner (Matches Video 00:03 & 00:16) */}
            {gameState === "ANSWER_REVEAL" && (
              <div className="my-1 animate-in zoom-in-95 duration-200">
                <div
                  className={`py-3.5 px-6 rounded-2xl shadow-2xl flex items-center justify-between border-2 ${
                    lastResult?.isCorrect
                      ? "bg-[#26890c] border-emerald-300 text-white shadow-emerald-500/30"
                      : !selectedOption
                      ? "bg-[#d89e00] border-amber-300 text-white shadow-amber-500/30"
                      : "bg-[#e21b3c] border-rose-300 text-white shadow-red-500/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-black text-xl shrink-0">
                      {lastResult?.isCorrect ? "✔" : !selectedOption ? "⏰" : "✖"}
                    </span>
                    <div className="text-left">
                      <div className="text-lg sm:text-xl font-black tracking-tight leading-none mb-0.5">
                        {lastResult?.isCorrect ? "Correct!" : !selectedOption ? "Time's up!" : "Incorrect"}
                      </div>
                      <div className="text-xs font-bold text-white/90">
                        {lastResult?.isCorrect
                          ? `+${(lastResult?.pointsEarned || 0).toLocaleString()} points`
                          : !selectedOption
                          ? "No answer selected in time"
                          : "Better luck next question!"}
                      </div>
                    </div>
                  </div>

                  {lastResult?.isCorrect && (
                    <div className="text-right">
                      <div className="px-3 py-1 rounded-xl bg-white/20 backdrop-blur-sm text-xs font-black border border-white/30 inline-flex items-center gap-1.5 shadow-sm">
                        <span>🔥</span>
                        <span>Streak: {streak}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Clean Merged Question Card (No separate specialty/title/clinical presentation label) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
              <p className="text-sm sm:text-base font-bold text-slate-100 leading-relaxed">
                {activeQuestion.question || `${activeQuestion.scenario || ""} ${activeQuestion.prompt || ""}`.trim()}
              </p>
            </div>

            {/* Solid Full-Color Kahoot Option Buttons A, B, C, D, E */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeQuestion.options.map((opt) => {
                const theme = KAHOOT_OPTION_THEMES[opt.key] || KAHOOT_OPTION_THEMES.A;
                const isSelected = selectedOption === opt.key;
                const isRevealed = gameState === "ANSWER_REVEAL";
                const isCorrectOption =
                  isRevealed &&
                  (opt.key === lastResult?.correctAnswer ||
                    opt.key === lastResult?.correctOption ||
                    opt.key === activeQuestion.correctAnswer);
                const isWrongSelection = isRevealed && isSelected && !isCorrectOption;

                let buttonStyle = "";
                let badge = null;

                if (isRevealed) {
                  if (isCorrectOption) {
                    buttonStyle =
                      "bg-[#26890c] text-white border-2 border-white ring-4 ring-green-400/50 shadow-2xl scale-[1.02] font-black";
                    badge = (
                      <span className="w-7 h-7 rounded-full bg-white text-[#26890c] flex items-center justify-center font-black text-sm shadow-md shrink-0">
                        ✔
                      </span>
                    );
                  } else if (isWrongSelection) {
                    buttonStyle =
                      "bg-[#e21b3c]/30 text-rose-200 border border-rose-500/50 opacity-40 font-bold";
                    badge = (
                      <span className="w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center font-black text-xs shrink-0">
                        ✖
                      </span>
                    );
                  } else {
                    buttonStyle =
                      "bg-slate-900/40 border-slate-800 text-slate-500 opacity-25";
                    badge = (
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center text-xs shrink-0">
                        ✖
                      </span>
                    );
                  }
                } else {
                  if (isSelected) {
                    buttonStyle = `${theme.bg} text-white ring-4 ring-white font-black scale-[1.02] shadow-2xl`;
                  } else if (answerSubmitted) {
                    buttonStyle = `${theme.bg} text-white opacity-40 pointer-events-none`;
                  } else {
                    buttonStyle = `${theme.bg} ${theme.hover} text-white shadow-lg active:scale-[0.98]`;
                  }
                }

                return (
                  <button
                    key={opt.key}
                    disabled={answerSubmitted || isRevealed}
                    onClick={() => handleSelectOption(opt.key)}
                    className={`relative p-4 sm:p-5 rounded-2xl border border-white/10 flex items-center justify-center text-center transition-all min-h-[68px] sm:min-h-[82px] ${buttonStyle}`}
                  >
                    {/* Shape smaller in upper-left corner only (Kahoot style) */}
                    <span className="absolute top-2.5 left-3.5 text-white/90 text-xs sm:text-sm font-black select-none pointer-events-none drop-shadow">
                      {theme.shape}
                    </span>

                    {/* Option Text centered and wrapped properly */}
                    <span className="text-xs sm:text-sm sm:text-base font-extrabold leading-snug px-3 sm:px-4">
                      {opt.text}
                    </span>

                    {/* Reveal badge in upper-right corner */}
                    {badge && (
                      <div className="absolute top-2.5 right-3.5">
                        {badge}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Answer locked indicator during active question */}
            {gameState === "QUESTION" && answerSubmitted && (
              <div className="text-center py-2 animate-in fade-in">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20 shadow-lg">
                  ✓ Answer Locked In! Waiting for timer to finish...
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── 3. SCOREBOARD (AUTHENTIC KAHOOT PURPLE SCOREBOARD) ── */}
        {gameState === "LEADERBOARD" && (
          <div className="bg-[#2b0f42] border-2 border-[#572182] rounded-3xl p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200 text-white relative overflow-hidden">
            {/* Ambient Kahoot Purple Glow */}
            <div className="absolute -top-24 -right-24 w-52 h-52 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

            <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-6 tracking-tight">
              Scoreboard
            </h2>

            {/* Top 5 Leaderboard List with counting animation and overtaking swap */}
            <div className="mb-6">
              <AnimatedScoreboardList
                players={leaderboardData}
                isHost={false}
                currentUserName={playerName}
              />
            </div>

            {/* Pinned Personal Rank Bar (With count-up and conditional green arrow only on positive points) */}
            <PinnedPersonalBar
              rank={playerRank || 1}
              prevRank={personalScoreInfo?.prevRank || playerRank || 1}
              score={score}
              prevScore={
                personalScoreInfo?.prevScore !== undefined
                  ? personalScoreInfo.prevScore
                  : Math.max(0, score - (personalScoreInfo?.pointsAdded || 0))
              }
              pointsAdded={personalScoreInfo?.pointsAdded || 0}
              playerName={playerName}
            />

            {/* Auto-Advance Countdown Bar */}
            <div className="text-center mt-5">
              <span className="text-xs font-semibold text-purple-300">
                {leaderboardCountdown > 0
                  ? `Next question in ${leaderboardCountdown}s...`
                  : "Get ready for next question..."}
              </span>
            </div>
          </div>
        )}

        {/* ── 5. PODIUM SCREEN (FINALE & NEIGHBORHOOD STANDINGS) ── */}
        {gameState === "PODIUM" && (
          <div className="space-y-6 my-auto animate-in zoom-in-95 duration-200 max-w-4xl mx-auto w-full">
            {/* Header Trophy Banner */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden">
              <div className="absolute -top-24 -right-24 w-52 h-52 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />

              <div className="text-5xl sm:text-6xl mb-3 animate-bounce">🏆</div>
              <span className="px-4 py-1.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-block mb-3 uppercase tracking-widest">
                IMF 2026 Grand Finale
              </span>
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                {activeSession?.name || "Clinical Round Completed"}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto">
                All rounds concluded. Verified final standings recorded in the permanent session ledger.
              </p>
            </div>

            {/* Doctor's Personal Highlight Card */}
            <div className="bg-gradient-to-r from-purple-900/60 via-[#3a135e]/80 to-slate-900 border-2 border-purple-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-purple-950/50">
              <div className="text-xs uppercase font-extrabold tracking-widest text-purple-300 mb-2">
                Your Official Final Standing
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl sm:text-6xl font-black text-white font-mono">
                      #{finalResults?.rank || playerRank || 1}
                    </span>
                    <span className="text-sm sm:text-base font-bold text-purple-200">
                      of {finalResults?.totalPlayers || lobbyPlayers.length || 1} Doctors
                    </span>
                  </div>
                  <div className="text-base sm:text-lg font-extrabold text-white mt-1">
                    {playerName}
                    {regNumber && (
                      <span className="text-xs text-purple-300 font-mono ml-2">
                        [{regNumber}]
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 sm:border-l sm:border-purple-800/60 sm:pl-6 w-full sm:w-auto justify-between sm:justify-start">
                  <div>
                    <div className="text-xs text-purple-300 font-semibold mb-0.5">Total Points</div>
                    <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                      {(finalResults?.totalScore ?? score).toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-purple-300 font-semibold mb-0.5">Streak</div>
                    <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono flex items-center gap-1">
                      <span>{finalResults?.streak ?? streak}</span>
                      <span className="text-base">🔥</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Top 3 Champions Podium Showcase */}
            {((finalResults?.podium && finalResults.podium.length > 0) || leaderboardData.length > 0) && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl">
                <div className="text-xs uppercase font-extrabold tracking-wider text-amber-400 text-center mb-4">
                  🥇 Podium Champions
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(finalResults?.podium || leaderboardData.slice(0, 3)).map((champ, idx) => {
                    const medals = ["🥇 1st Place", "🥈 2nd Place", "🥉 3rd Place"];
                    const styles = [
                      "from-amber-500/20 to-yellow-600/10 border-amber-400 text-amber-200",
                      "from-slate-800/80 to-slate-900 border-slate-600 text-slate-200",
                      "from-amber-800/20 to-slate-900 border-amber-700/60 text-amber-100",
                    ];
                    return (
                      <div
                        key={champ.id || idx}
                        className={`bg-gradient-to-b ${styles[idx] || styles[1]} border rounded-2xl p-4 text-center`}
                      >
                        <div className="text-xs font-black uppercase tracking-wider mb-1">
                          {medals[idx]}
                        </div>
                        <div className="text-base font-black text-white truncate">
                          {champ.name}
                        </div>
                        <div className="text-sm font-mono font-black text-emerald-400 mt-1">
                          {champ.score.toLocaleString()} pts
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Surrounding Standings Table: 5 Above You & 5 Below You */}
            <div className="bg-[#2b0f42] border-2 border-[#572182] rounded-3xl p-6 sm:p-8 shadow-2xl text-white relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-800/60 pb-4 mb-4">
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                    <span>📍</span>
                    <span>Your Neighborhood Standings</span>
                  </h3>
                  <p className="text-xs text-purple-300 mt-0.5">
                    Showing up to 5 participants directly above and 5 directly below your position
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 border border-purple-500/40 text-purple-200 self-start sm:self-auto">
                  Live Verified Rank
                </span>
              </div>

              {/* Rows List */}
              <div className="space-y-2">
                {/* Doctors Above Me */}
                {finalResults?.above5 &&
                  finalResults.above5.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span className="w-8 text-sm font-black text-purple-300">
                          #{p.rank}
                        </span>
                        <span className="text-sm sm:text-base font-bold truncate max-w-[180px] sm:max-w-[280px]">
                          {p.name}
                        </span>
                        {p.regNumber && (
                          <span className="text-xs text-purple-300 font-mono hidden sm:inline">
                            [{p.regNumber}]
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-sm sm:text-base font-black text-slate-200">
                          {p.score.toLocaleString()}
                        </span>
                        <span className="text-emerald-400 text-xs font-black">▲</span>
                      </div>
                    </div>
                  ))}

                {/* MY ROW (Prominently Highlighted) */}
                <div className="flex items-center justify-between px-5 py-4 rounded-2xl bg-gradient-to-r from-[#7a2cb8] to-[#501784] border-2 border-[#b06cf5] shadow-xl shadow-purple-950/60 text-white font-black scale-[1.01]">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="w-8 text-base font-black text-white">
                      #{finalResults?.rank || playerRank || 1}
                    </span>
                    <span className="text-base sm:text-lg font-black truncate max-w-[160px] sm:max-w-[260px]">
                      {playerName}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black uppercase tracking-wider">
                      YOU
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="font-mono text-base sm:text-lg font-black text-white">
                      {(finalResults?.totalScore ?? score).toLocaleString()}
                    </span>
                    <span className="text-emerald-400 text-sm font-black">▲</span>
                  </div>
                </div>

                {/* Doctors Below Me */}
                {finalResults?.below5 &&
                  finalResults.below5.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span className="w-8 text-sm font-black text-purple-300">
                          #{p.rank}
                        </span>
                        <span className="text-sm sm:text-base font-bold truncate max-w-[180px] sm:max-w-[280px]">
                          {p.name}
                        </span>
                        {p.regNumber && (
                          <span className="text-xs text-purple-300 font-mono hidden sm:inline">
                            [{p.regNumber}]
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-sm sm:text-base font-black text-slate-200">
                          {p.score.toLocaleString()}
                        </span>
                        <span className="text-emerald-400 text-xs font-black">▲</span>
                      </div>
                    </div>
                  ))}

                {/* Fallback if above5 / below5 not yet populated */}
                {(!finalResults?.above5 || finalResults.above5.length === 0) &&
                  (!finalResults?.below5 || finalResults.below5.length === 0) &&
                  leaderboardData.length > 0 &&
                  leaderboardData
                    .filter((p) => p.name !== playerName)
                    .slice(0, 10)
                    .map((p, idx) => (
                      <div
                        key={p.id || idx}
                        className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 border border-white/10"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <span className="w-8 text-sm font-black text-purple-300">
                            #{idx + (p.score < score ? 2 : 1)}
                          </span>
                          <span className="text-sm sm:text-base font-bold truncate max-w-[180px] sm:max-w-[280px]">
                            {p.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-sm sm:text-base font-black text-slate-200">
                            {p.score.toLocaleString()}
                          </span>
                          <span className="text-emerald-400 text-xs font-black">▲</span>
                        </div>
                      </div>
                    ))}
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}
