"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Baby } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface Pregnancy {
  id: string;
  patient: string;
  estimated_delivery_date: string;
  gravidity: number;
  parity: number;
  status: "active" | "completed";
}
interface Patient { id: string; first_name: string; last_name: string; mrn: string; }
interface PrenatalEncounter {
  id: string;
  pregnancy: string;
  encounter_date: string;
  gestational_weeks: string;
  fetal_heart_rate: number | null;
  maternal_bp_sys: number;
  maternal_bp_dia: number;
  notes: string;
}
interface LaborEpisode {
  id: string;
  pregnancy: string;
  admitted_at: string;
  stage_of_labor: number;
  cervical_dilation_cm: string;
  contractions_frequency_mins: number | null;
  fetal_monitoring_status: string;
}
interface Delivery {
  id: string;
  labor_episode: string;
  delivery_time: string;
  delivery_method: string;
  apgar_1m: number;
  apgar_5m: number;
  outcome: string;
}
interface NewbornRecord {
  id: string;
  delivery: string;
  gender: string;
  weight_grams: number;
  height_cm: string;
  head_circumference_cm: string;
}
interface PostpartumCare {
  id: string;
  pregnancy: string;
  checked_at: string;
  maternal_condition: string;
  baby_condition: string;
}
interface Paginated<T> { count: number; results: T[]; }

const STAGE_LABELS: Record<number, string> = { 1: "Stage 1 (Early)", 2: "Stage 2 (Pushing)", 3: "Stage 3 (Placenta)", 4: "Stage 4 (Recovery)" };

