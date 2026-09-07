// src/components/Header.jsx
import React from "react";
import { Icons } from "../assets/icons";

export function Header({ onOpenAdmin, onHome }) {
  return (
    <header className="glass-header">
      <div className="flex items-center justify-between h-16 max-w-7xl px-4 sm:px-6 lg:px-8 mx-auto">

        {/* Clean Logo + Festival Title — Unboxed, Sleek Emblem */}
        <button
          onClick={onHome}
          className="flex items-center gap-2.5 text-left focus:outline-none group"
          aria-label="Go to home"
        >
          <svg
            className="w-7 h-7 flex-shrink-0 group-hover:scale-105 transition-transform"
            viewBox="0 0 24 24"
            fill="none"
            stroke="url(#header-stetho-grad)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <defs>
              <linearGradient id="header-stetho-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#0d9488" />
              </linearGradient>
            </defs>
            <path d="M4.8 2.5v3.2a4.5 4.5 0 0 0 9 0v-3.2" />
            <path d="M6 2.5H3.5" />
            <path d="M15 2.5h-2.5" />
            <path d="M9.3 10.2v3.5a3.5 3.5 0 0 0 7 0v-2.2" />
            <circle cx="16.3" cy="11.5" r="2.2" fill="#0d9488" stroke="none" />
          </svg>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black tracking-tight text-slate-900 group-hover:text-sky-900 transition-colors">
              IMF
            </span>
            <span className="text-lg font-bold text-sky-600 tracking-tight">
              2026
            </span>
          </div>
        </button>

        {/* Right Action: Clean Admin Button with Person Icon */}
        <div className="flex items-center">
          <button
            id="admin-portal-btn"
            onClick={onOpenAdmin}
            className="flex items-center gap-2 text-xs font-bold px-3.5 py-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 bg-white shadow-xs transition-colors"
            title="Administrator Control Panel"
          >
            <Icons.User className="w-4 h-4 text-slate-500" />
            <span>Admin</span>
          </button>
        </div>


      </div>
    </header>
  );
}
