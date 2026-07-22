import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { questionArraySchema } from "../src/lib/validation";
import { isPracticeEnabled } from "../src/lib/question-banks";

async function readQuestions(path: string) {
  return questionArraySchema.parse(JSON.parse(await readFile(resolve(process.cwd(), path), "utf8")));
}

async function main() {
  const original = await readQuestions("public/data/questions.json");
  const originalIds = new Set(original.map((question) => question.id));
  if (original.length !== 800) throw new Error(`Expected 800 original questions, received ${original.length}.`);
  if (originalIds.size !== original.length) throw new Error("Original question IDs must be unique.");
  for (const domainId of ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"] as const) {
    if (original.filter((question) => question.domainId === domainId).length !== 100) throw new Error(`${domainId} must contain 100 original questions.`);
  }

  const essentials = await readQuestions("public/data/question-banks/cissp2508-essentials.json");
  const essentialsIds = new Set(essentials.map((question) => question.id));
  if (essentials.length !== 277 || essentialsIds.size !== 277) throw new Error("Essentials bank must contain 277 unique questions.");
  const essentialSectionCounts = [50, 8, 26, 40, 52, 31, 16, 54];
  essentialSectionCounts.forEach((count, index) => {
    const sectionId = `d${index + 1}`;
    const actual = essentials.filter((question) => question.sectionId === sectionId).length;
    if (actual !== count) throw new Error(`Essentials ${sectionId} expected ${count} questions, received ${actual}.`);
  });
  if (essentials.some((question) => question.bankId !== "cissp2508-essentials")) throw new Error("Every essentials question must use the essentials bank ID.");
  if (essentials.some((question) => question.sourceReference !== "CISSP2508模拟题_含答案.csv")) throw new Error("Every essentials question must preserve CSV provenance.");

  const official = await readQuestions("public/data/question-banks/official-practice-tests.json");
  const officialIds = new Set(official.map((question) => question.id));
  if (official.length !== 1301 || officialIds.size !== 1301) throw new Error("Official bank must contain 1301 unique questions.");
  const expectedSections = [100, 100, 101, 100, 100, 100, 100, 100, 125, 125, 125, 125];
  expectedSections.forEach((count, index) => {
    const sectionId = index < 8 ? `d${index + 1}` : `practice-test-${index - 7}`;
    const actual = official.filter((question) => question.sectionId === sectionId).length;
    if (actual !== count) throw new Error(`${sectionId} expected ${count} questions, received ${actual}.`);
  });
  const sourceCounts = Object.fromEntries(["multiple_choice", "select_all_that_apply", "matching", "diagram_or_figure_based"].map((type) => [type, official.filter((question) => question.tags.includes(type)).length]));
  if (sourceCounts.multiple_choice !== 1214 || sourceCounts.select_all_that_apply !== 47 || sourceCounts.matching !== 15 || sourceCounts.diagram_or_figure_based !== 25) {
    throw new Error(`Unexpected source type counts: ${JSON.stringify(sourceCounts)}.`);
  }
  if (official.filter((question) => question.requiresFigure).length !== 25) throw new Error("Expected 25 figure-based questions.");
  if (official.filter((question) => question.type === "matching").length !== 16) throw new Error("Expected 16 interactive matching questions, including one source row mislabeled as multiple choice.");
  if (official.filter(isPracticeEnabled).length !== 1276) throw new Error("Expected 1276 practice-enabled questions.");
  if (official.some((question) => !question.translations?.en)) throw new Error("Every official question must include English content.");
  const contaminatedOption = /(?:For|answer) questions?\s+\d+\s*[–-]\s*\d+|对于问题\s*\d+|第\s*\d+\s*[–-]\s*\d+\s*题/i;
  for (const question of official) {
    const optionIds = new Set(question.options.map((option) => option.id));
    const englishIds = question.translations?.en?.options.map((option) => option.id).join();
    if (question.options.map((option) => option.id).join() !== englishIds) throw new Error(`${question.id} has mismatched bilingual option IDs.`);
    if (question.options.some((option) => contaminatedOption.test(option.text)) || question.translations?.en?.options.some((option) => contaminatedOption.test(option.text))) {
      throw new Error(`${question.id} has shared scenario content inside an answer option.`);
    }
    if (question.type === "matching") {
      if (question.matchingPrompts.some((prompt) => !optionIds.has(question.correctMatches[prompt.id]))) throw new Error(`${question.id} has an invalid matching answer.`);
      if (Object.keys(question.correctMatches).length !== question.matchingPrompts.length) throw new Error(`${question.id} has incomplete matching answers.`);
    } else if (question.correctAnswers.some((answer) => !optionIds.has(answer))) throw new Error(`${question.id} has an invalid answer.`);
  }
  const audit = JSON.parse(await readFile(resolve(process.cwd(), "public/data/question-banks/official-practice-tests-repairs.json"), "utf8")) as { repairs?: unknown[]; scenarioRepairs?: unknown[] };
  if (audit.repairs?.length !== 5) throw new Error("Expected five audited answer repairs.");
  if (audit.scenarioRepairs?.length !== 44) throw new Error("Expected 44 audited scenario spillover repairs.");
  const allIds = new Set([...originalIds, ...essentialsIds, ...officialIds]);
  if (allIds.size !== original.length + essentials.length + official.length) throw new Error("Question IDs must be unique across all banks.");
  console.log(`Validated ${original.length} original, ${essentials.length} essentials, and ${official.length} official bilingual questions.`);
}

void main();
