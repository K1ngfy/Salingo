"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  Copy,
  Key,
  LockKey,
  MagnifyingGlass,
  ShieldCheck,
  SignOut,
  Trash,
  UserCircle,
  Warning,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  changeAdminPassword,
  deleteUserAsAdmin,
  fetchAdminSession,
  fetchAdminUsers,
  loginAdmin,
  logoutAdmin,
  resetUserRecoveryCode,
  type AdminSession,
  type AdminUser,
} from "@/lib/admin";

type RecoveryResult = {
  recoveryCode: string;
  nickname: string;
  publicId: string;
};

function messageFrom(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function isUnauthorized(cause: unknown) {
  return cause instanceof Error && (cause as Error & { status?: number }).status === 401;
}

function formatDate(value?: string) {
  if (!value) return "暂无";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<AdminSession>();
  const [notice, setNotice] = useState("");
  const handleUnauthorized = useCallback(() => setSession(undefined), []);

  useEffect(() => {
    void fetchAdminSession()
      .then(setSession)
      .catch(() => setSession(undefined))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return <AdminFrame><p className="font-black text-[var(--c-777)]">正在验证管理员登录…</p></AdminFrame>;
  }
  if (!session) {
    return <AdminFrame><LoginPanel onLogin={setSession} /></AdminFrame>;
  }
  if (session.mustChangePassword) {
    return <AdminFrame><PasswordPanel username={session.username} onSignedOut={() => setSession(undefined)} /></AdminFrame>;
  }
  return (
    <AdminFrame>
      <div className="flex flex-col gap-4 border-b-2 border-[var(--c-e8e8e3)] pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-[var(--c-58a700)]">已登录</p>
          <p className="mt-1 font-black">{session.username}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            try {
              await logoutAdmin();
            } finally {
              setSession(undefined);
            }
          }}
        >
          <SignOut size={18} weight="bold" />退出后台
        </Button>
      </div>
      {notice && (
        <p role="status" className="mt-5 rounded-xl bg-[var(--c-edfadd)] p-3 text-sm font-bold text-[var(--c-4c8c17)]">
          {notice}
        </p>
      )}
      <UserManager
        onNotice={setNotice}
        onUnauthorized={handleUnauthorized}
      />
    </AdminFrame>
  );
}

function AdminFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[var(--c-fcfcf8)] px-4 py-8 text-[var(--c-3c3c3c)] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center gap-4">
          <span className="grid size-13 place-items-center rounded-2xl bg-[var(--c-58cc02)] text-white shadow-[0_4px_0_var(--c-46a302)]">
            <ShieldCheck size={30} weight="fill" />
          </span>
          <div>
            <p className="text-sm font-black tracking-[0.16em] text-[var(--c-58a700)]">SALINGO</p>
            <h1 className="text-2xl font-black tracking-[-0.03em] sm:text-3xl">账号管理后台</h1>
          </div>
        </header>
        <section className="rounded-[1.7rem] border-2 border-[var(--c-e8e8e3)] bg-[var(--surface)] p-5 sm:p-7">
          {children}
        </section>
        <p className="mt-5 text-center text-xs font-semibold leading-5 text-[var(--c-888)]">
          管理员操作仅用于用户授权的账号恢复与清理。恢复码不会在账号列表中展示。
        </p>
      </div>
    </main>
  );
}

