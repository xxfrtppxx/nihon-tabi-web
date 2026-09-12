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
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await usersApi.me());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
    return subscribeTokens((tokens) => {
      if (!tokens) setUser(null);
    });
  }, [loadUser]);

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
