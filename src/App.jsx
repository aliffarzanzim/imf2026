// src/App.jsx
import React, { useState, useEffect } from "react";
import { Home } from "./pages/Home";
import { Register } from "./pages/Register";
import { SubmitAbstract } from "./pages/SubmitAbstract";
import { Admin } from "./pages/Admin";

export function App() {
  const [route, setRoute] = useState(
    window.location.hash.replace(/^#\/?/, "").toLowerCase() || "home"
  );

  useEffect(() => {
    function onHashChange() {
      const path = window.location.hash.replace(/^#\/?/, "").toLowerCase();
      setRoute(path || "home");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route === "register") {
    return <Register />;
  }

  if (route === "abstract" || route === "submit-abstract") {
    return <SubmitAbstract />;
  }

  if (route === "admin") {
    return <Admin />;
  }

  return <Home />;
}

export default App;
