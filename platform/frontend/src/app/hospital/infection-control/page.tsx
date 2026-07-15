"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldAlert, Hand } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface IsolationPrecaution {
  id: string;
  stay: string;
  precaution_type: string;
  reason: string;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
}
interface HAICase {
  id: string;
  stay: string;
  infection_site: string;
  device_associated: boolean;
  onset_date: string;
  status: string;
}
interface HandHygieneObservation {
  id: string;
  unit: string;
  moment: string;
  compliant: boolean;
  observed_at: string;
}
interface Paginated<T> { count: number; results: T[]; }

const PRECAUTION_LABELS: Record<string, { en: string; ar: string }> = {
  contact: { en: "Contact", ar: "تماس" },
  droplet: { en: "Droplet", ar: "رذاذ" },
  airborne: { en: "Airborne", ar: "منقول جواً" },
  protective: { en: "Protective (Reverse) Isolation", ar: "عزل وقائي (عكسي)" },
  contact_enteric: { en: "Contact Enteric (C. diff)", ar: "تماس معوي (المطثية العسيرة)" },
};

export default function InfectionControlPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [precautions, setPrecautions] = useState<IsolationPrecaution[] | null>(null);
  const [haiCases, setHaiCases] = useState<HAICase[]>([]);
  const [observations, setObservations] = useState<HandHygieneObservation[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hhForm, setHhForm] = useState({ unit: "", moment: "before_patient_contact", compliant: true });

  const load = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [precPage, haiPage, obsPage] = await Promise.all([
        apiFetch<Paginated<IsolationPrecaution>>("/api/v1/hospital/infection-control/isolation-precautions/", opts),
        apiFetch<Paginated<HAICase>>("/api/v1/hospital/infection-control/hai-cases/", opts),
        apiFetch<Paginated<HandHygieneObservation>>("/api/v1/hospital/infection-control/hand-hygiene-observations/", opts),
      ]);
      setPrecautions(precPage.results);
      setHaiCases(haiPage.results);
      setObservations(obsPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل بيانات مكافحة العدوى." : "Failed to load infection control data."));
    }
  }, [session, isAr]);

  useEffect(() => { void load(); }, [load]);

  async function lift(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/hospital/infection-control/isolation-precautions/${id}/lift/`, {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
      });
      void load();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل رفع الاحتياط." : "Failed to lift precaution."));
    } finally {
      setBusy(false);
    }
  }

  async function logObservation() {
    if (!session || !hhForm.unit) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/infection-control/hand-hygiene-observations/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({
          unit: hhForm.unit, moment: hhForm.moment, compliant: hhForm.compliant,
          observed_staff_id: session.userId, observed_by: session.userId,
        }),
      });
      setHhForm({ unit: "", moment: "before_patient_contact", compliant: true });
      void load();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تسجيل الملاحظة." : "Failed to log observation."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return <div role="alert" className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل بيانات مكافحة العدوى" : "Unable to load infection control data"}</h1><p className="mt-1 text-sm text-ink/50">{fetchError}</p></div>;
  }
  if (precautions === null) {
    return <div className="mx-auto mt-16 max-w-lg text-center text-sm text-ink/40">{isAr ? "جارٍ التحميل..." : "Loading..."}</div>;
  }

  const activePrecautions = precautions.filter(p => p.is_active);
  // Real compliance math computed client-side from raw observations -- never a
  // hand-typed percentage, matches the backend's own numerator/denominator rule.
  const totalObs = observations.length;
  const compliantObs = observations.filter(o => o.compliant).length;
  const complianceRate = totalObs > 0 ? Math.round((compliantObs / totalObs) * 1000) / 10 : null;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><ShieldAlert size={22} /> {isAr ? "مكافحة العدوى" : "Infection Control"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? `${activePrecautions.length} احتياط عزل نشط (نشطة)، ${haiCases.length} حالة (حالات) عدوى مكتسبة مسجلة` : `${activePrecautions.length} active isolation precaution(s), ${haiCases.length} HAI case(s) on record`}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-ink/10 bg-surface-raised p-4">
          <div className="text-2xl font-bold text-amber-400">{activePrecautions.length}</div>
          <div className="mt-1 text-xs text-ink/50">{isAr ? "احتياطات العزل النشطة" : "Active Isolation Precautions"}</div>
        </div>
        <div className="rounded-xl border border-ink/10 bg-surface-raised p-4">
          <div className="text-2xl font-bold text-red-400">{haiCases.filter(h => h.status !== "resolved" && h.status !== "ruled_out").length}</div>
          <div className="mt-1 text-xs text-ink/50">{isAr ? "حالات العدوى المكتسبة المفتوحة" : "Open HAI Cases"}</div>
        </div>
        <div className="rounded-xl border border-ink/10 bg-surface-raised p-4">
          <div className="text-2xl font-bold" style={{ color: complianceRate === null ? "#6b7280" : complianceRate >= 90 ? "#22c55e" : complianceRate >= 70 ? "#f59e0b" : "#ef4444" }}>
            {complianceRate === null ? "—" : `${complianceRate}%`}
          </div>
          <div className="mt-1 text-xs text-ink/50">{isAr ? `الالتزام بنظافة اليدين (${compliantObs}/${totalObs})` : `Hand Hygiene Compliance (${compliantObs}/${totalObs})`}</div>
        </div>
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-ink/10 bg-surface-raised">
        <div className="border-b border-ink/10 px-4 py-3 text-sm font-semibold">{isAr ? "احتياطات العزل النشطة" : "Active Isolation Precautions"}</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/5">
                {(isAr ? ["النوع", "السبب", "بدأ", "إجراء"] : ["Type", "Reason", "Started", "Action"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-ink/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activePrecautions.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-ink/50">{isAr ? "لا توجد احتياطات عزل نشطة." : "No active isolation precautions."}</td></tr>
              )}
              {activePrecautions.map(p => (
                <tr key={p.id} className="border-b border-ink/5">
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">{isAr ? (PRECAUTION_LABELS[p.precaution_type]?.ar ?? p.precaution_type) : (PRECAUTION_LABELS[p.precaution_type]?.en ?? p.precaution_type)}</span>
                  </td>
                  <td className="px-4 py-3 text-ink/60">{p.reason}</td>
                  <td className="px-4 py-3 text-ink/40">{new Date(p.started_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button disabled={busy} onClick={() => lift(p.id)} className="rounded-md border border-ink/10 px-2 py-1 text-xs font-semibold hover:bg-ink/5 disabled:opacity-50">
                      {isAr ? "رفع الاحتياط" : "Lift Precaution"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-surface-raised">
        <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3 text-sm font-semibold"><Hand size={16} /> {isAr ? "تسجيل ملاحظة نظافة اليدين" : "Log Hand Hygiene Observation"}</div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
          <input value={hhForm.unit} onChange={e => setHhForm(f => ({ ...f, unit: e.target.value }))} placeholder={isAr ? "الوحدة (مثال: العناية المركزة)" : "Unit (e.g. ICU)"} className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
          <select value={hhForm.moment} onChange={e => setHhForm(f => ({ ...f, moment: e.target.value }))} className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm">
            <option value="before_patient_contact">{isAr ? "قبل ملامسة المريض" : "Before Patient Contact"}</option>
            <option value="before_aseptic_procedure">{isAr ? "قبل إجراء معقم" : "Before Aseptic Procedure"}</option>
            <option value="after_body_fluid_exposure">{isAr ? "بعد خطر التعرض لسوائل الجسم" : "After Body Fluid Exposure Risk"}</option>
            <option value="after_patient_contact">{isAr ? "بعد ملامسة المريض" : "After Patient Contact"}</option>
            <option value="after_patient_surroundings">{isAr ? "بعد لمس محيط المريض" : "After Touching Patient Surroundings"}</option>
          </select>
          <select value={hhForm.compliant ? "yes" : "no"} onChange={e => setHhForm(f => ({ ...f, compliant: e.target.value === "yes" }))} className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm">
            <option value="yes">{isAr ? "ملتزم" : "Compliant"}</option>
            <option value="no">{isAr ? "غير ملتزم" : "Non-Compliant"}</option>
          </select>
          <button disabled={busy || !hhForm.unit} onClick={() => void logObservation()} className="cy-btn cy-btn-primary disabled:opacity-50">{isAr ? "تسجيل الملاحظة" : "Log Observation"}</button>
        </div>
      </div>
    </div>
  );
}
