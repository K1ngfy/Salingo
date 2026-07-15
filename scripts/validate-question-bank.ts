import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { questionArraySchema } from "../src/lib/validation";

async function main() {
  const text = await readFile(resolve(process.cwd(), "public/data/questions.json"), "utf8");
  const questions = questionArraySchema.parse(JSON.parse(text));
  const ids = new Set(questions.map((question) => question.id));
  if (questions.length < 800) throw new Error(`Expected at least 800 questions, received ${questions.length}.`);
  if (ids.size !== questions.length) throw new Error("Question IDs must be unique.");
  for (const domainId of ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"] as const) {
    const domainQuestions = questions.filter((question) => question.domainId === domainId);
    if (domainQuestions.length < 80) throw new Error(`${domainId} has insufficient coverage: ${domainQuestions.length}.`);
  }
  if (questions.some((question) => question.outlineVersion !== "2024-current")) {
    throw new Error("Every question must target the current official outline.");
  }
  console.log(`Validated ${questions.length} questions across all eight domains.`);
}

void main();
