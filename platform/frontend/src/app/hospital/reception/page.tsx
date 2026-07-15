"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ClipboardCheck, UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

type AppointmentStatus = "proposed" | "pending" | "booked" | "arrived" | "fulfilled" | "cancelled";

interface Appointment {
  id: string; patient: string; appointment_type: string; status: AppointmentStatus;
  start_time: string; end_time: string;
}
interface Patient { id: string; first_name: string; last_name: string; mrn: string; }
interface Paginated<T> { count: number; results: T[]; }

function unwrap<T>(data: Paginated<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

const STATUS_COLOR: Record<AppointmentStatus, string> = {
  proposed: "#94a3b8", pending: "#f59e0b", booked: "#3b82f6", arrived: "#22c55e", fulfilled: "#6b7280", cancelled: "#ef4444",
};
const STATUS_LABEL_AR: Record<AppointmentStatus, string> = {
  proposed: "مقترح", pending: "معلق", booked: "محجوز", arrived: "وصل", fulfilled: "مكتمل", cancelled: "ملغى",
};

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export default function ReceptionPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [patients, setPatients] = useState<Record<string, Patient>>({});
  const [search, setSearch] = useState("");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    const opts = { token: session.accessToken, tenantId: session.tenantId };
    try {
      const [apptData, patientData] = await Promise.all([
        apiFetch<Paginated<Appointment> | Appointment[]>("/api/v1/scheduling/", opts),
        apiFetch<Paginated<Patient> | Patient[]>("/api/v1/patients/", opts),
      ]);
      setAppointments(unwrap(apptData));
      const pMap: Record<string, Patient> = {};
      for (const p of unwrap(patientData)) pMap[p.id] = p;
      setPatients(pMap);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل جدول اليوم." : "Failed to load today's schedule."));
    }
  }, [session, isAr]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function checkIn(appt: Appointment) {
    if (!session) return;
    setBusyId(appt.id);
    try {
      await apiFetch(`/api/v1/scheduling/${appt.id}/`, {
        method: "PATCH",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ status: "arrived" }),
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تسجيل وصول المريض." : "Failed to check in patient."));
    } finally {
      setBusyId(null);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }

  const todays = (appointments || []).filter(a => isToday(a.start_time)).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const searchLower = search.trim().toLowerCase();
  const filtered = searchLower
    ? todays.filter(a => {
        const p = patients[a.patient];
        return p && (`${p.first_name} ${p.last_name}`.toLowerCase().includes(searchLower) || p.mrn.toLowerCase().includes(searchLower));
      })
    : todays;

  const waitingCount = todays.filter(a => a.status === "booked" || a.status === "pending").length;
  const arrivedCount = todays.filter(a => a.status === "arrived").length;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><ClipboardCheck size={22} /> {isAr ? "الاستقبال" : "Reception"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? "مواعيد اليوم — بحث وتسجيل وصول المرضى" : "Today's appointments — search and check in arriving patients"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/hospital/patients" className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm">
            <UserPlus size={16} /> {isAr ? "مريض حالة عابرة جديد" : "New Walk-in Patient"}
          </Link>
          <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
            {isAr ? "English" : "العربية"}
          </button>
        </div>
      </header>

      {fetchError && (
        <div role="alert" className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{fetchError}</div>
      )}

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="cy-card p-4 text-center">
          <div className="text-2xl font-bold text-brand-400">{todays.length}</div>
          <div className="mt-1 text-xs text-ink/50">{isAr ? "مواعيد اليوم" : "Today's appointments"}</div>
        </div>
        <div className="cy-card p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">{waitingCount}</div>
          <div className="mt-1 text-xs text-ink/50">{isAr ? "لم يصلوا بعد" : "Not yet arrived"}</div>
        </div>
        <div className="cy-card p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{arrivedCount}</div>
          <div className="mt-1 text-xs text-ink/50">{isAr ? "تم تسجيل وصولهم" : "Checked in"}</div>
        </div>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={isAr ? "البحث باسم المريض أو رقم الملف الطبي…" : "Search by patient name or MRN…"}
        className="mb-5 w-full rounded-xl border border-ink/10 bg-surface px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none"
      />

      <div className="cy-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={`border-b border-ink/10 bg-ink/5 text-xs uppercase tracking-wider text-ink/40 ${isAr ? "text-right" : "text-left"}`}>
                <th className="px-4 py-3">{isAr ? "الوقت" : "Time"}</th>
                <th className="px-4 py-3">{isAr ? "المريض" : "Patient"}</th>
                <th className="px-4 py-3">{isAr ? "النوع" : "Type"}</th>
                <th className="px-4 py-3">{isAr ? "الحالة" : "Status"}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {appointments === null && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-ink/40">{isAr ? "جارٍ تحميل جدول اليوم…" : "Loading today's schedule…"}</td></tr>
              )}
              {appointments !== null && filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-ink/40">{isAr ? "لا توجد مواعيد مطابقة." : "No appointments match."}</td></tr>
              )}
              {filtered.map(a => {
                const p = patients[a.patient];
                return (
                  <tr key={a.id} className="border-b border-ink/5 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{new Date(a.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p ? `${p.first_name} ${p.last_name}` : `${isAr ? "مريض" : "Patient"} ${a.patient.slice(0, 8)}`}</div>
                      {p && <div className="text-xs text-ink/40">{p.mrn}</div>}
                    </td>
                    <td className="px-4 py-3 capitalize text-ink/70">{a.appointment_type}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold capitalize" style={{ background: `${STATUS_COLOR[a.status]}22`, color: STATUS_COLOR[a.status] }}>{isAr ? STATUS_LABEL_AR[a.status] : a.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {(a.status === "booked" || a.status === "pending") && (
                        <button disabled={busyId === a.id} onClick={() => checkIn(a)} className="rounded-md border border-emerald-500/40 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">
                          {busyId === a.id ? "…" : (isAr ? "تسجيل الوصول" : "Check In")}
                        </button>
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
