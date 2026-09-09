// src/components/AdminTable.jsx
import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../assets/icons";
import {
  fetchAdminRecords,
  updateRegistration,
  updateDelegateRole,
  deleteRecord,
  getAdminDownloadUrl,
  getAdminToken,
} from "../utils/api";
import {
  exportMergedDelegatesExcel,
  exportMergedDelegatesCSV,
} from "../utils/export";
import { formatBdtDate, formatBdtTime, formatBdtDateTime } from "../utils/timezone";
import { MedicalCollegeInput } from "./MedicalCollegeInput";

const BATCHES = ["K-78", "K-79", "K-80", "K-81", "K-82", "K-83", "Other"];

const TOTAL_ACTIVITIES = 9;
const TOTAL_COMPETITIONS = 6;

function parseActivities(act) {
  if (!act) return [];
  let list = [];
  if (Array.isArray(act)) {
    list = act.filter(Boolean);
  } else if (typeof act === "string") {
    const trimmed = act.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed.filter(Boolean);
      } catch (_) {}
    }
    if (list.length === 0) {
      list = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return list.filter((a) => a && !a.toLowerCase().includes("olympiad"));
}

function parseCompetitions(comp) {
  if (!comp) return [];
  let list = [];
  if (Array.isArray(comp)) {
    list = comp;
  } else if (typeof comp === "string") {
    const trimmed = comp.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed;
      } catch (_) {}
    }
    if (list.length === 0) {
      list = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return list.filter(
    (c) =>
      c &&
      !c.toLowerCase().includes("not participating") &&
      !c.toLowerCase().includes("attendee only")
  );
}

