export type DomainId = "d1" | "d2" | "d3" | "d4" | "d5" | "d6" | "d7" | "d8";
export type QuestionType = "single" | "multiple";
export type Difficulty = "基础" | "进阶" | "高难" | "陷阱";
export type MistakeType = "概念盲区" | "审题失误" | "混淆考点";

export interface Domain {
  id: DomainId;
  number: number;
  name: string;
  shortName: string;
  english: string;
  weight: number;
  color: string;
  softColor: string;
  icon: string;
}

export interface Explanation {
  logic: string;
  optionAnalysis: Record<string, string>;
  knowledgePoint: string;
  plainLanguage: string;
}

export interface Question {
  id: string;
  domainId: DomainId;
  type: QuestionType;
  difficulty: Difficulty;
  tags: string[];
  stem: string;
  options: Array<{ id: string; text: string }>;
  correctAnswers: string[];
  explanation: Explanation;
  source: "original" | "ai" | "imported";
  outlineVersion: "2024-current";
  createdAt: string;
}

export interface AnswerRecord {
  id: string;
  questionId: string;
  domainId: DomainId;
  selectedAnswers: string[];
  correct: boolean;
  answeredAt: string;
  durationSeconds: number;
  mode: "practice" | "review" | "exam";
}

export interface ReviewCardState {
  questionId: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
  mistakeType: MistakeType;
  favorite: boolean;
}

export interface ExamRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  questionIds: string[];
  answers: Record<string, string[]>;
  score: number;
  domainScores: Partial<Record<DomainId, number>>;
}

export interface AISettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AppData {
  version: 1;
  questions: Question[];
  answers: AnswerRecord[];
  reviews: ReviewCardState[];
  exams: ExamRecord[];
  streakDates: string[];
  ai: AISettings;
}
