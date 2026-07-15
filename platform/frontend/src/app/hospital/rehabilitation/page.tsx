"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface RehabReferral {
  id: string;
  patient_id: string;
  discipline: string;
  diagnosis: string;
  status: string;
  referred_at: string;
}
interface TreatmentPlan {
  id: string;
  referral: string;
  goals: string;
  frequency_per_week: number;
  duration_weeks: number;
  status: string;
}
interface TherapySession {
  id: string;
  plan: string;
  session_date: string;
  duration_minutes: number;
  activities: string;
}
interface OutcomeMeasurement {
  id: string;
  plan: string;
  measure_type: string;
  score: string;
  measured_at: string;
}
interface Paginated<T> { count: number; results: T[]; }

export default function RehabilitationPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [referrals, setReferrals] = useState<RehabReferral[] | null>(null);
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeMeasurement[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [planForm, setPlanForm] = useState({ goals: "", frequency_per_week: "3", duration_weeks: "6" });
  const [sessionForm, setSessionForm] = useState({ duration_minutes: "45", activities: "" });

  const load = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [refPage, planPage, sessPage, outPage] = await Promise.all([
        apiFetch<Paginated<RehabReferral>>("/api/v1/hospital/rehabilitation/referrals/", opts),
        apiFetch<Paginated<TreatmentPlan>>("/api/v1/hospital/rehabilitation/treatment-plans/", opts),
        apiFetch<Paginated<TherapySession>>("/api/v1/hospital/rehabilitation/sessions/", opts),
        apiFetch<Paginated<OutcomeMeasurement>>("/api/v1/hospital/rehabilitation/outcome-measurements/", opts),
      ]);
      setReferrals(refPage.results);
      setPlans(planPage.results);
      setSessions(sessPage.results);
      setOutcomes(outPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل بيانات إعادة التأهيل." : "Failed to load rehabilitation data."));
    }
  }, [session, isAr]);

  useEffect(() => { void load(); }, [load]);

  async function createPlan(referralId: string) {
    if (!session || !planForm.goals) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/rehabilitation/treatment-plans/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({
          referral: referralId, goals: planForm.goals,
          frequency_per_week: Number(planForm.frequency_per_week), duration_weeks: Number(planForm.duration_weeks),
          therapist_id: session.userId,
        }),
      });
      setPlanForm({ goals: "", frequency_per_week: "3", duration_weeks: "6" });
      void load();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل إنشاء خطة العلاج." : "Failed to create treatment plan."));
    } finally {
      setBusy(false);
    }
  }

  async function logSession(planId: string) {
    if (!session || !sessionForm.activities) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/rehabilitation/sessions/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({
          plan: planId, session_date: new Date().toISOString().slice(0, 10),
          duration_minutes: Number(sessionForm.duration_minutes), activities: sessionForm.activities,
          therapist_id: session.userId,
        }),
      });
      setSessionForm({ duration_minutes: "45", activities: "" });
      void load();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تسجيل الجلسة." : "Failed to log session."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return <div role="alert" className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل بيانات إعادة التأهيل" : "Unable to load rehab data"}</h1><p className="mt-1 text-sm text-ink/50">{fetchError}</p></div>;
  }
  if (referrals === null) {
    return <div className="mx-auto mt-16 max-w-lg text-center text-sm text-ink/40">{isAr ? "جارٍ التحميل..." : "Loading..."}</div>;
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Activity size={22} /> {isAr ? "خدمات إعادة التأهيل" : "Rehabilitation Services"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? `${referrals.length} إحالة (إحالات)` : `${referrals.length} referral(s)`}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="space-y-3">
        {referrals.length === 0 && <div className="rounded-xl border border-ink/10 bg-surface-raised p-6 text-center text-sm text-ink/50">{isAr ? "لا توجد إحالات مسجلة." : "No referrals on record."}</div>}
        {referrals.map(ref => {
          const plan = plans.find(p => p.referral === ref.id);
          const planSessions = plan ? sessions.filter(s => s.plan === plan.id) : [];
          const planOutcomes = plan ? outcomes.filter(o => o.plan === plan.id) : [];
          const isExpanded = expanded === ref.id;
          return (
            <div key={ref.id} className="rounded-xl border border-ink/10 bg-surface-raised p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold capitalize">{ref.discipline.replace("_", " ")}</div>
                  <div className="text-xs text-ink/50">{ref.diagnosis}</div>
                </div>
                <button onClick={() => setExpanded(isExpanded ? null : ref.id)} className="rounded-md border border-brand-400/40 px-2 py-1 text-xs font-semibold text-brand-300 hover:bg-brand-500/10">
                  {isExpanded ? (isAr ? "إغلاق" : "Close") : (isAr ? "إدارة" : "Manage")}
                </button>
              </div>

              {/* Non-skippable sequence: Referral -> Plan -> Session -> Outcome */}
              <div className="mt-3 flex items-center gap-2 text-xs">
                {(isAr ? ["الإحالة", "خطة العلاج", "جلسة نشطة", "النتيجة"] : ["Referral", "Treatment Plan", "Active Session", "Outcome"]).map((step, i) => {
                  const done = i === 0 || (i === 1 && plan) || (i === 2 && planSessions.length > 0) || (i === 3 && planOutcomes.length > 0);
                  return (
                    <div key={step} className={`flex items-center gap-1 ${done ? "text-emerald-400" : "text-ink/30"}`}>
                      <span className={`h-2 w-2 rounded-full ${done ? "bg-emerald-400" : "bg-ink/20"}`} />
                      {step}
                      {i < 3 && <span className="mx-1 text-ink/20">{isAr ? "←" : "→"}</span>}
                    </div>
                  );
                })}
              </div>

              {isExpanded && (
                <div className="mt-4 border-t border-ink/10 pt-4">
                  {!plan ? (
                    <div>
                      <div className="mb-2 text-xs font-semibold text-ink/50">{isAr ? "الخطوة 1: إنشاء خطة علاج (مطلوبة قبل تسجيل الجلسات)" : "Step 1: Create Treatment Plan (required before sessions can be logged)"}</div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                        <input value={planForm.goals} onChange={e => setPlanForm(f => ({ ...f, goals: e.target.value }))} placeholder={isAr ? "الأهداف" : "Goals"} className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm sm:col-span-2" />
                        <input type="number" value={planForm.frequency_per_week} onChange={e => setPlanForm(f => ({ ...f, frequency_per_week: e.target.value }))} placeholder={isAr ? "جلسات/أسبوع" : "Sessions/week"} className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                        <input type="number" value={planForm.duration_weeks} onChange={e => setPlanForm(f => ({ ...f, duration_weeks: e.target.value }))} placeholder={isAr ? "المدة (أسابيع)" : "Duration (weeks)"} className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                      </div>
                      <button disabled={busy || !planForm.goals} onClick={() => createPlan(ref.id)} className="cy-btn cy-btn-primary !min-h-0 mt-2 !py-1.5 !px-3 text-xs disabled:opacity-50">{isAr ? "إنشاء الخطة" : "Create Plan"}</button>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-2 text-xs text-ink/50">{isAr ? `الخطة: ${plan.goals} (${plan.frequency_per_week} مرات/أسبوع، ${plan.duration_weeks} أسابيع)` : `Plan: ${plan.goals} (${plan.frequency_per_week}x/week, ${plan.duration_weeks} weeks)`}</div>
                      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                        <input type="number" value={sessionForm.duration_minutes} onChange={e => setSessionForm(f => ({ ...f, duration_minutes: e.target.value }))} placeholder={isAr ? "دقائق" : "Minutes"} className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                        <input value={sessionForm.activities} onChange={e => setSessionForm(f => ({ ...f, activities: e.target.value }))} placeholder={isAr ? "الأنشطة المنفذة" : "Activities performed"} className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm sm:col-span-2" />
                        <button disabled={busy || !sessionForm.activities} onClick={() => logSession(plan.id)} className="cy-btn cy-btn-primary !min-h-0 !py-1.5 !px-3 text-xs disabled:opacity-50">{isAr ? "تسجيل الجلسة" : "Log Session"}</button>
                      </div>
                      <div className="text-xs text-ink/50">{isAr ? `${planSessions.length} جلسة (جلسات) مسجلة، ${planOutcomes.length} قياس (قياسات) نتيجة مسجل` : `${planSessions.length} session(s) logged, ${planOutcomes.length} outcome measurement(s) recorded`}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
