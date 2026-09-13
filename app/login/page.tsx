"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/map");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-57px)]">
      <div
        className="hidden w-[420px] flex-none flex-col justify-between px-10 py-12 text-white md:flex lg:w-[480px]"
        style={{ background: "var(--accent)" }}
      >
        <div className="text-sm font-black tracking-tight">NIHON TABI 日本旅</div>
        <div>
          <h1 className="text-5xl leading-[0.95] font-black tracking-tight">
            Every
            <br />
            place
            <br />
            you went.
          </h1>
          <p className="mt-6 max-w-[30ch] text-sm font-medium opacity-90">
            A private record of the ones you&apos;ve walked through, and the
            ones still waiting.
          </p>
        </div>
        <div className="flex gap-1.5">
          <span className="h-3 w-3 bg-white" />
          <span className="h-3 w-3 bg-white" />
          <span className="h-3 w-3 border-2 border-white box-border" />
          <span className="h-3 w-3 bg-white/40" />
          <span className="h-3 w-3 bg-white/40" />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-col justify-center gap-6 px-6">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Log in to Nihon Tabi
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-[var(--radius-md)] border px-3 py-2"
              style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-[var(--radius-md)] border px-3 py-2"
              style={{ borderColor: "var(--divider)", background: "var(--surface)" }}
            />
          </label>
          {error && (
            <p className="text-sm" style={{ color: "var(--plan-700)" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-[var(--radius-md)] px-4 py-2 font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {submitting ? "Logging in..." : "Log in"}
          </button>
        </form>
        <p className="text-sm text-neutral-600">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="underline" style={{ color: "var(--accent)" }}>
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
