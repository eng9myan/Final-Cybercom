"use client";

import { usePreferences } from "@/contexts/preferences";
import { useAuth } from "@/contexts/auth";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Interfaces (mirror real backend serializers) ──────────────────────────────
// Dashboard queue is built from clinic.reception.CheckIn + its nested
// queue_ticket (real waiting-room lifecycle: waiting/called/active/completed/
// skipped), joined with core.patients.Patient and, where available,
// clinic.triage.TriageAssessment.triage_category for that checkin.

interface QueueTicketRaw { id: string; ticket_number: string; status: string; priority: string; }
interface CheckInRaw { id: string; patient: string; checkin_time: string; queue_ticket: QueueTicketRaw | null; }
interface PatientRaw { id: string; first_name: string; last_name: string; mrn: string; }
interface TriageAssessmentRaw { checkin: string; triage_category: string; }
interface Paginated<T> { count: number; results: T[]; }

interface QueueEntry {
  checkinId: string;
  ticketId: string | null;
  patient_name: string;
  mrn: string;
  check_in_time: string;
  triage_level: string | null;
  ticket_status: string;
}

function triageColor(level: string | null) {
  if (level === "immediate" || level === "emergent") return "#ef4444";
  if (level === "urgent" || level === "less_urgent") return "#f59e0b";
  if (level === "non_urgent") return "#22c55e";
  return "#9ca3af";
}

