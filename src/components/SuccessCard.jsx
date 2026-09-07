// src/components/SuccessCard.jsx
import React, { useState } from "react";
import { Icons } from "../assets/icons";

export function SuccessCard({
  regNumber,
  abstractNumber,
  abstractNumbers = [],
  phone,
  email,
  fullName,
  institution,
  batch,
  academicYear,
  title = "Registration Confirmed!",
  subtitle = "Your place at the Internal Medicine Festival 2026 has been reserved.",
  onClose,
  onManage,
}) {
  const [copiedReg, setCopiedReg] = useState(false);
  const [copiedAbs, setCopiedAbs] = useState(false);

  // Compute all attached abstract numbers
  const allAbstracts = Array.isArray(abstractNumbers) && abstractNumbers.length > 0
    ? abstractNumbers
    : (abstractNumber ? String(abstractNumber).split(",").map((s) => s.trim()).filter(Boolean) : []);

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
    <div className="modal-overlay print:static print:p-0 print:m-0 print:bg-white print:w-full print:block" role="dialog" aria-modal="true" aria-label="Registration successful">
      <div className="modal-panel max-w-lg text-center p-0 overflow-hidden shadow-2xl border border-slate-200 print:shadow-none print:border print:border-slate-300 print:max-w-xl print:mx-auto print:my-4 print:rounded-2xl">

        {/* Top accent gradient bar */}
        <div className="h-2.5 w-full bg-gradient-to-r from-sky-600 via-teal-500 to-emerald-500 print:h-2" />

        <div className="p-6 sm:p-8">
          {/* Success Badge */}
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-emerald-600 animate-pulse-ring print:animate-none">
            <Icons.Check className="w-9 h-9" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{title}</h2>
          {subtitle && (
            <p className="mt-1.5 text-xs sm:text-sm text-slate-600 max-w-md mx-auto">{subtitle}</p>
          )}

          {/* ── HIGH PRIORITY SCREENSHOT ALERT CALLOUT (Screen Only) ── */}
          <div className="my-5 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-left flex items-start gap-3 shadow-xs print:hidden">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 font-bold text-lg shadow-xs">
              📸
            </div>
            <div className="flex-1 text-xs">
              <span className="font-extrabold text-amber-950 block text-sm tracking-tight mb-0.5">
                Please Take a Screenshot of This Screen Now!
              </span>
              <p className="text-amber-900 leading-relaxed font-medium">
                Save your <strong>Registration Number</strong> and registered <strong>Email Address</strong>. You will need your email to access the delegate portal, <strong>edit your details</strong>, or to <strong>submit/update your abstract</strong> at any time.
              </p>
            </div>
          </div>

          {/* Registration Number Display Box */}
          <div className="mb-4 py-4 px-5 rounded-2xl border-2 border-dashed border-sky-400 bg-sky-50/70 relative group print:bg-white print:border-sky-600">
            <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-sky-800 mb-1">
              Official Registration Number
            </span>
            <span className="block text-3xl sm:text-4xl font-black tracking-widest text-sky-950 select-all font-mono">
              {regNumber}
            </span>

            {phone && (
              <span className="block text-xs font-semibold text-slate-500 mt-1">
                Registered Phone: <span className="text-slate-700 font-bold font-mono">{phone}</span>
              </span>
            )}

            <button
              type="button"
              onClick={() => copyText(regNumber, false)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-sky-200 text-sky-700 hover:bg-sky-50 shadow-xs transition-colors print:hidden"
            >
              <Icons.File className="w-3.5 h-3.5" />
              {copiedReg ? "Copied to clipboard!" : "Copy Registration ID"}
            </button>
          </div>

          {/* Abstract Number Box (if individual abstract submitted) */}
          {abstractNumber && (
            <div className="mb-4 py-3.5 px-5 rounded-2xl border-2 border-dashed border-teal-400 bg-teal-50/70 print:bg-white print:border-teal-600">
              <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-teal-800 mb-0.5">
                Scientific Abstract ID
              </span>
              <span className="block text-2xl sm:text-3xl font-black tracking-widest text-teal-950 select-all font-mono">
                {abstractNumber}
              </span>
              <button
                type="button"
                onClick={() => copyText(abstractNumber, true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg bg-white border border-teal-200 text-teal-700 hover:bg-teal-50 shadow-xs transition-colors print:hidden"
              >
                <Icons.File className="w-3.5 h-3.5" />
                {copiedAbs ? "Copied to clipboard!" : "Copy Abstract ID"}
              </button>
            </div>
          )}

          {/* ── Delegate Details Card (Name, Phone, Email, College, Abstracts) ── */}
          {(fullName || phone || email || institution) && (
            <div className="mb-5 p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/90 text-left print:bg-white print:border-slate-300">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Delegate Name
                  </span>
                  <span className="text-base sm:text-lg font-extrabold text-slate-900 block">
                    {fullName || "Registered Delegate"}
                  </span>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200 print:bg-slate-100 print:text-slate-800">
                  Confirmed Delegate
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Phone Number
                  </span>
                  <span className="font-semibold text-slate-800 block mt-0.5 font-mono">
                    {phone || "—"}
                  </span>
                </div>

                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Email Address
                  </span>
                  <span className="font-semibold text-slate-800 block mt-0.5 break-all">
                    {email || "—"}
                  </span>
                </div>

                <div className="sm:col-span-2">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Medical College / Institution
                  </span>
                  <span className="font-semibold text-slate-800 block mt-0.5">
                    {institution || "—"}
                  </span>
                </div>

                {(batch || academicYear) && (
                  <div className="sm:col-span-2">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Batch &amp; Phase / Academic Year
                    </span>
                    <span className="font-semibold text-slate-800 block mt-0.5">
                      {[batch, academicYear].filter(Boolean).join(" • ")}
                    </span>
                  </div>
                )}

                <div className="sm:col-span-2 pt-2.5 border-t border-slate-200">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Attached Abstract Number(s)
                  </span>
                  {allAbstracts.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {allAbstracts.map((abs, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-teal-50 border border-teal-200 text-teal-900 print:bg-white print:border-slate-400"
                        >
                          {abs}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500 font-medium block mt-1 italic text-xs">
                      None attached
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action buttons — completely hidden when printing or saving as PDF */}
          <div className="flex flex-col sm:flex-row gap-2.5 mt-6 print:hidden">
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

          {/* Print-only Pass footer */}
          <div className="hidden print:block mt-6 pt-4 border-t border-slate-200 text-center text-xs text-slate-500">
            <p className="font-semibold text-slate-800">Internal Medicine Festival 2026 • Official Attendee Confirmation</p>
            <p className="mt-0.5">Organized by DMC IMIG &amp; ACP Bangladesh Chapter • Bangladesh Society of Medicine</p>
          </div>

        </div>
      </div>
    </div>
  );
}

