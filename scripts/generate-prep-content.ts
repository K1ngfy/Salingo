import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PREP_CONTENT } from "../src/data/prep-source";

const output = resolve("public/data/prep/cissp-prep-2024-v1.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(PREP_CONTENT, null, 2)}\n`, "utf8");
console.log(`Generated ${output}: ${PREP_CONTENT.objectives.length} objectives, ${PREP_CONTENT.cards.length} cards, ${PREP_CONTENT.checklist.length} checklist items.`);
