"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  UserPlus,
  CalendarDays,
  Stethoscope,
  HeartPulse,
  Receipt,
  Package,
  Users,
  BarChart3,
  BedDouble,
  Siren,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface ModuleSummary {
  patients_total: number;
  appointments_today: number;
  providers_active: number;
  invoices_outstanding: number;
  stock_items_out_of_stock: number;
  leave_requests_pending: number;
  bi_reports_active: number;
}

interface CommandCenterSnapshot {
  operational_census: {
    active_admissions: number;
    current_occupied_beds: number;
    total_beds: number;
    emergency_waiting: number;
    icu_occupancy: number;
    scheduled_procedures_today: number;
  };
  capacity_indicators: {
    bed_occupancy_percentage: number;
  };
}

interface TrendPoint {
  date: string;
  admissions: number;
  discharges: number;
}

interface HospitalMetrics {
  total_beds: number;
  occupied_beds: number;
  available_beds: number;
  icu_occupied: number;
  icu_total: number;
  ed_active: number;
  pending_admissions: number;
  pending_discharges: number;
  or_scheduled: number;
  capacity_pct: number;
}

interface WardSummary {
  name: string;
  name_ar: string;
  total: number;
  occupied: number;
  pending_discharge: number;
  status: "normal" | "elevated" | "critical";
}

function statusColor(status: string) {
  if (status === "critical") return "#ef4444";
  if (status === "elevated") return "#f59e0b";
  return "#22c55e";
}

