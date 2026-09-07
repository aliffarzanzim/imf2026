// src/pages/SubmitAbstract.jsx
import React, { useState } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Icons } from "../assets/icons";
import { getUploadUrl, uploadFileToR2, submitAbstract } from "../utils/api";
import { SuccessCard } from "../components/SuccessCard";
import { navigate } from "../utils/navigation";


const BATCHES = ["K-79", "K-80", "K-81", "K-82", "K-83", "Other"];
const YEARS   = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Final Year"];

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

const STEPS = [
  { title: "Author Info", desc: "Presenter Details" },
  { title: "Manuscript Info", desc: "Title & Abstract" },
  { title: "File Upload", desc: "PDF or DOCX" },
  { title: "Confirmation", desc: "Review & Submit" },
];

export function SubmitAbstract() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [absNumber, setAbsNumber] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");

  const [form, setForm] = useState({
    fullName:             "",
    institution:          "",
    batch:                "",
    academicYear:         "",
    phone:                "",
    email:                "",
    title:                "",
    submissionType:       "",
    presentationCategory: "",
    abstractBody:         "",
    keywords:             "",
    presenterName:        "",
    coAuthors:            "",
    authorAffiliation:    "",
    supervisorName:       "",
    declaration:          false,
  });

  const [abstractFile, setAbstractFile] = useState(null);
  const [presentationFile, setPresentationFile] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  function handleAbstractFileChange(file) {
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
  }

  function handlePresentationFileChange(file) {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "ppt", "pptx"].includes(ext)) {
      setError(`Unsupported format (.${ext}). Presentations must be PowerPoint (.pptx) or PDF.`);
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 100 MB.`);
      return;
    }
    setError("");
    setPresentationFile(file);
  }

  function validateStep() {
    if (step === 0) {
      if (!form.fullName.trim())    return "Lead author's name is required.";
      if (!form.institution.trim()) return "Institution / Medical college is required.";
      if (!form.batch)              return "Please select your batch.";
      if (!form.academicYear)       return "Please select your academic year.";
      if (!form.phone.trim())       return "Contact number is required.";
      if (!form.email.trim() || !form.email.includes("@"))
        return "A valid email is required.";
    }
    if (step === 1) {
      if (!form.title.trim())                return "Abstract title is required.";
      if (!form.submissionType)              return "Please select a submission type.";
      if (!form.presentationCategory)        return "Please select a presentation preference.";
      if (form.abstractBody.trim().length < 50)
        return "Abstract text body must be at least 50 characters.";
      if (!form.presenterName.trim())        return "Presenter's name is required.";
    }
    if (step === 2) {
      if (!abstractFile) return "Please attach your abstract document (PDF or DOCX).";
      if (abstractFile.size > 100 * 1024 * 1024) return "File size must not exceed 100 MB.";
    }
    if (step === 3) {
      if (!form.declaration) return "You must accept the submission ethics declaration.";
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
      setUploadStage("Generating upload link…");
      const { uploadUrl, fileKey } = await getUploadUrl(abstractFile.name, abstractFile.type);

      setUploadStage("Uploading manuscript to secure storage…");
      await uploadFileToR2(uploadUrl, abstractFile, setProgress);

      let presFileKey = null;
      let presFileName = null;
      if (presentationFile) {
        setUploadStage("Uploading slide presentation…");
        setProgress(0);
        const { uploadUrl: pUrl, fileKey: pfKey } = await getUploadUrl(
          presentationFile.name,
          presentationFile.type
        );
        await uploadFileToR2(pUrl, presentationFile, setProgress);
        presFileKey = pfKey;
        presFileName = presentationFile.name;
      }

      setProgress(100);
      setUploadStage("Upload complete! Finalizing submission…");
      await new Promise((r) => setTimeout(r, 650));

      const res = await submitAbstract({

        ...form,
        r2FileKey:            fileKey,
        fileName:             abstractFile.name,
        fileSize:             abstractFile.size,
        presentationFileKey:  presFileKey,
        presentationFileName: presFileName,
      });

      setAbsNumber(res.abstractNumber);
    } catch (ex) {
      setError(ex.message || "Failed to submit abstract. Please try again.");
    } finally {
      setLoading(false);
      setUploadStage("");
      setProgress(0);
    }
  }

  if (absNumber) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <Header
          onHome={() => navigate("/")}
          onOpenAdmin={() => navigate("/admin")}
        />
        <main className="flex-1 flex items-center justify-center pt-24 pb-16 px-4">
          <SuccessCard
            regNumber={absNumber}
            title="Abstract Submitted Successfully!"
            subtitle="Your manuscript has been safely submitted to the IMF 2026 Scientific Committee."
            onClose={() => navigate("/")}
          />
        </main>
        <Footer
          onOpenAdmin={() => navigate("/admin")}
          onOpenRegister={() => navigate("/register")}
          onOpenAbstract={() => { setAbsNumber(null); setStep(0); }}
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
        <div className="mb-6 flex items-center gap-2 text-xs font-semibold text-slate-500">
          <button
            onClick={() => navigate("/")}
            className="hover:text-slate-900 transition-colors"
          >
            Home
          </button>
          <span>/</span>
          <span className="text-teal-600 font-bold">Scientific Abstract Submission</span>
        </div>

        {/* Header Banner */}
        <div className="card p-6 sm:p-8 mb-8 bg-gradient-to-r from-teal-900 to-slate-900 text-white border-0 shadow-elevated">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-teal-400/20 text-teal-300 text-[11px] font-bold tracking-wider uppercase mb-2">
                Call for Abstracts
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Scientific Abstract Portal
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                Present your clinical research, case series, or audits at the Internal Medicine Festival 2026.
              </p>
            </div>
            <div className="flex sm:flex-col items-end gap-1">
              <span className="text-xs text-slate-400">Submission Cutoff</span>
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

        {/* Error Alert with Retry button */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Icons.Alert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-900">Submission Notice</p>
                <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">{error}</p>
              </div>
            </div>
            {step === STEPS.length - 1 && !loading && (
              <button
                type="button"
                onClick={handleSubmit}
                className="text-xs font-bold text-rose-800 bg-rose-100 hover:bg-rose-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Upload Status Card (During Upload) */}
        {loading && (
          <div className="mb-6 p-5 rounded-2xl bg-white border border-sky-200 shadow-md">
            <div className="flex items-center justify-between text-xs font-bold mb-2.5">
              <div className="flex items-center gap-2">
                {progress === 100 ? (
                  <div className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                    <Icons.Check className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <Icons.Spinner className="w-4 h-4 animate-spin text-sky-600 flex-shrink-0" />
                )}
                <span className="text-slate-800 font-semibold">{uploadStage}</span>
              </div>

              {progress === 100 ? (
                <span className="inline-flex items-center gap-1.5 text-sky-700 bg-sky-50 border border-sky-200 font-bold px-3 py-1 rounded-full text-xs shadow-xs">
                  <div className="w-3.5 h-3.5 rounded-full bg-sky-600 text-white flex items-center justify-center">
                    <Icons.Check className="w-2.5 h-2.5" />
                  </div>
                  <span>100% Complete</span>
                </span>
              ) : (
                <span className="text-sky-700 font-mono font-bold bg-sky-50 px-2.5 py-1 rounded-md border border-sky-100">
                  {progress}%
                </span>
              )}
            </div>

            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 rounded-full ${
                  progress === 100 ? "bg-sky-600" : "bg-gradient-to-r from-teal-500 to-sky-600"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}


        {/* Form Body Card */}
        <div className="card p-6 sm:p-8 bg-white border border-slate-200 shadow-card">

          {/* ── STEP 0: Lead Author Info ── */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Lead Author & Presenter Details</h2>
                <p className="text-xs text-slate-500 mt-0.5">Contact details for all official correspondence regarding your abstract.</p>
              </div>


              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="form-group sm:col-span-2">
                  <label className="form-label form-label-required" htmlFor="fullName">Lead Author's Full Name</label>
                  <input
                    id="fullName"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Dr. Sadia Afrin"
                    value={form.fullName}
                    onChange={(e) => set("fullName", e.target.value)}
                    required
                  />
                </div>

                <div className="form-group sm:col-span-2">
                  <label className="form-label form-label-required" htmlFor="institution">Medical College / Affiliated Hospital</label>
                  <input
                    id="institution"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Dhaka Medical College Hospital"
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
                    <option value="">Select batch</option>
                    {BATCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label form-label-required" htmlFor="academicYear">Current Year</label>
                  <select
                    id="academicYear"
                    className="form-select"
                    value={form.academicYear}
                    onChange={(e) => set("academicYear", e.target.value)}
                    required
                  >
                    <option value="">Select academic year</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label form-label-required" htmlFor="phone">Contact Number</label>
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
                    placeholder="e.g. author@example.com"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 1: Manuscript Metadata ── */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Abstract Information & Structured Body</h2>
                <p className="text-xs text-slate-500 mt-0.5">Please ensure all scientific content adheres to standard medical formatting.</p>
              </div>

              <div className="space-y-5">
                <div className="form-group">
                  <label className="form-label form-label-required" htmlFor="title">Abstract Title</label>
                  <input
                    id="title"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Atypical Presentation of Adult-Onset Still's Disease..."
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="form-group">
                    <label className="form-label form-label-required" htmlFor="submissionType">Submission Type</label>
                    <select
                      id="submissionType"
                      className="form-select"
                      value={form.submissionType}
                      onChange={(e) => set("submissionType", e.target.value)}
                      required
                    >
                      <option value="">Select submission type</option>
                      {SUBMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label form-label-required" htmlFor="presCat">Presentation Preference</label>
                    <select
                      id="presCat"
                      className="form-select"
                      value={form.presentationCategory}
                      onChange={(e) => set("presentationCategory", e.target.value)}
                      required
                    >
                      <option value="">Select presentation category</option>
                      {PRESENTATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <div className="flex justify-between items-center">
                    <label className="form-label form-label-required" htmlFor="abstractBody">Abstract Body</label>
                    <span className="text-[11px] text-slate-400">
                      {form.abstractBody.length} characters (min 50)
                    </span>
                  </div>
                  <textarea
                    id="abstractBody"
                    rows={6}
                    className="form-input"
                    placeholder="Structured format recommended: Background, Methods / Case Description, Results, Conclusion..."
                    value={form.abstractBody}
                    onChange={(e) => set("abstractBody", e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="keywords">Keywords</label>
                  <input
                    id="keywords"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Internal Medicine, Vasculitis, Diagnostic Dilemma (comma separated)"
                    value={form.keywords}
                    onChange={(e) => set("keywords", e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-3 border-t border-slate-100">
                  <div className="form-group">
                    <label className="form-label form-label-required" htmlFor="presenterName">Designated Presenter</label>
                    <input
                      id="presenterName"
                      type="text"
                      className="form-input"
                      placeholder="Name of delegate who will present"
                      value={form.presenterName}
                      onChange={(e) => set("presenterName", e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="supervisor">Supervisor / Faculty Guide</label>
                    <input
                      id="supervisor"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Prof. Dr. M. Rahman"
                      value={form.supervisorName}
                      onChange={(e) => set("supervisorName", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: File Upload ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Upload Manuscript & Documents</h2>
                <p className="text-xs text-slate-500 mt-0.5">Accepted formats: PDF or DOCX (maximum size 100 MB).</p>
              </div>

              {/* Main Abstract File */}
              <div className="form-group">
                <label className="form-label form-label-required">Abstract File (.pdf, .docx)</label>
                <div className="upload-zone relative">
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc"
                    id="abstract-file"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleAbstractFileChange(e.target.files[0]);
                    }}
                  />
                  <label htmlFor="abstract-file" className="cursor-pointer flex flex-col items-center gap-2 w-full">
                    <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                      <Icons.Upload className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold text-slate-800">
                      {abstractFile ? abstractFile.name : "Click to select or drag manuscript file"}
                    </span>
                    {abstractFile ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-xs font-bold shadow-xs">
                          <div className="w-3.5 h-3.5 rounded-full bg-sky-600 text-white flex items-center justify-center">
                            <Icons.Check className="w-2.5 h-2.5" />
                          </div>
                          <span>100% Ready ({(abstractFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">
                        PDF or Microsoft Word (.docx) up to 100 MB
                      </span>
                    )}
                  </label>
                  {abstractFile && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAbstractFile(null);
                      }}
                      className="mt-2 text-xs font-semibold text-rose-600 hover:text-rose-800 underline"
                    >
                      Remove file
                    </button>
                  )}
                </div>
              </div>

              {/* Optional Presentation File */}
              <div className="form-group pt-4 border-t border-slate-100">
                <label className="form-label">Presentation Deck or Slides (Optional)</label>
                <div className="upload-zone py-4 relative">
                  <input
                    type="file"
                    accept=".pdf,.ppt,.pptx"
                    id="pres-file"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handlePresentationFileChange(e.target.files[0]);
                    }}
                  />
                  <label htmlFor="pres-file" className="cursor-pointer flex flex-col items-center gap-1.5 w-full">
                    <Icons.File className="w-6 h-6 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-700">
                      {presentationFile ? presentationFile.name : "Attach Presentation Slides (.pptx / .pdf)"}
                    </span>
                    {presentationFile && (
                      <span className="inline-flex items-center gap-1 text-sky-700 text-xs font-semibold bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
                        <Icons.Check className="w-3 h-3 text-sky-600" />
                        Attached ({(presentationFile.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    )}
                  </label>
                  {presentationFile && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPresentationFile(null);
                      }}
                      className="mt-1 text-xs font-semibold text-rose-600 hover:text-rose-800 underline"
                    >
                      Remove presentation
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Review & Ethics Confirmation ── */}
          {step === 3 && (
            <div className="space-y-6">

              <div>
                <h2 className="text-lg font-bold text-slate-900">Submission Review & Ethics Declaration</h2>
                <p className="text-xs text-slate-500 mt-0.5">Confirm the authenticity and presentation consent for this submission.</p>
              </div>

              {/* Summary Card */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 text-slate-700">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Title:</span>
                  <strong className="text-slate-900 max-w-sm text-right">{form.title}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Type & Format:</span>
                  <strong className="text-slate-900">{form.submissionType} • {form.presentationCategory}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Presenter:</span>
                  <strong className="text-slate-900">{form.presenterName} ({form.institution})</strong>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500">Uploaded File:</span>
                  <strong className="text-teal-700">{abstractFile?.name}</strong>
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
                    I declare that this abstract represents original academic work or approved case data. All co-authors have reviewed and approved this submission, and patient confidentiality has been fully preserved.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Action Bar */}
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

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="btn-accent text-xs py-2.5 px-6 font-semibold"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !form.declaration}
                className="btn-accent text-xs py-2.5 px-7 font-bold shadow-md flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Icons.Spinner className="w-4 h-4 animate-spin" />
                    Uploading & Submitting…
                  </>
                ) : (
                  <>
                    <Icons.Check className="w-4 h-4" />
                    Submit Abstract
                  </>
                )}
              </button>
            )}
          </div>

        </div>
      </main>

      <Footer
        onOpenAdmin={() => navigate("/admin")}
        onOpenRegister={() => navigate("/register")}
        onOpenAbstract={() => { setStep(0); }}
      />

    </div>
  );
}
