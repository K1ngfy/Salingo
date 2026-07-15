import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { INITIAL_QUESTIONS } from "../src/data/full-bank";

async function main() {
  const outputDirectory = resolve(process.cwd(), "public/data");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    resolve(outputDirectory, "questions.json"),
    `${JSON.stringify(INITIAL_QUESTIONS, null, 2)}\n`,
    "utf8",
  );
  console.log(`Exported ${INITIAL_QUESTIONS.length} original practice questions.`);
}

void main();
