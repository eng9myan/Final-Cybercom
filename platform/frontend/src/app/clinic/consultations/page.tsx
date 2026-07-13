"use client";

import { usePreferences } from "@/contexts/preferences";
import { useAuth } from "@/contexts/auth";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Interfaces (mirror real backend serializers) ──────────────────────────────
// clinic.consultations.ConsultationSerializer: id, encounter, consulted_at,
// consulted_by, subjective, objective, assessment, plan, diagnoses[],
// procedures[], treatment_plan, follow_ups[], attachments[]. No status,
// chief_complaint, patient_detail, or provider_detail fields exist.

interface DiagnosisRaw { id: string; code: string; system: string; display: string; status: string; }
interface ProcedureRaw { id: string; code: string; system: string; display: string; notes: string; }
interface ConsultationRaw {
  id: string;
  encounter: string;
  consulted_at: string;
  consulted_by: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnoses: DiagnosisRaw[];
  procedures: ProcedureRaw[];
}
interface EncounterRaw { id: string; patient: string; encounter_type: string; status: string; }
interface PatientRaw { id: string; first_name: string; last_name: string; mrn: string; dob: string; gender: string; }
interface Paginated<T> { count: number; results: T[]; }

interface Consultation {
  id: string;
  encounter: string;
  patient_name: string;
  mrn: string;
  dob: string;
  gender: string;
  consulted_by: string;
  consulted_at: string;
  encounterType: string;
  encounterStatus: string;
  soap: { subjective: string; objective: string; assessment: string; plan: string };
  diagnoses: DiagnosisRaw[];
  procedures: ProcedureRaw[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function encounterStatusStyle(s: string): { bg: string; text: string } {
  switch (s) {
    case "planned":     return { bg: "#f3f4f6", text: "#374151" };
    case "arrived":     return { bg: "#dbeafe", text: "#1e40af" };
    case "in_progress": return { bg: "#fef9c3", text: "#854d0e" };
    case "finished":    return { bg: "#d1fae5", text: "#065f46" };
    case "cancelled":   return { bg: "#fee2e2", text: "#991b1b" };
    default:            return { bg: "#f3f4f6", text: "#374151" };
  }
}

function encounterStatusLabel(s: string, lang: "en" | "ar"): string {
  const m: Record<string, { en: string; ar: string }> = {
    planned:     { en: "Planned",     ar: "مخطط" },
    arrived:     { en: "Arrived",     ar: "وصل" },
    in_progress: { en: "In Progress", ar: "جارٍ" },
    finished:    { en: "Finished",    ar: "منتهٍ" },
    cancelled:   { en: "Cancelled",   ar: "ملغى" },
  };
  return m[s]?.[lang] ?? s;
}

function isDocumented(soap: Consultation["soap"]): boolean {
  return Boolean(soap.subjective.trim() && soap.objective.trim() && soap.assessment.trim() && soap.plan.trim());
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConsultationsPage() {
  const { session, isAuthenticated } = useAuth();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"soap" | "diagnoses" | "procedures">("soap");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [saveMsg, setSaveMsg] = useState("");

  const [soapEdit, setSoapEdit] = useState<Consultation["soap"]>({ subjective: "", objective: "", assessment: "", plan: "" });
  const [newDiagnosis, setNewDiagnosis] = useState({ code: "", system: "icd11", display: "" });
  const [newProcedure, setNewProcedure] = useState({ code: "", system: "snomed", display: "", notes: "" });

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [consultPage, encounterPage, patientPage] = await Promise.all([
        apiFetch<Paginated<ConsultationRaw>>("/api/v1/clinic/consultations/notes/", opts),
        apiFetch<Paginated<EncounterRaw>>("/api/v1/encounters/", opts),
        apiFetch<Paginated<PatientRaw>>("/api/v1/patients/", opts),
      ]);
      const encounterById = new Map(encounterPage.results.map(e => [e.id, e]));
      const patientById = new Map(patientPage.results.map(p => [p.id, p]));

      const mapped: Consultation[] = consultPage.results.map(c => {
        const encounter = encounterById.get(c.encounter);
        const patient = encounter ? patientById.get(encounter.patient) : undefined;
        return {
          id: c.id,
          encounter: c.encounter,
          patient_name: patient ? `${patient.first_name} ${patient.last_name}` : "Unknown patient",
          mrn: patient?.mrn ?? "—",
          dob: patient?.dob ?? "—",
          gender: patient?.gender ?? "—",
          consulted_by: c.consulted_by,
          consulted_at: c.consulted_at,
          encounterType: encounter?.encounter_type ?? "—",
          encounterStatus: encounter?.status ?? "—",
          soap: {
            subjective: c.subjective ?? "",
            objective: c.objective ?? "",
            assessment: c.assessment ?? "",
            plan: c.plan ?? "",
          },
          diagnoses: c.diagnoses ?? [],
          procedures: c.procedures ?? [],
        };
      });
      setConsultations(mapped);
      const first = mapped[0];
      if (first && !mapped.some(m => m.id === selectedId)) {
        setSelectedId(first.id);
        setSoapEdit({ ...first.soap });
      }
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load consultations."));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData]);

  const selected = consultations.find(c => c.id === selectedId) ?? consultations[0] ?? null;

  const handleSelectConsultation = (c: Consultation) => {
    setSelectedId(c.id);
    setSoapEdit({ ...c.soap });
    setActiveTab("soap");
    setSaveMsg("");
  };

  const handleSaveSOAP = async () => {
    if (!session || !selected) return;
    try {
      await apiFetch(`/api/v1/clinic/consultations/notes/${selected.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ subjective: soapEdit.subjective, objective: soapEdit.objective, assessment: soapEdit.assessment, plan: soapEdit.plan }),
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      setConsultations(prev => prev.map(c => c.id === selected.id ? { ...c, soap: { ...soapEdit } } : c));
      setSaveMsg(lang === "en" ? "SOAP note saved." : "تم حفظ ملاحظة SOAP.");
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setSaveMsg(detail || (lang === "en" ? "Failed to save SOAP note." : "فشل حفظ ملاحظة SOAP."));
    }
    setTimeout(() => setSaveMsg(""), 3000);
  };

  const handleAddDiagnosis = async () => {
    if (!session || !selected || !newDiagnosis.code.trim() || !newDiagnosis.display.trim()) return;
    try {
      const created = await apiFetch<DiagnosisRaw>("/api/v1/clinic/consultations/diagnoses/", {
        method: "POST",
        body: JSON.stringify({ consultation: selected.id, ...newDiagnosis, status: "confirmed" }),
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      setConsultations(prev => prev.map(c => c.id === selected.id ? { ...c, diagnoses: [...c.diagnoses, created] } : c));
      setNewDiagnosis({ code: "", system: "icd11", display: "" });
      setSaveMsg(lang === "en" ? "Diagnosis added." : "تمت إضافة التشخيص.");
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setSaveMsg(detail || (lang === "en" ? "Failed to add diagnosis — check the code is valid for the selected system." : "فشل إضافة التشخيص."));
    }
    setTimeout(() => setSaveMsg(""), 3000);
  };

  const handleAddProcedure = async () => {
    if (!session || !selected || !newProcedure.code.trim() || !newProcedure.display.trim()) return;
    try {
      const created = await apiFetch<ProcedureRaw>("/api/v1/clinic/consultations/procedures/", {
        method: "POST",
        body: JSON.stringify({ consultation: selected.id, ...newProcedure }),
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      setConsultations(prev => prev.map(c => c.id === selected.id ? { ...c, procedures: [...c.procedures, created] } : c));
      setNewProcedure({ code: "", system: "snomed", display: "", notes: "" });
      setSaveMsg(lang === "en" ? "Procedure added." : "تمت إضافة الإجراء.");
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setSaveMsg(detail || (lang === "en" ? "Failed to add procedure." : "فشل إضافة الإجراء."));
    }
    setTimeout(() => setSaveMsg(""), 3000);
  };

  const filtered = filterStatus === "all" ? consultations : consultations.filter(c => c.encounterStatus === filterStatus);
  const dir = lang === "ar" ? "rtl" : "ltr";

  const soapFields: Array<{ key: keyof Consultation["soap"]; label_en: string; label_ar: string; hint_en: string; hint_ar: string }> = [
    { key: "subjective",  label_en: "Subjective (S)",  label_ar: "ذاتي (S)",      hint_en: "Patient's account — history, symptoms, complaints", hint_ar: "رواية المريض — التاريخ والأعراض والشكاوى" },
    { key: "objective",   label_en: "Objective (O)",   label_ar: "موضوعي (O)",    hint_en: "Clinician observations — vitals, exam, investigations", hint_ar: "ملاحظات الطبيب — الإشارات الحيوية والفحص والفحوصات" },
    { key: "assessment",  label_en: "Assessment (A)",  label_ar: "تقييم (A)",     hint_en: "Diagnoses and differential diagnoses", hint_ar: "التشخيصات والتشخيصات التفريقية" },
    { key: "plan",        label_en: "Plan (P)",        label_ar: "خطة (P)",       hint_en: "Treatment plan, orders, follow-up", hint_ar: "خطة العلاج والطلبات والمتابعة" },
  ];

  const inputCls = "w-full rounded-lg border border-ink/10 bg-surface px-3.5 py-2.5 text-sm text-ink";
  const labelCls = "mb-1 block text-[13px] font-bold text-brand-400";

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">
          {lang === "en" ? "Unable to load consultations" : "تعذر تحميل الاستشارات"}
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
            {lang === "en" ? "Consultations & EMR" : "الاستشارات والسجلات الطبية"}
          </h1>
          <p className="mt-1 text-sm text-ink/50">
            {lang === "en" ? "SOAP documentation, diagnoses, and procedures" : "توثيق SOAP والتشخيصات والإجراءات"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-sm text-ink/50">{lang === "en" ? "Syncing..." : "جارٍ التزامن..."}</span>}
          <button onClick={() => setLang(l => l === "en" ? "ar" : "en")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
            {lang === "en" ? "العربية" : "English"}
          </button>
        </div>
      </header>

      {/* Sibling nav */}
      <nav className="mb-8 flex flex-wrap gap-2.5">
        {[
          { href: "/clinic/appointments",  label: lang === "en" ? "Appointments"  : "المواعيد" },
          { href: "/clinic/reception",     label: lang === "en" ? "Reception"     : "الاستقبال" },
          { href: "/clinic/triage",        label: lang === "en" ? "Triage"        : "الفرز" },
          { href: "/clinic/telemedicine",  label: lang === "en" ? "Telemedicine"  : "التطبيب عن بُعد" },
        ].map(n => (
          <a key={n.href} href={n.href} className="rounded-md border border-ink/10 bg-surface px-4 py-2 text-xs font-semibold hover:bg-ink/5">
            {n.label}
          </a>
        ))}
      </nav>

      {/* Summary metrics */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: lang === "en" ? "In Progress" : "جارٍ",          value: consultations.filter(c => c.encounterStatus === "in_progress").length, color: "#f59e0b" },
          { label: lang === "en" ? "Finished"    : "منتهٍ",          value: consultations.filter(c => c.encounterStatus === "finished").length,    color: "#22c55e" },
          { label: lang === "en" ? "Documented"  : "موثّق",          value: consultations.filter(c => isDocumented(c.soap)).length,                 color: "#3b82f6" },
          { label: lang === "en" ? "Total"       : "الإجمالي",       value: consultations.length,                                                    color: "#22D3EE" },
        ].map(m => (
          <div key={m.label} className="cy-card p-5 text-center">
            <p className="text-3xl font-bold" style={{ color: m.color }}>{m.value}</p>
            <p className="mt-1 text-xs font-medium text-ink/50">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-[300px_1fr] items-start gap-6">

        {/* LEFT — consultation list */}
        <div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(["all", "planned", "arrived", "in_progress", "finished", "cancelled"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`rounded px-2.5 py-1.5 text-xs font-semibold border ${filterStatus === f ? "border-brand-400 bg-brand-500 text-white" : "border-ink/10 bg-surface text-ink hover:bg-ink/5"}`}
              >
                {f === "all" ? (lang === "en" ? "All" : "الكل") : encounterStatusLabel(f, lang)}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            {filtered.map(c => {
              const ss = encounterStatusStyle(c.encounterStatus);
              const isSelected = c.id === selectedId;
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectConsultation(c)}
                  className={`cursor-pointer rounded-xl border p-3.5 ${isSelected ? "border-2 border-brand-400 shadow-[0_0_0_3px_rgba(237,108,0,0.12)]" : "border-ink/10 bg-surface"}`}
                >
                  <div className="mb-1 flex items-start justify-between">
                    <span className="text-sm font-bold">{c.patient_name}</span>
                    <span className="ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: ss.bg, color: ss.text }}>
                      {encounterStatusLabel(c.encounterStatus, lang)}
                    </span>
                  </div>
                  <div className="mb-1 text-xs text-ink/50">{c.mrn}</div>
                  <div className="mb-1 text-[13px]">{c.encounterType}</div>
                  <div className="text-xs text-ink/50">
                    {c.consulted_by} · {new Date(c.consulted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {isDocumented(c.soap) && (
                    <div className="mt-2 text-xs font-semibold text-emerald-400">
                      {lang === "en" ? "✓ SOAP documented" : "✓ تم توثيق SOAP"}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="p-4 text-sm text-ink/40">
                {lang === "en" ? "No consultations." : "لا توجد استشارات."}
              </p>
            )}
          </div>
        </div>

        {/* RIGHT — EMR detail panel */}
        {!selected ? <div className="p-8 text-ink/50">{lang === "en" ? "No consultation selected." : "لم يتم تحديد استشارة."}</div> : <div className="cy-card overflow-hidden p-0">

          {/* Patient header */}
          <div className="border-b border-ink/10 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{selected.patient_name}</h2>
                <div className="mt-1.5 flex flex-wrap gap-4 text-sm text-ink/50">
                  <span>{selected.mrn}</span>
                  <span>{selected.gender}</span>
                  <span>DOB: {selected.dob}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-ink/50">{selected.consulted_by}</div>
                <div className="text-sm text-ink/50">{selected.encounterType}</div>
                <div className="text-[13px] font-bold text-brand-400">
                  {new Date(selected.consulted_at).toLocaleString(lang === "ar" ? "ar-SA" : "en-GB")}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-ink/10">
            {(["soap", "diagnoses", "procedures"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`-mb-px flex-1 border-b-2 p-3.5 text-sm font-bold ${activeTab === tab ? "border-brand-400 bg-surface-overlay text-brand-400" : "border-transparent text-ink/50 hover:text-ink"}`}
              >
                {tab === "soap"       ? (lang === "en" ? "SOAP Note"  : "ملاحظة SOAP") :
                 tab === "diagnoses"  ? (lang === "en" ? "Diagnoses"  : "التشخيصات") :
                                        (lang === "en" ? "Procedures" : "الإجراءات")}
                {tab === "diagnoses" && ` (${selected.diagnoses.length})`}
                {tab === "procedures" && ` (${selected.procedures.length})`}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-6">
            {saveMsg && (
              <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-400">
                {saveMsg}
              </div>
            )}

            {/* SOAP tab */}
            {activeTab === "soap" && (
              <div>
                {soapFields.map(field => (
                  <div key={field.key} className="mb-5">
                    <label className={labelCls}>
                      {lang === "en" ? field.label_en : field.label_ar}
                    </label>
                    <p className="mb-1.5 text-xs italic text-ink/50">
                      {lang === "en" ? field.hint_en : field.hint_ar}
                    </p>
                    <textarea
                      value={soapEdit[field.key]}
                      onChange={e => setSoapEdit(prev => ({ ...prev, [field.key]: e.target.value }))}
                      rows={field.key === "plan" ? 5 : 4}
                      className={`${inputCls} resize-y leading-relaxed`}
                    />
                  </div>
                ))}
                <button onClick={() => { void handleSaveSOAP(); }} className="cy-btn cy-btn-primary">
                  {lang === "en" ? "Save SOAP Note" : "حفظ ملاحظة SOAP"}
                </button>
              </div>
            )}

            {/* Diagnoses tab */}
            {activeTab === "diagnoses" && (
              <div>
                {selected.diagnoses.length > 0 ? (
                  <div className="mb-6 overflow-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-ink/10">
                          {[lang === "en" ? "Code" : "الرمز", lang === "en" ? "System" : "النظام", lang === "en" ? "Description" : "الوصف", lang === "en" ? "Status" : "الحالة"].map(h => (
                            <th key={h} className={`px-3.5 py-2.5 text-xs font-bold uppercase text-ink/50 ${lang === "ar" ? "text-right" : "text-left"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selected.diagnoses.map(d => (
                          <tr key={d.id} className="border-b border-ink/5">
                            <td className="px-3.5 py-2.5 font-mono text-sm font-bold">{d.code}</td>
                            <td className="px-3.5 py-2.5 text-xs uppercase text-ink/50">{d.system}</td>
                            <td className="px-3.5 py-2.5 text-sm">{d.display}</td>
                            <td className="px-3.5 py-2.5 text-sm">{d.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mb-6 text-sm text-ink/50">
                    {lang === "en" ? "No diagnoses recorded yet." : "لا توجد تشخيصات مسجلة حتى الآن."}
                  </p>
                )}
                <div className="cy-card p-5">
                  <h3 className="mb-4 text-sm font-bold text-brand-400">
                    {lang === "en" ? "Add Diagnosis" : "إضافة تشخيص"}
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    <select
                      value={newDiagnosis.system}
                      onChange={e => setNewDiagnosis(prev => ({ ...prev, system: e.target.value }))}
                      className="min-w-[100px] rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="icd11">ICD-11</option>
                      <option value="snomed">SNOMED</option>
                    </select>
                    <input
                      type="text"
                      value={newDiagnosis.code}
                      onChange={e => setNewDiagnosis(prev => ({ ...prev, code: e.target.value }))}
                      placeholder={lang === "en" ? "Code (e.g. E11.65)" : "الرمز"}
                      className="w-32 rounded-lg border border-ink/10 bg-surface px-3 py-2 font-mono text-sm text-ink"
                    />
                    <input
                      type="text"
                      value={newDiagnosis.display}
                      onChange={e => setNewDiagnosis(prev => ({ ...prev, display: e.target.value }))}
                      placeholder={lang === "en" ? "Description..." : "الوصف..."}
                      className="min-w-[180px] flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink"
                    />
                    <button onClick={() => { void handleAddDiagnosis(); }} className="cy-btn cy-btn-primary !min-h-0 whitespace-nowrap !py-2 !px-5 text-sm">
                      {lang === "en" ? "Add" : "إضافة"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Procedures tab */}
            {activeTab === "procedures" && (
              <div>
                {selected.procedures.length > 0 ? (
                  <div className="mb-6 overflow-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-ink/10">
                          {[lang === "en" ? "Code" : "الرمز", lang === "en" ? "System" : "النظام", lang === "en" ? "Description" : "الوصف", lang === "en" ? "Notes" : "ملاحظات"].map(h => (
                            <th key={h} className={`px-3.5 py-2.5 text-xs font-bold uppercase text-ink/50 ${lang === "ar" ? "text-right" : "text-left"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selected.procedures.map(p => (
                          <tr key={p.id} className="border-b border-ink/5">
                            <td className="px-3.5 py-2.5 font-mono text-sm font-bold">{p.code}</td>
                            <td className="px-3.5 py-2.5 text-xs uppercase text-ink/50">{p.system}</td>
                            <td className="px-3.5 py-2.5 text-sm">{p.display}</td>
                            <td className="px-3.5 py-2.5 text-xs text-ink/50">{p.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mb-6 text-sm text-ink/50">
                    {lang === "en" ? "No procedures recorded yet." : "لا توجد إجراءات مسجلة حتى الآن."}
                  </p>
                )}
                <div className="cy-card p-5">
                  <h3 className="mb-4 text-sm font-bold text-brand-400">
                    {lang === "en" ? "Add Procedure" : "إضافة إجراء"}
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    <select
                      value={newProcedure.system}
                      onChange={e => setNewProcedure(prev => ({ ...prev, system: e.target.value }))}
                      className="min-w-[100px] rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="snomed">SNOMED</option>
                      <option value="loinc">LOINC</option>
                    </select>
                    <input
                      type="text"
                      value={newProcedure.code}
                      onChange={e => setNewProcedure(prev => ({ ...prev, code: e.target.value }))}
                      placeholder={lang === "en" ? "Code..." : "الرمز..."}
                      className="w-32 rounded-lg border border-ink/10 bg-surface px-3 py-2 font-mono text-sm text-ink"
                    />
                    <input
                      type="text"
                      value={newProcedure.display}
                      onChange={e => setNewProcedure(prev => ({ ...prev, display: e.target.value }))}
                      placeholder={lang === "en" ? "Description..." : "الوصف..."}
                      className="min-w-[160px] flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink"
                    />
                    <input
                      type="text"
                      value={newProcedure.notes}
                      onChange={e => setNewProcedure(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder={lang === "en" ? "Notes..." : "ملاحظات..."}
                      className="min-w-[140px] flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink"
                    />
                    <button onClick={() => { void handleAddProcedure(); }} className="cy-btn cy-btn-primary !min-h-0 whitespace-nowrap !py-2 !px-5 text-sm">
                      {lang === "en" ? "Add" : "إضافة"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>}
      </div>

      <div className="mt-6 text-center text-xs text-ink/50">
        CyMed Clinic · {lang === "en" ? "Consultations & EMR" : "الاستشارات والسجلات الطبية"} · {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}
