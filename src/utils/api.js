// src/utils/api.js — Centralized fetch wrapper

const BASE = "";  // Same-origin Pages Functions

function getAuthHeader() {
  const token = sessionStorage.getItem("imf_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      message = err.error || err.message || message;
    } catch (_) {}
    throw new Error(message);
  }

  return res.json();
}

// ── Registration ──────────────────────────────────────────────
export async function submitRegistration(data) {
  return request("/api/register", { method: "POST", body: JSON.stringify(data) });
}

// ── Abstract Upload ───────────────────────────────────────────
export async function getUploadUrl(fileName, fileType) {
  return request("/api/get-upload-url", {
    method: "POST",
    body: JSON.stringify({ fileName, fileType }),
  });
}

export async function uploadFileToR2(presignedUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presignedUrl);
    xhr.setRequestHeader("Content-Type", file.type);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error during file upload"));
    xhr.send(file);
  });
}

export async function submitAbstract(data) {
  return request("/api/submit-abstract", { method: "POST", body: JSON.stringify(data) });
}

// ── Admin Auth ────────────────────────────────────────────────
export async function adminLogin(password) {
  const result = await request("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  if (result.token) {
    sessionStorage.setItem("imf_admin_token", result.token);
  }
  return result;
}

export function adminLogout() {
  sessionStorage.removeItem("imf_admin_token");
}

export function isAdminLoggedIn() {
  return !!sessionStorage.getItem("imf_admin_token");
}

// ── Admin Records ─────────────────────────────────────────────
export async function fetchAdminRecords() {
  return request("/api/admin/records");
}

export async function updateRegistration(id, data) {
  return request("/api/admin/records", {
    method: "PUT",
    body: JSON.stringify({ type: "registration", id, ...data }),
  });
}

export async function deleteRecord(type, id) {
  return request("/api/admin/records", {
    method: "DELETE",
    body: JSON.stringify({ type, id }),
  });
}

export function getAdminDownloadUrl() {
  const token = sessionStorage.getItem("imf_admin_token");
  return `/api/admin/download-all?token=${token}`;
}
