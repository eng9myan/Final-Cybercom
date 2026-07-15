"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

type Severity = "minor" | "moderate" | "major" | "sentinel";
type IncidentStatus = "reported" | "under_investigation" | "closed";

interface IncidentReport {
  id: string; incident_type: string; severity: Severity; description: string;
  location: string; occurred_at: string; status: IncidentStatus;
}
interface RootCauseAnalysis { id: string; analysis_text: string; corrective_actions: string; }
interface Paginated<T> { count: number; results: T[]; }

function unwrap<T>(data: Paginated<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

const SEVERITY_COLOR: Record<Severity, string> = { minor: "#94a3b8", moderate: "#f59e0b", major: "#ef4444", sentinel: "#b91c1c" };
const SEVERITY_LABEL_AR: Record<Severity, string> = { minor: "طفيف", moderate: "متوسط", major: "كبير", sentinel: "حدث جسيم" };
const STATUS_COLOR: Record<IncidentStatus, string> = { reported: "#f59e0b", under_investigation: "#3b82f6", closed: "#22c55e" };
const STATUS_LABEL_AR: Record<IncidentStatus, string> = { reported: "تم الإبلاغ", under_investigation: "قيد التحقيق", closed: "مغلق" };
const INCIDENT_TYPES = ["medication_error", "fall", "adverse_event", "near_miss", "equipment_failure", "needlestick", "security", "other"];
const INCIDENT_TYPE_LABEL_AR: Record<string, string> = {
  medication_error: "خطأ دوائي", fall: "سقوط", adverse_event: "حدث ضار", near_miss: "حالة كادت تقع",
  equipment_failure: "عطل بالمعدات", needlestick: "وخز بإبرة", security: "أمني", other: "أخرى",
};

export default function IncidentReportingPage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [incidents, setIncidents] = useState<IncidentReport[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "near_miss", severity: "minor" as Severity, location: "", description: "", occurredAt: "" });
  const [rcaForm, setRcaForm] = useState<Record<string, { analysis: string; actions: string }>>({});
  const [rcaOpenFor, setRcaOpenFor] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    const opts = { token: session.accessToken, tenantId: session.tenantId };
    try {
      const data = await apiFetch<Paginated<IncidentReport> | IncidentReport[]>("/api/v1/hospital/incidents/reports/", opts);
      setIncidents(unwrap(data));
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل تقارير الحوادث." : "Failed to load incident reports."));
    }
  }, [session, isAr]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function createIncident() {
    if (!session || !form.location || !form.description || !form.occurredAt) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/incidents/reports/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({
          incident_type: form.type, severity: form.severity, description: form.description,
          location: form.location, occurred_at: new Date(form.occurredAt).toISOString(),
          reported_by: session.userId, status: "reported",
        }),
      });
      setForm({ type: "near_miss", severity: "minor", location: "", description: "", occurredAt: "" });
      setShowForm(false);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل الإبلاغ عن الحادث." : "Failed to report incident."));
    } finally {
      setBusy(false);
    }
  }

  async function startInvestigation(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/hospital/incidents/reports/${id}/start_investigation/`, {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل بدء التحقيق." : "Failed to start investigation."));
    } finally {
      setBusy(false);
    }
  }

  async function submitRCA(incidentId: string) {
    if (!session) return;
    const rca = rcaForm[incidentId];
    if (!rca?.analysis) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/incidents/root-cause-analyses/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({ incident: incidentId, analysis_text: rca.analysis, corrective_actions: rca.actions || "", conducted_by: session.userId }),
      });
      setRcaOpenFor(null);
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل إرسال تحليل السبب الجذري." : "Failed to submit root cause analysis."));
    } finally {
      setBusy(false);
    }
  }

  async function closeIncident(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/hospital/incidents/reports/${id}/close/`, {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل إغلاق الحادث." : "Failed to close incident."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }

  const sorted = (incidents || []).slice().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const openCount = (incidents || []).filter(i => i.status !== "closed").length;
  const sentinelCount = (incidents || []).filter(i => i.severity === "sentinel" && i.status !== "closed").length;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><AlertTriangle size={22} /> {isAr ? "الإبلاغ عن الحوادث" : "Incident Reporting"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? "الأحداث الضارة، الحالات التي كادت تقع، وتحليل السبب الجذري" : "Adverse events, near misses, and root cause analysis"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowForm(v => !v)} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm">{isAr ? "+ الإبلاغ عن حادث" : "+ Report Incident"}</button>
          <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
            {isAr ? "English" : "العربية"}
          </button>
        </div>
      </header>

      {fetchError && <div role="alert" className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{fetchError}</div>}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="cy-card p-4 text-center"><div className="text-2xl font-bold text-brand-400">{openCount}</div><div className="mt-1 text-xs text-ink/50">{isAr ? "الحوادث المفتوحة" : "Open incidents"}</div></div>
        <div className="cy-card p-4 text-center"><div className="text-2xl font-bold text-red-500">{sentinelCount}</div><div className="mt-1 text-xs text-ink/50">{isAr ? "أحداث جسيمة مفتوحة" : "Open sentinel events"}</div></div>
        <div className="cy-card p-4 text-center"><div className="text-2xl font-bold text-accent">{(incidents || []).length}</div><div className="mt-1 text-xs text-ink/50">{isAr ? "إجمالي التقارير" : "Total reports"}</div></div>
      </div>

      {showForm && (
        <div className="cy-card mb-6 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-ink/50">{isAr ? "نوع الحادث" : "Incident type"}</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm">
                {INCIDENT_TYPES.map(t => <option key={t} value={t}>{isAr ? INCIDENT_TYPE_LABEL_AR[t] : t.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/50">{isAr ? "الشدة" : "Severity"}</label>
              <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as Severity }))} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm">
                <option value="minor">{isAr ? "طفيف" : "Minor"}</option>
                <option value="moderate">{isAr ? "متوسط" : "Moderate"}</option>
                <option value="major">{isAr ? "كبير" : "Major"}</option>
                <option value="sentinel">{isAr ? "حدث جسيم" : "Sentinel Event"}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/50">{isAr ? "الموقع" : "Location"}</label>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/50">{isAr ? "وقت الحدوث" : "Occurred at"}</label>
              <input type="datetime-local" value={form.occurredAt} onChange={e => setForm(f => ({ ...f, occurredAt: e.target.value }))} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-ink/50">{isAr ? "الوصف" : "Description"}</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={createIncident} disabled={busy || !form.location || !form.description || !form.occurredAt} className="cy-btn cy-btn-primary !min-h-0 !py-2 !px-4 text-sm disabled:opacity-50">{isAr ? "إرسال" : "Submit"}</button>
            <button onClick={() => setShowForm(false)} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">{isAr ? "إلغاء" : "Cancel"}</button>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {incidents === null && <div className="cy-card p-6 text-center text-sm text-ink/40">{isAr ? "جارٍ تحميل تقارير الحوادث…" : "Loading incident reports…"}</div>}
        {incidents !== null && sorted.length === 0 && <div className="cy-card p-6 text-center text-sm text-ink/40">{isAr ? "لم يتم الإبلاغ عن أي حوادث لهذا المستأجر بعد." : "No incidents reported for this tenant yet."}</div>}
        {sorted.map(inc => (
          <div key={inc.id} className="cy-card p-4" style={inc.severity === "sentinel" ? { borderColor: "rgba(185,28,28,0.4)" } : undefined}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold capitalize">{isAr ? INCIDENT_TYPE_LABEL_AR[inc.incident_type] ?? inc.incident_type : inc.incident_type.replace("_", " ")}</span>
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold capitalize" style={{ background: `${SEVERITY_COLOR[inc.severity]}22`, color: SEVERITY_COLOR[inc.severity] }}>{isAr ? SEVERITY_LABEL_AR[inc.severity] : inc.severity}</span>
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold capitalize" style={{ background: `${STATUS_COLOR[inc.status]}22`, color: STATUS_COLOR[inc.status] }}>{isAr ? STATUS_LABEL_AR[inc.status] : inc.status.replace("_", " ")}</span>
                </div>
                <div className="mt-1 text-sm text-ink/60">{inc.location} · {new Date(inc.occurred_at).toLocaleString()}</div>
                <p className="mt-1 text-sm text-ink/70">{inc.description}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {inc.status === "reported" && <button disabled={busy} onClick={() => startInvestigation(inc.id)} className="rounded-md border border-blue-400/40 px-2.5 py-1 text-xs font-semibold text-blue-300 hover:bg-blue-500/10 disabled:opacity-40">{isAr ? "تحقيق" : "Investigate"}</button>}
                {inc.status === "under_investigation" && (
                  <>
                    <button onClick={() => setRcaOpenFor(rcaOpenFor === inc.id ? null : inc.id)} className="rounded-md border border-brand-400/40 px-2.5 py-1 text-xs font-semibold text-brand-300 hover:bg-brand-500/10">{isAr ? "تحليل السبب الجذري" : "RCA"}</button>
                    <button disabled={busy} onClick={() => closeIncident(inc.id)} className="rounded-md border border-emerald-500/40 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">{isAr ? "إغلاق" : "Close"}</button>
                  </>
                )}
              </div>
            </div>
            {rcaOpenFor === inc.id && (
              <div className="mt-3 border-t border-ink/10 pt-3">
                <textarea
                  value={rcaForm[inc.id]?.analysis || ""}
                  onChange={e => setRcaForm(f => ({ ...f, [inc.id]: { analysis: e.target.value, actions: f[inc.id]?.actions || "" } }))}
                  placeholder={isAr ? "تحليل السبب الجذري…" : "Root cause analysis…"}
                  rows={2}
                  className="mb-2 w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm"
                />
                <textarea
                  value={rcaForm[inc.id]?.actions || ""}
                  onChange={e => setRcaForm(f => ({ ...f, [inc.id]: { analysis: f[inc.id]?.analysis || "", actions: e.target.value } }))}
                  placeholder={isAr ? "الإجراءات التصحيحية…" : "Corrective actions…"}
                  rows={2}
                  className="mb-2 w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm"
                />
                <button disabled={busy || !rcaForm[inc.id]?.analysis} onClick={() => submitRCA(inc.id)} className="cy-btn cy-btn-primary !min-h-0 !py-1.5 !px-3 text-xs disabled:opacity-50">{isAr ? "حفظ التحليل" : "Save RCA"}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
