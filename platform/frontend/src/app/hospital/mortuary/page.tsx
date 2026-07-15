"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface MortuaryCase {
  id: string;
  stay: string;
  refrigeration_bay: string;
  status: "in_refrigeration" | "autopsy_pending" | "autopsy_complete" | "released";
  intake_at: string;
}
interface Paginated<T> { count: number; results: T[]; }

const STATUS_LABEL: Record<MortuaryCase["status"], { en: string; ar: string }> = {
  in_refrigeration: { en: "In Refrigeration", ar: "في التبريد" },
  autopsy_pending: { en: "Autopsy Pending", ar: "بانتظار التشريح" },
  autopsy_complete: { en: "Autopsy Complete", ar: "اكتمل التشريح" },
  released: { en: "Released", ar: "تم التسليم" },
};

export default function MortuaryPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [cases, setCases] = useState<MortuaryCase[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [releaseForm, setReleaseForm] = useState({
    released_to_type: "family", released_to_name: "", released_to_relationship: "", id_verified: false,
  });

  const load = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const page = await apiFetch<Paginated<MortuaryCase>>("/api/v1/hospital/mortuary/cases/", opts);
      setCases(page.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل حالات المشرحة." : "Failed to load mortuary cases."));
    }
  }, [session, isAr]);

  useEffect(() => { void load(); }, [load]);

  async function submitRelease(caseId: string) {
    // The final release action stays hidden/locked until id_verified is
    // checked -- matches the real backend rule (ReleaseRecord.clean()
    // raises ValidationError without it). This is a UX gate, not the
    // enforcement itself; the backend rejects it regardless.
    if (!session || !releaseForm.released_to_name || !releaseForm.id_verified) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/mortuary/release-records/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({
          case: caseId, released_to_type: releaseForm.released_to_type, released_to_name: releaseForm.released_to_name,
          released_to_relationship: releaseForm.released_to_relationship, id_verified: releaseForm.id_verified,
          released_by: session.userId,
        }),
      });
      setReleaseForm({ released_to_type: "family", released_to_name: "", released_to_relationship: "", id_verified: false });
      setReleasing(null);
      void load();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تنفيذ التسليم." : "Failed to process release."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return <div role="alert" className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل حالات المشرحة" : "Unable to load mortuary cases"}</h1><p className="mt-1 text-sm text-ink/50">{fetchError}</p></div>;
  }
  if (cases === null) {
    return <div className="mx-auto mt-16 max-w-lg text-center text-sm text-ink/40">{isAr ? "جارٍ التحميل..." : "Loading..."}</div>;
  }

  const activeCases = cases.filter(c => c.status !== "released");

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Lock size={22} /> {isAr ? "المشرحة" : "Mortuary"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? `${activeCases.length} حالة (حالات) في الحيازة` : `${activeCases.length} case(s) in custody`}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="space-y-3">
        {activeCases.length === 0 && <div className="rounded-xl border border-ink/10 bg-surface-raised p-6 text-center text-sm text-ink/50">{isAr ? "لا توجد حالات نشطة في المشرحة." : "No active mortuary cases."}</div>}
        {activeCases.map(c => (
          <div key={c.id} className="rounded-xl border border-ink/10 bg-surface-raised p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{isAr ? `الحجيرة ${c.refrigeration_bay || "—"}` : `Bay ${c.refrigeration_bay || "—"}`}</div>
                <div className="text-xs text-ink/50">
                  {isAr
                    ? `الحالة: ${STATUS_LABEL[c.status].ar} · الدخول ${new Date(c.intake_at).toLocaleString()}`
                    : `Status: ${STATUS_LABEL[c.status].en} · Intake ${new Date(c.intake_at).toLocaleString()}`}
                </div>
              </div>
              {releasing !== c.id && (
                <button onClick={() => setReleasing(c.id)} className="rounded-md border border-ink/10 px-3 py-1.5 text-xs font-semibold hover:bg-ink/5">
                  {isAr ? "تسليم" : "Release"}
                </button>
              )}
            </div>

            {releasing === c.id && (
              <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/5 p-4">
                <div className="mb-3 text-xs font-semibold text-amber-300">{isAr ? "التحقق من سلسلة الحيازة مطلوب" : "Chain-of-Custody Verification Required"}</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select value={releaseForm.released_to_type} onChange={e => setReleaseForm(f => ({ ...f, released_to_type: e.target.value }))} className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm">
                    <option value="family">{isAr ? "أحد أفراد الأسرة" : "Family Member"}</option>
                    <option value="funeral_home">{isAr ? "دار جنائز" : "Funeral Home"}</option>
                    <option value="medical_examiner">{isAr ? "الطبيب الشرعي" : "Medical Examiner"}</option>
                    <option value="organ_procurement">{isAr ? "منظمة زراعة الأعضاء" : "Organ Procurement Organization"}</option>
                  </select>
                  <input value={releaseForm.released_to_name} onChange={e => setReleaseForm(f => ({ ...f, released_to_name: e.target.value }))} placeholder={isAr ? "اسم المستلم" : "Recipient name"} className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                  <input value={releaseForm.released_to_relationship} onChange={e => setReleaseForm(f => ({ ...f, released_to_relationship: e.target.value }))} placeholder={isAr ? "صلة القرابة (إن وجدت)" : "Relationship (if family)"} className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm sm:col-span-2" />
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={releaseForm.id_verified} onChange={e => setReleaseForm(f => ({ ...f, id_verified: e.target.checked }))} />
                  {isAr ? "تم التحقق من هوية المستلم الرسمي" : "Official recipient identity verified"}
                </label>
                <button
                  disabled={busy || !releaseForm.released_to_name || !releaseForm.id_verified}
                  onClick={() => submitRelease(c.id)}
                  title={!releaseForm.id_verified ? (isAr ? "التسليم محظور حتى يتم التحقق من الهوية." : "Release blocked until identity is verified.") : undefined}
                  className="mt-3 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/40"
                >
                  {isAr ? "تنفيذ التسليم" : "Execute Release"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
