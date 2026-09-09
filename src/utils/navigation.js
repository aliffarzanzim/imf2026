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
    const rawHash = window.location.hash.replace(/^#\/?/, "");
    const [hashPath] = rawHash.split("?");
    const cleanHash = hashPath ? hashPath.replace(/^\/|\/$/g, "").toLowerCase() : "";
    if (cleanHash) {
      return cleanHash;
    } else {
      window.history.replaceState(null, "", "/");
      return "home";
    }
  }

  const cleanPath = window.location.pathname.replace(/^\/|\/$/g, "").toLowerCase();
  return cleanPath || "home";
}
