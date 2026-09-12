"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export function NavBar() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <nav className="flex items-center justify-between border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
      <div className="flex gap-5 text-sm font-medium">
        <Link href="/map">Map</Link>
        <Link href="/visits">Visits</Link>
        <Link href="/dashboard">Dashboard</Link>
      </div>
      <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
        <span>{user.displayName}</span>
        <button
          onClick={() => logout()}
          className="text-red-600 hover:underline dark:text-red-400"
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
