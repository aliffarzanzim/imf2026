import React, { useState, useEffect } from "react";
import { Icons } from "../assets/icons";
import { getSystemConfig, getInitialSystemConfig, getFestivalStats } from "../utils/api";
import imigLogo from "../assets/logos/imig.jpg";
import acpLogo from "../assets/logos/acp.jpg";
import bsmLogo from "../assets/logos/bsm.jpg";
import aristopharmaLogo from "../assets/logos/aristopharma.png";

const ORGANIZERS = [
  {
    name: "DMC IMIG",
    role: "Dhaka Medical College Internal Medicine Interest Group",
    logo: imigLogo,
    alt: "DMC IMIG Logo",
    url: "https://acpbd.org/",
  },
  {
    name: "ACP Bangladesh Chapter",
    role: "American College of Physicians",
    logo: acpLogo,
    alt: "ACP Bangladesh Chapter Logo",
    url: "https://acpbd.org/",
  },
  {
    name: "BSM",
    role: "Bangladesh Society of Medicine",
    logo: bsmLogo,
    alt: "Bangladesh Society of Medicine Logo",
    url: "https://bsmedicine.org/",
  },
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
    title: "Quiz Competition",
    desc: "High-stakes medical competition testing clinical diagnosis and pathology trivia.",
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

// Smooth non-uniform count-up hook (ease-out quartic for silky-smooth deceleration)
function useSmoothCount(targetValue, duration = 2000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!targetValue || targetValue <= 0) return;

    let startTimestamp = null;
    let frameId;

    // Ease-out quartic: starts rapidly, then softly decelerates into the final number
    const easeOutQuart = (x) => 1 - Math.pow(1 - x, 4);

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuart(progress);
      setCount(Math.round(eased * targetValue));

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        setCount(targetValue);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [targetValue, duration]);

  return count;
}

