// src/components/Header.js
import React from "react";
import { Icons } from "../assets/icons";

export function Header({ onOpenAdmin, onHome }) {
  return (
    <header className="glass-header">
      <div className="flex items-center justify-between h-16 max-w-6xl px-6 mx-auto">

        {/* Logo + Title */}
        <button
          onClick={onHome}
          className="flex items-center gap-3 group focus:outline-none"
          aria-label="Go to home"
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--color-primary)] text-white shadow-sm group-hover:bg-[var(--color-primary-hover)] transition-colors duration-200">
            <Icons.HeartPulse className="w-5 h-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-tight text-[var(--color-text-main)] hidden sm:block">
              Internal Medicine Festival 2026
            </span>
            <span className="text-sm font-bold tracking-tight text-[var(--color-text-main)] sm:hidden">
              IMF 2026
            </span>
            <span className="text-[10px] font-medium text-[var(--color-text-muted)] hidden sm:block">
              DMC IMIG &nbsp;•&nbsp; ACP Bangladesh &nbsp;•&nbsp; BSM
            </span>
          </div>
        </button>

        {/* Nav */}
        <nav className="flex items-center gap-2">
          {/* Event Date Chip */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent)] text-xs font-semibold">
            <Icons.Date className="w-3.5 h-3.5" />
            17 Sep 2026
          </div>

          <button
            id="admin-portal-btn"
            onClick={onOpenAdmin}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-white hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 text-[var(--color-text-muted)]"
          >
            <Icons.Admin className="w-4 h-4" />
            <span className="hidden sm:inline">Admin Portal</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
