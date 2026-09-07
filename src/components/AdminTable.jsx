// src/components/AdminTable.js
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

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="stat-card">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2`} style={{ background: color + "20" }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function EditModal({ record, onSave, onClose }) {
  const [form, setForm] = useState({
    fullName:     record.full_name,
    institution:  record.institution,
    batch:        record.batch,
    academicYear: record.academic_year,
    phone:        record.phone,
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
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
      <div className="modal-panel max-w-md">
        <div className="modal-header">
          <h3 className="text-lg font-bold">Edit Registration</h3>
          <button className="btn-icon" onClick={onClose}><Icons.Close className="w-4 h-4" /></button>
        </div>
        <div className="modal-body flex flex-col gap-4">
          {[
            ["Full Name",     "fullName",     "text"],
            ["Institution",   "institution",  "text"],
            ["Batch",         "batch",        "text"],
            ["Academic Year", "academicYear", "text"],
            ["Phone",         "phone",        "tel"],
          ].map(([label, field, type]) => (
            <div key={field} className="form-group">
              <label className="form-label">{label}</label>
              <input type={type} className="form-input" value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><Icons.Spinner className="w-4 h-4 animate-spin" /> Saving…</> : <><Icons.Check className="w-4 h-4" /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminTable() {
  const [data, setData]         = useState({ registrations: [], abstracts: [] });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [tab, setTab]           = useState("registrations");
  const [search, setSearch]     = useState("");
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
      const matchSearch = !q || name.includes(q) || inst.includes(q) ||
        (r.reg_number || r.abstract_number || "").toLowerCase().includes(q);
      const matchBatch  = !batchFilter || r.batch === batchFilter;
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

  const BATCHES = ["K-79", "K-80", "K-81", "K-82", "K-83", "Other"];

  return (
    <div className="flex flex-col gap-6">

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Registrations" value={data.registrations.length} icon={Icons.Clipboard} color="var(--color-primary)" />
        <StatCard label="Abstracts Submitted"  value={data.abstracts.length}     icon={Icons.File}      color="var(--color-accent)" />
        <StatCard label="Institutions"
          value={new Set([...data.registrations, ...data.abstracts].map((r) => r.institution)).size}
          icon={Icons.Institution} color="var(--color-warning)" />
        <StatCard label="Last Date" value="14 Sep" icon={Icons.Date} color="var(--color-danger)" />
      </div>

      {/* Toolbar */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Left: Tabs + Search + Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
            {["registrations", "abstracts"].map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-all ${tab === t ? "bg-[var(--color-primary)] text-white" : "bg-white text-[var(--color-text-muted)] hover:bg-slate-50"}`}>
                {t} ({t === "registrations" ? data.registrations.length : data.abstracts.length})
              </button>
            ))}
          </div>

          <div className="relative">
            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
            <input className="form-input pl-9 py-2 text-sm w-48" placeholder="Search name, ID…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <select className="form-select py-2 text-sm w-36" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
            <option value="">All Batches</option>
            {BATCHES.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>

        {/* Right: Export Buttons */}
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline text-xs py-2"
            onClick={() => tab === "registrations" ? exportRegistrationsExcel(filtered) : exportAbstractsExcel(filtered)}>
            <Icons.Excel className="w-4 h-4 text-green-600" /> Excel
          </button>
          <button className="btn-outline text-xs py-2"
            onClick={() => tab === "registrations" ? exportRegistrationsCSV(filtered) : exportAbstractsCSV(filtered)}>
            <Icons.File className="w-4 h-4" /> CSV
          </button>
          {tab === "abstracts" && (
            <a href={getAdminDownloadUrl()} target="_blank" rel="noopener noreferrer"
              className="btn-accent text-xs py-2">
              <Icons.Zip className="w-4 h-4" /> Download All (.ZIP)
            </a>
          )}
          <button className="btn-icon" onClick={load} title="Refresh">
            <Icons.Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="alert bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-red-200 rounded-lg text-sm">
          <Icons.Alert className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--color-text-muted)]">
              <Icons.Spinner className="w-8 h-8 animate-spin text-[var(--color-accent)]" />
              <span className="text-sm">Loading records…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--color-text-muted)]">
              <Icons.File className="w-10 h-10 opacity-30" />
              <span className="text-sm">No records found.</span>
            </div>
          ) : tab === "registrations" ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Reg. Number</th>
                  <th>Name</th>
                  <th>Institution</th>
                  <th>Batch</th>
                  <th>Year</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Activities</th>
                  <th>Category</th>
                  <th>Registered At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id}>
                    <td className="text-[var(--color-text-muted)] text-xs">{i + 1}</td>
                    <td><span className="badge-primary font-mono text-xs">{r.reg_number}</span></td>
                    <td className="font-medium">{r.full_name}</td>
                    <td className="text-sm max-w-[140px] truncate">{r.institution}</td>
                    <td><span className="badge-neutral">{r.batch}</span></td>
                    <td className="text-sm">{r.academic_year}</td>
                    <td className="text-sm font-mono">{r.phone}</td>
                    <td className="text-sm text-[var(--color-primary)] max-w-[140px] truncate">{r.email}</td>
                    <td className="text-xs max-w-[160px]">
                      {(() => {
                        try { return JSON.parse(r.activities || "[]").join(", "); }
                        catch { return r.activities || "—"; }
                      })()}
                    </td>
                    <td className="text-xs">{r.competition_category || "—"}</td>
                    <td className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="btn-icon" title="Edit" onClick={() => setEditRecord(r)}>
                          <Icons.Edit className="w-3.5 h-3.5" />
                        </button>
                        <button className="btn-icon text-[var(--color-danger)] hover:bg-red-50" title="Delete"
                          onClick={() => setConfirmDelete({ type: "registration", id: r.id, name: r.full_name })}>
                          <Icons.Delete className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Abstract No.</th>
                  <th>Presenter</th>
                  <th>Institution</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Batch</th>
                  <th>File</th>
                  <th>Submitted At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id}>
                    <td className="text-[var(--color-text-muted)] text-xs">{i + 1}</td>
                    <td><span className="badge-accent font-mono text-xs">{r.abstract_number}</span></td>
                    <td className="font-medium">{r.presenter_name}</td>
                    <td className="text-sm max-w-[120px] truncate">{r.institution}</td>
                    <td className="text-sm max-w-[200px]">
                      <span className="line-clamp-2">{r.title}</span>
                    </td>
                    <td className="text-xs">{r.submission_type}</td>
                    <td className="text-xs">{r.presentation_category}</td>
                    <td><span className="badge-neutral">{r.batch}</span></td>
                    <td>
                      <a
                        href={`/api/admin/file?key=${encodeURIComponent(r.r2_file_key)}&name=${encodeURIComponent(r.file_name)}&token=${sessionStorage.getItem("imf_admin_token") || ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--color-primary)] hover:underline font-mono inline-flex items-center gap-1"
                        title="Download file"
                      >
                        <Icons.File className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[120px]">{r.file_name}</span>
                        <span className="text-[10px] text-gray-400">({(r.file_size / 1024 / 1024).toFixed(1)}M)</span>
                      </a>
                    </td>
                    <td className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="btn-icon text-[var(--color-danger)] hover:bg-red-50" title="Delete"
                          onClick={() => setConfirmDelete({ type: "abstract", id: r.id, name: r.title })}>
                          <Icons.Delete className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Table Footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-[var(--color-border)] bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-muted)]">
              Showing {filtered.length} of {records.length} records
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              Last refreshed: {new Date().toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editRecord && (
        <EditModal
          record={editRecord}
          onSave={async () => { setEditRecord(null); await load(); }}
          onClose={() => setEditRecord(null)}
        />
      )}

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal-panel max-w-sm">
            <div className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--color-danger-bg)] flex items-center justify-center">
                <Icons.Delete className="w-6 h-6 text-[var(--color-danger)]" />
              </div>
              <h3 className="text-lg font-bold mb-2">Confirm Deletion</h3>
              <p className="text-sm text-[var(--color-text-muted)] mb-6">
                Are you sure you want to delete <strong>"{confirmDelete.name}"</strong>?
                {confirmDelete.type === "abstract" && " The uploaded file will also be permanently removed from storage."}
                This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button className="btn-outline flex-1" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="btn-danger flex-1 justify-center"
                  onClick={() => handleDelete(confirmDelete.type, confirmDelete.id)}>
                  <Icons.Delete className="w-4 h-4" /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
