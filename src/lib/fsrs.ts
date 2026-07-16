import { createEmptyCard, fsrs, Rating, type Card, State } from "ts-fsrs";
import type { MistakeType, ReviewCardState } from "./types";
import { reviewId } from "./prep";

const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 3650, enable_fuzz: true });

function toCard(review?: ReviewCardState): Card {
  if (!review) return createEmptyCard(new Date());
  return {
    due: new Date(review.due),
    stability: review.stability,
    difficulty: review.difficulty,
    elapsed_days: review.elapsed_days,
    scheduled_days: review.scheduled_days,
    learning_steps: review.learning_steps ?? 0,
    reps: review.reps,
    lapses: review.lapses,
    state: review.state as State,
    last_review: review.last_review ? new Date(review.last_review) : undefined,
  };
}

export function scheduleReview(
  targetId: string,
  previous: ReviewCardState | undefined,
  correct: boolean,
  mistakeType: MistakeType = "概念盲区",
  targetType: "question" | "prep-card" = "question",
): ReviewCardState {
  const result = scheduler.next(toCard(previous), new Date(), correct ? Rating.Good : Rating.Again);
  return {
    id: reviewId(targetType, targetId),
    targetType,
    targetId,
    due: result.card.due.toISOString(),
    stability: result.card.stability,
    difficulty: result.card.difficulty,
    elapsed_days: result.card.elapsed_days,
    scheduled_days: result.card.scheduled_days,
    learning_steps: result.card.learning_steps,
    reps: result.card.reps,
    lapses: result.card.lapses,
    state: result.card.state,
    last_review: result.card.last_review?.toISOString(),
    mistakeType: previous?.mistakeType ?? mistakeType,
    favorite: previous?.favorite ?? false,
  };
}
