// src/pages/Register.jsx
import React, { useState } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Icons } from "../assets/icons";
import { submitRegistration } from "../utils/api";
import { SuccessCard } from "../components/SuccessCard";

const BATCHES = ["K-79", "K-80", "K-81", "K-82", "K-83", "Other"];
const YEARS   = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Final Year"];

const ACTIVITIES = [
  { id: "cme", label: "Scientific Seminar / CME", desc: "Expert lectures and internal medicine updates" },
  { id: "mental", label: "Mental Health Session", desc: "Mindfulness and physician burnout workshop" },
  { id: "career", label: "Career Counselling Session", desc: "Post-graduate training roadmaps & international exams" },
  { id: "quiz", label: "Quiz Competition", desc: "Fast-paced medical diagnosis and trivia" },
  { id: "olympiad", label: "Olympiad", desc: "Rigorous pathology, pharmacology & clinical medicine tests" },
  { id: "cr", label: "Clinical Reasoning Challenge", desc: "Interactive mystery diagnostic dilemmas" },
  { id: "case", label: "Clinical Case Challenge", desc: "In-depth presentation of rare patient cases" },
  { id: "presentation", label: "Academic Topic Presentation", desc: "Oral presentation on internal medicine topics" },
  { id: "poster", label: "Academic Poster Presentation", desc: "Scientific research poster exhibition" },
  { id: "awareness", label: "Public Awareness Poster Competition", desc: "Preventive cardiology and health education posters" },
];

const COMPETITION_CATEGORIES = [
  "Quiz",
  "Olympiad",
  "Clinical Reasoning Challenge",
  "Clinical Case Challenge",
  "Academic Topic Presentation",
  "Academic Poster Presentation",
  "Public Awareness Poster Presentation",
  "Not participating in a competition (Attendee only)",
];

const STEPS = [
  { title: "Personal Details", desc: "Identity & College" },
  { title: "Participation", desc: "Events & Competitions" },
  { title: "Additional Info", desc: "Experience & Queries" },
  { title: "Declaration", desc: "Review & Submit" },
];

