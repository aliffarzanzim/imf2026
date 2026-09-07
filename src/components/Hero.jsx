// src/components/Hero.js
import React from "react";
import { Icons } from "../assets/icons";

const ORGANIZERS = [
  "DMC IMIG",
  "ACP Bangladesh Chapter",
  "Bangladesh Society of Medicine (BSM)",
];

const EVENT_DETAILS = [
  { icon: Icons.Date,       label: "17 September 2026" },
  { icon: Icons.Degree,     label: "1st Year – Final Year" },
  { icon: Icons.Activity,   label: "Registration: FREE" },
];

const ACTIVITIES = [
  { icon: Icons.BookOpen,     label: "Scientific Seminar / CME" },
  { icon: Icons.Brain,        label: "Mental Health Session" },
  { icon: Icons.Stethoscope,  label: "Career Counselling" },
  { icon: Icons.Trophy,       label: "Quiz & Olympiad" },
  { icon: Icons.Clipboard,    label: "Clinical Case Challenge" },
  { icon: Icons.Microscope,   label: "Academic Presentations" },
];

export function Hero({ onOpenRegister, onOpenAbstract }) {
  return (
    <section className="hero-bg relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[var(--color-primary)] opacity-[0.04] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[var(--color-accent)] opacity-[0.06] blur-3xl" />

      <div className="relative max-w-6xl mx-auto px-6 pt-28 pb-20 flex flex-col items-center text-center">

        {/* Organizer Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8 animate-fade-in">
          {ORGANIZERS.map((org, i) => (
            <span key={i} className="badge-neutral font-medium">
              {org}
            </span>
          ))}
        </div>

        {/* Tagline */}
        <p className="text-sm font-semibold tracking-[0.2em] uppercase text-[var(--color-accent)] mb-4 animate-fade-in">
          National Internal Medicine Festival 2026
        </p>

        {/* Main Title */}
        <h1 className="max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight text-[var(--color-text-main)] animate-slide-up">
          "Inspiring the Future of{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]">
            Internal Medicine"
          </span>
        </h1>

        <p className="max-w-2xl mt-5 text-base sm:text-lg text-[var(--color-text-muted)] leading-relaxed animate-fade-in">
          Bringing together clinical reasoning, academic research, and medical
          students from across the nation for a day of inspiration and learning.
        </p>

        {/* Event Detail Pills */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-7 animate-fade-in">
          {EVENT_DETAILS.map(({ icon: Icon, label }, i) => (
            <div key={i} className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-body)]">
              <Icon className="w-4 h-4 text-[var(--color-accent)] flex-shrink-0" />
              {label}
            </div>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mt-8 w-full max-w-sm sm:max-w-none sm:w-auto animate-slide-up">
          <button
            id="open-register-btn"
            onClick={onOpenRegister}
            className="btn-primary px-8 py-3.5 text-base shadow-lg"
          >
            <Icons.Clipboard className="w-5 h-5" />
            Register for Festival
          </button>
          <button
            id="open-abstract-btn"
            onClick={onOpenAbstract}
            className="btn-accent px-8 py-3.5 text-base shadow-lg"
          >
            <Icons.FileUp className="w-5 h-5" />
            Submit Abstract
          </button>
        </div>

        {/* Deadline Notice */}
        <p className="mt-4 text-xs text-[var(--color-text-muted)] animate-fade-in">
          Last date for registration & abstract submission:{" "}
          <span className="font-semibold text-[var(--color-danger)]">14 September 2026</span>
        </p>

        {/* Activities Grid */}
        <div className="mt-16 w-full max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)] mb-5">
            Featured Activities
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {ACTIVITIES.map(({ icon: Icon, label }, i) => (
              <div
                key={i}
                className="card-sm flex flex-col items-center gap-2 p-4 text-center hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[var(--color-primary)]" />
                </div>
                <span className="text-xs font-medium text-[var(--color-text-body)] leading-tight">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Organizer Footer Strip */}
        <div className="mt-16 pt-8 border-t border-[var(--color-border)] w-full flex flex-col sm:flex-row items-center justify-center gap-3 text-sm text-[var(--color-text-muted)]">
          <span>Organized by</span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {ORGANIZERS.map((org, i) => (
              <React.Fragment key={i}>
                <span className="font-semibold text-[var(--color-text-main)]">{org}</span>
                {i < ORGANIZERS.length - 1 && <span className="text-[var(--color-text-subtle)]">•</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
