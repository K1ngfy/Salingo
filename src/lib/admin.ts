export interface AdminSession {
  authenticated: true;
  username: string;
  mustChangePassword: boolean;
}

export interface AdminUser {
  userId: string;
  publicId: string;
  nickname: string;
  currentStreak: number;
  longestStreak: number;
  totalAnswered: number;
  lastActiveDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface ResetRecoveryCodeResult {
  recoveryCode: string;
  user: {
    publicId: string;
    nickname: string;
  };
}

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error("管理员服务暂时无法连接，请稍后重试");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      typeof payload?.error === "string" ? payload.error : `管理员请求失败（HTTP ${response.status}）`,
    );
    Object.assign(error, {
      status: response.status,
      mustChangePassword: Boolean(payload?.mustChangePassword),
    });
    throw error;
  }
  return payload as T;
}

export function fetchAdminSession(): Promise<AdminSession> {
  return adminRequest<AdminSession>("/session");
}

export function loginAdmin(username: string, password: string): Promise<AdminSession> {
  return adminRequest<AdminSession>("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function changeAdminPassword(newPassword: string): Promise<{ ok: true; message: string }> {
  return adminRequest("/password", {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
}

export function logoutAdmin(): Promise<{ ok: true }> {
  return adminRequest("/logout", { method: "POST" });
}

export async function fetchAdminUsers(query: string): Promise<AdminUser[]> {
  const result = await adminRequest<{ users: AdminUser[] }>(`/users?q=${encodeURIComponent(query)}`);
  return result.users;
}

export function resetUserRecoveryCode(userId: string): Promise<ResetRecoveryCodeResult> {
  return adminRequest("/recovery-code/reset", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function deleteUserAsAdmin(userId: string): Promise<{ ok: true }> {
  return adminRequest("/user", {
    method: "DELETE",
    body: JSON.stringify({ userId }),
  });
}
