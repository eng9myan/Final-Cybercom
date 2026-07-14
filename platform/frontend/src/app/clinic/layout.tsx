"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardCheck,
  CalendarDays,
  Stethoscope,
  Activity,
  Video,
  LogOut,
  Menu,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";
import { LocaleThemeSwitcher } from "@/components/LocaleThemeSwitcher";

const NAV_GROUPS = [
  {
    label: "Command",
    items: [
      { href: "/clinic", label: "Clinic Overview", icon: LayoutDashboard },
    ],
  },
  {
    label: "Clinical Operations",
    items: [
      { href: "/clinic/reception", label: "Reception", icon: ClipboardCheck },
      { href: "/clinic/appointments", label: "Appointments", icon: CalendarDays },
      { href: "/clinic/triage", label: "Triage", icon: Activity },
      { href: "/clinic/consultations", label: "Consultations & EMR", icon: Stethoscope },
      { href: "/clinic/telemedicine", label: "Telemedicine", icon: Video },
    ],
  },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  const { session, isAuthenticated, logout } = useAuth();
  const { locale } = usePreferences();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const displayName = session?.displayName || session?.email || "Unknown user";
  const primaryRole = session?.roles?.[0];
  const flatNav = NAV_GROUPS.flatMap(g => g.items);
  const currentPage = flatNav.find(n => n.href === pathname);
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);

  return (
    <div className="flex min-h-dvh bg-surface text-ink">
      <aside
        className={`fixed inset-y-0 left-0 z-40 shrink-0 border-r border-ink/[0.07] bg-surface-raised transition-[width,transform] duration-300 md:relative md:translate-x-0 ${
          collapsed ? "md:w-[76px]" : "md:w-[260px]"
        } w-64 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-ink/[0.07] px-4">
          <Link href="/clinic" className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-400 text-sm font-bold text-white">
              CC
            </div>
            {!collapsed && <span className="truncate text-sm font-semibold tracking-wide">CyMed Clinic</span>}
          </Link>
          <button
            className="text-ink/60 hover:text-ink md:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" style={{ maxHeight: "calc(100dvh - 8rem)" }}>
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              {!collapsed && (
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink/40">
                  {group.label}
                </p>
              )}
              <ul className="space-y-1">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={() => setMobileNavOpen(false)}
                        title={collapsed ? label : undefined}
                        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                          active
                            ? "bg-brand-500/10 text-ink"
                            : "text-ink/60 hover:bg-surface-overlay hover:text-ink"
                        }`}
                      >
                        {active && (
                          <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-brand-500" aria-hidden />
                        )}
                        <Icon size={18} strokeWidth={2} className={`shrink-0 ${active ? "text-brand-400" : ""}`} />
                        {!collapsed && <span className="truncate">{label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-2 border-t border-ink/[0.07] p-3">
          {!collapsed && isAuthenticated && (
            <div className="flex items-center gap-3 rounded-lg px-2 py-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-dark text-xs font-bold text-white">
                {initials(displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{displayName}</p>
                {primaryRole && <p className="truncate text-xs leading-tight text-ink/40">{primaryRole}</p>}
              </div>
              <button
                onClick={logout}
                aria-label="Log out"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink/40 transition hover:bg-surface-overlay hover:text-red-400"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-9 w-full items-center justify-center rounded-lg border border-ink/10 text-ink/40 transition hover:bg-surface-overlay md:flex"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-ink/[0.07] bg-surface/85 px-4 backdrop-blur-xl md:px-6">
          <button
            className="text-ink/70 hover:text-ink md:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          <div className="hidden min-w-0 md:block">
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink/40">CyMed Clinic</p>
            <h1 className="truncate font-heading text-base font-bold leading-tight">
              {currentPage?.label ?? t("Console", "لوحة التحكم")}
            </h1>
          </div>

          <div className="relative mx-auto hidden max-w-sm flex-1 md:block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              type="search"
              placeholder={t("Search patients, appointments...", "بحث عن مرضى، مواعيد...")}
              className="w-full rounded-xl border border-ink/10 bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink/40 focus:border-brand-400 focus:outline-none"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <LocaleThemeSwitcher />
            {isAuthenticated ? (
              <>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium leading-tight">{displayName}</p>
                  {primaryRole && (
                    <p className="text-xs leading-tight text-ink/40">{primaryRole}</p>
                  )}
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-400 text-xs font-bold text-white">
                  {initials(displayName)}
                </div>
                <button
                  onClick={logout}
                  aria-label="Log out"
                  className="rounded-lg p-2 text-ink/60 hover:bg-surface-overlay hover:text-ink"
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <Link
                href="/auth"
                className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm"
              >
                {t("Sign in", "تسجيل الدخول")}
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
