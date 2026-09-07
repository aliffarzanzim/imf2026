// src/pages/Admin.js
import React, { useState } from "react";
import { Header } from "../components/Header";
import { AdminTable } from "../components/AdminTable";
import { adminLogin, adminLogout, isAdminLoggedIn } from "../utils/api";
import { Icons } from "../assets/icons";

export function Admin() {
  const [authed, setAuthed] = useState(isAdminLoggedIn());
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!password) {
      setError("Please enter the admin password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await adminLogin(password);
      setAuthed(true);
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
    <div className="min-h-screen bg-[var(--color-bg)]">
      <Header
        onOpenAdmin={() => {}}
        onHome={() => { window.location.hash = "#/"; }}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!authed ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <div className="w-full max-w-md bg-white rounded-2xl border border-[var(--color-border)] shadow-xl p-8 backdrop-blur-md">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 shadow-inner">
                  <Icons.Admin className="w-6 h-6" />
                </div>
                <h1 className="text-2xl font-bold text-[var(--color-text-main)]">
                  Admin Portal
                </h1>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Internal Medicine Festival 2026 Admin Management
                </p>
              </div>

              {error && (
                <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
                  <Icons.Close className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="form-group">
                  <label className="form-label" htmlFor="admin-pass">
                    Admin Password
                  </label>
                  <div className="relative">
                    <input
                      id="admin-pass"
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter secret password"
                      className="form-input pr-10"
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPass ? (
                        <Icons.Close className="w-4 h-4" />
                      ) : (
                        <Icons.Search className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary py-3 flex items-center justify-center gap-2 font-semibold shadow-md"
                >
                  {loading ? (
                    <>
                      <Icons.Spinner className="w-4 h-4 animate-spin" />
                      Verifying…
                    </>
                  ) : (
                    <>
                      <Icons.Check className="w-4 h-4" />
                      Access Dashboard
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => { window.location.hash = "#/"; }}
                  className="text-xs text-[var(--color-text-muted)] hover:text-indigo-600 transition-colors"
                >
                  ← Back to Public Registration
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-main)]">
                  Festival Control Panel
                </h1>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Live attendee registrations, scientific abstracts, and bulk exports
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { window.location.hash = "#/"; }}
                  className="btn-outline text-xs px-3.5 py-2 flex items-center gap-1.5"
                >
                  ← Public View
                </button>
                <button
                  onClick={handleLogout}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1.5"
                >
                  <Icons.Close className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>

            <AdminTable />
          </div>
        )}
      </main>
    </div>
  );
}
