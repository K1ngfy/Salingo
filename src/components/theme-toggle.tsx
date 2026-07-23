"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeMode } from "@/lib/use-theme";

/** Compact header button that flips between light and dark. */
export function ThemeToggle() {
  const { resolved, ready, setTheme } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="grid size-10 place-items-center rounded-xl text-[var(--c-888)] transition hover:bg-[var(--c-f0f0eb)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100"
      aria-label={next === "dark" ? "切换到深色模式" : "切换到浅色模式"}
      title={next === "dark" ? "深色模式" : "浅色模式"}
    >
      {ready && resolved === "dark" ? <Moon size={22} weight="fill" /> : <Sun size={22} weight="fill" />}
    </button>
  );
}

const OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: "system", label: "跟随系统", icon: Desktop },
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
];

/** Segmented control for the settings page. */
export function ThemeModeControl() {
  const { mode, ready, setTheme } = useTheme();
  return (
    <div className="inline-flex rounded-2xl border-2 border-[var(--c-deded8)] p-1" role="group" aria-label="外观模式">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = ready && mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition",
              active ? "bg-[var(--c-e9f8dc)] text-[var(--c-58a700)]" : "text-[var(--c-888)] hover:bg-[var(--c-f0f0eb)]",
            )}
          >
            <Icon size={18} weight="bold" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
