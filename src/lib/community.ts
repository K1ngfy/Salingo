import { dateKey, percent } from "./utils";
import type { AnswerRecord, CommunityProfile, DomainId } from "./types";

// The leaderboard backend is served same-origin by the Sites worker at /api/community.
// For local development you can point it at a deployed Worker via NEXT_PUBLIC_COMMUNITY_URL.
const configuredCommunityUrl = process.env.NEXT_PUBLIC_COMMUNITY_URL?.replace(/\/+$/, "");
export const communityBaseUrl = configuredCommunityUrl || "/api/community";

export interface LeaderboardEntry {
  publicId: string;
  nickname: string;
  currentStreak: number;
  longestStreak: number;
  todayCount: number;
  todayDate: string | null;
  totalAnswered: number;
  lastActiveDate: string | null;
}

export interface DomainLeaderboardEntry {
  publicId: string;
  nickname: string;
  count: number;
  correct: number;
  rate: number;
}

export interface UserDayStat {
  date: string;
  count: number;
  correct: number;
}

export interface UserDomainStat {
  domainId: string;
  count: number;
  correct: number;
}

export interface UserStats {
  profile: LeaderboardEntry;
  daily: UserDayStat[];
  domains: UserDomainStat[];
}

export interface DaySyncEntry {
  date: string;
  count: number;
  correct: number;
  domains: Array<{ domainId: DomainId; count: number; correct: number }>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${communityBaseUrl}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
    });
  } catch {
    throw new Error("无法连接排行榜服务，请稍后重试");
  }
  const text = await response.text().catch(() => "");
  let payload: unknown;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    const message = (payload as { error?: string })?.error;
    throw new Error(message || `排行榜请求失败（HTTP ${response.status}）`);
  }
  return payload as T;
}

export async function createProfile(nickname: string): Promise<CommunityProfile> {
  return request<CommunityProfile>("/profile", { method: "POST", body: JSON.stringify({ nickname }) });
}

export async function restoreProfile(recoveryCode: string): Promise<CommunityProfile> {
  return request<CommunityProfile>("/restore", { method: "POST", body: JSON.stringify({ recoveryCode }) });
}

export async function syncProgress(profile: CommunityProfile, days: DaySyncEntry[]): Promise<void> {
  await request("/progress", {
    method: "POST",
    body: JSON.stringify({ userId: profile.userId, recoveryCode: profile.recoveryCode, days }),
  });
}

export async function fetchLeaderboard(type: "streak" | "today"): Promise<LeaderboardEntry[]> {
  const data = await request<{ entries: LeaderboardEntry[] }>(`/leaderboard?type=${type}`);
  return data.entries;
}

export async function fetchDomainLeaderboard(domainId: DomainId): Promise<DomainLeaderboardEntry[]> {
  const data = await request<{ entries: DomainLeaderboardEntry[] }>(`/leaderboard/domain?domainId=${domainId}`);
  return data.entries;
}

export async function fetchUserStats(publicId: string): Promise<UserStats> {
  return request<UserStats>(`/user?publicId=${encodeURIComponent(publicId)}`);
}

// Aggregate local IndexedDB answers into per-day, per-domain totals for upload.
export function buildDayHistory(answers: AnswerRecord[]): DaySyncEntry[] {
  const byDay = new Map<string, DaySyncEntry>();
  for (const answer of answers) {
    const date = dateKey(new Date(answer.answeredAt));
    let day = byDay.get(date);
    if (!day) { day = { date, count: 0, correct: 0, domains: [] }; byDay.set(date, day); }
    day.count += 1;
    if (answer.correct) day.correct += 1;
    if (answer.domainId) {
      let domain = day.domains.find((item) => item.domainId === answer.domainId);
      if (!domain) { domain = { domainId: answer.domainId, count: 0, correct: 0 }; day.domains.push(domain); }
      domain.count += 1;
      if (answer.correct) domain.correct += 1;
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildTodayEntry(answers: AnswerRecord[]): DaySyncEntry | undefined {
  const today = dateKey();
  return buildDayHistory(answers).find((day) => day.date === today);
}

// A compact fingerprint of today's local totals, used to skip redundant syncs.
export function todaySignature(answers: AnswerRecord[]): string {
  const today = buildTodayEntry(answers);
  if (!today) return "";
  const domains = today.domains.map((item) => `${item.domainId}:${item.count}/${item.correct}`).sort().join(",");
  return `${today.count}/${today.correct}|${domains}`;
}

export function domainRate(entry: { count: number; correct: number }): number {
  return percent(entry.correct, entry.count);
}

// Duolingo-style: a streak only counts as "alive" if the last active day is today or yesterday.
export function isStreakAlive(lastActiveDate: string | null): boolean {
  if (!lastActiveDate) return false;
  const today = dateKey();
  const yesterday = dateKey(new Date(Date.now() - 86_400_000));
  return lastActiveDate === today || lastActiveDate === yesterday;
}