export function Register() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [regNumber, setRegNumber] = useState(null);

  const [form, setForm] = useState({
    fullName:            "",
    institution:         "",
    batch:               "",
    academicYear:        "",
    phone:               "",
    email:               "",
    activities:          [],
    competitionCategory: "",
    priorExperience:     "",
    queries:             "",
    declaration:         false,
  });

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  function toggleActivity(label) {
    setForm((f) => ({
      ...f,
      activities: f.activities.includes(label)
        ? f.activities.filter((a) => a !== label)
        : [...f.activities, label],
    }));
  }

  function validateStep() {
    if (step === 0) {
      if (!form.fullName.trim())    return "Full name is required.";
      if (!form.institution.trim()) return "Institution / Medical College is required.";
      if (!form.batch)              return "Please select your batch.";
      if (!form.academicYear)       return "Please select your academic year.";
      if (!form.phone.trim())       return "Contact phone number is required.";
      if (!form.email.trim() || !form.email.includes("@"))
        return "A valid email address is required.";
    }
    if (step === 1) {
      if (form.activities.length === 0) return "Please select at least one activity to attend.";
      if (!form.competitionCategory)    return "Please specify your competition category preference.";
    }
    if (step === 3) {
      if (!form.declaration) return "Please accept the attendee declaration to proceed.";
    }
    return null;
  }

  function handleNext() {
    const err = validateStep();
    if (err) {
      setError(err);
      window.scrollTo({ top: 120, behavior: "smooth" });
      return;
    }
    setError("");
    setStep((s) => s + 1);
    window.scrollTo({ top: 120, behavior: "smooth" });
  }

  function handleBack() {
    setError("");
    setStep((s) => s - 1);
    window.scrollTo({ top: 120, behavior: "smooth" });
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await submitRegistration(form);
      setRegNumber(res.regNumber);
    } catch (ex) {
      setError(ex.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (regNumber) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <Header
          onHome={() => { window.location.hash = "#/"; }}
          onOpenAdmin={() => { window.location.hash = "#/admin"; }}
        />
        <main className="flex-1 flex items-center justify-center pt-24 pb-16 px-4">
          <SuccessCard
            regNumber={regNumber}
            title="Registration Confirmed!"
            subtitle="Your place at the Internal Medicine Festival 2026 has been reserved."
            onClose={() => { window.location.hash = "#/"; }}
          />
        </main>
        <Footer
          onOpenAdmin={() => { window.location.hash = "#/admin"; }}
          onOpenRegister={() => { setRegNumber(null); setStep(0); }}
          onOpenAbstract={() => { window.location.hash = "#/abstract"; }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      <Header
        onHome={() => { window.location.hash = "#/"; }}
        onOpenAdmin={() => { window.location.hash = "#/admin"; }}
      />

      <main className="flex-1 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs font-semibold text-slate-500">
          <button
            onClick={() => { window.location.hash = "#/"; }}
            className="hover:text-slate-900 transition-colors"
          >
            Home
          </button>
          <span>/</span>
          <span className="text-sky-600">Festival Registration</span>
        </div>

        {/* Page Header Banner */}
        <div className="card p-6 sm:p-8 mb-8 bg-gradient-to-r from-sky-900 to-slate-900 text-white border-0 shadow-elevated">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[11px] font-bold tracking-wider uppercase mb-2">
                Free Registration
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Delegate Registration Portal
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                Internal Medicine Festival 2026 • 17 September 2026 • Dhaka Medical College
              </p>
            </div>
            <div className="flex sm:flex-col items-end gap-1">
              <span className="text-xs text-slate-400">Deadline</span>
              <span className="text-sm font-bold text-teal-300">14 Sep 2026</span>
            </div>
          </div>

          {/* Stepper Progress */}
          <div className="grid grid-cols-4 gap-2 mt-8 pt-6 border-t border-white/10">
            {STEPS.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => { if (idx < step) setStep(idx); }}
                disabled={idx > step}
                className="text-left group cursor-pointer disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center transition-all ${
                      idx === step
                        ? "bg-teal-400 text-slate-950 ring-4 ring-teal-400/20"
                        : idx < step
                        ? "bg-emerald-500 text-white"
                        : "bg-white/10 text-white/40"
                    }`}
                  >
                    {idx < step ? "✓" : idx + 1}
                  </span>
                  <span
                    className={`text-xs font-bold hidden sm:inline transition-colors ${
                      idx === step ? "text-white" : idx < step ? "text-slate-300" : "text-white/30"
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
                <div
                  className={`h-1 rounded-full transition-all ${
                    idx === step
                      ? "bg-teal-400"
                      : idx < step
                      ? "bg-emerald-500"
                      : "bg-white/10"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2 animate-fade-in">
            <Icons.Alert className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body Card */}
        <div className="card p-6 sm:p-8 bg-white border border-slate-200 shadow-card">

          {/* ── STEP 0: Personal Details ── */}
          {step === 0 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Personal & Academic Information</h2>
                <p className="text-xs text-slate-500 mt-0.5">Please provide your verified details for event credentialing.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="form-group sm:col-span-2">
                  <label className="form-label form-label-required" htmlFor="fullName">Full Name</label>
                  <input
                    id="fullName"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Dr. Tanvir Ahmed"
                    value={form.fullName}
                    onChange={(e) => set("fullName", e.target.value)}
                    required
                  />
                </div>

                <div className="form-group sm:col-span-2">
                  <label className="form-label form-label-required" htmlFor="institution">Medical College / Institution</label>
                  <input
                    id="institution"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Dhaka Medical College"
                    value={form.institution}
                    onChange={(e) => set("institution", e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label form-label-required" htmlFor="batch">Batch</label>
                  <select
                    id="batch"
                    className="form-select"
                    value={form.batch}
                    onChange={(e) => set("batch", e.target.value)}
                    required
                  >
                    <option value="">Select your batch</option>
                    {BATCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label form-label-required" htmlFor="academicYear">Current Academic Year</label>
                  <select
                    id="academicYear"
                    className="form-select"
                    value={form.academicYear}
                    onChange={(e) => set("academicYear", e.target.value)}
                    required
                  >
                    <option value="">Select your year</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label form-label-required" htmlFor="phone">Contact Number (WhatsApp)</label>
                  <input
                    id="phone"
                    type="tel"
                    className="form-input"
                    placeholder="e.g. 017xxxxxxxx"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label form-label-required" htmlFor="email">Email Address</label>
                  <input
                    id="email"
                    type="email"
                    className="form-input"
                    placeholder="e.g. name@example.com"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 1: Participation & Segments ── */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Festival Participation & Segments</h2>
                <p className="text-xs text-slate-500 mt-0.5">Select all sessions and competitions you wish to take part in.</p>
              </div>

              <div className="space-y-3">
                <label className="form-label form-label-required">Which activities would you like to attend?</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ACTIVITIES.map((act) => {
                    const selected = form.activities.includes(act.label);
                    return (
                      <div
                        key={act.id}
                        onClick={() => toggleActivity(act.label)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                          selected
                            ? "bg-sky-50/70 border-sky-400 ring-1 ring-sky-400"
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {}}
                          className="w-4 h-4 accent-sky-600 mt-0.5"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-800 leading-snug">{act.label}</div>
                          <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{act.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="form-group pt-4 border-t border-slate-100">
                <label className="form-label form-label-required" htmlFor="compCat">
                  Primary Competition Preference
                </label>
                <select
                  id="compCat"
                  className="form-select"
                  value={form.competitionCategory}
                  onChange={(e) => set("competitionCategory", e.target.value)}
                  required
                >
                  <option value="">Select competition preference</option>
                  {COMPETITION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* ── STEP 2: Additional Info ── */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Background & Inquiries (Optional)</h2>
                <p className="text-xs text-slate-500 mt-0.5">Help us tailor the festival experience to your clinical interests.</p>
              </div>

              <div className="space-y-5">
                <div className="form-group">
                  <label className="form-label" htmlFor="priorExp">
                    Prior Competition / Academic Experience
                  </label>
                  <textarea
                    id="priorExp"
                    rows={3}
                    className="form-input"
                    placeholder="Mention previous Olympiads, research presentations, or medical quiz competitions you've participated in..."
                    value={form.priorExperience}
                    onChange={(e) => set("priorExperience", e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="queries">
                    Questions, Queries or Suggestions for the Organizers
                  </label>
                  <textarea
                    id="queries"
                    rows={3}
                    className="form-input"
                    placeholder="Any specific topics or clinical queries you would like addressed during the CME or career session?"
                    value={form.queries}
                    onChange={(e) => set("queries", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Declaration & Confirmation ── */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Review & Declaration</h2>
                <p className="text-xs text-slate-500 mt-0.5">Please review your registration summary before confirming.</p>
              </div>

              {/* Review Card */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 text-slate-700">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Full Name:</span>
                  <strong className="text-slate-900">{form.fullName}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Institution:</span>
                  <strong className="text-slate-900">{form.institution}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Batch & Year:</span>
                  <strong className="text-slate-900">{form.batch} • {form.academicYear}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Contact:</span>
                  <strong className="text-slate-900">{form.phone} ({form.email})</strong>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500">Registered Segments:</span>
                  <strong className="text-sky-700 text-right max-w-xs">{form.activities.join(", ") || "None"}</strong>
                </div>
              </div>

              {/* Declaration Checkbox */}
              <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/50">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.declaration}
                    onChange={(e) => set("declaration", e.target.checked)}
                    className="w-4 h-4 accent-teal-600 mt-0.5"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed">
                    I confirm that the details provided are accurate and that I am a bonafide medical student eligible for the Internal Medicine Festival 2026. I agree to abide by the event guidelines set by DMC IMIG, ACP Bangladesh Chapter, and BSM.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Navigation & Action Bar */}
          <div className="flex items-center justify-between pt-8 mt-6 border-t border-slate-100">
            {step > 0 ? (
              <button
                type="button"
                onClick={handleBack}
                className="btn-outline text-xs py-2.5 px-5"
                disabled={loading}
              >
                ← Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { window.location.hash = "#/"; }}
                className="btn-outline text-xs py-2.5 px-5"
              >
                Cancel
              </button>
            )}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="btn-primary text-xs py-2.5 px-6 font-semibold"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !form.declaration}
                className="btn-primary text-xs py-2.5 px-7 font-bold shadow-md flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Icons.Spinner className="w-4 h-4 animate-spin" />
                    Confirming Registration…
                  </>
                ) : (
                  <>
                    <Icons.Check className="w-4 h-4" />
                    Submit Registration
                  </>
                )}
              </button>
            )}
          </div>

        </div>
      </main>

      <Footer
        onOpenAdmin={() => { window.location.hash = "#/admin"; }}
        onOpenRegister={() => { setStep(0); }}
        onOpenAbstract={() => { window.location.hash = "#/abstract"; }}
      />
    </div>
  );
}
