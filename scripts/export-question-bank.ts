import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { INITIAL_QUESTIONS } from "../src/data/full-bank";
import { CISSP2508_QUESTIONS } from "../src/data/cissp2508";
import { convertOfficialPracticeTests, parseCsv } from "./import-official-practice-tests";

async function main() {
  const outputDirectory = resolve(process.cwd(), "public/data");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    resolve(outputDirectory, "questions.json"),
    `${JSON.stringify(INITIAL_QUESTIONS, null, 2)}\n`,
    "utf8",
  );
  const sourcePath = resolve(process.cwd(), "src/data/imports/official-practice-tests-bilingual.csv");
  const { questions, repairs, scenarioRepairs } = convertOfficialPracticeTests(parseCsv(await readFile(sourcePath, "utf8")));
  const bankDirectory = resolve(outputDirectory, "question-banks");
  await mkdir(bankDirectory, { recursive: true });
  await writeFile(resolve(bankDirectory, "cissp2508-essentials.json"), `${JSON.stringify(CISSP2508_QUESTIONS, null, 2)}\n`, "utf8");
  await writeFile(resolve(bankDirectory, "official-practice-tests.json"), `${JSON.stringify(questions, null, 2)}\n`, "utf8");
  await writeFile(resolve(bankDirectory, "official-practice-tests-repairs.json"), `${JSON.stringify({
    bankId: "official-practice-tests",
    source: "src/data/imports/official-practice-tests-bilingual.csv",
    repairs,
    scenarioRepairs,
  }, null, 2)}\n`, "utf8");
  console.log(`Exported ${INITIAL_QUESTIONS.length} original, ${CISSP2508_QUESTIONS.length} essentials, and ${questions.length} official practice-test questions.`);
}

void main();
