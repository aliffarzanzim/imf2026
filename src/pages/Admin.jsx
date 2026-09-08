// src/pages/Admin.jsx
import React, { useState, useEffect } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { AdminTable } from "../components/AdminTable";
import { ActivityParticipationModal } from "../components/ActivityParticipationModal";
import { AdminConfigModal } from "../components/AdminConfigModal";
import { adminLogin, adminLogout, isAdminAuthed } from "../utils/api";
import { Icons } from "../assets/icons";
import { navigate } from "../utils/navigation";

export function Admin() {
  const [authed, setAuthed] = useState(isAdminAuthed());
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [adminData, setAdminData] = useState({ registrations: [], abstracts: [] });
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  useEffect(() => {
    setAuthed(isAdminAuthed());
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter the admin password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await adminLogin(password);
      setAuthed(true);
      setPassword("");
    } catch (err) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    adminLogout();
    setAuthed(false);
    setPassword("");
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      <Header
        onOpenAdmin={() => {}}
        onHome={() => navigate("/")}
        onOpenRegister={() => navigate("/register")}
      />

      <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-20 sm:pt-24 pb-16 w-full overflow-hidden">
        {!authed ? (
          /* ── Modern Slick Login Gate ── */
          <div className="flex flex-col items-center justify-center min-h-[65vh] px-2 sm:px-4">
            <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-elevated p-6 sm:p-8 relative overflow-hidden animate-fade-in">
              {/* Top ambient color glow */}
              <div className="absolute -top-12 -left-12 w-40 h-40 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -top-12 -right-12 w-40 h-40 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex flex-col items-center text-center mb-7 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-sky-500/20 mb-3.5">
                  <Icons.Stethoscope className="w-6 h-6" />
                </div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  Festival Control Panel
                </h1>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Administrative dashboard for attendee records, scientific abstracts, and live reporting.
                </p>
              </div>

              {error && (
                <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 animate-fade-in">
                  <Icons.Alert className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4 relative z-10">
                <div className="form-group">
                  <label className="form-label" htmlFor="admin-pass">
                    Admin Access Key
                  </label>
                  <div className="relative">
                    <input
                      id="admin-pass"
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter administrator password"
                      className="form-input pr-10 text-sm py-3"
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      title={showPass ? "Hide password" : "Show password"}
                    >
                      {showPass ? (
                        <Icons.EyeOff className="w-4 h-4" />
                      ) : (
                        <Icons.Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary py-3.5 text-sm font-bold shadow-md flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Icons.Spinner className="w-4 h-4 animate-spin" />
                      Authenticating…
                    </>
                  ) : (
                    <>
                      <span>Enter Control Panel</span>
                      <Icons.Back className="w-4 h-4 rotate-180" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center border-t border-slate-100 pt-4">
                <button
                  onClick={() => navigate("/")}
                  className="text-xs font-semibold text-slate-500 hover:text-sky-600 transition-colors"
                >
                  ← Return to Public Portal
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ── Authenticated Control Panel ── */
          <div className="space-y-6 animate-fade-in">
            {/* Top Bar */}
            <div className="card p-5 sm:p-6 bg-gradient-to-r from-slate-900 to-sky-950 text-white border-0 shadow-elevated">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-teal-300">
                      Live Production Environment
                    </span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    Festival Control Panel
                  </h1>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Internal Medicine Festival 2026 • Real-time attendee records & scientific abstracts
                  </p>
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowActivityModal(true)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-400/30 transition-all flex items-center gap-1.5 shadow-sm"
                    title="View detailed activity and competition breakdown"
                  >
                    <Icons.Activity className="w-3.5 h-3.5 text-teal-400" />
                    <span>Activity &amp; Participation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(true)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all flex items-center gap-1.5 shadow-xs"
                    title="Portal access & feature toggles"
                  >
                    <Icons.Config className="w-3.5 h-3.5 text-slate-300" />
                    <span>Config</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-400/30 transition-all flex items-center gap-1.5"
                  >
                    <Icons.Logout className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Main Interactive Table & Stats */}
            <AdminTable onDataLoaded={setAdminData} />

            {/* Activity & Participation Modal */}
            {showActivityModal && (
              <ActivityParticipationModal
                registrations={adminData.registrations}
                onClose={() => setShowActivityModal(false)}
              />
            )}

            {/* Config & Access Control Modal */}
            {showConfigModal && (
              <AdminConfigModal
                onClose={() => setShowConfigModal(false)}
              />
            )}
          </div>
        )}
      </main>

      <Footer
        onOpenAdmin={() => {}}
        onOpenRegister={() => navigate("/register")}
        onOpenAbstract={() => navigate("/abstract")}
      />

    </div>
  );
}
