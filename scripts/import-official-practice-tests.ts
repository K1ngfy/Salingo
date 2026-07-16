import type { ChoiceQuestion, DomainId, MatchingQuestion, Question } from "../src/lib/types";

export interface SourceRow {
  chapter_number: string;
  chapter_en: string;
  chapter_zh: string;
  question_number: string;
  question_type: string;
  question_en: string;
  options_en: string;
  question_zh: string;
  options_zh: string;
  answer_key_en: string;
  explanation_en: string;
  explanation_zh: string;
}

export interface AnswerRepair {
  sourceId: string;
  original: string;
  repaired: string;
  reason: string;
}

const ANSWER_REPAIRS: Record<string, { answer: string; reason: string }> = {
  "3:31": { answer: "B", reason: "原答案为空；英文解析明确指出 Kerckhoffs’ principle。" },
  "2:100": { answer: "1-B; 2-A; 3-C; 4-C", reason: "原匹配答案截断且第 2 项错位；英文解析列出完整映射。" },
  "5:98": { answer: "1-E; 2-B; 3-D; 4-C; 5-A", reason: "原匹配答案缺少第 2、4 项；英文解析列出完整映射。" },
  "5:100": { answer: "1-A; 2-E; 3-D; 4-B; 5-C", reason: "原匹配答案缺少第 2、4 项；英文解析列出完整映射。" },
  "9:125": { answer: "A-1; B-2; C-3; D-1; E-2; F-3; G-1", reason: "原答案为空；英文解析逐项说明七个因素所属类型。" },
};

const CREATED_AT = "2026-07-16T00:00:00.000Z";

export function parseCsv(text: string): SourceRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");

  const headers = rows.shift();
  if (!headers) return [];
  return rows.filter((values) => values.some(Boolean)).map((values, rowIndex) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${rowIndex + 2} has ${values.length} columns; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]])) as unknown as SourceRow;
  });
}

function parseOptions(text: string) {
  const record = JSON.parse(text) as Record<string, string>;
  return Object.entries(record).map(([id, value]) => ({ id, text: value.trim() }));
}

function cleanTrailingLabel(text: string) {
  return text.replace(/\s+(Descriptions?|Definitions?|Categories|Level of knowledge|SOC report descriptions)\s*$/i, "").trim();
}

function numberedPrompts(text: string) {
  const start = text.search(/(?:^|\s)1\.\s+/);
  if (start < 0) return { stem: text.trim(), prompts: [] as Array<{ id: string; text: string }> };
  const stem = text.slice(0, start).trim();
  const segment = text.slice(start);
  const prompts: Array<{ id: string; text: string }> = [];
  const regex = /(?:^|\s)(\d+)\.\s+(.+?)(?=(?:\s+\d+\.\s+)|$)/g;
  for (const match of segment.matchAll(regex)) prompts.push({ id: match[1], text: cleanTrailingLabel(match[2]) });
  return { stem, prompts };
}

function parseMatches(answer: string) {
  return Object.fromEntries(answer.split(";").map((part) => {
    const [from, to] = part.trim().split("-");
    if (!from || !to) throw new Error(`Invalid matching answer: ${answer}`);
    return [from, to];
  }));
}

function optionAnalysis(options: Array<{ id: string }>) {
  return Object.fromEntries(options.map((option) => [option.id, ""]));
}

function common(row: SourceRow, optionsZh: Array<{ id: string; text: string }>, optionsEn: Array<{ id: string; text: string }>) {
  const chapter = Number(row.chapter_number);
  return {
    id: `official-practice-tests-c${String(chapter).padStart(2, "0")}-q${String(row.question_number).padStart(3, "0")}`,
    bankId: "official-practice-tests" as const,
    sectionId: chapter <= 8 ? `d${chapter}` : `practice-test-${chapter - 8}`,
    domainId: chapter <= 8 ? `d${chapter}` as DomainId : undefined,
    difficulty: "进阶" as const,
    tags: [row.chapter_zh, "Official Practice Tests", row.question_type],
    stem: row.question_zh.trim(),
    options: optionsZh,
    explanation: {
      logic: row.explanation_zh.trim(),
      optionAnalysis: optionAnalysis(optionsZh),
      knowledgePoint: chapter <= 8 ? `D${chapter} · ${row.chapter_zh}` : row.chapter_zh,
      plainLanguage: "原题已提供双语解析；如需逐项排错，可使用 AI 深度解析。",
    },
    translations: {
      en: {
        stem: row.question_en.trim(),
        options: optionsEn,
        explanation: row.explanation_en.trim(),
      },
    },
    practiceEnabled: row.question_type !== "diagram_or_figure_based",
    requiresFigure: row.question_type === "diagram_or_figure_based",
    source: "imported" as const,
    outlineVersion: "source-unspecified" as const,
    sourceReference: `CISSP Official Practice Tests bilingual CSV · chapter ${chapter} question ${row.question_number} · ${row.question_type}`,
    createdAt: CREATED_AT,
  };
}