function LoginPanel({ onLogin }: { onLogin: (session: AdminSession) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await loginAdmin(username, password));
    } catch (cause) {
      setError(messageFrom(cause, "登录失败，请稍后重试"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="mx-auto max-w-md" onSubmit={submit}>
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-[var(--c-e8f7ff)] text-[var(--c-1cb0f6)]">
          <LockKey size={24} weight="duotone" />
        </span>
        <div>
          <h2 className="text-lg font-black">管理员登录</h2>
          <p className="text-sm font-semibold text-[var(--c-888)]">此入口与普通排行榜账号完全独立</p>
        </div>
      </div>
      {error && <p role="alert" className="mt-5 rounded-xl bg-[var(--c-fff0f0)] p-3 text-sm font-bold text-[var(--c-a73b3b)]">{error}</p>}
      <div className="mt-6 grid gap-4">
        <label className="text-sm font-black">
          管理员账号
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="mt-2 h-12 w-full rounded-xl border-2 border-[var(--c-deded8)] bg-[var(--surface)] px-4 outline-none focus:border-[var(--c-1cb0f6)]"
          />
        </label>
        <label className="text-sm font-black">
          密码
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 h-12 w-full rounded-xl border-2 border-[var(--c-deded8)] bg-[var(--surface)] px-4 outline-none focus:border-[var(--c-1cb0f6)]"
          />
        </label>
      </div>
      <Button type="submit" variant="blue" className="mt-6 w-full" disabled={busy || !username.trim() || !password}>
        {busy ? "登录中…" : "登录管理员后台"}
      </Button>
    </form>
  );
}

function PasswordPanel({ username, onSignedOut }: { username: string; onSignedOut: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      setNotice("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const result = await changeAdminPassword(password);
      setNotice(result.message);
      window.setTimeout(onSignedOut, 1200);
    } catch (cause) {
      setNotice(messageFrom(cause, "密码修改失败，请稍后重试"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="mx-auto max-w-md" onSubmit={submit}>
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-[var(--c-fff3e0)] text-[var(--c-ff9600)]">
          <Key size={24} weight="duotone" />
        </span>
        <div>
          <h2 className="text-lg font-black">首次登录，请修改密码</h2>
          <p className="text-sm font-semibold text-[var(--c-888)]">{username}</p>
        </div>
      </div>
      <p className="mt-5 rounded-xl bg-[var(--c-fff7e5)] p-3 text-sm font-semibold leading-6 text-[var(--c-89672c)]">
        新密码需为 12–128 个字符，并同时包含字母和数字。修改后所有管理员登录状态会失效，请重新登录。
      </p>
      {notice && <p role="status" className="mt-4 rounded-xl bg-[var(--c-e8f7ff)] p-3 text-sm font-bold text-[var(--c-1679a7)]">{notice}</p>}
      <div className="mt-5 grid gap-4">
        <label className="text-sm font-black">
          新密码
          <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border-2 border-[var(--c-deded8)] bg-[var(--surface)] px-4 outline-none focus:border-[var(--c-1cb0f6)]" />
        </label>
        <label className="text-sm font-black">
          再次输入新密码
          <input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 h-12 w-full rounded-xl border-2 border-[var(--c-deded8)] bg-[var(--surface)] px-4 outline-none focus:border-[var(--c-1cb0f6)]" />
        </label>
      </div>
      <Button type="submit" variant="blue" className="mt-6 w-full" disabled={busy || !password || !confirmation}>
        {busy ? "修改中…" : "保存新密码"}
      </Button>
    </form>
  );
}

function UserManager({
  onNotice,
  onUnauthorized,
}: {
  onNotice: (message: string) => void;
  onUnauthorized: () => void;
}) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [confirmResetId, setConfirmResetId] = useState("");
  const [recovery, setRecovery] = useState<RecoveryResult>();

  const loadUsers = useCallback(async (search: string) => {
    setLoading(true);
    try {
      setUsers(await fetchAdminUsers(search.trim()));
    } catch (cause) {
      if (isUnauthorized(cause)) onUnauthorized();
      else onNotice(messageFrom(cause, "账号列表加载失败"));
    } finally {
      setLoading(false);
    }
  }, [onNotice, onUnauthorized]);

  useEffect(() => {
    void loadUsers("");
  }, [loadUsers]);

  const resetCode = async (user: AdminUser) => {
    setBusyUserId(user.userId);
    onNotice("");
    try {
      const result = await resetUserRecoveryCode(user.userId);
      setRecovery({
        recoveryCode: result.recoveryCode,
        nickname: result.user.nickname,
        publicId: result.user.publicId,
      });
      setConfirmResetId("");
      await loadUsers(query);
    } catch (cause) {
      if (isUnauthorized(cause)) onUnauthorized();
      else onNotice(messageFrom(cause, "恢复码重置失败"));
    } finally {
      setBusyUserId("");
    }
  };

  const deleteUser = async (user: AdminUser) => {
    setBusyUserId(user.userId);
    onNotice("");
    try {
      await deleteUserAsAdmin(user.userId);
      setConfirmDeleteId("");
      setRecovery(undefined);
      onNotice(`账号“${user.nickname}”已永久删除`);
      await loadUsers(query);
    } catch (cause) {
      if (isUnauthorized(cause)) onUnauthorized();
      else onNotice(messageFrom(cause, "账号删除失败"));
    } finally {
      setBusyUserId("");
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-[var(--c-f2e9ff)] text-[var(--c-874eb0)]">
          <UserCircle size={25} weight="duotone" />
        </span>
        <div>
          <h2 className="text-lg font-black">排行榜账号</h2>
          <p className="text-sm font-semibold text-[var(--c-888)]">按昵称或公开 ID 搜索，最多显示 50 条</p>
        </div>
      </div>
      <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void loadUsers(query); }}>
        <label className="relative flex-1">
          <span className="sr-only">搜索账号</span>
          <MagnifyingGlass className="absolute left-4 top-3.5 text-[var(--c-888)]" size={20} weight="bold" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入昵称或公开 ID" className="h-12 w-full rounded-xl border-2 border-[var(--c-deded8)] bg-[var(--surface)] pl-11 pr-4 outline-none focus:border-[var(--c-1cb0f6)]" />
        </label>
        <Button type="submit" variant="blue" disabled={loading}>搜索</Button>
        <Button type="button" variant="secondary" aria-label="刷新列表" onClick={() => void loadUsers(query)} disabled={loading}><ArrowClockwise size={18} weight="bold" />刷新</Button>
      </form>

      {recovery && (
        <div className="mt-5 rounded-2xl border-2 border-[var(--c-cfe9b8)] bg-[var(--c-edfadd)] p-5">
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 shrink-0 text-[var(--c-58a700)]" size={23} weight="fill" />
            <div className="min-w-0 flex-1">
              <h3 className="font-black">新恢复码已生成</h3>
              <p className="mt-1 text-sm font-semibold text-[var(--c-555)]">{recovery.nickname} · {recovery.publicId}</p>
              <code className="mt-3 block overflow-x-auto rounded-xl bg-[var(--surface)] px-4 py-3 font-black tracking-wide text-[var(--c-58a700)]">{recovery.recoveryCode}</code>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(recovery.recoveryCode);
                    onNotice("新恢复码已复制");
                  } catch {
                    onNotice("复制失败，请手动选择恢复码");
                  }
                }}><Copy size={17} weight="bold" />复制新恢复码</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setRecovery(undefined)}>我已保存，关闭</Button>
              </div>
              <p className="mt-3 text-xs font-bold leading-5 text-[var(--c-89672c)]">请立即安全地交给用户。关闭后后台不会再次显示；旧恢复码已经失效。</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {loading ? (
          <p className="py-8 text-center font-bold text-[var(--c-888)]">加载账号中…</p>
        ) : users.length === 0 ? (
          <p className="rounded-xl bg-[var(--c-f7f7f2)] p-5 text-center font-bold text-[var(--c-777)]">没有找到匹配的账号</p>
        ) : users.map((user) => (
          <article key={user.userId} className="rounded-2xl border-2 border-[var(--c-e8e8e3)] p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-black">{user.nickname}</h3>
                <p className="mt-1 break-all text-xs font-bold text-[var(--c-888)]">公开 ID：{user.publicId}</p>
                <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-4">
                  <p><span className="block text-xs font-bold text-[var(--c-999)]">累计答题</span><b>{user.totalAnswered}</b></p>
                  <p><span className="block text-xs font-bold text-[var(--c-999)]">当前连续</span><b>{user.currentStreak} 天</b></p>
                  <p><span className="block text-xs font-bold text-[var(--c-999)]">最后活跃</span><b>{formatDate(user.lastActiveDate)}</b></p>
                  <p><span className="block text-xs font-bold text-[var(--c-999)]">创建时间</span><b>{formatDate(user.createdAt)}</b></p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={Boolean(busyUserId)} onClick={() => { setConfirmResetId(user.userId); setConfirmDeleteId(""); }}>
                  <Key size={17} weight="bold" />重置恢复码
                </Button>
                <Button type="button" variant="ghost" size="sm" className="text-[var(--c-d83a3a)]" disabled={Boolean(busyUserId)} onClick={() => { setConfirmDeleteId(user.userId); setConfirmResetId(""); }}>
                  <Trash size={17} weight="bold" />删除账号
                </Button>
              </div>
            </div>
            {confirmResetId === user.userId && (
              <div className="mt-4 rounded-xl bg-[var(--c-fff7e5)] p-4">
                <p className="flex items-start gap-2 text-sm font-bold leading-6 text-[var(--c-89672c)]"><Warning className="mt-0.5 shrink-0" size={18} weight="fill" />将为“{user.nickname}”生成新恢复码，旧码立即失效，其他已登录设备需要用新码重新恢复。</p>
                <div className="mt-3 flex gap-2"><Button type="button" size="sm" disabled={busyUserId === user.userId} onClick={() => void resetCode(user)}>{busyUserId === user.userId ? "重置中…" : "确认重置"}</Button><Button type="button" variant="secondary" size="sm" onClick={() => setConfirmResetId("")}>取消</Button></div>
              </div>
            )}
            {confirmDeleteId === user.userId && (
              <div className="mt-4 rounded-xl bg-[var(--c-fff0f0)] p-4">
                <p className="flex items-start gap-2 text-sm font-bold leading-6 text-[var(--c-a73b3b)]"><Warning className="mt-0.5 shrink-0" size={18} weight="fill" />将永久删除“{user.nickname}”的账号、恢复码、排名和全部云端同步进度。此操作无法撤销。</p>
                <div className="mt-3 flex gap-2"><Button type="button" variant="danger" size="sm" disabled={busyUserId === user.userId} onClick={() => void deleteUser(user)}>{busyUserId === user.userId ? "删除中…" : "确认永久删除"}</Button><Button type="button" variant="secondary" size="sm" onClick={() => setConfirmDeleteId("")}>取消</Button></div>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
