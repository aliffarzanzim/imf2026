// src/pages/QuizDashboard.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { QUIZ_QUESTIONS } from "../data/quizQuestions";
import {
  playSelectSound,
  playTickSound,
  playCorrectSound,
  playIncorrectSound,
  playFanfareSound,
  setQuizMuted,
} from "../utils/quizAudio";
import { navigate } from "../utils/navigation";
import { AnimatedScoreboardList, PinnedPersonalBar } from "../components/quiz/AnimatedScoreboard";
import { KahootShape } from "../components/quiz/KahootShape";
import confetti from "canvas-confetti";
import { startSecurityGuard } from "../utils/securityGuard";

// Celebratory Kahoot-style confetti burst for correct answers
function triggerCorrectConfetti() {
  try {
    confetti({
      particleCount: 60,
      angle: 60,
      spread: 65,
      origin: { x: 0.05, y: 0.65 },
      colors: ["#26890c", "#22c55e", "#10b981", "#fbbf24", "#38bdf8", "#f43f5e"],
      zIndex: 9999,
    });
    confetti({
      particleCount: 60,
      angle: 120,
      spread: 65,
      origin: { x: 0.95, y: 0.65 },
      colors: ["#26890c", "#22c55e", "#10b981", "#fbbf24", "#38bdf8", "#f43f5e"],
      zIndex: 9999,
    });

    setTimeout(() => {
      confetti({
        particleCount: 45,
        spread: 80,
        origin: { x: 0.5, y: 0.3 },
        colors: ["#22c55e", "#fbbf24", "#e21b3c", "#1368ce"],
        zIndex: 9999,
      });
    }, 200);
  } catch (e) {
    console.error("Confetti launch failed:", e);
  }
}

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
const QUESTION_TIMER_SEC = 60;

