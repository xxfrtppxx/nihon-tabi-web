"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const APP_VERSION = "v0.2.0";

const TABS = [
  { href: "/map", label: "Atlas" },
  { href: "/visits", label: "Timeline" },
  { href: "/trips", label: "Trips" },
  { href: "/dashboard", label: "Stats" },
];

export function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  return (
    <nav
      className="flex items-stretch border-b"
      style={{ borderColor: "var(--divider)" }}
    >
      <div
        className="flex items-center gap-2 border-r px-6"
        style={{ borderColor: "var(--divider)" }}
      >
        <span className="text-[19px] font-black tracking-tight whitespace-nowrap">
          NIHON TABI
        </span>
        <span className="text-[13px] font-medium text-neutral-500 whitespace-nowrap">
          日本旅
        </span>
        <span
          className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide"
          style={{ background: "var(--accent-100)", color: "var(--accent-700)" }}
        >
          {APP_VERSION}
        </span>
      </div>

      <div className="flex items-center gap-1 py-[13px] px-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname?.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-full px-4 py-2 text-xs font-semibold tracking-wider uppercase"
              style={
                active
                  ? { background: "var(--accent)", color: "#fff" }
                  : { color: "var(--foreground)" }
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="flex-1" />

      <div
        className="flex items-center gap-5 border-l px-6 text-sm"
        style={{ borderColor: "var(--divider)" }}
      >
        <span className="text-xs font-semibold tracking-wide uppercase text-neutral-500">
          {user.displayName}
        </span>
        <button
          onClick={() => logout()}
          className="text-sm hover:underline"
          style={{ color: "var(--plan-700)" }}
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
