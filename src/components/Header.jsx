// src/components/Header.jsx
import React from "react";
import { Icons } from "../assets/icons";

export function Header({ onOpenAdmin, onHome, onOpenRegister }) {
  return (
    <header className="glass-header">
      <div className="flex items-center justify-between h-16 max-w-7xl px-4 sm:px-6 lg:px-8 mx-auto">

        {/* Logo + Festival Identity */}
        <button
          onClick={onHome}
          className="flex items-center gap-3 group text-left focus:outline-none"
          aria-label="Go to home"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform duration-200">
            <Icons.HeartPulse className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-tight text-slate-900 leading-none">
                IMF 2026
              </span>
              <span className="hidden md:inline-flex text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200/60">
                Annual Festival
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 leading-tight mt-0.5 hidden sm:block">
              DMC IMIG &nbsp;•&nbsp; ACP Bangladesh &nbsp;•&nbsp; BSM
            </p>
          </div>
        </button>

        {/* Center status chip (Desktop) */}
        <div className="hidden lg:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100/80 border border-slate-200/60 text-xs font-semibold text-slate-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>17 September 2026</span>
          <span className="text-slate-300">•</span>
          <span className="text-teal-700 font-bold">Free Entry</span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          {onOpenRegister && (
            <button
              onClick={onOpenRegister}
              className="btn-primary text-xs py-2 px-4 shadow-sm hidden sm:inline-flex"
            >
              Register Now
            </button>
          )}

          {/* Discreet, sleek Admin Link — No ugly shield icon */}
          <button
            id="admin-portal-btn"
            onClick={onOpenAdmin}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all duration-150"
            title="Administrator Control Panel"
          >
            <Icons.Tag className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs">Admin</span>
          </button>
        </div>
      </div>
    </header>
  );
}