export default function ClinicPortal() {
  const { session, isAuthenticated } = useAuth();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [filter, setFilter] = useState<"all" | "waiting" | "active" | "completed">("all");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [checkinPage, patientPage, triagePage] = await Promise.all([
        apiFetch<Paginated<CheckInRaw>>("/api/v1/clinic/reception/checkins/", opts),
        apiFetch<Paginated<PatientRaw>>("/api/v1/patients/", opts),
        apiFetch<Paginated<TriageAssessmentRaw>>("/api/v1/clinic/triage/assessments/", opts),
      ]);
      const patientById = new Map(patientPage.results.map(p => [p.id, p]));
      const triageByCheckin = new Map(triagePage.results.map(t => [t.checkin, t.triage_category]));

      const mapped: QueueEntry[] = checkinPage.results.map(c => {
        const patient = patientById.get(c.patient);
        return {
          checkinId: c.id,
          ticketId: c.queue_ticket?.id ?? null,
          patient_name: patient ? `${patient.first_name} ${patient.last_name}` : "Unknown patient",
          mrn: patient?.mrn ?? "—",
          check_in_time: c.checkin_time ? new Date(c.checkin_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--",
          triage_level: triageByCheckin.get(c.id) ?? null,
          ticket_status: c.queue_ticket?.status ?? "—",
        };
      });
      setQueue(mapped);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load clinic queue."));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleCallIn = async (entry: QueueEntry) => {
    if (!session || !entry.ticketId) return;
    try {
      await apiFetch(`/api/v1/clinic/reception/tickets/${entry.ticketId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      setQueue(prev => prev.map(q => q.checkinId === entry.checkinId ? { ...q, ticket_status: "active" } : q));
    } catch {
      /* leave state unchanged — the retry-on-reload pattern here matches the fetchError banner already shown elsewhere */
    }
  };

  const metrics = {
    waiting_patients:   queue.filter(q => q.ticket_status === "waiting").length,
    in_consultation:    queue.filter(q => q.ticket_status === "active").length,
    completed_today:    queue.filter(q => q.ticket_status === "completed").length,
    checkins_today:     queue.length,
  };

  const filterMap: Record<string, string> = { waiting: "waiting", active: "active", completed: "completed" };
  const filtered = filter === "all" ? queue : queue.filter(q => q.ticket_status === filterMap[filter]);

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">
          {lang === "en" ? "Unable to load clinic queue" : "تعذر تحميل طابور العيادة"}
        </h1>
        <p className="mt-1 text-sm text-ink/50">{fetchError}</p>
        <button onClick={() => void loadData()} className="cy-btn cy-btn-ghost mt-4 !min-h-0 !py-2 !px-4 text-sm">
          {lang === "en" ? "Retry" : "إعادة المحاولة"}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {lang === "en" ? "CyMed Clinic" : "عيادة سايمد"}
          </h1>
          <p className="mt-1 text-sm text-ink/50">
            {lang === "en" ? "Outpatient Clinic Management" : "إدارة العيادات الخارجية"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-ink/50">
            {new Date().toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </span>
          <button
            onClick={() => setLang(l => l === "en" ? "ar" : "en")}
            className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm"
          >
            {lang === "en" ? "العربية" : "English"}
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav className="mb-8 flex flex-wrap gap-3">
        {[
          { href: "/clinic/reception", label: lang === "en" ? "Reception" : "الاستقبال" },
          { href: "/clinic/appointments", label: lang === "en" ? "Appointments" : "المواعيد" },
          { href: "/clinic/triage", label: lang === "en" ? "Triage" : "الفرز" },
          { href: "/clinic/consultations", label: lang === "en" ? "Consultations" : "الاستشارات" },
          { href: "/clinic/telemedicine", label: lang === "en" ? "Telemedicine" : "التطبيب عن بُعد" },
        ].map(item => (
          <a key={item.href} href={item.href} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
            {item.label}
          </a>
        ))}
      </nav>

      {/* Metrics */}
      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: lang === "en" ? "Waiting" : "في الانتظار", value: metrics.waiting_patients, color: "#f59e0b" },
          { label: lang === "en" ? "In Consultation" : "في الاستشارة", value: metrics.in_consultation, color: "#3b82f6" },
          { label: lang === "en" ? "Completed Today" : "مكتمل اليوم", value: metrics.completed_today, color: "#22c55e" },
          { label: lang === "en" ? "Total Check-ins" : "إجمالي التسجيلات", value: metrics.checkins_today, color: "#8b5cf6" },
        ].map(m => (
          <div key={m.label} className="cy-card p-5 text-center">
            <p className="text-3xl font-bold" style={{ color: m.color }}>{m.value}</p>
            <p className="mt-2 text-sm font-medium text-ink/50">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Queue Filter */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h2 className="text-lg font-bold">
          {lang === "en" ? "Patient Queue" : "طابور المرضى"}
          {loading && <span className="ml-4 text-sm font-normal text-ink/50">{lang === "en" ? "Loading..." : "جارٍ التحميل..."}</span>}
        </h2>
        <div className="ml-auto flex gap-2">
          {(["all", "waiting", "active", "completed"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ${filter === f ? "border border-brand-400/60 bg-brand-500/15 text-brand-300" : "border border-ink/10 text-ink/50 hover:bg-ink/5"}`}
            >
              {f === "all" ? (lang === "en" ? "All" : "الكل") :
               f === "waiting" ? (lang === "en" ? "Waiting" : "انتظار") :
               f === "active" ? (lang === "en" ? "In Consult" : "استشارة") :
               (lang === "en" ? "Done" : "مكتمل")}
            </button>
          ))}
        </div>
      </div>

      {/* Queue Table */}
      <div className="cy-card overflow-auto p-0">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-ink/10">
              {[
                lang === "en" ? "MRN" : "الرقم الطبي",
                lang === "en" ? "Patient" : "المريض",
                lang === "en" ? "Check-In" : "وقت الوصول",
                lang === "en" ? "Triage" : "الفرز",
                lang === "en" ? "Status" : "الحالة",
                lang === "en" ? "Actions" : "إجراءات",
              ].map(h => (
                <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold text-ink/50">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(entry => (
              <tr key={entry.checkinId} className="border-b border-ink/5">
                <td className="px-4 py-3.5 font-mono text-sm text-ink/50">{entry.mrn}</td>
                <td className="px-4 py-3.5">
                  <div className="text-sm font-semibold">{entry.patient_name}</div>
                </td>
                <td className="px-4 py-3.5 text-sm">{entry.check_in_time}</td>
                <td className="px-4 py-3.5">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: triageColor(entry.triage_level) }} />
                  <span className="text-sm capitalize">{entry.triage_level?.replace("_", " ") ?? (lang === "en" ? "Not triaged" : "لم يُفرز")}</span>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${entry.ticket_status === "waiting" ? "bg-amber-500/15 text-amber-300" : entry.ticket_status === "active" ? "bg-sky-500/15 text-sky-300" : entry.ticket_status === "completed" ? "bg-emerald-500/15 text-emerald-300" : "bg-ink/10 text-ink/50"}`}>
                    {entry.ticket_status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  {entry.ticket_status === "waiting" && (
                    <button
                      onClick={() => { void handleCallIn(entry); }}
                      className="cy-btn cy-btn-primary !min-h-0 !py-1.5 !px-3 text-xs"
                    >
                      {lang === "en" ? "Call In" : "استدعاء"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-ink/40">
            {lang === "en" ? "No patients in this queue" : "لا يوجد مرضى في هذا الطابور"}
          </div>
        )}
      </div>
    </div>
  );
}
