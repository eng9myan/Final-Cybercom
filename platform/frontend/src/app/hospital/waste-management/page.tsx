"use client";

import { useState, useEffect, useCallback } from "react";
import { Biohazard } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface WasteCollectionLog {
  id: string;
  waste_type: string;
  source_location: string;
  status: string;
}
interface HaulerManifest {
  id: string;
  manifest_number: string;
  hauler_company: string;
  waste_type: string;
  total_weight_kg: string;
  facility_representative_signed: boolean;
  driver_signature_confirmed: boolean;
  status: "pending" | "in_transit" | "disposed";
}
interface Paginated<T> { count: number; results: T[]; }

const STATUS_LABEL_AR: Record<string, string> = { pending: "معلق", in_transit: "قيد النقل", disposed: "تم التخلص منه" };

export default function WasteManagementPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [logs, setLogs] = useState<WasteCollectionLog[] | null>(null);
  const [manifests, setManifests] = useState<HaulerManifest[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Local, per-manifest signature checkboxes -- these are what unlock the
  // "Mark In-Transit" button, mirroring the real backend rule (HaulerManifest.
  // clean(): status can't be "in_transit" without BOTH signatures).
  const [sigState, setSigState] = useState<Record<string, { rep: boolean; driver: boolean }>>({});

  const load = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [logPage, manifestPage] = await Promise.all([
        apiFetch<Paginated<WasteCollectionLog>>("/api/v1/hospital/waste-management/collection-logs/", opts),
        apiFetch<Paginated<HaulerManifest>>("/api/v1/hospital/waste-management/hauler-manifests/", opts),
      ]);
      setLogs(logPage.results);
      setManifests(manifestPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل بيانات إدارة النفايات." : "Failed to load waste management data."));
    }
  }, [session, isAr]);

  useEffect(() => { void load(); }, [load]);

  async function markInTransit(manifest: HaulerManifest) {
    const sig = sigState[manifest.id];
    if (!session || !sig?.rep || !sig?.driver) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/hospital/waste-management/hauler-manifests/${manifest.id}/`, {
        method: "PATCH", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({ facility_representative_signed: true, driver_signature_confirmed: true, status: "in_transit" }),
      });
      void load();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحديث حالة البيان." : "Failed to update manifest status."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return <div role="alert" className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل بيانات إدارة النفايات" : "Unable to load waste management data"}</h1><p className="mt-1 text-sm text-ink/50">{fetchError}</p></div>;
  }
  if (logs === null) {
    return <div className="mx-auto mt-16 max-w-lg text-center text-sm text-ink/40">{isAr ? "جارٍ التحميل..." : "Loading..."}</div>;
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Biohazard size={22} /> {isAr ? "إدارة النفايات" : "Waste Management"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? `${logs.length} سجل (سجلات) تجميع، ${manifests.length} بيان (بيانات) ناقل` : `${logs.length} collection log(s), ${manifests.length} hauler manifest(s)`}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="mb-6 overflow-hidden rounded-xl border border-ink/10 bg-surface-raised">
        <div className="border-b border-ink/10 px-4 py-3 text-sm font-semibold">{isAr ? "سجلات تجميع النفايات" : "Waste Collection Logs"}</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/5">
                {(isAr ? ["النوع", "موقع المصدر", "الحالة"] : ["Type", "Source Location", "Status"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-ink/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-ink/50">{isAr ? "لا توجد سجلات تجميع." : "No collection logs."}</td></tr>}
              {logs.map(l => (
                <tr key={l.id} className="border-b border-ink/5">
                  <td className="px-4 py-3 capitalize">{l.waste_type}</td>
                  <td className="px-4 py-3 text-ink/60">{l.source_location}</td>
                  <td className="px-4 py-3 capitalize text-ink/60">{isAr ? (STATUS_LABEL_AR[l.status] ?? l.status) : l.status.replace("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-surface-raised">
        <div className="border-b border-ink/10 px-4 py-3 text-sm font-semibold">{isAr ? "بيانات الناقل — توقيع مزدوج" : "Hauler Manifests — Dual Sign-Off"}</div>
        <div className="divide-y divide-ink/5">
          {manifests.length === 0 && <div className="px-4 py-6 text-center text-sm text-ink/50">{isAr ? "لا توجد بيانات ناقل." : "No hauler manifests."}</div>}
          {manifests.map(m => {
            const sig = sigState[m.id] ?? { rep: m.facility_representative_signed, driver: m.driver_signature_confirmed };
            const bothSigned = sig.rep && sig.driver;
            return (
              <div key={m.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-xs text-ink/40">{m.manifest_number}</div>
                    <div className="font-semibold">{m.hauler_company} — <span className="capitalize">{m.waste_type}</span> ({m.total_weight_kg} kg)</div>
                  </div>
                  <span className="rounded-md bg-ink/5 px-2 py-0.5 text-xs font-semibold capitalize text-ink/60">{isAr ? (STATUS_LABEL_AR[m.status] ?? m.status) : m.status.replace("_", " ")}</span>
                </div>
                {m.status === "pending" && (
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={sig.rep} onChange={e => setSigState(prev => ({ ...prev, [m.id]: { ...sig, rep: e.target.checked } }))} />
                      {isAr ? "وقّع مسؤول السلامة البيئية بالمستشفى" : "Hospital Environmental Safety Officer signed"}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={sig.driver} onChange={e => setSigState(prev => ({ ...prev, [m.id]: { ...sig, driver: e.target.checked } }))} />
                      {isAr ? "وقّع مقاول التخلص من النفايات المرخّص" : "Licensed Waste Disposal Contractor signed"}
                    </label>
                    <button
                      disabled={busy || !bothSigned}
                      onClick={() => markInTransit(m)}
                      title={!bothSigned ? (isAr ? "التوقيعان مطلوبان قبل وضع علامة قيد النقل." : "Both signatures are required before marking in-transit.") : undefined}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/40"
                    >
                      {isAr ? "وضع علامة قيد النقل" : "Mark In-Transit"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
