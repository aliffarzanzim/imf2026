// src/utils/export.js — Excel & CSV export utilities (SheetJS)
import * as XLSX from "xlsx";

function flattenRecord(rec) {
  return {
    ...rec,
    activities: Array.isArray(rec.activities)
      ? rec.activities.join(", ")
      : rec.activities,
  };
}

export function exportToExcel(records, fileName = "IMF_2026_Data.xlsx") {
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

export function exportRegistrationsExcel(records) {
  exportToExcel(records, "IMF_2026_Registrations.xlsx");
}

export function exportAbstractsExcel(records) {
  exportToExcel(records, "IMF_2026_Abstracts.xlsx");
}

export function exportToCSV(records, fileName = "IMF_2026_Data.csv") {
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

export function exportRegistrationsCSV(records) {
  exportToCSV(records, "IMF_2026_Registrations.csv");
}

export function exportAbstractsCSV(records) {
  exportToCSV(records, "IMF_2026_Abstracts.csv");
}
