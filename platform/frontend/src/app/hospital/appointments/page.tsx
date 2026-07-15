"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarDays, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

type AppointmentStatus = "proposed" | "pending" | "booked" | "arrived" | "fulfilled" | "cancelled";

interface Participant {
  id: string;
  actor_id: string;
  actor_type: "patient" | "provider" | "location";
  status: string;
}

interface Appointment {
  id: string;
  patient: string;
  appointment_type: string;
  status: AppointmentStatus;
  start_time: string;
  end_time: string;
  description: string;
  participants: Participant[];
}

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  mrn: string;
}

interface Provider {
  id: string;
  first_name: string;
  last_name: string;
  provider_type: string;
}

interface Paginated<T> {
  count: number;
  results: T[];
}

const STATUS_COLOR: Record<AppointmentStatus, string> = {
  proposed: "#8b5cf6", pending: "#f59e0b", booked: "#3b82f6",
  arrived: "#22D3EE", fulfilled: "#22c55e", cancelled: "#6b7280",
};
const STATUS_LABEL_AR: Record<AppointmentStatus, string> = {
  proposed: "مقترح", pending: "معلق", booked: "محجوز", arrived: "وصل", fulfilled: "مكتمل", cancelled: "ملغى",
};

const emptyForm = { patient: "", appointment_type: "follow-up", start_time: "", end_time: "", description: "", provider: "" };

