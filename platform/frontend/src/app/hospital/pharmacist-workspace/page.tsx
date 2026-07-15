"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Pill, ClipboardCheck, BookOpen, ShoppingCart, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface DispenseOrder {
  id: string;
  status: "queued" | "in_progress" | "verification_pending" | "verified" | "ready" | "dispensed" | "partial" | "returned" | "cancelled";
  dispense_number: string;
}
interface Paginated<T> { count: number; results: T[]; }

const DEEP_LINKS = [
  { href: "/pharmacy/dispensing", label_en: "Dispensing Queue", label_ar: "طابور الصرف", icon: ClipboardCheck, desc_en: "Verify and dispense pending orders", desc_ar: "التحقق وصرف الطلبات المعلقة" },
  { href: "/pharmacy/prescriptions", label_en: "Prescriptions", label_ar: "الوصفات", icon: Pill, desc_en: "Active and pending prescriptions", desc_ar: "الوصفات النشطة والمعلقة" },
  { href: "/pharmacy/formulary", label_en: "Formulary", label_ar: "دليل الأدوية", icon: BookOpen, desc_en: "Drug catalog and formulary status", desc_ar: "كتالوج الأدوية وحالة الدليل" },
  { href: "/pharmacy/pos", label_en: "Point of Sale", label_ar: "نقطة البيع", icon: ShoppingCart, desc_en: "Retail/OTC checkout", desc_ar: "الدفع للبيع بالتجزئة" },
];

export default function PharmacistWorkspace() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [orders, setOrders] = useState<DispenseOrder[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const page = await apiFetch<Paginated<DispenseOrder>>("/api/v1/pharmacy/dispensing/orders/", {
        token: session.accessToken, tenantId: session.tenantId,
      });
      setOrders(page.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل طابور الصرف." : "Failed to load dispensing queue."));
    }
  }, [session, isAr]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }

  const queued = (orders || []).filter(o => o.status === "queued");
  const pendingVerification = (orders || []).filter(o => o.status === "verification_pending");

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Pill size={24} /> {isAr ? "مساحة عمل الصيدلي" : "Pharmacist Workspace"}</h1>
          <p className="mt-1 text-sm text-white/50">{isAr ? "حالة طابور الصرف، مع وصول سريع لأدوات الصيدلية الكاملة" : "Dispensing queue status, with quick access into the full pharmacy tools"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      {fetchError && (
        <div role="alert" className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {isAr ? "تعذر تحميل ملخص الصرف: " : "Unable to load dispensing summary: "}{fetchError}
        </div>
      )}

      {!fetchError && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: isAr ? "في الطابور" : "Queued", value: orders === null ? "..." : queued.length, color: "#3b82f6" },
            { label: isAr ? "بانتظار التحقق" : "Pending Verification", value: orders === null ? "..." : pendingVerification.length, color: "#f59e0b" },
            { label: isAr ? "إجمالي الطلبات النشطة" : "Total Active Orders", value: orders === null ? "..." : orders.length, color: "#22D3EE" },
          ].map(m => (
            <div key={m.label} className="rounded-xl border border-white/10 bg-surface-raised p-5 text-center">
              <p className="text-3xl font-bold" style={{ color: m.color }}>{m.value}</p>
              <p className="mt-1 text-sm text-white/50">{m.label}</p>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">{isAr ? "أدوات الصيدلية" : "Pharmacy Tools"}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {DEEP_LINKS.map(({ href, label_en, label_ar, icon: Icon, desc_en, desc_ar }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-surface-raised p-5 transition-colors hover:border-brand-400/50 hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                <Icon size={20} />
              </div>
              <div>
                <p className="font-semibold">{isAr ? label_ar : label_en}</p>
                <p className="text-sm text-white/50">{isAr ? desc_ar : desc_en}</p>
              </div>
            </div>
            <ArrowRight size={18} className={`text-white/30 ${isAr ? "rotate-180" : ""}`} />
          </Link>
        ))}
      </div>
    </div>
  );
}
