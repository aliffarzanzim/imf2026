// src/utils/timezone.js — Date & Time utilities with Bangladesh Standard Time (BDT / UTC+6) support

/**
 * Parses a UTC date string from SQLite/D1 into a proper JavaScript Date object.
 * SQLite CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS" (in UTC, without timezone offset).
 * If parsed naively by browser, it can be interpreted as local time instead of UTC.
 * This helper ensures it is always normalized and parsed as UTC.
 */
export function parseUtcDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  let str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
    str = str.replace(" ", "T") + "Z";
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(str)) {
    str = str + "Z";
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a UTC timestamp into Bangladesh Standard Time (BDT) Date
 * e.g., "08 Sep 2026"
 */
export function formatBdtDate(val, options = {}) {
  const d = parseUtcDate(val);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  });
}

/**
 * Formats a UTC timestamp into Bangladesh Standard Time (BDT) Time
 * e.g., "01:01 PM"
 */
export function formatBdtTime(val, options = {}) {
  const d = parseUtcDate(val);
  if (!d) return "—";
  return d.toLocaleTimeString("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...options,
  });
}

/**
 * Formats a UTC timestamp into full Bangladesh Standard Time (BDT) Date & Time
 * e.g., "08 Sep 2026, 01:01:56 PM"
 */
export function formatBdtDateTime(val, includeZone = false) {
  const d = parseUtcDate(val);
  if (!d) return "—";
  const str = d.toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return includeZone ? `${str} (BDT)` : str;
}
