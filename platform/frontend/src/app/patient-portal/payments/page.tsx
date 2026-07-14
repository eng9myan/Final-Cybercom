"use client";

import { usePreferences } from "@/contexts/preferences";
import { useAuth } from "@/contexts/auth";
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Interfaces (mirror real backend serializers) ──────────────────────────────
// patient_portal.payments.PatientInvoiceSerializer: id, account_id, patient_id,
// invoice_number, invoice_type, provider_name, service_date, amount_total,
// amount_covered_insurance, amount_patient_due, amount_paid, currency, status,
// due_date, notes. Real /pay/ action records a PaymentTransaction against the
// invoice -- an internal payment ledger, not a live card-gateway integration.

interface InvoiceRaw {
  id: string;
  invoice_number: string;
  invoice_type: string;
  provider_name: string;
  service_date: string | null;
  amount_total: string;
  amount_covered_insurance: string;
  amount_patient_due: string;
  amount_paid: string;
  currency: string;
  status: "pending" | "partially_paid" | "paid" | "overdue" | "cancelled" | "refunded";
  notes: string;
}
interface Paginated<T> { count: number; results: T[]; }

const STATUS_COLOR: Record<string, string> = {
  pending: "#f59e0b", partially_paid: "#22D3EE", paid: "#22c55e",
  overdue: "#ef4444", cancelled: "#6b7280", refunded: "#8b5cf6",
};

