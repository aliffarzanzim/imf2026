// src/pages/Home.jsx
import React from "react";
import { Header } from "../components/Header";
import { Hero } from "../components/Hero";
import { Footer } from "../components/Footer";

export function Home() {
  function handleRegister() {
    window.location.hash = "#/register";
  }

  function handleAbstract() {
    window.location.hash = "#/abstract";
  }

  function handleAdmin() {
    window.location.hash = "#/admin";
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      <Header
        onOpenAdmin={handleAdmin}
        onHome={() => { window.location.hash = "#/"; }}
        onOpenRegister={handleRegister}
      />
      <main className="flex-1">
        <Hero
          onOpenRegister={handleRegister}
          onOpenAbstract={handleAbstract}
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
