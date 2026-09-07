// src/pages/Home.js
import React, { useState } from "react";
import { Header } from "../components/Header";
import { Hero } from "../components/Hero";
import { RegisterModal } from "../components/RegisterModal";
import { AbstractModal } from "../components/AbstractModal";

export function Home() {
  const [showRegister, setShowRegister] = useState(false);
  const [showAbstract, setShowAbstract] = useState(false);

  function handleOpenAdmin() {
    window.location.hash = "#/admin";
  }

  return (
    <div className="min-h-screen">
      <Header
        onOpenAdmin={handleOpenAdmin}
        onHome={() => { window.location.hash = "#/"; }}
      />
      <Hero
        onOpenRegister={() => setShowRegister(true)}
        onOpenAbstract={() => setShowAbstract(true)}
      />
      {showRegister && <RegisterModal onClose={() => setShowRegister(false)} />}
      {showAbstract && <AbstractModal onClose={() => setShowAbstract(false)} />}
    </div>
  );
}