export default function MaternityPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [pregnancies, setPregnancies] = useState<Pregnancy[] | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [prenatalEncounters, setPrenatalEncounters] = useState<PrenatalEncounter[]>([]);
  const [laborEpisodes, setLaborEpisodes] = useState<LaborEpisode[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [newborns, setNewborns] = useState<NewbornRecord[]>([]);
  const [postpartumChecks, setPostpartumChecks] = useState<PostpartumCare[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedPregnancy, setExpandedPregnancy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAr = lang === "ar";

  const [prenatalForm, setPrenatalForm] = useState({ gestational_weeks: "", fetal_heart_rate: "", maternal_bp_sys: "", maternal_bp_dia: "", notes: "" });
  const [laborForm, setLaborForm] = useState({ stage_of_labor: "1", cervical_dilation_cm: "0.0", contractions_frequency_mins: "", fetal_monitoring_status: "normal" });
  const [postpartumForm, setPostpartumForm] = useState({ maternal_condition: "", baby_condition: "" });
  const [activeForm, setActiveForm] = useState<"prenatal" | "labor" | "postpartum" | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [pregPage, patientPage, prenatalPage, laborPage, deliveryPage, newbornPage, postpartumPage] = await Promise.all([
        apiFetch<Paginated<Pregnancy>>("/api/v1/hospital/maternity/pregnancies/", opts),
        apiFetch<Paginated<Patient>>("/api/v1/patients/", opts),
        apiFetch<Paginated<PrenatalEncounter>>("/api/v1/hospital/maternity/prenatal-encounters/", opts),
        apiFetch<Paginated<LaborEpisode>>("/api/v1/hospital/maternity/labor-episodes/", opts),
        apiFetch<Paginated<Delivery>>("/api/v1/hospital/maternity/deliveries/", opts),
        apiFetch<Paginated<NewbornRecord>>("/api/v1/hospital/maternity/newborns/", opts),
        apiFetch<Paginated<PostpartumCare>>("/api/v1/hospital/maternity/postpartum-checks/", opts),
      ]);
      setPregnancies(pregPage.results);
      setPatients(patientPage.results);
      setPrenatalEncounters(prenatalPage.results);
      setLaborEpisodes(laborPage.results);
      setDeliveries(deliveryPage.results);
      setNewborns(newbornPage.results);
      setPostpartumChecks(postpartumPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load maternity data."));
    }
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function submitPrenatal(pregnancyId: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/maternity/prenatal-encounters/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          pregnancy: pregnancyId,
          gestational_weeks: prenatalForm.gestational_weeks || "0.0",
          fetal_heart_rate: prenatalForm.fetal_heart_rate ? Number(prenatalForm.fetal_heart_rate) : null,
          maternal_bp_sys: Number(prenatalForm.maternal_bp_sys || 110),
          maternal_bp_dia: Number(prenatalForm.maternal_bp_dia || 70),
          notes: prenatalForm.notes,
        }),
      });
      setPrenatalForm({ gestational_weeks: "", fetal_heart_rate: "", maternal_bp_sys: "", maternal_bp_dia: "", notes: "" });
      setActiveForm(null);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to log prenatal encounter."));
    } finally {
      setBusy(false);
    }
  }

  async function submitLabor(pregnancyId: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/maternity/labor-episodes/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          pregnancy: pregnancyId,
          stage_of_labor: Number(laborForm.stage_of_labor),
          cervical_dilation_cm: laborForm.cervical_dilation_cm || "0.0",
          contractions_frequency_mins: laborForm.contractions_frequency_mins ? Number(laborForm.contractions_frequency_mins) : null,
          fetal_monitoring_status: laborForm.fetal_monitoring_status,
        }),
      });
      setLaborForm({ stage_of_labor: "1", cervical_dilation_cm: "0.0", contractions_frequency_mins: "", fetal_monitoring_status: "normal" });
      setActiveForm(null);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to admit to labor."));
    } finally {
      setBusy(false);
    }
  }

  async function submitPostpartum(pregnancyId: string) {
    if (!session || !postpartumForm.maternal_condition || !postpartumForm.baby_condition) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/maternity/postpartum-checks/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          pregnancy: pregnancyId,
          checked_by: session.userId,
          maternal_condition: postpartumForm.maternal_condition,
          baby_condition: postpartumForm.baby_condition,
        }),
      });
      setPostpartumForm({ maternal_condition: "", baby_condition: "" });
      setActiveForm(null);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to log postpartum check."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return <div role="alert" className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold text-red-400">Unable to load maternity data</h1><p className="mt-1 text-sm text-ink/50">{fetchError}</p></div>;
  }
  if (pregnancies === null) {
    return <div className="mx-auto mt-16 max-w-lg text-center text-sm text-ink/40">Loading maternity data...</div>;
  }

  const activePregnancies = pregnancies.filter(p => p.status === "active");
  const patientFor = (patientId: string): Patient | undefined => patients.find(p => p.id === patientId);
  const prenatalFor = (pregnancyId: string) => prenatalEncounters.filter(e => e.pregnancy === pregnancyId).sort((a, b) => b.encounter_date.localeCompare(a.encounter_date));
  const laborFor = (pregnancyId: string) => laborEpisodes.find(l => l.pregnancy === pregnancyId);
  const deliveryFor = (laborId: string | undefined) => laborId ? deliveries.find(d => d.labor_episode === laborId) : undefined;
  const newbornsFor = (deliveryId: string | undefined) => deliveryId ? newborns.filter(n => n.delivery === deliveryId) : [];
  const postpartumFor = (pregnancyId: string) => postpartumChecks.filter(c => c.pregnancy === pregnancyId).sort((a, b) => b.checked_at.localeCompare(a.checked_at))[0];

  const inLabor = activePregnancies.filter(p => laborFor(p.id) && !deliveryFor(laborFor(p.id)?.id)).length;
  const deliveredToday = deliveries.filter(d => new Date(d.delivery_time).toDateString() === new Date().toDateString()).length;
  const totalNewborns = newborns.length;

  return (
    <div className="mx-auto max-w-5xl" style={{ direction: isAr ? "rtl" : "ltr" }}>
      <header className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Baby size={22} /> {isAr ? "قسم الولادة" : "Maternity Department"}</h1>
          <p className="mt-1 text-sm text-ink/50">{activePregnancies.length} {isAr ? "حالة حمل نشطة" : "active pregnancies"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="rounded-lg border border-ink/10 bg-surface-overlay px-4 py-2 text-sm font-medium hover:bg-ink/5">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: isAr ? "حالات حمل نشطة" : "Active Pregnancies", value: activePregnancies.length, color: "#f472b6" },
          { label: isAr ? "في المخاض" : "In Labor", value: inLabor, color: "#f59e0b" },
          { label: isAr ? "ولادات اليوم" : "Deliveries Today", value: deliveredToday, color: "#22c55e" },
          { label: isAr ? "إجمالي المواليد" : "Total Newborns", value: totalNewborns, color: "#22D3EE" },
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
                {[isAr ? "المريضة" : "Patient", isAr ? "الحمل" : "EDD", "G/P", isAr ? "آخر فحص" : "Last Prenatal", isAr ? "المخاض" : "Labor", isAr ? "الولادة" : "Delivery", isAr ? "المواليد" : "Newborns", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-ink/50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activePregnancies.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-ink/50">No active pregnancies.</td></tr>
              )}
              {activePregnancies.map(preg => {
                const patient = patientFor(preg.patient);
                const latestPrenatal = prenatalFor(preg.id)[0];
                const labor = laborFor(preg.id);
                const delivery = deliveryFor(labor?.id);
                const babies = newbornsFor(delivery?.id);
                const postpartum = postpartumFor(preg.id);
                const expanded = expandedPregnancy === preg.id;
                return (
                  <Fragment key={preg.id}>
                    <tr className="border-b border-ink/5">
                      <td className="px-4 py-3 font-medium">
                        {patient ? `${patient.first_name} ${patient.last_name} (${patient.mrn})` : "Unknown patient"}
                      </td>
                      <td className="px-4 py-3 text-ink/60">{preg.estimated_delivery_date}</td>
                      <td className="px-4 py-3 text-ink/60">{preg.gravidity}/{preg.parity}</td>
                      <td className="px-4 py-3">
                        {latestPrenatal ? (
                          <span>{latestPrenatal.gestational_weeks}w, FHR {latestPrenatal.fetal_heart_rate ?? "—"}</span>
                        ) : <span className="text-ink/30">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {labor ? (
                          <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                            {STAGE_LABELS[labor.stage_of_labor] ?? `Stage ${labor.stage_of_labor}`}
                          </span>
                        ) : <span className="text-ink/30">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {delivery ? (
                          <span className="font-semibold text-green-400 capitalize">{delivery.delivery_method}</span>
                        ) : <span className="text-ink/30">—</span>}
                      </td>
                      <td className="px-4 py-3 text-ink/60">{babies.length || "—"}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setExpandedPregnancy(expanded ? null : preg.id); setActiveForm(null); }}
                          className="rounded-md border border-brand-400/40 px-2 py-1 text-xs font-semibold text-brand-300 hover:bg-brand-500/10"
                        >
                          {expanded ? (isAr ? "إغلاق" : "Close") : (isAr ? "تسجيل" : "Log")}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={8} className="bg-ink/[0.02] px-4 py-4">
                          {postpartum && (
                            <div className="mb-3 flex gap-4 rounded-lg border border-green-400/30 bg-green-500/5 px-3 py-2 text-xs">
                              <span className="font-semibold text-green-300">{isAr ? "آخر فحص نفاسي" : "Latest Postpartum Check"}</span>
                              <span>{isAr ? "الأم:" : "Mother:"} <strong>{postpartum.maternal_condition}</strong></span>
                              <span>{isAr ? "الطفل:" : "Baby:"} <strong>{postpartum.baby_condition}</strong></span>
                            </div>
                          )}
                          <div className="mb-3 flex flex-wrap gap-2">
                            <button onClick={() => setActiveForm("prenatal")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${activeForm === "prenatal" ? "bg-brand-500/15 text-brand-300 border border-brand-400/40" : "border border-ink/10 text-ink/50"}`}>
                              {isAr ? "فحص ما قبل الولادة" : "Log Prenatal Encounter"}
                            </button>
                            {!labor && (
                              <button onClick={() => setActiveForm("labor")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${activeForm === "labor" ? "bg-amber-500/15 text-amber-300 border border-amber-400/40" : "border border-ink/10 text-ink/50"}`}>
                                {isAr ? "دخول المخاض" : "Admit to Labor"}
                              </button>
                            )}
                            {delivery && (
                              <button onClick={() => setActiveForm("postpartum")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${activeForm === "postpartum" ? "bg-green-500/15 text-green-300 border border-green-400/40" : "border border-ink/10 text-ink/50"}`}>
                                {isAr ? "فحص نفاسي" : "Log Postpartum Check"}
                              </button>
                            )}
                          </div>
                          {activeForm === "prenatal" && (
                            <div>
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                                {([
                                  ["gestational_weeks", "Gestational Weeks"], ["fetal_heart_rate", "FHR"],
                                  ["maternal_bp_sys", "BP Sys"], ["maternal_bp_dia", "BP Dia"],
                                ] as const).map(([key, label]) => (
                                  <div key={key}>
                                    <label className="mb-1 block text-xs text-ink/50">{label}</label>
                                    <input type="number" value={prenatalForm[key]} onChange={e => setPrenatalForm(f => ({ ...f, [key]: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                                  </div>
                                ))}
                                <div>
                                  <label className="mb-1 block text-xs text-ink/50">Notes</label>
                                  <input value={prenatalForm.notes} onChange={e => setPrenatalForm(f => ({ ...f, notes: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                                </div>
                              </div>
                              <button disabled={busy} onClick={() => submitPrenatal(preg.id)} className="cy-btn cy-btn-primary !min-h-0 mt-3 !py-1.5 !px-3 text-xs disabled:opacity-50">
                                {isAr ? "حفظ الفحص" : "Save Encounter"}
                              </button>
                            </div>
                          )}
                          {activeForm === "labor" && (
                            <div>
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <div>
                                  <label className="mb-1 block text-xs text-ink/50">Stage</label>
                                  <select value={laborForm.stage_of_labor} onChange={e => setLaborForm(f => ({ ...f, stage_of_labor: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm">
                                    <option value="1">1 — Early</option>
                                    <option value="2">2 — Pushing</option>
                                    <option value="3">3 — Placenta</option>
                                    <option value="4">4 — Recovery</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs text-ink/50">Cervical Dilation (cm)</label>
                                  <input type="number" step="0.5" value={laborForm.cervical_dilation_cm} onChange={e => setLaborForm(f => ({ ...f, cervical_dilation_cm: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs text-ink/50">Contractions (min apart)</label>
                                  <input type="number" value={laborForm.contractions_frequency_mins} onChange={e => setLaborForm(f => ({ ...f, contractions_frequency_mins: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs text-ink/50">Fetal Monitoring</label>
                                  <select value={laborForm.fetal_monitoring_status} onChange={e => setLaborForm(f => ({ ...f, fetal_monitoring_status: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm">
                                    <option value="normal">Normal</option>
                                    <option value="variable_decelerations">Variable Decelerations</option>
                                    <option value="late_decelerations">Late Decelerations</option>
                                    <option value="bradycardia">Bradycardia</option>
                                  </select>
                                </div>
                              </div>
                              <button disabled={busy} onClick={() => submitLabor(preg.id)} className="cy-btn cy-btn-primary !min-h-0 mt-3 !py-1.5 !px-3 text-xs disabled:opacity-50">
                                {isAr ? "حفظ" : "Admit to Labor"}
                              </button>
                            </div>
                          )}
                          {activeForm === "postpartum" && (
                            <div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                  <label className="mb-1 block text-xs text-ink/50">Maternal Condition</label>
                                  <input value={postpartumForm.maternal_condition} onChange={e => setPostpartumForm(f => ({ ...f, maternal_condition: e.target.value }))} placeholder="e.g. Stable" className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs text-ink/50">Baby Condition</label>
                                  <input value={postpartumForm.baby_condition} onChange={e => setPostpartumForm(f => ({ ...f, baby_condition: e.target.value }))} placeholder="e.g. Healthy" className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                                </div>
                              </div>
                              <button disabled={busy || !postpartumForm.maternal_condition || !postpartumForm.baby_condition} onClick={() => submitPostpartum(preg.id)} className="cy-btn cy-btn-primary !min-h-0 mt-3 !py-1.5 !px-3 text-xs disabled:opacity-40">
                                {isAr ? "حفظ الفحص" : "Save Check"}
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
