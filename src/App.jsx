// src/App.jsx
import React, { useState, useEffect } from "react";
import { Home } from "./pages/Home";
import { Register } from "./pages/Register";
import { SubmitAbstract } from "./pages/SubmitAbstract";
import { Admin } from "./pages/Admin";
import { Verify } from "./pages/Verify";
import { QuizEntry } from "./pages/QuizEntry";
import { QuizDashboard } from "./pages/QuizDashboard";
import { QuizMaster } from "./pages/QuizMaster";
import { getCurrentRoute } from "./utils/navigation";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-elevated p-8">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4 font-bold text-xl">
              !
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-xs text-slate-500 mb-6">
              An unexpected display issue occurred. Please reload the page to continue.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="btn-primary text-xs py-2.5 px-5 font-bold"
              >
                Reload Page
              </button>
              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                className="btn-outline text-xs py-2.5 px-4 font-bold"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  let pageContent = <Home />;

  if (route === "register") {
    pageContent = <Register initialMode="register" />;
  } else if (route === "manage") {
    pageContent = <Register initialMode="manage" />;
  } else if (route === "abstract" || route === "submit-abstract") {
    pageContent = <Register initialMode="abstract" />;
  } else if (route === "admin") {
    pageContent = <Admin />;
  } else if (route === "verify" || route.startsWith("verify")) {
    pageContent = <Verify />;
  } else if (
    route === "quiz-master" ||
    (route.startsWith("quiz") &&
      typeof window !== "undefined" &&
      window.location.search.includes("mode=host"))
  ) {
    pageContent = <QuizMaster />;
  } else if (route === "quiz-dashboard") {
    pageContent = <QuizDashboard />;
  } else if (route === "quiz" || route.startsWith("quiz")) {
    pageContent = <QuizEntry />;
  }

  return <ErrorBoundary>{pageContent}</ErrorBoundary>;
}

export default App;


