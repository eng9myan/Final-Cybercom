"use client";

import { useState, useEffect, useCallback } from "react";
import { Siren } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

type ESILevel = 1 | 2 | 3 | 4 | 5;
type VisitStatus = "triage" | "fast_track" | "resuscitation" | "observation" | "admitted" | "discharged";

interface EmergencyVisit {
  id: string;
  patient: string;
  arrival_time: string;
  arrival_method: string;
  presenting_complaint: string;
  status: VisitStatus;
}
interface EmergencyTriage { id: string; visit: string; esi_level: ESILevel; chief_complaint: string; logged_at: string; }
interface EmergencyObservation { id: string; visit: string; observed_at: string; systolic_bp: number; diastolic_bp: number; heart_rate: number; resp_rate: number; temp_c: string; o2_sat: number; }
interface EmergencyTracking { id: string; visit: string; location_label: string; left_at: string | null; }
interface Patient { id: string; first_name: string; last_name: string; mrn: string; dob: string; gender: string; }
interface Paginated<T> { count: number; results: T[]; }

function unwrap<T>(data: Paginated<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

const ESI_COLORS: Record<ESILevel, { bg: string; text: string; border: string; label: string }> = {
  1: { bg: "#1f0808", border: "#dc2626", text: "#fca5a5", label: "ESI-1 Resuscitation" },
  2: { bg: "#1f1008", border: "#f97316", text: "#fdba74", label: "ESI-2 Emergent" },
  3: { bg: "#1c1508", border: "#eab308", text: "#fde047", label: "ESI-3 Urgent" },
  4: { bg: "#082010", border: "#22c55e", text: "#86efac", label: "ESI-4 Less Urgent" },
  5: { bg: "#0a0a1a", border: "#3b82f6", text: "#93c5fd", label: "ESI-5 Non-Urgent" },
};

const STATUS_LABELS: Record<VisitStatus, { en: string; ar: string; color: string }> = {
  triage: { en: "Triage", ar: "الفرز", color: "#f59e0b" },
  fast_track: { en: "Fast Track", ar: "المسار السريع", color: "#3b82f6" },
  resuscitation: { en: "Resuscitation", ar: "إنعاش", color: "#ef4444" },
  observation: { en: "Observation", ar: "ملاحظة", color: "#22D3EE" },
  admitted: { en: "Admitted", ar: "مقبول", color: "#8b5cf6" },
  discharged: { en: "Discharged", ar: "خروج", color: "#22c55e" },
};

function calcAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
}

