// src/components/Footer.jsx
import React from "react";
import { Icons } from "../assets/icons";

export function Footer({ onOpenAdmin, onOpenRegister, onOpenAbstract }) {
  return (
    <footer className="border-t border-slate-200 bg-white/95 mt-20 text-slate-600 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">

          {/* Col 1: Festival Identity */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-teal-500 flex items-center justify-center text-white shadow-xs">
                <Icons.HeartPulse className="w-4 h-4" />
              </div>
              <span className="text-base font-extrabold tracking-tight text-slate-900">
                IMF 2026
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-4">
              Internal Medicine Festival 2026 — Inspiring the Future of Internal Medicine.
              A premier medical conference for medical students across Bangladesh.
            </p>
            <div className="text-xs text-slate-400">
              📅 17 September 2026 &nbsp;•&nbsp; 📍 Dhaka Medical College
            </div>
          </div>

          {/* Col 2: Navigation & Actions */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">
              Quick Links
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={onOpenRegister}
                  className="text-slate-600 hover:text-sky-600 transition-colors"
                >
                  Delegate Registration
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenAbstract}
                  className="text-slate-600 hover:text-teal-600 transition-colors"
                >
                  Submit Scientific Abstract
                </button>
              </li>
              <li>
                <a
                  href="#activities"
                  className="text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Featured Competitions
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Leadership & Organizations */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">
              Organized by
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-500">
              <li className="font-semibold text-slate-700">DMC IMIG</li>
              <li className="font-semibold text-slate-700">ACP Bangladesh Chapter</li>
              <li className="font-semibold text-slate-700">Bangladesh Society of Medicine</li>
            </ul>
          </div>
        </div>

        {/* Bottom Credits Strip */}
        <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          
          {/* Maintained By credit (Requested by User) */}
          <div className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            <span>Maintained by</span>
            <strong className="text-slate-800 font-semibold">Aiman Talukder (DMC K-79)</strong>
            <span>&</span>
            <strong className="text-slate-800 font-semibold">Alif Farzan Zim (DMC K-79)</strong>
          </div>

          {/* Copyright & Discreet Admin Access */}
          <div className="flex items-center gap-4 text-slate-400">
            <span>© 2026 Internal Medicine Festival. All rights reserved.</span>
            <button
              onClick={onOpenAdmin}
              className="text-slate-400 hover:text-slate-700 text-[11px] underline underline-offset-2 transition-colors"
            >
              Admin Portal
            </button>
          </div>
        </div>

      </div>
    </footer>
  );
}
