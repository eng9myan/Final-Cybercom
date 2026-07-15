"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { FlaskConical, ClipboardList, FileSearch, TestTube, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface WorklistItem {
  id: string;
  status: "pending" | "in_progress" | "resulted" | "verified" | "cancelled";
  sequence: number;
}
interface Paginated<T> { count: number; results: T[]; }

const DEEP_LINKS = [
  { href: "/laboratory/worklists", label_en: "Worklists", label_ar: "قوائم العمل", icon: ClipboardList, desc_en: "Assigned specimens and pending test items", desc_ar: "العينات المسندة وعناصر الفحص المعلقة" },
  { href: "/laboratory/results", label_en: "Result Entry", label_ar: "إدخال النتائج", icon: FlaskConical, desc_en: "Enter and verify analyte results", desc_ar: "إدخال والتحقق من نتائج التحاليل" },
  { href: "/laboratory/specimens", label_en: "Specimen Tracking", label_ar: "تتبع العينات", icon: FileSearch, desc_en: "Accessioning and chain-of-custody", desc_ar: "التسجيل وسلسلة الحيازة" },
  { href: "/laboratory/orders", label_en: "Orders", label_ar: "الطلبات", icon: TestTube, desc_en: "Incoming lab orders awaiting worklist assignment", desc_ar: "طلبات مخبرية واردة بانتظار التوزيع" },
];

export default function LabTechWorkspace() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [items, setItems] = useState<WorklistItem[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const page = await apiFetch<Paginated<WorklistItem>>("/api/v1/lab/worklists/worklist-items/", {
        token: session.accessToken, tenantId: session.tenantId,
      });
      setItems(page.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل ملخص قائمة العمل." : "Failed to load worklist items."));
    }
  }, [session, isAr]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }

  const pendingItems = (items || []).filter(i => i.status === "pending");
  const inProgressItems = (items || []).filter(i => i.status === "in_progress");

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><FlaskConical size={24} /> {isAr ? "مساحة عمل فني المختبر" : "Lab Technician Workspace"}</h1>
          <p className="mt-1 text-sm text-white/50">{isAr ? "حالة قائمة عملك، مع وصول سريع لإدخال النتائج وأدوات العينات" : "Your worklist status, with quick access into result entry and specimen tools"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      {fetchError && (
        <div role="alert" className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {isAr ? "تعذر تحميل ملخص قائمة العمل: " : "Unable to load worklist summary: "}{fetchError}
        </div>
      )}

      {!fetchError && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: isAr ? "معلقة" : "Pending", value: items === null ? "..." : pendingItems.length, color: "#3b82f6" },
            { label: isAr ? "قيد التنفيذ" : "In Progress", value: items === null ? "..." : inProgressItems.length, color: "#f59e0b" },
            { label: isAr ? "إجمالي عناصر القائمة" : "Total Worklist Items", value: items === null ? "..." : items.length, color: "#22D3EE" },
          ].map(m => (
            <div key={m.label} className="rounded-xl border border-white/10 bg-surface-raised p-5 text-center">
              <p className="text-3xl font-bold" style={{ color: m.color }}>{m.value}</p>
              <p className="mt-1 text-sm text-white/50">{m.label}</p>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">{isAr ? "أدوات المختبر" : "Laboratory Tools"}</h2>
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
