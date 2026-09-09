// functions/_middleware.js
// Cloudflare Pages Edge Middleware:
// Pre-injects live system configuration (registration & abstract toggles) from D1 into HTML
// Eliminates client-side flash / layout shift when abstract-only mode or registration closed is active.

let cachedConfig = null;
let cacheExpiry = 0;

async function fetchLiveConfig(env) {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiry) {
    return cachedConfig;
  }

  const config = {
    registration_open: true,
    abstract_edit_open: true,
    registration_abstract_only: false,
  };

  if (!env.DB) {
    return config;
  }

  try {
    const rows = await env.DB.prepare("SELECT key, value FROM system_config").all();
    if (rows && rows.results) {
      for (const row of rows.results) {
        if (row.key === "registration_open") {
          config.registration_open = row.value === "true";
        } else if (row.key === "abstract_edit_open") {
          config.abstract_edit_open = row.value === "true";
        } else if (row.key === "registration_abstract_only") {
          config.registration_abstract_only = row.value === "true";
        }
      }
    }

    if (config.registration_open === false) {
      config.registration_abstract_only = false;
    }

    // Cache at edge instance for 10 seconds to minimize D1 queries
    cachedConfig = config;
    cacheExpiry = now + 10000;
  } catch (_) {}

  return config;
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Fast bypass for API endpoints
  if (url.pathname.startsWith("/api/")) {
    return next();
  }

  // Fast bypass for static files / assets
  const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|ico|json|txt|pdf|map)$/i.test(url.pathname);
  if (isStaticAsset) {
    return next();
  }

  // Fetch downstream asset (e.g. dist/index.html)
  const response = await next();
  
  // Only rewrite successful 200 HTML documents
  if (response.status !== 200) {
    return response;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  try {
    const config = await fetchLiveConfig(env);

    // Stream-inject window.__IMF_CONFIG__ into <head>
    return new HTMLRewriter()
      .on("head", {
        element(el) {
          el.prepend(
            `<script>window.__IMF_CONFIG__=${JSON.stringify(config)};</script>`,
            { html: true }
          );
        },
      })
      .transform(response);
  } catch (_) {
    return response;
  }
}