function matchingQuestion(row: SourceRow, answer: string, optionsZh: Array<{ id: string; text: string }>, optionsEn: Array<{ id: string; text: string }>): MatchingQuestion {
  const base = common(row, optionsZh, optionsEn);
  if (row.chapter_number === "9" && row.question_number === "125") {
    const promptsZh = optionsZh.map((item) => ({ ...item, text: item.text.replace(/\s*类型\s*1\.[\s\S]*$/, "").trim() }));
    const promptsEn = optionsEn.map((item) => ({ ...item, text: item.text.replace(/\s*Types\s*1\.[\s\S]*$/, "").trim() }));
    const targetsZh = [
      { id: "1", text: "你知道的事物" },
      { id: "2", text: "你拥有的事物" },
      { id: "3", text: "你本身的特征" },
    ];
    const targetsEn = [
      { id: "1", text: "Something you know" },
      { id: "2", text: "Something you have" },
      { id: "3", text: "Something you are" },
    ];
    return {
      ...base,
      type: "matching",
      stem: "将以下身份验证因素匹配到对应的因素类型。",
      matchingPrompts: promptsZh,
      options: targetsZh,
      correctMatches: parseMatches(answer),
      translations: { en: { stem: "Match each authentication factor to its factor type.", matchingPrompts: promptsEn, options: targetsEn, explanation: row.explanation_en.trim() } },
    };
  }

  const zh = numberedPrompts(row.question_zh);
  const en = numberedPrompts(row.question_en);
  if (!zh.prompts.length || zh.prompts.length !== en.prompts.length) {
    throw new Error(`Could not extract bilingual matching prompts for chapter ${row.chapter_number} question ${row.question_number}.`);
  }
  return {
    ...base,
    type: "matching",
    stem: zh.stem,
    matchingPrompts: zh.prompts,
    correctMatches: parseMatches(answer),
    translations: { en: { stem: en.stem, matchingPrompts: en.prompts, options: optionsEn, explanation: row.explanation_en.trim() } },
  };
}

export function convertOfficialPracticeTests(rows: SourceRow[]) {
  const repairs: AnswerRepair[] = [];
  const questions: Question[] = rows.map((row) => {
    const sourceId = `${row.chapter_number}:${row.question_number}`;
    const repair = ANSWER_REPAIRS[sourceId];
    const answer = repair?.answer ?? row.answer_key_en.trim();
    if (repair) repairs.push({ sourceId, original: row.answer_key_en, repaired: repair.answer, reason: repair.reason });
    if (!answer) throw new Error(`Missing answer for ${sourceId}.`);

    const optionsEn = parseOptions(row.options_en);
    const optionsZh = parseOptions(row.options_zh);
    if (optionsEn.map((item) => item.id).join() !== optionsZh.map((item) => item.id).join()) {
      throw new Error(`Bilingual option keys differ for ${sourceId}.`);
    }
    if (row.question_type === "matching" || /^\w+-\w+(?:\s*;\s*\w+-\w+)+$/.test(answer)) return matchingQuestion(row, answer, optionsZh, optionsEn);

    const correctAnswers = answer.split(",").map((value) => value.trim()).filter(Boolean);
    const question: ChoiceQuestion = {
      ...common(row, optionsZh, optionsEn),
      type: row.question_type === "select_all_that_apply" || correctAnswers.length > 1 ? "multiple" : "single",
      correctAnswers,
    };
    return question;
  });
  return { questions, repairs };
}
