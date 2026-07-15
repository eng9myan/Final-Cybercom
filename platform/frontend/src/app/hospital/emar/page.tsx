"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Pill } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

type MarStatus = "scheduled" | "given" | "held" | "refused" | "missed" | "late";

interface MedicationOrder {
  id: string;
  patient_id: string;
  drug_name: string;
  dose: string;
  dose_unit: string;
  route: string;
  frequency: string;
  order_type: string;
  status: string;
}
interface MarRecord {
  id: string;
  medication_order: string;
  patient_id: string;
  scheduled_at: string;
  status: MarStatus;
  administered_at: string | null;
  dose_given: string;
  barcode_match_verified: boolean;
}
interface Patient { id: string; first_name: string; last_name: string; mrn: string; }
interface Paginated<T> { count: number; results: T[]; }

const STATUS_COLOR: Record<MarStatus, string> = {
  scheduled: "#3b82f6", given: "#22c55e", held: "#f59e0b",
  refused: "#ef4444", missed: "#6b7280", late: "#f97316",
};
const STATUS_LABEL_AR: Record<MarStatus, string> = {
  scheduled: "مجدول", given: "تم إعطاؤه", held: "معلّق", refused: "مرفوض", missed: "فائت", late: "متأخر",
};

export default function EMARPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [orders, setOrders] = useState<MedicationOrder[]>([]);
  const [marRecords, setMarRecords] = useState<MarRecord[] | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [givePanelId, setGivePanelId] = useState<string | null>(null);
  const [givePatientBarcode, setGivePatientBarcode] = useState("");
  const [giveDrugBarcode, setGiveDrugBarcode] = useState("");
  const [holdPanelId, setHoldPanelId] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [refusePanelId, setRefusePanelId] = useState<string | null>(null);
  const [refuseReason, setRefuseReason] = useState("");

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [orderPage, marPage, patientPage] = await Promise.all([
        apiFetch<Paginated<MedicationOrder>>("/api/v1/pharmacy/prescriptions/orders/", opts),
        apiFetch<Paginated<MarRecord>>("/api/v1/pharmacy/administration/records/", opts),
        apiFetch<Paginated<Patient>>("/api/v1/patients/", opts),
      ]);
      setOrders(orderPage.results);
      setMarRecords(marPage.results);
      setPatients(patientPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل بيانات سجل إعطاء الأدوية." : "Failed to load eMAR data."));
    }
  }, [session, isAr]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function actOnDose(mar: MarRecord, action: "administer" | "hold" | "refuse", extra: Record<string, string> = {}) {
    if (!session) return;
    setSubmittingId(mar.id);
    setActionError(null);
    try {
      await apiFetch(`/api/v1/pharmacy/administration/records/${mar.id}/${action}/`, {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify(extra),
      });
      setGivePanelId(null);
      setHoldPanelId(null);
      setRefusePanelId(null);
      setGivePatientBarcode("");
      setGiveDrugBarcode("");
      setHoldReason("");
      setRefuseReason("");
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      const actionLabelAr = action === "administer" ? "إعطاء" : action === "hold" ? "تعليق" : "رفض";
      setActionError(detail || (isAr ? `فشل ${actionLabelAr} الجرعة.` : `Failed to ${action} dose.`));
    } finally {
      setSubmittingId(null);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل بيانات سجل إعطاء الأدوية" : "Unable to load eMAR data"}</h1>
        <p className="mt-2 text-white/50">{fetchError}</p>
      </div>
    );
  }
  if (marRecords === null) {
    return <div className="mt-16 text-center text-white/50">{isAr ? "جارٍ تحميل بيانات سجل إعطاء الأدوية المباشرة..." : "Loading live eMAR data..."}</div>;
  }

  const orderById = (id: string) => orders.find(o => o.id === id);
  const patientById = (id: string) => patients.find(p => p.id === id);
  const dueCount = marRecords.filter(m => m.status === "scheduled").length;
  const givenCount = marRecords.filter(m => m.status === "given" || m.status === "late").length;
  const heldOrRefusedCount = marRecords.filter(m => m.status === "held" || m.status === "refused").length;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Pill size={22} /> {isAr ? "سجل إعطاء الأدوية الإلكتروني" : "Medication Administration Record"}</h1>
          <p className="mt-1 text-sm text-white/50">{isAr ? "سجل إعطاء الأدوية المباشر لهذا المستأجر -- جرعات موثقة بالباركود عند السرير" : "Live eMAR for this tenant -- bedside barcode-verified dosing"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 bg-surface-raised p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{dueCount}</p>
          <p className="mt-1 text-xs text-white/50">{isAr ? "مستحق" : "Due"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface-raised p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{givenCount}</p>
          <p className="mt-1 text-xs text-white/50">{isAr ? "تم إعطاؤه" : "Given"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface-raised p-4 text-center">
          <p className="text-2xl font-bold text-amber-400">{heldOrRefusedCount}</p>
          <p className="mt-1 text-xs text-white/50">{isAr ? "معلّق / مرفوض" : "Held / Refused"}</p>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{actionError}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {(isAr ? ["المريض", "الدواء", "الجرعة", "الطريق", "المجدول", "الحالة", "الباركود", "إجراءات"] : ["Patient", "Drug", "Dose", "Route", "Scheduled", "Status", "Barcode", "Actions"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-white/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {marRecords.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-white/50">{isAr ? "لا توجد سجلات إعطاء أدوية مجدولة لهذا المستأجر بعد." : "No medication administration records scheduled for this tenant yet."}</td></tr>
              )}
              {marRecords.map(mar => {
                const order = orderById(mar.medication_order);
                const patient = patientById(mar.patient_id);
                const busy = submittingId === mar.id;
                return (
                  <Fragment key={mar.id}>
                    <tr className="border-b border-white/5">
                      <td className="px-4 py-3 font-medium">{patient ? `${patient.first_name} ${patient.last_name} (${patient.mrn})` : (isAr ? "مريض غير معروف" : "Unknown patient")}</td>
                      <td className="px-4 py-3">{order?.drug_name ?? "—"}</td>
                      <td className="px-4 py-3 text-white/60">{mar.dose_given || (order ? `${order.dose} ${order.dose_unit}` : "—")}</td>
                      <td className="px-4 py-3 text-white/60">{order?.route ?? "—"}</td>
                      <td className="px-4 py-3 text-white/60">{new Date(mar.scheduled_at).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize" style={{ background: `${STATUS_COLOR[mar.status]}22`, color: STATUS_COLOR[mar.status] }}>{isAr ? STATUS_LABEL_AR[mar.status] : mar.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {mar.administered_at ? (
                          <span className={mar.barcode_match_verified ? "text-green-400" : "text-amber-400"}>
                            {mar.barcode_match_verified ? (isAr ? "تم التحقق" : "Verified") : (isAr ? "تجاوز" : "Override")}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {mar.status === "scheduled" && (
                          <div className="flex gap-1.5">
                            <button
                              disabled={busy}
                              onClick={() => { setGivePanelId(givePanelId === mar.id ? null : mar.id); setHoldPanelId(null); setRefusePanelId(null); }}
                              className="rounded-md bg-green-500/15 px-2 py-1 text-xs font-semibold text-green-400 hover:bg-green-500/25 disabled:opacity-40"
                            >
                              {isAr ? "إعطاء" : "Give"}
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => { setHoldPanelId(holdPanelId === mar.id ? null : mar.id); setGivePanelId(null); setRefusePanelId(null); }}
                              className="rounded-md bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/25 disabled:opacity-40"
                            >
                              {isAr ? "تعليق" : "Hold"}
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => { setRefusePanelId(refusePanelId === mar.id ? null : mar.id); setGivePanelId(null); setHoldPanelId(null); }}
                              className="rounded-md bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/25 disabled:opacity-40"
                            >
                              {isAr ? "رفض" : "Refuse"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {givePanelId === mar.id && (
                      <tr className="border-b border-white/5 bg-white/5">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="text-xs text-white/50">{isAr ? "باركود سوار المريض (رقم الملف)" : "Patient wristband barcode (MRN)"}
                              <input value={givePatientBarcode} onChange={e => setGivePatientBarcode(e.target.value)} placeholder={patient?.mrn} className="mt-1 block w-56 rounded-lg border border-white/10 bg-surface-overlay px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none" />
                            </label>
                            <label className="text-xs text-white/50">{isAr ? "باركود عبوة الدواء (رمز الدواء)" : "Drug package barcode (drug code)"}
                              <input value={giveDrugBarcode} onChange={e => setGiveDrugBarcode(e.target.value)} className="mt-1 block w-56 rounded-lg border border-white/10 bg-surface-overlay px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none" />
                            </label>
                            <button
                              disabled={busy}
                              onClick={() => void actOnDose(mar, "administer", { patient_barcode_scanned: givePatientBarcode, drug_barcode_scanned: giveDrugBarcode })}
                              className="rounded-lg bg-green-500 px-4 py-1.5 text-sm font-semibold text-black hover:bg-green-600 disabled:opacity-40"
                            >
                              {busy ? (isAr ? "جارٍ التأكيد..." : "Confirming...") : (isAr ? "تأكيد الإعطاء" : "Confirm Administration")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {holdPanelId === mar.id && (
                      <tr className="border-b border-white/5 bg-white/5">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="text-xs text-white/50">{isAr ? "سبب تعليق هذه الجرعة" : "Reason for holding this dose"}
                              <input value={holdReason} onChange={e => setHoldReason(e.target.value)} className="mt-1 block w-72 rounded-lg border border-white/10 bg-surface-overlay px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none" />
                            </label>
                            <button disabled={busy || !holdReason} onClick={() => void actOnDose(mar, "hold", { hold_reason: holdReason })} className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-black hover:bg-amber-600 disabled:opacity-40">
                              {busy ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "تأكيد التعليق" : "Confirm Hold")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {refusePanelId === mar.id && (
                      <tr className="border-b border-white/5 bg-white/5">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="text-xs text-white/50">{isAr ? "سبب رفض المريض" : "Reason patient refused"}
                              <input value={refuseReason} onChange={e => setRefuseReason(e.target.value)} className="mt-1 block w-72 rounded-lg border border-white/10 bg-surface-overlay px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none" />
                            </label>
                            <button disabled={busy || !refuseReason} onClick={() => void actOnDose(mar, "refuse", { refused_reason: refuseReason })} className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-semibold hover:bg-red-600 disabled:opacity-40">
                              {busy ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "تأكيد الرفض" : "Confirm Refusal")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
