import { SEED_QUESTIONS } from "./questions";
import { EXTENDED_QUESTIONS } from "./questions-extended";
import type { Question } from "@/lib/types";

const CONTEXTS = [
  "跨国医疗集团", "区域商业银行", "云原生电商平台", "城市轨道交通运营方", "全球制造企业",
  "高校科研联盟", "公共事业单位", "金融科技初创公司", "航空服务集团", "连锁零售企业",
] as const;

function rotateQuestion(seed: Question, variant: number): Question {
  if (variant === 0) return seed;
  const shift = variant % seed.options.length;
  const rotated = [...seed.options.slice(shift), ...seed.options.slice(0, shift)];
  const oldToNew = new Map<string, string>();
  const options = rotated.map((option, index) => {
    const id = String.fromCharCode(65 + index);
    oldToNew.set(option.id, id);
    return { id, text: option.text };
  });
  const optionAnalysis = Object.fromEntries(
    rotated.map((option, index) => [String.fromCharCode(65 + index), seed.explanation.optionAnalysis[option.id]]),
  );
  return {
    ...seed,
    id: `${seed.id}-v${String(variant + 1).padStart(2, "0")}`,
    stem: `在${CONTEXTS[variant]}的安全治理场景中，${seed.stem}`,
    options,
    correctAnswers: seed.correctAnswers.map((id) => oldToNew.get(id) ?? id).sort(),
    explanation: { ...seed.explanation, optionAnalysis },
    tags: [...seed.tags, CONTEXTS[variant]],
  };
}

const BLUEPRINTS = [...SEED_QUESTIONS, ...EXTENDED_QUESTIONS];

/** 80 个原创知识蓝本 × 10 个组织情境与选项排列 = 800 道本地练习。 */
export const INITIAL_QUESTIONS: Question[] = BLUEPRINTS.flatMap((seed) =>
  CONTEXTS.map((_, variant) => rotateQuestion(seed, variant)),
);
