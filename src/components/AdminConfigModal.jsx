// src/components/AdminConfigModal.jsx
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../assets/icons";
import { getAdminConfig, updateAdminConfig } from "../utils/api";

export function AdminConfigModal({ onClose, onConfigUpdated }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // States: true = open/active, false = turned off/locked
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [abstractEditOpen, setAbstractEditOpen] = useState(true);
  const [registrationAbstractOnly, setRegistrationAbstractOnly] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    async function loadConfig() {
      setLoading(true);
      try {
        const res = await getAdminConfig();
        if (typeof res.registration_open === "boolean") {
          setRegistrationOpen(res.registration_open);
        }
        if (typeof res.abstract_edit_open === "boolean") {
          setAbstractEditOpen(res.abstract_edit_open);
        }
        if (typeof res.registration_abstract_only === "boolean") {
          setRegistrationAbstractOnly(res.registration_abstract_only);
        }
      } catch (err) {
        setError(err.message || "Failed to load current configuration.");
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  function handleToggleRegistration() {
    setRegistrationOpen((prev) => {
      const next = !prev;
      if (!next) {
        // If turning off registration, automatically turn off abstract-only
        setRegistrationAbstractOnly(false);
      }
      return next;
    });
  }

  function handleToggleRegistrationAbstractOnly() {
    if (!registrationOpen) return;
    setRegistrationAbstractOnly((prev) => !prev);
  }

  async function handleSave(e) {
    if (e) e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const res = await updateAdminConfig({
        registration_open: registrationOpen,
        abstract_edit_open: abstractEditOpen,
        registration_abstract_only: registrationOpen ? registrationAbstractOnly : false,
      });
      setSuccess(true);
      if (onConfigUpdated && res.config) {
        onConfigUpdated(res.config);
      }
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err) {
      setError(err.message || "Failed to save configuration.");
    } finally {
      setSaving(false);
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
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-lg overflow-hidden animate-scale-in flex flex-col">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <Icons.Config className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white">
                Portal Access Configuration
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Toggle intake registration and delegate edit locks
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
            title="Close modal"
          >
            <Icons.Close className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 animate-fade-in">
              <Icons.Alert className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-fade-in font-medium">
              <Icons.Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Configuration updated and saved to live production database!</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Icons.Spinner className="w-6 h-6 animate-spin text-sky-600" />
              <span className="text-xs font-semibold">Loading portal configuration…</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Toggle 1: Registration */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-all space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        New Delegate Registration
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          registrationOpen
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}
                      >
                        {registrationOpen ? "Open / Active" : "Turned Off"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {registrationOpen
                        ? "Registration form is active and accepting new delegate submissions."
                        : "Registration button is inactivated. New delegates cannot submit the form."}
                    </p>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    onClick={handleToggleRegistration}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      registrationOpen ? "bg-emerald-600" : "bg-slate-300"
                    }`}
                    role="switch"
                    aria-checked={registrationOpen}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        registrationOpen ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Toggle 2: Abstract Submission Only Registration (Sub-toggle of Registration) */}
              <div
                className={`p-4 rounded-2xl border transition-all space-y-3 ${
                  !registrationOpen
                    ? "border-slate-200 bg-slate-100/60 opacity-60"
                    : "border-slate-200 bg-slate-50/70 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        Enable Registration for Abstract submission only
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          !registrationOpen
                            ? "bg-slate-100 text-slate-400 border-slate-200"
                            : registrationAbstractOnly
                            ? "bg-purple-50 text-purple-700 border-purple-200 font-extrabold"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {!registrationOpen
                          ? "Disabled (Reg Inactive)"
                          : registrationAbstractOnly
                          ? "Active (Abstract Required)"
                          : "Off (General Reg)"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {!registrationOpen ? (
                        <span className="text-amber-700 font-medium">
                          Can only be enabled when New Delegate Registration is active.
                        </span>
                      ) : registrationAbstractOnly ? (
                        "Delegates cannot complete registration without submitting an abstract. Attendee-only option will be disabled."
                      ) : (
                        "Standard registration: delegates may register as attendee-only or optionally submit an abstract."
                      )}
                    </p>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    disabled={!registrationOpen}
                    onClick={handleToggleRegistrationAbstractOnly}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      !registrationOpen
                        ? "bg-slate-200 cursor-not-allowed"
                        : registrationAbstractOnly
                        ? "bg-purple-600 cursor-pointer"
                        : "bg-slate-300 cursor-pointer"
                    }`}
                    role="switch"
                    aria-checked={registrationAbstractOnly}
                    title={
                      !registrationOpen
                        ? "Activate New Delegate Registration first to enable this option"
                        : "Toggle abstract-only registration requirement"
                    }
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        registrationAbstractOnly && registrationOpen ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Toggle 3: Abstract Submission & Delegate Editing */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-all space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        Abstract Submission &amp; Edit
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          abstractEditOpen
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}
                      >
                        {abstractEditOpen ? "Open / Editable" : "Locked (View-Only)"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {abstractEditOpen
                        ? "Delegates can submit abstracts and edit their registered details after OTP."
                        : "Turned off: fields and abstract submission are locked into View-Only mode."}
                    </p>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => setAbstractEditOpen((prev) => !prev)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      abstractEditOpen ? "bg-teal-600" : "bg-slate-300"
                    }`}
                    role="switch"
                    aria-checked={abstractEditOpen}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        abstractEditOpen ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-outline text-xs py-2 px-4"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
            className="btn-primary text-xs py-2 px-5 font-bold flex items-center gap-2 shadow-xs"
          >
            {saving ? (
              <>
                <Icons.Spinner className="w-3.5 h-3.5 animate-spin" />
                <span>Saving Changes…</span>
              </>
            ) : (
              <span>Save Configuration</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : content;
}
