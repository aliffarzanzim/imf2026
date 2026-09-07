// src/components/SuccessCard.js
import React from "react";
import { Icons } from "../assets/icons";

export function SuccessCard({ regNumber, title, subtitle, onClose }) {
  function handleCopy() {
    navigator.clipboard?.writeText(regNumber).catch(() => {});
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Registration successful">
      <div className="modal-panel max-w-md text-center p-0 overflow-hidden">

        {/* Top accent bar */}
        <div className="h-2 w-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]" />

        <div className="p-8">
          {/* Success Icon */}
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center animate-pulse-ring">
            <Icons.Check className="w-9 h-9 text-[var(--color-success)]" />
          </div>

          <h2 className="text-2xl font-bold text-[var(--color-text-main)]">{title}</h2>
          {subtitle && (
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{subtitle}</p>
          )}

          {/* ID Display */}
          <div className="mt-6 mb-3 py-5 px-6 rounded-2xl border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent-light)]">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)] mb-2">
              Official ID Number
            </span>
            <span className="block text-3xl font-black tracking-widest text-[var(--color-primary)]">
              {regNumber}
            </span>
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="btn-outline text-xs mb-4 mx-auto"
          >
            <Icons.File className="w-3.5 h-3.5" />
            Copy to clipboard
          </button>

          <div className="alert-warning rounded-lg text-xs mb-6">
            <Icons.Alert className="w-4 h-4 flex-shrink-0" />
            <span>
              Please <strong>screenshot or copy</strong> this number. It is required for entry
              and attendance verification on event day.
            </span>
          </div>

          <button
            id="success-done-btn"
            onClick={onClose}
            className="btn-primary w-full py-3"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
