"use client";

import { useState, useEffect, useCallback } from "react";
import { HeartHandshake } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface Admission { id: string; encounter: string; status: "admitted" | "discharged"; }
interface Encounter { id: string; patient: string; }
interface Patient { id: string; first_name: string; last_name: string; mrn: string; }
interface NursingTask {
  id: string; admission: string; task_name: string; scheduled_at: string;
  completed_at: string | null; status: "pending" | "completed" | "skipped";
}
interface NursingHandover {
  id: string; admission: string; outgoing_nurse_id: string; incoming_nurse_id: string;
  handover_time: string; situation_background: string; assessment_recommendation: string;
}
interface NursingCarePlan { id: string; admission: string; goals: string; activities: string; }
interface Paginated<T> { count: number; results: T[]; }

function unwrap<T>(data: Paginated<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

type Tab = "tasks" | "handovers" | "careplans";

export default function NursingDashboard() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [tab, setTab] = useState<Tab>("tasks");
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [tasks, setTasks] = useState<NursingTask[] | null>(null);
  const [handovers, setHandovers] = useState<NursingHandover[]>([]);
  const [carePlans, setCarePlans] = useState<NursingCarePlan[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskPatientId, setTaskPatientId] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");

  const [showHandoverForm, setShowHandoverForm] = useState(false);
  const [handoverAdmissionId, setHandoverAdmissionId] = useState("");
  const [handoverIncomingNurse, setHandoverIncomingNurse] = useState("");
  const [handoverSituation, setHandoverSituation] = useState("");
  const [handoverRecommendation, setHandoverRecommendation] = useState("");

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    const opts = { token: session.accessToken, tenantId: session.tenantId };
    try {
      const [admissionData, encounterData, patientData, taskData, handoverData, carePlanData] = await Promise.all([
        apiFetch<Paginated<Admission> | Admission[]>("/api/v1/hospital/adt/admissions/?status=admitted", opts),
        apiFetch<Paginated<Encounter> | Encounter[]>("/api/v1/encounters/", opts),
        apiFetch<Paginated<Patient> | Patient[]>("/api/v1/patients/", opts),
        apiFetch<Paginated<NursingTask> | NursingTask[]>("/api/v1/hospital/nursing/tasks/", opts),
        apiFetch<Paginated<NursingHandover> | NursingHandover[]>("/api/v1/hospital/nursing/handovers/", opts),
        apiFetch<Paginated<NursingCarePlan> | NursingCarePlan[]>("/api/v1/hospital/nursing/careplans/", opts),
      ]);
      setAdmissions(unwrap(admissionData));
      setEncounters(unwrap(encounterData));
      setPatients(unwrap(patientData));
      setTasks(unwrap(taskData));
      setHandovers(unwrap(handoverData));
      setCarePlans(unwrap(carePlanData));
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل بيانات التمريض." : "Failed to load nursing data."));
    }
  }, [session, isAr]);

  useEffect(() => { void loadData(); }, [loadData]);

  const patientForAdmission = useCallback((admissionId: string): Patient | undefined => {
    const adm = admissions.find(a => a.id === admissionId);
    if (!adm) return undefined;
    const enc = encounters.find(e => e.id === adm.encounter);
    if (!enc) return undefined;
    return patients.find(p => p.id === enc.patient);
  }, [admissions, encounters, patients]);

  async function scheduleTask() {
    if (!session || !taskPatientId || !taskName || !taskDueAt) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/nursing/tasks/schedule/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          patient_id: taskPatientId,
          task_type: taskName,
          due_at: new Date(taskDueAt).toISOString(),
          assigned_to: session.userId,
        }),
      });
      setTaskPatientId(""); setTaskName(""); setTaskDueAt(""); setShowTaskForm(false);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل جدولة المهمة." : "Failed to schedule task."));
    } finally {
      setBusy(false);
    }
  }

  async function updateTaskStatus(taskId: string, status: "completed" | "skipped") {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/hospital/nursing/tasks/${taskId}/`, {
        method: "PATCH",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ status, completed_at: new Date().toISOString() }),
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحديث المهمة." : "Failed to update task."));
    } finally {
      setBusy(false);
    }
  }

  async function submitHandover() {
    if (!session || !handoverAdmissionId || !handoverIncomingNurse) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/nursing/handovers/complete/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          outgoing_nurse_id: session.userId,
          incoming_nurse_id: handoverIncomingNurse,
          handover_notes: { admission_id: handoverAdmissionId, situation: handoverSituation, recommendation: handoverRecommendation },
        }),
      });
      setHandoverAdmissionId(""); setHandoverIncomingNurse(""); setHandoverSituation(""); setHandoverRecommendation(""); setShowHandoverForm(false);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل إكمال التسليم." : "Failed to complete handover."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }

  const pendingTasks = (tasks || []).filter(t => t.status === "pending").sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const overdueCount = pendingTasks.filter(t => new Date(t.scheduled_at) < new Date()).length;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><HeartHandshake size={22} /> {isAr ? "لوحة التمريض" : "Nursing Dashboard"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? "مهام الجناح، تسليمات SBAR، خطط الرعاية — مباشرة للمرضى المقيمين" : "Ward tasks, SBAR handovers, care plans — live for admitted patients"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      {fetchError && (
        <div role="alert" className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{fetchError}</div>
      )}

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="cy-card p-4 text-center">
          <div className="text-2xl font-bold text-brand-400">{pendingTasks.length}</div>
          <div className="mt-1 text-xs text-ink/50">{isAr ? "المهام المعلقة" : "Pending tasks"}</div>
        </div>
        <div className="cy-card p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{overdueCount}</div>
          <div className="mt-1 text-xs text-ink/50">{isAr ? "متأخرة" : "Overdue"}</div>
        </div>
        <div className="cy-card p-4 text-center">
          <div className="text-2xl font-bold text-accent">{admissions.length}</div>
          <div className="mt-1 text-xs text-ink/50">{isAr ? "مرضى مقيمون" : "Admitted patients"}</div>
        </div>
      </div>

      <div className="mb-5 flex gap-2">
        {(["tasks", "handovers", "careplans"] as Tab[]).map(tKey => (
          <button key={tKey} onClick={() => setTab(tKey)} className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${tab === tKey ? "bg-brand-500/15 text-brand-300 border border-brand-400/40" : "border border-ink/10 text-ink/50 hover:bg-ink/5"}`}>
            {isAr ? (tKey === "tasks" ? "المهام" : tKey === "handovers" ? "التسليمات" : "خطط الرعاية") : (tKey === "careplans" ? "Care Plans" : tKey)}
          </button>
        ))}
      </div>

      {tab === "tasks" && (
        <div>
          <div className="mb-4 flex justify-end">
            <button onClick={() => setShowTaskForm(v => !v)} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm">{isAr ? "+ جدولة مهمة" : "+ Schedule Task"}</button>
          </div>
          {showTaskForm && (
            <div className="cy-card mb-4 p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs text-ink/50">{isAr ? "المريض (يجب أن يكون مقيماً)" : "Patient (must be admitted)"}</label>
                  <select value={taskPatientId} onChange={e => setTaskPatientId(e.target.value)} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm">
                    <option value="">{isAr ? "اختر…" : "Select…"}</option>
                    {admissions.map(a => {
                      const p = patientForAdmission(a.id);
                      const enc = encounters.find(e => e.id === a.encounter);
                      return p ? <option key={a.id} value={enc?.patient}>{p.first_name} {p.last_name} ({p.mrn})</option> : null;
                    })}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink/50">{isAr ? "المهمة" : "Task"}</label>
                  <input value={taskName} onChange={e => setTaskName(e.target.value)} placeholder={isAr ? "مثال: تغيير ضماد الجرح" : "e.g. Wound dressing change"} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink/50">{isAr ? "الاستحقاق" : "Due at"}</label>
                  <input type="datetime-local" value={taskDueAt} onChange={e => setTaskDueAt(e.target.value)} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={scheduleTask} disabled={busy || !taskPatientId || !taskName || !taskDueAt} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm disabled:opacity-50">{isAr ? "جدولة" : "Schedule"}</button>
                <button onClick={() => setShowTaskForm(false)} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">{isAr ? "إلغاء" : "Cancel"}</button>
              </div>
            </div>
          )}
          <div className="grid gap-3">
            {tasks === null && <div className="cy-card p-6 text-center text-sm text-ink/40">{isAr ? "جارٍ تحميل المهام…" : "Loading tasks…"}</div>}
            {tasks !== null && pendingTasks.length === 0 && <div className="cy-card p-6 text-center text-sm text-ink/40">{isAr ? "لا توجد مهام تمريض معلقة." : "No pending nursing tasks."}</div>}
            {pendingTasks.map(t => {
              const overdue = new Date(t.scheduled_at) < new Date();
              return (
                <div key={t.id} className="cy-card flex items-center justify-between p-4">
                  <div>
                    <div className="font-semibold">{t.task_name}</div>
                    <div className={`text-xs ${overdue ? "text-red-400" : "text-ink/50"}`}>
                      {isAr ? "الاستحقاق " : "Due "}{new Date(t.scheduled_at).toLocaleString()}{overdue ? (isAr ? " — متأخرة" : " — overdue") : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => updateTaskStatus(t.id, "completed")} className="rounded-md border border-emerald-500/40 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">{isAr ? "إكمال" : "Complete"}</button>
                    <button disabled={busy} onClick={() => updateTaskStatus(t.id, "skipped")} className="rounded-md border border-ink/20 px-2.5 py-1 text-xs font-semibold text-ink/50 hover:bg-ink/5 disabled:opacity-40">{isAr ? "تخطي" : "Skip"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "handovers" && (
        <div>
          <div className="mb-4 flex justify-end">
            <button onClick={() => setShowHandoverForm(v => !v)} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm">{isAr ? "+ تسليم SBAR" : "+ SBAR Handover"}</button>
          </div>
          {showHandoverForm && (
            <div className="cy-card mb-4 p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-ink/50">{isAr ? "المريض / القبول" : "Patient / admission"}</label>
                  <select value={handoverAdmissionId} onChange={e => setHandoverAdmissionId(e.target.value)} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm">
                    <option value="">{isAr ? "اختر…" : "Select…"}</option>
                    {admissions.map(a => {
                      const p = patientForAdmission(a.id);
                      return p ? <option key={a.id} value={a.id}>{p.first_name} {p.last_name} ({p.mrn})</option> : null;
                    })}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink/50">{isAr ? "الممرض المستلم (معرّف المستخدم)" : "Incoming nurse (user id)"}</label>
                  <input value={handoverIncomingNurse} onChange={e => setHandoverIncomingNurse(e.target.value)} placeholder={isAr ? "معرّف حساب الممرض المستلم" : "Incoming nurse's account id"} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-ink/50">{isAr ? "الوضع / الخلفية (S+B)" : "Situation / Background (S+B)"}</label>
                  <textarea value={handoverSituation} onChange={e => setHandoverSituation(e.target.value)} rows={2} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-ink/50">{isAr ? "التقييم / التوصية (A+R)" : "Assessment / Recommendation (A+R)"}</label>
                  <textarea value={handoverRecommendation} onChange={e => setHandoverRecommendation(e.target.value)} rows={2} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={submitHandover} disabled={busy || !handoverAdmissionId || !handoverIncomingNurse} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm disabled:opacity-50">{isAr ? "إكمال التسليم" : "Complete Handover"}</button>
                <button onClick={() => setShowHandoverForm(false)} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">{isAr ? "إلغاء" : "Cancel"}</button>
              </div>
            </div>
          )}
          <div className="grid gap-3">
            {handovers.length === 0 && <div className="cy-card p-6 text-center text-sm text-ink/40">{isAr ? "لا توجد تسليمات مسجلة بعد." : "No handovers recorded yet."}</div>}
            {handovers.slice().sort((a, b) => b.handover_time.localeCompare(a.handover_time)).map(h => {
              const p = patientForAdmission(h.admission);
              return (
                <div key={h.id} className="cy-card p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold">{p ? `${p.first_name} ${p.last_name}` : `${isAr ? "قبول" : "Admission"} ${h.admission.slice(0, 8)}`}</span>
                    <span className="text-xs text-ink/40">{new Date(h.handover_time).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-ink/70"><b>S/B:</b> {h.situation_background}</p>
                  <p className="mt-1 text-sm text-ink/70"><b>A/R:</b> {h.assessment_recommendation}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "careplans" && (
        <div className="grid gap-3">
          {carePlans.length === 0 && <div className="cy-card p-6 text-center text-sm text-ink/40">{isAr ? "لا توجد خطط رعاية مسجلة بعد." : "No care plans recorded yet."}</div>}
          {carePlans.map(cp => {
            const p = patientForAdmission(cp.admission);
            return (
              <div key={cp.id} className="cy-card p-4">
                <div className="mb-1 font-semibold">{p ? `${p.first_name} ${p.last_name}` : `${isAr ? "قبول" : "Admission"} ${cp.admission.slice(0, 8)}`}</div>
                <p className="text-sm text-ink/70"><b>{isAr ? "الأهداف:" : "Goals:"}</b> {cp.goals}</p>
                <p className="mt-1 text-sm text-ink/70"><b>{isAr ? "التدخلات:" : "Interventions:"}</b> {cp.activities}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
