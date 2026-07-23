"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  clearCommunityProfile,
  db,
  getCommunityHistorySynced,
  getCommunityProfile,
  mergeStreakDates,
  saveCommunityProfile,
  setCommunityHistorySynced,
} from "@/lib/db";
import {
  buildDayHistory,
  buildTodayEntry,
  createProfile as createProfileApi,
  fetchUserStats,
  restoreProfile as restoreProfileApi,
  syncProgress,
  todaySignature,
} from "@/lib/community";
import { useAppData } from "./data-provider";
import type { AnswerRecord, CommunityProfile } from "@/lib/types";

interface CommunityContextValue {
  profile?: CommunityProfile;
  ready: boolean;
  syncing: boolean;
  syncError?: string;
  createProfile: (nickname: string) => Promise<CommunityProfile>;
  restoreProfile: (recoveryCode: string) => Promise<CommunityProfile>;
  signOut: () => Promise<void>;
}

const CommunityContext = createContext<CommunityContextValue | null>(null);
const SYNC_DEBOUNCE_MS = 4000;

export function CommunityProvider({ children }: { children: ReactNode }) {
  const { data, hydrated } = useAppData();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string>();

  const profileRow = useLiveQuery(async () => {
    try { return { value: await getCommunityProfile(db) }; } catch { return { value: undefined }; }
  }, []);
  const profile = profileRow?.value;
  const ready = profileRow !== undefined;

  // Keep the latest answers in a ref so the debounced sync never captures a stale list.
  const answersRef = useRef<AnswerRecord[]>(data.answers);
  answersRef.current = data.answers;

  // Pull the account's merged day-history from the backend and fold any missing days into
  // the local streak table, so every device sharing this account shows the same streak.
  const reconcileFromServer = useCallback(async (target: CommunityProfile) => {
    try {
      const stats = await fetchUserStats(target.publicId);
      const dates = stats.daily.map((day) => day.date);
      if (dates.length) await mergeStreakDates(db, dates).catch(() => {});
    } catch {
      /* offline or backend unavailable — keep local data as-is */
    }
  }, []);

  const runSync = useCallback(async (target: CommunityProfile) => {
    const syncedFor = await getCommunityHistorySynced(db).catch(() => undefined);
    const full = syncedFor !== target.userId;
    const today = buildTodayEntry(answersRef.current);
    const days = full ? buildDayHistory(answersRef.current) : today ? [today] : [];
    if (!days.length) {
      if (full) await setCommunityHistorySynced(db, target.userId).catch(() => {});
      await reconcileFromServer(target);
      return;
    }
    setSyncing(true);
    try {
      await syncProgress(target, days);
      if (full) await setCommunityHistorySynced(db, target.userId).catch(() => {});
      await reconcileFromServer(target);
      setSyncError(undefined);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "排行榜同步失败");
    } finally {
      setSyncing(false);
    }
  }, [reconcileFromServer]);

  // Debounced background sync whenever today's local totals change.
  const signature = useMemo(() => todaySignature(data.answers), [data.answers]);
  useEffect(() => {
    if (!hydrated || !profile) return;
    const timer = window.setTimeout(() => { void runSync(profile); }, SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [hydrated, profile, signature, runSync]);

  // Pull the merged streak on load / account change, even on a device that isn't answering
  // (its debounced sync would never fire, so it would otherwise never see other devices' days).
  const reconciledFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!hydrated || !profile || reconciledFor.current === profile.userId) return;
    reconciledFor.current = profile.userId;
    void reconcileFromServer(profile);
  }, [hydrated, profile, reconcileFromServer]);

  const createProfile = useCallback(async (nickname: string) => {
    const created = await createProfileApi(nickname);
    await saveCommunityProfile(db, created);
    void runSync(created);
    return created;
  }, [runSync]);

  const restoreProfile = useCallback(async (recoveryCode: string) => {
    const restored = await restoreProfileApi(recoveryCode);
    await saveCommunityProfile(db, restored);
    void runSync(restored);
    return restored;
  }, [runSync]);

  const signOut = useCallback(async () => {
    await clearCommunityProfile(db);
    setSyncError(undefined);
  }, []);

  const value = useMemo(
    () => ({ profile, ready, syncing, syncError, createProfile, restoreProfile, signOut }),
    [profile, ready, syncing, syncError, createProfile, restoreProfile, signOut],
  );
  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const context = useContext(CommunityContext);
  if (!context) throw new Error("useCommunity must be used inside CommunityProvider");
  return context;
}
