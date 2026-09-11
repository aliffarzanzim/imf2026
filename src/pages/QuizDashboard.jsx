// src/pages/QuizDashboard.jsx
import React, { useState, useEffect, useRef } from "react";
import { QUIZ_QUESTIONS } from "../data/quizQuestions";
import {
  playSelectSound,
  playTickSound,
  playCorrectSound,
  playIncorrectSound,
  playFanfareSound,
} from "../utils/quizAudio";
import { navigate } from "../utils/navigation";

// Distinct Kahoot-style color themes for options A, B, C, D, E
const OPTION_THEMES = {
  A: {
    bg: "bg-gradient-to-br from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700",
    border: "border-red-400",
    shadow: "shadow-red-500/25",
  },
  B: {
    bg: "bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700",
    border: "border-blue-400",
    shadow: "shadow-blue-500/25",
  },
  C: {
    bg: "bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700",
    border: "border-amber-400",
    shadow: "shadow-amber-500/25",
  },
  D: {
    bg: "bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700",
    border: "border-emerald-400",
    shadow: "shadow-emerald-500/25",
  },
  E: {
    bg: "bg-gradient-to-br from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700",
    border: "border-purple-400",
    shadow: "shadow-purple-500/25",
  },
};

const DEFAULT_WS_URL = "ws://localhost:3001";
const QUESTION_TIMER_SEC = 25;

export function QuizDashboard() {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("imf_quiz_name") || "");
  const [regNumber, setRegNumber] = useState(() => localStorage.getItem("imf_quiz_reg") || "");

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

  const wsRef = useRef(null);
  const timerRef = useRef(null);

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
          ws.send(JSON.stringify({ type: "JOIN", name: playerName, regNumber }));
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
  }, [wsUrl, playerName, regNumber]);

  // Incoming WebSocket Messages
  function handleServerMessage(msg) {
    switch (msg.type) {
      case "JOINED_SUCCESS":
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
        setScore(0);
        setStreak(0);
        setLastResult(null);
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
        {/* ── 1. LOBBY WAITING ROOM ── */}
        {gameState === "LOBBY" && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
              <div className="w-8 h-8 rounded-full border-3 border-emerald-400 border-t-transparent animate-spin" />
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white mb-2">
              You're in, {playerName}!
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
              Waiting for the Quiz Master on stage to launch Question 1...
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
              <div className="flex flex-wrap gap-1.5 justify-center max-h-28 overflow-hidden">
                {lobbyPlayers.slice(-12).map((p, idx) => (
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
        {gameState === "QUESTION" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Header & Animated Countdown */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
              <div>
                <span className="text-[11px] font-extrabold text-emerald-400 uppercase tracking-wider">
                  {activeQuestion.specialty}
                </span>
                <div className="text-xs text-slate-400 font-bold">
                  Question {currentQIndex + 1} of {QUIZ_QUESTIONS.length}
                </div>
              </div>

              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-xs font-black ${
                  timeLeft <= 5
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse scale-105"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                }`}
              >
                ⏱️ {timeLeft}s
              </div>
            </div>

            {/* Clinical Scenario & Prompt */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                Clinical Presentation
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-3 line-clamp-4">
                {activeQuestion.scenario}
              </p>
              <h3 className="text-sm sm:text-base font-bold text-white leading-snug">
                {activeQuestion.prompt}
              </h3>
            </div>

            {/* Massive Option Tap Buttons A, B, C, D, E */}
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
                        ? "bg-white text-slate-950 border-white ring-4 ring-emerald-400/60 font-bold scale-[1.02] shadow-2xl"
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
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20 shadow-lg">
                  ✓ Answer Locked In! Waiting for timer to finish...
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── 3. ANSWER REVEAL SCREEN ── */}
        {gameState === "ANSWER_REVEAL" && lastResult && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 shadow-xl ${
                lastResult.isCorrect
                  ? "bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400"
                  : "bg-rose-500/20 border-2 border-rose-400 text-rose-400"
              }`}
            >
              {lastResult.isCorrect ? "✓" : "✗"}
            </div>

            <h2 className="text-2xl font-black text-white mb-1">
              {lastResult.isCorrect ? "Brilliant! Correct Answer" : "Incorrect"}
            </h2>

            <p className="text-xs text-slate-400 mb-6 font-mono">
              +{lastResult.pointsEarned?.toLocaleString() || 0} pts
              {lastResult.speedBonus > 0 && ` (Includes +${lastResult.speedBonus} speed bonus)`}
            </p>

            {/* Score & Streak Summary */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3">
                <span className="text-[10px] text-slate-400 uppercase font-bold">
                  Total Score
                </span>
                <div className="text-lg font-black text-emerald-400">
                  {score.toLocaleString()}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3">
                <span className="text-[10px] text-slate-400 uppercase font-bold">
                  Answer Streak
                </span>
                <div className="text-lg font-black text-amber-400">
                  🔥 {streak}
                </div>
              </div>
            </div>

            {/* Clinical Explanation */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-left mb-4">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1.5">
                Correct Answer: Option {lastResult.correctOption}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {lastResult.explanation}
              </p>
            </div>
          </div>
        )}

        {/* ── 4. LEADERBOARD SCREEN ── */}
        {gameState === "LEADERBOARD" && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="text-center mb-6">
              <span className="text-3xl mb-1 block">🏆</span>
              <h2 className="text-xl font-black text-white">Leaderboard Standings</h2>
              {playerRank && (
                <div className="mt-2 inline-block px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-xs font-black">
                  Your Current Rank: #{playerRank}
                </div>
              )}
            </div>

            <div className="space-y-2 mb-4">
              {leaderboardData.slice(0, 7).map((p, idx) => (
                <div
                  key={p.id || idx}
                  className={`flex items-center justify-between p-3 rounded-xl text-xs font-semibold transition ${
                    p.name === playerName
                      ? "bg-emerald-500/20 border border-emerald-400 text-white shadow-lg"
                      : "bg-slate-950/60 text-slate-300 border border-slate-800/40"
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

        {/* ── 5. PODIUM SCREEN (FINALE) ── */}
        {gameState === "PODIUM" && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="text-5xl mb-4">🏆</div>
            <h2 className="text-2xl font-black text-white mb-2">
              Festival Quiz Completed!
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Thank you for competing in the National Internal Medicine Festival 2026.
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 mb-6">
              <div className="text-xs text-slate-400 mb-1">Your Final Score</div>
              <div className="text-3xl font-black text-emerald-400 font-mono">
                {score.toLocaleString()} pts
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
