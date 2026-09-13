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
      className="flex items-stretch overflow-x-auto border-b"
      style={{ borderColor: "var(--divider)" }}
    >
      <div
        className="flex flex-none items-center gap-2 border-r px-4 sm:px-6"
        style={{ borderColor: "var(--divider)" }}
      >
        <span className="text-[19px] font-black tracking-tight whitespace-nowrap">
          NIHON TABI
        </span>
        <span className="hidden text-[13px] font-medium whitespace-nowrap text-neutral-500 sm:inline">
          日本旅
        </span>
        <span
          className="ml-1 hidden rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap sm:inline-block"
          style={{ background: "var(--accent-100)", color: "var(--accent-700)" }}
        >
          {APP_VERSION}
        </span>
      </div>

      <div className="flex flex-none items-center gap-1 px-1 py-[13px]">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname?.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-full px-3 py-2 text-xs font-semibold whitespace-nowrap tracking-wider uppercase sm:px-4"
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
        className="flex flex-none items-center gap-3 border-l px-4 text-sm sm:gap-5 sm:px-6"
        style={{ borderColor: "var(--divider)" }}
      >
        <span className="hidden text-xs font-semibold tracking-wide whitespace-nowrap text-neutral-500 uppercase sm:inline">
          {user.displayName}
        </span>
        <button
          onClick={() => logout()}
          className="text-sm whitespace-nowrap hover:underline"
          style={{ color: "var(--plan-700)" }}
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
