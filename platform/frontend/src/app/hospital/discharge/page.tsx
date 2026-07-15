"use client";

import { useState, useEffect, useCallback } from "react";
import { LogOut } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface Admission { id: string; encounter: string; status: "admitted" | "discharged"; }
interface Encounter { id: string; patient: string; }
interface Patient { id: string; first_name: string; last_name: string; mrn: string; }
interface DischargeChecklist { id: string; stay: string; task_name: string; status: "pending" | "completed"; }
interface DischargeMedication { id: string; stay: string; medication_code: string; reconciliation_action: string; }
interface FollowUpAppointment { id: string; stay: string; specialty_code: string; target_date: string; }
interface DischargeInstruction { id: string; stay: string; dietary_instructions: string; activity_restrictions: string; warning_symptoms: string; }
interface HospitalStay { id: string; admission: string; }
interface Paginated<T> { count: number; results: T[]; }

function unwrap<T>(data: Paginated<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

export default function DischargePage() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [stays, setStays] = useState<HospitalStay[]>([]);
  const [checklists, setChecklists] = useState<DischargeChecklist[]>([]);
  const [medications, setMedications] = useState<DischargeMedication[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpAppointment[]>([]);
  const [instructions, setInstructions] = useState<DischargeInstruction[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState<string | null>(null);

  const [medForm, setMedForm] = useState({ drugName: "", dose: "", frequency: "", durationDays: "7", instructions: "" });
  const [followUpForm, setFollowUpForm] = useState({ specialty: "", targetDate: "" });

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    const opts = { token: session.accessToken, tenantId: session.tenantId };
    try {
      const [admissionData, encounterData, patientData, stayData, checklistData, medData, followUpData, instrData] = await Promise.all([
        apiFetch<Paginated<Admission> | Admission[]>("/api/v1/hospital/adt/admissions/?status=admitted", opts),
        apiFetch<Paginated<Encounter> | Encounter[]>("/api/v1/encounters/", opts),
        apiFetch<Paginated<Patient> | Patient[]>("/api/v1/patients/", opts),
        apiFetch<Paginated<HospitalStay> | HospitalStay[]>("/api/v1/hospital/inpatient/stays/", opts),
        apiFetch<Paginated<DischargeChecklist> | DischargeChecklist[]>("/api/v1/hospital/discharge/checklists/", opts),
        apiFetch<Paginated<DischargeMedication> | DischargeMedication[]>("/api/v1/hospital/discharge/medications/", opts),
        apiFetch<Paginated<FollowUpAppointment> | FollowUpAppointment[]>("/api/v1/hospital/discharge/followups/", opts),
        apiFetch<Paginated<DischargeInstruction> | DischargeInstruction[]>("/api/v1/hospital/discharge/instructions/", opts),
      ]);
      setAdmissions(unwrap(admissionData));
      setEncounters(unwrap(encounterData));
      setPatients(unwrap(patientData));
      setStays(unwrap(stayData));
      setChecklists(unwrap(checklistData));
      setMedications(unwrap(medData));
      setFollowUps(unwrap(followUpData));
      setInstructions(unwrap(instrData));
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل بيانات الخروج." : "Failed to load discharge data."));
    }
  }, [session, isAr]);

  useEffect(() => { void loadData(); }, [loadData]);

  const patientForAdmission = (admissionId: string): Patient | undefined => {
    const adm = admissions.find(a => a.id === admissionId);
    if (!adm) return undefined;
    const enc = encounters.find(e => e.id === adm.encounter);
    if (!enc) return undefined;
    return patients.find(p => p.id === enc.patient);
  };
  const stayForAdmission = (admissionId: string) => stays.find(s => s.admission === admissionId);

  async function completeChecklist(admissionId: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/discharge/checklists/complete/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({ admission_id: admissionId, completed_by: session.userId }),
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل إكمال القائمة." : "Failed to complete checklist."));
    } finally {
      setBusy(false);
    }
  }

  async function addMedication(admissionId: string) {
    if (!session || !medForm.drugName || !medForm.dose) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/discharge/medications/reconcile/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({
          admission_id: admissionId, drug_name: medForm.drugName, dose: medForm.dose,
          frequency: medForm.frequency, duration_days: Number(medForm.durationDays), instructions: medForm.instructions,
        }),
      });
      setMedForm({ drugName: "", dose: "", frequency: "", durationDays: "7", instructions: "" });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل إضافة دواء الخروج." : "Failed to add discharge medication."));
    } finally {
      setBusy(false);
    }
  }

  async function scheduleFollowUp(admissionId: string) {
    if (!session || !followUpForm.specialty || !followUpForm.targetDate) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/discharge/followups/schedule/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({
          admission_id: admissionId, provider_id: session.userId,
          specialty: followUpForm.specialty, scheduled_at: followUpForm.targetDate,
        }),
      });
      setFollowUpForm({ specialty: "", targetDate: "" });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل جدولة موعد المتابعة." : "Failed to schedule follow-up."));
    } finally {
      setBusy(false);
    }
  }

  async function generateInstructions(admissionId: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/hospital/discharge/instructions/generate/", {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
        body: JSON.stringify({ admission_id: admissionId, language: isAr ? "ar" : "en" }),
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل إنشاء تعليمات الخروج." : "Failed to generate discharge instructions."));
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><LogOut size={22} /> {isAr ? "تخطيط الخروج" : "Discharge Planning"}</h1>
          <p className="mt-1 text-sm text-ink/50">{isAr ? "القائمة، تسوية الأدوية، جدولة المتابعة، والتعليمات لكل مريض مقيم" : "Checklist, medication reconciliation, follow-up scheduling, and instructions per admitted patient"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      {fetchError && <div role="alert" className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{fetchError}</div>}

      <div className="grid gap-3">
        {admissions.length === 0 && <div className="cy-card p-6 text-center text-sm text-ink/40">{isAr ? "لا يوجد مرضى مقيمون." : "No admitted patients."}</div>}
        {admissions.map(adm => {
          const p = patientForAdmission(adm.id);
          const stay = stayForAdmission(adm.id);
          const checklist = stay ? checklists.filter(c => c.stay === stay.id) : [];
          const meds = stay ? medications.filter(m => m.stay === stay.id) : [];
          const followUp = stay ? followUps.filter(f => f.stay === stay.id) : [];
          const instr = stay ? instructions.find(i => i.stay === stay.id) : undefined;
          const expanded = selectedAdmission === adm.id;
          const checklistDone = checklist.some(c => c.status === "completed");
          return (
            <div key={adm.id} className="cy-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{p ? `${p.first_name} ${p.last_name} (${p.mrn})` : `${isAr ? "قبول" : "Admission"} ${adm.id.slice(0, 8)}`}</div>
                  <div className="mt-1 flex gap-3 text-xs text-ink/50">
                    <span className={checklistDone ? "text-emerald-400" : ""}>{checklistDone ? (isAr ? "✓ القائمة" : "✓ Checklist") : (isAr ? "○ القائمة" : "○ Checklist")}</span>
                    <span>{isAr ? `${meds.length} دواء تمت تسويته` : `${meds.length} meds reconciled`}</span>
                    <span>{isAr ? `${followUp.length} موعد متابعة` : `${followUp.length} follow-ups`}</span>
                    <span className={instr ? "text-emerald-400" : ""}>{instr ? (isAr ? "✓ التعليمات" : "✓ Instructions") : (isAr ? "○ التعليمات" : "○ Instructions")}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedAdmission(expanded ? null : adm.id)} className="rounded-md border border-brand-400/40 px-3 py-1.5 text-xs font-semibold text-brand-300 hover:bg-brand-500/10">
                  {expanded ? (isAr ? "إغلاق" : "Close") : (isAr ? "إدارة" : "Manage")}
                </button>
              </div>

              {expanded && (
                <div className="mt-4 grid gap-4 border-t border-ink/10 pt-4 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/40">{isAr ? "القائمة" : "Checklist"}</h3>
                    {checklistDone ? (
                      <p className="text-sm text-emerald-400">{isAr ? "اكتملت المراجعة النهائية." : "Final review completed."}</p>
                    ) : (
                      <button disabled={busy} onClick={() => completeChecklist(adm.id)} className="cy-btn cy-btn-primary !min-h-0 !py-1.5 !px-3 text-xs disabled:opacity-50">{isAr ? "إكمال المراجعة النهائية" : "Complete Final Review"}</button>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/40">{isAr ? "تعليمات الخروج" : "Discharge Instructions"}</h3>
                    {instr ? (
                      <div className="text-xs text-ink/60">
                        <p><b>{isAr ? "النظام الغذائي:" : "Diet:"}</b> {instr.dietary_instructions}</p>
                        <p><b>{isAr ? "النشاط:" : "Activity:"}</b> {instr.activity_restrictions}</p>
                        <p className="text-amber-400"><b>{isAr ? "علامات التحذير:" : "Warning signs:"}</b> {instr.warning_symptoms}</p>
                      </div>
                    ) : (
                      <button disabled={busy} onClick={() => generateInstructions(adm.id)} className="cy-btn cy-btn-primary !min-h-0 !py-1.5 !px-3 text-xs disabled:opacity-50">{isAr ? "إنشاء التعليمات" : "Generate Instructions"}</button>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/40">{isAr ? "تسوية الأدوية" : "Medication Reconciliation"}</h3>
                    <div className="mb-2 grid gap-1">
                      {meds.map(m => <div key={m.id} className="text-xs text-ink/60">{m.medication_code} — {m.reconciliation_action}</div>)}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input value={medForm.drugName} onChange={e => setMedForm(f => ({ ...f, drugName: e.target.value }))} placeholder={isAr ? "الدواء" : "Drug"} className="rounded-md border border-ink/10 bg-surface px-2 py-1 text-xs" />
                      <input value={medForm.dose} onChange={e => setMedForm(f => ({ ...f, dose: e.target.value }))} placeholder={isAr ? "الجرعة" : "Dose"} className="rounded-md border border-ink/10 bg-surface px-2 py-1 text-xs" />
                      <input value={medForm.frequency} onChange={e => setMedForm(f => ({ ...f, frequency: e.target.value }))} placeholder={isAr ? "التكرار" : "Frequency"} className="rounded-md border border-ink/10 bg-surface px-2 py-1 text-xs" />
                      <input type="number" value={medForm.durationDays} onChange={e => setMedForm(f => ({ ...f, durationDays: e.target.value }))} placeholder={isAr ? "أيام" : "Days"} className="rounded-md border border-ink/10 bg-surface px-2 py-1 text-xs" />
                    </div>
                    <button disabled={busy || !medForm.drugName || !medForm.dose} onClick={() => addMedication(adm.id)} className="cy-btn cy-btn-ghost !min-h-0 mt-1.5 !py-1 !px-2.5 text-xs disabled:opacity-50">{isAr ? "إضافة" : "Add"}</button>
                  </div>

                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/40">{isAr ? "موعد المتابعة" : "Follow-Up Appointment"}</h3>
                    <div className="mb-2 grid gap-1">
                      {followUp.map(f => <div key={f.id} className="text-xs text-ink/60">{f.specialty_code} — {new Date(f.target_date).toLocaleDateString()}</div>)}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input value={followUpForm.specialty} onChange={e => setFollowUpForm(f => ({ ...f, specialty: e.target.value }))} placeholder={isAr ? "التخصص" : "Specialty"} className="rounded-md border border-ink/10 bg-surface px-2 py-1 text-xs" />
                      <input type="date" value={followUpForm.targetDate} onChange={e => setFollowUpForm(f => ({ ...f, targetDate: e.target.value }))} className="rounded-md border border-ink/10 bg-surface px-2 py-1 text-xs" />
                    </div>
                    <button disabled={busy || !followUpForm.specialty || !followUpForm.targetDate} onClick={() => scheduleFollowUp(adm.id)} className="cy-btn cy-btn-ghost !min-h-0 mt-1.5 !py-1 !px-2.5 text-xs disabled:opacity-50">{isAr ? "جدولة" : "Schedule"}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
