import { PREP_CONTENT } from "../src/data/prep-source";
import { DOMAINS } from "../src/lib/domains";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const ids = [
  ...PREP_CONTENT.objectives.map((item) => item.id),
  ...PREP_CONTENT.cards.map((item) => item.id),
  ...PREP_CONTENT.checklist.map((item) => item.id),
];
assert(new Set(ids).size === ids.length, "Prep content IDs must be globally unique.");
assert(DOMAINS.reduce((sum, domain) => sum + domain.weight, 0) === 100, "Domain weights must total 100.");
assert(PREP_CONTENT.objectives.length === 62, `Expected 62 outline objectives, found ${PREP_CONTENT.objectives.length}.`);
assert(PREP_CONTENT.cards.filter((card) => card.kind === "knowledge").length === 88, "Expected 88 knowledge verification cards.");
assert(PREP_CONTENT.cards.filter((card) => card.kind === "vocabulary").length === 85, "Expected 85 vocabulary cards.");
assert(PREP_CONTENT.cards.filter((card) => card.kind === "strategy").length >= 10, "Expected at least 10 strategy cards.");
for (const domain of DOMAINS) assert(PREP_CONTENT.objectives.some((objective) => objective.domainId === domain.id), `${domain.id} is missing outline objectives.`);
for (const card of PREP_CONTENT.cards) {
  assert(card.title.trim() && card.front.trim() && card.back.trim(), `${card.id} contains empty content.`);
  assert(card.sources.length > 0, `${card.id} must preserve provenance.`);
  if (card.reviewEligible) assert(card.verificationStatus === "verified", `${card.id} cannot enter review before verification.`);
  for (const objectiveId of card.objectiveIds) assert(PREP_CONTENT.objectives.some((objective) => objective.id === objectiveId), `${card.id} references unknown objective ${objectiveId}.`);
}
for (const item of PREP_CONTENT.checklist) assert(item.source.document && item.source.page > 0, `${item.id} is missing source metadata.`);
console.log(`Prep content valid: 62 objectives, 88 knowledge notes, 85 vocabulary cards, ${PREP_CONTENT.checklist.length} checklist items.`);