const BATCH_COLORS = {
  "K-78": "bg-rose-50 text-rose-700 border-rose-200",
  "K-79": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "K-80": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "K-81": "bg-sky-50 text-sky-700 border-sky-200",
  "K-82": "bg-amber-50 text-amber-700 border-amber-200",
  "K-83": "bg-purple-50 text-purple-700 border-purple-200",
  "Other": "bg-slate-100 text-slate-700 border-slate-200",
};

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function StatCard({ label, value, sub, icon: Icon, gradient, textColor }) {
  return (
    <div className="card p-4 sm:p-5 bg-white border border-slate-200/80 hover:border-slate-300 hover:shadow-card transition-all flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <div className={`w-9 h-9 rounded-xl ${gradient} flex items-center justify-center ${textColor}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          {value}
        </span>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/**
 * Full Delegate Profile & Submitted Abstracts Modal
 */
function DelegateDetailModal({ record, abstracts = [], onClose, onEdit, onToggleRole, onDeleteAbstract }) {
  const [activeSubTab, setActiveSubTab] = useState("overview");

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = origOverflow;
    };
  }, [onClose]);

  const activities = Array.isArray(record.activities)
    ? record.activities
    : (record.activities ? [record.activities] : []);

  const token = getAdminToken() || "";
  const isOrganiser = record.role === "ORGANISER" || record.role === "Organiser";

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-sm overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-panel max-w-2xl w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-slide-up">
        
        {/* Header Strip */}
        <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 p-5 sm:p-6 text-white relative flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-teal-400 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-sky-500/20 flex-shrink-0">
                {(record.full_name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    {record.full_name}
                  </h3>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30">
                    {record.reg_number}
                  </span>
                  <span
                    className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border shadow-xs ${
                      isOrganiser
                        ? "bg-amber-400 text-slate-950 border-amber-300 font-extrabold"
                        : "bg-sky-500/20 text-sky-300 border-sky-400/30"
                    }`}
                  >
                    {isOrganiser ? "★ Organiser" : "Participant"}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{record.email}</span>
                  <span>•</span>
                  <span>{record.phone}</span>
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
            >
              <Icons.Close className="w-4 h-4" />
            </button>
          </div>

          {/* Sub-Tabs */}
          <div className="flex items-center gap-2 mt-5 pt-3 border-t border-white/10 text-xs">
            <button
              onClick={() => setActiveSubTab("overview")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeSubTab === "overview"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              Personal &amp; Participation
            </button>
            <button
              onClick={() => setActiveSubTab("abstracts")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                activeSubTab === "abstracts"
                  ? "bg-teal-500 text-white shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <span>Scientific Abstracts</span>
              <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px] font-bold">
                {abstracts.length}
              </span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">
          {activeSubTab === "overview" && (
            <>
              {/* Personal & Academic Details */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <Icons.User className="w-3.5 h-3.5 text-sky-600" />
                  <span>Academic &amp; Contact Details</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Medical College / Institution</span>
                    <span className="font-semibold text-slate-800 text-sm mt-0.5 block">{record.institution}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Batch &amp; Academic Year</span>
                    <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
                      {record.batch} ({record.academic_year || "Not specified"})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Contact Phone</span>
                    <a href={`tel:${record.phone}`} className="font-mono font-semibold text-sky-600 hover:underline mt-0.5 block">
                      {record.phone}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Registered Email</span>
                    <a href={`mailto:${record.email}`} className="font-semibold text-sky-600 hover:underline mt-0.5 block break-all">
                      {record.email}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Registration Timestamp (BDT)</span>
                    <span className="font-medium text-slate-700 mt-0.5 block">
                      {formatBdtDateTime(record.created_at, true)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Abstract Status</span>
                    <span className="font-bold text-teal-700 mt-0.5 block">
                      {abstracts.length > 0 ? `${abstracts.length} Abstract(s) Submitted` : "No Abstracts Submitted"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Festival Participation */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <Icons.Activity className="w-3.5 h-3.5 text-teal-600" />
                  <span>Registered Activities &amp; Events</span>
                </h4>
                {activities.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {activities.map((act, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200/80 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Icons.Check className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                        <span>{act}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Not added</p>
                )}
              </div>

              {/* Competitions / Extra Info */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <Icons.Trophy className="w-3.5 h-3.5 text-amber-600" />
                  <span>Competitions &amp; Additional Information</span>
                </h4>
                <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Competition Category</span>
                    {record.competition_category && record.competition_category.trim() ? (
                      <span className="font-semibold text-slate-800 mt-0.5 block">{record.competition_category}</span>
                    ) : (
                      <span className="text-slate-400 italic text-xs mt-0.5 block">Not added</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Prior Experience</span>
                    {record.prior_experience && record.prior_experience.trim() ? (
                      <p className="text-slate-700 mt-0.5 leading-relaxed">{record.prior_experience}</p>
                    ) : (
                      <p className="text-slate-400 italic text-xs mt-0.5">Not added</p>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Suggestions / Queries / Notes</span>
                    {record.queries && record.queries.trim() ? (
                      <p className="text-slate-700 mt-0.5 leading-relaxed">{record.queries}</p>
                    ) : (
                      <p className="text-slate-400 italic text-xs mt-0.5">Not added</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeSubTab === "abstracts" && (
            <div className="space-y-4">
              {abstracts.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <Icons.Microscope className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700">No Scientific Abstracts</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    This delegate has not submitted any scientific abstracts yet.
                  </p>
                </div>
              ) : (
                abstracts.map((abs, idx) => (
                  <div
                    key={abs.id || idx}
                    className="p-5 rounded-2xl border border-teal-200/80 bg-teal-50/30 space-y-3.5 relative"
                  >
                    {/* Abstract Top */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-300">
                            {abs.abstract_number}
                          </span>
                          {abs.submission_type && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              {abs.submission_type}
                            </span>
                          )}
                          {abs.presentation_category && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                              {abs.presentation_category}
                            </span>
                          )}
                          {abs.created_at && (
                            <span className="text-[11px] font-medium text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-full" title="Submission Time (BDT)">
                              🕒 {formatBdtDateTime(abs.created_at, true)}
                            </span>
                          )}
                        </div>
                        <h4 className="text-base font-bold text-slate-900 mt-2 leading-snug">
                          {abs.title}
                        </h4>
                      </div>

                      {onDeleteAbstract && (
                        <button
                          onClick={() => onDeleteAbstract(abs.id, abs.title)}
                          className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                          title="Delete this abstract"
                        >
                          <Icons.Delete className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-600 bg-white p-3.5 rounded-xl border border-slate-200/70">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Designated Presenter</span>
                        <span className="font-semibold text-slate-800 mt-0.5 block">
                          {abs.presenter_name || record.full_name || <span className="text-slate-400 italic font-normal">Not added</span>}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Faculty Guide / Mentor</span>
                        <span className="font-semibold text-slate-800 mt-0.5 block">
                          {abs.supervisor_name && abs.supervisor_name.trim() ? (
                            abs.supervisor_name
                          ) : (
                            <span className="text-slate-400 italic font-normal">Not added</span>
                          )}
                        </span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Author Affiliation / Institution</span>
                        <span className="font-medium text-slate-700 mt-0.5 block">
                          {abs.author_affiliation && abs.author_affiliation.trim() ? (
                            abs.author_affiliation
                          ) : (
                            <span className="text-slate-400 italic font-normal">Not added</span>
                          )}
                        </span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Co-Authors</span>
                        <span className="font-medium text-slate-700 mt-0.5 block">
                          {abs.co_authors && abs.co_authors.trim() ? (
                            abs.co_authors
                          ) : (
                            <span className="text-slate-400 italic font-normal">Not added</span>
                          )}
                        </span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Keywords</span>
                        <span className="font-medium text-slate-700 mt-0.5 block">
                          {abs.keywords && abs.keywords.trim() ? (
                            abs.keywords
                          ) : (
                            <span className="text-slate-400 italic font-normal">Not added</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Abstract Text Body */}
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Abstract Text</span>
                      {abs.abstract_body && abs.abstract_body.trim() ? (
                        <div className="p-3 bg-white rounded-xl border border-slate-200/70 text-xs text-slate-700 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {abs.abstract_body}
                        </div>
                      ) : (
                        <div className="p-3 bg-white rounded-xl border border-slate-200/70 text-xs text-slate-400 italic">
                          Not added
                        </div>
                      )}
                    </div>

                    {/* Download Buttons */}
                    <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                      {abs.file_name ? (
                        <a
                          href={`/api/admin/file?key=${encodeURIComponent(abs.r2_file_key)}&name=${encodeURIComponent(abs.file_name)}&token=${token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-accent text-xs py-2 px-3 flex items-center gap-1.5 shadow-xs"
                        >
                          <Icons.Download className="w-3.5 h-3.5" />
                          <span>Manuscript: {abs.file_name} ({formatBytes(abs.file_size)})</span>
                        </a>
                      ) : (
                        <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 text-xs italic">
                          Manuscript: Not added
                        </span>
                      )}

                      {abs.presentation_file_name ? (
                        <a
                          href={`/api/admin/file?key=${encodeURIComponent(abs.presentation_file_key)}&name=${encodeURIComponent(abs.presentation_file_name)}&token=${token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5 text-sky-700 hover:border-sky-300"
                        >
                          <Icons.Download className="w-3.5 h-3.5" />
                          <span>Slides: {abs.presentation_file_name}</span>
                        </a>
                      ) : (
                        <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 text-xs italic">
                          Presentation Slides: Not added
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-outline text-xs py-2 px-4"
            >
              Close
            </button>
            {onToggleRole && (
              <button
                type="button"
                onClick={() => onToggleRole(record)}
                className={`text-xs py-2 px-3.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                  isOrganiser
                    ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                }`}
                title={
                  isOrganiser
                    ? "Revert role to standard Participant"
                    : "Appoint delegate as Festival Organiser"
                }
              >
                {isOrganiser ? (
                  <>
                    <Icons.Close className="w-3.5 h-3.5" />
                    <span>Revert to Participant</span>
                  </>
                ) : (
                  <>
                    <Icons.Badge className="w-3.5 h-3.5 text-emerald-200" />
                    <span>Appoint as Organiser</span>
                  </>
                )}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit(record);
            }}
            className="btn-primary text-xs py-2 px-5 flex items-center gap-1.5"
          >
            <Icons.Edit className="w-3.5 h-3.5" />
            <span>Edit Registration</span>
          </button>
        </div>

      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : content;
}

function EditModal({ record, onRoleUpdated, onSave, onClose }) {
  const [form, setForm] = useState({
    fullName:     record.full_name || "",
    institution:  record.institution || "",
    batch:        record.batch || "",
    academicYear: record.academic_year || "",
    phone:        record.phone || "",
    role:         record.role || "PARTICIPANT",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = origOverflow;
    };
  }, [onClose]);

  async function handleSave(e) {
    e?.preventDefault();
    setSaving(true);
    try {
      await updateRegistration(record.id, form);
      if (form.role && form.role !== record.role && typeof onRoleUpdated === "function") {
        onRoleUpdated(record.id, form.role);
      }
      onSave();
    } finally {
      setSaving(false);
    }
  }

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-panel max-w-md w-full p-6 sm:p-8 bg-white rounded-2xl shadow-2xl border border-slate-200 my-auto animate-slide-up">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Edit Registration</h3>
            <span className="text-xs text-sky-600 font-mono font-semibold">{record.reg_number}</span>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <Icons.Close className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="form-input"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Role Designation</label>
            <select
              className="form-select font-semibold"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="PARTICIPANT">Participant (Standard Delegate)</option>
              <option value="ORGANISER">Organiser (Festival Committee)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Medical College</label>
            <MedicalCollegeInput
              placeholder="Search or enter medical college"
              value={form.institution}
              onChange={(val) => setForm((f) => ({ ...f, institution: val }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label">Batch</label>
              <select
                className="form-select"
                value={form.batch}
                onChange={(e) => setForm((f) => ({ ...f, batch: e.target.value }))}
              >
                {BATCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Academic Year</label>
              <input
                type="text"
                className="form-input"
                value={form.academicYear}
                onChange={(e) => setForm((f) => ({ ...f, academicYear: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Contact Phone</label>
            <input
              type="tel"
              className="form-input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" className="btn-outline text-xs py-2 px-4" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs py-2 px-5" disabled={saving}>
              {saving ? (
                <>
                  <Icons.Spinner className="w-3.5 h-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : content;
}

export function AdminTable({ onDataLoaded, onRoleUpdated, externalRoleUpdate }) {
  const [data, setData]               = useState({ registrations: [], abstracts: [] });
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [filterType, setFilterType]   = useState("all"); // "all", "with_abstracts", "no_abstracts"
  const [roleFilter, setRoleFilter]   = useState(""); // "", "organisers", "participants"
  const [search, setSearch]           = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [viewRecord, setViewRecord]   = useState(null);
  const [editRecord, setEditRecord]   = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize]       = useState(25); // 10, 25, 50, 100, 0 for all

  async function load() {
    setLoading(true);
    try {
      const res = await fetchAdminRecords();
      setData(res);
      if (typeof onDataLoaded === "function") {
        onDataLoaded(res);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Sync when external role updates happen (e.g. from OrganisersModal)
  useEffect(() => {
    if (externalRoleUpdate && externalRoleUpdate.id) {
      setData((prev) => ({
        ...prev,
        registrations: (prev.registrations || []).map((r) =>
          r.id === externalRoleUpdate.id ? { ...r, role: externalRoleUpdate.newRole } : r
        ),
      }));
      if (viewRecord && viewRecord.id === externalRoleUpdate.id) {
        setViewRecord((prev) => ({ ...prev, role: externalRoleUpdate.newRole }));
      }
    }
  }, [externalRoleUpdate]);

  async function handleToggleRole(record) {
    const isCurrentlyOrganiser = record.role === "ORGANISER" || record.role === "Organiser";
    const nextRole = isCurrentlyOrganiser ? "PARTICIPANT" : "ORGANISER";
    try {
      await updateDelegateRole(record.id, nextRole);
      setData((prev) => ({
        ...prev,
        registrations: (prev.registrations || []).map((r) =>
          r.id === record.id ? { ...r, role: nextRole } : r
        ),
      }));
      if (viewRecord && viewRecord.id === record.id) {
        setViewRecord((prev) => ({ ...prev, role: nextRole }));
      }
      if (typeof onRoleUpdated === "function") {
        onRoleUpdated(record.id, nextRole);
      }
    } catch (e) {
      setError(e.message || "Failed to update role");
    }
  }

  // Match abstracts to a delegate
  function getAbstractsForDelegate(reg) {
    if (!reg) return [];
    return (data.abstracts || []).filter((a) => {
      const regMatch = a.reg_number && a.reg_number === reg.reg_number;
      const emailMatch = a.email && reg.email && a.email.toLowerCase().trim() === reg.email.toLowerCase().trim();
      return regMatch || emailMatch;
    });
  }

  // Filter delegates by search, batch, role, and abstract status
  const filtered = useMemo(() => {
    return (data.registrations || []).filter((r) => {
      const userAbs = getAbstractsForDelegate(r);
      const absCount = userAbs.length;

      if (filterType === "with_abstracts" && absCount === 0) return false;
      if (filterType === "no_abstracts" && absCount > 0) return false;

      const name = (r.full_name || "").toLowerCase();
      const inst = (r.institution || "").toLowerCase();
      const q    = search.toLowerCase().trim();
      
      const absTitles = userAbs.map((a) => (a.title || "").toLowerCase()).join(" ");
      const absNumbers = userAbs.map((a) => (a.abstract_number || "").toLowerCase()).join(" ");

      const matchSearch =
        !q ||
        name.includes(q) ||
        inst.includes(q) ||
        (r.reg_number || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.phone || "").toLowerCase().includes(q) ||
        (r.competition_category || "").toLowerCase().includes(q) ||
        (r.role || "").toLowerCase().includes(q) ||
        absTitles.includes(q) ||
        absNumbers.includes(q);

      const matchBatch = !batchFilter || r.batch === batchFilter;
      const matchRole =
        !roleFilter ||
        (roleFilter === "organisers" && (r.role === "ORGANISER" || r.role === "Organiser")) ||
        (roleFilter === "participants" && r.role !== "ORGANISER" && r.role !== "Organiser");

      return matchSearch && matchBatch && matchRole;
    });
  }, [data.registrations, data.abstracts, search, batchFilter, roleFilter, filterType]);

  // Reset to page 1 whenever any filter or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, batchFilter, roleFilter, filterType, pageSize]);

  const totalItems = filtered.length;
  const effectivePageSize = pageSize === 0 ? Math.max(1, totalItems) : (Number(pageSize) || 25);
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalItems / effectivePageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedRecords = useMemo(() => {
    if (pageSize === 0) return filtered;
    const startIndex = (validCurrentPage - 1) * effectivePageSize;
    return filtered.slice(startIndex, startIndex + effectivePageSize);
  }, [filtered, validCurrentPage, effectivePageSize, pageSize]);

  async function handleDelete(type, id) {
    try {
      await deleteRecord(type, id);
      setConfirmDelete(null);
      if (viewRecord && type === "abstract") {
        // If viewing delegate whose abstract was deleted, keep view open and refresh data
        await load();
      } else {
        setViewRecord(null);
        await load();
      }
    } catch (e) {
      setError(e.message);
    }
  }

  // Count delegates with abstracts
  const delegatesWithAbstractsCount = useMemo(() => {
    return (data.registrations || []).filter((r) => getAbstractsForDelegate(r).length > 0).length;
  }, [data.registrations, data.abstracts]);

  // Calculate Batch Distribution
  const batchCounts = useMemo(() => {
    const counts = {};
    for (const r of data.registrations || []) {
      counts[r.batch] = (counts[r.batch] || 0) + 1;
    }
    return counts;
  }, [data.registrations]);

  const uniqueColleges = useMemo(() => {
    return new Set(
      [...(data.registrations || []), ...(data.abstracts || [])]
        .map((r) => (r.institution || "").trim().toLowerCase())
        .filter(Boolean)
    ).size;
  }, [data]);

  return (
    <div className="flex flex-col gap-6">

      {/* ── 4 Executive KPI Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Attendees"
          value={(data.registrations || []).length}
          sub="Registered Delegates"
          icon={Icons.Users}
          gradient="bg-sky-50"
          textColor="text-sky-600"
        />
        <StatCard
          label="Abstracts"
          value={(data.abstracts || []).length}
          sub="Scientific Submissions"
          icon={Icons.Microscope}
          gradient="bg-teal-50"
          textColor="text-teal-600"
        />
        <StatCard
          label="With Abstracts"
          value={delegatesWithAbstractsCount}
          sub="Delegates Presenting"
          icon={Icons.Badge}
          gradient="bg-emerald-50"
          textColor="text-emerald-600"
        />
        <StatCard
          label="Colleges"
          value={uniqueColleges}
          sub="Institutions Represented"
          icon={Icons.Institution}
          gradient="bg-amber-50"
          textColor="text-amber-600"
        />
      </div>

      {/* ── Batch Distribution Progress Bar ── */}
      {(data.registrations || []).length > 0 && (
        <div className="card p-4 sm:p-5 bg-white border border-slate-200/80">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2.5">
            <span className="uppercase tracking-wider">Delegate Batch Representation</span>
            <span className="text-slate-400 font-normal">{data.registrations.length} Total</span>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
            {BATCHES.map((b, idx) => {
              const count = batchCounts[b] || 0;
              const pct = (count / data.registrations.length) * 100;
              if (pct === 0) return null;
              const bgColors = [
                "bg-rose-500", "bg-indigo-500", "bg-emerald-500", "bg-sky-500",
                "bg-amber-500", "bg-purple-500", "bg-slate-400"
              ];
              return (
                <div
                  key={b}
                  style={{ width: `${pct}%` }}
                  className={`h-full ${bgColors[idx % bgColors.length]} transition-all duration-300`}
                  title={`${b}: ${count} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 mt-3">
            {BATCHES.map((b) => (
              <div key={b} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${BATCH_COLORS[b] || "bg-slate-100"}`}>
                  {b}
                </span>
                <span className="font-semibold text-slate-800">{batchCounts[b] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Toolbar: Merged Filters, Search, Batch Filter & Exports ── */}
      <div className="card p-3.5 sm:p-5 bg-white border border-slate-200/80 flex flex-col gap-4 overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          
          {/* Left: Filter Buttons (Responsive grid on mobile, flex on sm+) */}
          <div className="grid grid-cols-3 sm:flex p-1 bg-slate-100 rounded-xl w-full sm:w-auto gap-1">
            <button
              onClick={() => setFilterType("all")}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all ${
                filterType === "all"
                  ? "bg-white text-sky-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="hidden md:inline">All Delegates</span>
              <span className="md:hidden">All</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-200/70 text-[10px] text-slate-700 font-extrabold font-mono">
                {(data.registrations || []).length}
              </span>
            </button>
            <button
              onClick={() => setFilterType("with_abstracts")}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all ${
                filterType === "with_abstracts"
                  ? "bg-white text-teal-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="hidden md:inline">With Abstracts</span>
              <span className="md:hidden">Abstracts</span>
              <span className="px-1.5 py-0.5 rounded-full bg-teal-100 text-[10px] text-teal-800 font-extrabold font-mono">
                {delegatesWithAbstractsCount}
              </span>
            </button>
            <button
              onClick={() => setFilterType("no_abstracts")}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all ${
                filterType === "no_abstracts"
                  ? "bg-white text-slate-800 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="hidden md:inline">No Abstracts</span>
              <span className="md:hidden">None</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-200/70 text-[10px] text-slate-700 font-extrabold font-mono">
                {(data.registrations || []).length - delegatesWithAbstractsCount}
              </span>
            </button>
          </div>

          {/* Right: Export Options (With Multiline Abstract Titles in One Cell) */}
          <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-start md:justify-end">
            <button
              onClick={() => exportMergedDelegatesExcel(filtered, data.abstracts)}
              className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5 text-emerald-700 hover:border-emerald-300 font-semibold"
              title="Download Excel report with abstract counts and multiline titles in one cell"
            >
              <Icons.Excel className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>

            <button
              onClick={() => exportMergedDelegatesCSV(filtered, data.abstracts)}
              className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5 text-slate-700 font-semibold"
              title="Download CSV report"
            >
              <Icons.File className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            {(data.abstracts || []).length > 0 && (
              <a
                href={getAdminDownloadUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-accent text-xs py-2 px-3 flex items-center gap-1.5 shadow-xs"
                title="Stream all uploaded manuscript files as single ZIP"
              >
                <Icons.Zip className="w-3.5 h-3.5" />
                <span>ZIP All</span>
              </a>
            )}

            <button
              onClick={load}
              className="btn-icon border border-slate-200 bg-white hover:bg-slate-50"
              title="Refresh database records"
            >
              <Icons.Filter className="w-3.5 h-3.5 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Search & Batch Filters */}
        <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-100">
          <div className="relative flex-1">
            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              className="form-input pl-9 text-xs py-2.5"
              placeholder="Search by name, college, email, phone, ID, or abstract title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <Icons.Close className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            className="form-select text-xs py-2.5 sm:w-40"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All Roles</option>
            <option value="organisers">Organisers Only</option>
            <option value="participants">Participants Only</option>
          </select>

          <select
            className="form-select text-xs py-2.5 sm:w-44"
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
          >
            <option value="">All Batches</option>
            {BATCHES.map((b) => (
              <option key={b} value={b}>
                Batch: {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <Icons.Alert className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Merged Table Container ── */}
      <div className="card overflow-hidden bg-white border border-slate-200/80">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Icons.Spinner className="w-8 h-8 animate-spin text-sky-600" />
            <span className="text-xs font-semibold text-slate-500">Retrieving records from Cloudflare D1…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-400">
            <Icons.File className="w-10 h-10 opacity-30" />
            <span className="text-sm font-bold text-slate-700">No records found</span>
            <span className="text-xs text-slate-400">Try adjusting your search or batch filters.</span>
          </div>
        ) : (
          <>
            {/* Desktop Merged Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="whitespace-nowrap">ID</th>
                    <th>Delegate</th>
                    <th>College</th>
                    <th>Batch</th>
                    <th>Year</th>
                    <th>Contact</th>
                    <th className="text-center">Activities</th>
                    <th className="text-center">Competitions</th>
                    <th className="text-center">Abstracts</th>
                    <th className="whitespace-nowrap">Registered (BDT)</th>
                    <th className="text-right pr-6">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map((r, i) => {
                    const userAbs = getAbstractsForDelegate(r);
                    const absCount = userAbs.length;
                    const actList = parseActivities(r.activities);
                    const compList = parseCompetitions(r.competition_category);
                    const globalIndex = pageSize === 0 ? i + 1 : (validCurrentPage - 1) * effectivePageSize + i + 1;

                    return (
                      <tr key={r.id}>
                        <td className="text-xs text-slate-400 font-mono">{globalIndex}</td>
                        <td className="whitespace-nowrap">
                          <span className="font-mono text-xs font-extrabold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200 whitespace-nowrap inline-block">
                            {r.reg_number}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-500 to-teal-500 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                              {(r.full_name || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 leading-tight">
                                  {r.full_name}
                                </span>
                                {(r.role === "ORGANISER" || r.role === "Organiser") && (
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 tracking-wide uppercase shadow-xs">
                                    ★ Organiser
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400">{r.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-xs text-slate-600 max-w-[150px] truncate">{r.institution}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${BATCH_COLORS[r.batch] || "bg-slate-100"}`}>
                            {r.batch}
                          </span>
                        </td>
                        <td className="text-xs text-slate-600 whitespace-nowrap">{r.academic_year}</td>
                        <td className="text-xs font-mono text-slate-600 whitespace-nowrap">{r.phone}</td>
                        
                        {/* Activities Count Column */}
                        <td className="text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold font-mono ${
                              actList.length > 0
                                ? "bg-sky-50 text-sky-700 border border-sky-200"
                                : "bg-slate-100 text-slate-400 border border-slate-200/60"
                            }`}
                            title={actList.length > 0 ? actList.join(", ") : "No activities selected"}
                          >
                            {actList.length}/{TOTAL_ACTIVITIES}
                          </span>
                        </td>

                        {/* Competitions Count Column */}
                        <td className="text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold font-mono ${
                              compList.length > 0
                                ? "bg-amber-50 text-amber-800 border border-amber-200"
                                : "bg-slate-100 text-slate-400 border border-slate-200/60"
                            }`}
                            title={compList.length > 0 ? compList.join(", ") : "Not participating in competitions"}
                          >
                            {compList.length}/{TOTAL_COMPETITIONS}
                          </span>
                        </td>

                        {/* Abstracts Count Column */}
                        <td className="text-center whitespace-nowrap">
                          {absCount > 0 ? (
                            <button
                              onClick={() => setViewRecord(r)}
                              className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-bold font-mono text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 hover:border-teal-300 transition-all shadow-xs"
                              title={`Click to view ${absCount} abstract(s)`}
                            >
                              {absCount}
                            </button>
                          ) : (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-medium font-mono text-slate-400 bg-slate-100 border border-slate-200/60">
                              0
                            </span>
                          )}
                        </td>

                        <td className="text-[11px] whitespace-nowrap" title={`Registration Time: ${formatBdtDateTime(r.created_at, true)}`}>
                          <div className="font-semibold text-slate-700">
                            {formatBdtDate(r.created_at)}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {formatBdtTime(r.created_at)}
                          </div>
                        </td>

                        {/* Actions Column (Eye, Edit, Delete) */}
                        <td className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            {/* EYE BUTTON — View Full Details */}
                            <button
                              onClick={() => setViewRecord(r)}
                              className="btn-icon hover:bg-teal-50 text-teal-600 hover:text-teal-700"
                              title="View full delegate profile & abstracts"
                            >
                              <Icons.Eye className="w-4 h-4" />
                            </button>

                            {/* EDIT BUTTON */}
                            <button
                              onClick={() => setEditRecord(r)}
                              className="btn-icon hover:bg-sky-50 text-sky-600 hover:text-sky-700"
                              title="Edit registration details"
                            >
                              <Icons.Edit className="w-3.5 h-3.5" />
                            </button>

                            {/* DELETE BUTTON */}
                            <button
                              onClick={() =>
                                setConfirmDelete({
                                  type: "registration",
                                  id: r.id,
                                  name: r.full_name,
                                })
                              }
                              className="btn-icon hover:bg-rose-50 text-rose-600 hover:text-rose-700"
                              title="Delete registration"
                            >
                              <Icons.Delete className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Responsive Cards */}
            <div className="md:hidden divide-y-4 divide-slate-200">
              {paginatedRecords.map((r) => {
                const userAbs = getAbstractsForDelegate(r);
                const absCount = userAbs.length;
                const actList = parseActivities(r.activities);
                const compList = parseCompetitions(r.competition_category);

                return (
                  <div key={r.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-teal-500 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                          {(r.full_name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 leading-tight truncate">
                              {r.full_name}
                            </span>
                            {(r.role === "ORGANISER" || r.role === "Organiser") && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded-md text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300 tracking-wide uppercase shadow-xs">
                                ★ Organiser
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{r.email}</div>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-black text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 flex-shrink-0 whitespace-nowrap">
                        {r.reg_number}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-1">
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 block">College</span>
                        <span className="font-medium text-slate-800 break-words line-clamp-2">{r.institution}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Batch & Year</span>
                        <span className="font-medium text-slate-800 break-words">{r.batch} • {r.academic_year}</span>
                      </div>
                    </div>

                    {/* Participation (Activities & Competitions) */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-slate-500 font-medium block">Activities:</span>
                        <span className="font-bold text-sky-700 font-mono text-xs">{actList.length}/{TOTAL_ACTIVITIES}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium block">Competitions:</span>
                        <span className="font-bold text-amber-700 font-mono text-xs">{compList.length}/{TOTAL_COMPETITIONS}</span>
                      </div>
                    </div>

                    {/* Abstract Count Badge */}
                    <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="text-slate-500 font-medium">Scientific Abstracts:</span>
                      {absCount > 0 ? (
                        <button
                          onClick={() => setViewRecord(r)}
                          className="font-bold text-teal-800 bg-teal-100/80 px-2.5 py-0.5 rounded text-xs hover:bg-teal-200 font-mono"
                          title={`Click to view ${absCount} abstract(s)`}
                        >
                          {absCount}
                        </button>
                      ) : (
                        <span className="text-slate-400 font-semibold font-mono">0</span>
                      )}
                    </div>

                    {/* Mobile Action Buttons */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100 text-xs">
                      <a
                        href={`tel:${r.phone}`}
                        className="text-sky-600 font-bold flex items-center gap-1 py-1 px-1.5 rounded-md hover:bg-sky-50 truncate"
                      >
                        <Icons.Phone className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{r.phone}</span>
                      </a>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => setViewRecord(r)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 flex items-center gap-1"
                        >
                          <Icons.Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => setEditRecord(r)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            setConfirmDelete({
                              type: "registration",
                              id: r.id,
                              name: r.full_name,
                            })
                          }
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Table Footer Summary & Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3.5 border-t border-slate-200 bg-slate-50/80 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            {/* Left: Range and Per-Page Selector */}
            <div className="flex items-center gap-3 flex-wrap">
              <span>
                Showing <strong>{totalItems === 0 ? 0 : (pageSize === 0 ? 1 : (validCurrentPage - 1) * effectivePageSize + 1)}</strong>–<strong>{pageSize === 0 ? totalItems : Math.min(validCurrentPage * effectivePageSize, totalItems)}</strong> of <strong>{totalItems}</strong> {totalItems === 1 ? "delegate" : "delegates"}
                {totalItems !== (data.registrations || []).length && (
                  <span className="text-slate-400 text-[11px] ml-1">
                    (filtered from {(data.registrations || []).length} total)
                  </span>
                )}
              </span>

              <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                <label htmlFor="admin-page-size" className="text-slate-600 font-medium text-xs whitespace-nowrap">
                  Show:
                </label>
                <div className="relative inline-flex items-center">
                  <select
                    id="admin-page-size"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="appearance-none bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-700 font-semibold text-xs rounded-lg pl-2.5 pr-7 py-1 shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={0}>All</option>
                  </select>
                  <span className="pointer-events-none absolute right-2 text-slate-400 flex items-center justify-center">
                    <Icons.ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Page Navigation Controls */}
            {pageSize !== 0 && totalPages > 1 && (
              <div className="flex items-center flex-wrap justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={validCurrentPage === 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-medium hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs shadow-xs"
                  title="First Page"
                >
                  «
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validCurrentPage === 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-medium hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs shadow-xs"
                  title="Previous Page"
                >
                  ‹ Prev
                </button>

                <span className="px-2.5 py-1 font-semibold text-slate-700 font-mono text-xs">
                  Page {validCurrentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={validCurrentPage === totalPages}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-medium hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs shadow-xs"
                  title="Next Page"
                >
                  Next ›
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={validCurrentPage === totalPages}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-medium hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs shadow-xs"
                  title="Last Page"
                >
                  »
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* View Full Delegate Profile & Abstracts Modal */}
      {viewRecord && (
        <DelegateDetailModal
          record={viewRecord}
          abstracts={getAbstractsForDelegate(viewRecord)}
          onClose={() => setViewRecord(null)}
          onEdit={(rec) => { setViewRecord(null); setEditRecord(rec); }}
          onToggleRole={handleToggleRole}
          onDeleteAbstract={(absId, absTitle) => {
            setConfirmDelete({
              type: "abstract",
              id: absId,
              name: absTitle || "Abstract",
            });
          }}
        />
      )}

      {/* Edit Registration Modal */}
      {editRecord && (
        <EditModal
          record={editRecord}
          onRoleUpdated={onRoleUpdated}
          onSave={() => { setEditRecord(null); load(); }}
          onClose={() => setEditRecord(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
        >
          <div className="modal-panel max-w-sm w-full p-6 text-center bg-white rounded-2xl shadow-2xl border border-slate-200 my-auto animate-slide-up">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Icons.Delete className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Delete Record?</h3>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              Are you sure you want to delete <strong>{confirmDelete.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                className="btn-outline text-xs py-2 px-4"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="btn-danger text-xs py-2 px-5 font-bold"
                onClick={() => handleDelete(confirmDelete.type, confirmDelete.id)}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
