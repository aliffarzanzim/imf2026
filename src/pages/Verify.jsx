// src/pages/Verify.jsx
// Cryptographic Badge Verification Page & Camera Scanner for IMF 2026
import React, { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  ShieldCheck,
  QrCode,
  Camera,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Building2,
  GraduationCap,
  Calendar,
  Layers,
  ArrowLeft,
  Search,
  Upload,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { navigate } from "../utils/navigation";

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (_) {}
}

export function Verify() {
  const [params, setParams] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return {
      reg: searchParams.get("reg") || "",
      sig: searchParams.get("sig") || "",
    };
  });

  const [loading, setLoading] = useState(false);
  const [verifiedData, setVerifiedData] = useState(null);
  const [verifyError, setVerifyError] = useState(null);

  // Scanner states
  const [isScanning, setIsScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState("environment"); // 'environment' (back) or 'user' (front)
  const [soundEnabled, setSoundEnabled] = useState(true);

  const scannerRef = useRef(null);
  const scannerContainerId = "qr-reader-target";

  function stopCamera() {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop().then(() => {
          scannerRef.current?.clear();
        }).catch(() => {});
      } catch (_) {}
      scannerRef.current = null;
    }
    setCameraActive(false);
    setIsScanning(false);
  }

  async function startCamera(isUserAction = false) {
    setIsStartingCamera(true);
    setCameraError(null);

    try {
      // 1. Actively request permission via getUserMedia
      // When executed as a result of a click (user gesture), modern browsers prompt reliably!
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const testStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode } },
          });
          testStream.getTracks().forEach((t) => t.stop());
        } catch (initialErr) {
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
            fallbackStream.getTracks().forEach((t) => t.stop());
          } catch (permErr) {
            console.warn("getUserMedia permission error:", permErr);
            throw permErr;
          }
        }
      }

      // 2. Ensure container element exists
      const element = document.getElementById(scannerContainerId);
      if (!element) return;

      // Stop any existing scanner
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch (_) {}
        try {
          scannerRef.current.clear();
        } catch (_) {}
        scannerRef.current = null;
      }

      const html5QrCode = new Html5Qrcode(scannerContainerId);
      scannerRef.current = html5QrCode;

      // 3. Choose best camera device
      let cameraConfig = { facingMode };
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          let chosenCam = cameras[0];
          if (facingMode === "environment") {
            const back = cameras.find((c) =>
              /back|rear|environment/i.test(c.label)
            );
            chosenCam = back || cameras[cameras.length - 1];
          }
          cameraConfig = chosenCam.id;
        }
      } catch (_) {}

      const qrConfig = {
        fps: 15,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        cameraConfig,
        qrConfig,
        (decodedText) => {
          handleQrScanSuccess(decodedText);
        },
        () => {}
      );

      setCameraActive(true);
      setIsScanning(true);
      setCameraError(null);
    } catch (err) {
      console.error("Camera start failed:", err);
      let userMsg = "Camera access unavailable.";
      if (
        err.name === "NotAllowedError" ||
        String(err).toLowerCase().includes("notallowed") ||
        String(err).toLowerCase().includes("permission denied")
      ) {
        userMsg = "Camera permission was not granted. Please click 'Allow & Start Camera' below to trigger the prompt, or allow camera permissions in your browser.";
      } else if (err.name === "NotFoundError" || String(err).includes("NotFoundError")) {
        userMsg = "No camera was detected on this device. You can upload an image of the QR code below.";
      } else {
        userMsg = err.message || "Failed to start camera. Please verify camera permissions.";
      }
      setCameraError(userMsg);
      setCameraActive(false);
      setIsScanning(false);
    } finally {
      setIsStartingCamera(false);
    }
  }

  // Verify parameters when present in state
  useEffect(() => {
    if (params.reg && params.sig) {
      stopCamera();
      performVerification(params.reg, params.sig);
    } else {
      setVerifiedData(null);
      setVerifyError(null);
      // Auto-attempt camera start; if blocked by browser autoplay/permission policy, prompt button is displayed
      const timer = setTimeout(() => {
        startCamera(false);
      }, 300);
      return () => {
        clearTimeout(timer);
        stopCamera();
      };
    }
  }, [params.reg, params.sig]);

  // Handle URL change from history navigation
  useEffect(() => {
    function handleLocationChange() {
      const searchParams = new URLSearchParams(window.location.search);
      setParams({
        reg: searchParams.get("reg") || "",
        sig: searchParams.get("sig") || "",
      });
    }

    window.addEventListener("popstate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      stopCamera();
    };
  }, []);

  async function performVerification(regNumber, signature) {
    setLoading(true);
    setVerifyError(null);
    setVerifiedData(null);
    stopCamera();

    try {
      const resp = await fetch(
        `/api/verify?reg=${encodeURIComponent(regNumber)}&sig=${encodeURIComponent(signature)}`
      );
      const data = await resp.json();

      if (!resp.ok || !data.verified) {
        setVerifyError(data.error || "The badge verification signature is invalid or unrecognized.");
      } else {
        setVerifiedData(data);
        if (soundEnabled) playChime();
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      }
    } catch (err) {
      setVerifyError("Network error checking verification status. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function handleQrScanSuccess(decodedText) {
    if (soundEnabled) playChime();
    if (navigator.vibrate) navigator.vibrate([80]);

    // Parse decoded text (either full URL or query string or raw format)
    try {
      let reg = "";
      let sig = "";

      if (decodedText.includes("?") && (decodedText.includes("reg=") || decodedText.includes("sig="))) {
        const queryPart = decodedText.split("?")[1] || "";
        const parsed = new URLSearchParams(queryPart);
        reg = parsed.get("reg") || "";
        sig = parsed.get("sig") || "";
      } else if (decodedText.includes("&") && decodedText.includes("reg=")) {
        const parsed = new URLSearchParams(decodedText);
        reg = parsed.get("reg") || "";
        sig = parsed.get("sig") || "";
      }

      if (reg && sig) {
        stopCamera();

        // Update URL cleanly without full reload
        const newUrl = `/verify?reg=${encodeURIComponent(reg)}&sig=${encodeURIComponent(sig)}`;
        window.history.pushState(null, "", newUrl);
        setParams({ reg, sig });
      } else {
        setCameraError(`Unrecognized QR code format. Please scan an official IMF 2026 conference badge.`);
      }
    } catch (err) {
      setCameraError(`Failed to parse QR code: ${err.message}`);
    }
  }

  // Handle file input upload as fallback
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const html5Qr = new Html5Qrcode("qr-file-dummy");
      const decoded = await html5Qr.scanFile(file, true);
      handleQrScanSuccess(decoded);
    } catch (err) {
      setCameraError("Could not read a valid QR code from this image. Please try another photo.");
    } finally {
      setLoading(false);
    }
  }

  function handleVerifyAnother() {
    setVerifiedData(null);
    setVerifyError(null);
    setCameraError(null);
    setParams({ reg: "", sig: "" });
    window.history.pushState(null, "", "/verify");
    setTimeout(() => {
      startCamera(true);
    }, 150);
  }

  function toggleCameraFlip() {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    stopCamera();
    setTimeout(() => {
      startCamera(true);
    }, 150);
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col selection:bg-sky-500 selection:text-white">
      <Header onHome={() => navigate("/")} onOpenAdmin={() => navigate("/admin")} />

      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-12 sm:pt-28 sm:pb-16">
        <div className="w-full max-w-lg">

          {/* Top Brand Tag */}
          <div className="flex items-center justify-between mb-4 px-1">
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Festival</span>
            </button>

            <div className="inline-flex items-center gap-2">
              <button
                onClick={() => setSoundEnabled((v) => !v)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                title={soundEnabled ? "Mute sound chime" : "Enable sound chime"}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-sky-600" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                IMF 2026 Portal
              </span>
            </div>
          </div>

          {/* STATE 1: LOADING */}
          {loading && (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-elevated p-10 text-center flex flex-col items-center justify-center">
              <div className="relative w-16 h-16 mb-5">
                <div className="w-16 h-16 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 animate-pulse">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <div className="absolute -inset-1 rounded-3xl bg-sky-500/20 blur-md animate-ping" />
              </div>
              <h2 className="text-xl font-black text-slate-900 mb-1">Authenticating Badge...</h2>
              <p className="text-xs text-slate-500 max-w-xs">
                Verifying digital signature against IMF 2026 official delegate registry.
              </p>
            </div>
          )}

          {/* STATE 2: VERIFIED BADGE CARD */}
          {!loading && verifiedData && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              
              {/* Card Header: Deep Royal Blue with glowing seal */}
              <div className="relative bg-gradient-to-br from-[#091a30] via-[#0d2342] to-[#123157] text-white p-7 text-center overflow-hidden">
                {/* Subtle pattern / glow */}
                <div className="absolute -top-12 -right-12 w-36 h-36 bg-sky-500/15 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />

                {/* Verified Shield Icon Badge & Status Pill Laser-Aligned */}
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center ring-4 ring-white/10 shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[11px] font-extrabold uppercase tracking-wider">
                    {String(verifiedData.role || "").toUpperCase().includes("ORG")
                      ? "Official Organiser Verified"
                      : "Official Attendee Verified"}
                  </div>
                </div>

                <h1 className="text-2xl font-black tracking-tight text-white mb-1">
                  {verifiedData.fullName}
                </h1>

                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-xl border border-white/15 text-xs text-sky-200 font-mono font-bold tracking-wide">
                  <span>ID:</span>
                  <span className="text-white font-black">{verifiedData.regNumber}</span>
                </div>
              </div>

              {/* Card Body: Safe Delegate Attributes */}
              <div className="p-6 sm:p-7 space-y-4">
                {/* Role Pill */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Designation</span>
                  {String(verifiedData.role || "").toUpperCase().includes("ORG") ? (
                    <span className="px-3.5 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-black tracking-wide uppercase border border-amber-300 shadow-xs flex items-center gap-1.5">
                      <span>★</span>
                      <span>ORGANISER</span>
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-xs font-black tracking-wide uppercase border border-sky-200">
                      {verifiedData.role || "PARTICIPANT"}
                    </span>
                  )}
                </div>

                {/* Institution */}
                <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/60">
                  <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Institution / College</span>
                    <span className="text-sm font-extrabold text-slate-900 leading-snug block">
                      {verifiedData.institution}
                    </span>
                  </div>
                </div>

                {/* Batch & Academic Year */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/60">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      <span>Batch</span>
                    </div>
                    <span className="text-sm font-black text-slate-800">{verifiedData.batch}</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/60">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                      <span>Year</span>
                    </div>
                    <span className="text-sm font-black text-slate-800">{verifiedData.academicYear}</span>
                  </div>
                </div>

                {/* Live Verification Authenticity Stamp */}
                <div className="pt-2">
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-200/80 p-3.5 text-emerald-950 flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="text-[11px] leading-tight">
                      <span className="font-bold block text-emerald-900">Authenticated</span>
                      <span className="text-emerald-700">
                        {new Date(verifiedData.verifiedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action: Verify Another One Button */}
                <div className="pt-3">
                  <button
                    onClick={handleVerifyAnother}
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white font-extrabold text-sm shadow-lg shadow-sky-600/25 transition-all transform active:scale-[0.98]"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Verify Another One</span>
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* STATE 3: VERIFICATION FAILED */}
          {!loading && verifyError && (
            <div className="bg-white rounded-3xl border border-rose-200 shadow-xl overflow-hidden text-center p-8 animate-in fade-in zoom-in-95 duration-150">
              <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-sm">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="inline-block px-3 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-bold uppercase tracking-wider mb-2">
                Authentication Failed
              </div>
              <h2 className="text-xl font-black text-slate-900 mb-2">Invalid Badge</h2>
              <p className="text-xs text-slate-600 mb-6 max-w-sm mx-auto leading-relaxed">
                {verifyError}
              </p>

              <button
                onClick={handleVerifyAnother}
                className="btn-primary w-full py-3.5 text-xs font-bold flex items-center justify-center gap-2"
              >
                <QrCode className="w-4 h-4" />
                <span>Verify Another One</span>
              </button>
            </div>
          )}

          {/* STATE 4: SCANNER VIEW (Active when visiting /verify directly or clicking Verify Another) */}
          {!loading && !verifiedData && !verifyError && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden p-6 sm:p-7">
              
              <div className="text-center mb-5">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center mx-auto mb-3">
                  <Camera className="w-6 h-6" />
                </div>
                <h1 className="text-xl font-black text-slate-900">Delegate QR Scanner</h1>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Scan the QR code on any IMF 2026 chest card for instant verification.
                </p>
              </div>

              {/* Camera Error Message if any */}
              {cameraError && (
                <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="leading-snug">
                    <span className="font-bold block">Camera Notice</span>
                    <span>{cameraError}</span>
                  </div>
                </div>
              )}

              {/* Camera Viewfinder Box */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-800 aspect-square max-w-sm mx-auto flex items-center justify-center shadow-inner">
                {/* Html5Qrcode target div */}
                <div id={scannerContainerId} className="w-full h-full" />

                {/* Prompt Overlay when Camera is inactive */}
                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 backdrop-blur-xs z-10">
                    <div className="w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 mb-3.5">
                      <Camera className="w-7 h-7" />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1.5">Camera Scanner</h3>
                    <p className="text-xs text-slate-300 max-w-xs mb-4">
                      Click below to actively trigger the camera permission prompt and start scanning.
                    </p>
                    <button
                      type="button"
                      onClick={() => startCamera(true)}
                      disabled={isStartingCamera}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold text-xs shadow-lg shadow-sky-500/30 active:scale-95 transition-all cursor-pointer"
                    >
                      {isStartingCamera ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Requesting Camera...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4" />
                          <span>Allow &amp; Start Camera</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Laser scanline overlay animation */}
                {isScanning && cameraActive && !cameraError && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    {/* Targeting Corner Brackets */}
                    <div className="w-64 h-64 border-2 border-sky-400/40 rounded-2xl relative">
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-sky-400 rounded-tl-xl -mt-1 -ml-1" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-sky-400 rounded-tr-xl -mt-1 -mr-1" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-sky-400 rounded-bl-xl -mb-1 -ml-1" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-sky-400 rounded-br-xl -mb-1 -mr-1" />
                      
                      {/* Animated Scanning Laser Line */}
                      <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-[bounce_2s_infinite]" />
                    </div>
                  </div>
                )}
              </div>

              {/* Controls below camera */}
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={toggleCameraFlip}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
                  title="Switch between front and back camera"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Switch Camera</span>
                </button>

                {/* File Upload Fallback */}
                <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>

              {/* Hidden element for file scanning */}
              <div id="qr-file-dummy" className="hidden" />

              <div className="mt-5 text-center">
                <span className="text-[11px] text-slate-400 font-medium">
                  Powered by IMF 2026
                </span>
              </div>
            </div>
          )}

        </div>
      </main>

      <Footer />
    </div>
  );
}