export function Hero({ onOpenRegister, onOpenAbstract, onOpenManage }) {
  // Synchronous countdown to eliminate initial render flicker / layout shift
  const [timeLeft, setTimeLeft] = useState(getInitialCountdown);
  const [config, setConfig] = useState(getInitialSystemConfig);
  const [stats, setStats] = useState({ totalRegistrations: 615, totalColleges: 34 });

  useEffect(() => {
    getFestivalStats()
      .then((data) => {
        if (data && typeof data.totalRegistrations === "number") {
          setStats({
            totalRegistrations: data.totalRegistrations,
            totalColleges: data.totalColleges || 34,
          });
        }
      })
      .catch(() => {});
  }, []);

  const animatedRegistrations = useSmoothCount(stats.totalRegistrations, 2200);
  const animatedColleges = useSmoothCount(stats.totalColleges, 1800);

  useEffect(() => {
    getSystemConfig()
      .then((c) => {
        if (c && typeof c.registration_open === "boolean") {
          setConfig(c);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getInitialCountdown());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {/* ── Hero Section (Full viewport height on initial landing) ── */}
      <section className="relative w-full min-h-screen flex flex-col justify-between items-center pt-20 pb-8 sm:pt-24 sm:pb-10 overflow-hidden">

        {/* Subtle ambient lighting */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-sky-400/15 to-teal-300/15 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center my-auto">

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

          {/* Organizers */}
          <p className="text-xs sm:text-sm text-slate-500 mt-2.5 font-normal">
            Organized by <strong className="font-semibold text-slate-700">DMC IMIG</strong> &nbsp;•&nbsp; <strong className="font-semibold text-slate-700">ACP Bangladesh Chapter</strong> &nbsp;•&nbsp; <strong className="font-semibold text-slate-700">Bangladesh Society of Medicine (BSM)</strong>
          </p>

          {/* ── Live Festival Milestone Cards (Smooth Decelerating Animation) ── */}
          <div className="mt-5 sm:mt-6 grid grid-cols-2 gap-3 sm:gap-5 w-full max-w-xs sm:max-w-lg md:max-w-xl mx-auto">
            {/* Card 1: Total Registration */}
            <div className="group relative flex flex-col items-center justify-center p-3 sm:py-4.5 sm:px-6 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-xs hover:shadow-md hover:border-sky-300 transition-all duration-300">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 mb-1.5 sm:mb-2 group-hover:scale-110 transition-transform">
                <Icons.Users className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight flex items-baseline">
                <span>{animatedRegistrations.toLocaleString()}</span>
                <span className="text-sky-600 font-extrabold text-base sm:text-2xl ml-0.5">+</span>
              </div>
              <span className="text-[11px] sm:text-sm font-semibold text-slate-600 tracking-tight text-center mt-0.5">
                Total Registration
              </span>
            </div>

            {/* Card 2: Medical Colleges */}
            <div className="group relative flex flex-col items-center justify-center p-3 sm:py-4.5 sm:px-6 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-xs hover:shadow-md hover:border-teal-300 transition-all duration-300">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 mb-1.5 sm:mb-2 group-hover:scale-110 transition-transform">
                <Icons.Institution className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight flex items-baseline">
                <span>{animatedColleges.toLocaleString()}</span>
                <span className="text-teal-600 font-extrabold text-base sm:text-2xl ml-0.5">+</span>
              </div>
              <span className="text-[11px] sm:text-sm font-semibold text-slate-600 tracking-tight text-center mt-0.5">
                Medical Colleges
              </span>
            </div>
          </div>

          {/* Key Information Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 mt-6 sm:mt-7 max-w-3xl">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 shadow-xs text-xs font-medium text-slate-700">
              <Icons.Date className="w-4 h-4 text-sky-600 flex-shrink-0" />
              <span>Event Date: <strong className="font-bold text-slate-900">17 September 2026</strong></span>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 shadow-xs text-xs font-medium text-slate-700">
              <Icons.Degree className="w-4 h-4 text-teal-600 flex-shrink-0" />
              <span>Eligibility: <strong className="font-bold text-slate-900">1st Year to Final-Year Medical Students</strong></span>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 shadow-xs text-xs font-bold text-emerald-700">
              <Icons.Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Free Registration</span>
            </div>
          </div>

          {/* Primary CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-6 sm:mt-8 w-full max-w-sm sm:max-w-none sm:w-auto">
            {/* Register Button */}
            {config.registration_open === false ? (
              <button
                disabled
                className="inline-flex items-center justify-center gap-2 px-5 sm:px-8 py-3.5 text-sm sm:text-base font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-xl cursor-not-allowed shadow-none whitespace-nowrap"
                title="Registration is currently closed by the organizing committee"
              >
                <Icons.Lock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>Registration Closed</span>
              </button>
            ) : (
              <button
                id="open-register-btn"
                onClick={onOpenRegister}
                className={`inline-flex items-center justify-center gap-2 sm:gap-2.5 px-5 sm:px-8 py-3.5 text-sm sm:text-base font-bold text-white rounded-xl shadow-md transition-colors whitespace-nowrap ${
                  config.registration_abstract_only
                    ? "bg-purple-700 hover:bg-purple-800 active:bg-purple-900 border border-purple-600"
                    : "bg-sky-600 hover:bg-sky-700 active:bg-sky-800"
                }`}
                title={config.registration_abstract_only ? "Registration is open for abstract submitters only" : "Register for IMF 2026"}
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span>Register for Festival</span>
                  {config.registration_abstract_only && (
                    <span className="text-[10px] uppercase tracking-wider font-extrabold bg-purple-950/80 border border-purple-300/40 text-purple-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                      Abstract Only
                    </span>
                  )}
                </span>
                <Icons.Back className="w-4 h-4 rotate-180 flex-shrink-0" />
              </button>
            )}

            {/* Manage / Lookup Registration Button */}
            <button
              id="open-manage-btn"
              onClick={onOpenManage || onOpenAbstract}
              className="inline-flex items-center justify-center gap-2 sm:gap-2.5 px-5 sm:px-8 py-3.5 text-sm sm:text-base font-bold text-white rounded-xl shadow-md bg-teal-700 hover:bg-teal-800 active:bg-teal-900 border border-teal-800 transition-colors whitespace-nowrap"
            >
              <Icons.Edit className="w-4 h-4 sm:w-5 sm:h-5 text-teal-100 flex-shrink-0" />
              <span>Already Registered?</span>
            </button>
          </div>

          {/* Deadline Ribbon */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-500 text-center">
            <div className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
              <span>Registration &amp; Abstract Deadline:</span>
              <strong className="text-rose-600 font-bold whitespace-nowrap">14 September 2026</strong>
            </div>
            {timeLeft.days > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[11px] font-semibold border border-rose-200/60 whitespace-nowrap">
                {timeLeft.days}d {timeLeft.hours}h left
              </span>
            )}
          </div>

          {/* Scroll Cue to Activities */}
          <a
            href="#activities"
            className="mt-8 sm:mt-10 inline-flex flex-col items-center gap-1.5 text-slate-400 hover:text-slate-600 transition-colors group cursor-pointer"
          >
            <span className="text-[11px] font-medium tracking-wide">Explore Festival Program</span>
            <div className="animate-bounce mt-0.5">
              <Icons.Back className="w-4 h-4 -rotate-90 text-slate-500" />
            </div>
          </a>

        </div>
      </section>

      {/* ── Featured Activities Section (Clean, dedicated section) ── */}
      <section id="activities" className="w-full scroll-mt-16 border-t border-slate-200/70 bg-white/60 backdrop-blur-xs py-16 sm:py-20">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-12">
            <span className="text-xs font-extrabold uppercase tracking-widest text-teal-600">
              Festival Program
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">
              Featured Segments &amp; Competitions
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
                  className="group relative p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md hover:border-sky-300 hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${act.color} flex items-center justify-center mb-4 shadow-2xs group-hover:scale-105 transition-transform`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-sky-700 transition-colors">
                    {act.title}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed font-normal">
                    {act.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* ── Institutional Endorsements ── */}
          <div className="mt-14 pt-8 border-t border-slate-200/80">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center mb-6">
              Under the Distinguished Auspices of
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {ORGANIZERS.map((org, i) => (
                <a
                  key={i}
                  href={org.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-6 rounded-2xl border border-slate-200/90 bg-white text-center shadow-xs hover:border-slate-300 hover:shadow-card hover:-translate-y-1 transition-all flex flex-col items-center justify-between group cursor-pointer"
                >
                  <div className="h-24 w-full flex items-center justify-center mb-4">
                    <img
                      src={org.logo}
                      alt={org.alt}
                      className="max-h-24 max-w-[85%] object-contain group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm tracking-tight group-hover:text-teal-700 transition-colors flex items-center justify-center gap-1.5">
                      <span>{org.name}</span>
                      <Icons.ExternalLink className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-1">{org.role}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* ── Sponsored By ── */}
          <div className="mt-14 pt-8 border-t border-slate-200/80">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center mb-6">
              Sponsored by
            </p>

            <div className="flex justify-center">
              <a
                href="https://www.aristopharma.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-6 sm:px-12 sm:py-7 rounded-2xl border border-slate-200/90 bg-white text-center shadow-xs hover:border-slate-300 hover:shadow-card hover:-translate-y-1 transition-all flex flex-col items-center justify-center group max-w-md w-full cursor-pointer"
              >
                <div className="h-16 w-full flex items-center justify-center mb-2">
                  <img
                    src={aristopharmaLogo}
                    alt="Aristopharma Ltd. Logo"
                    className="max-h-14 max-w-[85%] object-contain group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
                <div>
                  <div className="font-extrabold text-slate-900 text-sm tracking-tight group-hover:text-teal-700 transition-colors flex items-center justify-center gap-1.5">
                    <span>Aristopharma Ltd.</span>
                    <Icons.ExternalLink className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </a>
            </div>
          </div>

        </div>
      </section>
    </>
  );
}

