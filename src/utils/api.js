// src/utils/api.js — Centralized fetch wrapper

const BASE = "";  // Same-origin Pages Functions

export function getAdminToken() {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("imf_admin_token") || sessionStorage.getItem("imf_admin_token");
  if (!token) return null;

  // Check client-side expiration
  try {
    const parts = token.split(".");
    if (parts.length === 2) {
      const payload = JSON.parse(atob(parts[0]));
      if (payload.exp && Date.now() > payload.exp) {
        localStorage.removeItem("imf_admin_token");
        sessionStorage.removeItem("imf_admin_token");
        return null;
      }
    }
  } catch (_) {}

  return token;
}

function getAuthHeader() {
  const token = getAdminToken();
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
    if (res.status === 401 && path.startsWith("/api/admin")) {
      adminLogout();
    }
    let message = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      message = err.error || err.message || message;
    } catch (_) {}
    throw new Error(message);
  }

  return res.json();
}

// ── Registration & Self-Service Portal ─────────────────────────
export async function submitRegistration(data) {
  return request("/api/register", { method: "POST", body: JSON.stringify(data) });
}

export async function lookupRegistration(emailOrReg, otpCode = null) {
  const isEmail = String(emailOrReg).includes("@");
  return request("/api/lookup-registration", {
    method: "POST",
    body: JSON.stringify({
      email: isEmail ? emailOrReg : undefined,
      regNumber: !isEmail ? emailOrReg : undefined,
      otpCode,
    }),
  });
}

export async function updateRegistrationData(data) {
  return request("/api/update-registration", {
    method: "POST",
    body: JSON.stringify(data),
  });
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
    // Check if client is online
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return reject(new Error("You are currently offline. Please check your internet connection and try again."));
    }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presignedUrl);
    xhr.timeout = 120000; // 2 minutes timeout for large manuscripts/presentations

    const contentType = file.type || "application/octet-stream";
    xhr.setRequestHeader("Content-Type", contentType);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
          onProgress(percent);
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve();
      } else {
        let errMsg = `Upload failed (Status ${xhr.status})`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed.error) errMsg = parsed.error;
          else if (parsed.message) errMsg = parsed.message;
        } catch (_) {
          if (xhr.status === 413) {
            errMsg = "The file is too large for the server. Maximum size is 100 MB.";
          } else if (xhr.status === 403) {
            errMsg = "Upload security authorization expired. Please try submitting again.";
          } else if (xhr.status === 503) {
            errMsg = "Storage service is temporarily busy. Please retry in a few moments.";
          } else if (xhr.statusText) {
            errMsg = `Upload failed: ${xhr.statusText}`;
          }
        }
        reject(new Error(errMsg));
      }
    };

    xhr.ontimeout = () => {
      reject(new Error("File upload timed out. Your connection might be slow or unstable. Please retry."));
    };

    xhr.onerror = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        reject(new Error("Network connection lost during file upload. Please reconnect and try again."));
      } else {
        reject(new Error("Network error occurred during file upload. Please check your internet connection or proxy."));
      }
    };

    xhr.onabort = () => {
      reject(new Error("File upload was cancelled."));
    };

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
    try {
      localStorage.setItem("imf_admin_token", result.token);
      sessionStorage.setItem("imf_admin_token", result.token);
    } catch (_) {}
  }
  return result;
}

export function adminLogout() {
  try {
    localStorage.removeItem("imf_admin_token");
    sessionStorage.removeItem("imf_admin_token");
  } catch (_) {}
}

export function isAdminLoggedIn() {
  return !!getAdminToken();
}

export const isAdminAuthed = isAdminLoggedIn;


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
  const token = getAdminToken() || "";
  return `/api/admin/download-all?token=${encodeURIComponent(token)}`;
}
