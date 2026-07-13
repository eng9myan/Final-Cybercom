"use client";

import { usePreferences } from "@/contexts/preferences";
import { useAuth } from "@/contexts/auth";
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Interfaces (mirror real backend serializers) ──────────────────────────────
// clinic.telemedicine.VirtualVisitSerializer: id, patient, provider_id,
// scheduled_start, status (scheduled/in_progress/completed/cancelled),
// session{session_token, connection_url, started_at, ended_at}. No platform
// (video/phone/chat) or specialty fields exist on the backend.

interface SessionInfo { session_token: string; connection_url: string; started_at: string | null; ended_at: string | null; }
interface VisitRaw { id: string; patient: string; provider_id: string; scheduled_start: string; status: "scheduled" | "in_progress" | "completed" | "cancelled"; session: SessionInfo | null; }
interface PatientRaw { id: string; first_name: string; last_name: string; mrn: string; }
interface ProviderRaw { id: string; first_name: string; last_name: string; }
interface Paginated<T> { count: number; results: T[]; }

interface Row {
  id: string;
  patient_name: string;
  mrn: string;
  provider: string;
  scheduled_at: string;
  status: VisitRaw["status"];
  connection_url: string | null;
}

const STATUS_COLOR: Record<string, string> = { scheduled: "#f59e0b", in_progress: "#22c55e", completed: "#22D3EE", cancelled: "#6b7280" };

