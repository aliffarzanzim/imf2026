// src/utils/navigation.js

export function navigate(path) {
  let target = path;
  if (!target.startsWith("/")) {
    target = "/" + target;
  }
  // Strip trailing slash unless root
  if (target.length > 1 && target.endsWith("/")) {
    target = target.slice(0, -1);
  }

  window.history.pushState(null, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function getCurrentRoute() {
  // Handle backwards compatibility for any incoming hash links like #/register
  if (window.location.hash) {
    const hashClean = window.location.hash.replace(/^#\/?/, "");
    if (hashClean) {
      const cleanPath = `/${hashClean}`;
      window.history.replaceState(null, "", cleanPath);
      return hashClean.toLowerCase();
    } else {
      window.history.replaceState(null, "", "/");
      return "home";
    }
  }

  const cleanPath = window.location.pathname.replace(/^\/|\/$/g, "").toLowerCase();
  return cleanPath || "home";
}