function KpiTile({
  label, value, icon: Icon, accent = "orange",
}: { label: string; value: string | number; icon: LucideIcon; accent?: "orange" | "cyan" | "danger" }) {
  const accentBg = accent === "cyan" ? "rgba(89,195,225,.15)" : accent === "danger" ? "rgba(220,38,38,.12)" : "rgba(237,108,0,.10)";
  const accentFg = accent === "cyan" ? "#59C3E1" : accent === "danger" ? "#f87171" : "#ED6C00";
  return (
    <div className="cy-card p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: accentBg, color: accentFg }}>
        <Icon size={18} />
      </div>
      <div className="mt-4 text-xs uppercase tracking-[0.18em] text-ink/40">{label}</div>
      <div className="mt-1 font-heading text-3xl font-black tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

export default function HospitalPortal() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [metrics, setMetrics] = useState<HospitalMetrics | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [moduleSummary, setModuleSummary] = useState<ModuleSummary | null>(null);
  const [wards] = useState<WardSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !session) {
      setFetchError(null);
      return;
    }

    async function fetchDashboardData() {
      setLoading(true);
      setFetchError(null);
      try {
        const [snapshot, trendSeries, summary] = await Promise.all([
          apiFetch<CommandCenterSnapshot>("/api/v1/hospital/command-center/metrics/", {
            token: session!.accessToken,
            tenantId: session!.tenantId,
          }),
          apiFetch<TrendPoint[]>("/api/v1/hospital/command-center/trend/", {
            token: session!.accessToken,
            tenantId: session!.tenantId,
          }),
          apiFetch<ModuleSummary>("/api/v1/hospital/command-center/module-summary/", {
            token: session!.accessToken,
            tenantId: session!.tenantId,
          }),
        ]);
        const census = snapshot.operational_census;
        setMetrics({
          total_beds: census.total_beds,
          occupied_beds: census.current_occupied_beds,
          available_beds: census.total_beds - census.current_occupied_beds,
          icu_occupied: census.icu_occupancy,
          icu_total: census.icu_occupancy,
          ed_active: census.emergency_waiting,
          pending_admissions: census.active_admissions,
          pending_discharges: 0,
          or_scheduled: census.scheduled_procedures_today,
          capacity_pct: snapshot.capacity_indicators.bed_occupancy_percentage,
        });
        setTrend(trendSeries);
        setModuleSummary(summary);
      } catch (err) {
        // Real API errors surface here -- never silently substitute invented
        // numbers. The UI shows an explicit error state instead.
        const detail = (err as { detail?: string })?.detail;
        setFetchError(detail || (err instanceof Error ? err.message : "Failed to load live hospital data."));
      } finally {
        setLoading(false);
      }
    }
    void fetchDashboardData();
  }, [isAuthenticated, session]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: "2rem", maxWidth: "600px", margin: "4rem auto", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>
          {lang === "en" ? "Sign in required" : "تسجيل الدخول مطلوب"}
        </h1>
        <p style={{ color: "var(--color-text-muted)", marginBottom: "1.5rem" }}>
          {lang === "en"
            ? "Hospital operations data requires an authenticated CyIdentity session."
            : "بيانات عمليات المستشفى تتطلب جلسة مصادقة CyIdentity."}
        </p>
        <a href="/auth" style={{ padding: "0.75rem 1.5rem", borderRadius: "8px", background: "var(--color-primary)", color: "#fff", textDecoration: "none", fontWeight: 600 }}>
          {lang === "en" ? "Go to login" : "الذهاب لتسجيل الدخول"}
        </a>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div role="alert" style={{ padding: "2rem", maxWidth: "600px", margin: "4rem auto", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem", color: "#ef4444" }}>
          {lang === "en" ? "Unable to load hospital data" : "تعذر تحميل بيانات المستشفى"}
        </h1>
        <p style={{ color: "var(--color-text-muted)" }}>{fetchError}</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", marginTop: "4rem", color: "var(--color-text-muted)" }}>
        {lang === "en" ? "Loading live hospital data..." : "جاري تحميل بيانات المستشفى..."}
      </div>
    );
  }

  const capacityColor = metrics.capacity_pct >= 90 ? "#ef4444" : metrics.capacity_pct >= 80 ? "#f59e0b" : "#22c55e";
  const occupancyData = [
    { name: "Occupied", value: metrics.occupied_beds, color: capacityColor },
    { name: "Available", value: Math.max(metrics.available_beds, 0), color: "rgba(148,163,184,0.35)" },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            {lang === "en" ? "Command Overview" : "نظرة عامة على القيادة"}
          </h1>
          <p className="mt-1 text-sm text-ink/50">
            {lang === "en" ? "Live hospital operations" : "عمليات المستشفى المباشرة"}
            {loading && <span className="ml-3 text-brand-400">Updating…</span>}
          </p>
        </div>
        <button onClick={() => setLang(l => l === "en" ? "ar" : "en")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {lang === "en" ? "العربية" : "English"}
        </button>
      </header>

      {/* Key Metrics Row */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <KpiTile label={lang === "en" ? "Total Beds" : "إجمالي الأسرة"} value={metrics.total_beds} icon={BedDouble} accent="cyan" />
        <KpiTile label={lang === "en" ? "Occupied" : "مشغولة"} value={metrics.occupied_beds} icon={Activity} accent="orange" />
        <KpiTile label={lang === "en" ? "ED Active" : "طوارئ نشطة"} value={metrics.ed_active} icon={Siren} accent="danger" />
        <KpiTile label={lang === "en" ? "ICU Occupied" : "عناية مركزة"} value={`${metrics.icu_occupied}/${metrics.icu_total}`} icon={HeartPulse} accent="orange" />
      </div>

      {/* Bed Occupancy donut + Weekly Trend */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="cy-card p-5">
          <h3 className="font-heading text-lg font-bold">{lang === "en" ? "Bed Occupancy" : "إشغال الأسرة"}</h3>
          <p className="text-xs text-ink/40">{lang === "en" ? "Tenant-wide, live" : "على مستوى المستأجر"}</p>
          <div className="relative mx-auto mt-2 h-56 w-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={occupancyData} dataKey="value" innerRadius={70} outerRadius={95} startAngle={90} endAngle={-270} stroke="none">
                  {occupancyData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-heading text-3xl font-black tabular-nums" style={{ color: capacityColor }}>{metrics.capacity_pct}%</span>
              <span className="text-xs text-ink/40">{lang === "en" ? "capacity" : "الطاقة"}</span>
            </div>
          </div>
          <div className="mt-4 flex justify-center gap-6 text-xs">
            <span className="flex items-center gap-1.5 text-ink/60"><span className="h-2 w-2 rounded-full" style={{ background: capacityColor }} />{lang === "en" ? "Occupied" : "مشغول"} {metrics.occupied_beds}</span>
            <span className="flex items-center gap-1.5 text-ink/60"><span className="h-2 w-2 rounded-full bg-ink/15" />{lang === "en" ? "Available" : "متاح"} {metrics.available_beds}</span>
          </div>
        </div>

        <div className="cy-card p-5 lg:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <div>
              <h3 className="font-heading text-lg font-bold">{lang === "en" ? "Admissions vs. Discharges" : "القبول مقابل الخروج"}</h3>
              <p className="text-xs text-ink/40">{lang === "en" ? "Last 7 days · live" : "آخر 7 أيام"}</p>
            </div>
          </div>
          <div className="mt-3 h-64">
            {trend && trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.4)" fontSize={12} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", fontSize: 12 }} />
                  <Legend />
                  <Line type="monotone" dataKey="admissions" stroke="#ED6C00" strokeWidth={2.5} name={lang === "en" ? "Admissions" : "القبول"} dot={false} />
                  <Line type="monotone" dataKey="discharges" stroke="#59C3E1" strokeWidth={2.5} name={lang === "en" ? "Discharges" : "الخروج"} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-ink/40">
                {lang === "en" ? "Loading trend data..." : "جاري تحميل بيانات الاتجاه..."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Module Grid */}
      <h2 className="mb-3 font-heading text-lg font-bold">{lang === "en" ? "Modules" : "الوحدات"}</h2>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { href: "/hospital/patients", label: "Patient Registration", icon: UserPlus, badge: moduleSummary?.patients_total, badgeLabel: "patients" },
          { href: "/hospital/appointments", label: "Appointment Calendar", icon: CalendarDays, badge: moduleSummary?.appointments_today, badgeLabel: "today" },
          { href: "/hospital/doctor-workspace", label: "Doctor Workspace", icon: Stethoscope, badge: moduleSummary?.providers_active, badgeLabel: "active providers" },
          { href: "/hospital/icu", label: "Critical Care Overview", icon: HeartPulse, badge: metrics.icu_occupied, badgeLabel: "ICU occupied" },
          { href: "/hospital/billing", label: "Billing & Invoicing", icon: Receipt, badge: moduleSummary?.invoices_outstanding, badgeLabel: "outstanding" },
          { href: "/hospital/inventory", label: "Inventory Management", icon: Package, badge: moduleSummary?.stock_items_out_of_stock, badgeLabel: "out of stock" },
          { href: "/hospital/hr", label: "HR & Payroll", icon: Users, badge: moduleSummary?.leave_requests_pending, badgeLabel: "pending leave" },
          { href: "/hospital/reports", label: "Reports & Dashboards", icon: BarChart3, badge: moduleSummary?.bi_reports_active, badgeLabel: "active reports" },
        ].map(({ href, label, icon: Icon, badge, badgeLabel }) => (
          <Link key={href} href={href} className="cy-card block p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400">
              <Icon size={18} />
            </div>
            <p className="text-sm font-semibold text-ink">{label}</p>
            <p className="mt-1 text-xs text-ink/40">
              {badge === undefined ? "…" : badge} {badgeLabel}
            </p>
          </Link>
        ))}
      </div>

      {/* Ward Census */}
      <h2 className="mb-3 font-heading text-lg font-bold">{lang === "en" ? "Ward Census" : "إحصاء الأجنحة"}</h2>
      <div className="cy-card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-ink/[0.07] bg-ink/[0.02]">
              {[
                lang === "en" ? "Ward" : "الجناح",
                lang === "en" ? "Total Capacity" : "الكلي",
                lang === "en" ? "Occupied" : "مشغول",
                lang === "en" ? "Available" : "متاح",
                lang === "en" ? "Pending DC" : "خروج معلق",
                lang === "en" ? "Occupancy" : "الإشغال",
                lang === "en" ? "Status" : "الحالة",
              ].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink/40">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {wards.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-ink/40">
                  {lang === "en"
                    ? "Ward-level breakdown is not wired up yet -- only tenant-wide totals above are live."
                    : "تفصيل الأجنحة غير متاح بعد -- الإجماليات أعلاه فقط مباشرة."}
                </td>
              </tr>
            )}
            {wards.map((ward, i) => {
              const occ = Math.round((ward.occupied / ward.total) * 100);
              return (
                <tr key={ward.name} className={`border-b border-ink/5 last:border-0 ${i % 2 === 1 ? "bg-ink/[0.015]" : ""}`}>
                  <td className="px-4 py-3 text-sm font-semibold">{lang === "ar" ? ward.name_ar : ward.name}</td>
                  <td className="px-4 py-3 text-sm tabular-nums">{ward.total}</td>
                  <td className="px-4 py-3 text-sm font-semibold tabular-nums">{ward.occupied}</td>
                  <td className="px-4 py-3 text-sm font-semibold tabular-nums text-emerald-400">{ward.total - ward.occupied}</td>
                  <td className="px-4 py-3 text-sm tabular-nums">{ward.pending_discharge}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 rounded-full bg-ink/10">
                        <div className="h-full rounded-full" style={{ width: `${occ}%`, background: statusColor(ward.status) }} />
                      </div>
                      <span className="min-w-[40px] text-sm font-bold tabular-nums" style={{ color: statusColor(ward.status) }}>{occ}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-3 py-1 text-xs font-bold"
                      style={{ background: `${statusColor(ward.status)}22`, color: statusColor(ward.status) }}
                    >
                      {ward.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
