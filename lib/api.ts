import { getAccessToken, getRefreshToken, setTokens } from "./token-store";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, init, false);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      setTokens(null);
      return false;
    }
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    setTokens(data);
    return true;
  } catch {
    setTokens(null);
    return false;
  }
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export const authApi = {
  register: (data: { email: string; password: string; displayName: string }) =>
    request<AuthResult>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    request<AuthResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  logout: () => request<{ success: boolean }>("/auth/logout", { method: "POST" }),
};

export const usersApi = {
  me: () => request<User>("/users/me"),
};

export interface Prefecture {
  id: number;
  nameJa: string;
  nameEn: string;
  region: string;
  centroidLat: number | null;
  centroidLng: number | null;
}

export interface Municipality {
  id: number;
  prefectureId: number;
  nameJa: string;
  nameEn: string;
  type: string;
  centroidLat: number | null;
  centroidLng: number | null;
}

export const geoApi = {
  prefectures: () => request<Prefecture[]>("/geo/prefectures"),
  municipalities: (prefectureId: number) =>
    request<Municipality[]>(`/geo/prefectures/${prefectureId}/municipalities`),
};

export type VisitStatus = "visited" | "want_to_go";

export interface VisitPhoto {
  id: string;
  url: string;
}

export interface Visit {
  id: string;
  municipalityId: number;
  status: VisitStatus;
  visitedOn: string | null;
  note: string | null;
  rating: number | null;
  photos: VisitPhoto[];
  municipality: Municipality & { prefecture: Prefecture };
}

export interface VisitInput {
  municipalityId: number;
  status: VisitStatus;
  visitedOn?: string;
  note?: string;
  rating?: number;
}

export const visitsApi = {
  list: (params?: { prefectureId?: number; status?: VisitStatus }) => {
    const query = new URLSearchParams();
    if (params?.prefectureId) query.set("prefectureId", String(params.prefectureId));
    if (params?.status) query.set("status", params.status);
    const qs = query.toString();
    return request<Visit[]>(`/visits${qs ? `?${qs}` : ""}`);
  },
  create: (data: VisitInput) =>
    request<Visit>("/visits", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Omit<VisitInput, "municipalityId">>) =>
    request<Visit>(`/visits/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<{ success: boolean }>(`/visits/${id}`, { method: "DELETE" }),
};

export interface Stats {
  visitedCount: number;
  wantToGoCount: number;
  totalMunicipalities: number;
  percentageVisited: number;
  byRegion: { region: string; visited: number; total: number }[];
}

export const statsApi = {
  me: () => request<Stats>("/stats/me"),
};
