// src/components/OrganisersModal.jsx
import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../assets/icons";
import { updateDelegateRole } from "../utils/api";

export function OrganisersModal({ registrations = [], onClose, onRoleUpdated }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOrganiserQuery, setFilterOrganiserQuery] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Close on Escape key
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

  const safeRegistrations = useMemo(() => {
    return Array.isArray(registrations) ? registrations : [];
  }, [registrations]);

  // Current Organisers list (ascending order by ID: 0001, 0040, 0043...)
  const currentOrganisers = useMemo(() => {
    return safeRegistrations
      .filter((r) => r && (r.role === "ORGANISER" || r.role === "Organiser"))
      .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  }, [safeRegistrations]);

  // Filtered Organisers within modal
  const filteredOrganisers = useMemo(() => {
    if (!filterOrganiserQuery.trim()) return currentOrganisers;
    const q = filterOrganiserQuery.toLowerCase().trim();
    return currentOrganisers.filter(
      (r) =>
        r &&
        ((r.full_name || "").toLowerCase().includes(q) ||
        (r.reg_number || "").toLowerCase().includes(q) ||
        (r.institution || "").toLowerCase().includes(q) ||
        (r.batch || "").toLowerCase().includes(q))
    );
  }, [currentOrganisers, filterOrganiserQuery]);

  // Candidates for Organisers: ONLY existing participants can become organisers
  const candidateParticipants = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return [];
    const q = searchQuery.toLowerCase().trim();
    return safeRegistrations
      .filter((r) => r && r.role !== "ORGANISER" && r.role !== "Organiser")
      .filter(
        (r) =>
          (r.full_name || "").toLowerCase().includes(q) ||
          (r.reg_number || "").toLowerCase().includes(q) ||
          (r.email || "").toLowerCase().includes(q) ||
          (r.institution || "").toLowerCase().includes(q) ||
          (r.batch || "").toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [safeRegistrations, searchQuery]);

  // Handle Promote to Organiser
  async function handlePromote(record) {
    setError("");
    setSuccessMsg("");
    setUpdatingId(record.id);
    try {
      await updateDelegateRole(record.id, "ORGANISER");
      if (onRoleUpdated) {
        onRoleUpdated(record.id, "ORGANISER");
      }
      setSuccessMsg(`"${record.full_name}" (${record.reg_number}) promoted to Organiser.`);
      setSearchQuery("");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      setError(err.message || "Failed to appoint organiser.");
    } finally {
      setUpdatingId(null);
    }
  }

  // Handle Demote back to Participant
  async function handleDemote(record) {
    setError("");
    setSuccessMsg("");
    setUpdatingId(record.id);
    try {
      await updateDelegateRole(record.id, "PARTICIPANT");
      if (onRoleUpdated) {
        onRoleUpdated(record.id, "PARTICIPANT");
      }
      setSuccessMsg(`"${record.full_name}" reverted to Participant.`);
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      setError(err.message || "Failed to remove organiser.");
    } finally {
      setUpdatingId(null);
    }
  }

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
        {/* Modal Top Ambient Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 text-white relative overflow-hidden flex-shrink-0">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-start justify-between relative z-10 gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-300">
                  Festival Leadership &amp; Crew
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>Festival Organisers</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-400 text-slate-950 shadow-xs">
                  {currentOrganisers.length}
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-md">
                For Organiser Id card generation and verification
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
              title="Close modal"
            >
              <Icons.Close className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <Icons.Alert className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <Icons.Check className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Body (Scrollable) */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* 1. Appoint New Organiser Section */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Icons.Plus className="w-4 h-4 text-emerald-600" />
                <span>Appoint New Organiser</span>
              </label>
              <span className="text-[10px] font-semibold text-slate-400">
                Only registered participants can be appointed
              </span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type name, reg number (e.g. IMF-REG-0006), or college..."
                className="w-full pl-9 pr-8 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <Icons.Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <Icons.Close className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Candidate Search Dropdown / Results */}
            {searchQuery.trim().length >= 2 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-md divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {candidateParticipants.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400">
                    No matching non-organiser participants found.
                  </div>
                ) : (
                  candidateParticipants.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="p-2.5 px-3 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {candidate.full_name}
                          </span>
                          <span className="font-mono text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded">
                            {candidate.reg_number}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">
                          {candidate.institution} &bull; {candidate.batch} ({candidate.academic_year})
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={updatingId === candidate.id}
                        onClick={() => handlePromote(candidate)}
                        className="btn-primary py-1.5 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1 shadow-xs shrink-0"
                      >
                        {updatingId === candidate.id ? (
                          <Icons.Spinner className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Icons.Plus className="w-3.5 h-3.5" />
                        )}
                        <span>Make Organiser</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 2. Current Organisers Section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <span>Active Organisers List</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {filteredOrganisers.length} of {currentOrganisers.length}
                </span>
              </h3>

              {currentOrganisers.length > 3 && (
                <div className="relative w-full sm:w-56">
                  <input
                    type="text"
                    value={filterOrganiserQuery}
                    onChange={(e) => setFilterOrganiserQuery(e.target.value)}
                    placeholder="Filter organisers..."
                    className="w-full pl-7 pr-6 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <Icons.Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {filterOrganiserQuery && (
                    <button
                      type="button"
                      onClick={() => setFilterOrganiserQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <Icons.Close className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {currentOrganisers.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-2.5">
                  <Icons.Badge className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-700">No Organisers Assigned</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm mx-auto">
                  Search any registered participant above to appoint them as a Festival Organiser.
                </p>
              </div>
            ) : filteredOrganisers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                No organisers match &ldquo;{filterOrganiserQuery}&rdquo;
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white shadow-xs">
                {filteredOrganisers.map((org) => (
                  <div
                    key={org.id}
                    className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-emerald-50/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-800 to-teal-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                        {org.full_name ? org.full_name.charAt(0).toUpperCase() : "O"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-xs text-slate-900 truncate">
                            {org.full_name}
                          </span>
                          <span className="font-mono text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                            ORGANISER
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {org.reg_number}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {org.institution} &bull; <span className="text-slate-700 font-semibold">{org.batch}</span> ({org.academic_year})
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={updatingId === org.id}
                      onClick={() => handleDemote(org)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition-all flex items-center gap-1 shrink-0"
                      title="Remove as Organiser (revert to Participant)"
                    >
                      {updatingId === org.id ? (
                        <Icons.Spinner className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Icons.Delete className="w-3 h-3" />
                      )}
                      <span>Remove</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5 text-slate-500">
            <Icons.Info className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Removing an organiser immediately reverts their role back to <strong>Participant</strong>.</span>
          </span>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