export function QuizDashboard({ onExitLobby }) {
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
  const [finalResults, setFinalResults] = useState(() => {
    try {
      const saved = sessionStorage.getItem("imf_quiz_final_results");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

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

  // Game / Session State — restored from sessionStorage to eliminate any refresh flashing
  const [gameState, setGameState] = useState(() => {
    return sessionStorage.getItem("imf_quiz_game_state") || "LOBBY";
  });
  const [currentQIndex, setCurrentQIndex] = useState(() => {
    const saved = sessionStorage.getItem("imf_quiz_q_index");
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIMER_SEC);
  const [selectedOption, setSelectedOption] = useState(() => {
    const savedState = sessionStorage.getItem("imf_quiz_game_state") || "LOBBY";
    if (savedState === "LOBBY") return null;
    const sessId = sessionStorage.getItem("imf_quiz_session_id") || "default";
    const savedQ = sessionStorage.getItem("imf_quiz_q_index") || "0";
    return sessionStorage.getItem(`imf_ans_${sessId}_${savedQ}`) || null;
  });
  const [answerSubmitted, setAnswerSubmitted] = useState(() => {
    const savedState = sessionStorage.getItem("imf_quiz_game_state") || "LOBBY";
    if (savedState === "LOBBY") return false;
    const sessId = sessionStorage.getItem("imf_quiz_session_id") || "default";
    const savedQ = sessionStorage.getItem("imf_quiz_q_index") || "0";
    return !!sessionStorage.getItem(`imf_ans_${sessId}_${savedQ}`);
  });
  const [score, setScore] = useState(() => {
    const savedFinal = (() => {
      try {
        const f = JSON.parse(sessionStorage.getItem("imf_quiz_final_results") || "null");
        return f?.totalScore ?? f?.score;
      } catch (e) {
        return null;
      }
    })();
    if (savedFinal !== null && savedFinal !== undefined) return Number(savedFinal) || 0;
    const saved = sessionStorage.getItem("imf_quiz_score");
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  const [streak, setStreak] = useState(() => {
    const saved = sessionStorage.getItem("imf_quiz_streak");
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  const [bestStreak, setBestStreak] = useState(() => {
    const saved = sessionStorage.getItem("imf_quiz_best_streak");
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  const [correctCount, setCorrectCount] = useState(() => {
    const saved = sessionStorage.getItem("imf_quiz_correct_count");
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  const [lastResult, setLastResult] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("imf_quiz_last_result") || "null");
    } catch (e) {
      return null;
    }
  });
  const [revealStats, setRevealStats] = useState(null);
  const [playerRank, setPlayerRank] = useState(() => {
    const saved = sessionStorage.getItem("imf_quiz_rank");
    return saved !== null ? parseInt(saved, 10) : null;
  });
  const [leaderboardData, setLeaderboardData] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("imf_quiz_leaderboard") || "[]");
    } catch (e) {
      return [];
    }
  });
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [revealCountdown, setRevealCountdown] = useState(0);
  const [leaderboardCountdown, setLeaderboardCountdown] = useState(0);
  const [pacingMode, setPacingMode] = useState("auto"); // "auto" or "manual"
  const [isPaused, setIsPaused] = useState(false);
  const [personalScoreInfo, setPersonalScoreInfo] = useState(() => {
    try {
      return (
        JSON.parse(sessionStorage.getItem("imf_quiz_personal_score") || "null") || {
          prevScore: 0,
          score: 0,
          pointsAdded: 0,
          rank: 1,
          prevRank: 1,
        }
      );
    } catch (e) {
      return { prevScore: 0, score: 0, pointsAdded: 0, rank: 1, prevRank: 1 };
    }
  });

  // Active Session & Lobby Status State
  const [activeSession, setActiveSession] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("imf_quiz_active_session") || "null");
    } catch (e) {
      return null;
    }
  });
  const [isLobbyActive, setIsLobbyActive] = useState(true);
  const [waitingMessage, setWaitingMessage] = useState("Please wait while Quiz Master activates the lobby...");
  const [institution, setInstitution] = useState(() => localStorage.getItem("imf_quiz_institution") || "");
  const [academicYear, setAcademicYear] = useState(() => localStorage.getItem("imf_quiz_year") || "");

  // ── Security / Anti-Cheat State ──
  // "devtools" = hard block (DevTools opened), "tabswitch" = tab-leave (local hard block)
  const [securityViolation, setSecurityViolation] = useState(null);
  const [tabSwitchStrikes, setTabSwitchStrikes] = useState(0);
  const [tabWarningVisible, setTabWarningVisible] = useState(false);
  // tabBlockedUntil: timestamp (ms) when the server-side 2-min ban expires, or null
  const [tabBlockedUntil, setTabBlockedUntil] = useState(null);
  const [tabBlockCountdown, setTabBlockCountdown] = useState(0);
  const TAB_SWITCH_MAX_STRIKES = 5;

  // Synchronized countdown & preloaded question state (0ms latency transition)
  const [readyCountdown, setReadyCountdown] = useState(3);
  const countdownStartsAtRef = useRef(null);
  const preloadedQuestionRef = useRef(null);
  const nextQuestionStartsAtRef = useRef(null);

  const wsRef = useRef(null);
  const timerRef = useRef(null);
  // Ref so the security guard callback can read latest gameState without a stale closure
  const gameStateRef = useRef(gameState);

  const clearSessionAnswers = () => {
    try {
      Object.keys(sessionStorage).forEach((k) => {
        if (
          k.startsWith("imf_ans_") ||
          k === "imf_quiz_last_result" ||
          k === "imf_quiz_personal_score" ||
          k === "imf_quiz_correct_count" ||
          k === "imf_quiz_best_streak" ||
          k === "imf_quiz_q_index"
        ) {
          sessionStorage.removeItem(k);
        }
      });
    } catch (e) {}
    setSelectedOption(null);
    setAnswerSubmitted(false);
    setLastResult(null);
    setCorrectCount(0);
    setBestStreak(0);
  };

  // When activeSession ID changes, purge old session answers
  useEffect(() => {
    if (activeSession?.id) {
      const prevSessId = sessionStorage.getItem("imf_quiz_session_id");
      if (prevSessId && prevSessId !== activeSession.id) {
        clearSessionAnswers();
      }
      sessionStorage.setItem("imf_quiz_session_id", activeSession.id);
    }
  }, [activeSession?.id]);

  // Sync ongoing quiz state to sessionStorage to prevent flashing on reload
  useEffect(() => {
    if (gameState) {
      sessionStorage.setItem("imf_quiz_game_state", gameState);
    }
  }, [gameState]);

  useEffect(() => {
    sessionStorage.setItem("imf_quiz_q_index", String(currentQIndex));
  }, [currentQIndex]);

  useEffect(() => {
    if (activeSession) {
      sessionStorage.setItem("imf_quiz_active_session", JSON.stringify(activeSession));
    }
  }, [activeSession]);

  useEffect(() => {
    if (lastResult) {
      sessionStorage.setItem("imf_quiz_last_result", JSON.stringify(lastResult));
    }
  }, [lastResult]);

  useEffect(() => {
    sessionStorage.setItem("imf_quiz_score", String(score));
  }, [score]);

  useEffect(() => {
    sessionStorage.setItem("imf_quiz_streak", String(streak));
  }, [streak]);

  useEffect(() => {
    if (playerRank !== null) {
      sessionStorage.setItem("imf_quiz_rank", String(playerRank));
    }
  }, [playerRank]);

  useEffect(() => {
    if (leaderboardData && leaderboardData.length > 0) {
      sessionStorage.setItem("imf_quiz_leaderboard", JSON.stringify(leaderboardData));
    }
  }, [leaderboardData]);

  useEffect(() => {
    if (personalScoreInfo) {
      sessionStorage.setItem("imf_quiz_personal_score", JSON.stringify(personalScoreInfo));
    }
  }, [personalScoreInfo]);

  // Keep gameStateRef in sync so securityGuard callbacks always read the latest value
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // ── Security Guard Effect ──
  // Active only during QUESTION and ANSWER_REVEAL. Fully cleaned up on state change.
  useEffect(() => {
    const guardStates = new Set(["QUESTION", "ANSWER_REVEAL"]);
    if (!guardStates.has(gameState)) return;

    const cleanup = startSecurityGuard({
      getGameState: () => gameStateRef.current,
      onViolation: (reason) => {
        if (reason === "devtools") {
          setSecurityViolation("devtools");
        } else if (reason === "tabswitch") {
          setTabSwitchStrikes((prev) => {
            const next = prev + 1;
            if (next >= TAB_SWITCH_MAX_STRIKES) {
              // Send violation to server — server will block for 2 min across all tabs/refreshes
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                  JSON.stringify({
                    type: "TAB_VIOLATION",
                    playerId,
                    email: playerEmail,
                  })
                );
              }
              // Also set local state immediately (server TAB_BLOCKED will arrive shortly and reinforce it)
              setSecurityViolation("tabswitch");
            } else {
              setTabWarningVisible(true);
              setTimeout(() => setTabWarningVisible(false), 8000);
            }
            return next;
          });
        }
      },
    });

    return cleanup;
  }, [gameState]);

  // Synchronized countdown for Question 1
  useEffect(() => {
    if (gameState !== "COUNTDOWN") return;
    const updateCountdown = () => {
      if (countdownStartsAtRef.current) {
        const remaining = Math.max(0, Math.ceil((countdownStartsAtRef.current - Date.now()) / 1000));
        setReadyCountdown(remaining);
      } else {
        setReadyCountdown((c) => Math.max(0, c - 1));
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 200);
    return () => clearInterval(interval);
  }, [gameState]);

  // Audible tick on each countdown number
  useEffect(() => {
    if (gameState === "COUNTDOWN" && readyCountdown > 0) {
      playTickSound(muted);
    }
  }, [gameState, readyCountdown, muted]);

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

  // Tab-block countdown: ticks every second, auto-refreshes when ban expires
  useEffect(() => {
    if (!tabBlockedUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((tabBlockedUntil - Date.now()) / 1000));
      setTabBlockCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        // Ban expired — reload the page to reconnect clean
        setTimeout(() => window.location.reload(), 500);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [tabBlockedUntil]);

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
              institution,
              academicYear,
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
      if (ws) {
        try {
          ws.send(JSON.stringify({ type: "LEAVE", playerId, email: playerEmail }));
          ws.close(1000, "Unmounted");
        } catch (e) {}
      }
    };
  }, [wsUrl, playerName, regNumber, playerId, playerEmail]);

  // Heartbeat ping every 10s to keep active status fresh with minimal server overhead
  useEffect(() => {
    if (!wsConnected) return;
    const interval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "PING" }));
        } catch (e) {}
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [wsConnected]);

  // When leaving page or closing tab, immediately notify backend
  useEffect(() => {
    const handleLeave = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "LEAVE", playerId, email: playerEmail }));
          wsRef.current.close(1000, "User left page");
        } catch (e) {}
      }
    };
    window.addEventListener("pagehide", handleLeave);
    window.addEventListener("beforeunload", handleLeave);
    return () => {
      window.removeEventListener("pagehide", handleLeave);
      window.removeEventListener("beforeunload", handleLeave);
    };
  }, [playerId, playerEmail]);

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

  function handleForceJoin() {
    setIsRetrying(true);
    const payload = {
      type: "FORCE_JOIN",
      playerId,
      name: playerName,
      regNumber,
      email: playerEmail,
    };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    } else if (wsUrl) {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => {
          setWsConnected(true);
          ws.send(JSON.stringify(payload));
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

  function handleExitLobby() {
    sessionStorage.removeItem("imf_quiz_in_lobby");
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: "LEAVE", playerId, email: playerEmail }));
        wsRef.current.close(1000, "User exited lobby");
      } catch (e) {}
    }
    if (onExitLobby) {
      onExitLobby(false);
    } else {
      navigate("/quiz");
    }
  }

  function handleSwitchEmail() {
    sessionStorage.removeItem("imf_quiz_in_lobby");
    sessionStorage.removeItem("imf_quiz_pid");
    localStorage.removeItem("imf_quiz_pid");
    sessionStorage.removeItem("imf_quiz_email");
    localStorage.removeItem("imf_quiz_email");
    sessionStorage.removeItem("imf_quiz_name");
    localStorage.removeItem("imf_quiz_name");
    sessionStorage.removeItem("imf_quiz_reg");
    localStorage.removeItem("imf_quiz_reg");
    sessionStorage.removeItem("imf_quiz_institution");
    localStorage.removeItem("imf_quiz_institution");
    sessionStorage.removeItem("imf_quiz_year");
    localStorage.removeItem("imf_quiz_year");
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: "LEAVE", playerId, email: playerEmail }));
        wsRef.current.close(1000, "Switch email");
      } catch (e) {}
    }
    if (onExitLobby) {
      onExitLobby(true);
    } else {
      navigate("/quiz");
    }
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

      case "SESSION_TRANSFERRED":
        setDeviceBlocked(true);
        setDeviceBlockedMsg(
          msg.message || "Your quiz session was transferred to another device or browser tab."
        );
        break;

      case "TAB_BLOCKED": {
        // Server-side 2-minute tab ban — survives refreshes and new tabs
        const until = msg.blockedUntil || (Date.now() + (msg.remainingSec || 120) * 1000);
        setTabBlockedUntil(until);
        setTabBlockCountdown(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
        // Clear any local security violation so the TAB_BLOCKED countdown screen takes over
        setSecurityViolation(null);
        break;
      }

      case "JOINED_SUCCESS":
        setDeviceBlocked(false);
        setIsLobbyActive(true);
        if (msg.session) {
          const prevSess = sessionStorage.getItem("imf_quiz_session_id");
          if (prevSess && prevSess !== msg.session.id) {
            clearSessionAnswers();
          }
          setActiveSession(msg.session);
          try {
            sessionStorage.setItem("imf_quiz_session_id", msg.session.id);
            sessionStorage.setItem("imf_quiz_active_session", JSON.stringify(msg.session));
          } catch (e) {}
        }
        setGameState(msg.gameState || "LOBBY");
        setCurrentQIndex(msg.currentQuestionIdx || 0);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        // A fresh browser has no sessionStorage history. Hydrate these from
        // the server's durable per-question answer log on every successful join.
        if (msg.player && typeof msg.player.correctAnswers === "number") {
          setCorrectCount(msg.player.correctAnswers);
          try {
            sessionStorage.setItem("imf_quiz_correct_count", String(msg.player.correctAnswers));
          } catch (e) {}
        }
        if (msg.player && typeof msg.player.bestStreak === "number") {
          setBestStreak(msg.player.bestStreak);
          try {
            sessionStorage.setItem("imf_quiz_best_streak", String(msg.player.bestStreak));
          } catch (e) {}
        }
        if (msg.gameState === "COUNTDOWN") {
          setGameState("COUNTDOWN");
          if (msg.nextQuestion) preloadedQuestionRef.current = msg.nextQuestion;
        } else if (msg.gameState === "PODIUM" || gameState === "PODIUM") {
          // Do NOT wipe final results or overwrite settled score with 0
          if (msg.player && typeof msg.player.score === "number" && msg.player.score > 0) {
            setScore(msg.player.score);
            try {
              sessionStorage.setItem("imf_quiz_score", String(msg.player.score));
            } catch (e) {}
          }
        } else {
          if (msg.player) {
            if (typeof msg.player.score === "number") setScore(msg.player.score);
            if (typeof msg.player.streak === "number") setStreak(msg.player.streak);
            if (msg.gameState !== "LOBBY" && msg.player.answers && msg.player.answers[msg.currentQuestionIdx]) {
              const existing = msg.player.answers[msg.currentQuestionIdx];
              setSelectedOption(existing.optionKey);
              setAnswerSubmitted(true);
              try {
                const sessId = msg.session?.id || activeSession?.id || "default";
                sessionStorage.setItem(`imf_ans_${sessId}_${msg.currentQuestionIdx}`, existing.optionKey);
              } catch (e) {}
            } else if (msg.gameState === "LOBBY") {
              clearSessionAnswers();
            }
          }
          // Only clear final results if we're not already in PODIUM with saved data
          const hasSavedFinal = !!sessionStorage.getItem("imf_quiz_final_results");
          if (!hasSavedFinal) {
            setFinalResults(null);
            try {
              sessionStorage.removeItem("imf_quiz_final_results");
            } catch (e) {}
          }
        }
        // Request a fresh lobby roster shortly after joining
        // (handles race where the broadcast LOBBY_STATE was consumed by a parallel test socket)
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "REQUEST_LOBBY_STATE" }));
          }
        }, 350);
        break;

      case "LOBBY_INACTIVE":
        setIsLobbyActive(false);
        setWaitingMessage(msg.message || "Please wait while Quiz Master activates the lobby.");
        break;

      case "LOBBY_INACTIVATED":
        setIsLobbyActive(false);
        setActiveSession(null);
        setGameState("LOBBY");
        setCurrentQIndex(0);
        clearSessionAnswers();
        setWaitingMessage(msg.message || "The active session was closed. Please wait while Quiz Master activates a lobby...");
        break;

      case "RESET_TO_LOBBY":
        setGameState("LOBBY");
        setCurrentQIndex(0);
        clearSessionAnswers();
        break;

      case "LOBBY_ACTIVATED": {
        setIsLobbyActive(true);
        const prevSessionId = sessionStorage.getItem("imf_quiz_session_id");
        const newSessionId = msg.session?.id;
        const isNewSession = !prevSessionId || !newSessionId || prevSessionId !== newSessionId;
        if (msg.session) {
          setActiveSession(msg.session);
          try {
            sessionStorage.setItem("imf_quiz_session_id", msg.session.id);
            sessionStorage.setItem("imf_quiz_active_session", JSON.stringify(msg.session));
          } catch (e) {}
        }
        setGameState(msg.gameState || "LOBBY");
        setCurrentQIndex(msg.currentQuestionIdx || 0);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        // Only hard-reset score/streak/results if this is a genuinely different session
        // (not just the same session being re-broadcasted on reconnect)
        if (isNewSession) {
          clearSessionAnswers();
          setScore(0);
          setStreak(0);
          setLastResult(null);
          setFinalResults(null);
          try {
            sessionStorage.removeItem("imf_quiz_final_results");
            sessionStorage.removeItem("imf_quiz_score");
            sessionStorage.removeItem("imf_quiz_streak");
          } catch (e) {}
        }
        // Automatically join the (newly) activated session
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
        }
        break;
      }

      case "PACING_MODE_UPDATED":
        setPacingMode(msg.pacingMode || "auto");
        break;

      case "PONG":
        // Server piggybacks lobby roster on PONG during LOBBY state
        if (msg.players) {
          setLobbyPlayers(msg.players);
          // Self-heal: if we are not in the server roster, re-send JOIN
          if (
            playerId &&
            playerName &&
            !msg.players.some((p) => p.id === playerId) &&
            wsRef.current &&
            wsRef.current.readyState === WebSocket.OPEN
          ) {
            wsRef.current.send(
              JSON.stringify({
                type: "JOIN",
                playerId,
                name: playerName,
                regNumber,
                email: playerEmail,
              })
            );
          }
        }
        break;

      case "LOBBY_STATE":
        setLobbyPlayers(msg.players || []);
        if (msg.activeSession !== undefined) {
          setActiveSession(msg.activeSession);
          setIsLobbyActive(!!msg.activeSession);
        }
        // Self-heal: if we are not in the server roster, re-send JOIN
        if (
          playerId &&
          playerName &&
          msg.players &&
          !msg.players.some((p) => p.id === playerId) &&
          wsRef.current &&
          wsRef.current.readyState === WebSocket.OPEN
        ) {
          wsRef.current.send(
            JSON.stringify({
              type: "JOIN",
              playerId,
              name: playerName,
              regNumber,
              email: playerEmail,
            })
          );
        }
        break;

      case "QUIZ_PAUSED":
        setIsPaused(true);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (msg.remainingSec !== undefined) {
          setTimeLeft(msg.remainingSec);
        }
        break;

      case "QUIZ_RESUMED":
        setIsPaused(false);
        if (msg.gameState === "QUESTION" && msg.remainingSec !== undefined) {
          startClientTimer(msg.remainingSec);
        }
        break;

      case "QUIZ_COUNTDOWN":
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState("COUNTDOWN");
        setReadyCountdown(msg.durationSec || 3);
        countdownStartsAtRef.current = msg.startsAt || (Date.now() + (msg.durationSec || 3) * 1000);
        if (msg.nextQuestion) {
          preloadedQuestionRef.current = msg.nextQuestion;
        }
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        playSelectSound(muted);
        break;

      case "QUESTION_START":
        setIsPaused(!!msg.isPaused);
        setGameState("QUESTION");
        setCurrentQIndex(msg.question.index);
        setTimeLeft(msg.question.durationSec || QUESTION_TIMER_SEC);
        if (msg.question) {
          preloadedQuestionRef.current = msg.question;
        }
        {
          const sessId = activeSession?.id || sessionStorage.getItem("imf_quiz_session_id") || "default";
          const restoredAns =
            msg.selectedOption ||
            sessionStorage.getItem(`imf_ans_${sessId}_${msg.question.index}`);
          if (restoredAns) {
            setSelectedOption(restoredAns);
            setAnswerSubmitted(true);
          } else if (msg.alreadyAnswered) {
            setAnswerSubmitted(true);
          } else {
            setSelectedOption(null);
            setAnswerSubmitted(false);
          }
        }
        setLastResult(null);
        setRevealStats(null);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        startClientTimer(msg.question.durationSec || QUESTION_TIMER_SEC);
        break;

      case "ANSWER_ACK":
        setAnswerSubmitted(true);
        if (msg.optionKey) {
          setSelectedOption(msg.optionKey);
          try {
            const sessId = activeSession?.id || sessionStorage.getItem("imf_quiz_session_id") || "default";
            sessionStorage.setItem(`imf_ans_${sessId}_${msg.questionIndex}`, msg.optionKey);
          } catch (e) {}
        }
        break;

      case "ANSWER_RESULT":
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState("ANSWER_REVEAL");
        setLastResult(msg);
        if (msg.nextQuestion) {
          preloadedQuestionRef.current = msg.nextQuestion;
        }
        {
          const sessId = activeSession?.id || sessionStorage.getItem("imf_quiz_session_id") || "default";
          const revealedAns =
            msg.selectedOption ||
            sessionStorage.getItem(`imf_ans_${sessId}_${msg.questionIndex}`);
          if (revealedAns) {
            setSelectedOption(revealedAns);
            setAnswerSubmitted(true);
          }
        }
        setScore(msg.totalScore || 0);
        const curStreak = msg.streak || 0;
        setStreak(curStreak);
        setBestStreak((prev) => {
          const next = Math.max(prev, curStreak);
          sessionStorage.setItem("imf_quiz_best_streak", String(next));
          return next;
        });
        setRevealStats(msg.stats);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        setRevealCountdown(msg.autoNextSec || (msg.pacingMode === "auto" ? 6 : 0));

        if (msg.isCorrect) {
          setCorrectCount((prev) => {
            const next = prev + 1;
            sessionStorage.setItem("imf_quiz_correct_count", String(next));
            return next;
          });
          playCorrectSound(muted);
          triggerCorrectConfetti();
        } else {
          playIncorrectSound(muted);
        }
        break;

      case "HOST_REVEAL":
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState("ANSWER_REVEAL");
        if (msg.nextQuestion) {
          preloadedQuestionRef.current = msg.nextQuestion;
        }
        setRevealStats(msg.stats);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        setRevealCountdown(msg.autoNextSec || (msg.pacingMode === "auto" ? 6 : 0));
        break;

      case "LEADERBOARD_VIEW":
        setGameState("LEADERBOARD");
        setLeaderboardData(msg.cluster || msg.top10 || []);
        if (msg.nextQuestion) {
          preloadedQuestionRef.current = msg.nextQuestion;
        }
        if (msg.nextQuestionStartsAt) {
          nextQuestionStartsAtRef.current = msg.nextQuestionStartsAt;
        }
        if (msg.rank) setPlayerRank(msg.rank);
        if (msg.totalScore !== undefined) setScore(msg.totalScore);
        if (msg.streak !== undefined) setStreak(msg.streak);
        if (msg.pacingMode) setPacingMode(msg.pacingMode);
        setLeaderboardCountdown(msg.autoNextSec || (msg.pacingMode === "auto" ? 5 : 0));
        setPersonalScoreInfo({
          prevScore: msg.prevScore ?? Math.max(0, (msg.totalScore ?? score) - (msg.pointsAdded || 0)),
          score: msg.totalScore ?? score,
          pointsAdded: msg.pointsAdded ?? 0,
          rank: msg.rank ?? playerRank,
          prevRank: msg.prevRank ?? (msg.rank ?? playerRank),
        });
        try {
          sessionStorage.setItem("imf_quiz_leaderboard", JSON.stringify(msg.cluster || msg.top10 || []));
          if (msg.rank) sessionStorage.setItem("imf_quiz_rank", String(msg.rank));
        } catch (e) {}
        break;

      case "QUIZ_FINISHED":
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState("PODIUM");
        setFinalResults(msg);
        try {
          sessionStorage.setItem("imf_quiz_game_state", "PODIUM");
          sessionStorage.setItem("imf_quiz_final_results", JSON.stringify(msg));
        } catch (e) {}
        if (msg.session) {
          const prevId = sessionStorage.getItem("imf_quiz_session_id");
          if (prevId && prevId !== msg.session.id) {
            clearSessionAnswers();
          }
          setActiveSession(msg.session);
          try {
            sessionStorage.setItem("imf_quiz_active_session", JSON.stringify(msg.session));
            sessionStorage.setItem("imf_quiz_session_id", msg.session.id);
          } catch (e) {}
        }
        if (msg.correctAnswers !== undefined) {
          setCorrectCount(msg.correctAnswers);
          try {
            sessionStorage.setItem("imf_quiz_correct_count", String(msg.correctAnswers));
          } catch (e) {}
        }
        const msgBest = Math.max(Number(msg.bestStreak) || 0, Number(msg.maxStreak) || 0, Number(msg.streak) || 0);
        setBestStreak(msgBest);
        try {
          sessionStorage.setItem("imf_quiz_best_streak", String(msgBest));
        } catch (e) {}
        if (msg.rank) {
          setPlayerRank(msg.rank);
          try {
            sessionStorage.setItem("imf_quiz_rank", String(msg.rank));
          } catch (e) {}
        }
        if (msg.totalScore !== undefined) {
          setScore(msg.totalScore);
          try {
            sessionStorage.setItem("imf_quiz_score", String(msg.totalScore));
          } catch (e) {}
        }
        if (msg.streak !== undefined) setStreak(msg.streak);
        if (msg.fullLeaderboard) setLeaderboardData(msg.fullLeaderboard);
        playFanfareSound(muted);
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
    if (isPaused || answerSubmitted || gameState !== "QUESTION") return;
    playSelectSound(muted);
    setSelectedOption(optionKey);
    setAnswerSubmitted(true);
    try {
      const sessId = activeSession?.id || sessionStorage.getItem("imf_quiz_session_id") || "default";
      sessionStorage.setItem(`imf_ans_${sessId}_${currentQIndex}`, optionKey);
    } catch (e) {}

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

  // ── Server-Side Tab Block Overlay ──
  // Shown when the server has issued a 2-minute ban (TAB_BLOCKED message).
  // Question is fully unmounted. Countdown auto-refreshes when ban expires.
  if (tabBlockedUntil && tabBlockCountdown > 0) {
    const mins = Math.floor(tabBlockCountdown / 60);
    const secs = tabBlockCountdown % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    return (
      <div
        className="fixed inset-0 z-[99999] bg-slate-950 flex flex-col items-center justify-center p-6 text-center"
        style={{ userSelect: "none", WebkitUserSelect: "none" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-amber-500/20 to-orange-500/10 border-2 border-amber-500/50 flex items-center justify-center shadow-2xl mx-auto">
            <span className="text-5xl select-none">⏳</span>
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 animate-ping" />
          </div>
        </div>

        <span className="px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/30 mb-4 inline-block">
          Temporary Access Suspension
        </span>

        <h1 className="text-2xl sm:text-3xl font-black text-white mb-3 leading-snug">
          You Left the Quiz Tab Too Many Times
        </h1>

        <p className="text-sm sm:text-base text-slate-300 mb-6 max-w-sm leading-relaxed">
          Switching away from the quiz tab is not permitted. Your access has been suspended for <strong className="text-amber-400">2 minutes</strong>. You will be automatically reconnected when the timer expires.
        </p>

        {/* Live countdown ring */}
        <div className="w-32 h-32 rounded-full border-4 border-slate-800 flex flex-col items-center justify-center mb-6 relative shadow-xl">
          <div className="absolute inset-0 rounded-full border-4 border-amber-500/60" style={{ clipPath: "inset(0)" }} />
          <span className="text-3xl font-black text-amber-400 font-mono">{timeStr}</span>
          <span className="text-[10px] text-slate-400 font-semibold mt-0.5">remaining</span>
        </div>

        <p className="text-xs text-slate-500 max-w-xs">
          This suspension applies across all browser tabs and refreshes. Please remain on this screen.
        </p>
      </div>
    );
  }

  // ── Security Violation Overlay ──
  // When securityViolation is set, the question is FULLY UNMOUNTED (not just hidden).
  // This ensures zero question text exists anywhere in the DOM for DevTools to inspect.
  if (securityViolation) {
    const isDevTools = securityViolation === "devtools";
    return (
      <div
        className="fixed inset-0 z-[99999] bg-slate-950 flex flex-col items-center justify-center p-6 text-center"
        style={{ userSelect: "none", WebkitUserSelect: "none" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Animated warning icon */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-rose-500/20 to-amber-500/20 border-2 border-rose-500/50 flex items-center justify-center shadow-2xl mx-auto">
            <span className="text-5xl select-none">{isDevTools ? "🔍" : "⚠️"}</span>
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 animate-ping" />
          </div>
        </div>

        <span className="px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest bg-rose-500/10 text-rose-400 border border-rose-500/30 mb-4 inline-block">
          {isDevTools ? "Security Violation Detected" : "Tab Switch Limit Reached"}
        </span>

        <h1 className="text-2xl sm:text-3xl font-black text-white mb-3 leading-snug">
          {isDevTools
            ? "Developer Tools Detected"
            : "You've Left the Quiz Too Many Times"}
        </h1>

        <p className="text-sm sm:text-base text-slate-300 mb-4 max-w-sm leading-relaxed">
          {isDevTools
            ? "Browser Developer Tools must be closed to participate. Please disable any browser extensions that open DevTools automatically, close DevTools, and refresh to continue."
            : `Leaving the quiz tab is not permitted. You have switched away from the quiz ${TAB_SWITCH_MAX_STRIKES} times. Please contact a Quiz Invigilator for assistance.`}
        </p>

        {isDevTools && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 max-w-sm text-xs text-slate-400 text-left leading-relaxed">
            <p className="font-bold text-slate-300 mb-1">To continue:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Close DevTools (press F12 or Ctrl+Shift+I to toggle)</li>
              <li>Disable any "Allow Copy" or "Enable Right Click" extensions</li>
              <li>Refresh the page</li>
            </ol>
          </div>
        )}

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 transition-all active:scale-95"
        >
          🔄 Refresh to Continue
        </button>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans quiz-secure-content"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Tab-Switch Warning Banner (slides in from top, auto-hides after 8s) */}
      {tabWarningVisible && (
        <div
          className="fixed top-0 inset-x-0 z-[99998] flex items-center justify-center pointer-events-none"
          style={{ animation: "slideDown 0.35s cubic-bezier(0.16,1,0.3,1) forwards" }}
        >
          <div
            className="mt-3 mx-4 max-w-md w-full px-4 py-3 rounded-2xl bg-amber-500 text-slate-950 shadow-2xl shadow-amber-500/40 flex items-center gap-3 font-bold text-sm pointer-events-auto cursor-pointer border-2 border-amber-300"
            role="alert"
            onClick={() => setTabWarningVisible(false)}
          >
            <span className="text-xl shrink-0">⚠️</span>
            <div className="flex-1 text-left">
              <div className="font-black">Tab Switch Warning — Strike {tabSwitchStrikes} of {TAB_SWITCH_MAX_STRIKES - 1}</div>
              <div className="text-xs font-semibold opacity-80">Stay on the quiz tab. {TAB_SWITCH_MAX_STRIKES - 1 - tabSwitchStrikes} warning(s) remaining before access is blocked.</div>
            </div>
            <span className="text-xs opacity-60 shrink-0">✕</span>
          </div>
        </div>
      )}

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
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700/80 text-xs">
              <svg
                className="w-3.5 h-3.5 text-slate-400 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
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
                  ? activeSession
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  wsConnected ? (activeSession ? "bg-emerald-400" : "bg-amber-400 animate-pulse") : "bg-amber-400"
                }`}
              />
              <span className="hidden sm:inline">
                {!wsConnected ? "Reconnecting..." : activeSession ? "Live Room" : "Standby Queue"}
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

            {/* Exit Lobby */}
            <button
              onClick={handleExitLobby}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 text-xs font-bold transition active:scale-95 shadow-sm"
              title="Leave lobby and return to verification"
            >
              <span>🚪</span>
              <span className="hidden sm:inline">Exit Lobby</span>
              <span className="sm:hidden">Exit</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main
        className={`flex-1 mx-auto w-full px-3 py-4 sm:p-6 lg:p-8 flex flex-col justify-center transition-all ${
          gameState === "PODIUM" || gameState === "LEADERBOARD"
            ? "max-w-5xl"
            : "max-w-2xl"
        }`}
      >
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

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleForceJoin}
                disabled={isRetrying}
                className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isRetrying ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                    <span>Switching Session to This Device...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Switch to This Device (Close Other Device)</span>
                  </>
                )}
              </button>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleRetryJoin}
                  disabled={isRetrying}
                  className="w-full sm:w-1/2 px-5 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <span>🔄</span>
                  <span>Check Again</span>
                </button>

                <button
                  type="button"
                  onClick={handleSwitchEmail}
                  className="w-full sm:w-1/2 px-5 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition active:scale-95"
                >
                  Use Different Email
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
        {/* ── 1. UNIFIED BULLETPROOF LIVE ARENA LOBBY ── */}
        {gameState === "LOBBY" && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Status Pill */}
            {activeSession ? (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-4 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{activeSession.name}</span>
              </div>
            ) : !wsConnected ? (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black bg-slate-800 text-slate-300 border border-slate-700 mb-4 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
                <span>Connecting to Live Arena...</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black bg-amber-500/10 text-amber-300 border border-amber-500/30 mb-4 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Standby Queue • No Active Lobby</span>
              </div>
            )}

            {/* Doctor Greeting (Prerendered immediately from storage) */}
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-1 tracking-tight">
              You are in, "{playerName}"
            </h2>
            <p className="text-sm sm:text-base font-bold text-emerald-400 mb-4">
              from {institution || "Medical College"} ({academicYear || "Participant"})
            </p>

            {!activeSession && wsConnected && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 mb-4 text-xs text-amber-200/90 leading-relaxed text-center">
                No quiz round is currently active. You are waiting in the <strong>standby queue</strong> and will automatically enter as soon as Quiz Master starts a lobby!
              </div>
            )}

            <div className="bg-slate-950 rounded-2xl p-3.5 border border-slate-800/80 flex items-center justify-between text-xs mb-4">
              <span className="text-slate-400">Reg No:</span>
              <span className="font-mono text-emerald-400 font-bold">
                {regNumber || "DELEGATE"}
              </span>
            </div>

            {/* Doctors in Standby Queue vs Live Arena */}
            <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800/60 mb-4">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-center gap-2">
                <span className={`w-2 h-2 rounded-full ${activeSession ? "bg-emerald-400 animate-pulse" : !wsConnected ? "bg-sky-400 animate-pulse" : "bg-amber-400"}`} />
                <span>
                  {activeSession
                    ? `Doctors in Live Arena (${lobbyPlayers.length})`
                    : !wsConnected
                    ? "Connecting to Arena..."
                    : `Doctors in Standby Queue (${lobbyPlayers.length})`}
                </span>
              </div>
              {lobbyPlayers.length > 0 ? (() => {
                const meInServer = lobbyPlayers.find((p) => p.id === playerId);
                const otherPlayers = lobbyPlayers.filter((p) => p.id !== playerId);
                const maxOthers = meInServer ? 24 : 25;
                const displayedOthers = otherPlayers.slice(0, maxOthers);
                const totalDisplayed = (meInServer ? 1 : 0) + displayedOthers.length;
                const remaining = lobbyPlayers.length - totalDisplayed;

                return (
                  <div className="flex flex-wrap gap-1.5 justify-center max-h-28 overflow-y-auto p-1">
                    {/* First name: Person itself, ONLY if verified in server roster */}
                    {meInServer && (
                      <span
                        key={meInServer.id}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm shadow-emerald-500/10"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>{meInServer.name}</span>
                        <span className="text-[10px] text-emerald-400/80 font-normal">(You)</span>
                      </span>
                    )}

                    {/* Other doctors: NO green dot, clean subtle styling */}
                    {displayedOthers.map((p, idx) => (
                      <span
                        key={p.id || idx}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800/80 text-slate-300 border border-slate-700/40"
                      >
                        {p.name}
                      </span>
                    ))}

                    {/* Subtle badge for remaining doctors */}
                    {remaining > 0 && (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800/40 text-slate-400 border border-slate-700/30">
                        +{remaining} more {remaining === 1 ? "doctor" : "doctors"} in arena
                      </span>
                    )}
                  </div>
                );
              })() : (
                <p className="text-xs text-slate-400 italic">
                  {activeSession
                    ? `You are connected and registered as "${playerName}". Questions will appear when launched by Quiz Master.`
                    : !wsConnected
                    ? "Establishing connection with the live quiz arena..."
                    : `You are connected in standby as "${playerName}". When Quiz Master activates a round, you will enter automatically!`}
                </p>
              )}
            </div>

            {/* Radar Activity Scanner */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-center gap-2.5 mb-4">
              <span className="text-xs font-mono text-slate-300">
                {activeSession
                  ? "Live Arena Active • Awaiting Quiz Master to launch Question 1"
                  : !wsConnected
                  ? "Connecting to Live Arena server..."
                  : "Standby Queue • Auto-joining when Quiz Master activates a lobby..."}
              </span>
            </div>

            {/* Exit Lobby Button */}
            <button
              type="button"
              onClick={handleExitLobby}
              className="w-full py-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:text-rose-200 font-black text-xs transition flex items-center justify-center gap-2 active:scale-95 shadow-sm"
            >
              <span>🚪</span>
              <span>{activeSession ? "Exit Lobby" : "Exit Standby"}</span>
            </button>
          </div>
        )}

        {/* ── 1.5 SYNCHRONIZED "GET READY" COUNTDOWN (QUESTION 1 ONLY) ── */}
        {gameState === "COUNTDOWN" && (
          <div className="bg-slate-900/95 border border-emerald-500/30 rounded-3xl p-8 sm:p-12 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200 relative overflow-hidden my-auto max-w-lg mx-auto w-full">
            <div className="absolute -top-24 -right-24 w-56 h-56 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-5 shadow-sm tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>IMF 2026 Clinical Arena</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
              GET READY!
            </h2>
            <p className="text-sm font-bold text-emerald-400 mb-8">
              Question 1 of {QUIZ_QUESTIONS.length} Starting Soon
            </p>

            {/* Giant Pulsing Kahoot Countdown Ring */}
            <div className="relative w-36 h-36 mx-auto mb-8 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500/30 animate-ping opacity-50" />
              <div className="absolute inset-2 rounded-full border-2 border-teal-400/40 animate-pulse" />
              <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-2xl shadow-emerald-500/40 text-slate-950 font-black text-6xl font-mono">
                {readyCountdown > 0 ? readyCountdown : "GO!"}
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 font-medium max-w-sm mx-auto leading-relaxed">
              ⚡ All doctor phones are synchronized. Fast answers earn maximum Kahoot speed points!
            </div>
          </div>
        )}

        {/* ── 2. ACTIVE QUESTION (MOBILE TAP BUTTONS) ── */}
        {/* ── 2. ACTIVE QUESTION & IN-PLACE ANSWER REVEAL (KAHOOT STYLE) ── */}
        {(gameState === "QUESTION" || gameState === "ANSWER_REVEAL") && (
          <div className="relative space-y-4 animate-in fade-in duration-150">
            {/* Header: Bigger 'Question X of Y' font, removed specialty */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 flex items-center justify-between shadow-lg">
              <div className="text-base sm:text-xl font-black text-white tracking-tight">
                Question {currentQIndex + 1} of {QUIZ_QUESTIONS.length}
              </div>

              {gameState === "QUESTION" ? (
                <div
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-mono text-xs sm:text-sm font-black ${
                    isPaused
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : timeLeft <= 5
                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse scale-105"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  }`}
                >
                  {isPaused ? "⏸️ Paused" : `⏱️ ${timeLeft}s`}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  <span>Scoreboard in {revealCountdown}s</span>
                </div>
              )}
            </div>

            {/* Countdown Paused Floating Notification */}
            {isPaused && gameState === "QUESTION" && (
              <div className="rounded-2xl bg-amber-500/95 border border-amber-300 text-slate-950 px-4 py-2.5 text-center font-black text-xs sm:text-sm shadow-xl flex items-center justify-center gap-2 animate-pulse">
                <span>⏸️</span>
                <span>Exam Countdown Paused by Quiz Master ({timeLeft}s remaining)</span>
              </div>
            )}

            {/* Kahoot Angular Fly-Through Result Ribbon (Enters from left at -2.5deg -> holds in center -> exits to right) */}
            {gameState === "ANSWER_REVEAL" && (
              <div
                key={`reveal-${currentQIndex}`}
                className="absolute inset-x-0 -top-2 bottom-0 overflow-hidden pointer-events-none z-50 flex items-start justify-center pt-14 sm:pt-16"
              >
                <div
                  className={`animate-kahoot-fly w-[94%] sm:w-[90%] max-w-lg py-3.5 sm:py-4 px-5 sm:px-6 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex items-center justify-between border-2 backdrop-blur-md ${
                    lastResult?.isCorrect
                      ? "bg-[#26890c] border-emerald-300 text-white shadow-emerald-500/40"
                      : !selectedOption
                      ? "bg-[#d89e00] border-amber-300 text-white shadow-amber-500/40"
                      : "bg-[#e21b3c] border-rose-300 text-white shadow-red-500/40"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="w-10 sm:w-11 h-10 sm:h-11 rounded-full bg-white/25 flex items-center justify-center font-black text-2xl sm:text-3xl shrink-0 shadow-inner">
                      {lastResult?.isCorrect ? "✔" : !selectedOption ? "⏰" : "✖"}
                    </span>
                    <div className="text-left">
                      <div className="text-xl sm:text-2xl font-black tracking-tight leading-none mb-1">
                        {lastResult?.isCorrect ? "Correct!" : !selectedOption ? "Time's up!" : "Incorrect"}
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-white/95 leading-tight">
                        {lastResult?.isCorrect
                          ? `+${(lastResult?.pointsEarned || 0).toLocaleString()} points`
                          : !selectedOption
                          ? "No answer selected in time"
                          : "Better luck next question!"}
                      </div>
                    </div>
                  </div>

                  {lastResult?.isCorrect && (
                    <div className="text-right pl-2">
                      <div className="px-3 py-1.5 rounded-xl bg-white/20 backdrop-blur-sm text-xs sm:text-sm font-black border border-white/30 inline-flex items-center gap-1.5 shadow-md">
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
              {activeQuestion.options.map((opt, optIdx) => {
                const theme = KAHOOT_OPTION_THEMES[opt.key] || KAHOOT_OPTION_THEMES.A;
                const isSelected = selectedOption === opt.key;
                const isRevealed = gameState === "ANSWER_REVEAL";
                const isCorrectOption =
                  isRevealed &&
                  (opt.key === lastResult?.correctAnswer ||
                    opt.key === lastResult?.correctOption ||
                    opt.key === activeQuestion.correctAnswer);
                const isWrongSelection = isRevealed && isSelected && !isCorrectOption;

                // Responsive badge corner position:
                // If single column (stacked on mobile < sm): upper-left corner for all
                // If 2-column grid (sm:): left column in upper-left, right column in upper-right
                const isRightCol = optIdx % 2 === 1;
                const badgePosClass = isRightCol
                  ? "absolute top-2.5 left-3.5 sm:left-auto sm:right-3.5"
                  : "absolute top-2.5 left-3.5";

                let buttonStyle = "";
                let badge = null;

                if (isRevealed) {
                  if (isCorrectOption) {
                    // Correct answer: solid bright active green
                    buttonStyle =
                      "bg-[#26890c] text-white border-2 border-emerald-300 ring-4 ring-green-400/50 shadow-2xl scale-[1.02] font-black";
                    badge = (
                      <span className="w-7 h-7 rounded-full bg-[#1e6f0a] border-2 border-white text-white flex items-center justify-center font-black text-sm shadow-md shrink-0">
                        ✔
                      </span>
                    );
                  } else if (isWrongSelection) {
                    // Selected wrong answer: solid bright active red with cross
                    buttonStyle =
                      "bg-[#e21b3c] text-white border-2 border-rose-300 ring-4 ring-rose-500/50 shadow-2xl scale-[1.01] font-black";
                    badge = (
                      <span className="w-7 h-7 rounded-full bg-[#b0132c] border-2 border-white text-white flex items-center justify-center font-black text-xs shrink-0">
                        ✖
                      </span>
                    );
                  } else {
                    // Unselected other options: red background and a bit faded / inactive type with faint cross
                    buttonStyle =
                      "bg-[#e21b3c]/20 border border-red-500/30 text-red-200/50 font-semibold opacity-60";
                    badge = (
                      <span className="w-6 h-6 rounded-full bg-red-950/60 border border-red-500/30 text-red-300/60 flex items-center justify-center font-black text-xs shrink-0">
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
                    {/* Shape is visible ONLY during question, GONE when answer is revealed */}
                    {!isRevealed && (
                      <span className="absolute top-2.5 left-3 sm:top-3 sm:left-3.5 flex items-center justify-center select-none pointer-events-none drop-shadow-sm">
                        <KahootShape shape={opt.key} className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/85" />
                      </span>
                    )}

                    {/* Option Text centered and wrapped properly */}
                    <span className="text-xs sm:text-sm sm:text-base font-extrabold leading-snug px-7 sm:px-6">
                      {opt.text}
                    </span>

                    {/* Reveal badge in responsive upper corner */}
                    {badge && (
                      <div className={badgePosClass}>
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

            {/* Neighborhood Standings (2 Above You, YOU, 2 Below You) with overtaking swap animation */}
            <div className="mb-4">
              <AnimatedScoreboardList
                players={leaderboardData}
                isHost={false}
                currentUserName={playerName}
              />
            </div>

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
              <span className="px-4 py-1.5 rounded-full text-xs sm:text-sm font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-block mb-2 uppercase tracking-wider">
                {finalResults?.session?.name || activeSession?.name || "IMF 2026 Grand Finale"}
              </span>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto font-medium">
                Inspiring the Future of Internal Medicine
              </p>
            </div>

            {/* Doctor's Personal Highlight Card */}
            <div className="bg-gradient-to-r from-purple-900/60 via-[#3a135e]/80 to-slate-900 border-2 border-purple-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-purple-950/50">
              <div className="text-xs uppercase font-extrabold tracking-widest text-purple-300 mb-2">
                {finalResults?.didNotParticipate ? "Quiz Results" : "Your Official Final Standing"}
              </div>
              {finalResults?.didNotParticipate && (
                <div className="flex items-center gap-3 py-3 px-4 mb-4 bg-slate-800/60 border border-slate-600/40 rounded-2xl text-slate-300 text-sm font-semibold">
                  <span className="text-2xl">📋</span>
                  <span>You were not registered as a participant in this quiz session. The results below show the official standings.</span>
                </div>
              )}

              {!finalResults?.didNotParticipate && (
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
                        <span className="text-xs text-purple-300 font-mono ml-2">[{regNumber}]</span>
                      )}
                    </div>
                    {(finalResults?.me?.institution || institution || finalResults?.me?.academicYear || academicYear) && (
                      <div className="text-xs sm:text-sm font-semibold text-purple-200 mt-1 flex flex-wrap items-center gap-1.5">
                        <span>{finalResults?.me?.institution || institution || "Medical College"}</span>
                        {(finalResults?.me?.academicYear || academicYear) && (
                          <>
                            <span className="text-purple-400">•</span>
                            <span className="text-purple-300 font-medium">{finalResults?.me?.academicYear || academicYear}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6 sm:border-l sm:border-purple-800/60 sm:pl-6 w-full sm:w-auto justify-between sm:justify-start">
                    <div>
                      <div className="text-xs text-purple-300 font-semibold mb-0.5">Total Points</div>
                      <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                        {Math.max(Number(finalResults?.totalScore)||0, Number(finalResults?.me?.score)||0, Number(score)||0, Number(sessionStorage.getItem("imf_quiz_score"))||0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-purple-300 font-semibold mb-0.5">Corrects</div>
                      <div className="text-2xl sm:text-3xl font-black text-teal-300 font-mono">
                        {Math.max(Number(finalResults?.correctAnswers)||0, Number(correctCount)||0, Number(sessionStorage.getItem("imf_quiz_correct_count"))||0)}/{finalResults?.totalQuestions || QUIZ_QUESTIONS.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-purple-300 font-semibold mb-0.5">Best Streak</div>
                      <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono flex items-center gap-1">
                        <span>{Math.max(Number(finalResults?.bestStreak)||0, Number(finalResults?.maxStreak)||0, Number(finalResults?.streak)||0, Number(bestStreak)||0, Number(streak)||0, Number(sessionStorage.getItem("imf_quiz_best_streak"))||0)}</span>
                        <span className="text-base">🔥</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Champions Showcase (Top 10) */}
            {((finalResults?.champions && finalResults.champions.length > 0) || (finalResults?.podium && finalResults.podium.length > 0) || leaderboardData.length > 0) && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-3.5 sm:p-7 md:p-8 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🏆</span>
                    <h2 className="text-base sm:text-lg font-black text-white tracking-wide uppercase">
                      Champions
                    </h2>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                    Top 10
                  </span>
                </div>

                <div className="space-y-2.5">
                  {(finalResults?.champions || finalResults?.podium || leaderboardData).slice(0, 10).map((champ, idx) => {
                    const rank = champ.rank || idx + 1;
                    const isMe = champ.id === playerId || champ.isMe || (regNumber && champ.regNumber && champ.regNumber.toUpperCase() === regNumber.toUpperCase());
                    const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };
                    const rankBadge = medals[rank] || `#${rank}`;
                    
                    const isTop3 = rank <= 3;
                    const rowStyles = isMe
                      ? "bg-gradient-to-r from-emerald-900/40 to-teal-900/40 border-2 border-emerald-400 shadow-lg text-white"
                      : isTop3
                      ? rank === 1
                        ? "bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-slate-900 border border-amber-400/50 text-amber-100"
                        : rank === 2
                        ? "bg-gradient-to-r from-slate-400/15 via-slate-500/10 to-slate-900 border border-slate-400/50 text-slate-200"
                        : "bg-gradient-to-r from-amber-700/15 via-amber-800/10 to-slate-900 border border-amber-700/50 text-amber-200"
                      : "bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 text-slate-200";

                    return (
                      <div
                        key={champ.id || idx}
                        className={`flex items-center justify-between px-3.5 sm:px-5 py-3.5 rounded-2xl transition ${rowStyles}`}
                      >
                        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 mr-2">
                          <span className={`w-7 sm:w-8 text-center text-sm font-black shrink-0 ${isTop3 ? "text-base sm:text-lg" : "text-slate-400"}`}>
                            {rankBadge}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-sm sm:text-base font-black text-white break-words leading-tight">
                                {champ.name}
                              </span>
                              {champ.regNumber && (
                                <span className="text-[11px] sm:text-xs text-slate-400 font-mono whitespace-nowrap">
                                  [{champ.regNumber}]
                                </span>
                              )}
                              {isMe && (
                                <span className="px-1.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                                  YOU
                                </span>
                              )}
                            </div>
                            {(champ.institution || champ.college || champ.academicYear || champ.year || (isMe && (institution || academicYear))) && (
                              <div className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
                                <span className="text-purple-300/90 break-words">
                                  {champ.institution || champ.college || (isMe ? institution : "")}
                                </span>
                                {(champ.academicYear || champ.year || (isMe ? academicYear : "")) && (
                                  <>
                                    <span className="text-slate-500">•</span>
                                    <span className="text-slate-300 font-bold whitespace-nowrap">
                                      {champ.academicYear || champ.year || (isMe ? academicYear : "")}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pl-2">
                          <span className="font-mono text-sm sm:text-base font-black text-emerald-400 whitespace-nowrap">
                            {(champ.score || 0).toLocaleString()} pts
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Surrounding Standings Table: 5 Above You & 5 Below You (Only if participated) */}
            {!finalResults?.didNotParticipate && (
              <div className="bg-[#2b0f42] border-2 border-[#572182] rounded-3xl p-3.5 sm:p-7 md:p-8 shadow-2xl text-white relative overflow-hidden">
                <div className="border-b border-purple-800/60 pb-3 mb-4">
                  <h3 className="text-base sm:text-xl font-black text-white flex items-center gap-2">
                    <span>📍</span>
                    <span>Your Neighborhood Standings</span>
                  </h3>
                </div>

                {/* Rows List */}
                <div className="space-y-2.5">
                  {/* Doctors Above Me */}
                  {finalResults?.above5 &&
                    finalResults.above5.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-3.5 sm:px-5 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                      >
                        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 mr-2">
                          <span className="w-7 sm:w-8 text-sm sm:text-base font-black text-purple-300 shrink-0">
                            #{p.rank}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-sm sm:text-base font-bold text-slate-200 break-words leading-tight">
                                {p.name}
                              </span>
                              {p.regNumber && (
                                <span className="text-[11px] sm:text-xs text-purple-300 font-mono whitespace-nowrap">
                                  [{p.regNumber}]
                                </span>
                              )}
                            </div>
                            {(p.institution || p.college || p.academicYear || p.year) && (
                              <div className="text-[11px] sm:text-xs text-purple-300/80 font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
                                <span className="break-words">{p.institution || p.college}</span>
                                {(p.academicYear || p.year) && (
                                  <>
                                    <span className="text-purple-400/60">•</span>
                                    <span className="text-purple-200 font-bold whitespace-nowrap">{p.academicYear || p.year}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pl-2">
                          <span className="font-mono text-sm sm:text-base font-black text-slate-200 whitespace-nowrap">
                            {(p.score || 0).toLocaleString()} pts
                          </span>
                        </div>
                      </div>
                    ))}

                  {/* MY ROW (Prominently Highlighted) */}
                  <div className="flex items-center justify-between px-3.5 sm:px-6 py-4 rounded-2xl bg-gradient-to-r from-[#7a2cb8] to-[#501784] border-2 border-[#b06cf5] shadow-xl shadow-purple-950/60 text-white font-black scale-[1.01]">
                    <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 mr-2">
                      <span className="w-7 sm:w-8 text-base sm:text-lg font-black text-white shrink-0">
                        #{finalResults?.rank || playerRank || 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-base sm:text-lg font-black text-white break-words leading-tight">
                            {finalResults?.me?.name || playerName || "Dr. Delegate"}
                          </span>
                          {(finalResults?.me?.regNumber || regNumber) && (
                            <span className="text-[11px] sm:text-xs text-purple-200 font-mono whitespace-nowrap">
                              [{finalResults?.me?.regNumber || regNumber}]
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                            YOU
                          </span>
                        </div>
                        {(finalResults?.me?.institution || finalResults?.me?.college || institution || finalResults?.me?.academicYear || finalResults?.me?.year || academicYear) && (
                          <div className="text-[11px] sm:text-xs text-purple-200 font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
                            <span className="break-words">{finalResults?.me?.institution || finalResults?.me?.college || institution || "Medical College"}</span>
                            {(finalResults?.me?.academicYear || finalResults?.me?.year || academicYear) && (
                              <>
                                <span className="text-purple-300">•</span>
                                <span className="text-white font-bold whitespace-nowrap">{finalResults?.me?.academicYear || finalResults?.me?.year || academicYear}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 pl-2">
                      <span className="font-mono text-base sm:text-lg font-black text-white whitespace-nowrap">
                        {Math.max(
                          Number(finalResults?.totalScore) || 0,
                          Number(finalResults?.me?.score) || 0,
                          Number(score) || 0,
                          Number(sessionStorage.getItem("imf_quiz_score")) || 0
                        ).toLocaleString()} pts
                      </span>
                    </div>
                  </div>

                  {/* Doctors Below Me */}
                  {finalResults?.below5 &&
                    finalResults.below5.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-3.5 sm:px-5 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                      >
                        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 mr-2">
                          <span className="w-7 sm:w-8 text-sm sm:text-base font-black text-purple-300 shrink-0">
                            #{p.rank}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-sm sm:text-base font-bold text-slate-200 break-words leading-tight">
                                {p.name}
                              </span>
                              {p.regNumber && (
                                <span className="text-[11px] sm:text-xs text-purple-300 font-mono whitespace-nowrap">
                                  [{p.regNumber}]
                                </span>
                              )}
                            </div>
                            {(p.institution || p.college || p.academicYear || p.year) && (
                              <div className="text-[11px] sm:text-xs text-purple-300/80 font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
                                <span className="break-words">{p.institution || p.college}</span>
                                {(p.academicYear || p.year) && (
                                  <>
                                    <span className="text-purple-400/60">•</span>
                                    <span className="text-purple-200 font-bold whitespace-nowrap">{p.academicYear || p.year}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pl-2">
                          <span className="font-mono text-sm sm:text-base font-black text-slate-200 whitespace-nowrap">
                            {(p.score || 0).toLocaleString()} pts
                          </span>
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
                          className="flex items-center justify-between px-3.5 sm:px-5 py-3 rounded-2xl bg-white/5 border border-white/10"
                        >
                          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 mr-2">
                            <span className="w-7 sm:w-8 text-sm sm:text-base font-black text-purple-300 shrink-0">
                              #{idx + (p.score < score ? 2 : 1)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="text-sm sm:text-base font-bold text-slate-200 block break-words leading-tight">
                                {p.name}
                              </span>
                              {(p.institution || p.college || p.academicYear || p.year) && (
                                <div className="text-[11px] sm:text-xs text-purple-300/80 font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
                                  <span className="break-words">{p.institution || p.college}</span>
                                  {(p.academicYear || p.year) && (
                                    <>
                                      <span className="text-purple-400/60">•</span>
                                      <span className="text-purple-200 font-bold whitespace-nowrap">{p.academicYear || p.year}</span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pl-2">
                            <span className="font-mono text-sm sm:text-base font-black text-slate-200 whitespace-nowrap">
                              {(p.score || 0).toLocaleString()} pts
                            </span>
                          </div>
                        </div>
                      ))}
                </div>
              </div>
            )}

            {/* Exit Lobby Button (Accessible to all) */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleExitLobby}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/20 transition-transform active:scale-95 flex items-center justify-center gap-2"
              >
                <span>🚪</span>
                <span>Exit Lobby & Return to Arena Home</span>
              </button>
            </div>
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}
