// src/utils/export.js — Excel & CSV export utilities (SheetJS loaded on-demand)

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

  const sanitized = {};
  for (const [key, value] of Object.entries(flat)) {
    sanitized[key] = sanitizeCell(value);
  }
  return sanitized;
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

export async function exportRegistrationsExcel(records) {
  await exportToExcel(records, "IMF_2026_Registrations.xlsx");
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

export async function exportRegistrationsCSV(records) {
  await exportToCSV(records, "IMF_2026_Registrations.csv");
}

export async function exportAbstractsCSV(records) {
  await exportToCSV(records, "IMF_2026_Abstracts.csv");
}

