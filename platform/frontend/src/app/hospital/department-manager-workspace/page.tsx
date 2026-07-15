"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Boxes, FlaskConical, Pill, Users, PackageX, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface StockItem {
  id: string;
  name: string;
  sku: string;
  quantity: string;
  reorder_level: string;
  needs_reorder: boolean;
}
interface WorklistItem { id: string; status: string; }
interface DispenseOrder { id: string; status: string; }
type ListOrPaginated<T> = { count: number; results: T[] } | T[];

function unwrap<T>(data: ListOrPaginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

const DEEP_LINKS = [
  { href: "/hospital/inventory", label_en: "Inventory Management", label_ar: "إدارة المخزون", icon: Boxes, desc_en: "Stock levels, reorder alerts, warehouses", desc_ar: "مستويات المخزون وتنبيهات إعادة الطلب والمستودعات" },
  { href: "/laboratory/worklists", label_en: "Lab Worklists", label_ar: "قوائم عمل المختبر", icon: FlaskConical, desc_en: "Technologist assignments and workload", desc_ar: "توزيع الفنيين وعبء العمل" },
  { href: "/pharmacy/dispensing", label_en: "Pharmacy Dispensing", label_ar: "صرف الصيدلية", icon: Pill, desc_en: "Dispensing queue and verification backlog", desc_ar: "طابور الصرف وتراكم التحقق" },
  { href: "/hospital/hr", label_en: "HR & Payroll", label_ar: "الموارد البشرية والرواتب", icon: Users, desc_en: "Staff roster, shifts, leave approvals", desc_ar: "جدول الموظفين والمناوبات وموافقات الإجازات" },
];

export default function DepartmentManagerWorkspace() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [reorderItems, setReorderItems] = useState<StockItem[] | null>(null);
  const [worklistItems, setWorklistItems] = useState<WorklistItem[]>([]);
  const [dispenseOrders, setDispenseOrders] = useState<DispenseOrder[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [reorderData, worklistData, dispenseData] = await Promise.all([
        apiFetch<ListOrPaginated<StockItem>>("/api/v1/erp/inventory/stock-items/needs-reorder/", opts),
        apiFetch<ListOrPaginated<WorklistItem>>("/api/v1/lab/worklists/worklist-items/", opts),
        apiFetch<ListOrPaginated<DispenseOrder>>("/api/v1/pharmacy/dispensing/orders/", opts),
      ]);
      setReorderItems(unwrap(reorderData));
      setWorklistItems(unwrap(worklistData));
      setDispenseOrders(unwrap(dispenseData));
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل ملخص القسم." : "Failed to load department summary."));
    }
  }, [session, isAr]);

  useEffect(() => { void loadData(); }, [loadData]);

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }

  const pendingWorklist = worklistItems.filter(i => i.status === "pending" || i.status === "in_progress").length;
  const openDispensing = dispenseOrders.filter(o => !["dispensed", "cancelled", "returned"].includes(o.status)).length;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><PackageX size={24} /> {isAr ? "مساحة عمل مدير القسم" : "Department Manager Workspace"}</h1>
          <p className="mt-1 text-sm text-white/50">{isAr ? "إشراف عبر الأقسام: المخزون وعبء عمل المختبر وتراكم الصيدلية في عرض واحد" : "Cross-department oversight: inventory, lab workload, and pharmacy backlog in one view"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      {fetchError && (
        <div role="alert" className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {isAr ? "تعذر تحميل ملخص القسم: " : "Unable to load department summary: "}{fetchError}
        </div>
      )}

      {!fetchError && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: isAr ? "عناصر تحتاج إعادة طلب" : "Items Needing Reorder", value: reorderItems === null ? "..." : reorderItems.length, color: "#ef4444" },
            { label: isAr ? "عناصر قائمة عمل المختبر المفتوحة" : "Open Lab Worklist Items", value: pendingWorklist, color: "#3b82f6" },
            { label: isAr ? "طلبات الصرف المفتوحة" : "Open Dispensing Orders", value: openDispensing, color: "#f59e0b" },
          ].map(m => (
            <div key={m.label} className="rounded-xl border border-white/10 bg-surface-raised p-5 text-center">
              <p className="text-3xl font-bold" style={{ color: m.color }}>{m.value}</p>
              <p className="mt-1 text-sm text-white/50">{m.label}</p>
            </div>
          ))}
        </div>
      )}

      {reorderItems !== null && reorderItems.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-xl border border-red-500/20 bg-red-500/5">
          <div className="border-b border-red-500/20 px-4 py-3 text-sm font-semibold text-red-400">
            {isAr ? `تنبيهات إعادة الطلب (${reorderItems.length})` : `Reorder Alerts (${reorderItems.length})`}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  {(isAr ? ["رمز الصنف", "الاسم", "الكمية المتوفرة", "مستوى إعادة الطلب"] : ["SKU", "Name", "On Hand", "Reorder Level"]).map(h => (
                    <th key={h} className={`px-4 py-2 font-semibold text-white/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reorderItems.slice(0, 10).map(item => (
                  <tr key={item.id} className="border-b border-white/5">
                    <td className="px-4 py-2 font-mono text-xs text-white/60">{item.sku}</td>
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2 text-red-400">{item.quantity}</td>
                    <td className="px-4 py-2 text-white/60">{item.reorder_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">{isAr ? "أدوات الإدارة" : "Management Tools"}</h2>
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
