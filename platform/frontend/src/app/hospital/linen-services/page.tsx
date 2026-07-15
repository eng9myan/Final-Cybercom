"use client";

import { useState, useEffect, useCallback } from "react";
import { Shirt } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface LinenCart {
  id: string;
  ward: string;
  cart_type: "clean" | "soiled";
  current_count: number;
  par_level: number;
  needs_attention: boolean;
}
interface LaundryBatch {
  id: string;
  source_ward: string;
  item_count_collected: number;
  item_count_returned: number | null;
  status: "collected" | "at_laundry" | "returned" | "short_count_flagged";
}
interface Paginated<T> { count: number; results: T[]; }

const STATUS_LABEL_AR: Record<string, string> = { collected: "تم التجميع", at_laundry: "في المغسلة", returned: "تم الإرجاع", short_count_flagged: "علامة نقص في العدد" };

export default function LinenServicesPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [carts, setCarts] = useState<LinenCart[] | null>(null);
  const [batches, setBatches] = useState<LaundryBatch[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [returnCounts, setReturnCounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [cartPage, batchPage] = await Promise.all([
        apiFetch<Paginated<LinenCart>>("/api/v1/hospital/linen-services/carts/", opts),
        apiFetch<Paginated<LaundryBatch>>("/api/v1/hospital/linen-services/laundry-batches/", opts),
      ]);
      setCarts(cartPage.results);
      setBatches(batchPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل بيانات المفروشات." : "Failed to load linen data."));
    }
  }, [session, isAr]);

  useEffect(() => { void load(); }, [load]);

  async function sendToLaundry(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/hospital/linen-services/laundry-batches/${id}/send_to_laundry/`, {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
      });
      void load();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل إرسال الدفعة إلى المغسلة." : "Failed to send batch to laundry."));
    } finally {
      setBusy(false);
    }
  }

  async function receiveReturn(id: string) {
    if (!session || !returnCounts[id]) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/hospital/linen-services/laundry-batches/${id}/receive_return/`, {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({ item_count_returned: Number(returnCounts[id]) }),
      });
      setReturnCounts(prev => ({ ...prev, [id]: "" }));
      void load();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تسجيل الإرجاع." : "Failed to record return."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return <div role="alert" className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل بيانات المفروشات" : "Unable to load linen data"}</h1><p className="mt-1 text-sm text-ink/50">{fetchError}</p></div>;
  }
  if (carts === null) {
    return <div className="mx-auto mt-16 max-w-lg text-center text-sm text-ink/40">{isAr ? "جارٍ التحميل..." : "Loading..."}</div>;
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Shirt size={22} /> {isAr ? "خدمات المفروشات والغسيل" : "Linen & Laundry Services"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? `${carts.filter(c => c.needs_attention).length} عربة (عربات) تحتاج انتباه` : `${carts.filter(c => c.needs_attention).length} cart(s) need attention`}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {carts.map(cart => (
          <div key={cart.id} className={`rounded-xl border p-4 ${cart.needs_attention ? "border-amber-500/30 bg-amber-500/5" : "border-ink/10 bg-surface-raised"}`}>
            <div className="text-sm font-semibold">{cart.ward} — <span className="capitalize">{isAr ? (cart.cart_type === "clean" ? "نظيف" : "متسخ") : cart.cart_type}</span></div>
            <div className="mt-2 text-xl font-bold">{cart.current_count} <span className="text-xs font-normal text-ink/40">/ {cart.par_level} {isAr ? "المعيار" : "par"}</span></div>
            {cart.needs_attention && (
              <div className="mt-1 text-xs font-semibold text-amber-400">
                {cart.cart_type === "clean" ? (isAr ? "دون المعيار -- يحتاج إعادة تخزين" : "Below par -- needs restock") : (isAr ? "عند/فوق المعيار -- يحتاج استلام" : "At/above par -- needs pickup")}
              </div>
            )}
          </div>
        ))}
        {carts.length === 0 && <div className="col-span-full text-sm text-ink/50">{isAr ? "لا توجد عربات مفروشات مسجلة." : "No linen carts on record."}</div>}
      </div>

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-surface-raised">
        <div className="border-b border-ink/10 px-4 py-3 text-sm font-semibold">{isAr ? "دفعات الغسيل" : "Laundry Batches"}</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/5">
                {(isAr ? ["الجناح", "أُرسل", "استُلم", "الفارق", "الحالة", "إجراء"] : ["Ward", "Sent", "Received", "Variance", "Status", "Action"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-ink/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink/50">{isAr ? "لا توجد دفعات غسيل." : "No laundry batches."}</td></tr>}
              {batches.map(b => {
                const variance = b.item_count_returned != null ? b.item_count_collected - b.item_count_returned : null;
                const flagged = b.status === "short_count_flagged";
                return (
                  <tr key={b.id} className={`border-b border-ink/5 ${flagged ? "bg-amber-500/5" : ""}`}>
                    <td className="px-4 py-3">{b.source_ward}</td>
                    <td className="px-4 py-3">{b.item_count_collected}</td>
                    <td className="px-4 py-3">{b.item_count_returned ?? "—"}</td>
                    <td className="px-4 py-3">
                      {variance !== null && variance > 0 ? (
                        <span className="font-semibold text-amber-400">{isAr ? `⚠ نقص قدره ${variance}` : `⚠ Shortfall of ${variance}`}</span>
                      ) : variance === 0 ? <span className="text-emerald-400">{isAr ? "متوازن" : "Balanced"}</span> : "—"}
                    </td>
                    <td className="px-4 py-3 capitalize text-ink/60">{isAr ? (STATUS_LABEL_AR[b.status] ?? b.status) : b.status.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">
                      {b.status === "collected" && (
                        <button disabled={busy} onClick={() => sendToLaundry(b.id)} className="rounded-md border border-ink/10 px-2 py-1 text-xs font-semibold hover:bg-ink/5 disabled:opacity-50">{isAr ? "إرسال إلى المغسلة" : "Send to Laundry"}</button>
                      )}
                      {b.status === "at_laundry" && (
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            value={returnCounts[b.id] ?? ""}
                            onChange={e => setReturnCounts(prev => ({ ...prev, [b.id]: e.target.value }))}
                            placeholder={isAr ? "الكمية المرتجعة" : "Returned qty"}
                            className="w-24 rounded-md border border-ink/10 bg-surface px-2 py-1 text-xs"
                          />
                          <button disabled={busy || !returnCounts[b.id]} onClick={() => receiveReturn(b.id)} className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50">
                            {isAr ? "استلام" : "Receive"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
