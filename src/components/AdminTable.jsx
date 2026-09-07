// src/components/AdminTable.jsx
import React, { useState, useEffect, useMemo } from "react";
import { Icons } from "../assets/icons";
import {
  fetchAdminRecords,
  updateRegistration,
  deleteRecord,
  getAdminDownloadUrl,
} from "../utils/api";
import {
  exportRegistrationsExcel,
  exportRegistrationsCSV,
  exportAbstractsExcel,
  exportAbstractsCSV,
} from "../utils/export";
import { MedicalCollegeInput } from "./MedicalCollegeInput";

const BATCHES = ["K-79", "K-80", "K-81", "K-82", "K-83", "Other"];

const BATCH_COLORS = {
  "K-79": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "K-80": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "K-81": "bg-sky-50 text-sky-700 border-sky-200",
  "K-82": "bg-amber-50 text-amber-700 border-amber-200",
  "K-83": "bg-purple-50 text-purple-700 border-purple-200",
  "Other": "bg-slate-100 text-slate-700 border-slate-200",
};

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

function EditModal({ record, onSave, onClose }) {
  const [form, setForm] = useState({
    fullName:     record.full_name || "",
    institution:  record.institution || "",
    batch:        record.batch || "",
    academicYear: record.academic_year || "",
    phone:        record.phone || "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e?.preventDefault();
    setSaving(true);
    try {
      await updateRegistration(record.id, form);
      onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel max-w-md p-6 sm:p-8">
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
}

export function AdminTable() {
  const [data, setData]               = useState({ registrations: [], abstracts: [] });
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [tab, setTab]                 = useState("registrations");
  const [search, setSearch]           = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [editRecord, setEditRecord]   = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetchAdminRecords();
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const records = tab === "registrations" ? data.registrations : data.abstracts;

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const name = (r.full_name || r.presenter_name || "").toLowerCase();
      const inst = (r.institution || "").toLowerCase();
      const q    = search.toLowerCase();
      const matchSearch =
        !q ||
        name.includes(q) ||
        inst.includes(q) ||
        (r.reg_number || r.abstract_number || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q);
      const matchBatch = !batchFilter || r.batch === batchFilter;
      return matchSearch && matchBatch;
    });
  }, [records, search, batchFilter]);

  async function handleDelete(type, id) {
    try {
      await deleteRecord(type, id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  // Calculate Batch Distribution
  const batchCounts = useMemo(() => {
    const counts = {};
    for (const r of data.registrations) {
      counts[r.batch] = (counts[r.batch] || 0) + 1;
    }
    return counts;
  }, [data.registrations]);

  const uniqueColleges = useMemo(() => {
    return new Set(
      [...data.registrations, ...data.abstracts]
        .map((r) => (r.institution || "").trim().toLowerCase())
        .filter(Boolean)
    ).size;
  }, [data]);

  return (
    <div className="flex flex-col gap-6">

      {/* ── 4 Executive KPI Stat Cards (2x2 on Mobile, 4-col on Desktop) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Attendees"
          value={data.registrations.length}
          sub="Registered Delegates"
          icon={Icons.Users}
          gradient="bg-sky-50"
          textColor="text-sky-600"
        />
        <StatCard
          label="Abstracts"
          value={data.abstracts.length}
          sub="Scientific Submissions"
          icon={Icons.Microscope}
          gradient="bg-teal-50"
          textColor="text-teal-600"
        />
        <StatCard
          label="Colleges"
          value={uniqueColleges}
          sub="Institutions Represented"
          icon={Icons.Institution}
          gradient="bg-amber-50"
          textColor="text-amber-600"
        />
        <StatCard
          label="Event Date"
          value="17 Sep"
          sub="Registration ends 14 Sep"
          icon={Icons.Date}
          gradient="bg-rose-50"
          textColor="text-rose-600"
        />
      </div>

      {/* ── Batch Distribution Progress Bar ── */}
      {data.registrations.length > 0 && (
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
                "bg-indigo-500", "bg-emerald-500", "bg-sky-500",
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

      {/* ── Toolbar: Tabs, Search, Batch Filter & Exports ── */}
      <div className="card p-4 sm:p-5 bg-white border border-slate-200/80 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          
          {/* Left: Tab Switcher (Segmented Control) */}
          <div className="flex p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setTab("registrations")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                tab === "registrations"
                  ? "bg-white text-sky-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>Registrations</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-200/70 text-[10px] text-slate-700 font-extrabold">
                {data.registrations.length}
              </span>
            </button>
            <button
              onClick={() => setTab("abstracts")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                tab === "abstracts"
                  ? "bg-white text-teal-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>Scientific Abstracts</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-200/70 text-[10px] text-slate-700 font-extrabold">
                {data.abstracts.length}
              </span>
            </button>
          </div>

          {/* Right: Export Options */}
          <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-start md:justify-end">
            <button
              onClick={() =>
                tab === "registrations"
                  ? exportRegistrationsExcel(filtered)
                  : exportAbstractsExcel(filtered)
              }
              className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5 text-emerald-700 hover:border-emerald-300"
              title="Export filtered records to Microsoft Excel"
            >
              <Icons.Excel className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>

            <button
              onClick={() =>
                tab === "registrations"
                  ? exportRegistrationsCSV(filtered)
                  : exportAbstractsCSV(filtered)
              }
              className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5 text-slate-700"
              title="Export filtered records to CSV format"
            >
              <Icons.File className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            {tab === "abstracts" && (
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

        {/* Filter Controls Row */}
        <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-100">
          <div className="relative flex-1">
            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              className="form-input pl-9 text-xs py-2.5"
              placeholder="Search by name, college, email, or official ID…"
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

      {/* ── Table Container (Desktop Table + Mobile Cards) ── */}
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
            {/* ── 1. Desktop High-Density Table (Hidden on small mobile) ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Official ID</th>
                    <th>Delegate / Presenter</th>
                    <th>Medical College</th>
                    <th>Batch</th>
                    <th>Year</th>
                    <th>Contact</th>
                    {tab === "registrations" ? <th>Activities</th> : <th>Manuscript</th>}
                    <th>Date</th>
                    <th className="text-right pr-6">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id}>
                      <td className="text-xs text-slate-400 font-mono">{i + 1}</td>
                      <td>
                        <span className="font-mono text-xs font-extrabold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                          {r.reg_number || r.abstract_number}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-500 to-teal-500 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                            {(r.full_name || r.presenter_name || "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 leading-tight">
                              {r.full_name || r.presenter_name}
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
                      
                      {tab === "registrations" ? (
                        <td className="text-xs text-slate-600 max-w-[160px] truncate">
                          {Array.isArray(r.activities) ? r.activities.join(", ") : r.activities || "—"}
                        </td>
                      ) : (
                        <td>
                          {r.file_name ? (
                            <a
                              href={`/api/admin/file?key=${encodeURIComponent(r.r2_file_key)}&name=${encodeURIComponent(r.file_name)}&token=${sessionStorage.getItem("imf_admin_token") || ""}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-teal-700 font-bold hover:underline inline-flex items-center gap-1 font-mono"
                              title="Download manuscript"
                            >
                              <Icons.File className="w-3.5 h-3.5 text-teal-600" />
                              <span className="truncate max-w-[110px]">{r.file_name}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                      )}

                      <td className="text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </td>

                      <td className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          {tab === "registrations" && (
                            <button
                              onClick={() => setEditRecord(r)}
                              className="btn-icon hover:bg-sky-50 text-sky-600"
                              title="Edit registration"
                            >
                              <Icons.Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setConfirmDelete({
                                type: tab === "registrations" ? "registration" : "abstract",
                                id: r.id,
                                name: r.full_name || r.title,
                              })
                            }
                            className="btn-icon hover:bg-rose-50 text-rose-600"
                            title="Delete entry"
                          >
                            <Icons.Delete className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── 2. Smartphone Mobile Card List (Active on small mobile screens) ── */}
            <div className="md:hidden divide-y divide-slate-100">
              {filtered.map((r, i) => (
                <div key={r.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-teal-500 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                        {(r.full_name || r.presenter_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 leading-tight">
                          {r.full_name || r.presenter_name}
                        </div>
                        <div className="text-[11px] text-slate-400">{r.email}</div>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-black text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      {r.reg_number || r.abstract_number}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-1">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Institution</span>
                      <span className="font-medium text-slate-800">{r.institution}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Batch & Year</span>
                      <span className="font-medium text-slate-800">{r.batch} • {r.academic_year}</span>
                    </div>
                  </div>

                  {tab === "registrations" && r.activities && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">Activities</span>
                      <div className="text-xs text-slate-700 bg-slate-50 p-2 rounded-lg leading-relaxed">
                        {Array.isArray(r.activities) ? r.activities.join(", ") : r.activities}
                      </div>
                    </div>
                  )}

                  {tab === "abstracts" && r.file_name && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">Manuscript File</span>
                      <a
                        href={`/api/admin/file?key=${encodeURIComponent(r.r2_file_key)}&name=${encodeURIComponent(r.file_name)}&token=${sessionStorage.getItem("imf_admin_token") || ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-800 font-mono text-xs font-bold border border-teal-200"
                      >
                        <Icons.File className="w-3.5 h-3.5 text-teal-600" />
                        <span>{r.file_name}</span>
                      </a>
                    </div>
                  )}

                  {/* Mobile Actions Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <a
                      href={`tel:${r.phone}`}
                      className="text-sky-600 font-bold flex items-center gap-1 py-1 px-2 rounded-md hover:bg-sky-50"
                    >
                      <Icons.Phone className="w-3.5 h-3.5" />
                      <span>{r.phone}</span>
                    </a>

                    <div className="flex items-center gap-2">
                      {tab === "registrations" && (
                        <button
                          onClick={() => setEditRecord(r)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setConfirmDelete({
                            type: tab === "registrations" ? "registration" : "abstract",
                            id: r.id,
                            name: r.full_name || r.title,
                          })
                        }
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Table Footer Summary */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Showing <strong>{filtered.length}</strong> of <strong>{records.length}</strong> {tab}
            </span>
            <span>Cloudflare D1 • Synced live</span>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editRecord && (
        <EditModal
          record={editRecord}
          onSave={() => { setEditRecord(null); load(); }}
          onClose={() => setEditRecord(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal-panel max-w-sm p-6 text-center">
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
        </div>
      )}

    </div>
  );
}
