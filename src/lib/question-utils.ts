import type { AnswerResponse, ContentLanguage, LocalizedQuestionContent, Question } from "./types";

export function choiceResponse(selectedAnswers: string[]): AnswerResponse {
  return { kind: "choice", selectedAnswers };
}

export function matchingResponse(matches: Record<string, string>): AnswerResponse {
  return { kind: "matching", matches };
}

export function correctResponse(question: Question): AnswerResponse {
  return question.type === "matching"
    ? matchingResponse(question.correctMatches)
    : choiceResponse(question.correctAnswers);
}

export function responseIsComplete(question: Question, response: AnswerResponse) {
  if (question.type === "matching") {
    return response.kind === "matching" && question.matchingPrompts.every((item) => Boolean(response.matches[item.id]));
  }
  return response.kind === "choice" && response.selectedAnswers.length > 0;
}

export function responsesEqual(left: AnswerResponse, right: AnswerResponse) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "choice" && right.kind === "choice") {
    const a = [...left.selectedAnswers].sort();
    const b = [...right.selectedAnswers].sort();
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  if (left.kind === "matching" && right.kind === "matching") {
    const keys = Object.keys(right.matches);
    return keys.length === Object.keys(left.matches).length && keys.every((key) => left.matches[key] === right.matches[key]);
  }
  return false;
}

export function isCorrectResponse(question: Question, response: AnswerResponse) {
  return responsesEqual(response, correctResponse(question));
}

export function responseLabel(response: AnswerResponse) {
  if (response.kind === "choice") return response.selectedAnswers.join("、");
  return Object.entries(response.matches).map(([from, to]) => `${from}→${to}`).join("；");
}

export function questionContent(question: Question, language: ContentLanguage): {
  primary: LocalizedQuestionContent;
  secondary?: LocalizedQuestionContent;
} {
  const zh: LocalizedQuestionContent = {
    stem: question.stem,
    options: question.options,
    explanation: question.explanation.logic,
    matchingPrompts: question.type === "matching" ? question.matchingPrompts : undefined,
  };
  const en = question.translations?.en;
  if (language === "en" && en) return { primary: en };
  if (language === "bilingual" && en) return { primary: zh, secondary: en };
  return { primary: zh };
}
