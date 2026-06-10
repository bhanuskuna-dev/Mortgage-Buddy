"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageSquare, BarChart2, Activity, FileText } from "lucide-react";
import CostIndicator from "./CostIndicator";

const TABS = [
  { href: "/qualify", label: "Qualify", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/evals", label: "Evals", icon: BarChart2 },
  { href: "/observability", label: "Observability", icon: Activity },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-[var(--navy-900)]/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/qualify" className="flex items-center gap-2 font-bold text-white text-lg">
          <span className="text-blue-400">⌂</span>
          <span>MortgageReady</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/prd"
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
              pathname.startsWith("/prd")
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <FileText className="w-4 h-4" />
            PRD
          </Link>
          <CostIndicator />
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="md:hidden flex border-t border-slate-800">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center py-2 text-xs gap-0.5 transition-colors ${
                active ? "text-blue-400" : "text-slate-500"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
