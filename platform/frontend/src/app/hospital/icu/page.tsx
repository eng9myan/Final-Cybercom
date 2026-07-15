"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { HeartPulse } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface ICUStay {
  id: string;
  stay: string;
  unit_type: "micu_sicu" | "ccu" | "nicu" | "picu";
  icu_admitted_at: string;
  icu_released_at: string | null;
  ventilator_status: string;
  invasive_lines_count: number;
  gestational_age_weeks: number | null;
  birth_weight_grams: number | null;
}

const UNIT_TYPE_LABELS: Record<ICUStay["unit_type"], string> = {
  micu_sicu: "MICU/SICU",
  ccu: "CCU",
  nicu: "NICU",
  picu: "PICU",
};
const UNIT_TYPE_COLORS: Record<ICUStay["unit_type"], string> = {
  micu_sicu: "#22D3EE",
  ccu: "#f59e0b",
  nicu: "#f472b6",
  picu: "#a78bfa",
};
interface HospitalStay { id: string; admission: string; current_code_status: string; }
interface Admission { id: string; encounter: string; admitting_physician_id: string; }
interface Encounter { id: string; patient: string; }
interface Patient { id: string; first_name: string; last_name: string; mrn: string; }
interface ICUAssessment { id: string; icu_stay: string; assessed_at: string; sofa_score: number; apache_ii_score: number; glasgow_coma_scale: number; }
interface CriticalEvent { id: string; icu_stay: string; event_time: string; event_type: string; details: string; }
interface Paginated<T> { count: number; results: T[]; }

