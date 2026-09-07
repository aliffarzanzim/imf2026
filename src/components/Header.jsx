// src/components/Header.jsx
import React from "react";
import { Icons } from "../assets/icons";

export function Header({ onOpenAdmin, onHome }) {
  return (
    <header className="glass-header">
      <div className="flex items-center justify-between h-16 max-w-7xl px-4 sm:px-6 lg:px-8 mx-auto">

        {/* Clean Logo + Festival Title (no clutter) */}
        <button
          onClick={onHome}
          className="flex items-center gap-3 text-left focus:outline-none group"
          aria-label="Go to home"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform">
            <Icons.Stethoscope className="w-5 h-5" />
          </div>
          <span className="text-lg font-black tracking-tight text-slate-900 leading-none group-hover:text-sky-600 transition-colors">
            IMF 2026
          </span>
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
