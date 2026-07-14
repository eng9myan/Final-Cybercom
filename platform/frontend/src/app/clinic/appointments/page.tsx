"use client";

import { usePreferences } from "@/contexts/preferences";
import { useAuth } from "@/contexts/auth";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Interfaces (mirror real backend serializers) ──────────────────────────────
// core.scheduling.Appointment: id, patient, appointment_type, status, start_time,
// end_time, description, participants[]. Status: proposed/pending/booked/arrived/
// fulfilled/cancelled — NOT scheduled/confirmed/in_progress/completed.
// clinic.appointments.ClinicAppointment: id, appointment (FK), specialty_code,
// checkin_status, source. Carries no patient/provider/time data of its own.

interface AppointmentParticipant { id: string; actor_id: string; actor_type: "patient" | "provider" | "location"; }
interface AppointmentCore {
  id: string;
  patient: string;
  appointment_type: string;
  status: "proposed" | "pending" | "booked" | "arrived" | "fulfilled" | "cancelled";
  start_time: string;
  end_time: string;
  description: string;
  participants: AppointmentParticipant[];
}
interface ClinicAppointmentRaw {
  id: string;
  appointment: string;
  specialty_code: string;
  checkin_status: "pending" | "checked_in" | "missed";
  source: string;
}
interface PatientRaw { id: string; first_name: string; last_name: string; mrn: string; }
interface ProviderRaw { id: string; first_name: string; last_name: string; }
interface Paginated<T> { count: number; results: T[]; }

interface Row {
  id: string;
  patient_name: string;
  mrn: string;
  date: string;
  time: string;
  specialty: string;
  provider: string;
  status: AppointmentCore["status"];
  checkin_status: ClinicAppointmentRaw["checkin_status"] | null;
  notes: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case "proposed":  return "bg-ink/10 text-ink/60";
    case "pending":   return "bg-sky-500/15 text-sky-300";
    case "booked":    return "bg-emerald-500/15 text-emerald-300";
    case "arrived":   return "bg-blue-500/15 text-blue-300";
    case "fulfilled": return "bg-emerald-500/10 text-emerald-400";
    case "cancelled": return "bg-red-500/15 text-red-300";
    default:          return "bg-ink/10 text-ink/60";
  }
}

