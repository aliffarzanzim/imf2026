// src/components/RegisterModal.js
import React, { useState } from "react";
import { Icons } from "../assets/icons";
import { submitRegistration } from "../utils/api";
import { SuccessCard } from "./SuccessCard";

const BATCHES = ["K-79", "K-80", "K-81", "K-82", "K-83", "Other"];
const YEARS   = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Final Year"];

const ACTIVITIES = [
  "Scientific Seminar / CME",
  "Mental Health Session",
  "Career Counselling Session",
  "Quiz Competition",
  "Olympiad",
  "Clinical Reasoning Challenge",
  "Clinical Case Challenge",
  "Academic Topic Presentation",
  "Academic Poster Presentation",
  "Public Awareness Poster Competition",
];

const COMPETITION_CATEGORIES = [
  "Quiz",
  "Olympiad",
  "Clinical Reasoning Challenge",
  "Clinical Case Challenge",
  "Academic Topic Presentation",
  "Academic Poster Presentation",
  "Public Awareness Poster Presentation",
  "Not participating in a competition",
];

const SECTIONS = [
  "Personal Information",
  "Participation",
  "Additional Information",
  "Declaration",
];

function SectionDivider({ title }) {
  return (
    <div className="section-divider my-2">
      <span className="section-title">{title}</span>
    </div>
  );
}

