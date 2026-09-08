// src/components/AbstractModal.js
import React, { useState, useRef } from "react";
import { Icons } from "../assets/icons";
import { getUploadUrl, uploadFileToR2, submitAbstract } from "../utils/api";
import { SuccessCard } from "./SuccessCard";

const BATCHES = ["K-78", "K-79", "K-80", "K-81", "K-82", "K-83", "Other"];
const YEARS   = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Final Year"];

const SUBMISSION_TYPES = [
  "Original Article",
  "Case Report",
  "Case Series",
  "Systematic Review",
  "Meta-analysis",
  "Review Article",
  "Other",
];

const PRESENTATION_CATEGORIES = [
  "Academic Topic Presentation",
  "Academic Poster Presentation",
];

const SECTIONS = [
  "Participant Info",
  "Abstract Details",
  "File Submission",
  "Declaration",
];

function SectionDivider({ title }) {
  return (
    <div className="section-divider my-2">
      <span className="section-title">{title}</span>
    </div>
  );
}

function FileDropZone({ label, hint, accept, file, onFile, id }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  return (
    <div
      className={`upload-zone ${dragging ? "upload-zone-active" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input id={id} ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
      <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center">
        <Icons.FileUp className="w-5 h-5 text-[var(--color-primary)]" />
      </div>
      {file ? (
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--color-text-main)]">{file.name}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--color-text-body)]">{label}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{hint}</p>
        </div>
      )}
    </div>
  );
}

export function AbstractModal({ onClose }) {
  const [step, setStep]         = useState(0);
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [error, setError]       = useState("");
  const [absNumber, setAbsNumber] = useState(null);

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

  const [abstractFile, setAbstractFile]         = useState(null);
  const [presentationFile, setPresentationFile] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  function validateStep() {
    if (step === 0) {
      if (!form.fullName.trim())    return "Full name is required.";
      if (!form.institution.trim()) return "Institution is required.";
      if (!form.batch)              return "Please select your batch.";
      if (!form.academicYear)       return "Please select your academic year.";
      if (!form.phone.trim())       return "Contact number is required.";
      if (!form.email.includes("@")) return "A valid email is required.";
    }
    if (step === 1) {
      if (!form.title.trim())                return "Abstract title is required.";
      if (!form.submissionType)              return "Please select a submission type.";
      if (!form.presentationCategory)        return "Please select a presentation category.";
      if (form.abstractBody.trim().length < 50) return "Abstract body must be at least 50 characters.";
      if (!form.presenterName.trim())        return "Presenter name is required.";
    }
    if (step === 2) {
      if (!abstractFile) return "Please upload the abstract file (PDF or DOCX).";
      if (abstractFile.size > 100 * 1024 * 1024) return "File size must not exceed 100 MB.";
    }
    if (step === 3) {
      if (!form.declaration) return "You must confirm the declaration to submit.";
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
      // Step 1: Get presigned URL for abstract file
      setUploadStage("Getting upload URL…");
      const { uploadUrl, fileKey } = await getUploadUrl(abstractFile.name, abstractFile.type);

      // Step 2: Direct upload to R2
      setUploadStage("Uploading abstract file to secure storage…");
      await uploadFileToR2(uploadUrl, abstractFile, setProgress);

      // Step 3: Upload presentation file if provided
      let presFileKey = null;
      let presFileName = null;
      if (presentationFile) {
        setUploadStage("Uploading presentation file…");
        setProgress(0);
        const { uploadUrl: presUrl, fileKey: pfKey } = await getUploadUrl(
          presentationFile.name, presentationFile.type
        );
        await uploadFileToR2(presUrl, presentationFile, setProgress);
        presFileKey  = pfKey;
        presFileName = presentationFile.name;
      }

      // Step 4: Submit metadata to D1
      setUploadStage("Saving submission…");
      setProgress(100);
      const res = await submitAbstract({
        ...form,
        r2FileKey:            fileKey,
        fileName:             abstractFile.name,
        fileSize:             abstractFile.size,
        presentationFileKey:  presFileKey,
        presentationFileName: presFileName,
      });

      setAbsNumber(res.abstractNumber);
    } catch (e) {
      setError(e.message || "Submission failed. Please try again.");
    } finally {
      setLoading(false);
      setUploadStage("");
      setProgress(0);
    }
  }

  if (absNumber) {
    return (
      <SuccessCard
        regNumber={absNumber}
        title="Abstract Submitted!"
        subtitle="Your abstract has been received and will be reviewed by the scientific committee."
        onClose={onClose}
      />
    );
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-panel-lg">

        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)] mb-0.5">
              National Internal Medicine Festival 2026
            </p>
            <h2 className="text-xl font-bold text-[var(--color-text-main)]">Abstract Submission</h2>
          </div>
          <button id="close-abstract-btn" onClick={onClose} className="btn-icon" aria-label="Close">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress */}
        <div className="px-8 pt-5">
          <div className="flex items-center gap-2">
            {SECTIONS.map((s, i) => (
              <React.Fragment key={i}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    i < step   ? "bg-[var(--color-success)] text-white" :
                    i === step ? "bg-[var(--color-primary)] text-white" :
                                  "bg-slate-100 text-[var(--color-text-muted)]"
                  }`}>
                    {i < step ? <Icons.Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${i === step ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}`}>{s}</span>
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

          {/* ── Section 1: Participant Info ── */}
          {step === 0 && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <SectionDivider title="Section 1 — Participant Information" />

              <div className="form-group">
                <label className="form-label form-label-required">Full Name</label>
                <div className="relative">
                  <Icons.User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
                  <input id="abs-full-name" className="form-input pl-10" placeholder="Enter your full name"
                    value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label form-label-required">Medical College / Institution</label>
                <div className="relative">
                  <Icons.Institution className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
                  <input id="abs-institution" className="form-input pl-10" placeholder="e.g. Dhaka Medical College"
                    value={form.institution} onChange={(e) => set("institution", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label form-label-required">Batch</label>
                  <select id="abs-batch" className="form-select" value={form.batch} onChange={(e) => set("batch", e.target.value)}>
                    <option value="">Select batch</option>
                    {BATCHES.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label form-label-required">Academic Year</label>
                  <select id="abs-year" className="form-select" value={form.academicYear} onChange={(e) => set("academicYear", e.target.value)}>
                    <option value="">Select year</option>
                    {YEARS.map((y) => <option key={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label form-label-required">Contact Number</label>
                  <div className="relative">
                    <Icons.Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
                    <input id="abs-phone" className="form-input pl-10" placeholder="+880 ..." type="tel"
                      value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label form-label-required">Email Address</label>
                  <div className="relative">
                    <Icons.Email className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
                    <input id="abs-email" className="form-input pl-10" placeholder="you@example.com" type="email"
                      value={form.email} onChange={(e) => set("email", e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Section 2: Abstract Details ── */}
          {step === 1 && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <SectionDivider title="Section 2 — Abstract Information" />

              <div className="form-group">
                <label className="form-label form-label-required">Title of the Abstract</label>
                <input id="abs-title" className="form-input" placeholder="Enter the full title of your abstract"
                  value={form.title} onChange={(e) => set("title", e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label form-label-required">Type of Submission</label>
                  <select id="abs-type" className="form-select" value={form.submissionType} onChange={(e) => set("submissionType", e.target.value)}>
                    <option value="">Select type</option>
                    {SUBMISSION_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label form-label-required">Presentation Category</label>
                  <select id="abs-pres-cat" className="form-select" value={form.presentationCategory} onChange={(e) => set("presentationCategory", e.target.value)}>
                    <option value="">Select category</option>
                    {PRESENTATION_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label form-label-required">Abstract</label>
                <textarea id="abs-body" className="form-textarea" rows={6}
                  placeholder="Paste or type your full abstract text here…"
                  value={form.abstractBody} onChange={(e) => set("abstractBody", e.target.value)} />
                <span className="form-hint">{form.abstractBody.length} characters</span>
              </div>

              <div className="form-group">
                <label className="form-label">Keywords</label>
                <input id="abs-keywords" className="form-input" placeholder="e.g. hypertension, clinical trial, randomized"
                  value={form.keywords} onChange={(e) => set("keywords", e.target.value)} />
                <span className="form-hint">Please provide 3–5 keywords, comma-separated.</span>
              </div>

              <div className="form-group">
                <label className="form-label form-label-required">Name of Presenter</label>
                <div className="relative">
                  <Icons.Presenter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
                  <input id="abs-presenter" className="form-input pl-10" placeholder="Full name of the presenter"
                    value={form.presenterName} onChange={(e) => set("presenterName", e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Names of Co-authors</label>
                <textarea id="abs-coauthors" className="form-textarea" rows={2}
                  placeholder="If applicable — list co-author names, one per line."
                  value={form.coAuthors} onChange={(e) => set("coAuthors", e.target.value)} />
                <span className="form-hint">Optional</span>
              </div>

              <div className="form-group">
                <label className="form-label">Affiliation of Authors</label>
                <textarea id="abs-affiliation" className="form-textarea" rows={2}
                  placeholder="Institution / department affiliation of all authors"
                  value={form.authorAffiliation} onChange={(e) => set("authorAffiliation", e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Name of Faculty Supervisor / Mentor</label>
                <div className="relative">
                  <Icons.Supervisor className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
                  <input id="abs-supervisor" className="form-input pl-10" placeholder="If applicable"
                    value={form.supervisorName} onChange={(e) => set("supervisorName", e.target.value)} />
                </div>
                <span className="form-hint">Optional</span>
              </div>
            </div>
          )}

          {/* ── Section 3: File Submission ── */}
          {step === 2 && (
            <div className="flex flex-col gap-5 animate-fade-in">
              <SectionDivider title="Section 3 — File Submission" />

              <div className="form-group">
                <label className="form-label form-label-required">Upload Abstract File</label>
                <FileDropZone
                  id="abs-file-upload"
                  label="Click or drag & drop your abstract file"
                  hint="PDF or DOCX · Maximum 100 MB"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  file={abstractFile}
                  onFile={setAbstractFile}
                />
                {abstractFile && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-[var(--color-success)]">
                    <Icons.Check className="w-3.5 h-3.5" />
                    File selected: {abstractFile.name}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Upload Presentation / Poster</label>
                <FileDropZone
                  id="abs-pres-upload"
                  label="Click or drag & drop your presentation file"
                  hint="PPT, PPTX, PDF, or image · Optional"
                  accept=".ppt,.pptx,.pdf,.png,.jpg,.jpeg"
                  file={presentationFile}
                  onFile={setPresentationFile}
                />
                <span className="form-hint">Optional — only if required for your submission category.</span>
              </div>

              <div className="alert-info rounded-lg text-xs">
                <Icons.Info className="w-4 h-4 flex-shrink-0" />
                <span>
                  Files are uploaded directly to <strong>secure cloud storage</strong> (Cloudflare R2).
                  Large files up to <strong>100 MB</strong> are fully supported with a real-time progress bar.
                </span>
              </div>
            </div>
          )}

          {/* ── Section 4: Declaration ── */}
          {step === 3 && (
            <div className="flex flex-col gap-5 animate-fade-in">
              <SectionDivider title="Section 4 — Declaration" />

              {/* Summary */}
              <div className="card-sm p-4 bg-slate-50">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Submission Summary</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    ["Presenter",  form.presenterName],
                    ["Institution",form.institution],
                    ["Type",       form.submissionType],
                    ["Category",   form.presentationCategory],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <span className="text-[var(--color-text-muted)] text-xs">{k}</span>
                      <p className="font-medium text-[var(--color-text-main)] truncate">{v || "—"}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                  <span className="text-[var(--color-text-muted)] text-xs">Title</span>
                  <p className="font-medium text-[var(--color-text-main)] text-sm mt-0.5 line-clamp-2">{form.title}</p>
                </div>
                <div className="mt-2">
                  <span className="text-[var(--color-text-muted)] text-xs">Abstract File</span>
                  <p className="font-medium text-[var(--color-accent)] text-sm">{abstractFile?.name || "—"}</p>
                </div>
              </div>

              <label className={`check-item items-start ${form.declaration ? "bg-[var(--color-success-bg)] border-[var(--color-success)]" : ""}`}>
                <input id="abs-declaration" type="checkbox" checked={form.declaration}
                  onChange={(e) => set("declaration", e.target.checked)} />
                <span className="check-item-label text-sm leading-relaxed">
                  I confirm that the information provided above is accurate and that the submitted
                  work is my/our original academic work. I agree to the evaluation and presentation
                  of the submitted abstract as part of the{" "}
                  <strong>National Internal Medicine Festival 2026</strong>.
                </span>
              </label>

              {/* Upload Progress */}
              {loading && (
                <div className="card-sm p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icons.Spinner className="w-4 h-4 animate-spin text-[var(--color-accent)]" />
                    <span className="text-sm font-medium text-[var(--color-text-body)]">{uploadStage}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1.5 text-right">{progress}%</p>
                </div>
              )}
            </div>
          )}

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
            <button id="abs-next-btn" className="btn-primary" onClick={handleNext}>
              Next <Icons.ChevronDown className="w-4 h-4 -rotate-90" />
            </button>
          ) : (
            <button id="abs-submit-btn" className="btn-accent" onClick={handleSubmit} disabled={loading}>
              {loading
                ? <><Icons.Spinner className="w-4 h-4 animate-spin" /> Uploading & Submitting…</>
                : <><Icons.Upload className="w-4 h-4" /> Submit Abstract</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
