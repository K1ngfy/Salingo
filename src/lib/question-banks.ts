import type { BankId, DomainId, Question, QuestionBank, UserPreferences } from "./types";

const OFFICIAL_SECTION_COUNTS = [100, 100, 101, 100, 100, 100, 100, 100, 125, 125, 125, 125] as const;
const OFFICIAL_SECTION_NAMES = [
  ["安全与风险管理", "Security and Risk Management"],
  ["资产安全", "Asset Security"],
  ["安全架构与工程", "Security Architecture and Engineering"],
  ["通信与网络安全", "Communication and Network Security"],
  ["身份与访问管理", "Identity and Access Management"],
  ["安全评估与测试", "Security Assessment and Testing"],
  ["安全运营", "Security Operations"],
  ["软件开发安全", "Software Development Security"],
  ["模拟测试 1", "Practice Test 1"],
  ["模拟测试 2", "Practice Test 2"],
  ["模拟测试 3", "Practice Test 3"],
  ["模拟测试 4", "Practice Test 4"],
] as const;

export const ORIGINAL_BANK_ID: BankId = "salingo-original";
export const ESSENTIALS_BANK_ID: BankId = "cissp2508-essentials";
export const OFFICIAL_BANK_ID: BankId = "official-practice-tests";

export const QUESTION_BANKS: QuestionBank[] = [
  {
    id: ORIGINAL_BANK_ID,
    name: "Salingo 原创题库",
    english: "Salingo Original Bank",
    description: "按现行 CISSP 八域考纲编写的原创练习与变式题。",
    questionCount: 800,
    enabledQuestionCount: 800,
    version: 4,
    sections: Array.from({ length: 8 }, (_, index) => ({
      id: `d${index + 1}`,
      number: index + 1,
      name: OFFICIAL_SECTION_NAMES[index][0],
      english: OFFICIAL_SECTION_NAMES[index][1],
      domainId: `d${index + 1}` as DomainId,
      questionCount: 100,
    })),
  },
  {
    id: ESSENTIALS_BANK_ID,
    name: "精华版题库",
    english: "CISSP Essentials Bank",
    description: "用户提供的 CISSP2508 模拟题，共 277 道精选练习。",
    questionCount: 277,
    enabledQuestionCount: 277,
    version: 2,
    dataUrl: "/data/question-banks/cissp2508-essentials.json",
    sections: Array.from({ length: 8 }, (_, index) => ({
      id: `d${index + 1}`,
      number: index + 1,
      name: OFFICIAL_SECTION_NAMES[index][0],
      english: OFFICIAL_SECTION_NAMES[index][1],
      domainId: `d${index + 1}` as DomainId,
      questionCount: [50, 8, 26, 40, 52, 31, 16, 54][index],
    })),
  },
  {
    id: OFFICIAL_BANK_ID,
    name: "CISSP Official Practice Tests 双语题库",
    english: "CISSP Official Practice Tests Bilingual",
    description: "用户提供的双语官方练习题；来源版本未注明。",
    questionCount: 1301,
    enabledQuestionCount: 1276,
    version: 1,
    dataUrl: "/data/question-banks/official-practice-tests.json",
    sections: OFFICIAL_SECTION_NAMES.map(([name, english], index) => ({
      id: index < 8 ? `d${index + 1}` : `practice-test-${index - 7}`,
      number: index + 1,
      name,
      english,
      domainId: index < 8 ? `d${index + 1}` as DomainId : undefined,
      questionCount: OFFICIAL_SECTION_COUNTS[index],
    })),
  },
];

export const DEFAULT_PREFERENCES: UserPreferences = {
  activeBankId: ORIGINAL_BANK_ID,
  contentLanguage: "zh",
  questionAssistEnabled: true,
};

export function getQuestionBank(id?: string) {
  return QUESTION_BANKS.find((bank) => bank.id === id) ?? QUESTION_BANKS[0];
}

export function isBankId(value: string | null | undefined): value is BankId {
  return QUESTION_BANKS.some((bank) => bank.id === value);
}

export function questionBankId(question: Question): BankId {
  return question.bankId ?? ORIGINAL_BANK_ID;
}

export function questionSectionId(question: Question) {
  return question.sectionId ?? question.domainId ?? "unclassified";
}

export function isPracticeEnabled(question: Question) {
  return question.practiceEnabled !== false;
}

export function normalizeSeedQuestion(question: Question): Question {
  return {
    ...question,
    bankId: question.bankId ?? ORIGINAL_BANK_ID,
    sectionId: question.sectionId ?? question.domainId ?? "unclassified",
    practiceEnabled: question.practiceEnabled ?? true,
    requiresFigure: question.requiresFigure ?? false,
  };
}
