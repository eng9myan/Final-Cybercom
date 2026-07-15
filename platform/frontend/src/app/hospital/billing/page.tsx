"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Receipt, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

type BillingStatus = "open" | "coded" | "reviewed" | "billed" | "paid" | "partial" | "denied" | "written_off";
const STATUS_ORDER: BillingStatus[] = ["open", "coded", "reviewed", "billed"];

interface PatientAccount {
  id: string;
  patient_id: string;
}

interface EncounterBilling {
  id: string;
  patient_account: string;
  encounter_type: string;
  encounter_date: string;
  billing_status: BillingStatus;
  total_charges: string;
  balance_due: string;
  icd11_primary_diagnosis: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  amount_total: string;
  amount_outstanding: string;
  amount_paid: string;
  due_date: string;
}

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  mrn: string;
}

interface Paginated<T> {
  count: number;
  results: T[];
}

interface ICD11Result {
  code: string;
  display: string;
  system?: string;
}

const STATUS_COLOR: Record<string, string> = {
  open: "#ef4444", coded: "#f59e0b", reviewed: "#f59e0b", billed: "#3b82f6",
  paid: "#22c55e", partial: "#f59e0b", denied: "#ef4444", written_off: "#6b7280",
};
const STATUS_LABEL_AR: Record<string, string> = {
  all: "الكل", open: "مفتوح", coded: "تم الترميز", reviewed: "تمت المراجعة", billed: "تم إصدار الفاتورة",
  paid: "مدفوع", partial: "جزئي", denied: "مرفوض", written_off: "مشطوب",
};

