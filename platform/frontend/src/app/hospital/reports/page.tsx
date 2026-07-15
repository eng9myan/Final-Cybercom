"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface BIReport {
  id: string;
  name: string;
  report_type: "financial" | "operations" | "clinical" | "hr";
  active: boolean;
}

interface DashboardMetric {
  id: string;
  name: string;
  metric_value: string;
  period: string;
  dimensions: Record<string, unknown>;
}

interface Paginated<T> { count: number; results: T[]; }

const TYPE_COLOR: Record<string, string> = { financial: "#22c55e", operations: "#3b82f6", clinical: "#22D3EE", hr: "#8b5cf6" };
const TYPE_LABEL: Record<"all" | BIReport["report_type"], { en: string; ar: string }> = {
  all: { en: "all", ar: "الكل" },
  financial: { en: "financial", ar: "مالي" },
  operations: { en: "operations", ar: "تشغيلي" },
  clinical: { en: "clinical", ar: "سريري" },
  hr: { en: "hr", ar: "موارد بشرية" },
};

export default function ReportsAndDashboards() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [reports, setReports] = useState<BIReport[] | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [typeFilter, setTypeFilter] = useState<"all" | BIReport["report_type"]>("all");
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [reportPage, metricPage] = await Promise.all([
        apiFetch<Paginated<BIReport>>("/api/v1/erp/bi/reports/", opts),
        apiFetch<Paginated<DashboardMetric>>("/api/v1/erp/bi/metrics/", opts),
      ]);
      setReports(reportPage.results);
      setMetrics(metricPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل التقارير." : "Failed to load reports."));
    }
  }, [session, isAr]);

  useEffect(() => { void loadData(); }, [loadData]);

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل التقارير" : "Unable to load reports"}</h1>
        <p className="mt-2 text-white/50">{fetchError}</p>
      </div>
    );
  }
  if (reports === null) {
    return <div className="mt-16 text-center text-white/50">{isAr ? "جارٍ تحميل بيانات التقارير المباشرة..." : "Loading live reports data..."}</div>;
  }

  const activeReports = reports.filter(r => r.active);
  const filtered = reports.filter(r => typeFilter === "all" || r.report_type === typeFilter);
  const metricsByPeriod = metrics.reduce<Record<string, DashboardMetric[]>>((acc, m) => {
    (acc[m.period] ||= []).push(m);
    return acc;
  }, {});

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><BarChart3 size={22} /> {isAr ? "التقارير ولوحات المعلومات" : "Reports & Dashboards"}</h1>
          <p className="mt-1 text-sm text-white/50">{isAr ? "تقارير ذكاء الأعمال ومقاييس لوحة المعلومات المباشرة لهذا المستأجر" : "Live BI reports and dashboard metrics for this tenant"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-surface-raised p-4">
          <p className="text-xs text-white/50">{isAr ? "إجمالي التقارير" : "Total Reports"}</p>
          <p className="mt-1 text-xl font-bold text-brand-300">{reports.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface-raised p-4">
          <p className="text-xs text-white/50">{isAr ? "التقارير النشطة" : "Active Reports"}</p>
          <p className="mt-1 text-xl font-bold text-green-400">{activeReports.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface-raised p-4">
          <p className="text-xs text-white/50">{isAr ? "مقاييس لوحة المعلومات" : "Dashboard Metrics"}</p>
          <p className="mt-1 text-xl font-bold text-purple-400">{metrics.length}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "financial", "operations", "clinical", "hr"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-lg border px-3 py-1.5 text-sm capitalize ${typeFilter === t ? "border-brand-400 bg-brand-500/15 text-brand-200 font-semibold" : "border-white/10 bg-surface-overlay text-white/70"}`}
          >
            {isAr ? TYPE_LABEL[t].ar : TYPE_LABEL[t].en} ({reports.filter(r => t === "all" || r.report_type === t).length})
          </button>
        ))}
      </div>

      <div className="mb-8 overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {(isAr ? ["اسم التقرير", "النوع", "الحالة"] : ["Report Name", "Type", "Status"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-white/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-white/50">{isAr ? "لا توجد تقارير ذكاء أعمال معرّفة لهذا المستأجر بعد." : "No BI reports defined for this tenant yet."}</td></tr>
              )}
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-white/5">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize" style={{ background: `${TYPE_COLOR[r.report_type]}22`, color: TYPE_COLOR[r.report_type] }}>{isAr ? TYPE_LABEL[r.report_type].ar : TYPE_LABEL[r.report_type].en}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.active ? "bg-green-500/15 text-green-400" : "bg-white/10 text-white/50"}`}>
                      {r.active ? (isAr ? "نشط" : "Active") : (isAr ? "غير نشط" : "Inactive")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">{isAr ? "مقاييس لوحة المعلومات" : "Dashboard Metrics"}</h2>
      {Object.keys(metricsByPeriod).length === 0 && (
        <div className="rounded-xl border border-white/10 bg-surface-raised p-6 text-center text-white/50">
          {isAr ? "لا توجد مقاييس لوحة معلومات مسجلة لهذا المستأجر بعد." : "No dashboard metrics recorded for this tenant yet."}
        </div>
      )}
      {Object.entries(metricsByPeriod).map(([period, periodMetrics]) => (
        <div key={period} className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">{period}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {periodMetrics.map(m => (
              <div key={m.id} className="rounded-xl border border-white/10 bg-surface-raised p-4">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="mt-1 text-xl font-bold text-brand-300">{parseFloat(m.metric_value).toLocaleString()}</p>
                {Object.keys(m.dimensions || {}).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(m.dimensions).map(([k, v]) => (
                      <span key={k} className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/50">{k}: {String(v)}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
