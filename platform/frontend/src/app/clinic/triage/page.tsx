"use client";

import { usePreferences } from "@/contexts/preferences";
import { useAuth } from "@/contexts/auth";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Interfaces (mirror real backend serializers) ──────────────────────────────
// clinic.triage.TriageAssessmentSerializer: id, checkin, assessed_at,
// assessed_by, chief_complaint, triage_category (5-level: immediate/emergent/
// urgent/less_urgent/non_urgent), vital_signs{...}, risk_score{...} (server-
// computed MEWS, read-only). No custom update() exists on the backend — an
// assessment is created once with its vitals; there is no supported edit flow,
// which matches its real clinical-record-immutability intent.

interface VitalSignsRaw {
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  temperature_c: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  pulse_bpm: number | null;
  respiratory_rate_pm: number | null;
  oxygen_saturation_pct: number | null;
  pain_score: number;
}
interface RiskScoreRaw { mews_score: number; abnormal_flag: boolean; risk_level: string; ai_risk_assessment: string; }
interface TriageAssessmentRaw {
  id: string;
  checkin: string;
  assessed_at: string;
  assessed_by: string;
  chief_complaint: string;
  triage_category: "immediate" | "emergent" | "urgent" | "less_urgent" | "non_urgent";
  vital_signs: VitalSignsRaw | null;
  risk_score: RiskScoreRaw | null;
}
interface CheckInRaw { id: string; patient: string; checkin_time: string; }
interface PatientRaw { id: string; first_name: string; last_name: string; mrn: string; }
interface Paginated<T> { count: number; results: T[]; }

interface QueueItem { checkinId: string; patient_name: string; mrn: string; checkin_time: string; }
interface AssessedItem {
  id: string; patient_name: string; mrn: string; assessed_at: string; assessed_by: string;
  chief_complaint: string; category: TriageAssessmentRaw["triage_category"];
  vitals: VitalSignsRaw | null; risk: RiskScoreRaw | null;
}

interface FormData {
  chief_complaint: string;
  triage_category: TriageAssessmentRaw["triage_category"];
  weight_kg: string; height_cm: string; temperature_c: string;
  bp_systolic: string; bp_diastolic: string; pulse: string; rr: string; spo2: string; pain: string;
}

