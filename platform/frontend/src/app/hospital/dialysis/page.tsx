"use client";

import { useState, useEffect, useCallback } from "react";
import { Waves } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface DialysisOrder {
  id: string;
  patient_id: string;
  modality: "hemodialysis" | "peritoneal_dialysis";
  diagnosis: string;
  status: string;
  ordered_at: string;
}
interface VascularAccess {
  id: string;
  patient_id: string;
  access_type: string;
  site: string;
  status: string;
}
interface DialysisCarePlan {
  id: string;
  order: string;
  vascular_access: string;
  frequency_per_week: number;
  session_duration_hours: string;
  dry_weight_kg: string;
  status: string;
}
interface DialysisMachine { id: string; asset_tag: string; status: string; }
interface DialysisComplication {
  id: string;
  session: string;
  complication_type: string;
  severity: string;
  action_taken: string;
}
interface DialysisSession {
  id: string;
  plan: string;
  machine: string | null;
  session_date: string;
  pre_weight_kg: string;
  post_weight_kg: string | null;
  pre_bp_sys: number;
  pre_bp_dia: number;
}
interface Paginated<T> { count: number; results: T[]; }

const MODALITY_LABELS: Record<string, string> = { hemodialysis: "Hemodialysis", peritoneal_dialysis: "Peritoneal Dialysis" };

