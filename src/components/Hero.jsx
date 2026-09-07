// src/components/Hero.jsx
import React, { useState, useEffect } from "react";
import { Icons } from "../assets/icons";

const ORGANIZERS = [
  { name: "DMC IMIG", role: "Dhaka Medical College" },
  { name: "ACP Bangladesh Chapter", role: "American College of Physicians" },
  { name: "BSM", role: "Bangladesh Society of Medicine" },
];


const ACTIVITIES = [
  {
    icon: Icons.Clipboard,
    title: "Clinical Reasoning",
    desc: "Interactive diagnostic case challenges & master clinician discussions.",
    color: "from-blue-500/10 to-indigo-500/10 text-blue-600",
  },
  {
    icon: Icons.BookOpen,
    title: "Scientific Seminar / CME",
    desc: "Keynotes from leading national and international internists.",
    color: "from-sky-500/10 to-teal-500/10 text-sky-600",
  },
  {
    icon: Icons.Trophy,
    title: "Quiz & Olympiad",
    desc: "High-stakes medical competition testing clinical diagnosis and pathology.",
    color: "from-amber-500/10 to-orange-500/10 text-amber-600",
  },
  {
    icon: Icons.Microscope,
    title: "Abstract Presentations",
    desc: "Oral and poster presentations of original research and rare cases.",
    color: "from-teal-500/10 to-emerald-500/10 text-teal-600",
  },
  {
    icon: Icons.Stethoscope,
    title: "Career Counselling",
    desc: "Roadmaps for FCPS, MD, MRCP, USMLE, and residency planning.",
    color: "from-purple-500/10 to-pink-500/10 text-purple-600",
  },
  {
    icon: Icons.Brain,
    title: "Mental Health Session",
    desc: "Dedicated wellness, burnout prevention, and mindfulness workshop.",
    color: "from-rose-500/10 to-red-500/10 text-rose-600",
  },
];

function getInitialCountdown() {
  const deadline = new Date("2026-09-14T23:59:59").getTime();
  const now = new Date().getTime();
  const diff = Math.max(0, deadline - now);
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
  };
}

export function Hero({ onOpenRegister, onOpenAbstract }) {
  // Synchronous countdown to eliminate initial render flicker / layout shift
  const [timeLeft, setTimeLeft] = useState(getInitialCountdown);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getInitialCountdown());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative pt-16 pb-6 sm:pt-20 sm:pb-8 overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-sky-400/15 to-teal-300/15 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">

        {/* Festival Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-sky-200 bg-sky-50 shadow-xs mb-4">
          <span className="w-2 h-2 rounded-full bg-sky-600" />
          <span className="text-xs font-black tracking-wider uppercase text-sky-900">
            Internal Medicine Festival 2026
          </span>
        </div>

        {/* Grand Festival Name as Main Heading */}
        <h1 className="max-w-4xl text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-slate-900 leading-[1.08]">
          Internal Medicine <br className="hidden sm:inline" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 via-teal-600 to-emerald-600">
            Festival 2026
          </span>
        </h1>

        {/* Theme Slogan */}
        <p className="text-lg sm:text-2xl font-bold text-slate-800 mt-4 tracking-tight">
          Inspiring the Future of Internal Medicine
        </p>

        {/* Subtitle & Organizers */}
        <p className="max-w-2xl mt-3 text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
          Bangladesh's premier national gathering of future diagnosticians,
          internists, and clinical researchers for a transformative day of academic excellence.
        </p>

        <p className="text-xs font-semibold text-slate-500 mt-2">
          Organized by DMC IMIG &nbsp;•&nbsp; ACP Bangladesh Chapter &nbsp;•&nbsp; Bangladesh Society of Medicine (BSM)
        </p>

        {/* Key Information Chips */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-8">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 shadow-xs text-xs font-semibold text-slate-700">
            <Icons.Date className="w-4 h-4 text-sky-600" />
            <span>17 September 2026</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 shadow-xs text-xs font-semibold text-slate-700">
            <Icons.Degree className="w-4 h-4 text-teal-600" />
            <span>1st Year to Final Year</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 shadow-xs text-xs font-bold text-emerald-700">
            <Icons.Check className="w-4 h-4 text-emerald-600" />
            <span>100% Free Registration</span>
          </div>
        </div>

        {/* Primary CTA Buttons with High-Contrast Solid Non-Blending Styles */}
        <div className="flex flex-col sm:flex-row gap-4 mt-9 w-full max-w-md sm:max-w-none sm:w-auto">
          {/* Register Button: Vibrant Cerulean / Sky Solid */}
          <button
            id="open-register-btn"
            onClick={onOpenRegister}
            className="inline-flex items-center justify-center gap-2.5 px-8 py-3.5 text-base font-bold text-white rounded-xl shadow-md bg-sky-600 hover:bg-sky-700 active:bg-sky-800 transition-colors"
          >
            <span>Register for Festival</span>
            <Icons.Back className="w-4 h-4 rotate-180" />
          </button>

          {/* Submit Abstract Button: Solid Deep Teal (High Contrast, Never Blends with Background) */}
          <button
            id="open-abstract-btn"
            onClick={onOpenAbstract}
            className="inline-flex items-center justify-center gap-2.5 px-8 py-3.5 text-base font-bold text-white rounded-xl shadow-md bg-teal-700 hover:bg-teal-800 active:bg-teal-900 border border-teal-800 transition-colors"
          >
            <Icons.Upload className="w-5 h-5 text-teal-100" />
            <span>Submit Abstract</span>
          </button>
        </div>

        {/* Deadline Ribbon */}
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          <span>Registration & Abstract Deadline:</span>
          <strong className="text-rose-600 font-bold">14 September 2026</strong>
          {timeLeft.days > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[11px] font-semibold border border-rose-200/60">
              {timeLeft.days}d {timeLeft.hours}h left
            </span>
          )}
        </div>

        {/* ── Featured Activities Section ── */}
        <div className="mt-20 w-full max-w-6xl">
          <div className="text-center mb-10">
            <span className="text-xs font-extrabold uppercase tracking-widest text-teal-600">
              Festival Program
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">
              Featured Segments & Competitions
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-lg mx-auto">
              Participate in inter-medical competitions, CME updates, and scientific poster sessions.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
            {ACTIVITIES.map((act, i) => {
              const Icon = act.icon;
              return (
                <div
                  key={i}
                  className="card p-5 hover:border-slate-300 transition-colors bg-white"
                >
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${act.color} flex items-center justify-center mb-4`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    {act.title}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed font-normal">
                    {act.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Institutional Endorsements ── */}
        <div className="mt-12 pt-6 border-t border-slate-200/80 w-full max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-5">
            Under the Distinguished Auspices of
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {ORGANIZERS.map((org, i) => (
              <div
                key={i}
                className="p-4 rounded-xl border border-slate-200/70 bg-white/70 backdrop-blur-sm text-center shadow-xs"
              >
                <div className="font-bold text-slate-800 text-sm">{org.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{org.role}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}

