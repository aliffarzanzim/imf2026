// src/pages/QuizEntry.jsx
import React, { useState, useEffect } from "react";
import { navigate } from "../utils/navigation";

const DEFAULT_WS_URL = "wss://imf2026-quiz.crcck.workers.dev/ws";

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

  const [email, setEmail] = useState(() => localStorage.getItem("imf_quiz_email") || "");
  const [playerDetails, setPlayerDetails] = useState(() => {
    const savedName = localStorage.getItem("imf_quiz_name");
    if (!savedName) return null;
    return {
      name: savedName,
      regNumber: localStorage.getItem("imf_quiz_reg") || "",
      institution: localStorage.getItem("imf_quiz_institution") || "Medical College",
      academicYear: localStorage.getItem("imf_quiz_year") || "Participant",
      email: localStorage.getItem("imf_quiz_email") || "",
    };
  });

  const [isLoading, setIsLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

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
          sockets.forEach((s) => {
            if (s !== ws && s.readyState === WebSocket.OPEN) s.close();
          });
        };
        ws.onerror = () => {
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
            tryConnect(DEFAULT_WS_URL);
            return;
          }
        }
      } catch (e) {}

      if (isMounted) {
        tryConnect(DEFAULT_WS_URL);
      }
    }

    checkBackend();

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

  async function handleEmailLookup(e) {
    if (e) e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setLookupError("Please enter your registered email address.");
      return;
    }

    setIsLoading(true);
    setLookupError("");

    try {
      const res = await fetch("/api/quiz-player-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.player) {
        setLookupError(
          data.error || "No registration found with this email. Please check your email or register first."
        );
        setIsLoading(false);
        return;
      }

      const p = data.player;
      const details = {
        name: p.name,
        regNumber: p.regNumber || "",
        institution: p.institution || "Medical College",
        academicYear: p.academicYear || "Participant",
        email: p.email || cleanEmail,
      };

      // Persistent Storage
      let pid = sessionStorage.getItem("imf_quiz_pid") || localStorage.getItem("imf_quiz_pid");
      if (!pid) {
        pid = "doc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      }
      sessionStorage.setItem("imf_quiz_pid", pid);
      localStorage.setItem("imf_quiz_pid", pid);

      sessionStorage.setItem("imf_quiz_name", details.name);
      localStorage.setItem("imf_quiz_name", details.name);

      sessionStorage.setItem("imf_quiz_reg", details.regNumber);
      localStorage.setItem("imf_quiz_reg", details.regNumber);

      sessionStorage.setItem("imf_quiz_institution", details.institution);
      localStorage.setItem("imf_quiz_institution", details.institution);

      sessionStorage.setItem("imf_quiz_year", details.academicYear);
      localStorage.setItem("imf_quiz_year", details.academicYear);

      sessionStorage.setItem("imf_quiz_email", details.email);
      localStorage.setItem("imf_quiz_email", details.email);

      setPlayerDetails(details);
      setIsSuccess(true);
      setIsLoading(false);

      // Auto-enter live arena after showing the welcome card
      setTimeout(() => {
        navigate("/quiz-dashboard");
      }, 1200);
    } catch (err) {
      console.error("Lookup request failed:", err);
      setLookupError("Network error checking registration. Please try again.");
      setIsLoading(false);
    }
  }

  function handleSwitchEmail() {
    setPlayerDetails(null);
    setIsSuccess(false);
    setLookupError("");
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
              <span>{wsConnected ? "Auditorium Connected" : "Connecting..."}</span>
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
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

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

            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-mono text-slate-400">
                Listening for auditorium live tunnel...
              </span>
            </div>
          </div>
        ) : playerDetails && (isSuccess || !lookupError) ? (
          /* ── 2. "YOU ARE IN" CONFIRMATION CARD (Matches exact Kahoot format requested) ── */
          <div className="w-full bg-[#2b0f42] border-2 border-[#572182] rounded-3xl p-8 sm:p-10 shadow-2xl text-center animate-in fade-in zoom-in-95 duration-200 text-white relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-slate-950 text-3xl mx-auto mb-6 shadow-xl shadow-emerald-500/20 animate-bounce">
              ✓
            </div>

            <span className="px-3.5 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-block mb-3 uppercase tracking-wider">
              Registration Verified
            </span>

            {/* Exact Requested Text Format */}
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-1 tracking-tight">
              You are in, "{playerDetails.name}"
            </h1>
            <p className="text-sm sm:text-base font-bold text-emerald-400 mb-6">
              from {playerDetails.institution} ({playerDetails.academicYear})
            </p>

            <div className="bg-black/20 border border-white/10 rounded-2xl p-3.5 mb-6 text-xs text-purple-200 font-mono">
              Badge: <strong className="text-white font-black">{playerDetails.regNumber || "DELEGATE"}</strong>
            </div>

            <button
              onClick={() => navigate("/quiz-dashboard")}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-base shadow-xl shadow-emerald-500/20 transition-transform active:scale-95 flex items-center justify-center gap-2"
            >
              <span>Enter Live Lobby 🚀</span>
            </button>

            <div className="pt-4">
              <button
                type="button"
                onClick={handleSwitchEmail}
                className="text-xs text-purple-300 hover:text-white underline font-semibold transition"
              >
                Not you? Enter different email
              </button>
            </div>
          </div>
        ) : (
          /* ── 3. EMAIL ENTRY FORM (NO EMAILS SENT, INSTANT LOOKUP) ── */
          <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-slate-950 text-2xl mx-auto mb-4 shadow-xl shadow-emerald-500/20">
              ⚡
            </div>

            <h1 className="text-2xl font-black text-white mb-1">
              Live Quiz Arena
            </h1>
            <p className="text-xs text-slate-400 mb-6">
              National Internal Medicine Festival 2026 Live Quiz
            </p>

            <form onSubmit={handleEmailLookup} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Enter your registered email address
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setLookupError("");
                  }}
                  placeholder="e.g. doctor@gmail.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
                />
                <span className="text-[11px] text-slate-500 mt-1.5 block">
                  Your name and medical college details will be automatically recognized from your IMF registration.
                </span>
              </div>

              {lookupError && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold leading-relaxed animate-in fade-in">
                  {lookupError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/20 transition-transform active:scale-95 mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                    Checking Registration...
                  </span>
                ) : (
                  <span>Verify & Enter Arena 🚀</span>
                )}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
