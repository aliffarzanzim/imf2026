// src/pages/QuizEntry.jsx
import React, { useState, useEffect, useRef } from "react";
import { navigate } from "../utils/navigation";

const DEFAULT_WS_URL = "ws://localhost:3001";

export function QuizEntry() {
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
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("imf_quiz_name") || "");
  const [regNumber, setRegNumber] = useState(() => localStorage.getItem("imf_quiz_reg") || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDirectDashboard, setShowDirectDashboard] = useState(false);

  // Check if player has already joined earlier and backend is ready
  useEffect(() => {
    const savedName = localStorage.getItem("imf_quiz_name");
    if (savedName) {
      setShowDirectDashboard(true);
    }
  }, []);

  // Poll for active tunnel URL from /api/quiz-config and test connection
  useEffect(() => {
    let isMounted = true;
    let sockets = [];

    function tryConnect(url) {
      if (!url) return;
      try {
        const ws = new WebSocket(url);
        sockets.push(ws);
        ws.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
          setWsUrl(url);
          localStorage.setItem("imf_quiz_ws", url);
          // Close other sockets
          sockets.forEach((s) => {
            if (s !== ws && s.readyState === WebSocket.OPEN) s.close();
          });
        };
        ws.onerror = () => {
          // If the tunnel URL failed and we haven't tested localhost, try localhost
          if (url !== DEFAULT_WS_URL && !sockets.some((s) => s.url.includes("3001"))) {
            tryConnect(DEFAULT_WS_URL);
          }
        };
        ws.onclose = () => {
          if (isMounted && sockets.every((s) => s.readyState !== WebSocket.OPEN)) {
            setWsConnected(false);
          }
        };
      } catch (e) {
        if (url !== DEFAULT_WS_URL) {
          tryConnect(DEFAULT_WS_URL);
        }
      }
    }

    async function checkBackend() {
      try {
        const res = await fetch("/api/quiz-config");
        if (res.ok) {
          const data = await res.json();
          if (data.ws_url && isMounted) {
            tryConnect(data.ws_url);
            // Also race with localhost in case user is testing on local laptop
            tryConnect(DEFAULT_WS_URL);
            return;
          }
        }
      } catch (e) {
        // quiet
      }

      if (isMounted) {
        tryConnect(DEFAULT_WS_URL);
      }
    }

    checkBackend();

    // Re-check every 3 seconds if disconnected
    const interval = setInterval(() => {
      if (isMounted && !wsConnected) {
        checkBackend();
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      sockets.forEach((s) => {
        try {
          s.close();
        } catch (e) {}
      });
    };
  }, [wsConnected]);

  function handleJoinSubmit(e) {
    e.preventDefault();
    if (!playerName.trim()) return;

    setIsSubmitting(true);
    localStorage.setItem("imf_quiz_name", playerName.trim());
    if (regNumber.trim()) {
      localStorage.setItem("imf_quiz_reg", regNumber.trim().toUpperCase());
    } else {
      localStorage.removeItem("imf_quiz_reg");
    }

    navigate("/quiz-dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-slate-950 text-sm shadow-md shadow-emerald-500/20">
              IMF
            </div>
            <span className="font-extrabold text-base tracking-tight text-white group-hover:text-emerald-400 transition-colors">
              IMF 2026 Live Arena
            </span>
          </a>

          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
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
              <span>{wsConnected ? "Live Stage Active" : "Connecting..."}</span>
            </div>

            <a
              href="/quiz-master"
              className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 font-medium transition"
            >
              🎬 Quiz Master
            </a>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-lg mx-auto w-full">
        {!wsConnected ? (
          /* ── 1. WAITING FOR QUIZ MASTER SCREEN ── */
          <div className="w-full bg-slate-900/90 border border-slate-800/90 rounded-3xl p-8 sm:p-10 text-center shadow-2xl backdrop-blur-xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Ambient Background Glow */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Pulsing Timer / Radar Icon */}
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border-2 border-amber-500/30 flex items-center justify-center mx-auto mb-6 shadow-xl relative">
              <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping absolute" />
              <span className="text-3xl">⏱️</span>
            </div>

            <span className="px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 inline-block mb-3 animate-pulse">
              Stage Standing By
            </span>

            <h1 className="text-xl sm:text-2xl font-black text-white mb-3 tracking-tight leading-snug">
              Waiting for the Quiz Master to start the quiz, please wait...
            </h1>

            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-8">
              The stage engine is getting prepared. As soon as the Quiz Master activates the live round, this screen will automatically open for you.
            </p>

            {/* Radar Activity Scanner */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-mono text-slate-400">
                Listening for auditorium live tunnel...
              </span>
            </div>
          </div>
        ) : (
          /* ── 2. NAME ENTRY FORM (BACKEND READY) ── */
          <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-slate-950 text-2xl mx-auto mb-4 shadow-xl shadow-emerald-500/20">
              ⚡
            </div>

            <h1 className="text-2xl font-black text-white mb-1">
              Enter Live Arena
            </h1>
            <p className="text-xs text-slate-400 mb-4">
              National Internal Medicine Festival 2026 Live Quiz
            </p>

            <div className="mb-6 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Auditorium Stage Connected
            </div>

            <form onSubmit={handleJoinSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Your Full Name / Title
                </label>
                <input
                  type="text"
                  required
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="e.g. Dr. Aiman Talukder"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-emerald-400 font-mono focus:border-emerald-500 focus:outline-none transition"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Entering your registration badge links your awards to your profile.
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/20 transition-transform active:scale-95 mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{isSubmitting ? "Entering Room..." : "Join Live Room 🚀"}</span>
              </button>

              {showDirectDashboard && playerName && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => navigate("/quiz-dashboard")}
                    className="text-xs text-emerald-400 hover:underline font-semibold"
                  >
                    Continue as {playerName} →
                  </button>
                </div>
              )}
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
