"use client";

import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "salingo:theme";
const THEME_CHANGE_EVENT = "salingo:theme-change";

export function readThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    /* ignore */
  }
  return "system";
}

function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveThemeMode(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
}

/** Manages the persisted light/dark/system preference and applies it to <html>. */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      const next = readThemeMode();
      applyThemeMode(next);
      setMode(next);
      setResolved(resolveThemeMode(next));
      setReady(true);
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    media.addEventListener("change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
      media.removeEventListener("change", sync);
    };
  }, []);

  const setTheme = (next: ThemeMode) => {
    try {
      if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyThemeMode(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return { mode, resolved, ready, setTheme };
}

/** Effective dark-mode boolean that reacts to both the attribute and the OS setting. */
export function useIsDark(): boolean {
  const { ready, resolved } = useTheme();
  return ready && resolved === "dark";
}
