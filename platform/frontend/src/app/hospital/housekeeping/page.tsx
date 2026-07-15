"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

type TaskStatus = "pending" | "in_progress" | "completed" | "verified";

interface CleaningTask {
  id: string; location: string; task_type: string; status: TaskStatus; scheduled_at: string;
}
interface HygieneAudit { id: string; location: string; audit_date: string; score: number; findings: string; }
interface Paginated<T> { count: number; results: T[]; }

function unwrap<T>(data: Paginated<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

const STATUS_COLOR: Record<TaskStatus, string> = { pending: "#94a3b8", in_progress: "#3b82f6", completed: "#f59e0b", verified: "#22c55e" };
const STATUS_LABEL_AR: Record<TaskStatus, string> = { pending: "معلق", in_progress: "قيد التنفيذ", completed: "مكتمل", verified: "تم التحقق" };

type Tab = "tasks" | "audits";

export default function HousekeepingPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [tab, setTab] = useState<Tab>("tasks");
  const [tasks, setTasks] = useState<CleaningTask[] | null>(null);
  const [audits, setAudits] = useState<HygieneAudit[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ location: "", taskType: "routine", scheduledAt: "" });
  const [showAuditForm, setShowAuditForm] = useState(false);
  const [auditForm, setAuditForm] = useState({ location: "", score: "90", findings: "" });

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    const opts = { token: session.accessToken, tenantId: session.tenantId };
    try {
      const [taskData, auditData] = await Promise.all([
        apiFetch<Paginated<CleaningTask> | CleaningTask[]>("/api/v1/hospital/housekeeping/tasks/", opts),
        apiFetch<Paginated<HygieneAudit> | HygieneAudit[]>("/api/v1/hospital/housekeeping/audits/", opts),
      ]);
      setTasks(unwrap(taskData));
      setAudits(unwrap(auditData));
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل بيانات التدبير المنزلي." : "Failed to load housekeeping data."));
    }
  }, [session, isAr]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function createTask() {
    if (!session || !taskForm.location || !taskForm.scheduledAt) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/housekeeping/tasks/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({ location: taskForm.location, task_type: taskForm.taskType, scheduled_at: new Date(taskForm.scheduledAt).toISOString(), status: "pending" }),
      });
      setTaskForm({ location: "", taskType: "routine", scheduledAt: "" });
      setShowTaskForm(false);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل إنشاء مهمة تنظيف." : "Failed to create cleaning task."));
    } finally {
      setBusy(false);
    }
  }

  async function completeTask(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/hospital/housekeeping/tasks/${id}/complete/`, {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل إكمال المهمة." : "Failed to complete task."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyTask(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/hospital/housekeeping/tasks/${id}/verify/`, {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({ verified_by: session.userId }),
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل التحقق من المهمة." : "Failed to verify task."));
    } finally {
      setBusy(false);
    }
  }

  async function logAudit() {
    if (!session || !auditForm.location) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/housekeeping/audits/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({ location: auditForm.location, audit_date: new Date().toISOString().slice(0, 10), score: Number(auditForm.score), auditor_id: session.userId, findings: auditForm.findings }),
      });
      setAuditForm({ location: "", score: "90", findings: "" });
      setShowAuditForm(false);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تسجيل التدقيق." : "Failed to log audit."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }

  const pending = (tasks || []).filter(t => t.status !== "verified");

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Sparkles size={22} /> {isAr ? "التدبير المنزلي" : "Housekeeping"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? "جدولة مهام التنظيف وتدقيقات الالتزام بالنظافة" : "Cleaning task scheduling and hygiene compliance audits"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      {fetchError && <div role="alert" className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{fetchError}</div>}

      <div className="mb-5 flex gap-2">
        {(["tasks", "audits"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? "bg-brand-500/15 text-brand-300 border border-brand-400/40" : "border border-ink/10 text-ink/50 hover:bg-ink/5"}`}>
            {isAr ? (t === "tasks" ? "المهام" : "التدقيقات") : t}
          </button>
        ))}
      </div>

      {tab === "tasks" && (
        <div>
          <div className="mb-3 flex justify-end"><button onClick={() => setShowTaskForm(v => !v)} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm">{isAr ? "+ جدولة مهمة" : "+ Schedule Task"}</button></div>
          {showTaskForm && (
            <div className="cy-card mb-4 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input value={taskForm.location} onChange={e => setTaskForm(f => ({ ...f, location: e.target.value }))} placeholder={isAr ? "الموقع (مثال: OR-2، جناح 3A)" : "Location (e.g. OR-2, Ward 3A)"} className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
                <select value={taskForm.taskType} onChange={e => setTaskForm(f => ({ ...f, taskType: e.target.value }))} className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm">
                  <option value="routine">{isAr ? "روتيني" : "Routine"}</option>
                  <option value="terminal">{isAr ? "نهائي" : "Terminal"}</option>
                  <option value="deep_clean">{isAr ? "تنظيف عميق" : "Deep Clean"}</option>
                  <option value="spill_response">{isAr ? "استجابة انسكاب" : "Spill Response"}</option>
                </select>
                <input type="datetime-local" value={taskForm.scheduledAt} onChange={e => setTaskForm(f => ({ ...f, scheduledAt: e.target.value }))} className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={createTask} disabled={busy || !taskForm.location || !taskForm.scheduledAt} className="cy-btn cy-btn-primary !min-h-0 !py-1.5 !px-3 text-xs disabled:opacity-50">{isAr ? "جدولة" : "Schedule"}</button>
                <button onClick={() => setShowTaskForm(false)} className="cy-btn cy-btn-ghost !min-h-0 !py-1.5 !px-3 text-xs">{isAr ? "إلغاء" : "Cancel"}</button>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            {tasks === null && <div className="cy-card p-4 text-center text-sm text-ink/40">{isAr ? "جارٍ التحميل…" : "Loading…"}</div>}
            {tasks !== null && pending.length === 0 && <div className="cy-card p-4 text-center text-sm text-ink/40">{isAr ? "لا توجد مهام تنظيف معلقة." : "No pending cleaning tasks."}</div>}
            {pending.map(t => (
              <div key={t.id} className="cy-card flex items-center justify-between p-3">
                <div>
                  <span className="font-semibold">{t.location}</span>
                  <span className="ml-2 text-xs capitalize text-ink/50">{t.task_type.replace("_", " ")}</span>
                  <span className="ml-2 text-xs text-ink/40">{new Date(t.scheduled_at).toLocaleString()}</span>
                  <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-bold capitalize" style={{ background: `${STATUS_COLOR[t.status]}22`, color: STATUS_COLOR[t.status] }}>{isAr ? STATUS_LABEL_AR[t.status] : t.status.replace("_", " ")}</span>
                </div>
                <div className="flex gap-2">
                  {t.status !== "completed" && <button disabled={busy} onClick={() => completeTask(t.id)} className="rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/10 disabled:opacity-40">{isAr ? "إكمال" : "Complete"}</button>}
                  {t.status === "completed" && <button disabled={busy} onClick={() => verifyTask(t.id)} className="rounded-md border border-emerald-500/40 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">{isAr ? "تحقق" : "Verify"}</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "audits" && (
        <div>
          <div className="mb-3 flex justify-end"><button onClick={() => setShowAuditForm(v => !v)} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm">{isAr ? "+ تسجيل تدقيق" : "+ Log Audit"}</button></div>
          {showAuditForm && (
            <div className="cy-card mb-4 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input value={auditForm.location} onChange={e => setAuditForm(f => ({ ...f, location: e.target.value }))} placeholder={isAr ? "الموقع" : "Location"} className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
                <input type="number" min={0} max={100} value={auditForm.score} onChange={e => setAuditForm(f => ({ ...f, score: e.target.value }))} placeholder={isAr ? "الدرجة (0-100)" : "Score (0-100)"} className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
                <input value={auditForm.findings} onChange={e => setAuditForm(f => ({ ...f, findings: e.target.value }))} placeholder={isAr ? "الملاحظات" : "Findings"} className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={logAudit} disabled={busy || !auditForm.location} className="cy-btn cy-btn-primary !min-h-0 !py-1.5 !px-3 text-xs disabled:opacity-50">{isAr ? "تسجيل" : "Log"}</button>
                <button onClick={() => setShowAuditForm(false)} className="cy-btn cy-btn-ghost !min-h-0 !py-1.5 !px-3 text-xs">{isAr ? "إلغاء" : "Cancel"}</button>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            {audits.length === 0 && <div className="cy-card p-4 text-center text-sm text-ink/40">{isAr ? "لم يتم تسجيل أي تدقيقات نظافة بعد." : "No hygiene audits logged yet."}</div>}
            {audits.map(a => (
              <div key={a.id} className="cy-card p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{a.location}</span>
                  <span className="font-heading text-lg font-bold" style={{ color: a.score >= 90 ? "#22c55e" : a.score >= 75 ? "#f59e0b" : "#ef4444" }}>{a.score}%</span>
                </div>
                <div className="text-xs text-ink/40">{new Date(a.audit_date).toLocaleDateString()}</div>
                {a.findings && <p className="mt-1 text-xs text-ink/60">{a.findings}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
