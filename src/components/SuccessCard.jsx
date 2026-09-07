// src/components/SuccessCard.jsx
import React, { useState } from "react";
import { Icons } from "../assets/icons";

export function SuccessCard({
  regNumber,
  abstractNumber,
  phone,
  title = "Registration Confirmed!",
  subtitle = "Your place at the Internal Medicine Festival 2026 has been reserved.",
  onClose,
  onManage,
}) {
  const [copiedReg, setCopiedReg] = useState(false);
  const [copiedAbs, setCopiedAbs] = useState(false);

  function copyText(text, isAbs = false) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (isAbs) {
          setCopiedAbs(true);
          setTimeout(() => setCopiedAbs(false), 2000);
        } else {
          setCopiedReg(true);
          setTimeout(() => setCopiedReg(false), 2000);
        }
      }).catch(() => {});
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Registration successful">
      <div className="modal-panel max-w-lg text-center p-0 overflow-hidden shadow-2xl border border-slate-200">

        {/* Top accent gradient bar */}
        <div className="h-2.5 w-full bg-gradient-to-r from-sky-600 via-teal-500 to-emerald-500" />

        <div className="p-6 sm:p-8">
          {/* Success Badge */}
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-emerald-600 animate-pulse-ring">
            <Icons.Check className="w-9 h-9" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{title}</h2>
          {subtitle && (
            <p className="mt-1.5 text-xs sm:text-sm text-slate-600 max-w-md mx-auto">{subtitle}</p>
          )}

          {/* ── HIGH PRIORITY SCREENSHOT ALERT CALLOUT ── */}
          <div className="my-5 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-left flex items-start gap-3 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 font-bold text-lg shadow-xs">
              📸
            </div>
            <div className="flex-1 text-xs">
              <span className="font-extrabold text-amber-950 block text-sm tracking-tight mb-0.5">
                Please Take a Screenshot of This Screen Now!
              </span>
              <p className="text-amber-900 leading-relaxed font-medium">
                Save your <strong>Registration Number</strong> and <strong>Phone Number</strong>. You will need both credentials for venue entry verification, to <strong>edit your details</strong>, or to <strong>submit/update your abstract</strong> at any time.
              </p>
            </div>
          </div>

          {/* Registration Number Display Box */}
          <div className="mb-4 py-4 px-5 rounded-2xl border-2 border-dashed border-sky-400 bg-sky-50/70 relative group">
            <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-sky-800 mb-1">
              Official Registration Number
            </span>
            <span className="block text-3xl sm:text-4xl font-black tracking-widest text-sky-950 select-all font-mono">
              {regNumber}
            </span>

            {phone && (
              <span className="block text-xs font-semibold text-slate-500 mt-1">
                Registered Phone: <span className="text-slate-700 font-bold">{phone}</span>
              </span>
            )}

            <button
              onClick={() => copyText(regNumber, false)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-sky-200 text-sky-700 hover:bg-sky-50 shadow-xs transition-colors"
            >
              <Icons.File className="w-3.5 h-3.5" />
              {copiedReg ? "Copied to clipboard!" : "Copy Registration ID"}
            </button>
          </div>

          {/* Abstract Number Box (if submitted) */}
          {abstractNumber && (
            <div className="mb-4 py-3.5 px-5 rounded-2xl border-2 border-dashed border-teal-400 bg-teal-50/70">
              <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-teal-800 mb-0.5">
                Scientific Abstract ID
              </span>
              <span className="block text-2xl sm:text-3xl font-black tracking-widest text-teal-950 select-all font-mono">
                {abstractNumber}
              </span>
              <button
                onClick={() => copyText(abstractNumber, true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg bg-white border border-teal-200 text-teal-700 hover:bg-teal-50 shadow-xs transition-colors"
              >
                <Icons.File className="w-3.5 h-3.5" />
                {copiedAbs ? "Copied to clipboard!" : "Copy Abstract ID"}
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2.5 mt-6">
            <button
              type="button"
              onClick={handlePrint}
              className="btn-outline flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2"
              title="Print or save as PDF pass"
            >
              <span>📸 Print / Save Pass</span>
            </button>

            {onManage && (
              <button
                type="button"
                onClick={onManage}
                className="btn-outline flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 text-slate-700"
              >
                <Icons.Edit className="w-3.5 h-3.5" />
                <span>Edit / Submit Abstract</span>
              </button>
            )}

            <button
              id="success-done-btn"
              type="button"
              onClick={onClose}
              className="btn-primary flex-1 py-3 text-xs font-bold"
            >
              Done
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