export function RegisterModal({ onClose }) {
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
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

  function toggleActivity(act) {
    setForm((f) => ({
      ...f,
      activities: f.activities.includes(act)
        ? f.activities.filter((a) => a !== act)
        : [...f.activities, act],
    }));
  }

  function validateStep() {
    if (step === 0) {
      if (!form.fullName.trim())    return "Full name is required.";
      if (!form.institution.trim()) return "Institution is required.";
      if (!form.batch)              return "Please select your batch.";
      if (!form.academicYear)       return "Please select your academic year.";
      if (!form.phone.trim())       return "Contact number is required.";
      if (!form.email.trim() || !form.email.includes("@"))
        return "A valid email address is required.";
    }
    if (step === 1) {
      if (form.activities.length === 0) return "Please select at least one activity.";
      if (!form.competitionCategory)    return "Please select a competition preference.";
    }
    if (step === 3) {
      if (!form.declaration) return "You must confirm the declaration to register.";
    }
    return null;
  }

  function handleNext() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setStep((s) => s + 1);
  }

  async function handleSubmit() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setLoading(true);
    setError("");
    try {
      const res = await submitRegistration(form);
      setRegNumber(res.regNumber);
    } catch (e) {
      setError(e.message || "Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (regNumber) {
    return (
      <SuccessCard
        regNumber={regNumber}
        title="Registration Successful!"
        subtitle="Your response has been recorded in the system."
        onClose={onClose}
      />
    );
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-panel">

        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)] mb-0.5">
              National Internal Medicine Festival 2026
            </p>
            <h2 className="text-xl font-bold text-[var(--color-text-main)]">
              Festival Registration
            </h2>
          </div>
          <button id="close-register-btn" onClick={onClose} className="btn-icon" aria-label="Close">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress */}
        <div className="px-8 pt-5 pb-0">
          <div className="flex items-center gap-2 mb-1">
            {SECTIONS.map((s, i) => (
              <React.Fragment key={i}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                    i < step  ? "bg-[var(--color-success)] text-white" :
                    i === step ? "bg-[var(--color-primary)] text-white" :
                                 "bg-slate-100 text-[var(--color-text-muted)]"
                  }`}>
                    {i < step ? <Icons.Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${i === step ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}`}>
                    {s}
                  </span>
                </div>
                {i < SECTIONS.length - 1 && (
                  <div className={`flex-1 h-0.5 rounded-full transition-all duration-300 ${i < step ? "bg-[var(--color-success)]" : "bg-slate-100"}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">

          {/* ── Section 1: Personal Information ── */}
          {step === 0 && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <SectionDivider title="Section 1 — Personal Information" />

              <div className="form-group">
                <label className="form-label form-label-required">Full Name</label>
                <div className="relative">
                  <Icons.User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
                  <input id="reg-full-name" className="form-input pl-10" placeholder="Enter your full name"
                    value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label form-label-required">Medical College / Institution</label>
                <div className="relative">
                  <Icons.Institution className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
                  <input id="reg-institution" className="form-input pl-10" placeholder="e.g. Dhaka Medical College"
                    value={form.institution} onChange={(e) => set("institution", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label form-label-required">Batch</label>
                  <select id="reg-batch" className="form-select" value={form.batch} onChange={(e) => set("batch", e.target.value)}>
                    <option value="">Select batch</option>
                    {BATCHES.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label form-label-required">Current Academic Year</label>
                  <select id="reg-year" className="form-select" value={form.academicYear} onChange={(e) => set("academicYear", e.target.value)}>
                    <option value="">Select year</option>
                    {YEARS.map((y) => <option key={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label form-label-required">Contact Number</label>
                <div className="relative">
                  <Icons.Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
                  <input id="reg-phone" className="form-input pl-10" placeholder="+880 ..." type="tel"
                    value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label form-label-required">Email Address</label>
                <div className="relative">
                  <Icons.Email className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
                  <input id="reg-email" className="form-input pl-10" placeholder="you@example.com" type="email"
                    value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ── Section 2: Participation ── */}
          {step === 1 && (
            <div className="flex flex-col gap-5 animate-fade-in">
              <SectionDivider title="Section 2 — Participation" />

              <div className="form-group">
                <label className="form-label form-label-required">
                  Which activities would you like to participate in?
                </label>
                <p className="form-hint mb-2">Select all that apply.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ACTIVITIES.map((act) => (
                    <label key={act} className={`check-item ${form.activities.includes(act) ? "bg-[var(--color-primary-light)] border-[var(--color-primary)]" : ""}`}>
                      <input type="checkbox" checked={form.activities.includes(act)}
                        onChange={() => toggleActivity(act)} />
                      <span className="check-item-label">{act}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label form-label-required">
                  If participating in a competition, select your preferred category.
                </label>
                <div className="flex flex-col gap-2 mt-1">
                  {COMPETITION_CATEGORIES.map((cat) => (
                    <label key={cat} className={`check-item ${form.competitionCategory === cat ? "bg-[var(--color-primary-light)] border-[var(--color-primary)]" : ""}`}>
                      <input type="radio" name="compCat" checked={form.competitionCategory === cat}
                        onChange={() => set("competitionCategory", cat)} />
                      <span className="check-item-label">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Section 3: Additional Information ── */}
          {step === 2 && (
            <div className="flex flex-col gap-5 animate-fade-in">
              <SectionDivider title="Section 3 — Additional Information" />

              <div className="form-group">
                <label className="form-label form-label-required">
                  Have you previously participated in any academic competition / conference?
                </label>
                <div className="flex gap-3 mt-2">
                  {["Yes", "No"].map((opt) => (
                    <label key={opt} className={`check-item flex-1 justify-center ${form.priorExperience === opt ? "bg-[var(--color-primary-light)] border-[var(--color-primary)]" : ""}`}>
                      <input type="radio" name="priorExp" checked={form.priorExperience === opt}
                        onChange={() => set("priorExperience", opt)} />
                      <span className="check-item-label font-medium">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Any questions or special requirements?</label>
                <textarea id="reg-queries" className="form-textarea" rows={4}
                  placeholder="Optional — write any questions or special needs here."
                  value={form.queries} onChange={(e) => set("queries", e.target.value)} />
                <span className="form-hint">Optional</span>
              </div>
            </div>
          )}

          {/* ── Section 4: Declaration ── */}
          {step === 3 && (
            <div className="flex flex-col gap-5 animate-fade-in">
              <SectionDivider title="Section 4 — Declaration" />

              {/* Summary */}
              <div className="card-sm p-4 bg-slate-50">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Registration Summary</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    ["Name",        form.fullName],
                    ["Institution", form.institution],
                    ["Batch",       form.batch],
                    ["Year",        form.academicYear],
                    ["Phone",       form.phone],
                    ["Email",       form.email],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <span className="text-[var(--color-text-muted)] text-xs">{k}</span>
                      <p className="font-medium text-[var(--color-text-main)] truncate">{v || "—"}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                  <span className="text-[var(--color-text-muted)] text-xs">Activities</span>
                  <p className="font-medium text-[var(--color-text-main)] text-sm mt-0.5">
                    {form.activities.join(", ") || "—"}
                  </p>
                </div>
              </div>

              <label className={`check-item items-start gap-3 ${form.declaration ? "bg-[var(--color-success-bg)] border-[var(--color-success)]" : ""}`}>
                <input id="reg-declaration" type="checkbox" checked={form.declaration}
                  onChange={(e) => set("declaration", e.target.checked)} />
                <span className="check-item-label text-sm leading-relaxed">
                  I confirm that the information provided is accurate and I agree to abide by the
                  rules and guidelines of the <strong>National Internal Medicine Festival 2026</strong>.
                </span>
              </label>

              <div className="alert-info rounded-lg text-xs">
                <Icons.Info className="w-4 h-4 flex-shrink-0" />
                <span>Registration is <strong>FREE</strong>. An official registration number will be generated immediately upon submission.</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 alert bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-red-200 rounded-lg text-sm">
              <Icons.Alert className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {step > 0 ? (
            <button className="btn-outline" onClick={() => { setStep((s) => s - 1); setError(""); }}>
              <Icons.Back className="w-4 h-4" /> Back
            </button>
          ) : (
            <button className="btn-outline" onClick={onClose}>Cancel</button>
          )}

          {step < SECTIONS.length - 1 ? (
            <button id="reg-next-btn" className="btn-primary" onClick={handleNext}>
              Next <Icons.ChevronDown className="w-4 h-4 rotate-[-90deg]" />
            </button>
          ) : (
            <button id="reg-submit-btn" className="btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? <><Icons.Spinner className="w-4 h-4 animate-spin" /> Registering…</> : <><Icons.Check className="w-4 h-4" /> Register Now</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
