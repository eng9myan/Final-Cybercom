"use client";
import { useState, useEffect, useCallback } from "react";
import { Scissors } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

type CaseStatus = "scheduled" | "pre_op" | "intra_op" | "post_op" | "completed" | "cancelled";

interface SurgicalCase {
  id: string;
  patient: string;
  surgeon_id: string;
  procedure_code: string;
  scheduled_start: string;
  scheduled_end: string;
  status: CaseStatus;
}
interface Patient { id: string; first_name: string; last_name: string; mrn: string; }
interface Provider { id: string; first_name: string; last_name: string; }
interface SurgicalTeam { id: string; surgical_case: string; member_id: string; role: string; }
interface Paginated<T> { count: number; results: T[]; }

const STATUS_COLOR: Record<string, string> = { scheduled: "#22D3EE", pre_op: "#a78bfa", intra_op: "#22c55e", post_op: "#f59e0b", completed: "#6b7280", cancelled: "#ef4444" };

export default function ORPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [cases, setCases] = useState<SurgicalCase[] | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [teams, setTeams] = useState<SurgicalTeam[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const isAr = lang === "ar";

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [casePage, patientPage, providerPage, teamPage] = await Promise.all([
        apiFetch<Paginated<SurgicalCase>>("/api/v1/hospital/or/cases/", opts),
        apiFetch<Paginated<Patient>>("/api/v1/patients/", opts),
        apiFetch<Paginated<Provider>>("/api/v1/providers/", opts),
        apiFetch<Paginated<SurgicalTeam>>("/api/v1/hospital/or/teams/", opts),
      ]);
      setCases(casePage.results);
      setPatients(patientPage.results);
      setProviders(providerPage.results);
      setTeams(teamPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load OR schedule."));
    }
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function startCase(caseId: string) {
    if (!session) return;
    setBusyId(caseId);
    try {
      await apiFetch(`/api/v1/hospital/or/cases/${caseId}/start/`, {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ started_by: session.userId, team_members: [] }),
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to start case."));
    } finally {
      setBusyId(null);
    }
  }

  async function completeCase(c: SurgicalCase) {
    if (!session) return;
    setBusyId(c.id);
    const actualMinutes = Math.max(1, Math.round((Date.now() - new Date(c.scheduled_start).getTime()) / 60000));
    try {
      await apiFetch(`/api/v1/hospital/or/cases/${c.id}/complete/`, {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ completed_by: session.userId, actual_minutes: actualMinutes }),
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to complete case."));
    } finally {
      setBusyId(null);
    }
  }

  async function cancelCase(caseId: string) {
    if (!session) return;
    setBusyId(caseId);
    try {
      await apiFetch(`/api/v1/hospital/or/cases/${caseId}/`, {
        method: "PATCH",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ status: "cancelled" }),
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to cancel case."));
    } finally {
      setBusyId(null);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return <div role="alert" className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold text-red-400">Unable to load OR schedule</h1><p className="mt-1 text-sm text-ink/50">{fetchError}</p></div>;
  }
  if (cases === null) {
    return <div className="mx-auto mt-16 max-w-lg text-center text-sm text-ink/40">Loading live OR schedule...</div>;
  }

  const patientName = (id: string) => {
    const p = patients.find(x => x.id === id);
    return p ? `${p.first_name} ${p.last_name} (${p.mrn})` : "Unknown patient";
  };
  const providerName = (id: string) => {
    const p = providers.find(x => x.id === id);
    return p ? `Dr. ${p.first_name} ${p.last_name}` : "—";
  };
  const anesthesiologistFor = (caseId: string) => {
    const member = teams.find(t => t.surgical_case === caseId && t.role === "anesthesiologist");
    return member ? providerName(member.member_id) : "—";
  };

  const sorted = cases.slice().sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));

  return (
    <div className="mx-auto max-w-6xl" style={{ direction: isAr ? "rtl" : "ltr" }}>
      <header className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Scissors size={22} /> {isAr ? "جدول غرف العمليات" : "Operating Room Schedule"}</h1>
          <p className="mt-1 text-sm text-ink/50">{cases.length} {isAr ? "حالة" : "cases"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="rounded-lg border border-ink/10 bg-surface-overlay px-4 py-2 text-sm font-medium hover:bg-ink/5">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/5">
                {[isAr ? "المريض" : "Patient", isAr ? "الإجراء" : "Procedure Code", isAr ? "الجراح" : "Surgeon", isAr ? "المخدر" : "Anesthesiologist", isAr ? "البداية" : "Start", isAr ? "النهاية" : "End", isAr ? "الحالة" : "Status", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-ink/50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-ink/50">No surgical cases scheduled for this tenant yet.</td></tr>
              )}
              {sorted.map(c => (
                <tr key={c.id} className="border-b border-ink/5">
                  <td className="px-4 py-3 font-medium">{patientName(c.patient)}</td>
                  <td className="px-4 py-3 font-mono text-brand-300">{c.procedure_code}</td>
                  <td className="px-4 py-3 text-ink/60">{providerName(c.surgeon_id)}</td>
                  <td className="px-4 py-3 text-ink/60">{anesthesiologistFor(c.id)}</td>
                  <td className="px-4 py-3 text-ink/60">{new Date(c.scheduled_start).toLocaleString()}</td>
                  <td className="px-4 py-3 text-ink/60">{new Date(c.scheduled_end).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize" style={{ background: `${STATUS_COLOR[c.status]}22`, color: STATUS_COLOR[c.status] }}>
                      {c.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {c.status === "scheduled" && (
                        <>
                          <button disabled={busyId === c.id} onClick={() => startCase(c.id)} className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">
                            {isAr ? "بدء" : "Start"}
                          </button>
                          <button disabled={busyId === c.id} onClick={() => cancelCase(c.id)} className="rounded-md border border-red-500/40 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-40">
                            {isAr ? "إلغاء" : "Cancel"}
                          </button>
                        </>
                      )}
                      {c.status === "intra_op" && (
                        <button disabled={busyId === c.id} onClick={() => completeCase(c)} className="rounded-md border border-brand-400/40 px-2 py-1 text-xs font-semibold text-brand-300 hover:bg-brand-500/10 disabled:opacity-40">
                          {isAr ? "إنهاء" : "Complete"}
                        </button>
                      )}
                    </div>
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