export default function TelemedicinePage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const isAr = lang === "ar";

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [visitPage, patientPage, providerPage] = await Promise.all([
        apiFetch<Paginated<VisitRaw>>("/api/v1/clinic/telemedicine/visits/", opts),
        apiFetch<Paginated<PatientRaw>>("/api/v1/patients/", opts),
        apiFetch<Paginated<ProviderRaw>>("/api/v1/providers/", opts),
      ]);
      const patientById = new Map(patientPage.results.map(p => [p.id, p]));
      const providerById = new Map(providerPage.results.map(p => [p.id, p]));
      const mapped: Row[] = visitPage.results.map(v => {
        const patient = patientById.get(v.patient);
        const provider = providerById.get(v.provider_id);
        return {
          id: v.id,
          patient_name: patient ? `${patient.first_name} ${patient.last_name}` : "Unknown patient",
          mrn: patient?.mrn ?? "—",
          provider: provider ? `Dr. ${provider.first_name} ${provider.last_name}` : "Unassigned",
          scheduled_at: new Date(v.scheduled_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          status: v.status,
          connection_url: v.session?.connection_url ?? null,
        };
      });
      setRows(mapped);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load telemedicine visits."));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleJoin = async (id: string) => {
    if (!session) return;
    try {
      await apiFetch(`/api/v1/clinic/telemedicine/visits/${id}/start_session/`, {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      setRows(prev => prev.map(r => r.id === id ? { ...r, status: "in_progress" } : r));
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setActionMsg(detail || (isAr ? "فشل الانضمام." : "Failed to join."));
      setTimeout(() => setActionMsg(""), 3000);
    }
  };

  const handleUpdateStatus = async (id: string, status: "completed" | "cancelled") => {
    if (!session) return;
    try {
      await apiFetch(`/api/v1/clinic/telemedicine/visits/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setActionMsg(detail || (isAr ? "فشل الإجراء." : "Action failed."));
      setTimeout(() => setActionMsg(""), 3000);
    }
  };

  const counts = {
    scheduled:   rows.filter(r => r.status === "scheduled").length,
    in_progress: rows.filter(r => r.status === "in_progress").length,
    completed:   rows.filter(r => r.status === "completed").length,
    cancelled:   rows.filter(r => r.status === "cancelled").length,
  };
  const filtered = filter === "all" ? rows : rows.filter(r => r.status === filter);
  const dir = isAr ? "rtl" : "ltr";

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل جلسات التطبيب عن بُعد" : "Unable to load telemedicine visits"}</h1>
        <p className="mt-1 text-sm text-ink/50">{fetchError}</p>
        <button onClick={() => void loadData()} className="cy-btn cy-btn-ghost mt-4 !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "إعادة المحاولة" : "Retry"}
        </button>
      </div>
    );
  }

  return (
    <div dir={dir} className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-center justify-between border-b-2 border-brand-400/30 pb-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-400">{isAr ? "التطبيب عن بُعد" : "Telemedicine Visits"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? "جلسات التطبيب عن بُعد" : "Virtual patient visits"}</p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-xs text-ink/50">●</span>}
          <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">{isAr ? "English" : "العربية"}</button>
        </div>
      </header>
      <nav className="mb-6 flex flex-wrap gap-2">
        <a href="/clinic" className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm no-underline">{isAr ? "← الرجوع للعيادة" : "← Back to Clinic"}</a>
      </nav>

      {actionMsg && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-400">
          {actionMsg}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: isAr ? "مجدولة" : "Scheduled", value: counts.scheduled, color: "#f59e0b" },
          { label: isAr ? "جارية" : "In Progress", value: counts.in_progress, color: "#22c55e" },
          { label: isAr ? "مكتملة" : "Completed", value: counts.completed, color: "#22D3EE" },
          { label: isAr ? "ملغاة" : "Cancelled", value: counts.cancelled, color: "#6b7280" },
        ].map(m => (
          <div key={m.label} className="cy-card p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: m.color }}>{m.value}</div>
            <div className="mt-1 text-xs text-ink/50">{m.label}</div>
          </div>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {["all", "scheduled", "in_progress", "completed", "cancelled"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold border ${filter === f ? "border-brand-400 bg-brand-500 text-white" : "border-ink/10 bg-surface text-ink hover:bg-ink/5"}`}
          >
            {f === "all" ? (isAr ? "الكل" : "All") : f.replace("_", " ")}
          </button>
        ))}
      </div>
      <div className="cy-card overflow-auto p-0">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-ink/10">
              {[
                isAr ? "المريض" : "Patient",
                isAr ? "الطبيب" : "Provider",
                isAr ? "الوقت" : "Time",
                isAr ? "الحالة" : "Status",
                isAr ? "إجراء" : "Action",
              ].map(h => (
                <th key={h} className={`px-4 py-3.5 text-xs font-semibold text-ink/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.id} className="border-b border-ink/5">
                <td className="px-4 py-3 text-sm">
                  <div className="font-semibold">{row.patient_name}</div>
                  <div className="text-xs text-ink/50">{row.mrn}</div>
                </td>
                <td className="px-4 py-3 text-sm">{row.provider}</td>
                <td className="px-4 py-3 text-sm">{row.scheduled_at}</td>
                <td className="px-4 py-3">
                  <span className="rounded px-2 py-0.5 text-xs font-semibold" style={{ background: `${STATUS_COLOR[row.status]}22`, color: STATUS_COLOR[row.status], border: `1px solid ${STATUS_COLOR[row.status]}55` }}>
                    {row.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    {row.status === "scheduled" && (
                      <button onClick={() => { void handleJoin(row.id); }} className="rounded px-2.5 py-1 text-xs font-semibold" style={{ background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e55" }}>
                        {isAr ? "انضمام" : "Join"}
                      </button>
                    )}
                    {row.status === "in_progress" && row.connection_url && (
                      <a href={row.connection_url} target="_blank" rel="noreferrer" className="rounded px-2.5 py-1 text-xs font-semibold no-underline" style={{ background: "#22D3EE22", color: "#22D3EE", border: "1px solid #22D3EE55" }}>
                        {isAr ? "فتح الجلسة" : "Open Session"}
                      </a>
                    )}
                    {row.status === "in_progress" && (
                      <button onClick={() => { void handleUpdateStatus(row.id, "completed"); }} className="rounded px-2.5 py-1 text-xs font-semibold" style={{ background: "transparent", color: "#22D3EE", border: "1px solid #22D3EE55" }}>
                        {isAr ? "إنهاء" : "End"}
                      </button>
                    )}
                    {row.status === "scheduled" && (
                      <button onClick={() => { void handleUpdateStatus(row.id, "cancelled"); }} className="rounded px-2.5 py-1 text-xs" style={{ background: "transparent", color: "#6b7280", border: "1px solid #6b728055" }}>
                        {isAr ? "إلغاء" : "Cancel"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="p-10 text-center text-sm text-ink/40">{isAr ? "لا توجد جلسات." : "No visits."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