export default function HospitalBilling() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [encounters, setEncounters] = useState<EncounterBilling[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [patientNames, setPatientNames] = useState<Map<string, string>>(new Map());
  const [statusFilter, setStatusFilter] = useState<"all" | BillingStatus>("all");
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [codingEncounterId, setCodingEncounterId] = useState<string | null>(null);
  const [icdQuery, setIcdQuery] = useState("");
  const [icdResults, setIcdResults] = useState<ICD11Result[] | null>(null);
  const [icdSearching, setIcdSearching] = useState(false);
  const [icdError, setIcdError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [accountsPage, encountersPage, invoicesPage, patientsPage] = await Promise.all([
        apiFetch<Paginated<PatientAccount>>("/api/v1/rcm/billing/patient-accounts/", opts),
        apiFetch<Paginated<EncounterBilling>>("/api/v1/rcm/billing/encounter-billings/", opts),
        apiFetch<Paginated<Invoice>>("/api/v1/rcm/billing/invoices/", opts),
        apiFetch<Paginated<Patient>>("/api/v1/patients/", opts),
      ]);
      const patientById = new Map(patientsPage.results.map(p => [p.id, `${p.first_name} ${p.last_name} (${p.mrn})`]));
      const accountToPatient = new Map(accountsPage.results.map(a => [a.id, a.patient_id]));
      const names = new Map<string, string>();
      for (const [accountId, patientId] of accountToPatient) {
        const name = patientById.get(patientId);
        if (name) names.set(accountId, name);
      }
      setPatientNames(names);
      setEncounters(encountersPage.results);
      setInvoices(invoicesPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل بيانات الفوترة." : "Failed to load billing data."));
    }
  }, [session, isAr]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function advanceStatus(encounter: EncounterBilling) {
    const idx = STATUS_ORDER.indexOf(encounter.billing_status);
    if (idx === -1 || idx === STATUS_ORDER.length - 1 || !session) return;
    try {
      await apiFetch(`/api/v1/rcm/billing/encounter-billings/${encounter.id}/`, {
        method: "PATCH",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ billing_status: STATUS_ORDER[idx + 1] }),
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (isAr ? "فشل تحديث حالة الفوترة." : "Failed to update billing status."));
    }
  }

  async function searchICD11() {
    if (!session || !icdQuery.trim()) return;
    setIcdSearching(true);
    setIcdError(null);
    try {
      const res = await apiFetch<{ results?: ICD11Result[] } | ICD11Result[]>("/api/v1/terminology/search/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ provider: "icd11", query: icdQuery, tenant_id: session.tenantId, limit: 10 }),
      });
      setIcdResults(Array.isArray(res) ? res : res.results ?? []);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setIcdError(detail || (err instanceof Error ? err.message : isAr ? "فشل البحث في ICD-11." : "ICD-11 search failed."));
      setIcdResults(null);
    } finally {
      setIcdSearching(false);
    }
  }

  async function assignDiagnosis(encounterId: string, result: ICD11Result) {
    if (!session) return;
    try {
      await apiFetch(`/api/v1/rcm/billing/encounter-billings/${encounterId}/`, {
        method: "PATCH",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ icd11_primary_diagnosis: `${result.code} — ${result.display}` }),
      });
      setCodingEncounterId(null);
      setIcdQuery(""); setIcdResults(null);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (isAr ? "فشل تعيين رمز التشخيص." : "Failed to assign diagnosis code."));
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل بيانات الفوترة" : "Unable to load billing data"}</h1>
        <p className="mt-2 text-ink/50">{fetchError}</p>
      </div>
    );
  }
  if (encounters === null || invoices === null) {
    return <div className="mt-16 text-center text-ink/50">{isAr ? "جارٍ تحميل بيانات الفوترة المباشرة..." : "Loading live billing data..."}</div>;
  }

  const outstandingInvoices = invoices.filter(i => ["issued", "sent", "partial", "overdue"].includes(i.status));
  const outstandingTotal = outstandingInvoices.reduce((s, i) => s + parseFloat(i.amount_outstanding), 0);
  const paidTotal = invoices.reduce((s, i) => s + parseFloat(i.amount_paid), 0);
  const unbilledTotal = encounters.filter(e => e.billing_status === "open").reduce((s, e) => s + parseFloat(e.total_charges), 0);
  const filtered = encounters.filter(e => statusFilter === "all" || e.billing_status === statusFilter);

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Receipt size={22} /> {isAr ? "الفوترة والفواتير" : "Billing & Invoicing"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? "فوترة الزيارات والفواتير المباشرة لهذا المستأجر" : "Live encounter billing and invoices for this tenant"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: isAr ? "غير مفوتر (مفتوح)" : "Unbilled (open)", value: `SAR ${unbilledTotal.toLocaleString()}`, color: "#ef4444" },
          { label: isAr ? "فواتير مستحقة" : "Outstanding invoices", value: `SAR ${outstandingTotal.toLocaleString()}`, color: "#f59e0b" },
          { label: isAr ? "تم تحصيله (مدفوع)" : "Collected (paid)", value: `SAR ${paidTotal.toLocaleString()}`, color: "#22c55e" },
          { label: isAr ? "الفواتير" : "Invoices", value: invoices.length, color: "#22D3EE" },
        ].map(c => (
          <div key={c.label} className="cy-card p-4">
            <p className="text-xs text-ink/50">{c.label}</p>
            <p className="mt-1 text-xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", ...STATUS_ORDER, "paid", "partial", "denied", "written_off"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg border px-3 py-1.5 text-sm capitalize ${statusFilter === s ? "border-brand-400 bg-brand-500/15 text-brand-200 font-semibold" : "border-ink/10 bg-surface-overlay text-ink/70"}`}
          >
            {isAr ? STATUS_LABEL_AR[s] : s} ({encounters.filter(e => s === "all" || e.billing_status === s).length})
          </button>
        ))}
      </div>

      <div className="cy-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/5">
                {(isAr
                  ? ["المريض", "التاريخ", "النوع", "التشخيص (ICD-11)", "الرسوم (ريال)", "الرصيد المستحق", "الحالة", "إجراء"]
                  : ["Patient", "Date", "Type", "Diagnosis (ICD-11)", "Charges (SAR)", "Balance Due", "Status", "Action"]
                ).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-ink/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-ink/50">{isAr ? "لا توجد سجلات فوترة لهذا الفلتر." : "No encounter billing records for this filter."}</td></tr>
              )}
              {filtered.map(enc => {
                const statusIdx = STATUS_ORDER.indexOf(enc.billing_status);
                const nextStatus = statusIdx >= 0 && statusIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[statusIdx + 1] : undefined;
                const isCoding = codingEncounterId === enc.id;
                return (
                  <Fragment key={enc.id}>
                    <tr className="border-b border-ink/5">
                      <td className="px-4 py-3 font-medium">{patientNames.get(enc.patient_account) || (isAr ? "مريض غير معروف" : "Unknown patient")}</td>
                      <td className="px-4 py-3 text-ink/60">{enc.encounter_date}</td>
                      <td className="px-4 py-3 capitalize text-ink/60">{enc.encounter_type}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setCodingEncounterId(isCoding ? null : enc.id); setIcdResults(null); setIcdQuery(""); setIcdError(null); }}
                          className="flex items-center gap-1.5 font-mono text-brand-300 hover:underline"
                        >
                          <Search size={12} /> {enc.icd11_primary_diagnosis || (isAr ? "تحديد التشخيص…" : "Set diagnosis…")}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-semibold">{parseFloat(enc.total_charges).toLocaleString()}</td>
                      <td className="px-4 py-3">{parseFloat(enc.balance_due).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize" style={{ background: `${STATUS_COLOR[enc.billing_status]}22`, color: STATUS_COLOR[enc.billing_status] }}>
                          {isAr ? STATUS_LABEL_AR[enc.billing_status] : enc.billing_status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {nextStatus && (
                          <button onClick={() => advanceStatus(enc)} className="rounded-md bg-brand-500 px-2 py-1 text-xs font-semibold capitalize hover:bg-brand-600">
                            {isAr ? `تعليم كـ ${STATUS_LABEL_AR[nextStatus]}` : `Mark ${nextStatus}`}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isCoding && (
                      <tr>
                        <td colSpan={8} className="bg-ink/[0.02] px-4 py-4">
                          <div className="flex gap-2">
                            <input
                              value={icdQuery}
                              onChange={e => setIcdQuery(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && searchICD11()}
                              placeholder={isAr ? "بحث ICD-11 (مثال: السكري النوع 2، الالتهاب الرئوي)…" : "Search ICD-11 (e.g. type 2 diabetes, pneumonia)…"}
                              className="w-full max-w-md rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm"
                            />
                            <button onClick={searchICD11} disabled={icdSearching || !icdQuery.trim()} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm disabled:opacity-50">
                              {icdSearching ? "…" : (isAr ? "بحث" : "Search")}
                            </button>
                          </div>
                          {icdError && <p className="mt-2 text-xs text-red-400">{icdError}</p>}
                          {icdResults && (
                            <div className="mt-3 grid max-w-lg gap-1.5">
                              {icdResults.length === 0 && <p className="text-xs text-ink/40">{isAr ? "لم يتم العثور على مفاهيم ICD-11 مطابقة." : "No ICD-11 concepts matched."}</p>}
                              {icdResults.map(r => (
                                <button
                                  key={r.code}
                                  onClick={() => assignDiagnosis(enc.id, r)}
                                  className="flex items-center justify-between rounded-lg border border-ink/10 bg-surface px-3 py-2 text-left text-sm hover:border-brand-400/40 hover:bg-brand-500/5"
                                >
                                  <span>{r.display}</span>
                                  <span className="font-mono text-xs text-ink/40">{r.code}</span>
                                </button>
                              ))}
                            </div>
                          )}
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
