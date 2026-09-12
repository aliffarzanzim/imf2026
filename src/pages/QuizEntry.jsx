// src/pages/QuizEntry.jsx
import React, { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { QuizDashboard } from "./QuizDashboard";

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

  const [inLobby, setInLobby] = useState(() => {
    return sessionStorage.getItem("imf_quiz_in_lobby") === "true";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [isSuccess, setIsSuccess] = useState(() => {
    return !!localStorage.getItem("imf_quiz_name");
  });

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

  const [showScanner, setShowScanner] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef(null);

  async function startScanner() {
    setShowScanner(true);
    setCameraError("");
    setLookupError("");
    setTimeout(async () => {
      try {
        if (scannerRef.current) {
          try { await scannerRef.current.stop(); } catch (_) {}
          try { scannerRef.current.clear(); } catch (_) {}
          scannerRef.current = null;
        }
        const html5QrCode = new Html5Qrcode("quiz-qr-reader");
        scannerRef.current = html5QrCode;
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 15, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            handleQrScanSuccess(decodedText);
          },
          () => {}
        );
      } catch (err) {
        console.error("Scanner error:", err);
        setCameraError("Camera permission denied or camera not found. Please enter your email manually.");
      }
    }, 150);
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch (_) {}
      try { scannerRef.current.clear(); } catch (_) {}
      scannerRef.current = null;
    }
    setShowScanner(false);
  }

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try { scannerRef.current.stop(); } catch (_) {}
        try { scannerRef.current.clear(); } catch (_) {}
      }
    };
  }, []);

  async function handleQrScanSuccess(text) {
    if (!text) return;
    await stopScanner();
    // Parse reg number and cryptographic signature from badge QR URL (e.g. https://imf2026.pages.dev/verify?reg=IMF-REG-0439&sig=aea2e51b)
    let regMatch = text.match(/reg=([A-Za-z0-9\-]+)/i);
    let sigMatch = text.match(/sig=([A-Za-z0-9]+)/i);
    let regNumber = regMatch ? regMatch[1] : null;
    let sig = sigMatch ? sigMatch[1] : null;

    if (!regNumber) {
      let directMatch = text.match(/(IMF-REG-[0-9]{4})/i);
      if (directMatch) regNumber = directMatch[1];
    }
    let emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    let scannedEmail = emailMatch ? emailMatch[0] : null;

    if (regNumber || scannedEmail) {
      if (scannedEmail) setEmail(scannedEmail);
      await handleLookup({
        emailToLookup: scannedEmail || "",
        regNumberToLookup: regNumber || "",
        sigToLookup: sig || "",
      });
    } else {
      setLookupError("Scanned QR code is not a recognized IMF 2026 badge.");
    }
  }

  async function handleLookup({ emailToLookup, regNumberToLookup, sigToLookup } = {}) {
    const cleanEmail = (emailToLookup !== undefined ? emailToLookup : email).trim().toLowerCase();
    const cleanReg = (regNumberToLookup || "").trim().toUpperCase();
    const cleanSig = (sigToLookup || "").trim().toLowerCase();

    if (!cleanEmail && !cleanReg) {
      setLookupError("Please enter your registered email address or scan your badge QR code.");
      return;
    }

    setIsLoading(true);
    setLookupError("");

    try {
      const payload = {};
      if (cleanEmail) payload.email = cleanEmail;
      if (cleanReg) payload.regNumber = cleanReg;
      if (cleanSig) payload.sig = cleanSig;

      const res = await fetch("/api/quiz-player-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.player) {
        setLookupError(
          data.error || "No registration found. Please check your details or register first."
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
    } catch (err) {
      console.error("Lookup request failed:", err);
      setLookupError("Network error checking registration. Please try again.");
      setIsLoading(false);
    }
  }

  function handleEmailLookup(e) {
    if (e) e.preventDefault();
    handleLookup({ emailToLookup: email });
  }

  function handleEnterLobby() {
    sessionStorage.setItem("imf_quiz_in_lobby", "true");
    setInLobby(true);
  }

  function handleExitLobby(resetEmail = false) {
    sessionStorage.removeItem("imf_quiz_in_lobby");
    setInLobby(false);
    if (resetEmail) {
      handleSwitchEmail();
    }
  }

  function handleSwitchEmail() {
    sessionStorage.removeItem("imf_quiz_in_lobby");
    sessionStorage.removeItem("imf_quiz_name");
    sessionStorage.removeItem("imf_quiz_email");
    sessionStorage.removeItem("imf_quiz_pid");
    sessionStorage.removeItem("imf_quiz_reg");
    sessionStorage.removeItem("imf_quiz_institution");
    sessionStorage.removeItem("imf_quiz_year");
    localStorage.removeItem("imf_quiz_name");
    localStorage.removeItem("imf_quiz_email");
    localStorage.removeItem("imf_quiz_pid");
    localStorage.removeItem("imf_quiz_reg");
    localStorage.removeItem("imf_quiz_institution");
    localStorage.removeItem("imf_quiz_year");
    setPlayerDetails(null);
    setIsSuccess(false);
    setLookupError("");
  }

  if (inLobby && playerDetails) {
    return <QuizDashboard onExitLobby={handleExitLobby} />;
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
              <span className="hidden sm:inline">{wsConnected ? "Connected" : "Connecting..."}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-lg mx-auto w-full">
        {playerDetails && (isSuccess || !lookupError) ? (
          /* ── 1. "YOU ARE IN" CONFIRMATION CARD (Matches exact Kahoot format requested) ── */
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
              Reg No: <strong className="text-white font-black">{playerDetails.regNumber || "DELEGATE"}</strong>
            </div>

            <button
              onClick={handleEnterLobby}
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
          /* ── 2. EMAIL ENTRY FORM (PRERENDERED IMMEDIATELY ON FIRST PAINT, ZERO FLASH) ── */
          <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-slate-950 text-2xl mx-auto mb-4 shadow-xl shadow-emerald-500/20">
              ⚡
            </div>

            <h1 className="text-2xl font-black text-white mb-1">
              Live Quiz Arena
            </h1>
            <p className="text-xs text-slate-400 mb-6">
              Internal Medicine Festival 2026 Live Quiz
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
                <button
                  type="button"
                  onClick={startScanner}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium mt-2 inline-flex items-center gap-1.5 transition group"
                >
                  <svg
                    className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                    />
                  </svg>
                  <span>or you can also scan your id qr code</span>
                </button>
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

      {/* ID Badge QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-sm w-full text-center shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>📷</span> Scan IMF ID Badge
              </h3>
              <button
                onClick={stopScanner}
                className="text-slate-400 hover:text-white text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition font-bold"
              >
                ✕ Close
              </button>
            </div>

            <div
              id="quiz-qr-reader"
              className="rounded-2xl overflow-hidden border border-slate-800 bg-black min-h-[250px]"
            />

            {cameraError ? (
              <p className="text-xs text-rose-400 mt-3 font-medium">{cameraError}</p>
            ) : (
              <p className="text-[11px] text-slate-400 mt-3">
                Point camera at the QR code on your IMF 2026 chest card
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