export default function DialysisPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [orders, setOrders] = useState<DialysisOrder[] | null>(null);
  const [vascularAccesses, setVascularAccesses] = useState<VascularAccess[]>([]);
  const [carePlans, setCarePlans] = useState<DialysisCarePlan[]>([]);
  const [machines, setMachines] = useState<DialysisMachine[]>([]);
  const [sessions, setSessions] = useState<DialysisSession[]>([]);
  const [complications, setComplications] = useState<DialysisComplication[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAr = lang === "ar";

  const [sessionForm, setSessionForm] = useState({ machine: "", pre_weight_kg: "", pre_bp_sys: "", pre_bp_dia: "", blood_flow_rate_ml_min: "" });
  const [complicationForm, setComplicationForm] = useState({ complication_type: "hypotension", severity: "mild", action_taken: "" });
  const [activeForm, setActiveForm] = useState<"session" | "complication" | null>(null);
  const [complicationForSession, setComplicationForSession] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [orderPage, accessPage, planPage, machinePage, sessionPage, complicationPage] = await Promise.all([
        apiFetch<Paginated<DialysisOrder>>("/api/v1/hospital/dialysis/orders/", opts),
        apiFetch<Paginated<VascularAccess>>("/api/v1/hospital/dialysis/vascular-access/", opts),
        apiFetch<Paginated<DialysisCarePlan>>("/api/v1/hospital/dialysis/care-plans/", opts),
        apiFetch<Paginated<DialysisMachine>>("/api/v1/hospital/dialysis/machines/", opts),
        apiFetch<Paginated<DialysisSession>>("/api/v1/hospital/dialysis/sessions/", opts),
        apiFetch<Paginated<DialysisComplication>>("/api/v1/hospital/dialysis/complications/", opts),
      ]);
      setOrders(orderPage.results);
      setVascularAccesses(accessPage.results);
      setCarePlans(planPage.results);
      setMachines(machinePage.results);
      setSessions(sessionPage.results);
      setComplications(complicationPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load dialysis data."));
    }
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function submitSession(planId: string) {
    if (!session || !sessionForm.pre_weight_kg || !sessionForm.pre_bp_sys || !sessionForm.pre_bp_dia) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/dialysis/sessions/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          plan: planId,
          machine: sessionForm.machine || null,
          technician_id: session.userId,
          session_date: new Date().toISOString().slice(0, 10),
          start_time: new Date().toISOString(),
          pre_weight_kg: sessionForm.pre_weight_kg,
          pre_bp_sys: Number(sessionForm.pre_bp_sys),
          pre_bp_dia: Number(sessionForm.pre_bp_dia),
          blood_flow_rate_ml_min: sessionForm.blood_flow_rate_ml_min ? Number(sessionForm.blood_flow_rate_ml_min) : null,
        }),
      });
      setSessionForm({ machine: "", pre_weight_kg: "", pre_bp_sys: "", pre_bp_dia: "", blood_flow_rate_ml_min: "" });
      setActiveForm(null);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to log dialysis session."));
    } finally {
      setBusy(false);
    }
  }

  async function submitComplication(sessionId: string) {
    if (!session || !complicationForm.action_taken) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/dialysis/complications/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          session: sessionId,
          complication_type: complicationForm.complication_type,
          severity: complicationForm.severity,
          action_taken: complicationForm.action_taken,
          reported_by_id: session.userId,
        }),
      });
      setComplicationForm({ complication_type: "hypotension", severity: "mild", action_taken: "" });
      setComplicationForSession(null);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to log complication."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return <div role="alert" className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold text-red-400">Unable to load dialysis data</h1><p className="mt-1 text-sm text-ink/50">{fetchError}</p></div>;
  }
  if (orders === null) {
    return <div className="mx-auto mt-16 max-w-lg text-center text-sm text-ink/40">Loading dialysis data...</div>;
  }

  const activeOrders = orders.filter(o => o.status === "active");
  const planFor = (orderId: string) => carePlans.find(p => p.order === orderId);
  const accessFor = (accessId: string) => vascularAccesses.find(a => a.id === accessId);
  const sessionsFor = (planId: string) => sessions.filter(s => s.plan === planId).sort((a, b) => b.session_date.localeCompare(a.session_date));
  const complicationsFor = (sessionId: string) => complications.filter(c => c.session === sessionId);
  const availableMachines = machines.filter(m => m.status === "available");

  const totalActivePatients = activeOrders.length;
  const sessionsToday = sessions.filter(s => s.session_date === new Date().toISOString().slice(0, 10)).length;
  const complicationRate = sessions.length ? Math.round((complications.length / sessions.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl" style={{ direction: isAr ? "rtl" : "ltr" }}>
      <header className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Waves size={22} /> {isAr ? "قسم غسيل الكلى" : "Dialysis Department"}</h1>
          <p className="mt-1 text-sm text-ink/50">{totalActivePatients} {isAr ? "مريض نشط" : "active patients"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="rounded-lg border border-ink/10 bg-surface-overlay px-4 py-2 text-sm font-medium hover:bg-ink/5">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: isAr ? "مرضى نشطون" : "Active Patients", value: totalActivePatients, color: "#22D3EE" },
          { label: isAr ? "جلسات اليوم" : "Sessions Today", value: sessionsToday, color: "#22c55e" },
          { label: isAr ? "أجهزة متاحة" : "Available Machines", value: `${availableMachines.length}/${machines.length}`, color: "#a78bfa" },
          { label: isAr ? "معدل المضاعفات" : "Complication Rate", value: `${complicationRate}%`, color: complicationRate > 15 ? "#ef4444" : "#f59e0b" },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-ink/10 bg-surface-raised p-4">
            <div className="text-2xl font-bold" style={{ color: m.color }}>{m.value}</div>
            <div className="mt-1 text-xs text-ink/50">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {activeOrders.length === 0 && (
          <div className="rounded-xl border border-ink/10 bg-surface-raised p-6 text-center text-sm text-ink/50">
            {isAr ? "لا توجد طلبات غسيل كلى نشطة." : "No active dialysis orders."}
          </div>
        )}
        {activeOrders.map(order => {
          const plan = planFor(order.id);
          const access = plan ? accessFor(plan.vascular_access) : undefined;
          const planSessions = plan ? sessionsFor(plan.id) : [];
          const isExpanded = expanded === order.id;
          return (
            <div key={order.id} className="rounded-xl border border-ink/10 bg-surface-raised p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{MODALITY_LABELS[order.modality] ?? order.modality}</div>
                  <div className="text-xs text-ink/50">{order.diagnosis}</div>
                  {access && (
                    <div className="mt-1 text-xs text-ink/40">
                      {isAr ? "الوصول الوعائي:" : "Access:"} {access.access_type.replace(/_/g, " ")} — {access.site}
                    </div>
                  )}
                </div>
                <button onClick={() => setExpanded(isExpanded ? null : order.id)} className="rounded-md border border-brand-400/40 px-2 py-1 text-xs font-semibold text-brand-300 hover:bg-brand-500/10">
                  {isExpanded ? (isAr ? "إغلاق" : "Close") : (isAr ? "إدارة" : "Manage")}
                </button>
              </div>

              {plan && (
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink/50">
                  <span>{plan.frequency_per_week}x/{isAr ? "أسبوع" : "week"}</span>
                  <span>{plan.session_duration_hours}h/{isAr ? "جلسة" : "session"}</span>
                  <span>{isAr ? "الوزن الجاف:" : "Dry weight:"} {plan.dry_weight_kg}kg</span>
                  <span>{planSessions.length} {isAr ? "جلسة مسجلة" : "session(s) logged"}</span>
                </div>
              )}

              {isExpanded && (
                <div className="mt-4 border-t border-ink/10 pt-4">
                  {!plan ? (
                    <p className="text-xs text-ink/50">
                      {isAr ? "لا توجد خطة رعاية بعد — يجب على الطبيب إنشاء خطة رعاية أولاً." : "No care plan yet — a physician must create one before sessions can be logged."}
                    </p>
                  ) : (
                    <div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <button onClick={() => setActiveForm("session")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${activeForm === "session" ? "bg-brand-500/15 text-brand-300 border border-brand-400/40" : "border border-ink/10 text-ink/50"}`}>
                          {isAr ? "تسجيل جلسة" : "Log Session"}
                        </button>
                      </div>
                      {activeForm === "session" && (
                        <div className="mb-4">
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                            <div>
                              <label className="mb-1 block text-xs text-ink/50">{isAr ? "الجهاز" : "Machine"}</label>
                              <select value={sessionForm.machine} onChange={e => setSessionForm(f => ({ ...f, machine: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm">
                                <option value="">—</option>
                                {availableMachines.map(m => <option key={m.id} value={m.id}>{m.asset_tag}</option>)}
                              </select>
                            </div>
                            {([
                              ["pre_weight_kg", "Pre-Weight (kg)"], ["pre_bp_sys", "Pre BP Sys"],
                              ["pre_bp_dia", "Pre BP Dia"], ["blood_flow_rate_ml_min", "Blood Flow (mL/min)"],
                            ] as const).map(([key, label]) => (
                              <div key={key}>
                                <label className="mb-1 block text-xs text-ink/50">{label}</label>
                                <input type="number" value={sessionForm[key]} onChange={e => setSessionForm(f => ({ ...f, [key]: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                              </div>
                            ))}
                          </div>
                          <button disabled={busy} onClick={() => submitSession(plan.id)} className="cy-btn cy-btn-primary !min-h-0 mt-3 !py-1.5 !px-3 text-xs disabled:opacity-50">
                            {isAr ? "حفظ الجلسة" : "Save Session"}
                          </button>
                        </div>
                      )}

                      <div className="space-y-2">
                        {planSessions.map(s => {
                          const sessionComplications = complicationsFor(s.id);
                          return (
                            <div key={s.id} className="rounded-lg border border-ink/10 bg-ink/[0.02] p-3 text-xs">
                              <div className="flex items-center justify-between">
                                <span>{s.session_date} — {isAr ? "قبل:" : "pre:"} {s.pre_weight_kg}kg, {s.pre_bp_sys}/{s.pre_bp_dia}</span>
                                <button
                                  onClick={() => setComplicationForSession(complicationForSession === s.id ? null : s.id)}
                                  className="rounded border border-red-400/30 px-2 py-0.5 text-[11px] font-semibold text-red-400 hover:bg-red-500/10"
                                >
                                  {isAr ? "+ مضاعفة" : "+ Complication"}
                                </button>
                              </div>
                              {sessionComplications.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {sessionComplications.map(c => (
                                    <div key={c.id} className="text-amber-400">⚠ {c.complication_type.replace(/_/g, " ")} ({c.severity}): {c.action_taken}</div>
                                  ))}
                                </div>
                              )}
                              {complicationForSession === s.id && (
                                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                  <select value={complicationForm.complication_type} onChange={e => setComplicationForm(f => ({ ...f, complication_type: e.target.value }))} className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm">
                                    <option value="hypotension">Hypotension</option>
                                    <option value="cramping">Cramping</option>
                                    <option value="access_clotting">Access Clotting</option>
                                    <option value="access_infection">Access Infection</option>
                                    <option value="bleeding">Bleeding</option>
                                    <option value="chest_pain">Chest Pain</option>
                                    <option value="nausea_vomiting">Nausea/Vomiting</option>
                                    <option value="other">Other</option>
                                  </select>
                                  <select value={complicationForm.severity} onChange={e => setComplicationForm(f => ({ ...f, severity: e.target.value }))} className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm">
                                    <option value="mild">Mild</option>
                                    <option value="moderate">Moderate</option>
                                    <option value="severe">Severe</option>
                                  </select>
                                  <input value={complicationForm.action_taken} onChange={e => setComplicationForm(f => ({ ...f, action_taken: e.target.value }))} placeholder="Action taken" className="rounded-lg border border-ink/10 bg-surface px-2 py-1.5 text-sm" />
                                  <button disabled={busy || !complicationForm.action_taken} onClick={() => submitComplication(s.id)} className="cy-btn cy-btn-primary !min-h-0 !py-1.5 !px-3 text-xs disabled:opacity-40 sm:col-span-3">
                                    {isAr ? "حفظ المضاعفة" : "Save Complication"}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
