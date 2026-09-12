export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const STORAGE_KEY = "nihon-tabi-tokens";

let tokens: AuthTokens | null = null;
let hydrated = false;
const listeners = new Set<(tokens: AuthTokens | null) => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    tokens = JSON.parse(raw) as AuthTokens;
  } catch {
    tokens = null;
  }
}

export function getTokens(): AuthTokens | null {
  hydrate();
  return tokens;
}

export function getAccessToken(): string | null {
  return getTokens()?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  return getTokens()?.refreshToken ?? null;
}

export function setTokens(next: AuthTokens | null) {
  tokens = next;
  hydrated = true;
  if (typeof window !== "undefined") {
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
  listeners.forEach((listener) => listener(tokens));
}

export function subscribeTokens(listener: (tokens: AuthTokens | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
