"use client";

import { useState, useEffect, useCallback } from "react";
import { FlaskConical } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface ResearchProtocol {
  id: string;
  title: string;
  protocol_number: string;
  irb_status: string;
  phase: string;
  is_actively_enrolling: boolean;
}
interface StudyEnrollment {
  id: string;
  protocol: string;
  protocol_title: string;
  patient_id: string;
  status: string;
  consent_obtained: boolean;
  consent_date: string | null;
}
interface Paginated<T> { count: number; results: T[]; }

export default function ResearchPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [protocols, setProtocols] = useState<ResearchProtocol[] | null>(null);
  const [enrollments, setEnrollments] = useState<StudyEnrollment[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ protocol: "", patient_id: "", consent_obtained: false });

  const load = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [protoPage, enrollPage] = await Promise.all([
        apiFetch<Paginated<ResearchProtocol>>("/api/v1/hospital/research/protocols/", opts),
        apiFetch<Paginated<StudyEnrollment>>("/api/v1/hospital/research/enrollments/", opts),
      ]);
      setProtocols(protoPage.results);
      setEnrollments(enrollPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل بيانات الأبحاث." : "Failed to load research data."));
    }
  }, [session, isAr]);

  useEffect(() => { void load(); }, [load]);

  async function enroll() {
    // Frontend-side gate matches the real backend rule (StudyEnrollment.
    // clean(): status can never be "enrolled" without consent_obtained) --
    // this is a UX convenience, the backend enforces it regardless.
    if (!session || !form.protocol || !form.patient_id || !form.consent_obtained) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/research/enrollments/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({
          protocol: form.protocol, patient_id: form.patient_id, status: "enrolled",
          consent_obtained: true, consent_date: new Date().toISOString().slice(0, 10),
        }),
      });
      setForm({ protocol: "", patient_id: "", consent_obtained: false });
      void load();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تسجيل الخاضع." : "Failed to enroll subject."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return <div role="alert" className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل بيانات الأبحاث" : "Unable to load research data"}</h1><p className="mt-1 text-sm text-ink/50">{fetchError}</p></div>;
  }
  if (protocols === null) {
    return <div className="mx-auto mt-16 max-w-lg text-center text-sm text-ink/40">{isAr ? "جارٍ التحميل..." : "Loading..."}</div>;
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><FlaskConical size={22} /> {isAr ? "الأبحاث" : "Research"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? `${protocols.length} بروتوكول (بروتوكولات)، ${enrollments.length} تسجيل (تسجيلات)` : `${protocols.length} protocol(s), ${enrollments.length} enrollment(s)`}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="mb-6 overflow-hidden rounded-xl border border-ink/10 bg-surface-raised">
        <div className="border-b border-ink/10 px-4 py-3 text-sm font-semibold">{isAr ? "بروتوكولات لجنة أخلاقيات البحث" : "IRB Protocols"}</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/5">
                {(isAr ? ["رقم البروتوكول", "العنوان", "المرحلة", "حالة اللجنة", "قيد التسجيل؟"] : ["Protocol #", "Title", "Phase", "IRB Status", "Enrolling?"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-ink/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {protocols.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink/50">{isAr ? "لا توجد بروتوكولات مسجلة." : "No protocols on record."}</td></tr>}
              {protocols.map(p => (
                <tr key={p.id} className="border-b border-ink/5">
                  <td className="px-4 py-3 font-mono text-xs">{p.protocol_number}</td>
                  <td className="px-4 py-3">{p.title}</td>
                  <td className="px-4 py-3 text-ink/60 capitalize">{p.phase.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-ink/60 capitalize">{p.irb_status}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${p.is_actively_enrolling ? "text-emerald-400" : "text-ink/40"}`}>
                      {p.is_actively_enrolling ? (isAr ? "نعم" : "Yes") : (isAr ? "لا" : "No")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-surface-raised">
        <div className="border-b border-ink/10 px-4 py-3 text-sm font-semibold">{isAr ? "تسجيل خاضع" : "Enroll a Subject"}</div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
          <select value={form.protocol} onChange={e => setForm(f => ({ ...f, protocol: e.target.value }))} className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm">
            <option value="">{isAr ? "اختر البروتوكول..." : "Select protocol..."}</option>
            {protocols.filter(p => p.is_actively_enrolling).map(p => <option key={p.id} value={p.id}>{p.protocol_number} — {p.title}</option>)}
          </select>
          <input value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))} placeholder={isAr ? "معرف المريض (UUID)" : "Patient ID (UUID)"} className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm">
            <input type="checkbox" checked={form.consent_obtained} onChange={e => setForm(f => ({ ...f, consent_obtained: e.target.checked }))} />
            {isAr ? "الموافقة موثّقة" : "Consent documented"}
          </label>
          <button
            disabled={busy || !form.protocol || !form.patient_id || !form.consent_obtained}
            onClick={() => void enroll()}
            title={!form.consent_obtained ? (isAr ? "التسجيل محظور: يلزم توثيق موافقة المريض." : "Enrollment blocked: Documented patient consent is required.") : undefined}
            className="cy-btn cy-btn-primary disabled:opacity-40"
          >
            {isAr ? "تسجيل" : "Enroll"}
          </button>
        </div>
      </div>
    </div>
  );
}