function statusLabel(status: string, lang: "en" | "ar"): string {
  const map: Record<string, { en: string; ar: string }> = {
    proposed:  { en: "Proposed",  ar: "مقترح"  },
    pending:   { en: "Pending",   ar: "قيد الانتظار" },
    booked:    { en: "Booked",    ar: "محجوز"  },
    arrived:   { en: "Arrived",   ar: "وصل"    },
    fulfilled: { en: "Fulfilled", ar: "مكتمل"  },
    cancelled: { en: "Cancelled", ar: "ملغي"   },
  };
  return map[status]?.[lang] ?? status;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const { session, isAuthenticated } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSpecialty, setFilterSpecialty] = useState<string>("All");
  const [filterDate, setFilterDate] = useState<string>("");
  const [actionMsg, setActionMsg] = useState<string>("");

  const specialties = ["All", ...Array.from(new Set(rows.map(r => r.specialty).filter(Boolean))).sort()];

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [apptPage, clinicPage, patientPage, providerPage] = await Promise.all([
        apiFetch<Paginated<AppointmentCore>>("/api/v1/scheduling/", opts),
        apiFetch<Paginated<ClinicAppointmentRaw>>("/api/v1/clinic/appointments/bookings/", opts),
        apiFetch<Paginated<PatientRaw>>("/api/v1/patients/", opts),
        apiFetch<Paginated<ProviderRaw>>("/api/v1/providers/", opts),
      ]);

      const patientById = new Map(patientPage.results.map(p => [p.id, p]));
      const providerById = new Map(providerPage.results.map(p => [p.id, p]));
      const clinicByAppointmentId = new Map(clinicPage.results.map(c => [c.appointment, c]));

      const mapped: Row[] = apptPage.results.map(appt => {
        const patient = patientById.get(appt.patient);
        const providerParticipant = appt.participants?.find(p => p.actor_type === "provider");
        const provider = providerParticipant ? providerById.get(providerParticipant.actor_id) : undefined;
        const overlay = clinicByAppointmentId.get(appt.id);
        const d = new Date(appt.start_time);
        return {
          id: appt.id,
          patient_name: patient ? `${patient.first_name} ${patient.last_name}` : "Unknown patient",
          mrn: patient?.mrn ?? "—",
          date: d.toISOString().slice(0, 10),
          time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          specialty: overlay?.specialty_code ?? appt.appointment_type,
          provider: provider ? `Dr. ${provider.first_name} ${provider.last_name}` : "Unassigned",
          status: appt.status,
          checkin_status: overlay?.checkin_status ?? null,
          notes: appt.description ?? "",
        };
      });
      setRows(mapped);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load appointments."));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleAction = async (row: Row, action: "confirm" | "cancel") => {
    if (!session) return;
    const newStatus = action === "confirm" ? "booked" : "cancelled";
    try {
      await apiFetch(`/api/v1/scheduling/${row.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: newStatus as Row["status"] } : r));
      setActionMsg(lang === "en" ? `Appointment ${action === "confirm" ? "confirmed" : "cancelled"}.` : `تم تحديث الموعد.`);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setActionMsg(detail || (lang === "en" ? "Action failed." : "فشل الإجراء."));
    }
    setTimeout(() => setActionMsg(""), 3000);
  };

  const filtered = rows.filter(r => {
    const matchStatus    = filterStatus === "all" || r.status === filterStatus;
    const matchSpecialty = filterSpecialty === "All" || r.specialty === filterSpecialty;
    const matchDate      = !filterDate || r.date === filterDate;
    return matchStatus && matchSpecialty && matchDate;
  });

  const metrics = {
    total:     rows.length,
    pending:   rows.filter(r => r.status === "pending" || r.status === "proposed").length,
    booked:    rows.filter(r => r.status === "booked").length,
    arrived:   rows.filter(r => r.status === "arrived").length,
    fulfilled: rows.filter(r => r.status === "fulfilled").length,
    cancelled: rows.filter(r => r.status === "cancelled").length,
  };

  const dir = lang === "ar" ? "rtl" : "ltr";

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">
          {lang === "en" ? "Unable to load appointments" : "تعذر تحميل المواعيد"}
        </h1>
        <p className="mt-1 text-sm text-ink/50">{fetchError}</p>
        <button onClick={() => void loadData()} className="cy-btn cy-btn-ghost mt-4 !min-h-0 !py-2 !px-4 text-sm">
          {lang === "en" ? "Retry" : "إعادة المحاولة"}
        </button>
      </div>
    );
  }

  return (
    <div dir={dir} className="mx-auto max-w-5xl">

      {/* Header */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <a href="/clinic" className="text-sm text-ink/50 hover:text-ink">
            {lang === "en" ? "← Clinic" : "العيادة ←"}
          </a>
          <h1 className="mt-1 font-heading text-2xl font-bold">
            {lang === "en" ? "Appointment Scheduling" : "جدولة المواعيد"}
          </h1>
          <p className="mt-1 text-sm text-ink/50">
            {lang === "en" ? "Manage clinic appointments" : "إدارة مواعيد العيادة"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {loading && <span className="text-sm text-ink/50">{lang === "en" ? "Syncing..." : "جارٍ التزامن..."}</span>}
          <button
            onClick={() => setLang(l => l === "en" ? "ar" : "en")}
            className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm"
          >
            {lang === "en" ? "العربية" : "English"}
          </button>
        </div>
      </header>

      {/* Action feedback */}
      {actionMsg && (
        <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-400">
          {actionMsg}
        </div>
      )}

      {/* Metrics cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {[
          { label: lang === "en" ? "Total"     : "الإجمالي",       value: metrics.total,     color: "#22D3EE" },
          { label: lang === "en" ? "Pending"   : "قيد الانتظار",   value: metrics.pending,   color: "#0ea5e9" },
          { label: lang === "en" ? "Booked"    : "محجوز",          value: metrics.booked,    color: "#22c55e" },
          { label: lang === "en" ? "Arrived"   : "وصل",            value: metrics.arrived,   color: "#3b82f6" },
          { label: lang === "en" ? "Fulfilled" : "مكتمل",          value: metrics.fulfilled, color: "#8b5cf6" },
          { label: lang === "en" ? "Cancelled" : "ملغي",           value: metrics.cancelled, color: "#ef4444" },
        ].map(m => (
          <div key={m.label} className="cy-card p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: m.color }}>{m.value}</p>
            <p className="mt-1 text-xs font-medium text-ink/50">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-ink/10 bg-surface p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-ink/50">
            {lang === "en" ? "DATE" : "التاريخ"}
          </label>
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="rounded-md border border-ink/10 bg-surface px-3 py-1.5 text-sm text-ink"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-ink/50">
            {lang === "en" ? "STATUS" : "الحالة"}
          </label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="rounded-md border border-ink/10 bg-surface px-3 py-1.5 text-sm text-ink"
          >
            {["all", "proposed", "pending", "booked", "arrived", "fulfilled", "cancelled"].map(s => (
              <option key={s} value={s}>{s === "all" ? (lang === "en" ? "All Statuses" : "كل الحالات") : statusLabel(s, lang)}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-ink/50">
            {lang === "en" ? "SPECIALTY" : "التخصص"}
          </label>
          <select
            value={filterSpecialty}
            onChange={e => setFilterSpecialty(e.target.value)}
            className="max-w-[220px] rounded-md border border-ink/10 bg-surface px-3 py-1.5 text-sm text-ink"
          >
            {specialties.map(s => (
              <option key={s} value={s}>{s === "All" ? (lang === "en" ? "All Specialties" : "كل التخصصات") : s}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto self-end pb-1.5 text-sm text-ink/50">
          {lang === "en" ? `Showing ${filtered.length} of ${rows.length}` : `عرض ${filtered.length} من ${rows.length}`}
        </div>
      </div>

      {/* Appointments table */}
      <div className="cy-card overflow-auto p-0">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-ink/10">
              {[
                lang === "en" ? "Time"      : "الوقت",
                lang === "en" ? "MRN"       : "الرقم الطبي",
                lang === "en" ? "Patient"   : "المريض",
                lang === "en" ? "Specialty" : "التخصص",
                lang === "en" ? "Provider"  : "الطبيب",
                lang === "en" ? "Status"    : "الحالة",
                lang === "en" ? "Notes"     : "ملاحظات",
                lang === "en" ? "Actions"   : "إجراءات",
              ].map(h => (
                <th key={h} className={`px-4 py-3.5 text-xs font-semibold text-ink/50 ${lang === "ar" ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.id} className="border-b border-ink/5">
                <td className="whitespace-nowrap px-4 py-3.5 text-sm font-bold text-brand-400">{row.time}</td>
                <td className="px-4 py-3.5 font-mono text-xs text-ink/50">{row.mrn}</td>
                <td className="px-4 py-3.5">
                  <div className="text-sm font-semibold">{row.patient_name}</div>
                  <div className="mt-0.5 text-xs text-ink/50">{row.id}</div>
                </td>
                <td className="px-4 py-3.5 text-sm">{row.specialty}</td>
                <td className="px-4 py-3.5 text-sm">{row.provider}</td>
                <td className="px-4 py-3.5">
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${statusColor(row.status)}`}>
                    {statusLabel(row.status, lang)}
                  </span>
                </td>
                <td className="max-w-[200px] px-4 py-3.5 text-xs text-ink/50">
                  <span title={row.notes} className="block truncate">{row.notes}</span>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-nowrap gap-1.5">
                    {(row.status === "proposed" || row.status === "pending") && (
                      <button
                        onClick={() => { void handleAction(row, "confirm"); }}
                        className="whitespace-nowrap rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-bold text-white"
                      >
                        {lang === "en" ? "Confirm" : "تأكيد"}
                      </button>
                    )}
                    {row.status !== "cancelled" && row.status !== "fulfilled" && (
                      <button
                        onClick={() => { void handleAction(row, "cancel"); }}
                        className="whitespace-nowrap rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-bold text-white"
                      >
                        {lang === "en" ? "Cancel" : "إلغاء"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-ink/40">
            {rows.length === 0
              ? (lang === "en" ? "No appointments scheduled." : "لا توجد مواعيد مجدولة.")
              : (lang === "en" ? "No appointments match the selected filters." : "لا توجد مواعيد تطابق عوامل التصفية المحددة.")}
          </div>
        )}
      </div>

      <div className="mt-6 text-center text-xs text-ink/40">
        CyMed Clinic · {lang === "en" ? "Appointment Management" : "إدارة المواعيد"} · {new Date().toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB", { year: "numeric", month: "long", day: "numeric" })}
      </div>
    </div>
  );
}
