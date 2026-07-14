"use client";

import { usePreferences } from "@/contexts/preferences";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";

interface ImagingOrderItemRaw {
  id: string;
  procedure: string;
  body_part: string;
  laterality: string;
  status: string;
}

interface ImagingOrderRaw {
  id: string;
  order_number: string;
  patient_id: string;
  priority: string;
  status: string;
  clinical_indication: string;
  ordering_facility: string;
  created_at: string;
  items: ImagingOrderItemRaw[];
}

interface ImagingProcedureRaw {
  id: string;
  name: string;
  modality: string;
}

interface PatientRaw {
  id: string;
  first_name: string;
  last_name: string;
  mrn: string;
}

interface Paginated<T> {
  count: number;
  results: T[];
}

function unwrap<T>(data: Paginated<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

function priorityColor(p: string) {
  if (p === "stat") return "#ef4444";
  if (p === "urgent") return "#f59e0b";
  return "#6366f1";
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#6b7280",
  scheduled: "#3b82f6",
  in_progress: "#f59e0b",
  completed: "#22c55e",
  cancelled: "#ef4444",
};

export default function ImagingOrdersPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [orders, setOrders] = useState<ImagingOrderRaw[] | null>(null);
  const [procedures, setProcedures] = useState<Record<string, ImagingProcedureRaw>>({});
  const [patients, setPatients] = useState<Record<string, PatientRaw>>({});
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrderPatient, setNewOrderPatient] = useState("");
  const [newOrderPriority, setNewOrderPriority] = useState<"routine" | "urgent" | "stat" | "critical">("routine");
  const [newOrderFacility, setNewOrderFacility] = useState("");
  const [newOrderIndication, setNewOrderIndication] = useState("");
  const [newOrderProcedureId, setNewOrderProcedureId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFetchError(null);
    const opts = { token: session.accessToken, tenantId: session.tenantId };
    try {
      const [ordersData, proceduresData, patientsData] = await Promise.all([
        apiFetch<Paginated<ImagingOrderRaw> | ImagingOrderRaw[]>("/api/v1/imaging/orders/orders/", opts),
        apiFetch<Paginated<ImagingProcedureRaw> | ImagingProcedureRaw[]>("/api/v1/imaging/orders/procedures/", opts),
        apiFetch<Paginated<PatientRaw> | PatientRaw[]>("/api/v1/patients/", opts),
      ]);
      setOrders(unwrap(ordersData));
      const procMap: Record<string, ImagingProcedureRaw> = {};
      for (const p of unwrap(proceduresData)) procMap[p.id] = p;
      setProcedures(procMap);
      const patientMap: Record<string, PatientRaw> = {};
      for (const p of unwrap(patientsData)) patientMap[p.id] = p;
      setPatients(patientMap);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load imaging orders."));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleCancel(id: string) {
    if (!session) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/imaging/orders/orders/${id}/`, {
        method: "PATCH",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ status: "cancelled" }),
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Action failed."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateOrder() {
    if (!session) return;
    if (!newOrderPatient || !newOrderProcedureId) {
      setCreateMsg(t("Select a patient and a procedure.", "اختر مريضاً وإجراءً."));
      return;
    }
    setCreating(true);
    setCreateMsg("");
    try {
      const orderNumber = `IMG-${Date.now().toString(36).toUpperCase()}`;
      const order = await apiFetch<ImagingOrderRaw>("/api/v1/imaging/orders/orders/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          order_number: orderNumber,
          patient_id: newOrderPatient,
          ordered_by: session.userId,
          order_type: "outpatient",
          priority: newOrderPriority,
          status: "pending",
          clinical_indication: newOrderIndication,
          ordering_facility: newOrderFacility || "Imaging",
        }),
      });
      await apiFetch("/api/v1/imaging/orders/order-items/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ order: order.id, procedure: newOrderProcedureId, status: "pending" }),
      });
      setCreateMsg(t(`Order ${orderNumber} created.`, `تم إنشاء الطلب ${orderNumber}.`));
      setNewOrderPatient(""); setNewOrderFacility(""); setNewOrderIndication(""); setNewOrderProcedureId("");
      setShowNewOrder(false);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setCreateMsg(detail || (err instanceof Error ? err.message : "Failed to create order."));
    } finally {
      setCreating(false);
    }
  }

  const t = (en: string, ar: string) => lang === "en" ? en : ar;

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }

  const filtered = (orders || []).filter(o => {
    if (priorityFilter !== "all" && o.priority !== priorityFilter) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl" style={{ direction: lang === "ar" ? "rtl" : "ltr" }}>
      <header className="mb-6 flex items-start justify-between">
        <div>
          <a href="/imaging" className="text-sm text-brand-400 hover:underline">{t("← Imaging", "← الأشعة")}</a>
          <h1 className="font-heading text-2xl font-bold text-brand-400">{t("Imaging Order Management", "إدارة طلبات الأشعة")}</h1>
          <p className="mt-1 text-sm text-ink/50">
            {t("Real imaging orders (CPOE-fed)", "طلبات أشعة حقيقية")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowNewOrder(s => !s)} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm">
            {showNewOrder ? t("Close", "إغلاق") : t("+ New Order", "+ طلب جديد")}
          </button>
          <button onClick={() => setLang(l => l === "en" ? "ar" : "en")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
            {lang === "en" ? "العربية" : "English"}
          </button>
        </div>
      </header>

      {showNewOrder && (
        <div className="cy-card mb-6 p-5">
          <h2 className="mb-4 text-sm font-bold text-brand-400">{t("New Imaging Order (originated by Imaging)", "طلب أشعة جديد (من قسم الأشعة)")}</h2>
          {createMsg && (
            <div className="mb-4 rounded-lg border border-brand-400/40 bg-brand-500/10 px-4 py-2.5 text-sm">{createMsg}</div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink/50">{t("Patient", "المريض")}</label>
              <select value={newOrderPatient} onChange={e => setNewOrderPatient(e.target.value)} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink">
                <option value="">{t("Select patient…", "اختر مريضاً…")}</option>
                {Object.values(patients).map(p => (
                  <option key={p.id} value={p.id}>{p.first_name} {p.last_name} — {p.mrn}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink/50">{t("Procedure", "الإجراء")}</label>
              <select value={newOrderProcedureId} onChange={e => setNewOrderProcedureId(e.target.value)} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink">
                <option value="">{t("Select procedure…", "اختر إجراءً…")}</option>
                {Object.values(procedures).map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.modality})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink/50">{t("Priority", "الأولوية")}</label>
              <select value={newOrderPriority} onChange={e => setNewOrderPriority(e.target.value as typeof newOrderPriority)} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink">
                {(["routine", "urgent", "stat", "critical"] as const).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink/50">{t("Ordering Facility", "المنشأة")}</label>
              <input type="text" value={newOrderFacility} onChange={e => setNewOrderFacility(e.target.value)} placeholder="Imaging" className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink" />
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1.5 block text-[13px] font-semibold text-ink/50">{t("Clinical Indication", "الإشارة السريرية")}</label>
            <input type="text" value={newOrderIndication} onChange={e => setNewOrderIndication(e.target.value)} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          <button disabled={creating} onClick={() => { void handleCreateOrder(); }} className="cy-btn cy-btn-primary mt-4 disabled:opacity-50">
            {creating ? t("Creating…", "جارٍ الإنشاء…") : t("Create Order", "إنشاء الطلب")}
          </button>
        </div>
      )}

      <nav className="mb-6 flex flex-wrap gap-2">
        {[
          { href: "/imaging", label: t("Overview", "نظرة عامة") },
          { href: "/imaging/orders", label: t("Orders", "الطلبات") },
          { href: "/imaging/scheduling", label: t("Scheduling", "الجدولة") },
          { href: "/imaging/reports", label: t("Reports", "التقارير") },
          { href: "/imaging/pacs", label: t("PACS", "PACS") },
        ].map(item => (
          <a key={item.href} href={item.href} className={`rounded-md px-4 py-1.5 text-sm font-medium ${item.href === "/imaging/orders" ? "border border-brand-400 bg-brand-500/15 text-brand-400" : "border border-ink/10 bg-surface text-ink"}`}>
            {item.label}
          </a>
        ))}
      </nav>

      {fetchError && (
        <div role="alert" className="mb-6 rounded-lg border border-red-300 bg-red-100 px-4 py-3.5 text-sm text-red-700">
          {fetchError}
        </div>
      )}

      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-4">
        {[
          { label: t("Total Orders", "إجمالي الطلبات"), value: (orders || []).length, color: "#6366f1" },
          { label: t("Pending", "معلقة"), value: (orders || []).filter(o => o.status === "pending").length, color: "#6b7280" },
          { label: t("Scheduled", "مجدولة"), value: (orders || []).filter(o => o.status === "scheduled").length, color: "#3b82f6" },
          { label: t("Completed", "مكتملة"), value: (orders || []).filter(o => o.status === "completed").length, color: "#22c55e" },
          { label: t("STAT Orders", "طلبات عاجلة"), value: (orders || []).filter(o => o.priority === "stat").length, color: "#ef4444" },
        ].map(m => (
          <div key={m.label} className="cy-card p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: m.color }}>{m.value}</p>
            <p className="mt-1 text-xs text-ink/50">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="cy-card mb-5 flex flex-wrap items-center gap-4 p-4">
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink/50">{t("Priority", "الأولوية")}</span>
          <div className="flex gap-1">
            {["all", "stat", "urgent", "routine"].map(f => (
              <button key={f} onClick={() => setPriorityFilter(f)} className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${priorityFilter === f ? "border-brand-400 bg-brand-500 text-white" : "border-ink/10 bg-surface text-ink"}`}>
                {f === "all" ? t("All", "الكل") : f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink/50">{t("Status", "الحالة")}</span>
          <div className="flex flex-wrap gap-1">
            {["all", "pending", "scheduled", "in_progress", "completed", "cancelled"].map(f => (
              <button key={f} onClick={() => setStatusFilter(f)} className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${statusFilter === f ? "border-brand-400 bg-brand-500 text-white" : "border-ink/10 bg-surface text-ink"}`}>
                {f === "all" ? t("All", "الكل") : f}
              </button>
            ))}
          </div>
        </div>
        {loading && <span className="text-sm text-ink/50">{t("Loading…", "جارٍ التحميل…")}</span>}
        <div className="ml-auto text-sm text-ink/50">
          {t("Showing", "عرض")} {filtered.length} / {(orders || []).length}
        </div>
      </div>

      <div className="cy-card overflow-hidden p-0">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-ink/10">
              {[t("Order #", "رقم الطلب"), t("Patient", "المريض"), t("Procedure(s)", "الإجراءات"), t("Facility", "المنشأة"), t("Priority", "الأولوية"), t("Status", "الحالة"), t("Requested", "وقت الطلب"), t("Actions", "الإجراءات")].map(h => (
                <th key={h} className={`whitespace-nowrap px-4 py-3 text-[13px] font-semibold text-ink/50 ${lang === "ar" ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-ink/40">
                {t("No imaging orders for this tenant yet.", "لا توجد طلبات أشعة لهذا المستأجر بعد.")}
              </td></tr>
            )}
            {filtered.map((order) => {
              const patient = patients[order.patient_id];
              const patientLabel = patient ? `${patient.first_name} ${patient.last_name}` : `Patient ${order.patient_id.slice(0, 8)}`;
              const procedureNames = (order.items || []).map(item => procedures[item.procedure]?.name).filter(Boolean).join(", ") || "—";
              return (
                <tr key={order.id} className="border-b border-ink/10">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-brand-400">{order.order_number}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium">{patientLabel}</div>
                    {patient?.mrn && <div className="text-xs text-ink/50">{patient.mrn}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm">{procedureNames}</td>
                  <td className="px-4 py-3 text-xs text-ink/50">{order.ordering_facility || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border px-2.5 py-1 text-xs font-bold" style={{ background: priorityColor(order.priority) + "22", color: priorityColor(order.priority), borderColor: priorityColor(order.priority) }}>
                      {order.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: (STATUS_COLORS[order.status] || "#6b7280") + "22", color: STATUS_COLORS[order.status] || "#6b7280" }}>
                      {order.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {order.created_at ? new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {(order.status === "pending" || order.status === "scheduled") ? (
                      <button disabled={busyId === order.id} onClick={() => handleCancel(order.id)} className="whitespace-nowrap rounded-md border border-red-500 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-500 disabled:opacity-50">
                        {t("Cancel", "إلغاء")}
                      </button>
                    ) : (
                      <span className="text-xs text-ink/50">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