export default function AppointmentCalendar() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [apptPage, patientPage, providerPage] = await Promise.all([
        apiFetch<Paginated<Appointment>>("/api/v1/scheduling/", opts),
        apiFetch<Paginated<Patient>>("/api/v1/patients/", opts),
        apiFetch<Paginated<Provider>>("/api/v1/providers/", opts),
      ]);
      setAppointments(apptPage.results);
      setPatients(patientPage.results);
      setProviders(providerPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل المواعيد." : "Failed to load appointments."));
    } finally {
      setLoading(false);
    }
  }, [session, isAr]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const patientName = (id: string) => {
    const p = patients.find(x => x.id === id);
    return p ? `${p.first_name} ${p.last_name} (${p.mrn})` : (isAr ? "مريض غير معروف" : "Unknown patient");
  };

  const providerName = (appt: Appointment) => {
    const participant = appt.participants?.find(p => p.actor_type === "provider");
    if (!participant) return isAr ? "لم يتم التعيين" : "Not assigned";
    const provider = providers.find(x => x.id === participant.actor_id);
    return provider ? `${isAr ? "د." : "Dr."} ${provider.first_name} ${provider.last_name}` : (isAr ? "لم يتم التعيين" : "Not assigned");
  };

  async function submitAppointment() {
    if (!session) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const participants = form.provider ? [{ actor_id: form.provider, actor_type: "provider" }] : [];
      await apiFetch("/api/v1/scheduling/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          patient: form.patient,
          appointment_type: form.appointment_type,
          start_time: new Date(form.start_time).toISOString(),
          end_time: new Date(form.end_time).toISOString(),
          description: form.description,
          participants,
        }),
      });
      setForm(emptyForm);
      setShowForm(false);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFormError(detail || (err instanceof Error ? err.message : isAr ? "فشل إنشاء الموعد." : "Failed to create appointment."));
    } finally {
      setSubmitting(false);
    }
  }

  async function transition(id: string, action: "cancel" | "complete") {
    if (!session) return;
    try {
      await apiFetch(`/api/v1/scheduling/${id}/${action}/`, {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (isAr ? "فشل تحديث الموعد." : "Failed to update appointment."));
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold">Sign in required</h1>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل المواعيد" : "Unable to load appointments"}</h1>
        <p className="mt-2 text-white/50">{fetchError}</p>
      </div>
    );
  }

  const sorted = (appointments || []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{isAr ? "تقويم المواعيد" : "Appointment Calendar"}</h1>
          <p className="mt-1 text-sm text-white/50">{isAr ? "الجدولة المباشرة لهذا المستأجر" : "Live scheduling for this tenant"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold hover:bg-brand-600"
            disabled={patients.length === 0}
            title={patients.length === 0 ? (isAr ? "سجّل مريضاً أولاً" : "Register a patient first") : undefined}
          >
            <Plus size={16} /> {isAr ? "موعد جديد" : "New Appointment"}
          </button>
          <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
            {isAr ? "English" : "العربية"}
          </button>
        </div>
      </header>

      {showForm && (
        <div className="mb-6 rounded-xl border border-white/10 bg-surface-raised p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">{isAr ? "موعد جديد" : "New Appointment"}</h2>
            <button onClick={() => setShowForm(false)} className="text-white/50 hover:text-white"><X size={18} /></button>
          </div>
          {formError && <p className="mb-3 text-sm text-red-400">{formError}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select value={form.patient} onChange={e => setForm({ ...form, patient: e.target.value })} className="rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm focus:border-brand-400 focus:outline-none">
              <option value="">{isAr ? "اختر المريض..." : "Select patient..."}</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.mrn})</option>)}
            </select>
            <select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} className="rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm focus:border-brand-400 focus:outline-none">
              <option value="">{isAr ? "لا يوجد طبيب معيّن" : "No provider assigned"}</option>
              {providers.map(p => <option key={p.id} value={p.id}>{isAr ? "د." : "Dr."} {p.first_name} {p.last_name}</option>)}
            </select>
            <input placeholder={isAr ? "نوع الموعد (مثال: متابعة)" : "Appointment type (e.g. follow-up)"} value={form.appointment_type} onChange={e => setForm({ ...form, appointment_type: e.target.value })} className="rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
            <div />
            <label className="text-xs text-white/50">{isAr ? "وقت البدء" : "Start time"}
              <input type="datetime-local" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
            </label>
            <label className="text-xs text-white/50">{isAr ? "وقت الانتهاء" : "End time"}
              <input type="datetime-local" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
            </label>
            <textarea placeholder={isAr ? "الوصف (اختياري)" : "Description (optional)"} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="sm:col-span-2 rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" rows={2} />
          </div>
          <button
            onClick={submitAppointment}
            disabled={submitting || !form.patient || !form.start_time || !form.end_time}
            className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold hover:bg-brand-600 disabled:opacity-40"
          >
            {submitting ? (isAr ? "جارٍ الجدولة..." : "Scheduling...") : (isAr ? "جدولة الموعد" : "Schedule Appointment")}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {(isAr ? ["المريض", "النوع", "الطبيب", "البداية", "النهاية", "الحالة", "إجراءات"] : ["Patient", "Type", "Provider", "Start", "End", "Status", "Actions"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-white/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-white/50">{isAr ? "جارٍ تحميل بيانات المواعيد المباشرة..." : "Loading live appointment data..."}</td></tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-white/50">
                  <CalendarDays size={20} className="mx-auto mb-2 text-white/30" />
                  {isAr ? "لا توجد مواعيد مجدولة بعد — أنشئ الأول." : "No appointments scheduled yet — create the first one."}
                </td></tr>
              )}
              {sorted.map(appt => (
                <tr key={appt.id} className="border-b border-white/5">
                  <td className="px-4 py-3 font-medium">{patientName(appt.patient)}</td>
                  <td className="px-4 py-3 capitalize text-white/60">{appt.appointment_type}</td>
                  <td className="px-4 py-3 text-white/60">{providerName(appt)}</td>
                  <td className="px-4 py-3 text-white/60">{new Date(appt.start_time).toLocaleString()}</td>
                  <td className="px-4 py-3 text-white/60">{new Date(appt.end_time).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize" style={{ background: `${STATUS_COLOR[appt.status]}22`, color: STATUS_COLOR[appt.status] }}>
                      {isAr ? STATUS_LABEL_AR[appt.status] : appt.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!["fulfilled", "cancelled"].includes(appt.status) && (
                      <div className="flex gap-2">
                        <button onClick={() => transition(appt.id, "complete")} className="rounded-md bg-green-500/15 px-2 py-1 text-xs font-semibold text-green-400 hover:bg-green-500/25">{isAr ? "إكمال" : "Complete"}</button>
                        <button onClick={() => transition(appt.id, "cancel")} className="rounded-md bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/25">{isAr ? "إلغاء" : "Cancel"}</button>
                      </div>
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
