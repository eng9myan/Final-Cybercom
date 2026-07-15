"use client";

import { useState, useEffect, useCallback } from "react";
import { Wrench, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface BiomedicalEquipment {
  id: string;
  asset: string;
  asset_name: string;
  asset_code: string;
  manufacturer: string;
  model_number: string;
  serial_number: string;
  department: string;
  status: "in_service" | "calibration_due" | "under_repair" | "out_of_service" | "decommissioned";
  calibration_interval_days: number;
  last_calibration_date: string | null;
  next_calibration_due: string | null;
  is_available_for_use: boolean;
}
interface Paginated<T> { count: number; results: T[]; }

const STATUS_LABELS: Record<BiomedicalEquipment["status"], { en: string; ar: string }> = {
  in_service: { en: "In Service", ar: "قيد الخدمة" },
  calibration_due: { en: "Calibration Due", ar: "المعايرة مستحقة" },
  under_repair: { en: "Under Repair", ar: "قيد الإصلاح" },
  out_of_service: { en: "Out of Service", ar: "خارج الخدمة" },
  decommissioned: { en: "Decommissioned", ar: "تم إيقاف تشغيله" },
};
const STATUS_COLORS: Record<BiomedicalEquipment["status"], string> = {
  in_service: "#22c55e",
  calibration_due: "#ef4444",
  under_repair: "#f59e0b",
  out_of_service: "#ef4444",
  decommissioned: "#6b7280",
};

export default function BioMedPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [equipment, setEquipment] = useState<BiomedicalEquipment[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [calibrating, setCalibrating] = useState<string | null>(null);
  const [calForm, setCalForm] = useState({ next_due_date: "", performed_by: "" });

  const load = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const page = await apiFetch<Paginated<BiomedicalEquipment>>("/api/v1/erp/assets/biomedical-equipment/", opts);
      setEquipment(page.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل الأجهزة." : "Failed to load equipment."));
    }
  }, [session, isAr]);

  useEffect(() => { void load(); }, [load]);

  async function submitCalibration(equipmentId: string) {
    if (!session || !calForm.performed_by) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/erp/assets/equipment-service-records/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          equipment: equipmentId,
          service_type: "calibration",
          service_date: new Date().toISOString().slice(0, 10),
          performed_by: calForm.performed_by,
          next_due_date: calForm.next_due_date || null,
        }),
      });
      setCalForm({ next_due_date: "", performed_by: "" });
      setCalibrating(null);
      void load();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تسجيل المعايرة." : "Failed to log calibration."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return <div role="alert" className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل الأجهزة" : "Unable to load equipment"}</h1><p className="mt-1 text-sm text-ink/50">{fetchError}</p></div>;
  }
  if (equipment === null) {
    return <div className="mx-auto mt-16 max-w-lg text-center text-sm text-ink/40">{isAr ? "جارٍ تحميل الأجهزة..." : "Loading equipment..."}</div>;
  }

  const dueCount = equipment.filter(e => e.status === "calibration_due").length;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Wrench size={22} /> {isAr ? "الهندسة الطبية الحيوية" : "Biomedical Engineering"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? `${equipment.length} جهاز (أجهزة) مُتابع، ${dueCount} بانتظار المعايرة` : `${equipment.length} tracked device(s), ${dueCount} awaiting calibration`}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/5">
                {(isAr ? ["الجهاز", "القسم", "موعد المعايرة القادم", "الحالة", "إجراء"] : ["Device", "Department", "Next Calibration Due", "Status", "Action"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-ink/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipment.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-ink/50">{isAr ? "لا توجد أجهزة طبية حيوية مسجلة." : "No biomedical equipment on record."}</td></tr>
              )}
              {equipment.map(item => (
                <tr key={item.id} className="border-b border-ink/5">
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.asset_name} <span className="text-ink/40">({item.asset_code})</span></div>
                    <div className="text-xs text-ink/40">{item.manufacturer} {item.model_number} · SN {item.serial_number}</div>
                  </td>
                  <td className="px-4 py-3 text-ink/60">{item.department || "—"}</td>
                  <td className="px-4 py-3 text-ink/60">{item.next_calibration_due ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
                      style={{ color: STATUS_COLORS[item.status], backgroundColor: `${STATUS_COLORS[item.status]}1a` }}
                    >
                      {item.status === "calibration_due" && <ShieldAlert size={12} />}
                      {isAr ? STATUS_LABELS[item.status].ar : STATUS_LABELS[item.status].en}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!item.is_available_for_use ? (
                      calibrating === item.id ? (
                        <div className="flex flex-col gap-1.5">
                          <input
                            value={calForm.performed_by}
                            onChange={e => setCalForm(f => ({ ...f, performed_by: e.target.value }))}
                            placeholder={isAr ? "الفني" : "Technician"}
                            className="w-36 rounded-md border border-ink/10 bg-surface px-2 py-1 text-xs"
                          />
                          <input
                            type="date"
                            value={calForm.next_due_date}
                            onChange={e => setCalForm(f => ({ ...f, next_due_date: e.target.value }))}
                            className="w-36 rounded-md border border-ink/10 bg-surface px-2 py-1 text-xs"
                          />
                          <button
                            disabled={busy || !calForm.performed_by}
                            onClick={() => submitCalibration(item.id)}
                            className="cy-btn cy-btn-primary !min-h-0 !py-1 !px-2 text-xs disabled:opacity-50"
                          >
                            {isAr ? "تسجيل المعايرة" : "Log Calibration"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCalibrating(item.id)}
                          className="rounded-md border border-red-500/40 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/10"
                          title={isAr ? "النشر محظور حتى يتم تسجيل معايرة جديدة" : "Deployment blocked until a new calibration record is logged"}
                        >
                          {isAr ? "تسجيل المعايرة" : "Log Calibration"}
                        </button>
                      )
                    ) : (
                      <span className="text-xs font-semibold text-emerald-400">{isAr ? "متاح للاستخدام" : "Available for Use"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
