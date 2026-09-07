// src/App.jsx
import React, { useState, useEffect } from "react";
import { Home } from "./pages/Home";
import { Register } from "./pages/Register";
import { SubmitAbstract } from "./pages/SubmitAbstract";
import { Admin } from "./pages/Admin";
import { getCurrentRoute } from "./utils/navigation";

export function App() {
  const [route, setRoute] = useState(getCurrentRoute);

  useEffect(() => {
    function handleLocationChange() {
      setRoute(getCurrentRoute());
    }

    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("hashchange", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("hashchange", handleLocationChange);
    };
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

