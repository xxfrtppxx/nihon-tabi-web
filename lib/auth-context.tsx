"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { authApi, usersApi, type User } from "./api";
import { getAccessToken, setTokens, subscribeTokens } from "./token-store";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // No token means there's nothing to load — that's known synchronously at
  // first render, so it's the lazy initial value rather than a setState
  // an effect has to make. Only the "there is a token" case needs to stay
  // loading while usersApi.me() resolves.
  const [loading, setLoading] = useState(() => getAccessToken() !== null);

  useEffect(() => {
    let ignore = false;
    if (getAccessToken()) {
      usersApi
        .me()
        .then((me) => {
          if (!ignore) setUser(me);
        })
        .catch(() => {
          if (!ignore) setUser(null);
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    }
    const unsubscribe = subscribeTokens((tokens) => {
      if (!tokens) setUser(null);
    });
    return () => {
      ignore = true;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    setTokens({ accessToken: result.accessToken });
    setUser(result.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const result = await authApi.register({ email, password, displayName });
      setTokens({ accessToken: result.accessToken });
      setUser(result.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // token may already be invalid; clearing locally is enough
    }
    setTokens(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
