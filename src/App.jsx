// src/App.js
import React, { useState, useEffect } from "react";
import { Home } from "./pages/Home";
import { Admin } from "./pages/Admin";

export function App() {
  const [route, setRoute] = useState(
    window.location.hash.replace(/^#\/?/, "") || "home"
  );

  useEffect(() => {
    function onHashChange() {
      const path = window.location.hash.replace(/^#\/?/, "");
      setRoute(path || "home");
      window.scrollTo(0, 0);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route === "admin") {
    return <Admin />;
  }

  return <Home />;
}

export default App;
