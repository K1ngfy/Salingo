"use client";

import { Check, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { choiceResponse, matchingResponse, questionContent } from "@/lib/question-utils";
import type { AnswerResponse, ContentLanguage, Question } from "@/lib/types";
import { questionReadingWarnings, splitQuestionKeywords } from "@/lib/prep";

function AssistedText({ text }: { text: string }) {
  return <>{splitQuestionKeywords(text).map((part, index) => part.highlighted ? <mark key={`${part.value}-${index}`} className="rounded bg-[#fff0a8] px-1 text-inherit">{part.value}</mark> : <span key={`${part.value}-${index}`}>{part.value}</span>)}</>;
}

export function QuestionStem({ question, language, className, assistEnabled = false }: { question: Question; language: ContentLanguage; className?: string; assistEnabled?: boolean }) {
  const content = questionContent(question, language);
  const warnings = assistEnabled ? questionReadingWarnings(`${content.primary.stem} ${content.secondary?.stem ?? ""}`) : [];
  return <div className={className}>
    <h1 className="balance text-2xl font-black leading-[1.45] tracking-[-0.025em] sm:text-3xl">{assistEnabled ? <AssistedText text={content.primary.stem} /> : content.primary.stem}</h1>
    {content.secondary && <p className="mt-3 border-l-4 border-[#b9e5fa] pl-4 font-semibold leading-7 text-[#667780]">{assistEnabled ? <AssistedText text={content.secondary.stem} /> : content.secondary.stem}</p>}
    {warnings.length > 0 && <div className="mt-4 space-y-2 rounded-xl bg-[#fff8df] p-3 text-sm font-bold text-[#8a681d]">{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
  </div>;
}

export function QuestionAnswerInput({ question, response, onChange, language, disabled = false, reveal = false }: {
  question: Question;
  response: AnswerResponse;
  onChange: (response: AnswerResponse) => void;
  language: ContentLanguage;
  disabled?: boolean;
  reveal?: boolean;
}) {
  const content = questionContent(question, language);
  const secondaryOptions = new Map(content.secondary?.options.map((option) => [option.id, option.text]) ?? []);
  if (question.type === "matching") {
    const matches = response.kind === "matching" ? response.matches : {};
    const prompts = content.primary.matchingPrompts ?? question.matchingPrompts;
    const secondaryPrompts = new Map(content.secondary?.matchingPrompts?.map((item) => [item.id, item.text]) ?? []);
    return <div className="mt-7 space-y-3">
      {prompts.map((prompt) => {
        const selected = matches[prompt.id] ?? "";
        const correct = question.correctMatches[prompt.id];
        const wrong = reveal && selected !== correct;
        return <label key={prompt.id} className={cn("block rounded-2xl border-2 bg-white p-4", reveal && !wrong ? "border-[#58cc02]" : wrong ? "border-[#ff4b4b]" : "border-[#deded8]") }>
          <span className="flex gap-3 font-bold"><strong className="text-[#168fc7]">{prompt.id}.</strong><span>{prompt.text}{secondaryPrompts.get(prompt.id) && <span className="mt-1 block text-sm font-semibold text-[#7a858a]">{secondaryPrompts.get(prompt.id)}</span>}</span></span>
          <select value={selected} disabled={disabled} onChange={(event) => onChange(matchingResponse({ ...matches, [prompt.id]: event.target.value }))} className="mt-3 h-12 w-full rounded-xl border-2 border-[#deded8] bg-white px-3 font-bold outline-none focus:border-[#1cb0f6]">
            <option value="">请选择匹配项</option>
            {content.primary.options.map((option) => <option key={option.id} value={option.id}>{option.id}. {option.text}{secondaryOptions.get(option.id) ? ` / ${secondaryOptions.get(option.id)}` : ""}</option>)}
          </select>
          {reveal && wrong && <span className="mt-2 block text-sm font-black text-[#58a700]">正确匹配：{correct}. {content.primary.options.find((option) => option.id === correct)?.text}</span>}
        </label>;
      })}
    </div>;
  }

  const selected = response.kind === "choice" ? response.selectedAnswers : [];
  const choose = (id: string) => {
    if (question.type === "single") onChange(choiceResponse([id]));
    else onChange(choiceResponse(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]));
  };
  return <div className="mt-7 space-y-3">
    {content.primary.options.map((option) => {
      const chosen = selected.includes(option.id);
      const isAnswer = question.correctAnswers.includes(option.id);
      const state = reveal ? isAnswer ? "correct" : chosen ? "wrong" : "idle" : chosen ? "selected" : "idle";
      return <button key={option.id} type="button" onClick={() => choose(option.id)} disabled={disabled} className={cn("flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100", state === "idle" && "border-[#deded8] bg-white shadow-[0_3px_0_#deded8]", state === "selected" && "border-[#1cb0f6] bg-[#e8f7ff] text-[#137eae] shadow-[0_3px_0_#1cb0f6]", state === "correct" && "border-[#58cc02] bg-[#eefbdc] text-[#438c0d]", state === "wrong" && "border-[#ff4b4b] bg-[#fff0f0] text-[#c53636]") }>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-current/20 text-sm font-black">{state === "correct" ? <Check size={19} weight="bold" /> : state === "wrong" ? <X size={19} weight="bold" /> : option.id}</span>
        <span>{option.text}{secondaryOptions.get(option.id) && <span className="mt-1 block text-sm font-semibold opacity-75">{secondaryOptions.get(option.id)}</span>}</span>
      </button>;
    })}
  </div>;
}
