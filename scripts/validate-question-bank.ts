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
  if (original.length !== 1077) throw new Error(`Expected 1077 original questions, received ${original.length}.`);
  if (originalIds.size !== original.length) throw new Error("Original question IDs must be unique.");
  for (const domainId of ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"] as const) {
    if (original.filter((question) => question.domainId === domainId).length < 80) throw new Error(`${domainId} has insufficient original coverage.`);
  }

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
  for (const question of official) {
    const optionIds = new Set(question.options.map((option) => option.id));
    const englishIds = question.translations?.en?.options.map((option) => option.id).join();
    if (question.options.map((option) => option.id).join() !== englishIds) throw new Error(`${question.id} has mismatched bilingual option IDs.`);
    if (question.type === "matching") {
      if (question.matchingPrompts.some((prompt) => !optionIds.has(question.correctMatches[prompt.id]))) throw new Error(`${question.id} has an invalid matching answer.`);
      if (Object.keys(question.correctMatches).length !== question.matchingPrompts.length) throw new Error(`${question.id} has incomplete matching answers.`);
    } else if (question.correctAnswers.some((answer) => !optionIds.has(answer))) throw new Error(`${question.id} has an invalid answer.`);
  }
  const audit = JSON.parse(await readFile(resolve(process.cwd(), "public/data/question-banks/official-practice-tests-repairs.json"), "utf8")) as { repairs?: unknown[] };
  if (audit.repairs?.length !== 5) throw new Error("Expected five audited answer repairs.");
  console.log(`Validated ${original.length} original and ${official.length} official bilingual questions.`);
}

void main();
