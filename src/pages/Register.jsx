// src/pages/Register.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Icons } from "../assets/icons";
import {
  submitRegistration,
  lookupRegistration,
  updateRegistrationData,
  getUploadUrl,
  uploadFileToR2,
  getSystemConfig,
  getInitialSystemConfig,
} from "../utils/api";
import { SuccessCard } from "../components/SuccessCard";
import { MedicalCollegeInput } from "../components/MedicalCollegeInput";
import { navigate } from "../utils/navigation";

const BATCHES = ["K-78", "K-79", "K-80", "K-81", "K-82", "K-83", "Other"];
const YEARS   = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Final Year"];

const ACTIVITIES = [
  { id: "cme", label: "Scientific Seminar / CME", desc: "Expert lectures and internal medicine updates" },
  { id: "mental", label: "Mental Health Session", desc: "Mindfulness and physician burnout workshop" },
  { id: "career", label: "Career Counselling Session", desc: "Post-graduate training roadmaps & international exams" },
  { id: "quiz", label: "Quiz Competition", desc: "Fast-paced medical diagnosis and trivia" },
  { id: "cr", label: "Clinical Reasoning Challenge", desc: "Interactive mystery diagnostic dilemmas" },
  { id: "case", label: "Clinical Case Challenge", desc: "In-depth presentation of rare patient cases" },
  { id: "presentation", label: "Academic Topic Presentation", desc: "Oral presentation on internal medicine topics" },
  { id: "poster", label: "Academic Poster Presentation", desc: "Scientific research poster exhibition" },
  { id: "awareness", label: "Public Awareness Poster Competition", desc: "Preventive cardiology and health education posters" },
];

const COMPETITION_CATEGORIES = [
  "Quiz",
  "Clinical Reasoning Challenge",
  "Clinical Case Challenge",
  "Academic Topic Presentation",
  "Academic Poster Presentation",
  "Public Awareness Poster Presentation",
  "Not participating in a competition (Attendee only)",
];

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

function createEmptyAbstract(defaultPresenter = "") {
  return {
    id: "abs_" + Math.random().toString(36).substring(2, 9),
    title: "",
    submissionType: "",
    presentationCategory: "",
    abstractBody: "",
    keywords: "",
    presenterName: defaultPresenter || "",
    coAuthors: "",
    authorAffiliation: "",
    supervisorName: "",
    fileName: "",
    fileSize: 0,
    r2FileKey: "",
    uploadProgress: 0,
    isUploading: false,
    uploadError: "",
    // Scientific Poster / Presentation Slides
    presentationFileName: "",
    presentationFileSize: 0,
    presentationFileKey: "",
    presentationUploadProgress: 0,
    isPresentationUploading: false,
    presentationUploadError: "",
  };
}

const REG_STEPS = [
  { title: "Personal Details", desc: "Identity & College" },
  { title: "Participation", desc: "Sessions & Events" },
  { title: "Abstract Submission", desc: "Optional Abstract" },
  { title: "Additional Info", desc: "Experience & Queries" },
  { title: "Declaration", desc: "Review & Submit" },
];

const MANAGE_SESSION_KEY = "imf_delegate_session";

function getStoredDelegateSession() {
  try {
    const raw = sessionStorage.getItem(MANAGE_SESSION_KEY) || localStorage.getItem(MANAGE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.registration) {
      if (parsed.savedAt && Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
        clearStoredDelegateSession();
        return null;
      }
      return parsed;
    }
  } catch (_) {}
  return null;
}

