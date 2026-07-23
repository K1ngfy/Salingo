"use client";

import { useState } from "react";
import { Books, Translate } from "@phosphor-icons/react";
import { useAppData } from "./data-provider";
import { QUESTION_BANKS } from "@/lib/question-banks";
import type { BankId, ContentLanguage } from "@/lib/types";

export function BankSelector({ value, onChange, allowAll = false }: {
  value: BankId | "all";
  onChange: (value: BankId | "all") => void;
  allowAll?: boolean;
}) {
  const { data, ensureBankLoaded, loadingBankId, setPreferences } = useAppData();
  const [error, setError] = useState("");
  const select = async (next: BankId | "all") => {
    setError("");
    if (next === "all") { onChange(next); return; }
    try {
      await ensureBankLoaded(next);
      await setPreferences({ ...data.preferences, activeBankId: next });
      onChange(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "题库加载失败");
    }
  };
  return <div className="w-full max-w-full sm:w-auto">
    <label className="flex w-full max-w-full items-center gap-2 overflow-hidden rounded-xl bg-[var(--surface)] px-3 ring-2 ring-[var(--c-e7e7e1)]">
      <Books size={19} weight="duotone" className="text-[var(--c-9b6b43)]" />
      <span className="sr-only">选择题库</span>
      <select value={value} onChange={(event) => void select(event.target.value as BankId | "all")} disabled={Boolean(loadingBankId)} className="h-11 min-w-0 flex-1 truncate bg-transparent text-sm font-black outline-none sm:min-w-72">
        {allowAll && <option value="all">全部题库</option>}
        {QUESTION_BANKS.map((bank) => <option key={bank.id} value={bank.id}>{bank.name} · {bank.questionCount} 题</option>)}
      </select>
    </label>
    {error && <p className="mt-1 text-xs font-bold text-[var(--c-c63838)]">{error}</p>}
  </div>;
}

export function ContentLanguageToggle() {
  const { data, setPreferences } = useAppData();
  const language = data.preferences.contentLanguage;
  const setLanguage = (contentLanguage: ContentLanguage) => void setPreferences({ ...data.preferences, contentLanguage });
  return <div className="flex items-center gap-1 rounded-xl bg-[var(--c-f1f1ed)] p-1" aria-label="题目语言">
    <Translate size={18} className="mx-1 text-[var(--c-777)]" />
    {(["zh", "en", "bilingual"] as const).map((value) => <button key={value} type="button" onClick={() => setLanguage(value)} className={`rounded-lg px-2.5 py-1.5 text-xs font-black ${language === value ? "bg-[var(--surface)] text-[var(--c-168fc7)] shadow-sm" : "text-[var(--c-888)]"}`}>{value === "zh" ? "中文" : value === "en" ? "EN" : "双语"}</button>)}
  </div>;
}
