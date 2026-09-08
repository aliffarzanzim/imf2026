// src/utils/export.js — Excel & CSV export utilities (SheetJS loaded on-demand)
import { formatBdtDate, formatBdtTime, formatBdtDateTime } from "./timezone";

function sanitizeCell(val) {
  if (typeof val === "string" && /^[=+@\-\t\r]/.test(val)) {
    return "'" + val;
  }
  return val;
}

function flattenRecord(rec) {
  const flat = {
    ...rec,
    activities: Array.isArray(rec.activities)
      ? rec.activities.join(", ")
      : rec.activities,
  };

  // Format created_at to Bangladesh Standard Time (BDT)
  if (flat.created_at) {
    flat.created_at = formatBdtDateTime(flat.created_at, true);
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(flat)) {
    sanitized[key] = sanitizeCell(value);
  }
  return sanitized;
}

export function buildMergedDelegateRows(registrations = [], abstracts = []) {
  return registrations.map((reg, idx) => {
    // Match all abstracts for this delegate
    const userAbstracts = abstracts.filter(
      (a) =>
        (a.reg_number && a.reg_number === reg.reg_number) ||
        (a.email && reg.email && a.email.toLowerCase().trim() === reg.email.toLowerCase().trim())
    );

    const abstractTitles = userAbstracts
      .map((a, i) => (userAbstracts.length > 1 ? `${i + 1}. ${a.title}` : a.title))
      .filter(Boolean)
      .join("\n");

    const abstractNumbers = userAbstracts
      .map((a) => a.abstract_number)
      .filter(Boolean)
      .join("\n");

    const submissionTypes = userAbstracts
      .map((a) => `${a.abstract_number}: ${a.submission_type || ""} (${a.presentation_category || ""})`)
      .filter(Boolean)
      .join("\n");

    const activitiesStr = Array.isArray(reg.activities)
      ? reg.activities.join(", ")
      : (reg.activities || "");

    const row = {
      "SL": idx + 1,
      "Reg ID": reg.reg_number || "",
      "Full Name": reg.full_name || "",
      "Medical College": reg.institution || "",
      "Batch": reg.batch || "",
      "Academic Year": reg.academic_year || "",
      "Phone": reg.phone || "",
      "Email": reg.email || "",
      "Activities": activitiesStr,
      "Competitions": reg.competition_category || "",
      "Prior Experience": reg.prior_experience || "",
      "Queries / Notes": reg.queries || "",
      "Abstract Count": userAbstracts.length,
      "Abstract Titles": abstractTitles || "—",
      "Abstract IDs": abstractNumbers || "—",
      "Submission Details": submissionTypes || "—",
      "Registered Date (BDT)": formatBdtDate(reg.created_at),
      "Registered Time (BDT)": formatBdtTime(reg.created_at),
    };

    const sanitized = {};
    for (const [key, value] of Object.entries(row)) {
      sanitized[key] = sanitizeCell(value);
    }
    return sanitized;
  });
}

export async function exportMergedDelegatesExcel(registrations, abstracts, fileName = "IMF_2026_Delegates_Report.xlsx") {
  const XLSX = await import("xlsx");
  const rows = buildMergedDelegateRows(registrations, abstracts);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Delegates & Abstracts");

  // Auto-width columns based on content
  const cols = Object.keys(rows[0] || {}).map((k) => {
    const maxLen = Math.max(
      k.length,
      ...rows.map((r) => {
        const val = String(r[k] ?? "");
        // If multiline, measure the longest line
        const lines = val.split("\n");
        return Math.max(...lines.map((l) => l.length));
      })
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
  });
  worksheet["!cols"] = cols;

  XLSX.writeFile(workbook, fileName);
}

export async function exportMergedDelegatesCSV(registrations, abstracts, fileName = "IMF_2026_Delegates_Report.csv") {
  const XLSX = await import("xlsx");
  const rows = buildMergedDelegateRows(registrations, abstracts);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv       = XLSX.utils.sheet_to_csv(worksheet);
  const blob      = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url       = URL.createObjectURL(blob);
  const a         = document.createElement("a");
  a.href          = url;
  a.download      = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportToExcel(records, fileName = "IMF_2026_Data.xlsx") {
  const XLSX = await import("xlsx");
  const flat = records.map(flattenRecord);
  const worksheet = XLSX.utils.json_to_sheet(flat);
  const workbook  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Records");
  // Auto-width columns
  const cols = Object.keys(flat[0] || {}).map((k) => ({
    wch: Math.max(k.length, ...flat.map((r) => String(r[k] ?? "").length), 10),
  }));
  worksheet["!cols"] = cols;
  XLSX.writeFile(workbook, fileName);
}

export async function exportRegistrationsExcel(records, abstracts = []) {
  if (abstracts && abstracts.length > 0) {
    await exportMergedDelegatesExcel(records, abstracts, "IMF_2026_Delegates_Master_Report.xlsx");
  } else {
    await exportToExcel(records, "IMF_2026_Registrations.xlsx");
  }
}

export async function exportAbstractsExcel(records) {
  await exportToExcel(records, "IMF_2026_Abstracts.xlsx");
}

export async function exportToCSV(records, fileName = "IMF_2026_Data.csv") {
  const XLSX = await import("xlsx");
  const flat = records.map(flattenRecord);
  const worksheet = XLSX.utils.json_to_sheet(flat);
  const csv       = XLSX.utils.sheet_to_csv(worksheet);
  const blob      = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url       = URL.createObjectURL(blob);
  const a         = document.createElement("a");
  a.href          = url;
  a.download      = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportRegistrationsCSV(records, abstracts = []) {
  if (abstracts && abstracts.length > 0) {
    await exportMergedDelegatesCSV(records, abstracts, "IMF_2026_Delegates_Master_Report.csv");
  } else {
    await exportToCSV(records, "IMF_2026_Registrations.csv");
  }
}

export async function exportAbstractsCSV(records) {
  await exportToCSV(records, "IMF_2026_Abstracts.csv");
}