export default function PatientPaymentsPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [invoices, setInvoices] = useState<InvoiceRaw[]>([]);
  const [payMethod, setPayMethod] = useState<"credit_card" | "debit_card" | "bank_transfer" | "digital_wallet" | "cash">("cash");
  const [showPayForm, setShowPayForm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const isAr = lang === "ar";

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<Paginated<InvoiceRaw>>("/api/v1/patient-portal/payments/invoices/", {
        token: session.accessToken, tenantId: session.tenantId,
      });
      setInvoices(data.results ?? []);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load invoices."));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData]);

  const outstanding = invoices.filter(i => i.status === "pending" || i.status === "partially_paid" || i.status === "overdue");
  const paid = invoices.filter(i => i.status === "paid");
  const totalDue = outstanding.reduce((a, i) => a + (Number(i.amount_patient_due) - Number(i.amount_paid)), 0);

  const handlePay = async (inv: InvoiceRaw) => {
    if (!session) return;
    setPaying(true);
    setPayMsg(null);
    try {
      const remaining = (Number(inv.amount_patient_due) - Number(inv.amount_paid)).toFixed(2);
      await apiFetch(`/api/v1/patient-portal/payments/invoices/${inv.id}/pay/`, {
        method: "POST",
        body: JSON.stringify({ amount: remaining, payment_method: payMethod }),
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      setPayMsg(isAr ? "تم تسجيل الدفعة." : "Payment recorded.");
      setShowPayForm(null);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setPayMsg(detail || (err instanceof Error ? err.message : "Payment failed."));
    } finally {
      setPaying(false);
      setTimeout(() => setPayMsg(null), 4000);
    }
  };

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }

  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل الفواتير" : "Unable to load invoices"}</h1>
        <p className="mt-1 text-sm text-ink/50">{fetchError}</p>
        <button onClick={() => void loadData()} className="cy-btn cy-btn-ghost mt-4 !min-h-0 !py-2 !px-4 text-sm">{isAr ? "إعادة المحاولة" : "Retry"}</button>
      </div>
    );
  }

  const InvRow = ({ inv }: { inv: InvoiceRaw }) => {
    const remaining = Number(inv.amount_patient_due) - Number(inv.amount_paid);
    const canPay = inv.status === "pending" || inv.status === "partially_paid" || inv.status === "overdue";
    return (
      <div className="cy-card mb-3 p-0" style={{ borderLeft: `4px solid ${STATUS_COLOR[inv.status]}` }}>
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex-1">
              <div className="font-semibold capitalize">{inv.invoice_type} — {inv.provider_name}</div>
              <div className="text-[13px] text-ink/50">{inv.invoice_number} · {inv.service_date ?? "—"}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-ink/50">{isAr ? "المجموع" : "Total"}: {inv.currency} {inv.amount_total}</div>
              <div className="text-xs text-ink/50">{isAr ? "التأمين" : "Insurance"}: {inv.currency} {inv.amount_covered_insurance}</div>
              <div className="font-bold" style={{ color: STATUS_COLOR[inv.status] }}>{isAr ? "المتبقي" : "Remaining"}: {inv.currency} {remaining.toFixed(2)}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="rounded px-2 py-0.5 text-xs font-semibold capitalize" style={{ background: `${STATUS_COLOR[inv.status]}22`, color: STATUS_COLOR[inv.status], border: `1px solid ${STATUS_COLOR[inv.status]}55` }}>{inv.status.replace("_", " ")}</span>
            {canPay && (
              <button onClick={() => setShowPayForm(showPayForm === inv.id ? null : inv.id)} className="rounded-lg bg-emerald-500/15 px-4 py-1.5 text-[13px] font-semibold text-emerald-400 hover:bg-emerald-500/25">{isAr ? "دفع الآن" : "Pay Now"}</button>
            )}
          </div>
          {showPayForm === inv.id && (
            <div className="mt-3 rounded-lg border border-ink/10 bg-surface-overlay p-4">
              <div className="mb-2 text-sm font-semibold">{isAr ? "طريقة الدفع" : "Payment Method"}</div>
              <div className="mb-3 flex flex-wrap gap-2">
                {(["cash", "credit_card", "debit_card", "bank_transfer", "digital_wallet"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setPayMethod(m)}
                    className={`rounded px-3 py-1.5 text-sm font-semibold ${payMethod === m ? "border border-brand-400 bg-brand-500/15 text-brand-300" : "border border-ink/10 text-ink"}`}
                  >
                    {m.replace("_", " ")}
                  </button>
                ))}
              </div>
              <div className="mb-3 text-xs text-ink/50">
                {isAr ? "يسجل هذا دفعة حقيقية في دفتر الحسابات الداخلي — لا يوجد بوابة دفع خارجية متصلة." : "This records a real payment in the internal ledger — no external card gateway is connected."}
              </div>
              <div className="flex gap-2">
                <button disabled={paying} onClick={() => { void handlePay(inv); }} className="cy-btn bg-emerald-500 text-white disabled:opacity-50">
                  {paying ? (isAr ? "جارٍ..." : "Processing...") : (isAr ? `تأكيد الدفع — ${inv.currency} ${remaining.toFixed(2)}` : `Confirm — ${inv.currency} ${remaining.toFixed(2)}`)}
                </button>
                <button onClick={() => setShowPayForm(null)} className="cy-btn cy-btn-ghost">{isAr ? "إلغاء" : "Cancel"}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-4xl" style={{ direction: isAr ? "rtl" : "ltr" }}>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{isAr ? "المدفوعات والفواتير" : "Payments & Billing"}</h1>
          <p className="text-sm text-ink/50">{isAr ? "سجل فواتيرك ومدفوعاتك" : "Your invoice history and payment portal"}</p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-xs text-ink/50">●</span>}
          <a href="/patient-portal" className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">{isAr ? "← البوابة" : "← Portal"}</a>
          <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">{isAr ? "English" : "العربية"}</button>
        </div>
      </header>

      {payMsg && (
        <div className="mb-4 rounded-lg border border-brand-400/40 bg-brand-500/10 px-4 py-2.5 text-sm">{payMsg}</div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: isAr ? "إجمالي المستحق" : "Total Outstanding", value: totalDue.toFixed(2), color: "#f59e0b" },
          { label: isAr ? "فواتير غير مدفوعة" : "Unpaid Invoices", value: outstanding.length, color: "#ef4444" },
          { label: isAr ? "فواتير مدفوعة" : "Paid Invoices", value: paid.length, color: "#22c55e" },
        ].map(m => (
          <div key={m.label} className="cy-card p-5 text-center">
            <div className="text-2xl font-bold" style={{ color: m.color }}>{m.value}</div>
            <div className="mt-1 text-sm text-ink/50">{m.label}</div>
          </div>
        ))}
      </div>
      <div className="mb-8">
        <div className="mb-3 text-lg font-bold">{isAr ? "فواتير غير مدفوعة" : "Outstanding Invoices"}</div>
        {outstanding.length === 0 ? <div className="py-8 text-center text-ink/50">{isAr ? "لا توجد فواتير مستحقة" : "No outstanding invoices"}</div> : outstanding.map(i => <InvRow key={i.id} inv={i} />)}
      </div>
      <div>
        <div className="mb-3 text-lg font-bold">{isAr ? "الفواتير المدفوعة" : "Paid Invoices"}</div>
        {paid.length === 0 ? <div className="py-8 text-center text-ink/50">{isAr ? "لا توجد فواتير مدفوعة" : "No paid invoices"}</div> : paid.map(i => <InvRow key={i.id} inv={i} />)}
      </div>
    </div>
  );
}