export default function ICUPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [stays, setStays] = useState<ICUStay[] | null>(null);
  const [hospitalStays, setHospitalStays] = useState<HospitalStay[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [assessments, setAssessments] = useState<ICUAssessment[]>([]);
  const [criticalEvents, setCriticalEvents] = useState<CriticalEvent[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedStay, setExpandedStay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAr = lang === "ar";

  const [roundForm, setRoundForm] = useState({ heart_rate: "", mean_arterial_pressure: "", temp_c: "", resp_rate: "", o2_sat: "", glasgow_coma_scale: "15" });
  const [eventForm, setEventForm] = useState({ event_type: "", details: "", severity: "moderate" });
  const [activeForm, setActiveForm] = useState<"round" | "event" | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [stayPage, hospitalStayPage, admissionPage, encounterPage, patientPage, assessmentPage, eventPage] = await Promise.all([
        apiFetch<Paginated<ICUStay>>("/api/v1/hospital/icu/stays/", opts),
        apiFetch<Paginated<HospitalStay>>("/api/v1/hospital/inpatient/stays/", opts),
        apiFetch<Paginated<Admission>>("/api/v1/hospital/adt/admissions/", opts),
        apiFetch<Paginated<Encounter>>("/api/v1/encounters/", opts),
        apiFetch<Paginated<Patient>>("/api/v1/patients/", opts),
        apiFetch<Paginated<ICUAssessment>>("/api/v1/hospital/icu/assessments/", opts),
        apiFetch<Paginated<CriticalEvent>>("/api/v1/hospital/icu/critical-events/", opts),
      ]);
      setStays(stayPage.results);
      setHospitalStays(hospitalStayPage.results);
      setAdmissions(admissionPage.results);
      setEncounters(encounterPage.results);
      setPatients(patientPage.results);
      setAssessments(assessmentPage.results);
      setCriticalEvents(eventPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load ICU data."));
    }
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function submitRound(stayId: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/hospital/icu/stays/${stayId}/round/`, {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          rounded_by: session.userId,
          heart_rate: Number(roundForm.heart_rate || 80),
          mean_arterial_pressure: Number(roundForm.mean_arterial_pressure || 90),
          temp_c: Number(roundForm.temp_c || 37.0),
          resp_rate: Number(roundForm.resp_rate || 16),
          o2_sat: Number(roundForm.o2_sat || 98),
          glasgow_coma_scale: Number(roundForm.glasgow_coma_scale || 15),
        }),
      });
      setRoundForm({ heart_rate: "", mean_arterial_pressure: "", temp_c: "", resp_rate: "", o2_sat: "", glasgow_coma_scale: "15" });
      setActiveForm(null);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to log ICU round."));
    } finally {
      setBusy(false);
    }
  }

  async function submitCriticalEvent(stayId: string) {
    if (!session || !eventForm.event_type) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/hospital/icu/stays/${stayId}/critical_event/`, {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          event_type: eventForm.event_type,
          description: eventForm.details,
          severity: eventForm.severity,
          responded_by: session.userId,
        }),
      });
      setEventForm({ event_type: "", details: "", severity: "moderate" });
      setActiveForm(null);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to log critical event."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return <div role="alert" className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold text-red-400">Unable to load ICU data</h1><p className="mt-1 text-sm text-ink/50">{fetchError}</p></div>;
  }
  if (stays === null) {
    return <div className="mx-auto mt-16 max-w-lg text-center text-sm text-ink/40">Loading live ICU data...</div>;
  }

  const activeStays = stays.filter(s => !s.icu_released_at);
  const patientFor = (stayId: string): Patient | undefined => {
    const hStay = hospitalStays.find(h => h.id === stayId);
    if (!hStay) return undefined;
    const admission = admissions.find(a => a.id === hStay.admission);
    if (!admission) return undefined;
    const encounter = encounters.find(e => e.id === admission.encounter);
    if (!encounter) return undefined;
    return patients.find(p => p.id === encounter.patient);
  };
  const latestAssessment = (stayId: string): ICUAssessment | undefined =>
    assessments.filter(a => a.icu_stay === stayId).sort((a, b) => b.assessed_at.localeCompare(a.assessed_at))[0];
  const eventsFor = (stayId: string) => criticalEvents.filter(e => e.icu_stay === stayId);
  const daysInICU = (admittedAt: string) => Math.max(1, Math.round((Date.now() - new Date(admittedAt).getTime()) / (1000 * 60 * 60 * 24)));

  const ventCount = activeStays.filter(s => s.ventilator_status !== "none").length;
  const apacheScores = activeStays.map(s => latestAssessment(s.id)?.apache_ii_score).filter((v): v is number => v !== undefined);
  const avgApache = apacheScores.length ? Math.round(apacheScores.reduce((a, v) => a + v, 0) / apacheScores.length) : null;
  const avgLOS = activeStays.length ? Math.round(activeStays.reduce((a, s) => a + daysInICU(s.icu_admitted_at), 0) / activeStays.length) : 0;

  return (
    <div className="mx-auto max-w-5xl" style={{ direction: isAr ? "rtl" : "ltr" }}>
      <header className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><HeartPulse size={22} /> {isAr ? "وحدة العناية المركزة" : "Intensive Care Unit"}</h1>
          <p className="mt-1 text-sm text-ink/50">{activeStays.length} {isAr ? "مريض نشط" : "active patients"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="rounded-lg border border-ink/10 bg-surface-overlay px-4 py-2 text-sm font-medium hover:bg-ink/5">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          { label: isAr ? "إجمالي المرضى" : "Active Patients", value: activeStays.length, color: "#22D3EE" },
          { label: isAr ? "على التنفس الصناعي" : "Ventilated", value: ventCount, color: "#f59e0b" },
          { label: isAr ? "متوسط APACHE II" : "Avg APACHE II", value: avgApache ?? "—", color: "#a78bfa" },
          { label: isAr ? "متوسط الإقامة (أيام)" : "Avg LOS (days)", value: avgLOS, color: "#22c55e" },
          { label: isAr ? "أحداث حرجة" : "Critical Events", value: criticalEvents.length, color: "#ef4444" },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-ink/10 bg-surface-raised p-4">
            <div className="text-2xl font-bold" style={{ color: m.color }}>{m.value}</div>
            <div className="mt-1 text-xs text-ink/50">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/5">
                {[isAr ? "المريض" : "Patient", isAr ? "الوحدة" : "Unit", isAr ? "أيام العناية" : "Days ICU", isAr ? "تنفس صناعي" : "Ventilator", "SOFA", "APACHE II", "GCS", isAr ? "حالة الرمز" : "Code Status", isAr ? "أحداث حرجة" : "Critical Events", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-ink/50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeStays.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-ink/50">No patients currently in ICU.</td></tr>
              )}
              {activeStays.map(stay => {
                const patient = patientFor(stay.stay);
                const assessment = latestAssessment(stay.id);
                const hStay = hospitalStays.find(h => h.id === stay.stay);
                const events = eventsFor(stay.id);
                const expanded = expandedStay === stay.id;
                return (
                  <Fragment key={stay.id}>
                    <tr className="border-b border-ink/5">
                      <td className="px-4 py-3 font-medium">
                        {patient ? `${patient.first_name} ${patient.last_name} (${patient.mrn})` : "Unknown patient"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-md px-2 py-0.5 text-xs font-semibold"
                          style={{ color: UNIT_TYPE_COLORS[stay.unit_type], backgroundColor: `${UNIT_TYPE_COLORS[stay.unit_type]}1a` }}
                        >
                          {UNIT_TYPE_LABELS[stay.unit_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink/60">{daysInICU(stay.icu_admitted_at)}</td>
                      <td className="px-4 py-3">
                        {stay.ventilator_status === "none" ? (
                          <span className="text-ink/50">No</span>
                        ) : (
                          <span className="font-semibold text-amber-400 capitalize">{stay.ventilator_status.replace("_", " ")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{assessment?.sofa_score ?? "—"}</td>
                      <td className="px-4 py-3">
                        {assessment ? (
                          <span className="font-bold" style={{ color: assessment.apache_ii_score >= 25 ? "#ef4444" : assessment.apache_ii_score >= 15 ? "#f59e0b" : "#22c55e" }}>
                            {assessment.apache_ii_score}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">{assessment?.glasgow_coma_scale ?? "—"}</td>
                      <td className="px-4 py-3 text-ink/60 capitalize">{hStay?.current_code_status.replace("_", " ") ?? "—"}</td>
                      <td className="px-4 py-3">
                        {events.length === 0 ? <span className="text-ink/30">—</span> : events.map(e => (
                          <div key={e.id} className="mb-1 text-xs text-amber-400">⚠ {e.event_type}: {e.details}</div>
                        ))}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setExpandedStay(expanded ? null : stay.id); setActiveForm(null); }}
                          className="rounded-md border border-brand-400/40 px-2 py-1 text-xs font-semibold text-brand-300 hover:bg-brand-500/10"
                        >
                          {expanded ? (isAr ? "إغلاق" : "Close") : (isAr ? "تسجيل" : "Log")}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={10} className="bg-ink/[0.02] px-4 py-4">
                          {stay.unit_type === "nicu" && (
                            <div className="mb-3 flex gap-4 rounded-lg border border-pink-400/30 bg-pink-500/5 px-3 py-2 text-xs">
                              <span className="font-semibold text-pink-300">NICU</span>
                              <span>Gestational age: <strong>{stay.gestational_age_weeks ?? "—"}</strong> weeks</span>
                              <span>Birth weight: <strong>{stay.birth_weight_grams ?? "—"}</strong> g</span>
                            </div>
                          )}
                          <div className="mb-3 flex gap-2">
                            <button onClick={() => setActiveForm("round")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${activeForm === "round" ? "bg-brand-500/15 text-brand-300 border border-brand-400/40" : "border border-ink/10 text-ink/50"}`}>
                              {isAr ? "تسجيل جولة" : "Log Round (SOFA)"}
                            </button>
                            <button onClick={() => setActiveForm("event")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${activeForm === "event" ? "bg-red-500/15 text-red-300 border border-red-400/40" : "border border-ink/10 text-ink/50"}`}>
                              {isAr ? "حدث حرج" : "Log Critical Event"}
                            </button>
                          </div>
                          {activeForm === "round" && (
                            <div>
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                                {([
                                  ["heart_rate", "HR"], ["mean_arterial_pressure", "MAP"], ["temp_c", "Temp °C"],
                                  ["resp_rate", "RR"], ["o2_sat", "SpO2 %"], ["glasgow_coma_scale", "GCS"],
                                ] as const).map(([key, label]) => (
                                  <div key={key}>
                                    <label className="mb-1 block text-xs text-ink/50">{label}</label>
                                    <input type="number" value={roundForm[key]} onChange={e => setRoundForm(f => ({ ...f, [key]: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                                  </div>
                                ))}
                              </div>
                              <button disabled={busy} onClick={() => submitRound(stay.id)} className="cy-btn cy-btn-primary !min-h-0 mt-3 !py-1.5 !px-3 text-xs disabled:opacity-50">
                                {isAr ? "حفظ الجولة" : "Save Round"}
                              </button>
                            </div>
                          )}
                          {activeForm === "event" && (
                            <div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div>
                                  <label className="mb-1 block text-xs text-ink/50">Event type</label>
                                  <input value={eventForm.event_type} onChange={e => setEventForm(f => ({ ...f, event_type: e.target.value }))} placeholder="e.g. cardiac_arrest" className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs text-ink/50">Severity</label>
                                  <select value={eventForm.severity} onChange={e => setEventForm(f => ({ ...f, severity: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm">
                                    <option value="minor">Minor</option>
                                    <option value="moderate">Moderate</option>
                                    <option value="severe">Severe</option>
                                    <option value="critical">Critical</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs text-ink/50">Details</label>
                                  <input value={eventForm.details} onChange={e => setEventForm(f => ({ ...f, details: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                                </div>
                              </div>
                              <button disabled={busy || !eventForm.event_type} onClick={() => submitCriticalEvent(stay.id)} className="mt-3 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-40">
                                {isAr ? "حفظ الحدث" : "Save Event"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