const EMPTY_FORM: FormData = {
  chief_complaint: "", triage_category: "non_urgent",
  weight_kg: "", height_cm: "", temperature_c: "",
  bp_systolic: "", bp_diastolic: "", pulse: "", rr: "", spo2: "", pain: "0",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoryStyle(cat: string): { bg: string; border: string; text: string; dot: string; label_en: string; label_ar: string } {
  switch (cat) {
    case "immediate":   return { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", dot: "#ef4444", label_en: "Immediate (1)",   label_ar: "فوري (1)" };
    case "emergent":    return { bg: "#fff1e6", border: "#fdba8c", text: "#9a3412", dot: "#f97316", label_en: "Emergent (2)",    label_ar: "طارئ (2)" };
    case "urgent":      return { bg: "#fffbeb", border: "#fde68a", text: "#92400e", dot: "#f59e0b", label_en: "Urgent (3)",      label_ar: "عاجل (3)" };
    case "less_urgent": return { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af", dot: "#3b82f6", label_en: "Less Urgent (4)", label_ar: "أقل استعجالاً (4)" };
    default:            return { bg: "#f0fdf4", border: "#bbf7d0", text: "#065f46", dot: "#22c55e", label_en: "Non-Urgent (5)",  label_ar: "غير عاجل (5)" };
  }
}

function riskColor(level: string | undefined): string {
  if (level === "high") return "#ef4444";
  if (level === "medium") return "#f59e0b";
  return "#22c55e";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TriagePage() {
  const { session, isAuthenticated } = useAuth();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [assessed, setAssessed] = useState<AssessedItem[]>([]);
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedCheckinId, setSelectedCheckinId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitMsg, setSubmitMsg] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [checkinPage, assessPage, patientPage] = await Promise.all([
        apiFetch<Paginated<CheckInRaw>>("/api/v1/clinic/reception/checkins/", opts),
        apiFetch<Paginated<TriageAssessmentRaw>>("/api/v1/clinic/triage/assessments/", opts),
        apiFetch<Paginated<PatientRaw>>("/api/v1/patients/", opts),
      ]);
      const patientById = new Map(patientPage.results.map(p => [p.id, p]));
      const assessedCheckinIds = new Set(assessPage.results.map(a => a.checkin));

      const pending: QueueItem[] = checkinPage.results
        .filter(c => !assessedCheckinIds.has(c.id))
        .map(c => {
          const patient = patientById.get(c.patient);
          return {
            checkinId: c.id,
            patient_name: patient ? `${patient.first_name} ${patient.last_name}` : "Unknown patient",
            mrn: patient?.mrn ?? "—",
            checkin_time: c.checkin_time ? new Date(c.checkin_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--",
          };
        });
      const checkinById = new Map(checkinPage.results.map(c => [c.id, c]));
      const done: AssessedItem[] = assessPage.results.map(a => {
        const checkin = checkinById.get(a.checkin);
        const patient = checkin ? patientById.get(checkin.patient) : undefined;
        return {
          id: a.id,
          patient_name: patient ? `${patient.first_name} ${patient.last_name}` : "Unknown patient",
          mrn: patient?.mrn ?? "—",
          assessed_at: a.assessed_at,
          assessed_by: a.assessed_by,
          chief_complaint: a.chief_complaint,
          category: a.triage_category,
          vitals: a.vital_signs,
          risk: a.risk_score,
        };
      }).sort((x, y) => new Date(y.assessed_at).getTime() - new Date(x.assessed_at).getTime());

      setQueue(pending);
      setAssessed(done);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load triage data."));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSelect = (item: QueueItem) => {
    setSelectedCheckinId(item.checkinId);
    setForm(EMPTY_FORM);
    setSubmitMsg("");
  };

  const handleSubmit = async () => {
    if (!session || !selectedCheckinId) return;
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      await apiFetch("/api/v1/clinic/triage/assessments/", {
        method: "POST",
        body: JSON.stringify({
          checkin: selectedCheckinId,
          chief_complaint: form.chief_complaint,
          triage_category: form.triage_category,
          vital_signs: {
            weight_kg: num(form.weight_kg),
            height_cm: num(form.height_cm),
            temperature_c: num(form.temperature_c),
            blood_pressure_systolic: num(form.bp_systolic),
            blood_pressure_diastolic: num(form.bp_diastolic),
            pulse_bpm: num(form.pulse),
            respiratory_rate_pm: num(form.rr),
            oxygen_saturation_pct: num(form.spo2),
            pain_score: Number(form.pain) || 0,
          },
        }),
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      setSubmitMsg(lang === "en" ? "Triage assessment saved." : "تم حفظ تقييم الفرز.");
      setSelectedCheckinId(null);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setSubmitMsg(detail || (lang === "en" ? "Failed to save assessment." : "فشل حفظ التقييم."));
    }
    setTimeout(() => setSubmitMsg(""), 3500);
  };

  const filteredAssessed = filterCategory === "all" ? assessed : assessed.filter(a => a.category === filterCategory);
  const dir = lang === "ar" ? "rtl" : "ltr";

  const fieldLabelCls = "mb-1.5 block text-[13px] font-semibold text-ink/50";
  const fieldInputCls = "w-full rounded-lg border border-ink/10 bg-surface px-3.5 py-2.5 text-sm text-ink";

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">
          {lang === "en" ? "Unable to load triage data" : "تعذر تحميل بيانات الفرز"}
        </h1>
        <p className="mt-1 text-sm text-ink/50">{fetchError}</p>
        <button onClick={() => void loadData()} className="cy-btn cy-btn-ghost mt-4 !min-h-0 !py-2 !px-4 text-sm">
          {lang === "en" ? "Retry" : "إعادة المحاولة"}
        </button>
      </div>
    );
  }

  return (
    <div dir={dir} className="mx-auto max-w-6xl">

      {/* Header */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <a href="/clinic" className="text-sm text-ink/50 hover:text-ink">
            {lang === "en" ? "← Clinic" : "العيادة ←"}
          </a>
          <h1 className="mt-1 font-heading text-3xl font-bold">
            {lang === "en" ? "Triage Assessment" : "تقييم الفرز الطبي"}
          </h1>
          <p className="mt-1 text-sm text-ink/50">
            {lang === "en" ? "Assess checked-in patients and record vitals" : "تقييم المرضى المسجلين وتسجيل العلامات الحيوية"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-sm text-ink/50">{lang === "en" ? "Syncing..." : "جارٍ التزامن..."}</span>}
          <button onClick={() => setLang(l => l === "en" ? "ar" : "en")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
            {lang === "en" ? "العربية" : "English"}
          </button>
        </div>
      </header>

      {/* Summary */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="cy-card p-5 text-center">
          <p className="text-3xl font-bold" style={{ color: "#f59e0b" }}>{queue.length}</p>
          <p className="mt-1.5 text-sm font-bold text-ink/50">{lang === "en" ? "Awaiting Triage" : "بانتظار الفرز"}</p>
        </div>
        <div className="cy-card p-5 text-center">
          <p className="text-3xl font-bold" style={{ color: "#22c55e" }}>{assessed.length}</p>
          <p className="mt-1.5 text-sm font-bold text-ink/50">{lang === "en" ? "Triaged" : "تم فرزهم"}</p>
        </div>
        <div className="cy-card p-5 text-center">
          <p className="text-3xl font-bold" style={{ color: "#ef4444" }}>{assessed.filter(a => a.risk?.abnormal_flag).length}</p>
          <p className="mt-1.5 text-sm font-bold text-ink/50">{lang === "en" ? "Abnormal MEWS" : "MEWS غير طبيعي"}</p>
        </div>
      </div>

      {/* Main two-column layout */}
      <div className="grid grid-cols-[1fr_420px] items-start gap-6">

        {/* LEFT — Queue + assessed list */}
        <div>
          <h2 className="mb-4 text-lg font-bold">
            {lang === "en" ? "Awaiting Triage" : "بانتظار الفرز"}
          </h2>
          <div className="mb-8 flex flex-col gap-3">
            {queue.map(item => (
              <div
                key={item.checkinId}
                onClick={() => handleSelect(item)}
                className={`cursor-pointer rounded-xl p-4 ${selectedCheckinId === item.checkinId ? "border-2 border-brand-400 shadow-[0_0_0_3px_rgba(34,211,238,0.15)]" : "border border-ink/10 bg-surface"}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold">{item.patient_name}</span>
                    <span className="ml-2 font-mono text-xs text-ink/50">{item.mrn}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-ink/50">{lang === "en" ? "Checked in" : "وصل"}</div>
                    <div className="text-sm font-bold text-brand-400">{item.checkin_time}</div>
                  </div>
                </div>
              </div>
            ))}
            {queue.length === 0 && (
              <div className="cy-card p-8 text-center text-sm text-ink/40">
                {lang === "en" ? "No patients awaiting triage." : "لا يوجد مرضى بانتظار الفرز."}
              </div>
            )}
          </div>

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{lang === "en" ? "Triaged" : "تم فرزهم"}</h2>
            <div className="flex flex-wrap gap-2">
              {(["all", "immediate", "emergent", "urgent", "less_urgent", "non_urgent"] as const).map(f => {
                const cs = categoryStyle(f === "all" ? "non_urgent" : f);
                return (
                  <button
                    key={f}
                    onClick={() => setFilterCategory(f)}
                    className="rounded-md border border-ink/10 px-2.5 py-1.5 text-xs font-semibold"
                    style={filterCategory === f ? { background: cs.dot, color: "#fff", borderColor: cs.dot } : { background: "var(--color-surface)", color: "var(--color-text)" }}
                  >
                    {f === "all" ? (lang === "en" ? "All" : "الكل") : (lang === "en" ? cs.label_en : cs.label_ar)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {filteredAssessed.map(a => {
              const cs = categoryStyle(a.category);
              return (
                <div key={a.id} className="rounded-xl border border-ink/10 bg-surface p-4" style={{ borderLeft: `4px solid ${cs.dot}` }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="mb-1 flex items-center gap-2.5">
                        <span className="text-sm font-bold">{a.patient_name}</span>
                        <span className="font-mono text-xs text-ink/50">{a.mrn}</span>
                        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}` }}>
                          {lang === "en" ? cs.label_en : cs.label_ar}
                        </span>
                      </div>
                      <p className="mb-2 text-sm italic text-ink/50">{a.chief_complaint}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-ink/50">{a.assessed_by}</div>
                      <div className="text-sm font-bold text-brand-400">
                        {new Date(a.assessed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>

                  {a.vitals && (
                    <div className="mt-2 flex flex-wrap gap-4">
                      {[
                        { label: "BP",   value: `${a.vitals.blood_pressure_systolic ?? "--"}/${a.vitals.blood_pressure_diastolic ?? "--"}`, unit: "mmHg" },
                        { label: "HR",   value: a.vitals.pulse_bpm ?? "--",                unit: "bpm" },
                        { label: "Temp", value: a.vitals.temperature_c ?? "--",            unit: "°C" },
                        { label: "SpO₂", value: a.vitals.oxygen_saturation_pct ?? "--",     unit: "%" },
                        { label: "RR",   value: a.vitals.respiratory_rate_pm ?? "--",       unit: "/min" },
                        { label: lang === "en" ? "Pain" : "الألم", value: a.vitals.pain_score, unit: "/10" },
                      ].map(v => (
                        <div key={v.label} className="min-w-[54px] text-center">
                          <div className="text-[11px] uppercase tracking-wide text-ink/50">{v.label}</div>
                          <div className="text-sm font-bold">{v.value}<span className="ml-0.5 text-[11px] font-normal text-ink/50">{v.unit}</span></div>
                        </div>
                      ))}
                      {a.risk && (
                        <div className="ml-auto self-center text-right">
                          <div className="text-[11px] uppercase tracking-wide text-ink/50">MEWS</div>
                          <div className="text-sm font-bold" style={{ color: riskColor(a.risk.risk_level) }}>
                            {a.risk.mews_score} · {a.risk.risk_level}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {a.risk?.ai_risk_assessment && (
                    <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">
                      {a.risk.ai_risk_assessment}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredAssessed.length === 0 && (
              <div className="cy-card p-8 text-center text-sm text-ink/40">
                {lang === "en" ? "No triaged patients in this category." : "لا يوجد مرضى تم فرزهم في هذه الفئة."}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Triage form */}
        <div className="cy-card sticky top-4 p-6">
          <h2 className="mb-1 text-lg font-bold text-brand-400">
            {lang === "en" ? "Triage Assessment Form" : "نموذج تقييم الفرز"}
          </h2>
          {selectedCheckinId ? (
            <p className="mb-5 text-sm text-ink/50">
              {lang === "en"
                ? `Patient: ${queue.find(q => q.checkinId === selectedCheckinId)?.patient_name ?? ""}`
                : `المريض: ${queue.find(q => q.checkinId === selectedCheckinId)?.patient_name ?? ""}`}
            </p>
          ) : (
            <p className="mb-5 text-sm text-ink/50">
              {lang === "en" ? "Select a patient from the queue to begin triage." : "اختر مريضاً من الطابور لبدء تقييم الفرز."}
            </p>
          )}

          {submitMsg && (
            <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-400">
              {submitMsg}
            </div>
          )}

          <div className="mb-4">
            <label className={fieldLabelCls}>
              {lang === "en" ? "Chief Complaint" : "الشكوى الرئيسية"}
            </label>
            <textarea
              value={form.chief_complaint}
              onChange={e => setForm(f => ({ ...f, chief_complaint: e.target.value }))}
              disabled={!selectedCheckinId}
              rows={2}
              className={`${fieldInputCls} resize-y`}
            />
          </div>

          <p className="mb-3 text-[13px] font-semibold text-ink/50">
            {lang === "en" ? "Vital Signs" : "العلامات الحيوية"}
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3">
            {[
              { key: "weight_kg" as const, label_en: "Weight (kg)", label_ar: "الوزن (كغ)" },
              { key: "height_cm" as const, label_en: "Height (cm)", label_ar: "الطول (سم)" },
              { key: "bp_systolic" as const, label_en: "BP Systolic (mmHg)", label_ar: "الضغط الانقباضي" },
              { key: "bp_diastolic" as const, label_en: "BP Diastolic (mmHg)", label_ar: "الضغط الانبساطي" },
              { key: "pulse" as const, label_en: "Pulse (bpm)", label_ar: "النبض" },
              { key: "temperature_c" as const, label_en: "Temperature (°C)", label_ar: "الحرارة (°س)" },
              { key: "spo2" as const, label_en: "SpO₂ (%)", label_ar: "تشبع الأكسجين (%)" },
              { key: "rr" as const, label_en: "Resp. Rate (/min)", label_ar: "معدل التنفس" },
            ].map(field => (
              <div key={field.key}>
                <label className={fieldLabelCls}>{lang === "en" ? field.label_en : field.label_ar}</label>
                <input
                  type="number"
                  value={form[field.key]}
                  onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                  disabled={!selectedCheckinId}
                  className={fieldInputCls}
                />
              </div>
            ))}
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-[13px] font-semibold uppercase text-ink/50">
              {lang === "en" ? `Pain Score: ${form.pain}/10` : `درجة الألم: ${form.pain}/10`}
            </label>
            <input type="range" min={0} max={10} value={form.pain} onChange={e => setForm(f => ({ ...f, pain: e.target.value }))} disabled={!selectedCheckinId}
              className="w-full" style={{ accentColor: Number(form.pain) >= 7 ? "#ef4444" : Number(form.pain) >= 4 ? "#f59e0b" : "#22c55e" }} />
          </div>

          <div className="mb-6">
            <label className={fieldLabelCls}>
              {lang === "en" ? "Triage Category (ESI-style, 1–5)" : "فئة الفرز"}
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {(["immediate", "emergent", "urgent", "less_urgent", "non_urgent"] as const).map(cat => {
                const cs = categoryStyle(cat);
                const isActive = form.triage_category === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => selectedCheckinId && setForm(f => ({ ...f, triage_category: cat }))}
                    disabled={!selectedCheckinId}
                    className="rounded-lg border px-2 py-2 text-left text-xs font-bold"
                    style={{ background: isActive ? cs.dot : "var(--color-surface)", color: isActive ? "#fff" : cs.text, borderColor: isActive ? cs.dot : "var(--color-border)" }}
                  >
                    {lang === "en" ? cs.label_en : cs.label_ar}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => { void handleSubmit(); }}
            disabled={!selectedCheckinId}
            className="cy-btn cy-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {lang === "en" ? "Save Triage Assessment" : "حفظ تقييم الفرز"}
          </button>
        </div>
      </div>

      <div className="mt-6 text-center text-xs text-ink/50">
        CyMed Clinic · {lang === "en" ? "Triage Assessment" : "تقييم الفرز"} · {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}
