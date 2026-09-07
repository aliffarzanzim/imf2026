// src/pages/Home.jsx
import React from "react";
import { Header } from "../components/Header";
import { Hero } from "../components/Hero";
import { Footer } from "../components/Footer";
import { navigate } from "../utils/navigation";

export function Home() {
  function handleRegister() {
    navigate("/register");
  }

  function handleAbstract() {
    navigate("/abstract");
  }

  function handleAdmin() {
    navigate("/admin");
  }

  function handleManage() {
    navigate("/manage");
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] w-full">
      <Header
        onOpenAdmin={handleAdmin}
        onHome={() => navigate("/")}
        onOpenRegister={handleRegister}
        onOpenManage={handleManage}
      />
      <main className="flex-1 w-full">
        <Hero
          onOpenRegister={handleRegister}
          onOpenAbstract={handleAbstract}
          onOpenManage={handleManage}
        />
      </main>
      <Footer
        onOpenAdmin={handleAdmin}
        onOpenRegister={handleRegister}
        onOpenAbstract={handleAbstract}
      />
    </div>
  );
}

