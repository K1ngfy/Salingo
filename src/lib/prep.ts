import { DOMAINS } from "./domains";
import type { AnswerRecord, OutlineObjective, OutlineProgress, PrepProfile, ReviewCardState } from "./types";

export const DEFAULT_PREP_PROFILE: PrepProfile = {
  studyWeekdays: [1, 2, 3, 4, 5, 6],
  dailyQuestionTarget: 20,
  startedAt: new Date(0).toISOString(),
  favoriteCardIds: [],
};

export function reviewId(targetType: "question" | "prep-card", targetId: string) {
  return `${targetType}:${targetId}`;
}

export function isStudyDay(date: Date, profile: PrepProfile) {
  return profile.studyWeekdays.includes(date.getDay());
}

export function daysUntil(dateValue: string | undefined, now = new Date()) {
  if (!dateValue) return undefined;
  const target = new Date(`${dateValue}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

export function smoothedAccuracy(answers: AnswerRecord[]) {
  const correct = answers.filter((answer) => answer.correct).length;
  return (correct + 5) / (answers.length + 10);
}

export function domainQuestionAllocation(answers: AnswerRecord[], target: number) {
  const priorities = DOMAINS.map((domain) => {
    const subset = answers.filter((answer) => answer.domainId === domain.id);
    return { domainId: domain.id, priority: domain.weight * (1 - smoothedAccuracy(subset)) };
  });
  const total = priorities.reduce((sum, item) => sum + item.priority, 0) || 1;
  const exact = priorities.map((item) => ({ ...item, exact: target * item.priority / total }));
  const result = exact.map((item) => ({ domainId: item.domainId, count: Math.floor(item.exact), remainder: item.exact % 1 }));
  let remaining = target - result.reduce((sum, item) => sum + item.count, 0);
  for (const item of [...result].sort((a, b) => b.remainder - a.remainder)) {
    if (remaining <= 0) break;
    item.count += 1;
    remaining -= 1;
  }
  return result.map(({ domainId, count }) => ({ domainId, count })).filter((item) => item.count > 0);
}

export type PrepPhase = "foundation" | "practice" | "sprint" | "exam-day";

export function prepPhase(profile: PrepProfile, now = new Date()): PrepPhase {
  const remaining = daysUntil(profile.examDate, now);
  if (remaining === undefined || remaining > 56) return "foundation";
  if (remaining <= 0) return "exam-day";
  if (remaining <= 14) return "sprint";
  return "practice";
}

export function shouldScheduleMock(profile: PrepProfile, now = new Date()) {
  const remaining = daysUntil(profile.examDate, now);
  if (remaining !== undefined && remaining <= 2) return false;
  if (!isStudyDay(now, profile)) return false;
  const start = new Date(profile.startedAt);
  let studyDays = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (cursor <= end) {
    if (isStudyDay(cursor, profile)) studyDays += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return studyDays > 0 && studyDays % 7 === 0;
}

export function nextObjective(objectives: OutlineObjective[], progress: OutlineProgress[], answers: AnswerRecord[]) {
  const statuses = new Map(progress.map((item) => [item.objectiveId, item.status]));
  const allocation = domainQuestionAllocation(answers, 100);
  const priority = new Map(allocation.map((item) => [item.domainId, item.count]));
  return [...objectives]
    .filter((objective) => statuses.get(objective.id) !== "mastered")
    .sort((a, b) => (priority.get(b.domainId) ?? 0) - (priority.get(a.domainId) ?? 0)
      || (statuses.get(a.id) === "learning" ? -1 : 0) - (statuses.get(b.id) === "learning" ? -1 : 0)
      || a.number.localeCompare(b.number, undefined, { numeric: true }))[0];
}

export function buildTodayPlan(input: {
  profile: PrepProfile;
  answers: AnswerRecord[];
  reviews: ReviewCardState[];
  objectives: OutlineObjective[];
  outlineProgress: OutlineProgress[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const dueReviews = input.reviews.filter((review) => new Date(review.due) <= now).length;
  const start = new Date(input.profile.startedAt);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let previousStudyDays = 0;
  while (cursor < today) {
    if (isStudyDay(cursor, input.profile)) previousStudyDays += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  const completedSinceStart = input.answers.filter((answer) => new Date(answer.answeredAt) >= start && new Date(answer.answeredAt) < today).length;
  const carryover = Math.max(0, previousStudyDays * input.profile.dailyQuestionTarget - completedSinceStart);
  const dailyCapacity = Math.min(input.profile.dailyQuestionTarget * 2, input.profile.dailyQuestionTarget + carryover);
  const questionTarget = Math.max(0, dailyCapacity - dueReviews);
  return {
    isStudyDay: isStudyDay(now, input.profile),
    phase: prepPhase(input.profile, now),
    daysRemaining: daysUntil(input.profile.examDate, now),
    dueReviews,
    carryover: Math.min(carryover, input.profile.dailyQuestionTarget),
    questionTarget,
    allocation: domainQuestionAllocation(input.answers, questionTarget),
    objective: nextObjective(input.objectives, input.outlineProgress, input.answers),
    scheduleMock: shouldScheduleMock(input.profile, now),
  };
}

const ENGLISH_KEYWORDS = /\b(MOST|HIGHEST|LEAST|LOWEST|BEST|FIRST|SECOND|LAST|FASTEST|MUST|SHOULD|NOT|EXCEPT|PURPOSE|FUNCTION|EFFECTIVE|PRIMARY)\b/gi;
const CHINESE_KEYWORDS = /(最重要|最高|最少|最低|最佳|首先|其次|最后|最快|必须|应该|不是|不属于|除外|目的|功能|最有效|主要)/g;

export function splitQuestionKeywords(text: string) {
  const pattern = new RegExp(`(${ENGLISH_KEYWORDS.source}|${CHINESE_KEYWORDS.source})`, "gi");
  return text.split(pattern).filter(Boolean).map((value) => ({ value, highlighted: new RegExp(`^(?:${ENGLISH_KEYWORDS.source}|${CHINESE_KEYWORDS.source})$`, "i").test(value) }));
}

export function questionReadingWarnings(text: string) {
  const warnings: string[] = [];
  const negatives = text.match(/\b(?:NOT|EXCEPT|NEVER|LEAST)\b|不(?:是|属于|应该|能|会)|没有/gi) ?? [];
  if (negatives.length >= 2) warnings.push("题干可能包含双重否定，请先改写为肯定句再判断。");
  if (/\b(?:PURPOSE|FUNCTION)\b|目的|功能/i.test(text)) warnings.push("注意区分“目的”与“功能”：先回答题目真正询问的层级。");
  if (/\b(?:FIRST|BEST|MOST|PRIMARY)\b|首先|最佳|最重要|主要/i.test(text)) warnings.push("这是优先级题，先比较治理、风险和业务目标，再比较技术细节。");
  return warnings;
}
