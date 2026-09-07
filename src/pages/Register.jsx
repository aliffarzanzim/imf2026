// src/pages/Register.jsx
import React, { useState, useEffect, useRef } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Icons } from "../assets/icons";
import {
  submitRegistration,
  lookupRegistration,
  updateRegistrationData,
  getUploadUrl,
  uploadFileToR2,
} from "../utils/api";
import { SuccessCard } from "../components/SuccessCard";
import { navigate } from "../utils/navigation";

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

const SUBMISSION_TYPES = [
  "Original Research",
  "Clinical Case Report",
  "Systematic Review / Meta-Analysis",
  "Clinical Audit & Quality Improvement",
];

const PRESENTATION_CATEGORIES = [
  "Oral Presentation",
  "Poster Presentation",
  "Either (Committee Discretion)",
];

const REG_STEPS = [
  { title: "Personal Details", desc: "Identity & College" },
  { title: "Participation", desc: "Sessions & Events" },
  { title: "Abstract Submission", desc: "Optional Abstract" },
  { title: "Additional Info", desc: "Experience & Queries" },
  { title: "Declaration", desc: "Review & Submit" },
];

export function Register({ initialMode = "register" }) {
  // Check URL query param e.g. /register?mode=manage
  const initialTab =
    initialMode === "manage" ||
    (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "manage")
      ? "manage"
      : "register";

  const [activeTab, setActiveTab] = useState(initialTab);

  // ── New Registration State ─────────────────────────────────────
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successInfo, setSuccessInfo] = useState(null); // { regNumber, abstractNumber, phone, title, subtitle }

  const [form, setForm] = useState({
    // Personal (Step 0)
    fullName:            "",
    institution:         "",
    batch:               "",
    academicYear:        "",
    phone:               "",
    email:               "",

    // Participation (Step 1)
    activities:          [],
    competitionCategory: "",

    // Abstract (Step 2 - Default NO)
    submitAbstract:      initialMode === "abstract",
    abstractTitle:       "",
    submissionType:      "Original Research",
    presentationCategory:"Oral Presentation",
    abstractBody:        "",
    keywords:            "",
    presenterName:       "",
    coAuthors:           "",
    authorAffiliation:   "",
    supervisorName:      "",
    r2FileKey:           "",
    fileName:            "",
    fileSize:            0,

    // Additional Info (Step 3)
    priorExperience:     "",
    queries:             "",

    // Review & Declaration (Step 4)
    declaration:         false,
  });

  const [abstractFile, setAbstractFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState(false);

  // ── Manage Existing Registration State ─────────────────────────
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [manageData, setManageData] = useState(null); // { registration, abstract }
  const [manageSuccessMsg, setManageSuccessMsg] = useState("");
  const [manageSaving, setManageSaving] = useState(false);
  const [manageSubmittingAbs, setManageSubmittingAbs] = useState(false);
  const [manageAbsFile, setManageAbsFile] = useState(null);
  const [manageAbsProgress, setManageAbsProgress] = useState(0);

  // OTP Verification State
  const [otpStep, setOtpStep] = useState("credentials"); // 'credentials' | 'otp'
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend OTP countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Auto-fill presenter name from full name if blank
  useEffect(() => {
    if (!form.presenterName && form.fullName) {
      setForm((f) => ({ ...f, presenterName: f.fullName }));
    }
    if (!form.authorAffiliation && form.institution) {
      setForm((f) => ({ ...f, authorAffiliation: f.institution }));
    }
  }, [form.fullName, form.institution]);

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

  function handleAbstractFileSelect(file) {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "docx", "doc"].includes(ext)) {
      setError(`Unsupported file format (.${ext}). Please upload a PDF or Word document (.docx).`);
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 100 MB.`);
      return;
    }
    setError("");
    setAbstractFile(file);
    setForm((f) => ({ ...f, fileName: file.name, fileSize: file.size }));
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
    if (step === 2) {
      if (form.submitAbstract) {
        if (!form.abstractTitle.trim())         return "Abstract title is required.";
        if (!form.submissionType)               return "Please select a submission type.";
        if (!form.presentationCategory)         return "Please select a presentation preference.";
        if (form.abstractBody.trim().length < 50)
          return "Abstract text body must be at least 50 characters.";
        if (!abstractFile && !form.r2FileKey)   return "Please attach your abstract document (PDF or DOCX).";
      }
    }
    if (step === 4) {
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

  async function handleSubmitRegistration(e) {
    e?.preventDefault();
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }

    setLoading(true);
    setError("");

    try {
      let finalFileKey = form.r2FileKey;

      // If user selected abstract and has an unuploaded file
      if (form.submitAbstract && abstractFile && !finalFileKey) {
        setUploadingFile(true);
        try {
          const { uploadUrl, fileKey } = await getUploadUrl(abstractFile.name, abstractFile.type);
          await uploadFileToR2(uploadUrl, abstractFile, (pct) => setUploadProgress(pct));
          finalFileKey = fileKey;
        } catch (uploadErr) {
          throw new Error(uploadErr.message || "Failed to upload abstract file. Please retry.");
        } finally {
          setUploadingFile(false);
        }
      }

      const payload = {
        fullName:            form.fullName,
        institution:         form.institution,
        batch:               form.batch,
        academicYear:        form.academicYear,
        phone:               form.phone,
        email:               form.email,
        activities:          form.activities,
        competitionCategory: form.competitionCategory,
        priorExperience:     form.priorExperience,
        queries:             form.queries,
        hasAbstract:         form.submitAbstract,
        abstractTitle:       form.abstractTitle,
        submissionType:      form.submissionType,
        presentationCategory:form.presentationCategory,
        abstractBody:        form.abstractBody,
        keywords:            form.keywords,
        presenterName:       form.presenterName || form.fullName,
        coAuthors:           form.coAuthors,
        authorAffiliation:   form.authorAffiliation || form.institution,
        supervisorName:      form.supervisorName,
        r2FileKey:           finalFileKey || "local-placeholder",
        fileName:            abstractFile ? abstractFile.name : form.fileName,
        fileSize:            abstractFile ? abstractFile.size : form.fileSize,
      };

      const res = await submitRegistration(payload);
      setSuccessInfo({
        regNumber: res.regNumber,
        abstractNumber: res.abstractNumber || null,
        phone: form.phone,
        title: form.submitAbstract ? "Registration & Abstract Received!" : "Registration Confirmed!",
        subtitle: form.submitAbstract
          ? "Your place at IMF 2026 and your scientific abstract submission have both been recorded."
          : "Your place at the Internal Medicine Festival 2026 has been reserved.",
      });
    } catch (ex) {
      setError(ex.message || "Registration failed. Please check your information and try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Manage Portal: Step 1 Send OTP via Email ──────────────────
  async function handleSendOtp(e) {
    e?.preventDefault();
    const cleanEmail = lookupEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setLookupError("Please enter a valid registered email address.");
      return;
    }

    setLookupLoading(true);
    setLookupError("");
    setManageSuccessMsg("");

    try {
      const res = await lookupRegistration(cleanEmail);
      if (res.requiresOtp) {
        setMaskedEmail(res.maskedEmail || cleanEmail);
        setOtpStep("otp");
        setResendCooldown(60);
      } else if (res.verified) {
        setManageData(res);
      }
    } catch (ex) {
      setLookupError(ex.message || "Could not find a registration matching this email address.");
    } finally {
      setLookupLoading(false);
    }
  }

  // ── Manage Portal: Step 2 Verify OTP ───────────────────────────
  async function handleVerifyOtp(e) {
    e?.preventDefault();
    if (!otpCode.trim() || otpCode.trim().length < 6) {
      setLookupError("Please enter the 6-digit verification code sent to your email.");
      return;
    }

    setLookupLoading(true);
    setLookupError("");

    try {
      const res = await lookupRegistration(lookupEmail.trim().toLowerCase(), otpCode.trim());
      if (res.verified && res.registration) {
        setManageData(res);
        setOtpStep("credentials");
        setOtpCode("");
      } else {
        setLookupError("Verification failed. Please check your code and try again.");
      }
    } catch (ex) {
      setLookupError(ex.message || "Invalid or expired verification code.");
    } finally {
      setLookupLoading(false);
    }
  }

  // ── Manage Portal: Resend OTP ──────────────────────────────────
  async function handleResendOtp() {
    if (resendCooldown > 0 || lookupLoading) return;
    setLookupLoading(true);
    setLookupError("");
    try {
      const res = await lookupRegistration(lookupEmail.trim().toLowerCase());
      if (res.requiresOtp) {
        setResendCooldown(60);
      }
    } catch (ex) {
      setLookupError(ex.message || "Failed to resend verification code.");
    } finally {
      setLookupLoading(false);
    }
  }

  // ── Update Profile in Manage Mode ──────────────────────────────
  async function handleUpdateProfile(e) {
    e?.preventDefault();
    if (!manageData?.registration) return;

    setManageSaving(true);
    setLookupError("");
    setManageSuccessMsg("");

    try {
      await updateRegistrationData({
        regNumber: manageData.registration.regNumber,
        phone: manageData.registration.phone,
        registration: manageData.registration,
      });
      setManageSuccessMsg("Your delegate registration details have been successfully updated.");
    } catch (ex) {
      setLookupError(ex.message || "Failed to update profile details.");
    } finally {
      setManageSaving(false);
    }
  }

  // ── Submit or Update Abstract in Manage Mode ───────────────────
  async function handleSaveManageAbstract(e) {
    e?.preventDefault();
    if (!manageData?.registration) return;

    const abs = manageData.abstract || {};
    if (!abs.title || !abs.title.trim()) {
      setLookupError("Abstract title is required.");
      return;
    }
    if (!abs.abstractBody || abs.abstractBody.trim().length < 50) {
      setLookupError("Abstract body must be at least 50 characters.");
      return;
    }
    if (!manageAbsFile && !abs.r2FileKey) {
      setLookupError("Please attach your abstract document (PDF or DOCX).");
      return;
    }

    setManageSubmittingAbs(true);
    setLookupError("");
    setManageSuccessMsg("");

    try {
      let fileKey = abs.r2FileKey;
      let fileName = abs.fileName;
      let fileSize = abs.fileSize;

      if (manageAbsFile) {
        const { uploadUrl, fileKey: newKey } = await getUploadUrl(manageAbsFile.name, manageAbsFile.type);
        await uploadFileToR2(uploadUrl, manageAbsFile, (pct) => setManageAbsProgress(pct));
        fileKey = newKey;
        fileName = manageAbsFile.name;
        fileSize = manageAbsFile.size;
      }

      const res = await updateRegistrationData({
        regNumber: manageData.registration.regNumber,
        phone: manageData.registration.phone,
        abstract: {
          ...abs,
          r2FileKey: fileKey,
          fileName,
          fileSize,
        },
      });

      // Reload updated registration and abstract
      const refreshed = await lookupRegistration(manageData.registration.regNumber, manageData.registration.phone);
      setManageData(refreshed);
      setManageAbsFile(null);
      setManageSuccessMsg(
        res.abstractNumber
          ? `Abstract successfully submitted with ID: ${res.abstractNumber}! Don't forget to take a screenshot.`
          : "Abstract details successfully updated!"
      );
    } catch (ex) {
      setLookupError(ex.message || "Failed to submit or update abstract.");
    } finally {
      setManageSubmittingAbs(false);
    }
  }

  // ── Success Confirmation Screen ───────────────────────────────
  if (successInfo) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <Header
          onHome={() => navigate("/")}
          onOpenAdmin={() => navigate("/admin")}
        />
        <main className="flex-1 flex items-center justify-center pt-24 pb-16 px-4">
          <SuccessCard
            regNumber={successInfo.regNumber}
            abstractNumber={successInfo.abstractNumber}
            phone={successInfo.phone}
            title={successInfo.title}
            subtitle={successInfo.subtitle}
            onClose={() => navigate("/")}
            onManage={() => {
              setSuccessInfo(null);
              setActiveTab("manage");
              setLookupReg(successInfo.regNumber);
              setLookupPhone(successInfo.phone);
            }}
          />
        </main>
        <Footer
          onOpenAdmin={() => navigate("/admin")}
          onOpenRegister={() => { setSuccessInfo(null); setStep(0); setActiveTab("register"); }}
          onOpenAbstract={() => { setSuccessInfo(null); setActiveTab("register"); setForm((f) => ({ ...f, submitAbstract: true })); setStep(2); }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      <Header
        onHome={() => navigate("/")}
        onOpenAdmin={() => navigate("/admin")}
      />

      <main className="flex-1 pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full">

        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <button
              onClick={() => navigate("/")}
              className="hover:text-slate-900 transition-colors"
            >
              Home
            </button>
            <span>/</span>
            <span className="text-sky-600 font-bold">
              {activeTab === "register" ? "Festival Registration" : "Manage Registration & Abstract"}
            </span>
          </div>

          {/* Direct Switcher Link */}
          <button
            onClick={() => {
              setActiveTab(activeTab === "register" ? "manage" : "register");
              setError("");
              setLookupError("");
            }}
            className="text-xs font-bold text-sky-700 hover:text-sky-900 hover:underline flex items-center gap-1.5"
          >
            {activeTab === "register" ? (
              <>
                <Icons.User className="w-3.5 h-3.5 text-sky-600" />
                <span>Already Registered? Edit Info / Abstract →</span>
              </>
            ) : (
              <>
                <Icons.Plus className="w-3.5 h-3.5 text-sky-600" />
                <span>New Registration Form →</span>
              </>
            )}
          </button>
        </div>

        {/* ── Mode Tabs ── */}
        <div className="flex border-b border-slate-200 mb-6 bg-white rounded-2xl p-1.5 shadow-xs border">
          <button
            type="button"
            onClick={() => { setActiveTab("register"); setError(""); }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "register"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Icons.Check className="w-4 h-4" />
            <span>New Delegate Registration</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("manage"); setLookupError(""); }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "manage"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Icons.Edit className="w-4 h-4" />
            <span>Already Registered? Manage &amp; Submit Abstract</span>
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════
            TAB 1: NEW REGISTRATION
        ════════════════════════════════════════════════════════════ */}
        {activeTab === "register" && (
          <>
            {/* Banner Header */}
            <div className="card p-6 sm:p-8 mb-8 bg-gradient-to-r from-sky-900 to-slate-900 text-white border-0 shadow-elevated">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[11px] font-bold tracking-wider uppercase mb-2">
                    Free Registration &bull; Abstract Submission Included
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    Delegate Registration Portal
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                    Internal Medicine Festival 2026 &bull; 17 September 2026 &bull; Dhaka Medical College
                  </p>
                </div>
                <div className="flex sm:flex-col items-end gap-1">
                  <span className="text-xs text-slate-400">Deadline</span>
                  <span className="text-sm font-bold text-teal-300">14 Sep 2026</span>
                </div>
              </div>

              {/* Stepper Progress */}
              <div className="grid grid-cols-5 gap-1 sm:gap-2 mt-8 pt-6 border-t border-white/10">
                {REG_STEPS.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { if (idx < step) setStep(idx); }}
                    disabled={idx > step}
                    className="text-left group cursor-pointer disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5">
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
                        className={`text-[11px] sm:text-xs font-bold hidden md:inline transition-colors ${
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
                    <h2 className="text-lg font-bold text-slate-900">Personal &amp; Academic Information</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Please provide your details. These will also be attached to your abstract if you choose to submit one.</p>
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
                      <span className="text-[11px] text-slate-500 mt-1 block">
                        Used to verify and manage your registration later.
                      </span>
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
                    <h2 className="text-lg font-bold text-slate-900">Festival Participation &amp; Segments</h2>
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

              {/* ── STEP 2: Unified Scientific Abstract Submission ── */}
              {step === 2 && (
                <div className="space-y-6 animate-fade-in">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Scientific Abstract Submission</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Present your original research or clinical case at the festival.
                    </p>
                  </div>

                  {/* ── Abstract Toggle: Defaults to NO ── */}
                  <div className="p-5 rounded-2xl border-2 border-slate-200 bg-slate-50/60 space-y-4">
                    <label className="block text-sm font-bold text-slate-900">
                      Would you like to submit a Scientific Abstract for IMF 2026?
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* NO Option (Default) */}
                      <div
                        onClick={() => set("submitAbstract", false)}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                          !form.submitAbstract
                            ? "bg-white border-sky-600 shadow-sm ring-1 ring-sky-600"
                            : "bg-white/60 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="submitAbstractRadio"
                          checked={!form.submitAbstract}
                          onChange={() => set("submitAbstract", false)}
                          className="w-4 h-4 accent-sky-600 mt-0.5"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            No, register as festival delegate only
                            <span className="ml-2 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">
                              Default
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            You can always submit an abstract later by visiting "Manage Registration" with your Registration Number.
                          </div>
                        </div>
                      </div>

                      {/* YES Option */}
                      <div
                        onClick={() => set("submitAbstract", true)}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                          form.submitAbstract
                            ? "bg-teal-50/70 border-teal-600 shadow-sm ring-1 ring-teal-600"
                            : "bg-white/60 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="submitAbstractRadio"
                          checked={form.submitAbstract}
                          onChange={() => set("submitAbstract", true)}
                          className="w-4 h-4 accent-teal-600 mt-0.5"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            Yes, I want to submit a Scientific Abstract
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Open abstract fields. Your author &amp; contact info will be automatically attached.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── EXPANDED ABSTRACT FIELDS (Only when YES is selected) ── */}
                  {form.submitAbstract ? (
                    <div className="space-y-5 pt-3 border-t border-slate-200 animate-fade-in">

                      {/* Inherited Details Confirmation Banner (No re-entry required!) */}
                      <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-start gap-3">
                        <Icons.Check className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block text-teal-950 mb-0.5">
                            Author Contact &amp; Academic Info Attached from Registration
                          </span>
                          <span>
                            Lead Author: <strong>{form.fullName || "—"}</strong> &bull; Medical College: <strong>{form.institution || "—"}</strong> &bull; Batch: <strong>{form.batch || "—"} ({form.academicYear || "—"})</strong> &bull; Phone: <strong>{form.phone || "—"}</strong>
                          </span>
                          <span className="block text-teal-700 text-[11px] mt-1 font-medium">
                            ✓ No need to re-enter your name or contact details. They are linked automatically.
                          </span>
                        </div>
                      </div>

                      {/* Title */}
                      <div className="form-group">
                        <label className="form-label form-label-required" htmlFor="abstractTitle">
                          Abstract Title
                        </label>
                        <input
                          id="abstractTitle"
                          type="text"
                          className="form-input"
                          placeholder="e.g. Clinical Profile and Outcomes of Dengue-Associated Myocarditis: A Tertiary Care Study"
                          value={form.abstractTitle}
                          onChange={(e) => set("abstractTitle", e.target.value)}
                          required
                        />
                      </div>

                      {/* Type & Presentation Category */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="form-group">
                          <label className="form-label form-label-required" htmlFor="subType">
                            Submission Type
                          </label>
                          <select
                            id="subType"
                            className="form-select"
                            value={form.submissionType}
                            onChange={(e) => set("submissionType", e.target.value)}
                            required
                          >
                            {SUBMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label form-label-required" htmlFor="presCat">
                            Presentation Preference
                          </label>
                          <select
                            id="presCat"
                            className="form-select"
                            value={form.presentationCategory}
                            onChange={(e) => set("presentationCategory", e.target.value)}
                            required
                          >
                            {PRESENTATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Keywords */}
                      <div className="form-group">
                        <label className="form-label" htmlFor="keywords">
                          Keywords (Optional, 3 to 5 separated by commas)
                        </label>
                        <input
                          id="keywords"
                          type="text"
                          className="form-input"
                          placeholder="e.g. Internal Medicine, Cardiology, Biomarkers, Dengue"
                          value={form.keywords}
                          onChange={(e) => set("keywords", e.target.value)}
                        />
                      </div>

                      {/* Presenter Name (Defaults to user's name) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="form-group">
                          <label className="form-label form-label-required" htmlFor="presenterName">
                            Presenter's Name
                          </label>
                          <input
                            id="presenterName"
                            type="text"
                            className="form-input"
                            value={form.presenterName}
                            onChange={(e) => set("presenterName", e.target.value)}
                            placeholder="Defaults to your registered name"
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label" htmlFor="authorAffiliation">
                            Department / Affiliation
                          </label>
                          <input
                            id="authorAffiliation"
                            type="text"
                            className="form-input"
                            placeholder="e.g. Dept. of Medicine, DMC"
                            value={form.authorAffiliation}
                            onChange={(e) => set("authorAffiliation", e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Co-Authors & Supervisor */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="form-group">
                          <label className="form-label" htmlFor="coAuthors">
                            Co-Authors (Optional)
                          </label>
                          <input
                            id="coAuthors"
                            type="text"
                            className="form-input"
                            placeholder="e.g. Dr. Sadia Rahman, Dr. Kazi Fahim"
                            value={form.coAuthors}
                            onChange={(e) => set("coAuthors", e.target.value)}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label" htmlFor="supervisorName">
                            Supervising Professor / Consultant (Optional)
                          </label>
                          <input
                            id="supervisorName"
                            type="text"
                            className="form-input"
                            placeholder="e.g. Prof. Dr. M. A. Jalil"
                            value={form.supervisorName}
                            onChange={(e) => set("supervisorName", e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Abstract Body */}
                      <div className="form-group">
                        <div className="flex justify-between items-center mb-1">
                          <label className="form-label form-label-required" htmlFor="abstractBody">
                            Structured Abstract Text
                          </label>
                          <span className="text-[11px] text-slate-400">
                            {form.abstractBody.length} characters (min 50)
                          </span>
                        </div>
                        <textarea
                          id="abstractBody"
                          rows={6}
                          className="form-input font-mono text-xs leading-relaxed"
                          placeholder="Background: ...&#10;Methods: ...&#10;Results: ...&#10;Conclusion: ..."
                          value={form.abstractBody}
                          onChange={(e) => set("abstractBody", e.target.value)}
                          required
                        />
                      </div>

                      {/* File Upload for Abstract */}
                      <div className="form-group">
                        <label className="form-label form-label-required">
                          Abstract Document Upload (PDF or Word .docx, max 100 MB)
                        </label>

                        <div className="mt-1 border-2 border-dashed border-slate-300 hover:border-teal-400 rounded-2xl p-6 text-center bg-slate-50/50 transition-colors">
                          <Icons.Upload className="w-8 h-8 text-teal-600 mx-auto mb-2" />
                          <p className="text-xs font-semibold text-slate-700">
                            {abstractFile ? (
                              <span className="text-teal-700 font-bold">
                                Selected: {abstractFile.name} ({(abstractFile.size / 1024 / 1024).toFixed(2)} MB)
                              </span>
                            ) : (
                              "Click to browse or drag & drop your manuscript file"
                            )}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Accepted: PDF (.pdf) or Word document (.docx, .doc)
                          </p>

                          <input
                            type="file"
                            id="abstractFileInput"
                            accept=".pdf,.docx,.doc"
                            className="hidden"
                            onChange={(e) => handleAbstractFileSelect(e.target.files?.[0])}
                          />

                          <button
                            type="button"
                            onClick={() => document.getElementById("abstractFileInput")?.click()}
                            className="mt-3 btn-outline text-xs py-1.5 px-4"
                          >
                            {abstractFile ? "Change Document" : "Browse Document"}
                          </button>
                        </div>

                        {uploadingFile && (
                          <div className="mt-3">
                            <div className="flex justify-between text-xs text-slate-600 mb-1">
                              <span>Uploading manuscript…</span>
                              <span className="font-bold text-teal-700">{uploadProgress}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                              <div
                                className="h-full bg-teal-600 transition-all duration-200"
                                style={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-200 text-xs text-sky-800">
                      <span>
                        ℹ️ You are registering as an attendee. You will have full access to attend seminars, CME sessions, and spectator events. You can submit an abstract at any time before the deadline using the <strong>Manage Registration</strong> tab.
                      </span>
                    </div>
                  )}

                </div>
              )}

              {/* ── STEP 3: Additional Info ── */}
              {step === 3 && (
                <div className="space-y-6 animate-fade-in">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Background &amp; Inquiries (Optional)</h2>
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

              {/* ── STEP 4: Review & Declaration ── */}
              {step === 4 && (
                <div className="space-y-6 animate-fade-in">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Review &amp; Declaration</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Please review your registration summary before confirming.</p>
                  </div>

                  {/* Summary Card */}
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2.5 text-slate-700">
                    <div className="flex justify-between border-b border-slate-200 pb-2">
                      <span className="text-slate-500">Full Name:</span>
                      <strong className="text-slate-900">{form.fullName}</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-2">
                      <span className="text-slate-500">Institution:</span>
                      <strong className="text-slate-900">{form.institution}</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-2">
                      <span className="text-slate-500">Batch &amp; Year:</span>
                      <strong className="text-slate-900">{form.batch} &bull; {form.academicYear}</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-2">
                      <span className="text-slate-500">Contact:</span>
                      <strong className="text-slate-900">{form.phone} ({form.email})</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-2">
                      <span className="text-slate-500">Activities:</span>
                      <strong className="text-sky-700 text-right max-w-xs">{form.activities.join(", ") || "None"}</strong>
                    </div>

                    {/* Abstract Summary if submitted */}
                    <div className="pt-1 flex justify-between">
                      <span className="text-slate-500">Scientific Abstract:</span>
                      {form.submitAbstract ? (
                        <div className="text-right">
                          <span className="font-bold text-teal-700 block">Yes, Abstract Included</span>
                          <span className="text-[11px] text-slate-600 block italic max-w-xs truncate">
                            "{form.abstractTitle}"
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {form.submissionType} &bull; {form.presentationCategory}
                          </span>
                        </div>
                      ) : (
                        <span className="font-semibold text-slate-500">No (Delegate Registration Only)</span>
                      )}
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
                        I confirm that the details provided are accurate and that I am a bonafide medical student eligible for the Internal Medicine Festival 2026. I agree to abide by the guidelines set by DMC IMIG, ACP Bangladesh Chapter, and BSM.
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
                    onClick={() => navigate("/")}
                    className="btn-outline text-xs py-2.5 px-5"
                  >
                    Cancel
                  </button>
                )}

                {step < REG_STEPS.length - 1 ? (
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
                    onClick={handleSubmitRegistration}
                    disabled={loading || !form.declaration || uploadingFile}
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
                        {form.submitAbstract ? "Submit Registration & Abstract" : "Submit Registration"}
                      </>
                    )}
                  </button>
                )}
              </div>

            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB 2: MANAGE REGISTRATION / SUBMIT ABSTRACT
        ════════════════════════════════════════════════════════════ */}
        {activeTab === "manage" && (
          <div className="space-y-6">

            {/* If NOT authenticated yet: Show Lookup / OTP Form */}
            {!manageData ? (
              <div className="card p-6 sm:p-8 bg-white border border-slate-200 shadow-card">
                {otpStep === "credentials" ? (
                  <>
                    <div className="max-w-md mx-auto text-center mb-6">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center">
                        <Icons.Email className="w-6 h-6" />
                      </div>
                      <h2 className="text-xl font-bold text-slate-900">Manage Your Registration</h2>
                      
                      <div className="mt-2.5 mb-3 px-3.5 py-2 rounded-xl bg-sky-50 border border-sky-100 text-sky-800 text-xs text-center leading-relaxed flex items-center justify-center gap-2">
                        <Icons.Edit className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                        <span>
                          <strong>Already registered?</strong> You can edit your registration details or submit &amp; update your scientific abstract here.
                        </span>
                      </div>

                      <p className="text-xs text-slate-500">
                        Enter your registered email address. We will send a 6-digit verification code to your inbox to access and edit your details.
                      </p>
                    </div>

                    {lookupError && (
                      <div className="max-w-md mx-auto mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                        <Icons.Alert className="w-4 h-4 flex-shrink-0" />
                        <span>{lookupError}</span>
                      </div>
                    )}

                    <form onSubmit={handleSendOtp} className="max-w-md mx-auto space-y-4">
                      <div className="form-group text-left">
                        <label className="form-label form-label-required" htmlFor="lookupEmail">
                          Registered Email Address
                        </label>
                        <div className="relative">
                          <input
                            id="lookupEmail"
                            type="email"
                            autoComplete="email"
                            className="form-input pl-10 text-sm"
                            placeholder="e.g. doctor@example.com"
                            value={lookupEmail}
                            onChange={(e) => setLookupEmail(e.target.value)}
                            required
                          />
                          <Icons.Email className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1 block">
                          The email address you used when registering for IMF 2026.
                        </span>
                      </div>

                      <button
                        type="submit"
                        disabled={lookupLoading || !lookupEmail.trim()}
                        className="btn-primary w-full py-3 text-xs font-bold flex items-center justify-center gap-2 shadow-sm"
                      >
                        {lookupLoading ? (
                          <>
                            <Icons.Spinner className="w-4 h-4 animate-spin" />
                            Sending Verification Code…
                          </>
                        ) : (
                          <>
                            <Icons.Email className="w-4 h-4" />
                            Send Verification Code
                          </>
                        )}
                      </button>
                    </form>
                  </>
                ) : (
                  /* OTP Step */
                  <div className="animate-fade-in">
                    <div className="max-w-md mx-auto text-center mb-6">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center ring-8 ring-amber-50">
                        <Icons.Email className="w-6 h-6" />
                      </div>
                      <h2 className="text-xl font-bold text-slate-900">Check Your Email</h2>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        We sent a 6-digit verification code to{" "}
                        <strong className="text-slate-800 font-semibold">{maskedEmail}</strong>.
                        Please enter it below to access your portal.
                      </p>
                    </div>

                    {lookupError && (
                      <div className="max-w-md mx-auto mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                        <Icons.Alert className="w-4 h-4 flex-shrink-0" />
                        <span>{lookupError}</span>
                      </div>
                    )}

                    <form onSubmit={handleVerifyOtp} className="max-w-md mx-auto space-y-5">
                      <div className="form-group text-center">
                        <label className="form-label block text-center mb-2" htmlFor="otpCode">
                          Enter 6-Digit Code
                        </label>
                        <input
                          id="otpCode"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          autoFocus
                          className="form-input text-center font-mono text-2xl font-extrabold tracking-[0.4em] py-3 text-sky-900 bg-slate-50 focus:bg-white"
                          placeholder="------"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          required
                        />
                        <span className="text-[11px] text-slate-400 mt-1 block">
                          Code is valid for 10 minutes.
                        </span>
                      </div>

                      <button
                        type="submit"
                        disabled={lookupLoading || otpCode.trim().length < 6}
                        className="btn-primary w-full py-3 text-xs font-bold flex items-center justify-center gap-2 shadow-sm"
                      >
                        {lookupLoading ? (
                          <>
                            <Icons.Spinner className="w-4 h-4 animate-spin" />
                            Verifying Code…
                          </>
                        ) : (
                          <>
                            <Icons.Check className="w-4 h-4" />
                            Verify &amp; Unlock Registration
                          </>
                        )}
                      </button>

                      <div className="flex items-center justify-between pt-2 text-xs">
                        <button
                          type="button"
                          onClick={() => { setOtpStep("credentials"); setLookupError(""); setOtpCode(""); }}
                          className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1"
                        >
                          <Icons.Back className="w-3.5 h-3.5" />
                          Change email address
                        </button>

                        <button
                          type="button"
                          disabled={resendCooldown > 0 || lookupLoading}
                          onClick={handleResendOtp}
                          className={`font-semibold ${
                            resendCooldown > 0
                              ? "text-slate-400 cursor-not-allowed"
                              : "text-sky-600 hover:text-sky-800 hover:underline"
                          }`}
                        >
                          {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
                  <span>Haven't registered yet? </span>
                  <button
                    onClick={() => { setActiveTab("register"); }}
                    className="text-sky-600 font-bold hover:underline"
                  >
                    Complete registration now
                  </button>
                </div>
              </div>
            ) : (
              /* Authenticated Dashboard: Edit Details & Abstract */
              <div className="space-y-6 animate-fade-in">

                {/* Verified Header Badge */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-900 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-md">
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider mb-1">
                      ✓ Verified Delegate
                    </span>
                    <h2 className="text-lg font-bold text-white">
                      {manageData.registration.fullName}
                    </h2>
                    <p className="text-xs text-slate-300">
                      Reg ID: <strong className="font-mono text-teal-300">{manageData.registration.regNumber}</strong> &bull; Email: {manageData.registration.email}
                    </p>
                  </div>

                  <button
                    onClick={() => { setManageData(null); setLookupEmail(""); setOtpStep("credentials"); setOtpCode(""); }}
                    className="btn-outline text-xs py-1.5 px-3.5 text-white border-white/20 hover:bg-white/10 self-start sm:self-center"
                  >
                    Exit / Logout
                  </button>
                </div>

                {/* Alert Messages */}
                {manageSuccessMsg && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs flex items-center gap-2 shadow-xs">
                    <Icons.Check className="w-5 h-5 flex-shrink-0 text-emerald-600" />
                    <span className="font-bold">{manageSuccessMsg}</span>
                  </div>
                )}
                {lookupError && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-2">
                    <Icons.Alert className="w-5 h-5 flex-shrink-0 text-rose-600" />
                    <span>{lookupError}</span>
                  </div>
                )}

                {/* Section 1: Edit Profile */}
                <div className="card p-6 bg-white border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Icons.User className="w-4 h-4 text-sky-600" />
                      <span>Edit Delegate Profile &amp; Contact</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="form-group sm:col-span-2">
                      <label className="form-label" htmlFor="mFullName">Full Name</label>
                      <input
                        id="mFullName"
                        type="text"
                        className="form-input"
                        value={manageData.registration.fullName || ""}
                        onChange={(e) =>
                          setManageData({
                            ...manageData,
                            registration: { ...manageData.registration, fullName: e.target.value },
                          })
                        }
                      />
                    </div>

                    <div className="form-group sm:col-span-2">
                      <label className="form-label" htmlFor="mInst">Medical College</label>
                      <input
                        id="mInst"
                        type="text"
                        className="form-input"
                        value={manageData.registration.institution || ""}
                        onChange={(e) =>
                          setManageData({
                            ...manageData,
                            registration: { ...manageData.registration, institution: e.target.value },
                          })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="mBatch">Batch</label>
                      <select
                        id="mBatch"
                        className="form-select"
                        value={manageData.registration.batch || ""}
                        onChange={(e) =>
                          setManageData({
                            ...manageData,
                            registration: { ...manageData.registration, batch: e.target.value },
                          })
                        }
                      >
                        {BATCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="mYear">Academic Year</label>
                      <select
                        id="mYear"
                        className="form-select"
                        value={manageData.registration.academicYear || ""}
                        onChange={(e) =>
                          setManageData({
                            ...manageData,
                            registration: { ...manageData.registration, academicYear: e.target.value },
                          })
                        }
                      >
                        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="mPhone">Contact Phone</label>
                      <input
                        id="mPhone"
                        type="tel"
                        className="form-input"
                        value={manageData.registration.phone || ""}
                        onChange={(e) =>
                          setManageData({
                            ...manageData,
                            registration: { ...manageData.registration, phone: e.target.value },
                          })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="mEmail">Email Address</label>
                      <input
                        id="mEmail"
                        type="email"
                        className="form-input"
                        value={manageData.registration.email || ""}
                        onChange={(e) =>
                          setManageData({
                            ...manageData,
                            registration: { ...manageData.registration, email: e.target.value },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100 flex justify-end">
                    <button
                      type="button"
                      onClick={handleUpdateProfile}
                      disabled={manageSaving}
                      className="btn-primary text-xs py-2 px-5 font-bold"
                    >
                      {manageSaving ? "Saving…" : "Save Profile Details"}
                    </button>
                  </div>
                </div>

                {/* Section 2: Manage or Submit Abstract */}
                <div className="card p-6 bg-white border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Icons.File className="w-4 h-4 text-teal-600" />
                      <span>
                        {manageData.abstract ? "Scientific Abstract Details" : "Submit a Scientific Abstract"}
                      </span>
                    </h3>

                    {manageData.abstract && (
                      <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-mono font-bold text-xs">
                        {manageData.abstract.abstractNumber}
                      </span>
                    )}
                  </div>

                  {/* If user hasn't submitted an abstract yet: show toggle/form to submit one now */}
                  {!manageData.abstract ? (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                        <p className="font-semibold text-slate-800 mb-1">
                          You registered as a festival delegate without an abstract.
                        </p>
                        <p>
                          Would you like to submit your scientific research or clinical case now? Your lead author and contact info are already saved.
                        </p>
                      </div>

                      <div className="space-y-4 pt-2">
                        <div className="form-group">
                          <label className="form-label form-label-required" htmlFor="newAbsTitle">
                            Abstract Title
                          </label>
                          <input
                            id="newAbsTitle"
                            type="text"
                            className="form-input"
                            placeholder="e.g. Clinical Profile and Outcomes..."
                            value={manageData.abstract?.title || ""}
                            onChange={(e) =>
                              setManageData({
                                ...manageData,
                                abstract: { ...(manageData.abstract || {}), title: e.target.value },
                              })
                            }
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="form-group">
                            <label className="form-label" htmlFor="newAbsType">Submission Type</label>
                            <select
                              id="newAbsType"
                              className="form-select"
                              value={manageData.abstract?.submissionType || "Original Research"}
                              onChange={(e) =>
                                setManageData({
                                  ...manageData,
                                  abstract: { ...(manageData.abstract || {}), submissionType: e.target.value },
                                })
                              }
                            >
                              {SUBMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>

                          <div className="form-group">
                            <label className="form-label" htmlFor="newAbsCat">Presentation Preference</label>
                            <select
                              id="newAbsCat"
                              className="form-select"
                              value={manageData.abstract?.presentationCategory || "Oral Presentation"}
                              onChange={(e) =>
                                setManageData({
                                  ...manageData,
                                  abstract: { ...(manageData.abstract || {}), presentationCategory: e.target.value },
                                })
                              }
                            >
                              {PRESENTATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="form-group">
                          <label className="form-label form-label-required" htmlFor="newAbsBody">
                            Structured Abstract Text (min 50 characters)
                          </label>
                          <textarea
                            id="newAbsBody"
                            rows={5}
                            className="form-input font-mono text-xs"
                            placeholder="Background, Methods, Results, Conclusion..."
                            value={manageData.abstract?.abstractBody || ""}
                            onChange={(e) =>
                              setManageData({
                                ...manageData,
                                abstract: { ...(manageData.abstract || {}), abstractBody: e.target.value },
                              })
                            }
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label form-label-required">
                            Attach Manuscript (PDF or DOCX, max 100 MB)
                          </label>
                          <input
                            type="file"
                            accept=".pdf,.docx,.doc"
                            className="form-input text-xs"
                            onChange={(e) => setManageAbsFile(e.target.files?.[0] || null)}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleSaveManageAbstract}
                          disabled={manageSubmittingAbs}
                          className="btn-primary py-2.5 px-6 text-xs font-bold shadow-sm"
                        >
                          {manageSubmittingAbs ? "Submitting Abstract…" : "Submit Scientific Abstract Now"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Existing Abstract Edit Form */
                    <div className="space-y-4">
                      <div className="form-group">
                        <label className="form-label" htmlFor="editAbsTitle">Abstract Title</label>
                        <input
                          id="editAbsTitle"
                          type="text"
                          className="form-input"
                          value={manageData.abstract.title || ""}
                          onChange={(e) =>
                            setManageData({
                              ...manageData,
                              abstract: { ...manageData.abstract, title: e.target.value },
                            })
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="form-group">
                          <label className="form-label" htmlFor="editAbsType">Submission Type</label>
                          <select
                            id="editAbsType"
                            className="form-select"
                            value={manageData.abstract.submissionType || "Original Research"}
                            onChange={(e) =>
                              setManageData({
                                ...manageData,
                                abstract: { ...manageData.abstract, submissionType: e.target.value },
                              })
                            }
                          >
                            {SUBMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label" htmlFor="editAbsCat">Presentation Preference</label>
                          <select
                            id="editAbsCat"
                            className="form-select"
                            value={manageData.abstract.presentationCategory || "Oral Presentation"}
                            onChange={(e) =>
                              setManageData({
                                ...manageData,
                                abstract: { ...manageData.abstract, presentationCategory: e.target.value },
                              })
                            }
                          >
                            {PRESENTATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="editAbsBody">Structured Abstract Text</label>
                        <textarea
                          id="editAbsBody"
                          rows={6}
                          className="form-input font-mono text-xs"
                          value={manageData.abstract.abstractBody || ""}
                          onChange={(e) =>
                            setManageData({
                              ...manageData,
                              abstract: { ...manageData.abstract, abstractBody: e.target.value },
                            })
                          }
                        />
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                        <div className="text-slate-500 mb-1">Current Attached Manuscript:</div>
                        <strong className="text-slate-800 font-mono block">
                          {manageData.abstract.fileName || "Uploaded File"}
                        </strong>
                        <div className="mt-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Upload Replacement Manuscript (Optional):
                          </label>
                          <input
                            type="file"
                            accept=".pdf,.docx,.doc"
                            className="form-input text-xs"
                            onChange={(e) => setManageAbsFile(e.target.files?.[0] || null)}
                          />
                        </div>
                      </div>

                      <div className="pt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={handleSaveManageAbstract}
                          disabled={manageSubmittingAbs}
                          className="btn-primary text-xs py-2 px-5 font-bold"
                        >
                          {manageSubmittingAbs ? "Updating Abstract…" : "Update Abstract Details"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>
        )}

      </main>

      <Footer
        onOpenAdmin={() => navigate("/admin")}
        onOpenRegister={() => { setActiveTab("register"); setStep(0); }}
        onOpenAbstract={() => { setActiveTab("register"); setForm((f) => ({ ...f, submitAbstract: true })); setStep(2); }}
      />
    </div>
  );
}
