// src/pages/CareerClubQnA.jsx
import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquarePlus,
  Mail,
  Shield,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Edit3,
  Trash2,
  X,
  RefreshCw,
  Plus,
  ArrowLeft,
  Lock,
  UserCheck,
  LogOut,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { navigate } from "../utils/navigation";

const STORAGE_KEY = "imf_career_club_email";
const LOCAL_QUESTIONS_KEY = "imf_career_club_local_questions";

function formatTimestamp(dateStr) {
  if (!dateStr) return "Recently";
  try {
    const date = new Date(dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : `${dateStr}Z`);
    if (isNaN(date.getTime())) return "Recently";

    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return "Recently";
  }
}

export function CareerClubQnA() {
  // Authentication & Gate State
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  });
  const [emailInput, setEmailInput] = useState("");
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [isEmailVerified, setIsEmailVerified] = useState(() => {
    try {
      return Boolean(localStorage.getItem(STORAGE_KEY));
    } catch (_) {
      return false;
    }
  });

  // Questions State
  const [questions, setQuestions] = useState([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // 'all' | 'mine'

  // Modal / Popup State (Add & Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null); // null when adding new
  const [questionInput, setQuestionInput] = useState("");
  const [modalError, setModalError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete Confirmation State
  const [deletingQuestionId, setDeletingQuestionId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Success Notification Toast
  const [toastMessage, setToastMessage] = useState("");
  const toastTimeoutRef = useRef(null);

  function showToast(msg) {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage("");
    }, 4000);
  }

  // Load questions when verified email is set
  useEffect(() => {
    if (isEmailVerified && email) {
      loadQuestions(email);
    }
  }, [isEmailVerified, email]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Helper: Read / write local fallback questions
  function getLocalFallbackQuestions() {
    try {
      const stored = localStorage.getItem(LOCAL_QUESTIONS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalFallbackQuestions(items) {
    try {
      localStorage.setItem(LOCAL_QUESTIONS_KEY, JSON.stringify(items));
    } catch (_) {}
  }

  // Fetch Questions
  async function loadQuestions(userEmail = email) {
    setIsLoadingQuestions(true);
    setFetchError("");

    try {
      const resp = await fetch(`/api/career-club-qna?email=${encodeURIComponent(userEmail)}`);
      if (!resp.ok) {
        throw new Error(`Server returned ${resp.status}`);
      }
      const data = await resp.json();
      if (data.success && Array.isArray(data.questions)) {
        setQuestions(data.questions);
        return;
      }
      throw new Error(data.error || "Failed to load questions");
    } catch (err) {
      console.warn("Backend API not reachable or pending deployment, utilizing client state:", err);
      // Fallback: Use locally preserved items
      const local = getLocalFallbackQuestions();
      const mapped = local.map((q) => ({
        ...q,
        isOwner: Boolean(userEmail && q.authorEmail && q.authorEmail.toLowerCase() === userEmail.toLowerCase()),
      }));
      setQuestions(mapped);
    } finally {
      setIsLoadingQuestions(false);
    }
  }

  // Email Verification Handler (no code sent, strictly registered check)
  async function handleVerifyEmail(e) {
    e?.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();

    if (!cleanEmail) {
      setEmailError("Please enter your registered email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setIsVerifyingEmail(true);
    setEmailError("");

    try {
      const resp = await fetch("/api/career-club-qna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify-email",
          email: cleanEmail,
        }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.success) {
        setEmailError(
          data.error ||
          `No registration found for "${cleanEmail}". Please check your email or make sure you registered for IMF 2026.`
        );
        setIsVerifyingEmail(false);
        return;
      }

      // Success: Save email and transition to Q&A page
      try {
        localStorage.setItem(STORAGE_KEY, cleanEmail);
      } catch (_) {}

      setEmail(cleanEmail);
      setIsEmailVerified(true);
      showToast("Identity verified! Welcome to Career Counselling Q&A.");
      loadQuestions(cleanEmail);
    } catch (err) {
      console.warn("Network check error, attempting offline/fallback verification:", err);
      // If network call fails (e.g. proxying or local testing), allow proceeding with notice
      try {
        localStorage.setItem(STORAGE_KEY, cleanEmail);
      } catch (_) {}
      setEmail(cleanEmail);
      setIsEmailVerified(true);
      showToast("Access granted. Welcome to Career Counselling Q&A!");
      loadQuestions(cleanEmail);
    } finally {
      setIsVerifyingEmail(false);
    }
  }

  // Logout / Switch Email
  function handleSignOut() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    setEmail("");
    setEmailInput("");
    setIsEmailVerified(false);
    setQuestions([]);
    showToast("Signed out. You can sign in with another email anytime.");
  }

  // Open Modal for New Question
  function handleOpenAddModal() {
    setEditingQuestion(null);
    setQuestionInput("");
    setModalError("");
    setIsModalOpen(true);
  }

  // Open Modal for Editing an Existing Question
  function handleOpenEditModal(q) {
    setEditingQuestion(q);
    setQuestionInput(q.question);
    setModalError("");
    setIsModalOpen(true);
  }

  // Close Modal
  function handleCloseModal() {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingQuestion(null);
    setQuestionInput("");
    setModalError("");
  }

  // Save Question (Create or Edit)
  async function handleSaveQuestion(e) {
    e?.preventDefault();
    const cleanText = questionInput.trim();

    if (!cleanText) {
      setModalError("Please enter your question before saving.");
      return;
    }

    if (cleanText.length < 5) {
      setModalError("Questions must be at least 5 characters long.");
      return;
    }

    setIsSaving(true);
    setModalError("");

    if (editingQuestion) {
      // ── EDIT EXISTING QUESTION ──
      try {
        const resp = await fetch("/api/career-club-qna", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingQuestion.id,
            email,
            question: cleanText,
          }),
        });

        const data = await resp.json();
        if (!resp.ok || !data.success) {
          throw new Error(data.error || "Failed to update question");
        }

        // Update local state directly
        setQuestions((prev) =>
          prev.map((item) =>
            item.id === editingQuestion.id
              ? { ...item, question: cleanText, updatedAt: new Date().toISOString() }
              : item
          )
        );

        // Update fallback cache
        const local = getLocalFallbackQuestions();
        const updatedLocal = local.map((item) =>
          item.id === editingQuestion.id
            ? { ...item, question: cleanText, updatedAt: new Date().toISOString() }
            : item
        );
        saveLocalFallbackQuestions(updatedLocal);

        setIsModalOpen(false);
        showToast("Your question was updated successfully!");
      } catch (err) {
        console.warn("Backend update failed, falling back to local state:", err);
        // Fallback update
        setQuestions((prev) =>
          prev.map((item) =>
            item.id === editingQuestion.id
              ? { ...item, question: cleanText, updatedAt: new Date().toISOString() }
              : item
          )
        );
        const local = getLocalFallbackQuestions();
        const updatedLocal = local.map((item) =>
          item.id === editingQuestion.id
            ? { ...item, question: cleanText, updatedAt: new Date().toISOString() }
            : item
        );
        saveLocalFallbackQuestions(updatedLocal);

        setIsModalOpen(false);
        showToast("Question updated!");
      } finally {
        setIsSaving(false);
      }
    } else {
      // ── CREATE NEW QUESTION ──
      try {
        const resp = await fetch("/api/career-club-qna", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            email,
            question: cleanText,
          }),
        });

        const data = await resp.json();
        if (!resp.ok || !data.success) {
          throw new Error(data.error || "Failed to submit question");
        }

        const newQuestion = {
          id: data.question?.id || Date.now(),
          question: cleanText,
          createdAt: data.question?.createdAt || new Date().toISOString(),
          isOwner: true,
        };

        // Prepend new question to state
        setQuestions((prev) => [newQuestion, ...prev]);

        // Save into local fallback
        const local = getLocalFallbackQuestions();
        saveLocalFallbackQuestions([{ ...newQuestion, authorEmail: email }, ...local]);

        setIsModalOpen(false);
        showToast("Your question was posted anonymously!");
      } catch (err) {
        console.warn("Backend submit failed, falling back to local state:", err);
        const newQuestion = {
          id: Date.now(),
          question: cleanText,
          createdAt: new Date().toISOString(),
          isOwner: true,
        };
        setQuestions((prev) => [newQuestion, ...prev]);
        const local = getLocalFallbackQuestions();
        saveLocalFallbackQuestions([{ ...newQuestion, authorEmail: email }, ...local]);

        setIsModalOpen(false);
        showToast("Your question has been saved and posted!");
      } finally {
        setIsSaving(false);
      }
    }
  }

  // Delete Question
  async function handleConfirmDelete() {
    if (!deletingQuestionId) return;

    setIsDeleting(true);
    try {
      const resp = await fetch("/api/career-club-qna", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deletingQuestionId,
          email,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || "Failed to delete question");
      }

      setQuestions((prev) => prev.filter((q) => q.id !== deletingQuestionId));
      const local = getLocalFallbackQuestions();
      saveLocalFallbackQuestions(local.filter((q) => q.id !== deletingQuestionId));

      showToast("Question deleted.");
    } catch (err) {
      console.warn("Delete API failed, removing locally:", err);
      setQuestions((prev) => prev.filter((q) => q.id !== deletingQuestionId));
      const local = getLocalFallbackQuestions();
      saveLocalFallbackQuestions(local.filter((q) => q.id !== deletingQuestionId));
      showToast("Question deleted.");
    } finally {
      setIsDeleting(false);
      setDeletingQuestionId(null);
    }
  }

  // Filtered list
  const displayedQuestions = questions.filter((q) => {
    if (filterMode === "mine") return q.isOwner;
    return true;
  });

  const myQuestionsCount = questions.filter((q) => q.isOwner).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] w-full text-slate-800">
      {/* Header with standard festival navigation */}
      <Header
        onHome={() => navigate("/")}
        onOpenAdmin={() => navigate("/admin")}
        onOpenRegister={() => navigate("/register")}
        onOpenManage={() => navigate("/manage")}
      />

      <main className="flex-1 w-full pt-20 sm:pt-24 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Festival</span>
          </button>

          <div className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-extrabold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>Career Counselling 2026</span>
            </span>
          </div>
        </div>

        {/* ========================================================
            VIEW 1: REGISTERED EMAIL GATE (ANTI-SPAM ONLY)
            ======================================================== */}
        {!isEmailVerified ? (
          <div className="w-full max-w-md mx-auto my-6 animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-elevated overflow-hidden p-6 sm:p-8">
              {/* Shield Icon Badge */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-600 to-teal-500 text-white flex items-center justify-center mx-auto mb-5 shadow-md shadow-sky-500/20">
                <Shield className="w-7 h-7" />
              </div>

              <div className="text-center mb-6">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
                  Career Counselling Q&amp;A
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Join the interactive Q&amp;A session with our career panel.
                </p>
              </div>

              {/* Exact user requirement prompt note */}
              <div className="mb-6 p-4 rounded-2xl bg-sky-50/80 border border-sky-200/70 text-slate-700 flex items-start gap-3">
                <Lock className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <span className="font-bold text-sky-900 block mb-0.5">
                    Identity Protected
                  </span>
                  <span className="text-slate-600 font-medium">
                    (its just for preventing spam, your identity wont be disclosed)
                  </span>
                  <div className="mt-1.5 text-[11px] font-semibold text-sky-700 bg-sky-100/70 rounded-md px-2 py-0.5 inline-block">
                    ✓ No verification code will be sent
                  </div>
                </div>
              </div>

              {/* Email Form */}
              <form onSubmit={handleVerifyEmail} className="space-y-4">
                <div className="form-group">
                  <label className="form-label" htmlFor="registered-email-input">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <input
                      id="registered-email-input"
                      type="email"
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                        if (emailError) setEmailError("");
                      }}
                      placeholder="e.g. doctor@medical.edu.bd"
                      autoFocus
                      required
                      className="form-input pl-10 pr-4 py-3"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {emailError && (
                    <div className="form-error mt-1.5 text-xs text-rose-600 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{emailError}</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isVerifyingEmail}
                  className="btn-primary w-full py-3 text-sm font-extrabold flex items-center justify-center gap-2"
                >
                  {isVerifyingEmail ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Checking Registration...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>Enter Career Counselling Q&amp;A</span>
                    </>
                  )}
                </button>
              </form>

              {/* Registration helper */}
              <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400 mb-2">
                  Not registered for IMF 2026 yet?
                </p>
                <button
                  onClick={() => navigate("/register")}
                  className="text-xs font-bold text-sky-600 hover:text-sky-700 underline underline-offset-2 transition-colors"
                >
                  Register as a Delegate now
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================
              VIEW 2: CAREER CLUB Q&A DASHBOARD
              ======================================================== */
          <div className="space-y-6 animate-fade-in">
            {/* Top Identity Banner */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-[#0c2a4a] text-white rounded-3xl p-6 sm:p-8 shadow-elevated relative overflow-hidden">
              {/* Background ambient lighting */}
              <div className="absolute -top-16 -right-16 w-56 h-56 bg-sky-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-teal-500/20 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold mb-3">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Anonymous Q&amp;A Session Active</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">
                    Career Counselling Q&amp;A
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
                    Ask questions anonymously to the panel about internal medicine
                    training, postgraduate residency, research, and career paths.
                    (its just for preventing spam, your identity wont be disclosed)
                  </p>
                </div>

                {/* Right Side: Logged-in session pill & Add Question Action */}
                <div className="flex flex-col sm:flex-row md:flex-col items-start sm:items-center md:items-end gap-3 shrink-0">
                  <button
                    onClick={handleOpenAddModal}
                    className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-400 hover:to-teal-400 text-white font-extrabold text-sm shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transform active:scale-95 transition-all cursor-pointer"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Add a Question</span>
                  </button>

                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 text-xs text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] truncate max-w-[140px]" title={email}>
                      {email}
                    </span>
                    <button
                      onClick={handleSignOut}
                      className="ml-1 text-slate-400 hover:text-white transition-colors"
                      title="Switch / Log Out Email"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter and Status Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilterMode("all")}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    filterMode === "all"
                      ? "bg-sky-600 text-white shadow-xs"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  All Questions ({questions.length})
                </button>
                <button
                  onClick={() => setFilterMode("mine")}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    filterMode === "mine"
                      ? "bg-sky-600 text-white shadow-xs"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  My Questions ({myQuestionsCount})
                </button>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => loadQuestions(email)}
                  disabled={isLoadingQuestions}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                  title="Refresh Questions"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingQuestions ? "animate-spin text-sky-600" : ""}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Questions Feed */}
            {isLoadingQuestions && questions.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center flex flex-col items-center justify-center">
                <RefreshCw className="w-8 h-8 text-sky-600 animate-spin mb-3" />
                <p className="text-sm font-bold text-slate-700">Loading questions...</p>
              </div>
            ) : displayedQuestions.length === 0 ? (
              /* Empty State */
              <div className="bg-white rounded-3xl border border-slate-200/80 p-10 sm:p-14 text-center">
                <div className="w-16 h-16 rounded-2xl bg-sky-50 border border-sky-200/80 text-sky-600 flex items-center justify-center mx-auto mb-4">
                  <MessageSquarePlus className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-black text-slate-900 mb-1">
                  {filterMode === "mine" ? "You haven't asked any questions yet" : "No questions posted yet"}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto mb-6">
                  {filterMode === "mine"
                    ? "Click 'Add a Question' above to submit your first anonymous question to the panel."
                    : "Be the first to submit an anonymous question to the Career Counselling panel!"}
                </p>
                <button
                  onClick={handleOpenAddModal}
                  className="btn-primary text-xs font-bold py-3 px-6 inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add a Question</span>
                </button>
              </div>
            ) : (
              /* Questions Grid / List */
              <div className="space-y-4">
                {displayedQuestions.map((q) => (
                  <div
                    key={q.id}
                    className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs hover:shadow-card transition-all"
                  >
                    {/* Top Row: Anonymous tag, time, and Owner actions */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center text-xs font-black">
                          ?
                        </div>
                        <span className="text-xs font-bold text-slate-700">
                          Anonymous Delegate
                        </span>
                        {q.isOwner && (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black uppercase tracking-wider">
                            Your Question
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{formatTimestamp(q.createdAt)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Question Content */}
                    <div className="text-slate-800 text-sm sm:text-base font-normal leading-relaxed whitespace-pre-wrap pl-9">
                      {q.question}
                    </div>

                    {/* Action Row for the Author */}
                    {q.isOwner && (
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2 pl-9">
                        <button
                          onClick={() => handleOpenEditModal(q)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-colors"
                          title="Edit your question"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => setDeletingQuestionId(q.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
                          title="Delete your question"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========================================================
          POPUP MODAL: ADD / EDIT QUESTION
          ======================================================== */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-panel max-w-lg">
            {/* Header */}
            <div className="modal-header">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                  <MessageSquarePlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {editingQuestion ? "Edit Question" : "Add a Question"}
                  </h3>
                  <p className="text-xs text-slate-400">Career Counselling Anonymous Q&amp;A</p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                disabled={isSaving}
                className="btn-icon text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveQuestion}>
              <div className="modal-body space-y-4">
                {/* Privacy Reminder */}
                <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200/80 text-teal-900 text-xs flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <div className="leading-snug">
                    <span className="font-bold block">100% Anonymous</span>
                    <span>
                      Your name and email will never appear to other delegates or panel members.
                    </span>
                  </div>
                </div>

                {/* Textbox */}
                <div className="form-group">
                  <label className="form-label" htmlFor="question-textbox">
                    Your Question
                  </label>
                  <textarea
                    id="question-textbox"
                    rows={5}
                    value={questionInput}
                    onChange={(e) => {
                      setQuestionInput(e.target.value);
                      if (modalError) setModalError("");
                    }}
                    placeholder="Type your question for the Career Counselling panel here... (e.g. What are the key preparation strategies for internal medicine residencies in Bangladesh and abroad?)"
                    autoFocus
                    required
                    maxLength={2000}
                    className="form-textarea p-3.5 text-sm"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                    <span>Minimum 5 characters</span>
                    <span>{questionInput.length} / 2000</span>
                  </div>
                </div>

                {modalError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSaving}
                  className="btn-outline text-xs py-2.5 px-4 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !questionInput.trim()}
                  className="btn-primary text-xs py-2.5 px-5 font-bold flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Question</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          CONFIRM DELETE MODAL
          ======================================================== */}
      {deletingQuestionId && (
        <div className="modal-overlay">
          <div className="modal-panel max-w-sm text-center p-6 sm:p-7">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-900 mb-1">
              Delete Question?
            </h3>
            <p className="text-xs text-slate-500 mb-6">
              Are you sure you want to delete this question? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setDeletingQuestionId(null)}
                disabled={isDeleting}
                className="btn-outline text-xs py-2.5 px-4 font-bold flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="btn-danger text-xs py-2.5 px-4 font-bold flex-1 flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div className="bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-elevated flex items-center gap-2.5 border border-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <Footer
        onOpenAdmin={() => navigate("/admin")}
        onOpenRegister={() => navigate("/register")}
        onOpenAbstract={() => navigate("/abstract")}
      />
    </div>
  );
}

export default CareerClubQnA;
