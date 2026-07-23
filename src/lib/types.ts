export type DomainId = "d1" | "d2" | "d3" | "d4" | "d5" | "d6" | "d7" | "d8";
export type QuestionType = "single" | "multiple" | "matching";
export type Difficulty = "基础" | "进阶" | "高难" | "陷阱";
export type MistakeType = "概念盲区" | "审题失误" | "混淆考点";
export type ReviewTargetType = "question" | "prep-card";
export type OutlineProgressStatus = "not-started" | "learning" | "mastered";
export type PrepCardKind = "strategy" | "knowledge" | "vocabulary";
export type VerificationStatus = "verified" | "disputed" | "outdated" | "pending";
export type BankId = "salingo-original" | "cissp2508-essentials" | "official-practice-tests";
export type ContentLanguage = "zh" | "en" | "bilingual";

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

export interface LocalizedQuestionContent {
  stem: string;
  options: Array<{ id: string; text: string }>;
  explanation: string;
  matchingPrompts?: Array<{ id: string; text: string }>;
}

interface BaseQuestion {
  id: string;
  bankId?: BankId;
  sectionId?: string;
  domainId?: DomainId;
  difficulty: Difficulty;
  tags: string[];
  stem: string;
  options: Array<{ id: string; text: string }>;
  explanation: Explanation;
  translations?: { en?: LocalizedQuestionContent };
  practiceEnabled?: boolean;
  requiresFigure?: boolean;
  source: "original" | "ai" | "imported";
  outlineVersion: "2024-current" | "source-unspecified";
  sourceReference?: string;
  createdAt: string;
}

export interface ChoiceQuestion extends BaseQuestion {
  type: "single" | "multiple";
  correctAnswers: string[];
}

export interface MatchingQuestion extends BaseQuestion {
  type: "matching";
  matchingPrompts: Array<{ id: string; text: string }>;
  correctMatches: Record<string, string>;
}

export type Question = ChoiceQuestion | MatchingQuestion;

export type AnswerResponse =
  | { kind: "choice"; selectedAnswers: string[] }
  | { kind: "matching"; matches: Record<string, string> };

export interface AnswerRecord {
  id: string;
  questionId: string;
  bankId: BankId;
  sectionId: string;
  domainId?: DomainId;
  response: AnswerResponse;
  correct: boolean;
  answeredAt: string;
  durationSeconds: number;
  mode: "practice" | "review" | "exam" | "sweep";
}

export interface ReviewCardState {
  id: string;
  targetType: ReviewTargetType;
  targetId: string;
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
  bankId: BankId;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  questionIds: string[];
  answers: Record<string, AnswerResponse>;
  score: number;
  domainScores: Partial<Record<DomainId, number>>;
  sectionScores: Record<string, number>;
}

export interface AISettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface UserPreferences {
  activeBankId: BankId;
  contentLanguage: ContentLanguage;
  questionAssistEnabled: boolean;
}

export interface ContentSource {
  document: string;
  page: number;
  author?: string;
  publishedAt?: string;
  outlineVersion?: string;
  url?: string;
  verifiedAt?: string;
}

export interface OutlineObjective {
  id: string;
  domainId: DomainId;
  number: string;
  title: string;
  bullets: string[];
  source: ContentSource;
}

export interface PrepCard {
  id: string;
  kind: PrepCardKind;
  title: string;
  front: string;
  back: string;
  domainId?: DomainId;
  objectiveIds: string[];
  verificationStatus: VerificationStatus;
  reviewEligible: boolean;
  correction?: string;
  sources: ContentSource[];
}

export interface PrepChecklistItem {
  id: string;
  category: "eligibility" | "booking" | "identity" | "travel" | "exam-day" | "wellbeing";
  title: string;
  description: string;
  dynamic: boolean;
  source: ContentSource;
}

export interface PrepContent {
  version: 1;
  outlineEffectiveDate: string;
  generatedAt: string;
  objectives: OutlineObjective[];
  cards: PrepCard[];
  checklist: PrepChecklistItem[];
}

export interface PrepProfile {
  examDate?: string;
  studyWeekdays: number[];
  dailyQuestionTarget: number;
  startedAt: string;
  favoriteCardIds: string[];
}

export interface OutlineProgress {
  objectiveId: string;
  status: OutlineProgressStatus;
  updatedAt: string;
}

export interface ChecklistProgress {
  itemId: string;
  completed: boolean;
  updatedAt: string;
}

export interface QuestionBankSection {
  id: string;
  number: number;
  name: string;
  english: string;
  domainId?: DomainId;
  questionCount: number;
}

export interface QuestionBank {
  id: BankId;
  name: string;
  english: string;
  description: string;
  questionCount: number;
  enabledQuestionCount: number;
  version: number;
  dataUrl?: string;
  sections: QuestionBankSection[];
}

export interface CommunityProfile {
  userId: string;
  publicId: string;
  nickname: string;
  recoveryCode: string;
}

export interface AppData {
  version: 3;
  questions: Question[];
  answers: AnswerRecord[];
  reviews: ReviewCardState[];
  exams: ExamRecord[];
  streakDates: string[];
  ai: AISettings;
  preferences: UserPreferences;
  prepProfile: PrepProfile;
  outlineProgress: OutlineProgress[];
  checklistProgress: ChecklistProgress[];
}