function saveStoredDelegateSession(data) {
  try {
    const payload = {
      ...data,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(MANAGE_SESSION_KEY, JSON.stringify(payload));
    localStorage.setItem(MANAGE_SESSION_KEY, JSON.stringify(payload));
    if (data && data.sessionToken) {
      sessionStorage.setItem("imf_delegate_session_token", data.sessionToken);
      localStorage.setItem("imf_delegate_session_token", data.sessionToken);
    }
  } catch (_) {}
}

function clearStoredDelegateSession() {
  try {
    sessionStorage.removeItem(MANAGE_SESSION_KEY);
    localStorage.removeItem(MANAGE_SESSION_KEY);
    sessionStorage.removeItem("imf_delegate_session_token");
    localStorage.removeItem("imf_delegate_session_token");
  } catch (_) {}
}

export function Register({ initialMode = "register" }) {
  // Check URL query param e.g. /register?mode=manage
  const initialTab =
    initialMode === "manage" ||
    (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "manage")
      ? "manage"
      : "register";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [config, setConfig] = useState(getInitialSystemConfig);

  useEffect(() => {
    async function loadConfig() {
      try {
        const c = await getSystemConfig();
        setConfig(c);
        if (c && c.registration_abstract_only && c.registration_open !== false) {
          setForm((f) => ({ ...f, submitAbstract: true }));
        }
      } catch (_) {}
    }
    loadConfig();
  }, []);

  const isRegistrationClosed = config.registration_open === false;
  const isEditLocked = config.abstract_edit_open === false;
  const isAbstractOnly = config.registration_abstract_only === true && !isRegistrationClosed;

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
    competitionCategory: [],

    // Abstract (Step 2 - Default NO unless abstract-only mode is active)
    submitAbstract:      initialMode === "abstract" || isAbstractOnly,

    // Additional Info (Step 3)
    priorExperience:     "",
    queries:             "",

    // Review & Declaration (Step 4)
    declaration:         false,
  });

  // Multiple Abstracts State
  const [abstracts, setAbstracts] = useState([createEmptyAbstract()]);

  // ── Manage Existing Registration State ─────────────────────────
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [manageData, setManageData] = useState(() => getStoredDelegateSession()); // { registration, abstracts, abstract }
  const [manageSuccessMsg, setManageSuccessMsg] = useState("");
  const [manageSaving, setManageSaving] = useState(false);
  const [showSaveSuccessModal, setShowSaveSuccessModal] = useState(false);

  // Manage portal editable states (Unified single-page view)
  const [manageReg, setManageReg] = useState({
    fullName: "",
    institution: "",
    batch: "",
    academicYear: "",
    phone: "",
    email: "",
    activities: [],
    competitionCategory: [],
    priorExperience: "",
    queries: "",
  });
  const [manageAbstracts, setManageAbstracts] = useState([]);
  const [manageDeletedAbsIds, setManageDeletedAbsIds] = useState([]);

  // Sync manageData when session is loaded or refreshed
  useEffect(() => {
    if (manageData?.registration) {
      const reg = manageData.registration;
      setManageReg({
        fullName: reg.fullName || "",
        institution: reg.institution || "",
        batch: reg.batch || "",
        academicYear: reg.academicYear || "",
        phone: reg.phone || "",
        email: reg.email || "",
        activities: Array.isArray(reg.activities) ? reg.activities : [],
        competitionCategory: Array.isArray(reg.competitionCategory)
          ? reg.competitionCategory
          : (reg.competitionCategory ? String(reg.competitionCategory).split(", ").filter(Boolean) : []),
        priorExperience: reg.priorExperience || "",
        queries: reg.queries || "",
      });

      const rawAbsList = Array.isArray(manageData.abstracts) && manageData.abstracts.length > 0
        ? manageData.abstracts
        : (manageData.abstract && manageData.abstract.title ? [manageData.abstract] : []);

      setManageAbstracts(
        rawAbsList.map((abs) => ({
          id: abs.id || "abs_" + Math.random().toString(36).substring(2, 9),
          abstractNumber: abs.abstractNumber || null,
          title: abs.title || "",
          submissionType: abs.submissionType || "",
          presentationCategory: abs.presentationCategory || "",
          abstractBody: abs.abstractBody || "",
          keywords: abs.keywords || "",
          presenterName: abs.presenterName || reg.fullName || "",
          coAuthors: abs.coAuthors || "",
          authorAffiliation: abs.authorAffiliation || "",
          supervisorName: abs.supervisorName || "",
          fileName: abs.fileName || "",
          fileSize: abs.fileSize || 0,
          r2FileKey: abs.r2FileKey || "",
          uploadProgress: 0,
          isUploading: false,
          uploadError: "",
          // Scientific Poster / Presentation Slides
          presentationFileName: abs.presentationFileName || "",
          presentationFileSize: abs.presentationFileSize || 0,
          presentationFileKey: abs.presentationFileKey || "",
          presentationUploadProgress: 0,
          isPresentationUploading: false,
          presentationUploadError: "",
        }))
      );
    }
  }, [manageData]);

  // Snapshot of original data to check if any modifications were made
  const initialManageSnapshot = useMemo(() => {
    if (!manageData?.registration) return null;
    const reg = manageData.registration;
    const rawAbsList = Array.isArray(manageData.abstracts) && manageData.abstracts.length > 0
      ? manageData.abstracts
      : (manageData.abstract && manageData.abstract.title ? [manageData.abstract] : []);

    return JSON.stringify({
      reg: {
        fullName: (reg.fullName || "").trim(),
        institution: (reg.institution || "").trim(),
        batch: reg.batch || "",
        academicYear: reg.academicYear || "",
        phone: (reg.phone || "").trim(),
        activities: (Array.isArray(reg.activities) ? [...reg.activities] : []).sort(),
        competitionCategory: (
          Array.isArray(reg.competitionCategory)
            ? [...reg.competitionCategory]
            : (reg.competitionCategory ? String(reg.competitionCategory).split(", ").filter(Boolean) : [])
        ).sort(),
        priorExperience: reg.priorExperience || "",
        queries: (reg.queries || "").trim(),
      },
      abstracts: rawAbsList.map((abs) => ({
        id: abs.id || null,
        title: (abs.title || "").trim(),
        submissionType: (abs.submissionType || "").trim(),
        presentationCategory: (abs.presentationCategory || "").trim(),
        abstractBody: (abs.abstractBody || "").trim(),
        keywords: (abs.keywords || "").trim(),
        presenterName: (abs.presenterName || reg.fullName || "").trim(),
        coAuthors: (abs.coAuthors || "").trim(),
        authorAffiliation: (abs.authorAffiliation || "").trim(),
        supervisorName: (abs.supervisorName || "").trim(),
        fileName: abs.fileName || "",
        r2FileKey: abs.r2FileKey || "",
        presentationFileName: abs.presentationFileName || "",
        presentationFileKey: abs.presentationFileKey || "",
      })),
    });
  }, [manageData]);

  // True only when user has actually modified any field or abstract
  const isManageDirty = useMemo(() => {
    if (!initialManageSnapshot) return false;
    if (manageDeletedAbsIds.length > 0) return true;

    const currentSnapshot = JSON.stringify({
      reg: {
        fullName: (manageReg.fullName || "").trim(),
        institution: (manageReg.institution || "").trim(),
        batch: manageReg.batch || "",
        academicYear: manageReg.academicYear || "",
        phone: (manageReg.phone || "").trim(),
        activities: [...(manageReg.activities || [])].sort(),
        competitionCategory: [...(manageReg.competitionCategory || [])].sort(),
        priorExperience: manageReg.priorExperience || "",
        queries: (manageReg.queries || "").trim(),
      },
      abstracts: manageAbstracts.map((abs) => ({
        id: typeof abs.id === "number" ? abs.id : null,
        title: (abs.title || "").trim(),
        submissionType: (abs.submissionType || "").trim(),
        presentationCategory: (abs.presentationCategory || "").trim(),
        abstractBody: (abs.abstractBody || "").trim(),
        keywords: (abs.keywords || "").trim(),
        presenterName: (abs.presenterName || manageReg.fullName || "").trim(),
        coAuthors: (abs.coAuthors || "").trim(),
        authorAffiliation: (abs.authorAffiliation || "").trim(),
        supervisorName: (abs.supervisorName || "").trim(),
        fileName: abs.fileName || "",
        r2FileKey: abs.r2FileKey || "",
        presentationFileName: abs.presentationFileName || "",
        presentationFileKey: abs.presentationFileKey || "",
      })),
    });

    return currentSnapshot !== initialManageSnapshot;
  }, [initialManageSnapshot, manageReg, manageAbstracts, manageDeletedAbsIds]);

  // OTP Verification State
  const [otpStep, setOtpStep] = useState("credentials"); // 'credentials' | 'otp'
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Body scroll lock when popup is open
  useEffect(() => {
    if (showSaveSuccessModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showSaveSuccessModal]);

  // Resend OTP countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Auto-fill presenter name from full name for first abstract if blank
  useEffect(() => {
    if (form.fullName) {
      setAbstracts((prev) =>
        prev.map((abs, idx) => {
          if (idx === 0 && !abs.presenterName) {
            return { ...abs, presenterName: form.fullName };
          }
          return abs;
        })
      );
    }
  }, [form.fullName]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  function updateAbstract(index, field, value) {
    setAbstracts((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
    setError("");
  }

  function handleAddAbstract() {
    setAbstracts((prev) => [
      ...prev,
      createEmptyAbstract(form.fullName || ""),
    ]);
  }

  function handleRemoveAbstract(index) {
    if (abstracts.length <= 1) return;
    setAbstracts((prev) => prev.filter((_, i) => i !== index));
  }

  // Instant upload directly upon file selection
  async function handleAbstractFileInstantUpload(index, file) {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "docx", "doc"].includes(ext)) {
      updateAbstract(index, "uploadError", `Unsupported file format (.${ext}). Please upload a PDF or Word document (.docx).`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      updateAbstract(index, "uploadError", `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 10 MB.`);
      return;
    }

    setAbstracts((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              fileName: file.name,
              fileSize: file.size,
              r2FileKey: "",
              isUploading: true,
              uploadProgress: 5,
              uploadError: "",
            }
          : item
      )
    );

    try {
      const { uploadUrl, fileKey } = await getUploadUrl(file.name, file.type);
      await uploadFileToR2(uploadUrl, file, (pct) => {
        setAbstracts((prev) =>
          prev.map((item, i) =>
            i === index ? { ...item, uploadProgress: Math.max(5, pct) } : item
          )
        );
      });

      setAbstracts((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                r2FileKey: fileKey,
                isUploading: false,
                uploadProgress: 100,
                uploadError: "",
              }
            : item
        )
      );
    } catch (err) {
      setAbstracts((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                r2FileKey: "",
                isUploading: false,
                uploadProgress: 0,
                uploadError: err.message || "Upload failed. Please try again.",
              }
            : item
        )
      );
    }
  }

  function handleRemoveAbstractFile(index) {
    setAbstracts((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              fileName: "",
              fileSize: 0,
              r2FileKey: "",
              isUploading: false,
              uploadProgress: 0,
              uploadError: "",
            }
          : item
      )
    );
    const el = document.getElementById(`abstractFileInput-${index}`);
    if (el) el.value = "";
  }

  // Instant upload directly upon poster / presentation file selection
  async function handlePosterFileInstantUpload(index, file) {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "pptx", "ppt"].includes(ext)) {
      updateAbstract(index, "presentationUploadError", `Unsupported format (.${ext}). Poster / presentation must be PDF (.pdf) or PowerPoint (.pptx).`);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      updateAbstract(index, "presentationUploadError", `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 50 MB.`);
      return;
    }

    setAbstracts((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              presentationFileName: file.name,
              presentationFileSize: file.size,
              presentationFileKey: "",
              isPresentationUploading: true,
              presentationUploadProgress: 5,
              presentationUploadError: "",
            }
          : item
      )
    );

    try {
      const { uploadUrl, fileKey } = await getUploadUrl(file.name, file.type);
      await uploadFileToR2(uploadUrl, file, (pct) => {
        setAbstracts((prev) =>
          prev.map((item, i) =>
            i === index ? { ...item, presentationUploadProgress: Math.max(5, pct) } : item
          )
        );
      });

      setAbstracts((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                presentationFileKey: fileKey,
                isPresentationUploading: false,
                presentationUploadProgress: 100,
                presentationUploadError: "",
              }
            : item
        )
      );
    } catch (err) {
      setAbstracts((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                presentationFileKey: "",
                isPresentationUploading: false,
                presentationUploadProgress: 0,
                presentationUploadError: err.message || "Upload failed. Please try again.",
              }
            : item
        )
      );
    }
  }

  function handleRemovePosterFile(index) {
    setAbstracts((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              presentationFileName: "",
              presentationFileSize: 0,
              presentationFileKey: "",
              isPresentationUploading: false,
              presentationUploadProgress: 0,
              presentationUploadError: "",
            }
          : item
      )
    );
    const el = document.getElementById(`posterFileInput-${index}`);
    if (el) el.value = "";
  }

  function toggleActivity(label) {
    setForm((f) => ({
      ...f,
      activities: f.activities.includes(label)
        ? f.activities.filter((a) => a !== label)
        : [...f.activities, label],
    }));
  }

  const allActivitiesSelected =
    ACTIVITIES.length > 0 && ACTIVITIES.every((act) => form.activities.includes(act.label));

  function toggleAllActivities() {
    setForm((f) => ({
      ...f,
      activities: allActivitiesSelected ? [] : ACTIVITIES.map((act) => act.label),
    }));
  }

  function toggleCompetitionCategory(cat) {
    const NOT_PARTICIPATING = "Not participating in a competition (Attendee only)";
    setForm((f) => {
      const current = Array.isArray(f.competitionCategory) ? f.competitionCategory : [];
      const exists = current.includes(cat);
      if (exists) {
        return {
          ...f,
          competitionCategory: current.filter((c) => c !== cat),
        };
      }
      if (cat === NOT_PARTICIPATING) {
        return {
          ...f,
          competitionCategory: [NOT_PARTICIPATING],
        };
      }
      return {
        ...f,
        competitionCategory: [...current.filter((c) => c !== NOT_PARTICIPATING), cat],
      };
    });
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
      if (form.competitionCategory.length === 0) return "Please select at least one competition preference.";
    }
    if (step === 2) {
      if (isAbstractOnly && !form.submitAbstract) {
        return "Registration is currently open for abstract submission only. You must submit a scientific abstract to proceed.";
      }
      if (form.submitAbstract || isAbstractOnly) {
        if (abstracts.length === 0) {
          return "Please add at least one scientific abstract to proceed.";
        }
        for (let i = 0; i < abstracts.length; i++) {
          const abs = abstracts[i];
          const num = abstracts.length > 1 ? ` for Abstract #${i + 1}` : "";
          if (!abs.title || !abs.title.trim())
            return `Title of the Abstract is required${num}.`;
          if (!abs.submissionType)
            return `Please select a type of submission${num}.`;
          if (!abs.presentationCategory)
            return `Please select a presentation category${num}.`;
          if (!abs.abstractBody || !abs.abstractBody.trim())
            return `Abstract text is required${num}.`;
          if (!abs.presenterName?.trim() && !form.fullName?.trim())
            return `Name of Presenter is required${num}.`;
          if (abs.isUploading)
            return `Please wait for the abstract file upload to finish${num}.`;
          if (abs.isPresentationUploading)
            return `Please wait for the poster / presentation upload to finish${num}.`;
          if (!abs.r2FileKey || !abs.fileName)
            return `Please upload your abstract file (PDF or DOCX)${num}.`;
        }
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
      const isSubmittingAbstract = form.submitAbstract || isAbstractOnly;
      const processedAbstracts = isSubmittingAbstract
        ? abstracts.map((abs) => ({
            title: abs.title.trim(),
            submissionType: abs.submissionType,
            presentationCategory: abs.presentationCategory,
            abstractBody: abs.abstractBody.trim(),
            keywords: abs.keywords ? abs.keywords.trim() : "",
            presenterName: (abs.presenterName || form.fullName).trim(),
            coAuthors: abs.coAuthors ? abs.coAuthors.trim() : "",
            authorAffiliation: abs.authorAffiliation ? abs.authorAffiliation.trim() : "",
            supervisorName: abs.supervisorName ? abs.supervisorName.trim() : "",
            r2FileKey: abs.r2FileKey,
            fileName: abs.fileName,
            fileSize: abs.fileSize,
            presentationFileKey: abs.presentationFileKey || null,
            presentationFileName: abs.presentationFileName || null,
            presentationFileSize: abs.presentationFileSize || 0,
          }))
        : [];

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
        hasAbstract:         isSubmittingAbstract && processedAbstracts.length > 0,
        abstracts:           processedAbstracts,
        // Single-abstract backwards compatibility
        ...(processedAbstracts.length > 0 ? {
          abstractTitle:        processedAbstracts[0].title,
          submissionType:       processedAbstracts[0].submissionType,
          presentationCategory: processedAbstracts[0].presentationCategory,
          abstractBody:         processedAbstracts[0].abstractBody,
          keywords:             processedAbstracts[0].keywords,
          presenterName:        processedAbstracts[0].presenterName,
          coAuthors:            processedAbstracts[0].coAuthors,
          authorAffiliation:    processedAbstracts[0].authorAffiliation,
          supervisorName:       processedAbstracts[0].supervisorName,
          r2FileKey:            processedAbstracts[0].r2FileKey,
          fileName:             processedAbstracts[0].fileName,
          fileSize:             processedAbstracts[0].fileSize,
        } : {}),
      };

      const res = await submitRegistration(payload);
      const absCount = processedAbstracts.length;
      const absNumbersList = res.abstractNumbers || (res.abstractNumber ? [res.abstractNumber] : []);
      setSuccessInfo({
        regNumber: res.regNumber,
        abstractNumber: res.abstractNumber || (absNumbersList.length > 0 ? absNumbersList.join(", ") : null),
        abstractNumbers: absNumbersList,
        phone: form.phone,
        email: form.email,
        fullName: form.fullName,
        institution: form.institution,
        batch: form.batch,
        academicYear: form.academicYear,
        activities: form.activities,
        competitionCategory: form.competitionCategory,
        title: form.submitAbstract ? "Registration & Abstract Received!" : "Registration Confirmed!",
        subtitle: form.submitAbstract
          ? (absCount > 1
              ? `Your place at IMF 2026 and your ${absCount} scientific abstract submissions have been recorded.`
              : "Your place at IMF 2026 and your scientific abstract submission have both been recorded.")
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
        saveStoredDelegateSession(res);
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

  // ── Manage Portal Helpers (Unified Single-Page View) ─────────
  function updateManageReg(field, value) {
    setManageReg((prev) => ({ ...prev, [field]: value }));
    setLookupError("");
  }

  function toggleManageActivity(label) {
    setManageReg((prev) => ({
      ...prev,
      activities: prev.activities.includes(label)
        ? prev.activities.filter((a) => a !== label)
        : [...prev.activities, label],
    }));
    setLookupError("");
  }

  const allManageActivitiesSelected =
    ACTIVITIES.length > 0 && ACTIVITIES.every((act) => manageReg.activities.includes(act.label));

  function toggleAllManageActivities() {
    setManageReg((prev) => ({
      ...prev,
      activities: allManageActivitiesSelected ? [] : ACTIVITIES.map((act) => act.label),
    }));
    setLookupError("");
  }

  function toggleManageCompetitionCategory(cat) {
    const NOT_PARTICIPATING = "Not participating in a competition (Attendee only)";
    setManageReg((prev) => {
      const current = Array.isArray(prev.competitionCategory) ? prev.competitionCategory : [];
      const exists = current.includes(cat);
      if (exists) {
        return {
          ...prev,
          competitionCategory: current.filter((c) => c !== cat),
        };
      }
      if (cat === NOT_PARTICIPATING) {
        return {
          ...prev,
          competitionCategory: [NOT_PARTICIPATING],
        };
      }
      return {
        ...prev,
        competitionCategory: [...current.filter((c) => c !== NOT_PARTICIPATING), cat],
      };
    });
    setLookupError("");
  }

  function updateManageAbstract(index, field, value) {
    setManageAbstracts((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
    setLookupError("");
  }

  function handleAddManageAbstract() {
    setManageAbstracts((prev) => [
      ...prev,
      createEmptyAbstract(manageReg.fullName || ""),
    ]);
  }

  function handleRemoveManageAbstract(index) {
    const absToRemove = manageAbstracts[index];
    if (!absToRemove) return;

    if (absToRemove.id && typeof absToRemove.id === "number") {
      setManageDeletedAbsIds((prev) => [...prev, absToRemove.id]);
    }
    setManageAbstracts((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleManageAbstractFileInstantUpload(index, file) {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "docx", "doc"].includes(ext)) {
      updateManageAbstract(index, "uploadError", `Unsupported file format (.${ext}). Please upload a PDF or Word document (.docx).`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      updateManageAbstract(index, "uploadError", `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 10 MB.`);
      return;
    }

    setManageAbstracts((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              fileName: file.name,
              fileSize: file.size,
              r2FileKey: "",
              isUploading: true,
              uploadProgress: 5,
              uploadError: "",
            }
          : item
      )
    );

    try {
      const { uploadUrl, fileKey } = await getUploadUrl(file.name, file.type);
      await uploadFileToR2(uploadUrl, file, (pct) => {
        setManageAbstracts((prev) =>
          prev.map((item, i) =>
            i === index ? { ...item, uploadProgress: Math.max(5, pct) } : item
          )
        );
      });

      setManageAbstracts((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                r2FileKey: fileKey,
                isUploading: false,
                uploadProgress: 100,
                uploadError: "",
              }
            : item
        )
      );
    } catch (err) {
      setManageAbstracts((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                r2FileKey: "",
                isUploading: false,
                uploadProgress: 0,
                uploadError: err.message || "Upload failed. Please try again.",
              }
            : item
        )
      );
    }
  }

  function handleRemoveManageAbstractFile(index) {
    setManageAbstracts((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              fileName: "",
              fileSize: 0,
              r2FileKey: "",
              isUploading: false,
              uploadProgress: 0,
              uploadError: "",
            }
          : item
      )
    );
    const el = document.getElementById(`manageAbstractFileInput-${index}`);
    if (el) el.value = "";
  }

  // Instant upload directly upon poster / presentation file selection in manage portal
  async function handleManagePosterFileInstantUpload(index, file) {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "pptx", "ppt"].includes(ext)) {
      updateManageAbstract(index, "presentationUploadError", `Unsupported format (.${ext}). Poster / presentation must be PDF (.pdf) or PowerPoint (.pptx).`);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      updateManageAbstract(index, "presentationUploadError", `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 50 MB.`);
      return;
    }

    setManageAbstracts((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              presentationFileName: file.name,
              presentationFileSize: file.size,
              presentationFileKey: "",
              isPresentationUploading: true,
              presentationUploadProgress: 5,
              presentationUploadError: "",
            }
          : item
      )
    );

    try {
      const { uploadUrl, fileKey } = await getUploadUrl(file.name, file.type);
      await uploadFileToR2(uploadUrl, file, (pct) => {
        setManageAbstracts((prev) =>
          prev.map((item, i) =>
            i === index ? { ...item, presentationUploadProgress: Math.max(5, pct) } : item
          )
        );
      });

      setManageAbstracts((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                presentationFileKey: fileKey,
                isPresentationUploading: false,
                presentationUploadProgress: 100,
                presentationUploadError: "",
              }
            : item
        )
      );
    } catch (err) {
      setManageAbstracts((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                presentationFileKey: "",
                isPresentationUploading: false,
                presentationUploadProgress: 0,
                presentationUploadError: err.message || "Upload failed. Please try again.",
              }
            : item
        )
      );
    }
  }

  function handleRemoveManagePosterFile(index) {
    setManageAbstracts((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              presentationFileName: "",
              presentationFileSize: 0,
              presentationFileKey: "",
              isPresentationUploading: false,
              presentationUploadProgress: 0,
              presentationUploadError: "",
            }
          : item
      )
    );
    const el = document.getElementById(`managePosterFileInput-${index}`);
    if (el) el.value = "";
  }

  // ── Unified Single Save for Manage Portal ─────────────────────
  async function handleSaveAllManage(e) {
    e?.preventDefault();
    if (!manageData?.registration) return;

    // Validate registration fields
    if (!manageReg.fullName.trim()) {
      setLookupError("Full name is required.");
      window.scrollTo({ top: 200, behavior: "smooth" });
      return;
    }
    if (!manageReg.institution.trim()) {
      setLookupError("Medical college / institution is required.");
      window.scrollTo({ top: 200, behavior: "smooth" });
      return;
    }
    if (!manageReg.batch) {
      setLookupError("Please select your batch.");
      window.scrollTo({ top: 200, behavior: "smooth" });
      return;
    }
    if (!manageReg.academicYear) {
      setLookupError("Please select your academic year.");
      window.scrollTo({ top: 200, behavior: "smooth" });
      return;
    }
    if (!manageReg.phone.trim()) {
      setLookupError("Contact phone number is required.");
      window.scrollTo({ top: 200, behavior: "smooth" });
      return;
    }
    if (!manageReg.email.trim() || !manageReg.email.includes("@")) {
      setLookupError("A valid email address is required.");
      window.scrollTo({ top: 200, behavior: "smooth" });
      return;
    }
    if (!manageReg.activities || manageReg.activities.length === 0) {
      setLookupError("Please select at least one activity to attend.");
      window.scrollTo({ top: 350, behavior: "smooth" });
      return;
    }
    if (!manageReg.competitionCategory || manageReg.competitionCategory.length === 0) {
      setLookupError("Please select at least one competition preference.");
      window.scrollTo({ top: 350, behavior: "smooth" });
      return;
    }

    // Validate abstracts if any exist
    for (let i = 0; i < manageAbstracts.length; i++) {
      const abs = manageAbstracts[i];
      const num = manageAbstracts.length > 1 ? ` for Abstract #${i + 1}` : "";
      if (!abs.title || !abs.title.trim()) {
        setLookupError(`Title of the Abstract is required${num}.`);
        window.scrollTo({ top: 500, behavior: "smooth" });
        return;
      }
      if (!abs.submissionType) {
        setLookupError(`Please select a type of submission${num}.`);
        window.scrollTo({ top: 500, behavior: "smooth" });
        return;
      }
      if (!abs.presentationCategory) {
        setLookupError(`Please select a presentation category${num}.`);
        window.scrollTo({ top: 500, behavior: "smooth" });
        return;
      }
      if (!abs.abstractBody || !abs.abstractBody.trim()) {
        setLookupError(`Abstract text is required${num}.`);
        window.scrollTo({ top: 500, behavior: "smooth" });
        return;
      }
      if (abs.isUploading) {
        setLookupError(`Please wait for file upload to finish${num}.`);
        return;
      }
      if (abs.isPresentationUploading) {
        setLookupError(`Please wait for poster / presentation upload to finish${num}.`);
        return;
      }
      if (!abs.r2FileKey && !abs.fileName) {
        setLookupError(`Please upload your abstract file (PDF or DOCX)${num}.`);
        window.scrollTo({ top: 500, behavior: "smooth" });
        return;
      }
    }

    setManageSaving(true);
    setLookupError("");
    setManageSuccessMsg("");

    try {
      const processedAbstracts = manageAbstracts.map((abs) => ({
        id: abs.id && !isNaN(Number(abs.id)) ? Number(abs.id) : (typeof abs.id === "number" ? abs.id : undefined),
        abstractNumber: abs.abstractNumber || undefined,
        title: abs.title.trim(),
        submissionType: abs.submissionType,
        presentationCategory: abs.presentationCategory,
        abstractBody: abs.abstractBody.trim(),
        keywords: abs.keywords ? abs.keywords.trim() : "",
        presenterName: (abs.presenterName || manageReg.fullName).trim(),
        coAuthors: abs.coAuthors ? abs.coAuthors.trim() : "",
        authorAffiliation: abs.authorAffiliation ? abs.authorAffiliation.trim() : "",
        supervisorName: abs.supervisorName ? abs.supervisorName.trim() : "",
        r2FileKey: abs.r2FileKey,
        fileName: abs.fileName,
        fileSize: abs.fileSize,
        presentationFileKey: abs.presentationFileKey || "",
        presentationFileName: abs.presentationFileName || "",
        presentationFileSize: abs.presentationFileSize || 0,
      }));

      const primaryAbstract = processedAbstracts[0] ? {
        id: processedAbstracts[0].id,
        abstractNumber: processedAbstracts[0].abstractNumber,
        title: processedAbstracts[0].title,
        submissionType: processedAbstracts[0].submissionType,
        presentationCategory: processedAbstracts[0].presentationCategory,
        abstractBody: processedAbstracts[0].abstractBody,
        keywords: processedAbstracts[0].keywords,
        presenterName: processedAbstracts[0].presenterName,
        coAuthors: processedAbstracts[0].coAuthors,
        authorAffiliation: processedAbstracts[0].authorAffiliation,
        supervisorName: processedAbstracts[0].supervisorName,
        r2FileKey: processedAbstracts[0].r2FileKey,
        fileName: processedAbstracts[0].fileName,
        fileSize: processedAbstracts[0].fileSize,
        presentationFileKey: processedAbstracts[0].presentationFileKey,
        presentationFileName: processedAbstracts[0].presentationFileName,
      } : null;

      const res = await updateRegistrationData({
        regNumber: manageData.registration.regNumber,
        phone: manageData.registration.phone,
        email: manageData.registration.email,
        registration: {
          fullName: manageReg.fullName.trim(),
          institution: manageReg.institution.trim(),
          batch: manageReg.batch,
          academicYear: manageReg.academicYear,
          phone: manageReg.phone.trim(),
          activities: manageReg.activities,
          competitionCategory: manageReg.competitionCategory,
          priorExperience: manageReg.priorExperience,
          queries: manageReg.queries,
        },
        abstracts: processedAbstracts,
        abstract: primaryAbstract,
        deletedAbstractIds: manageDeletedAbsIds,
      });

      const updatedRegistration = res?.registration || {
        ...manageData.registration,
        fullName: manageReg.fullName.trim(),
        institution: manageReg.institution.trim(),
        batch: manageReg.batch,
        academicYear: manageReg.academicYear,
        phone: manageReg.phone.trim(),
        activities: manageReg.activities,
        competitionCategory: manageReg.competitionCategory,
        priorExperience: manageReg.priorExperience,
        queries: manageReg.queries,
      };

      const updatedAbstracts = (res?.abstracts && res.abstracts.length > 0)
        ? res.abstracts
        : processedAbstracts;

      const newSession = {
        verified: true,
        registration: updatedRegistration,
        abstracts: updatedAbstracts,
        abstract: updatedAbstracts[0] || null,
      };

      setManageData(newSession);
      saveStoredDelegateSession(newSession);
      setManageDeletedAbsIds([]);
      setManageSuccessMsg("All registration and abstract details have been successfully saved!");
      setShowSaveSuccessModal(true);
      window.scrollTo({ top: 150, behavior: "smooth" });
    } catch (ex) {
      setLookupError(ex.message || "Failed to update registration details.");
    } finally {
      setManageSaving(false);
    }
  }

  // ── Success Confirmation Screen ───────────────────────────────
  if (successInfo) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <div className="print:hidden">
          <Header
            onHome={() => navigate("/")}
            onOpenAdmin={() => navigate("/admin")}
          />
        </div>
        <main className="flex-1 flex items-center justify-center pt-24 pb-16 px-4 print:p-0 print:m-0 print:pt-0 print:pb-0">
          <SuccessCard
            regNumber={successInfo.regNumber}
            abstractNumber={successInfo.abstractNumber}
            abstractNumbers={successInfo.abstractNumbers}
            phone={successInfo.phone || form.phone}
            email={successInfo.email || form.email}
            fullName={successInfo.fullName || form.fullName}
            institution={successInfo.institution || form.institution}
            batch={successInfo.batch || form.batch}
            academicYear={successInfo.academicYear || form.academicYear}
            activities={successInfo.activities || form.activities}
            competitionCategory={successInfo.competitionCategory || form.competitionCategory}
            title={successInfo.title}
            subtitle={successInfo.subtitle}
            onClose={() => navigate("/")}
            onManage={() => {
              const userEmail = successInfo.email || form.email;
              setSuccessInfo(null);
              setActiveTab("manage");
              if (userEmail) setLookupEmail(userEmail);
            }}
          />
        </main>
        <div className="print:hidden">
          <Footer
            onOpenAdmin={() => navigate("/admin")}
            onOpenRegister={() => { setSuccessInfo(null); setStep(0); setActiveTab("register"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            onOpenAbstract={() => { setSuccessInfo(null); setActiveTab("register"); setForm((f) => ({ ...f, submitAbstract: true })); setStep(0); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          />
        </div>
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
        </div>


        {/* ════════════════════════════════════════════════════════════
            TAB 1: NEW REGISTRATION
        ════════════════════════════════════════════════════════════ */}
        {activeTab === "register" && (
          isRegistrationClosed ? (
            <div className="card p-8 sm:p-12 text-center bg-white border border-slate-200 shadow-elevated rounded-3xl space-y-6 animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-sm">
                <Icons.Lock className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  Registration Closed
                </span>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight pt-1">
                  Delegate Registration is Closed
                </h2>
                <p className="text-sm text-slate-500 leading-relaxed">
                  New delegate registration for Internal Medicine Festival 2026 is currently turned off by event administration.
                </p>
              </div>

              <div className="pt-6 border-t border-slate-100 max-w-sm mx-auto space-y-3">
                <p className="text-xs text-slate-500 font-medium">
                  Already registered? You can verify and view your delegate pass &amp; submitted abstracts:
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("manage");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="w-full btn-primary py-3 text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Icons.Badge className="w-4 h-4" />
                  <span>Access Registered Delegate Portal</span>
                </button>
              </div>
            </div>
          ) : (
          <>
            {/* Banner Header */}
            <div className="card p-6 sm:p-8 mb-8 bg-gradient-to-r from-sky-900 to-slate-900 text-white border-0 shadow-elevated">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[11px] font-bold tracking-wider uppercase mb-2">
                    Abstract Submission Included
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    Registration Portal
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
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in shadow-xs">
                <div className="flex items-center gap-2.5">
                  <Icons.Alert className="w-5 h-5 flex-shrink-0 text-rose-600" />
                  <span className="leading-snug">{error}</span>
                </div>
                {error.toLowerCase().includes("already registered") && (
                  <button
                    type="button"
                    onClick={() => {
                      if (form.email) setLookupEmail(form.email);
                      setActiveTab("manage");
                      setError("");
                      window.scrollTo({ top: 120, behavior: "smooth" });
                    }}
                    className="btn-primary text-xs py-2 px-4 whitespace-nowrap bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer rounded-xl shadow-xs flex-shrink-0 self-start sm:self-auto"
                  >
                    Go to Already Registered Tab &rarr;
                  </button>
                )}
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

                  {isAbstractOnly ? (
                    <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs shadow-xs space-y-2 animate-fade-in leading-relaxed">
                      <div className="flex items-start gap-2.5">
                        <Icons.Alert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1">
                          <p>
                            <strong>Notice:</strong> Due to venue capacity limitations, general delegate registration is now closed. The few remaining slots are reserved exclusively for delegates submitting an abstract.
                          </p>
                          <p className="text-amber-800">
                            If you have already registered, you can submit your abstract via the{" "}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("manage");
                                window.scrollTo({ top: 120, behavior: "smooth" });
                              }}
                              className="font-bold underline text-amber-950 hover:text-black cursor-pointer inline-flex items-center gap-0.5"
                            >
                              "Already Registered?" section &rarr;
                            </button>
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : form.submitAbstract ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-teal-50/80 border border-teal-200 text-xs text-teal-800">
                      <div className="flex items-center gap-2">
                        <Icons.File className="w-4 h-4 flex-shrink-0 text-teal-600" />
                        <span>
                          <strong>Abstract Submission Mode:</strong> Enter your presenter details below first. You will enter your abstract title, text, and manuscript in Step 3.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("manage");
                          window.scrollTo({ top: 120, behavior: "smooth" });
                        }}
                        className="text-teal-700 underline font-bold hover:text-teal-900 whitespace-nowrap self-start sm:self-auto"
                      >
                        Already registered? &rarr;
                      </button>
                    </div>
                  ) : null}

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
                      <MedicalCollegeInput
                        id="institution"
                        placeholder="Search or enter your medical college"
                        value={form.institution}
                        onChange={(val) => set("institution", val)}
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
                    <div className="flex items-center justify-between gap-3">
                      <label className="form-label form-label-required mb-0">Which activities would you like to attend?</label>
                      <button
                        type="button"
                        onClick={toggleAllActivities}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer bg-sky-50 text-sky-700 border-sky-200/80 hover:bg-sky-100 hover:border-sky-300 active:scale-95 select-none"
                      >
                        {allActivitiesSelected ? (
                          <>
                            <Icons.Close className="w-3.5 h-3.5 text-sky-600" />
                            <span>Deselect All</span>
                          </>
                        ) : (
                          <>
                            <Icons.Check className="w-3.5 h-3.5 text-sky-600" />
                            <span>Select All</span>
                          </>
                        )}
                      </button>
                    </div>
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
                    <label className="form-label form-label-required">
                      Competition Preference(s)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                      {COMPETITION_CATEGORIES.map((c) => {
                        const selected = form.competitionCategory.includes(c);
                        return (
                          <div
                            key={c}
                            onClick={() => toggleCompetitionCategory(c)}
                            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                              selected
                                ? "bg-sky-50/70 border-sky-400 ring-1 ring-sky-400"
                                : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {}}
                              className="w-4 h-4 accent-sky-600 flex-shrink-0"
                            />
                            <div className="text-xs font-semibold text-slate-800 leading-snug">{c}</div>
                          </div>
                        );
                      })}
                    </div>
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

                  {/* ── Abstract Toggle: Defaults to NO unless isAbstractOnly ── */}
                  <div className="p-5 rounded-2xl border-2 border-slate-200 bg-slate-50/60 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="block text-sm font-bold text-slate-900">
                        Would you like to submit a Scientific Abstract for IMF 2026?
                      </label>
                      {isAbstractOnly && (
                        <span className="text-[11px] font-bold text-purple-800 bg-purple-100 border border-purple-200 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 self-start sm:self-auto">
                          <Icons.Alert className="w-3 h-3 text-purple-600 flex-shrink-0" />
                          Abstract Required
                        </span>
                      )}
                    </div>

                    {isAbstractOnly && (
                      <div className="p-3.5 rounded-xl bg-purple-50/80 border border-purple-200 text-purple-900 text-xs flex items-start gap-2.5 font-medium animate-fade-in leading-relaxed">
                        <Icons.Alert className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <strong>Notice:</strong> Due to venue capacity limitations, general delegate registration is now closed. The few remaining slots are reserved exclusively for delegates submitting an abstract. If you have already registered, you can submit your abstract via the{" "}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab("manage");
                              window.scrollTo({ top: 120, behavior: "smooth" });
                            }}
                            className="font-bold underline text-purple-950 hover:text-black cursor-pointer"
                          >
                            "Already Registered?" section
                          </button>
                          .
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* NO Option (Disabled if isAbstractOnly) */}
                      <div
                        onClick={() => {
                          if (!isAbstractOnly) set("submitAbstract", false);
                        }}
                        className={`p-4 rounded-xl border-2 transition-all flex items-start gap-3 ${
                          isAbstractOnly
                            ? "bg-slate-100/70 border-slate-200 opacity-60 cursor-not-allowed"
                            : !form.submitAbstract
                            ? "bg-white border-sky-600 shadow-sm ring-1 ring-sky-600 cursor-pointer"
                            : "bg-white/60 border-slate-200 hover:border-slate-300 cursor-pointer"
                        }`}
                        title={isAbstractOnly ? "Attendee-only registration is currently paused. An abstract is required." : ""}
                      >
                        <input
                          type="radio"
                          name="submitAbstractRadio"
                          disabled={isAbstractOnly}
                          checked={!form.submitAbstract && !isAbstractOnly}
                          onChange={() => {
                            if (!isAbstractOnly) set("submitAbstract", false);
                          }}
                          className={`w-4 h-4 mt-0.5 ${isAbstractOnly ? "cursor-not-allowed accent-slate-400" : "accent-sky-600"}`}
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
                            <span className={isAbstractOnly ? "text-slate-400" : ""}>
                              No, register as festival attendee only
                            </span>
                            {isAbstractOnly ? (
                              <span className="text-[10px] bg-rose-100 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded font-bold uppercase">
                                Disabled
                              </span>
                            ) : (
                              <span className="ml-1 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">
                                Default
                              </span>
                            )}
                          </div>
                          <div className={`text-[11px] mt-0.5 ${isAbstractOnly ? "text-slate-400" : "text-slate-500"}`}>
                            {isAbstractOnly
                              ? "Registration is currently restricted to delegates submitting a scientific abstract."
                              : "You can always submit an abstract later using your email via the \"Already Registered\" button."}
                          </div>
                        </div>
                      </div>

                      {/* YES Option (Default and Required when isAbstractOnly) */}
                      <div
                        onClick={() => set("submitAbstract", true)}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                          form.submitAbstract || isAbstractOnly
                            ? "bg-teal-50/70 border-teal-600 shadow-sm ring-1 ring-teal-600"
                            : "bg-white/60 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="submitAbstractRadio"
                          checked={form.submitAbstract || isAbstractOnly}
                          onChange={() => set("submitAbstract", true)}
                          className="w-4 h-4 accent-teal-600 mt-0.5"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
                            <span>Yes, I want to submit a Scientific Abstract</span>
                            {isAbstractOnly ? (
                              <span className="text-[10px] bg-teal-100 text-teal-800 border border-teal-200 px-1.5 py-0.5 rounded font-bold uppercase">
                                Required (Default)
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Open abstract fields. Your author &amp; contact info will be automatically attached.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── EXPANDED ABSTRACT FIELDS (Only when YES is selected) ── */}
                  {/* ── EXPANDED ABSTRACT FIELDS (Only when YES is selected) ── */}
                  {form.submitAbstract ? (
                    <div className="space-y-8 pt-4 border-t border-slate-200 animate-fade-in">
                      {abstracts.map((abs, idx) => (
                        <div
                          key={abs.id || idx}
                          className="p-5 sm:p-7 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-6"
                        >
                          {/* Card Header */}
                          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <h3 className="text-sm font-bold text-slate-900">
                                {abstracts.length > 1 ? `Abstract #${idx + 1}` : "Scientific Abstract Details"}
                              </h3>
                            </div>
                            {abstracts.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveAbstract(idx)}
                                className="text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <Icons.Delete className="w-3.5 h-3.5" />
                                <span>Remove This Abstract</span>
                              </button>
                            )}
                          </div>

                          {/* SECTION 2 Header */}
                          <div className="flex items-center gap-2 pb-1">
                            <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-teal-800">
                              Section 2 — Abstract Information
                            </h4>
                          </div>

                          {/* 7. Title of the Abstract */}
                          <div className="form-group">
                            <label className="form-label form-label-required" htmlFor={`abstractTitle-${idx}`}>
                              7. Title of the Abstract
                            </label>
                            <input
                              id={`abstractTitle-${idx}`}
                              type="text"
                              className="form-input"
                              placeholder="Enter abstract title"
                              value={abs.title}
                              onChange={(e) => updateAbstract(idx, "title", e.target.value)}
                              required
                            />
                          </div>

                          {/* 8. Type of Submission & 9. Presentation Category */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="form-group">
                              <label className="form-label form-label-required" htmlFor={`subType-${idx}`}>
                                8. Type of Submission
                              </label>
                              <select
                                id={`subType-${idx}`}
                                className="form-select"
                                value={abs.submissionType || ""}
                                onChange={(e) => updateAbstract(idx, "submissionType", e.target.value)}
                                required
                              >
                                <option value="">—</option>
                                {SUBMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>

                            <div className="form-group">
                              <label className="form-label form-label-required" htmlFor={`presCat-${idx}`}>
                                9. Presentation Category
                              </label>
                              <select
                                id={`presCat-${idx}`}
                                className="form-select"
                                value={abs.presentationCategory || ""}
                                onChange={(e) => updateAbstract(idx, "presentationCategory", e.target.value)}
                                required
                              >
                                <option value="">—</option>
                                {PRESENTATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* 10. Abstract (Paragraph, Required - No min 50 check) */}
                          <div className="form-group">
                            <div className="flex justify-between items-center mb-1">
                              <label className="form-label form-label-required" htmlFor={`abstractBody-${idx}`}>
                                10. Abstract
                              </label>
                              <span className="text-[11px] text-slate-400">
                                {abs.abstractBody.length} characters
                              </span>
                            </div>
                            <textarea
                              id={`abstractBody-${idx}`}
                              rows={6}
                              className="form-input text-xs leading-relaxed"
                              placeholder="Type or paste your abstract paragraph here..."
                              value={abs.abstractBody}
                              onChange={(e) => updateAbstract(idx, "abstractBody", e.target.value)}
                              required
                            />
                          </div>

                          {/* 11. Keywords */}
                          <div className="form-group">
                            <label className="form-label" htmlFor={`keywords-${idx}`}>
                              11. Keywords <span className="text-slate-400 font-normal text-xs ml-1">(Please provide 3–5 keywords)</span>
                            </label>
                            <input
                              id={`keywords-${idx}`}
                              type="text"
                              className="form-input"
                              placeholder="e.g. Internal Medicine, Cardiology, Biomarkers"
                              value={abs.keywords}
                              onChange={(e) => updateAbstract(idx, "keywords", e.target.value)}
                            />
                          </div>

                          {/* 12. Name of Presenter */}
                          <div className="form-group">
                            <label className="form-label form-label-required" htmlFor={`presenterName-${idx}`}>
                              12. Name of Presenter
                            </label>
                            <input
                              id={`presenterName-${idx}`}
                              type="text"
                              className="form-input"
                              value={abs.presenterName}
                              onChange={(e) => updateAbstract(idx, "presenterName", e.target.value)}
                              placeholder={form.fullName ? `Defaults to: ${form.fullName}` : "Enter name of presenter"}
                              required
                            />
                          </div>

                          {/* 13. Names of Co-authors */}
                          <div className="form-group">
                            <label className="form-label" htmlFor={`coAuthors-${idx}`}>
                              13. Names of Co-authors <span className="text-slate-400 font-normal text-xs ml-1">(If applicable)</span>
                            </label>
                            <textarea
                              id={`coAuthors-${idx}`}
                              rows={2}
                              className="form-input text-xs"
                              placeholder="Enter names of co-authors (if applicable)"
                              value={abs.coAuthors}
                              onChange={(e) => updateAbstract(idx, "coAuthors", e.target.value)}
                            />
                          </div>

                          {/* 14. Affiliation of Authors (Blank by default, search or custom input) */}
                          <div className="form-group">
                            <label className="form-label" htmlFor={`authorAffiliation-${idx}`}>
                              14. Affiliation of Authors
                            </label>
                            <MedicalCollegeInput
                              id={`authorAffiliation-${idx}`}
                              placeholder="Search medical college or enter custom affiliation"
                              value={abs.authorAffiliation || ""}
                              onChange={(val) => updateAbstract(idx, "authorAffiliation", val)}
                            />
                            <span className="text-[11px] text-slate-400 mt-1 block">
                              Search from medical colleges list or enter custom affiliation.
                            </span>
                          </div>

                          {/* 15. Name of Faculty Supervisor / Mentor */}
                          <div className="form-group">
                            <label className="form-label" htmlFor={`supervisorName-${idx}`}>
                              15. Name of Faculty Supervisor / Mentor <span className="text-slate-400 font-normal text-xs ml-1">(If applicable)</span>
                            </label>
                            <input
                              id={`supervisorName-${idx}`}
                              type="text"
                              className="form-input"
                              placeholder="e.g. Prof. Dr. M. A. Jalil (if applicable)"
                              value={abs.supervisorName}
                              onChange={(e) => updateAbstract(idx, "supervisorName", e.target.value)}
                            />
                          </div>

                          {/* ── SECTION 3: FILE SUBMISSION ── */}
                          <div className="pt-6 border-t border-slate-200">
                            <div className="flex items-center gap-2 pb-2 mb-4 border-b border-slate-100">
                              <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                              <h4 className="text-xs font-bold uppercase tracking-wider text-teal-800">
                                Section 3 — File Submission
                              </h4>
                            </div>

                            <div className="space-y-5">
                              {/* 16. Upload Abstract File (Instant upload with progress bar & cross sign) */}
                              <div className="form-group">
                                <label className="form-label form-label-required">
                                  16. Upload Abstract File
                                </label>
                                <div className="text-[11px] text-slate-500 -mt-1 mb-2">
                                  Accepted format: <strong>PDF / DOCX</strong> &bull; Maximum file size: <strong>10 MB</strong>
                                </div>

                                <input
                                  type="file"
                                  id={`abstractFileInput-${idx}`}
                                  accept=".pdf,.docx,.doc"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleAbstractFileInstantUpload(idx, file);
                                  }}
                                />

                                {abs.uploadError && (
                                  <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <Icons.Alert className="w-4 h-4 flex-shrink-0 text-rose-500" />
                                      <span>{abs.uploadError}</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => updateAbstract(idx, "uploadError", "")}
                                      className="text-rose-600 hover:text-rose-800 p-0.5"
                                    >
                                      <Icons.Close className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}

                                {abs.isUploading ? (
                                  /* In-progress Instant Upload State with Animated Progress Bar */
                                  <div className="border-2 border-dashed border-teal-400 rounded-2xl p-6 bg-teal-50/50 text-center animate-fade-in">
                                    <Icons.Spinner className="w-8 h-8 text-teal-600 mx-auto mb-2 animate-spin" />
                                    <p className="text-xs font-bold text-slate-800 mb-1">
                                      Uploading: {abs.fileName} ({(abs.fileSize / 1024 / 1024).toFixed(2)} MB)
                                    </p>
                                    <p className="text-[11px] text-teal-700 font-medium mb-3">
                                      Uploading directly to secure storage…
                                    </p>

                                    <div className="w-full max-w-sm mx-auto">
                                      <div className="flex justify-between text-xs text-slate-600 mb-1.5 font-semibold">
                                        <span>Progress</span>
                                        <span className="text-teal-700 font-bold">{abs.uploadProgress}%</span>
                                      </div>
                                      <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden shadow-inner">
                                        <div
                                          className="h-full bg-teal-600 transition-all duration-200 ease-out rounded-full"
                                          style={{ width: `${abs.uploadProgress}%` }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ) : abs.r2FileKey ? (
                                  /* Completed Upload State with Cross Sign to Remove & Reselect */
                                  <div className="relative border-2 border-emerald-300 rounded-2xl p-6 bg-emerald-50/40 animate-fade-in">
                                    {/* Cross Sign (X) to Remove at top right */}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveAbstractFile(idx)}
                                      className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 shadow-xs transition-all cursor-pointer"
                                      title="Remove file to reselect"
                                    >
                                      <Icons.Close className="w-4 h-4" />
                                    </button>

                                    <div className="flex flex-col items-center text-center">
                                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2 shadow-xs">
                                        <Icons.Check className="w-5 h-5" />
                                      </div>
                                      <p className="text-xs font-bold text-slate-800">
                                        Selected: <span className="text-teal-700 font-bold">{abs.fileName}</span> ({(abs.fileSize / 1024 / 1024).toFixed(2)} MB)
                                      </p>
                                      <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                                        ✓ Upload completed successfully
                                      </p>

                                      <div className="flex items-center gap-2 mt-4">
                                        <button
                                          type="button"
                                          onClick={() => document.getElementById(`abstractFileInput-${idx}`)?.click()}
                                          className="btn-outline text-xs py-1.5 px-4 cursor-pointer"
                                        >
                                          Change Abstract File
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveAbstractFile(idx)}
                                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 py-1.5 px-3 cursor-pointer"
                                        >
                                          <Icons.Close className="w-3.5 h-3.5" />
                                          <span>Remove</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  /* Empty Initial Dropzone */
                                  <div
                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const file = e.dataTransfer.files?.[0];
                                      if (file) handleAbstractFileInstantUpload(idx, file);
                                    }}
                                    onClick={() => document.getElementById(`abstractFileInput-${idx}`)?.click()}
                                    className="border-2 border-dashed border-slate-300 hover:border-teal-400 rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-teal-50/20 transition-all cursor-pointer"
                                  >
                                    <Icons.Upload className="w-7 h-7 text-teal-600 mx-auto mb-2" />
                                    <p className="text-xs font-semibold text-slate-700">
                                      Click to browse or drag &amp; drop your abstract file
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                      PDF (.pdf) or Word document (.docx, .doc) up to 10 MB
                                    </p>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        document.getElementById(`abstractFileInput-${idx}`)?.click();
                                      }}
                                      className="mt-3 btn-outline text-xs py-1.5 px-4 cursor-pointer"
                                    >
                                      Browse Abstract File
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* 17. Upload Poster for this abstract (Optional) */}
                              <div className="form-group pt-4 border-t border-slate-100">
                                <div className="flex items-center justify-between mb-1">
                                  <label className="form-label mb-0">
                                    17. Upload Poster for this abstract
                                  </label>
                                  <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                                    Optional
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 -mt-0.5 mb-2">
                                  Accepted formats: <strong>PDF (.pdf) / PowerPoint (.pptx)</strong> &bull; Maximum file size: <strong>50 MB</strong>
                                </div>

                                <input
                                  type="file"
                                  id={`posterFileInput-${idx}`}
                                  accept=".pdf,.pptx,.ppt"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handlePosterFileInstantUpload(idx, file);
                                  }}
                                />

                                {abs.presentationUploadError && (
                                  <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <Icons.Alert className="w-4 h-4 flex-shrink-0 text-rose-500" />
                                      <span>{abs.presentationUploadError}</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => updateAbstract(idx, "presentationUploadError", "")}
                                      className="text-rose-600 hover:text-rose-800 p-0.5 cursor-pointer"
                                    >
                                      <Icons.Close className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}

                                {abs.isPresentationUploading ? (
                                  /* In-progress Instant Upload State */
                                  <div className="border-2 border-dashed border-sky-400 rounded-2xl p-6 bg-sky-50/50 text-center animate-fade-in">
                                    <Icons.Spinner className="w-8 h-8 text-sky-600 mx-auto mb-2 animate-spin" />
                                    <p className="text-xs font-bold text-slate-800 mb-1">
                                      Uploading: {abs.presentationFileName} ({(abs.presentationFileSize / 1024 / 1024).toFixed(2)} MB)
                                    </p>
                                    <p className="text-[11px] text-sky-700 font-medium mb-3">
                                      Uploading poster directly to secure storage…
                                    </p>

                                    <div className="w-full max-w-sm mx-auto">
                                      <div className="flex justify-between text-xs text-slate-600 mb-1.5 font-semibold">
                                        <span>Progress</span>
                                        <span className="text-sky-700 font-bold">{abs.presentationUploadProgress}%</span>
                                      </div>
                                      <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden shadow-inner">
                                        <div
                                          className="h-full bg-sky-600 transition-all duration-200 ease-out rounded-full"
                                          style={{ width: `${abs.presentationUploadProgress}%` }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ) : abs.presentationFileKey ? (
                                  /* Completed Upload State */
                                  <div className="relative border-2 border-sky-300 rounded-2xl p-6 bg-sky-50/40 animate-fade-in">
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePosterFile(idx)}
                                      className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 shadow-xs transition-all cursor-pointer"
                                      title="Remove poster file"
                                    >
                                      <Icons.Close className="w-4 h-4" />
                                    </button>

                                    <div className="flex flex-col items-center text-center">
                                      <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center mb-2 shadow-xs">
                                        <Icons.Check className="w-5 h-5" />
                                      </div>
                                      <p className="text-xs font-bold text-slate-800">
                                        Attached Poster: <span className="text-sky-700 font-bold">{abs.presentationFileName}</span>
                                        {abs.presentationFileSize > 0 && ` (${(abs.presentationFileSize / 1024 / 1024).toFixed(2)} MB)`}
                                      </p>
                                      <p className="text-[11px] text-sky-700 font-medium mt-0.5">
                                        ✓ File stored securely
                                      </p>

                                      <div className="flex items-center gap-2 mt-4">
                                        <button
                                          type="button"
                                          onClick={() => document.getElementById(`posterFileInput-${idx}`)?.click()}
                                          className="btn-outline text-xs py-1.5 px-4 cursor-pointer"
                                        >
                                          Replace Poster File
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRemovePosterFile(idx)}
                                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 py-1.5 px-3 cursor-pointer"
                                        >
                                          <Icons.Close className="w-3.5 h-3.5" />
                                          <span>Remove</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  /* Empty Dropzone */
                                  <div
                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const file = e.dataTransfer.files?.[0];
                                      if (file) handlePosterFileInstantUpload(idx, file);
                                    }}
                                    onClick={() => document.getElementById(`posterFileInput-${idx}`)?.click()}
                                    className="border-2 border-dashed border-slate-300 hover:border-sky-400 rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-sky-50/20 transition-all cursor-pointer"
                                  >
                                    <Icons.FileUp className="w-7 h-7 text-sky-600 mx-auto mb-2" />
                                    <p className="text-xs font-semibold text-slate-700">
                                      Click to browse or drag &amp; drop your poster / presentation
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                      PDF (.pdf), PowerPoint (.pptx, .ppt), or Image (.png, .jpg) up to 50 MB
                                    </p>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        document.getElementById(`posterFileInput-${idx}`)?.click();
                                      }}
                                      className="mt-3 btn-outline text-xs py-1.5 px-4 cursor-pointer"
                                    >
                                      Browse Poster File
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                        </div>
                      ))}

                      {/* "+ Add Another Abstract" Button */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleAddAbstract}
                          className="w-full py-3.5 px-4 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/40 text-teal-800 text-xs font-bold hover:bg-teal-50 hover:border-teal-500 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                        >
                          <Icons.Plus className="w-4 h-4 text-teal-600" />
                          <span>+ Add Another Abstract</span>
                        </button>
                      </div>

                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-200 text-xs text-sky-800">
                      <span>
                        ℹ️ You are registering as an attendee. You will have full access to attend seminars, CME sessions, and spectator events. You can submit an abstract at any time before the deadline using your email via the <strong>Already Registered</strong> button.
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
                    {/* 9. Have you previously participated in any academic competition/conference? */}
                    <div className="form-group">
                      <label className="form-label">
                        9. Have you previously participated in any academic competition/conference?
                      </label>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        {["Yes", "No"].map((opt) => {
                          const selected = form.priorExperience === opt;
                          return (
                            <div
                              key={opt}
                              onClick={() => set("priorExperience", opt)}
                              className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-center gap-2.5 font-medium text-xs select-none ${
                                selected
                                  ? "bg-teal-50/70 border-teal-600 text-teal-900 shadow-xs ring-1 ring-teal-600"
                                  : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50/50"
                              }`}
                            >
                              <input
                                type="radio"
                                name="priorExperienceRadio"
                                checked={selected}
                                onChange={() => set("priorExperience", opt)}
                                className="w-4 h-4 accent-teal-600 cursor-pointer"
                              />
                              <span className="font-bold">{opt}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 10. Any questions or special requirements? */}
                    <div className="form-group">
                      <div className="flex justify-between items-center mb-1">
                        <label className="form-label mb-0" htmlFor="queries">
                          10. Any questions or special requirements?
                        </label>
                        <span className="text-[11px] text-slate-400 font-medium">Optional</span>
                      </div>
                      <textarea
                        id="queries"
                        rows={4}
                        className="form-input text-xs leading-relaxed"
                        placeholder="Optional"
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
                    <div className="flex justify-between border-b border-slate-200 pb-2">
                      <span className="text-slate-500">Competition Pref.:</span>
                      <strong className="text-sky-700 text-right max-w-xs">{Array.isArray(form.competitionCategory) ? form.competitionCategory.join(", ") : form.competitionCategory || "None"}</strong>
                    </div>
                    {form.priorExperience && (
                      <div className="flex justify-between border-b border-slate-200 pb-2">
                        <span className="text-slate-500">Prior Competition/Conf.:</span>
                        <strong className="text-slate-800">{form.priorExperience}</strong>
                      </div>
                    )}

                    {/* Abstract Summary if submitted */}
                    <div className="pt-2 border-t border-slate-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-500 font-medium">Scientific Abstract(s):</span>
                        <span className="font-bold text-teal-700">
                          {form.submitAbstract
                            ? `${abstracts.length} Abstract${abstracts.length > 1 ? "s" : ""} Included`
                            : "None (Attendee Only)"}
                        </span>
                      </div>

                      {form.submitAbstract && (
                        <div className="space-y-2 mt-2">
                          {abstracts.map((abs, i) => (
                            <div key={i} className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-slate-900 truncate">
                                  {abstracts.length > 1 ? `#${i + 1}: ` : ""}{abs.title || "Untitled"}
                                </span>
                                <span className="text-[10px] bg-teal-50 text-teal-700 px-2 py-0.5 rounded font-semibold border border-teal-200 flex-shrink-0">
                                  {abs.submissionType}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Category: <strong>{abs.presentationCategory}</strong> &bull; Presenter: <strong>{abs.presenterName || form.fullName}</strong>
                              </div>
                              {abs.authorAffiliation && (
                                <div className="text-[11px] text-slate-500">
                                  Affiliation: {abs.authorAffiliation}
                                </div>
                              )}
                              <div className="text-[11px] text-teal-700 font-medium flex items-center gap-1 pt-0.5">
                                <Icons.Check className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                                <span className="truncate">File: {abs.fileName || "Uploaded"}</span>
                              </div>
                              {abs.presentationFileName && (
                                <div className="text-[11px] text-sky-700 font-medium flex items-center gap-1 pt-0.5">
                                  <Icons.Check className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                                  <span className="truncate">Poster: {abs.presentationFileName}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
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
                    disabled={loading || !form.declaration || abstracts.some((a) => a.isUploading)}
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
          )
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
                      
                      <div className="mt-2.5 px-3.5 py-2 rounded-xl bg-sky-50 border border-sky-100 text-sky-800 text-xs text-center leading-relaxed flex items-center justify-center gap-2">
                        <Icons.Edit className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                        <span>
                          <strong>Already registered?</strong>{" "}
                          {isEditLocked
                            ? "Enter your email to verify and view your delegate pass and submitted abstracts."
                            : "You can edit your registration details or submit & update your scientific abstract here."}
                        </span>
                      </div>
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

                {!isRegistrationClosed && (
                  <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
                    <span>Haven't registered yet? </span>
                    <button
                      onClick={() => { setActiveTab("register"); }}
                      className="text-sky-600 font-bold hover:underline cursor-pointer"
                    >
                      Complete registration now
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Authenticated Dashboard: Single-Page View for All Details & Multiple Abstracts */
              <div className="space-y-6 animate-fade-in">

                {/* Verified Header Badge */}
                <div className="p-5 rounded-2xl bg-gradient-to-r from-sky-900 via-slate-900 to-teal-950 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-lg border border-sky-800/30">
                  <div>
                    <span className="inline-block px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider mb-1.5 border border-emerald-500/30">
                      ✓ Verified Delegate Portal
                    </span>
                    <h2 className="text-xl font-extrabold text-white tracking-tight">
                      {manageReg.fullName || manageData.registration.fullName}
                    </h2>
                    <p className="text-xs text-slate-300 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Reg ID: <strong className="font-mono text-teal-300">{manageData.registration.regNumber}</strong></span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1">
                        <Icons.Lock className="w-3 h-3 text-slate-400" />
                        {manageReg.email || manageData.registration.email}
                      </span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      clearStoredDelegateSession();
                      setManageData(null);
                      setLookupEmail("");
                      setOtpStep("credentials");
                      setOtpCode("");
                      setManageSuccessMsg("");
                      setLookupError("");
                    }}
                    className="text-xs py-2 px-4 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 self-start sm:self-center flex items-center gap-1.5 cursor-pointer shadow-md transition-all border border-rose-500/60"
                  >
                    <Icons.Logout className="w-3.5 h-3.5 text-white" />
                    <span>Exit / Logout</span>
                  </button>
                </div>

                {/* View-Only Mode Notice Banner */}
                {isEditLocked && (
                  <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 shadow-xs animate-fade-in">
                    <Icons.Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <strong className="font-bold text-amber-950 block text-sm">View-Only Mode Active</strong>
                      <p className="text-amber-800 leading-relaxed">
                        Abstract submissions and profile edits are currently closed by festival administration. All fields below are displayed in read-only mode for your records.
                      </p>
                    </div>
                  </div>
                )}

                {/* Alert Messages */}
                {manageSuccessMsg && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs flex items-center justify-between gap-2 shadow-xs animate-fade-in">
                    <div className="flex items-center gap-2.5">
                      <Icons.Check className="w-5 h-5 flex-shrink-0 text-emerald-600" />
                      <span className="font-bold">{manageSuccessMsg}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setManageSuccessMsg("")}
                      className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
                    >
                      <Icons.Close className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {lookupError && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center justify-between gap-2 animate-fade-in">
                    <div className="flex items-center gap-2.5">
                      <Icons.Alert className="w-5 h-5 flex-shrink-0 text-rose-600" />
                      <span className="font-medium">{lookupError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLookupError("")}
                      className="text-rose-700 hover:text-rose-900 p-1 cursor-pointer"
                    >
                      <Icons.Close className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* ── Section 1: Edit Delegate Profile & Contact ── */}
                <div className="card p-6 bg-white border border-slate-200 shadow-sm rounded-2xl space-y-5">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                        <Icons.User className="w-4 h-4" />
                      </span>
                      <span>Delegate Profile &amp; Contact Information</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Update your personal and college details. Email address is permanent and cannot be modified.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="form-group sm:col-span-2">
                      <label className="form-label form-label-required" htmlFor="mFullName">
                        Full Name
                      </label>
                      <input
                        id="mFullName"
                        type="text"
                        disabled={isEditLocked}
                        className={`form-input ${isEditLocked ? "bg-slate-100/80 text-slate-500 cursor-not-allowed border-slate-200" : ""}`}
                        placeholder="e.g. Dr. Tanvir Ahmed"
                        value={manageReg.fullName}
                        onChange={(e) => updateManageReg("fullName", e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group sm:col-span-2">
                      <label className="form-label form-label-required" htmlFor="mInst">
                        Medical College / Institution
                      </label>
                      <MedicalCollegeInput
                        id="mInst"
                        disabled={isEditLocked}
                        placeholder="Search or enter your medical college"
                        value={manageReg.institution}
                        onChange={(val) => updateManageReg("institution", val)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label form-label-required" htmlFor="mBatch">
                        Batch
                      </label>
                      <select
                        id="mBatch"
                        disabled={isEditLocked}
                        className={`form-select ${isEditLocked ? "bg-slate-100/80 text-slate-500 cursor-not-allowed border-slate-200" : ""}`}
                        value={manageReg.batch}
                        onChange={(e) => updateManageReg("batch", e.target.value)}
                        required
                      >
                        <option value="">Select your batch</option>
                        {BATCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label form-label-required" htmlFor="mYear">
                        Academic Year
                      </label>
                      <select
                        id="mYear"
                        disabled={isEditLocked}
                        className={`form-select ${isEditLocked ? "bg-slate-100/80 text-slate-500 cursor-not-allowed border-slate-200" : ""}`}
                        value={manageReg.academicYear}
                        onChange={(e) => updateManageReg("academicYear", e.target.value)}
                        required
                      >
                        <option value="">Select your year</option>
                        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label form-label-required" htmlFor="mPhone">
                        Contact Phone
                      </label>
                      <input
                        id="mPhone"
                        type="tel"
                        disabled={isEditLocked}
                        className={`form-input ${isEditLocked ? "bg-slate-100/80 text-slate-500 cursor-not-allowed border-slate-200" : ""}`}
                        placeholder="e.g. 017xxxxxxxx"
                        value={manageReg.phone}
                        onChange={(e) => updateManageReg("phone", e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <div className="flex items-center justify-between mb-1">
                        <label className="form-label mb-0" htmlFor="mEmail">
                          Email Address
                        </label>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                          <Icons.Lock className="w-3 h-3 text-slate-400" />
                          Locked / Read-Only
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          id="mEmail"
                          type="email"
                          className="form-input bg-slate-100/70 text-slate-500 cursor-not-allowed border-slate-200 pl-9 font-mono text-xs select-none"
                          value={manageReg.email}
                          disabled
                          readOnly
                        />
                        <Icons.Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        Email cannot be modified as it is your permanent delegate identifier.
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Section 2: Festival Participation & Competitions ── */}
                <div className="card p-6 bg-white border border-slate-200 shadow-sm rounded-2xl space-y-5">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                        <Icons.Date className="w-4 h-4" />
                      </span>
                      <span>Festival Participation &amp; Segments</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Choose the festival activities, workshops, and competitions you will be participating in.
                    </p>
                  </div>

                  {/* Activities */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="form-label form-label-required mb-0">
                        Which activities would you like to attend?
                      </label>
                      {!isEditLocked && (
                        <button
                          type="button"
                          onClick={toggleAllManageActivities}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer bg-sky-50 text-sky-700 border-sky-200/80 hover:bg-sky-100 hover:border-sky-300 active:scale-95 select-none"
                        >
                          {allManageActivitiesSelected ? (
                            <>
                              <Icons.Close className="w-3.5 h-3.5 text-sky-600" />
                              <span>Deselect All</span>
                            </>
                          ) : (
                            <>
                              <Icons.Check className="w-3.5 h-3.5 text-sky-600" />
                              <span>Select All</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {ACTIVITIES.map((act) => {
                        const selected = manageReg.activities.includes(act.label);
                        return (
                          <div
                            key={act.id}
                            onClick={() => !isEditLocked && toggleManageActivity(act.label)}
                            className={`p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                              isEditLocked ? "cursor-not-allowed opacity-85" : "cursor-pointer"
                            } ${
                              selected
                                ? "bg-sky-50/70 border-sky-400 ring-1 ring-sky-400"
                                : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={isEditLocked}
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

                  {/* Competitions */}
                  <div className="form-group pt-4 border-t border-slate-100">
                    <label className="form-label form-label-required">
                      Competition Preference(s)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                      {COMPETITION_CATEGORIES.map((c) => {
                        const selected = manageReg.competitionCategory.includes(c);
                        return (
                          <div
                            key={c}
                            onClick={() => !isEditLocked && toggleManageCompetitionCategory(c)}
                            className={`p-3.5 rounded-xl border transition-all flex items-center gap-3 ${
                              isEditLocked ? "cursor-not-allowed opacity-85" : "cursor-pointer"
                            } ${
                              selected
                                ? "bg-sky-50/70 border-sky-400 ring-1 ring-sky-400"
                                : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={isEditLocked}
                              checked={selected}
                              onChange={() => {}}
                              className="w-4 h-4 accent-sky-600 flex-shrink-0"
                            />
                            <div className="text-xs font-semibold text-slate-800 leading-snug">{c}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* ── Section 3: Scientific Abstracts (Multiple Abstracts) ── */}
                <div className="card p-6 bg-white border border-slate-200 shadow-sm rounded-2xl space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                          <Icons.File className="w-4 h-4" />
                        </span>
                        <span>Scientific Abstracts</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Manage your submitted abstracts or submit additional research / clinical case papers.
                      </p>
                    </div>

                    {manageAbstracts.length > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold self-start sm:self-center">
                        {manageAbstracts.length} {manageAbstracts.length === 1 ? "Abstract" : "Abstracts"}
                      </span>
                    )}
                  </div>

                  {manageAbstracts.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-slate-50/80 border-2 border-dashed border-slate-200 text-center space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                        <Icons.File className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">No Abstracts Submitted Yet</h4>
                        <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                          You are registered as a festival delegate. You can submit one or more scientific abstracts for presentation at IMF 2026.
                        </p>
                      </div>
                      {!isEditLocked ? (
                        <button
                          type="button"
                          onClick={handleAddManageAbstract}
                          className="btn-primary text-xs py-2.5 px-5 font-bold inline-flex items-center gap-2 cursor-pointer shadow-xs"
                        >
                          <Icons.Plus className="w-4 h-4" />
                          <span>Submit an Abstract Now</span>
                        </button>
                      ) : (
                        <span className="inline-block text-xs font-semibold text-slate-500 bg-slate-100 px-3.5 py-1.5 rounded-xl border border-slate-200">
                          Abstract submission window is closed
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {manageAbstracts.map((abs, idx) => (
                        <div
                          key={abs.id || idx}
                          className="p-5 sm:p-7 rounded-2xl border border-slate-200 bg-slate-50/30 shadow-xs space-y-6 relative"
                        >
                          {/* Header for this abstract */}
                          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                                {idx + 1}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900">
                                {manageAbstracts.length > 1 ? `Abstract #${idx + 1}` : "Scientific Abstract Details"}
                              </h4>
                              {abs.abstractNumber && (
                                <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-mono font-bold text-xs border border-teal-200">
                                  {abs.abstractNumber}
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveManageAbstract(idx)}
                              className="text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Icons.Delete className="w-3.5 h-3.5" />
                              <span>Remove Abstract</span>
                            </button>
                          </div>

                          {/* Section 2 Header */}
                          <div className="flex items-center gap-2 pb-1">
                            <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                            <h5 className="text-xs font-bold uppercase tracking-wider text-teal-800">
                              Section 2 — Abstract Information
                            </h5>
                          </div>

                          {/* 7. Title of the Abstract */}
                          <div className="form-group">
                            <label className="form-label form-label-required" htmlFor={`mAbsTitle-${idx}`}>
                              7. Title of the Abstract
                            </label>
                            <input
                              id={`mAbsTitle-${idx}`}
                              type="text"
                              className="form-input"
                              placeholder="Enter abstract title"
                              value={abs.title}
                              onChange={(e) => updateManageAbstract(idx, "title", e.target.value)}
                              required
                            />
                          </div>

                          {/* 8. Type of Submission & 9. Presentation Category */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="form-group">
                              <label className="form-label form-label-required" htmlFor={`mSubType-${idx}`}>
                                8. Type of Submission
                              </label>
                              <select
                                id={`mSubType-${idx}`}
                                className="form-select"
                                value={abs.submissionType || ""}
                                onChange={(e) => updateManageAbstract(idx, "submissionType", e.target.value)}
                                required
                              >
                                <option value="">—</option>
                                {SUBMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>

                            <div className="form-group">
                              <label className="form-label form-label-required" htmlFor={`mPresCat-${idx}`}>
                                9. Presentation Category
                              </label>
                              <select
                                id={`mPresCat-${idx}`}
                                className="form-select"
                                value={abs.presentationCategory || ""}
                                onChange={(e) => updateManageAbstract(idx, "presentationCategory", e.target.value)}
                                required
                              >
                                <option value="">—</option>
                                {PRESENTATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* 10. Abstract (Paragraph, Required - No min 50 check) */}
                          <div className="form-group">
                            <div className="flex justify-between items-center mb-1">
                              <label className="form-label form-label-required" htmlFor={`mAbsBody-${idx}`}>
                                10. Abstract
                              </label>
                              <span className="text-[11px] text-slate-400">
                                {abs.abstractBody.length} characters
                              </span>
                            </div>
                            <textarea
                              id={`mAbsBody-${idx}`}
                              rows={6}
                              className="form-input text-xs leading-relaxed"
                              placeholder="Type or paste your abstract paragraph here..."
                              value={abs.abstractBody}
                              onChange={(e) => updateManageAbstract(idx, "abstractBody", e.target.value)}
                              required
                            />
                          </div>

                          {/* 11. Keywords */}
                          <div className="form-group">
                            <label className="form-label" htmlFor={`mKeywords-${idx}`}>
                              11. Keywords <span className="text-slate-400 font-normal text-xs ml-1">(Please provide 3–5 keywords)</span>
                            </label>
                            <input
                              id={`mKeywords-${idx}`}
                              type="text"
                              className="form-input"
                              placeholder="e.g. Internal Medicine, Cardiology, Biomarkers"
                              value={abs.keywords}
                              onChange={(e) => updateManageAbstract(idx, "keywords", e.target.value)}
                            />
                          </div>

                          {/* 12. Name of Presenter */}
                          <div className="form-group">
                            <label className="form-label form-label-required" htmlFor={`mPresenter-${idx}`}>
                              12. Name of Presenter
                            </label>
                            <input
                              id={`mPresenter-${idx}`}
                              type="text"
                              className="form-input"
                              placeholder={manageReg.fullName ? `Defaults to: ${manageReg.fullName}` : "Enter name of presenter"}
                              value={abs.presenterName}
                              onChange={(e) => updateManageAbstract(idx, "presenterName", e.target.value)}
                              required
                            />
                          </div>

                          {/* 13. Names of Co-authors */}
                          <div className="form-group">
                            <label className="form-label" htmlFor={`mCoAuthors-${idx}`}>
                              13. Names of Co-authors <span className="text-slate-400 font-normal text-xs ml-1">(If applicable)</span>
                            </label>
                            <textarea
                              id={`mCoAuthors-${idx}`}
                              rows={2}
                              className="form-input text-xs"
                              placeholder="Enter names of co-authors (if applicable)"
                              value={abs.coAuthors}
                              onChange={(e) => updateManageAbstract(idx, "coAuthors", e.target.value)}
                            />
                          </div>

                          {/* 14. Affiliation of Authors */}
                          <div className="form-group">
                            <label className="form-label" htmlFor={`mAuthorAff-${idx}`}>
                              14. Affiliation of Authors
                            </label>
                            <MedicalCollegeInput
                              id={`mAuthorAff-${idx}`}
                              placeholder="Search medical college or enter custom affiliation"
                              value={abs.authorAffiliation || ""}
                              onChange={(val) => updateManageAbstract(idx, "authorAffiliation", val)}
                            />
                            <span className="text-[11px] text-slate-400 mt-1 block">
                              Search from medical colleges list or enter custom affiliation.
                            </span>
                          </div>

                          {/* 15. Name of Faculty Supervisor / Mentor */}
                          <div className="form-group">
                            <label className="form-label" htmlFor={`mSupervisor-${idx}`}>
                              15. Name of Faculty Supervisor / Mentor <span className="text-slate-400 font-normal text-xs ml-1">(If applicable)</span>
                            </label>
                            <input
                              id={`mSupervisor-${idx}`}
                              type="text"
                              className="form-input"
                              placeholder="e.g. Prof. Dr. M. A. Jalil (if applicable)"
                              value={abs.supervisorName}
                              onChange={(e) => updateManageAbstract(idx, "supervisorName", e.target.value)}
                            />
                          </div>

                          {/* Section 3: File Submission */}
                          <div className="pt-6 border-t border-slate-200">
                            <div className="flex items-center gap-2 pb-2 mb-4 border-b border-slate-100">
                              <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                              <h5 className="text-xs font-bold uppercase tracking-wider text-teal-800">
                                Section 3 — File Submission
                              </h5>
                            </div>

                            <div className="form-group">
                              <label className="form-label form-label-required">
                                16. Upload Abstract File
                              </label>
                              <div className="text-[11px] text-slate-500 -mt-1 mb-2">
                                Accepted format: <strong>PDF / DOCX</strong> &bull; Maximum file size: <strong>10 MB</strong>
                              </div>

                              <input
                                type="file"
                                id={`manageAbstractFileInput-${idx}`}
                                accept=".pdf,.docx,.doc"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleManageAbstractFileInstantUpload(idx, file);
                                }}
                              />

                              {abs.uploadError && (
                                <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Icons.Alert className="w-4 h-4 flex-shrink-0 text-rose-500" />
                                    <span>{abs.uploadError}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => updateManageAbstract(idx, "uploadError", "")}
                                    className="text-rose-600 hover:text-rose-800 p-0.5 cursor-pointer"
                                  >
                                    <Icons.Close className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}

                              {abs.isUploading ? (
                                <div className="border-2 border-dashed border-teal-400 rounded-2xl p-6 bg-teal-50/50 text-center animate-fade-in">
                                  <Icons.Spinner className="w-8 h-8 text-teal-600 mx-auto mb-2 animate-spin" />
                                  <p className="text-xs font-bold text-slate-800 mb-1">
                                    Uploading: {abs.fileName} ({(abs.fileSize / 1024 / 1024).toFixed(2)} MB)
                                  </p>
                                  <p className="text-[11px] text-teal-700 font-medium mb-3">
                                    Uploading directly to secure storage…
                                  </p>
                                  <div className="w-full max-w-sm mx-auto">
                                    <div className="flex justify-between text-xs text-slate-600 mb-1.5 font-semibold">
                                      <span>Progress</span>
                                      <span className="text-teal-700 font-bold">{abs.uploadProgress}%</span>
                                    </div>
                                    <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden shadow-inner">
                                      <div
                                        className="h-full bg-teal-600 transition-all duration-200 ease-out rounded-full"
                                        style={{ width: `${abs.uploadProgress}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ) : abs.r2FileKey || abs.fileName ? (
                                <div className="relative border-2 border-emerald-300 rounded-2xl p-6 bg-emerald-50/40 animate-fade-in">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveManageAbstractFile(idx)}
                                    className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 shadow-xs transition-all cursor-pointer"
                                    title="Remove file to reselect"
                                  >
                                    <Icons.Close className="w-4 h-4" />
                                  </button>

                                  <div className="flex flex-col items-center text-center">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2 shadow-xs">
                                      <Icons.Check className="w-5 h-5" />
                                    </div>
                                    <p className="text-xs font-bold text-slate-800">
                                      Attached Manuscript: <span className="text-teal-700 font-bold">{abs.fileName}</span>
                                      {abs.fileSize > 0 && ` (${(abs.fileSize / 1024 / 1024).toFixed(2)} MB)`}
                                    </p>
                                    <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                                      ✓ File stored securely
                                    </p>

                                    <div className="flex items-center gap-2 mt-4">
                                      <button
                                        type="button"
                                        onClick={() => document.getElementById(`manageAbstractFileInput-${idx}`)?.click()}
                                        className="btn-outline text-xs py-1.5 px-4 cursor-pointer"
                                      >
                                        Replace File
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveManageAbstractFile(idx)}
                                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 py-1.5 px-3 cursor-pointer"
                                      >
                                        <Icons.Close className="w-3.5 h-3.5" />
                                        <span>Remove</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const file = e.dataTransfer.files?.[0];
                                    if (file) handleManageAbstractFileInstantUpload(idx, file);
                                  }}
                                  onClick={() => document.getElementById(`manageAbstractFileInput-${idx}`)?.click()}
                                  className="border-2 border-dashed border-slate-300 hover:border-teal-400 rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-teal-50/20 transition-all cursor-pointer"
                                >
                                  <Icons.Upload className="w-7 h-7 text-teal-600 mx-auto mb-2" />
                                  <p className="text-xs font-semibold text-slate-700">
                                    Click to browse or drag &amp; drop your abstract file
                                  </p>
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    PDF (.pdf) or Word document (.docx, .doc) up to 10 MB
                                  </p>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      document.getElementById(`manageAbstractFileInput-${idx}`)?.click();
                                    }}
                                    className="mt-3 btn-outline text-xs py-1.5 px-4 cursor-pointer"
                                  >
                                    Browse Abstract File
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* 17. Upload Poster for this abstract (Optional) */}
                            <div className="form-group pt-4 border-t border-slate-100">
                              <div className="flex items-center justify-between mb-1">
                                <label className="form-label mb-0">
                                  17. Upload Poster for this abstract
                                </label>
                                <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                                  Optional
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 -mt-0.5 mb-2">
                                Accepted formats: <strong>PDF (.pdf) / PowerPoint (.pptx)</strong> &bull; Maximum file size: <strong>50 MB</strong>
                              </div>

                              <input
                                type="file"
                                id={`managePosterFileInput-${idx}`}
                                accept=".pdf,.pptx,.ppt"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleManagePosterFileInstantUpload(idx, file);
                                }}
                              />

                              {abs.presentationUploadError && (
                                <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Icons.Alert className="w-4 h-4 flex-shrink-0 text-rose-500" />
                                    <span>{abs.presentationUploadError}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => updateManageAbstract(idx, "presentationUploadError", "")}
                                    className="text-rose-600 hover:text-rose-800 p-0.5 cursor-pointer"
                                  >
                                    <Icons.Close className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}

                              {abs.isPresentationUploading ? (
                                /* In-progress Instant Upload State */
                                <div className="border-2 border-dashed border-sky-400 rounded-2xl p-6 bg-sky-50/50 text-center animate-fade-in">
                                  <Icons.Spinner className="w-8 h-8 text-sky-600 mx-auto mb-2 animate-spin" />
                                  <p className="text-xs font-bold text-slate-800 mb-1">
                                    Uploading: {abs.presentationFileName} ({(abs.presentationFileSize / 1024 / 1024).toFixed(2)} MB)
                                  </p>
                                  <p className="text-[11px] text-sky-700 font-medium mb-3">
                                    Uploading poster directly to secure storage…
                                  </p>

                                  <div className="w-full max-w-sm mx-auto">
                                    <div className="flex justify-between text-xs text-slate-600 mb-1.5 font-semibold">
                                      <span>Progress</span>
                                      <span className="text-sky-700 font-bold">{abs.presentationUploadProgress}%</span>
                                    </div>
                                    <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden shadow-inner">
                                      <div
                                        className="h-full bg-sky-600 transition-all duration-200 ease-out rounded-full"
                                        style={{ width: `${abs.presentationUploadProgress}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ) : abs.presentationFileKey || abs.presentationFileName ? (
                                /* Completed Upload State */
                                <div className="relative border-2 border-sky-300 rounded-2xl p-6 bg-sky-50/40 animate-fade-in">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveManagePosterFile(idx)}
                                    className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 shadow-xs transition-all cursor-pointer"
                                    title="Remove poster file"
                                  >
                                    <Icons.Close className="w-4 h-4" />
                                  </button>

                                  <div className="flex flex-col items-center text-center">
                                    <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center mb-2 shadow-xs">
                                      <Icons.Check className="w-5 h-5" />
                                    </div>
                                    <p className="text-xs font-bold text-slate-800">
                                      Attached Poster: <span className="text-sky-700 font-bold">{abs.presentationFileName}</span>
                                      {abs.presentationFileSize > 0 && ` (${(abs.presentationFileSize / 1024 / 1024).toFixed(2)} MB)`}
                                    </p>
                                    <p className="text-[11px] text-sky-700 font-medium mt-0.5">
                                      ✓ File stored securely
                                    </p>

                                    <div className="flex items-center gap-2 mt-4">
                                      <button
                                        type="button"
                                        onClick={() => document.getElementById(`managePosterFileInput-${idx}`)?.click()}
                                        className="btn-outline text-xs py-1.5 px-4 cursor-pointer"
                                      >
                                        Replace Poster File
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveManagePosterFile(idx)}
                                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 py-1.5 px-3 cursor-pointer"
                                      >
                                        <Icons.Close className="w-3.5 h-3.5" />
                                        <span>Remove</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                /* Empty Dropzone */
                                <div
                                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const file = e.dataTransfer.files?.[0];
                                    if (file) handleManagePosterFileInstantUpload(idx, file);
                                  }}
                                  onClick={() => document.getElementById(`managePosterFileInput-${idx}`)?.click()}
                                  className="border-2 border-dashed border-slate-300 hover:border-sky-400 rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-sky-50/20 transition-all cursor-pointer"
                                >
                                  <Icons.FileUp className="w-7 h-7 text-sky-600 mx-auto mb-2" />
                                  <p className="text-xs font-semibold text-slate-700">
                                    Click to browse or drag &amp; drop your poster / presentation
                                  </p>
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    PDF (.pdf) or PowerPoint (.pptx) up to 50 MB
                                  </p>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      document.getElementById(`managePosterFileInput-${idx}`)?.click();
                                    }}
                                    className="mt-3 btn-outline text-xs py-1.5 px-4 cursor-pointer"
                                  >
                                    Browse Poster File
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                        </div>
                      ))}

                      {/* + Add Another Abstract Button */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleAddManageAbstract}
                          className="w-full py-3.5 px-4 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/40 text-teal-800 text-xs font-bold hover:bg-teal-50 hover:border-teal-500 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                        >
                          <Icons.Plus className="w-4 h-4 text-teal-600" />
                          <span>+ Add Another Abstract</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Section 4: Background & Inquiries ── */}
                <div className="card p-6 bg-white border border-slate-200 shadow-sm rounded-2xl space-y-5">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                        <Icons.Info className="w-4 h-4" />
                      </span>
                      <span>Background &amp; Inquiries</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Additional information regarding your experience and special inquiries.
                    </p>
                  </div>

                  <div className="space-y-5">
                    {/* 9. Have you previously participated in any academic competition/conference? */}
                    <div className="form-group">
                      <label className="form-label">
                        9. Have you previously participated in any academic competition/conference?
                      </label>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        {["Yes", "No"].map((opt) => {
                          const selected = manageReg.priorExperience === opt;
                          return (
                            <div
                              key={opt}
                              onClick={() => updateManageReg("priorExperience", opt)}
                              className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-center gap-2.5 font-medium text-xs select-none ${
                                selected
                                  ? "bg-teal-50/70 border-teal-600 text-teal-900 shadow-xs ring-1 ring-teal-600"
                                  : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50/50"
                              }`}
                            >
                              <input
                                type="radio"
                                name="managePriorExperienceRadio"
                                checked={selected}
                                onChange={() => updateManageReg("priorExperience", opt)}
                                className="w-4 h-4 accent-teal-600 cursor-pointer"
                              />
                              <span className="font-bold">{opt}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 10. Any questions or special requirements? */}
                    <div className="form-group">
                      <div className="flex justify-between items-center mb-1">
                        <label className="form-label mb-0" htmlFor="mQueries">
                          10. Any questions or special requirements?
                        </label>
                        <span className="text-[11px] text-slate-400 font-medium">Optional</span>
                      </div>
                      <textarea
                        id="mQueries"
                        rows={4}
                        className="form-input text-xs leading-relaxed"
                        placeholder="Optional"
                        value={manageReg.queries}
                        onChange={(e) => updateManageReg("queries", e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Bottom Unified Action Bar ── */}
                {isEditLocked ? (
                  <div className="card p-5 bg-slate-900 text-white border border-slate-800 shadow-xl rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-4 z-20 backdrop-blur-md animate-fade-in">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                        <Icons.Lock className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          Profile &amp; Abstract Editing is Locked
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Delegate profile edits and abstract submissions are closed. Your submitted data is securely saved.
                        </p>
                      </div>
                    </div>
                    <span className="px-3.5 py-1.5 rounded-xl bg-amber-400/10 text-amber-300 border border-amber-400/20 text-xs font-bold whitespace-nowrap">
                      View-Only Mode
                    </span>
                  </div>
                ) : (
                  <div className="card p-6 bg-gradient-to-r from-sky-900 via-slate-900 to-teal-950 text-white border border-sky-800/40 shadow-xl rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-5 sticky bottom-4 z-20 backdrop-blur-md">
                    <div>
                      <h4 className="text-base font-bold text-white flex items-center gap-2">
                        <Icons.Check className="w-5 h-5 text-emerald-400" />
                        <span>{isManageDirty ? "Ready to Save Your Changes?" : "No Unsaved Changes"}</span>
                      </h4>
                      <p className="text-xs text-slate-300 mt-1">
                        {isManageDirty
                          ? "You have unsaved modifications. All changes across your delegate profile, segments, and abstracts will be saved together."
                          : "No modifications detected. Edit any profile information or abstracts above to enable saving."}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveAllManage}
                      disabled={manageSaving || !isManageDirty}
                      className={`btn-primary text-sm py-3.5 px-8 font-bold flex items-center justify-center gap-2.5 shadow-lg transition-all flex-shrink-0 w-full sm:w-auto ${
                        !isManageDirty
                          ? "bg-slate-700/60 text-slate-400 border border-slate-600/50 cursor-not-allowed opacity-50 shadow-none hover:bg-slate-700/60"
                          : "bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white border-0 cursor-pointer hover:shadow-xl active:scale-[0.99]"
                      }`}
                      title={!isManageDirty ? "Make changes above to enable saving" : "Click to save all changes"}
                    >
                      {manageSaving ? (
                        <>
                          <Icons.Spinner className="w-4 h-4 animate-spin" />
                          <span>Saving All Changes…</span>
                        </>
                      ) : (
                        <>
                          <Icons.Check className="w-4 h-4" />
                          <span>{isManageDirty ? "Save All Changes" : "No Changes to Save"}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* ── Save Successful Modal Popup (Rendered via Portal to document.body for true full-page overlay) ── */}
                {showSaveSuccessModal && typeof document !== "undefined" && createPortal(
                  <div
                    className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) setShowSaveSuccessModal(false);
                    }}
                  >
                    <div
                      className="relative w-full max-w-sm bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 text-center animate-slide-up space-y-4"
                      role="dialog"
                      aria-modal="true"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Success Icon */}
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center ring-8 ring-emerald-50 shadow-xs">
                        <Icons.Check className="w-8 h-8 stroke-[2.5]" />
                      </div>

                      {/* Title & Description */}
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-900">
                          Save Successful!
                        </h3>
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                          Your delegate profile, festival segments, and scientific abstracts have been updated and saved successfully.
                        </p>
                        <p className="text-[11px] text-teal-700 bg-teal-50 border border-teal-200/80 rounded-xl p-2.5 mt-2 leading-relaxed">
                          An email itemizing all changes made has been dispatched to <strong>{manageData?.registration?.email}</strong>.
                        </p>
                      </div>

                      {/* Registration Info Summary */}
                      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 flex flex-col gap-1.5 text-left font-medium">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Delegate ID:</span>
                          <strong className="font-mono text-teal-800 font-bold bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                            {manageData?.registration?.regNumber}
                          </strong>
                        </div>
                        {manageAbstracts.length > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Abstracts:</span>
                            <strong className="text-slate-800">
                              {manageAbstracts.length} {manageAbstracts.length === 1 ? "Abstract" : "Abstracts"} Saved
                            </strong>
                          </div>
                        )}
                      </div>

                      {/* OK Button */}
                      <button
                        type="button"
                        onClick={() => setShowSaveSuccessModal(false)}
                        className="btn-primary w-full py-3 text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white"
                        autoFocus
                      >
                        OK
                      </button>
                    </div>
                  </div>,
                  document.body
                )}

              </div>
            )}

          </div>
        )}

      </main>

      <Footer
        onOpenAdmin={() => navigate("/admin")}
        onOpenRegister={() => { setActiveTab("register"); setStep(0); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        onOpenAbstract={() => { setActiveTab("register"); setForm((f) => ({ ...f, submitAbstract: true })); setStep(0); window.scrollTo({ top: 0, behavior: "smooth" }); }}
      />
    </div>
  );
}