export default function EmergencyPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [visits, setVisits] = useState<EmergencyVisit[] | null>(null);
  const [triages, setTriages] = useState<EmergencyTriage[]>([]);
  const [observations, setObservations] = useState<EmergencyObservation[]>([]);
  const [tracking, setTracking] = useState<EmergencyTracking[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterESI, setFilterESI] = useState<ESILevel | "all">("all");
  const [filterStatus, setFilterStatus] = useState<VisitStatus | "all">("all");
  const [selectedVisit, setSelectedVisit] = useState<EmergencyVisit | null>(null);
  const [busy, setBusy] = useState(false);
  const dir = lang === "ar" ? "rtl" : "ltr";

  // Register-arrival form
  const [showRegister, setShowRegister] = useState(false);
  const [regPatientId, setRegPatientId] = useState("");
  const [regComplaint, setRegComplaint] = useState("");
  const [regArrivalMode, setRegArrivalMode] = useState("walk_in");

  // Vitals/triage form (per selected visit)
  const [vitalsForm, setVitalsForm] = useState({ systolic_bp: "", diastolic_bp: "", heart_rate: "", resp_rate: "", temp_c: "", o2_sat: "" });
  const [triageEsi, setTriageEsi] = useState<ESILevel>(3);
  const [showVitalsForm, setShowVitalsForm] = useState(false);

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [visitPage, triagePage, obsPage, trackingPage, patientPage] = await Promise.all([
        apiFetch<Paginated<EmergencyVisit>>("/api/v1/hospital/emergency/visits/", opts),
        apiFetch<Paginated<EmergencyTriage>>("/api/v1/hospital/emergency/triage/", opts),
        apiFetch<Paginated<EmergencyObservation>>("/api/v1/hospital/emergency/observations/", opts),
        apiFetch<Paginated<EmergencyTracking>>("/api/v1/hospital/emergency/tracking/", opts),
        apiFetch<Paginated<Patient>>("/api/v1/patients/", opts),
      ]);
      setVisits(visitPage.results);
      setTriages(triagePage.results);
      setObservations(obsPage.results);
      setTracking(trackingPage.results);
      setPatients(patientPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load emergency department data."));
    }
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function registerArrival() {
    if (!session || !regPatientId || !regComplaint) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/emergency/visits/register/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ patient_id: regPatientId, chief_complaint: regComplaint, arrival_mode: regArrivalMode }),
      });
      setRegPatientId(""); setRegComplaint(""); setRegArrivalMode("walk_in"); setShowRegister(false);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to register arrival."));
    } finally {
      setBusy(false);
    }
  }

  async function logVitals(visitId: string) {
    if (!session) return;
    const v = vitalsForm;
    if (!v.systolic_bp || !v.heart_rate || !v.resp_rate || !v.o2_sat) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/emergency/observations/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          visit: visitId,
          systolic_bp: Number(v.systolic_bp),
          diastolic_bp: Number(v.diastolic_bp || 0),
          heart_rate: Number(v.heart_rate),
          resp_rate: Number(v.resp_rate),
          temp_c: v.temp_c || "37.0",
          o2_sat: Number(v.o2_sat),
        }),
      });
      setVitalsForm({ systolic_bp: "", diastolic_bp: "", heart_rate: "", resp_rate: "", temp_c: "", o2_sat: "" });
      setShowVitalsForm(false);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to log vitals."));
    } finally {
      setBusy(false);
    }
  }

  async function triagePatient(visitId: string) {
    if (!session) return;
    setBusy(true);
    const v = vitalsForm;
    try {
      await apiFetch(`/api/v1/hospital/emergency/visits/${visitId}/triage/`, {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          esi_level: triageEsi,
          resp_rate: v.resp_rate ? Number(v.resp_rate) : undefined,
          o2_sat: v.o2_sat ? Number(v.o2_sat) : undefined,
          systolic_bp: v.systolic_bp ? Number(v.systolic_bp) : undefined,
          triaged_by: session.userId,
        }),
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to triage patient."));
    } finally {
      setBusy(false);
    }
  }

  async function dischargePatient(visitId: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/hospital/emergency/visits/${visitId}/disposition/`, {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ disposition_code: "discharged", disposition_notes: "", assigned_by: session.userId }),
      });
      setSelectedVisit(null);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to discharge patient."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div style={{ padding: "2rem", textAlign: "center", marginTop: "4rem" }}><h1 style={{ fontWeight: 700, fontSize: "1.25rem" }}>Sign in required</h1></div>;
  }
  if (fetchError) {
    return <div role="alert" style={{ padding: "2rem", textAlign: "center", marginTop: "4rem" }}><h1 style={{ fontWeight: 700, fontSize: "1.25rem", color: "#ef4444" }}>Unable to load emergency department data</h1><p style={{ color: "var(--color-text-muted)" }}>{fetchError}</p></div>;
  }
  if (visits === null) {
    return <div style={{ padding: "2rem", textAlign: "center", marginTop: "4rem", color: "var(--color-text-muted)" }}>Loading live ED data...</div>;
  }

  const activeVisits = visits.filter(v => v.status !== "discharged");
  const patientFor = (id: string) => patients.find(p => p.id === id);
  const triageFor = (visitId: string) => triages.find(t => t.visit === visitId);
  const latestObsFor = (visitId: string) => observations.filter(o => o.visit === visitId).sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0];
  const locationFor = (visitId: string) => tracking.filter(t => t.visit === visitId && !t.left_at)[0]?.location_label;
  const waitMinutes = (arrivalTime: string) => Math.round((Date.now() - new Date(arrivalTime).getTime()) / (1000 * 60));

  const esiCounts: Record<ESILevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const v of activeVisits) {
    const esi = triageFor(v.id)?.esi_level;
    if (esi) esiCounts[esi]++;
  }
  const avgWait = activeVisits.length ? Math.round(activeVisits.reduce((s, v) => s + waitMinutes(v.arrival_time), 0) / activeVisits.length) : 0;

  let filtered = activeVisits;
  if (filterESI !== "all") filtered = filtered.filter(v => triageFor(v.id)?.esi_level === filterESI);
  if (filterStatus !== "all") filtered = filtered.filter(v => v.status === filterStatus);

  return (
    <div dir={dir} className="mx-auto max-w-[1400px]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Siren size={22} /> {lang === "en" ? "Emergency Department" : "قسم الطوارئ"}</h1>
          <p className="mt-1 text-sm text-ink/50">{lang === "en" ? "Live patient census, triage, and disposition tracking" : "جرد المرضى الفوري والفرز وتتبع الوجهة"}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowRegister(v => !v)} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm">
            {lang === "en" ? "+ Register Arrival" : "+ تسجيل وصول"}
          </button>
          <button onClick={() => setLang(l => l === "en" ? "ar" : "en")} className="rounded-lg border border-ink/10 bg-surface-overlay px-4 py-2 text-sm font-medium hover:bg-ink/5">
            {lang === "en" ? "العربية" : "English"}
          </button>
        </div>
      </header>

      {showRegister && (
        <div className="cy-card mb-6 p-5">
          <h3 className="mb-3 font-heading font-bold text-brand-400">{lang === "en" ? "Register New Arrival" : "تسجيل وصول جديد"}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-ink/50">{lang === "en" ? "Patient" : "المريض"}</label>
              <select value={regPatientId} onChange={e => setRegPatientId(e.target.value)} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm">
                <option value="">{lang === "en" ? "Select patient…" : "اختر مريض..."}</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.mrn})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/50">{lang === "en" ? "Arrival mode" : "طريقة الوصول"}</label>
              <select value={regArrivalMode} onChange={e => setRegArrivalMode(e.target.value)} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm">
                <option value="walk_in">Walk-in</option>
                <option value="ambulance">Ambulance</option>
                <option value="police">Police</option>
                <option value="flight">Flight</option>
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs text-ink/50">{lang === "en" ? "Chief complaint" : "الشكوى الرئيسية"}</label>
              <input value={regComplaint} onChange={e => setRegComplaint(e.target.value)} placeholder="e.g. Chest pain" className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={registerArrival} disabled={busy || !regPatientId || !regComplaint} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm disabled:opacity-50">
              {busy ? "…" : lang === "en" ? "Register" : "تسجيل"}
            </button>
            <button onClick={() => setShowRegister(false)} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">{lang === "en" ? "Cancel" : "إلغاء"}</button>
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: lang === "en" ? "Active Patients" : "مرضى نشطون", value: activeVisits.length, color: "#22D3EE" },
          { label: lang === "en" ? "Triage" : "الفرز", value: activeVisits.filter(v => v.status === "triage").length, color: "#f59e0b" },
          { label: lang === "en" ? "Resuscitation" : "إنعاش", value: activeVisits.filter(v => v.status === "resuscitation").length, color: "#ef4444" },
          { label: lang === "en" ? "Avg Wait (min)" : "متوسط الانتظار", value: avgWait, color: "#6366f1" },
        ].map(card => (
          <div key={card.label} className="rounded-xl border p-4 text-center" style={{ background: "var(--color-surface)", borderColor: `${card.color}44` }}>
            <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
            <div className="mt-1 text-xs text-ink/50">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-xl border border-ink/10 bg-surface-raised p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink/50">{lang === "en" ? "ESI Triage Level Distribution" : "توزيع مستويات الفرز"}</h3>
        <div className="flex flex-wrap gap-3">
          {([1, 2, 3, 4, 5] as ESILevel[]).map(level => {
            const esi = ESI_COLORS[level];
            return (
              <div key={level} className="min-w-[110px] rounded-lg border-2 p-3 text-center" style={{ background: esi.bg, borderColor: esi.border }}>
                <div className="text-xl font-bold" style={{ color: esi.text }}>{esiCounts[level]}</div>
                <div className="mt-0.5 text-xs font-semibold opacity-85" style={{ color: esi.text }}>{lang === "en" ? esi.label : `مستوى ${level}`}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs font-semibold text-ink/50">ESI:</span>
          {(["all", 1, 2, 3, 4, 5] as (ESILevel | "all")[]).map(e => (
            <button key={e} onClick={() => setFilterESI(e)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filterESI === e ? "border-2 border-brand-400 bg-brand-500/15 text-brand-200" : "border border-ink/10 bg-surface-overlay text-ink/50"}`}>
              {e === "all" ? (lang === "en" ? "All" : "الكل") : `ESI ${e}`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs font-semibold text-ink/50">{lang === "en" ? "Status:" : "الحالة:"}</span>
          {(["all", "triage", "resuscitation", "observation", "admitted"] as (VisitStatus | "all")[]).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filterStatus === s ? "border-2 border-brand-400 bg-brand-500/15 text-brand-200" : "border border-ink/10 bg-surface-overlay text-ink/50"}`}>
              {s === "all" ? (lang === "en" ? "All" : "الكل") : STATUS_LABELS[s].en}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/5">
                {["ESI", lang === "en" ? "Patient" : "المريض", lang === "en" ? "Age/Sex" : "العمر/الجنس", lang === "en" ? "Complaint" : "الشكوى", lang === "en" ? "Wait" : "الانتظار", lang === "en" ? "Status" : "الحالة", lang === "en" ? "Location" : "الموقع", lang === "en" ? "Vitals" : "العلامات"].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-ink/50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-ink/50">No active ED patients for this filter.</td></tr>
              )}
              {filtered.map(v => {
                const patient = patientFor(v.patient);
                const triage = triageFor(v.id);
                const obs = latestObsFor(v.id);
                const stl = STATUS_LABELS[v.status];
                const wait = waitMinutes(v.arrival_time);
                return (
                  <tr key={v.id} onClick={() => { setSelectedVisit(selectedVisit?.id === v.id ? null : v); setShowVitalsForm(false); }} className={`cursor-pointer border-b border-ink/5 ${selectedVisit?.id === v.id ? "bg-brand-500/10" : ""}`}>
                    <td className="px-4 py-3">
                      {triage ? (
                        <div className="inline-block min-w-[44px] rounded-md border-2 px-2 py-0.5 text-center" style={{ background: ESI_COLORS[triage.esi_level].bg, borderColor: ESI_COLORS[triage.esi_level].border }}>
                          <span className="text-xs font-bold" style={{ color: ESI_COLORS[triage.esi_level].text }}>ESI {triage.esi_level}</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{patient ? `${patient.first_name} ${patient.last_name}` : "Unknown"}</div>
                      <div className="text-xs text-ink/50">{patient?.mrn}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink/60">{patient ? `${calcAge(patient.dob)}y ${patient.gender[0]?.toUpperCase()}` : "—"}</td>
                    <td className="max-w-[220px] px-4 py-3 text-xs text-ink/60">{v.presenting_complaint}</td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: wait > 120 ? "#ef4444" : wait > 60 ? "#f59e0b" : "#22c55e" }}>{wait}m</td>
                    <td className="px-4 py-3">
                      <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `${stl.color}22`, color: stl.color }}>{lang === "en" ? stl.en : stl.ar}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-brand-300">{locationFor(v.id) ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-ink/50">
                      {obs ? (
                        <div>
                          <div>BP: {obs.systolic_bp}/{obs.diastolic_bp}</div>
                          <div>HR: {obs.heart_rate}</div>
                          <div style={{ color: obs.o2_sat < 94 ? "#ef4444" : undefined }}>SpO2: {obs.o2_sat}%</div>
                        </div>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedVisit && (() => {
        const patient = patientFor(selectedVisit.patient);
        const triage = triageFor(selectedVisit.id);
        const obs = latestObsFor(selectedVisit.id);
        return (
          <div className="mt-6 rounded-xl border-2 bg-surface-raised p-6" style={{ borderColor: triage ? ESI_COLORS[triage.esi_level].border : "var(--color-border)" }}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{patient ? `${patient.first_name} ${patient.last_name} — ${patient.mrn}` : "Unknown patient"}</h2>
                <p className="mt-1 text-sm text-ink/50">{selectedVisit.presenting_complaint}</p>
              </div>
              <button onClick={() => setSelectedVisit(null)} aria-label={lang === "en" ? "Close" : "إغلاق"} className="text-2xl leading-none text-ink/50 hover:text-ink">×</button>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {obs && [
                { label: "BP", value: `${obs.systolic_bp}/${obs.diastolic_bp}` },
                { label: "HR", value: `${obs.heart_rate} bpm` },
                { label: "SpO2", value: `${obs.o2_sat}%` },
                { label: "Temp", value: `${obs.temp_c}°C` },
              ].map(item => (
                <div key={item.label} className="rounded-lg bg-ink/5 p-3">
                  <div className="text-xs text-ink/50">{item.label}</div>
                  <div className="text-base font-semibold">{item.value}</div>
                </div>
              ))}
            </div>

            {showVitalsForm ? (
              <div className="mt-4 rounded-lg border border-ink/10 p-4">
                <h3 className="mb-3 text-sm font-semibold text-brand-300">{lang === "en" ? "Log Vitals" : "تسجيل العلامات"}</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                  {([
                    ["systolic_bp", "SBP"], ["diastolic_bp", "DBP"], ["heart_rate", "HR"],
                    ["resp_rate", "RR"], ["temp_c", "Temp °C"], ["o2_sat", "SpO2 %"],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs text-ink/50">{label}</label>
                      <input
                        value={vitalsForm[key]}
                        onChange={e => setVitalsForm(f => ({ ...f, [key]: e.target.value }))}
                        type="number"
                        className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button onClick={() => logVitals(selectedVisit.id)} disabled={busy} className="cy-btn cy-btn-primary !min-h-0 !py-1.5 !px-3 text-xs disabled:opacity-50">
                    {lang === "en" ? "Save Vitals" : "حفظ العلامات"}
                  </button>
                  <label className="flex items-center gap-2 text-xs text-ink/60">
                    ESI
                    <select value={triageEsi} onChange={e => setTriageEsi(Number(e.target.value) as ESILevel)} className="rounded-md border border-ink/10 bg-surface px-2 py-1 text-xs">
                      {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <button onClick={() => triagePatient(selectedVisit.id)} disabled={busy} className="cy-btn cy-btn-ghost !min-h-0 !py-1.5 !px-3 text-xs disabled:opacity-50">
                    {lang === "en" ? "Submit Triage" : "إرسال الفرز"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={() => setShowVitalsForm(true)} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm">
                  {lang === "en" ? "Log Vitals / Triage" : "تسجيل علامات / فرز"}
                </button>
                <a href="/hospital/adt" className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">{lang === "en" ? "Admit to Ward" : "قبول في الجناح"}</a>
                <a href="/hospital/beds" className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">{lang === "en" ? "Find Bed" : "البحث عن سرير"}</a>
                <button onClick={() => dischargePatient(selectedVisit.id)} disabled={busy} className="rounded-lg border border-emerald-500/40 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">
                  {lang === "en" ? "Discharge" : "خروج"}
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
