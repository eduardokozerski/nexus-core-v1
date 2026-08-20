"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggleTheme() {
    const nextIsDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextIsDark);
    localStorage.setItem("nexus-theme", nextIsDark ? "dark" : "light");
  }

  return (
    <button
      aria-label="Alternar entre modo claro e escuro"
      className={`theme-toggle ${className}`}
      onClick={toggleTheme}
      title="Alternar tema"
      type="button"
    >
      <Sun aria-hidden="true" className="theme-icon theme-icon-light" size={17} />
      <Moon aria-hidden="true" className="theme-icon theme-icon-dark" size={17} />
    </button>
  );
}
