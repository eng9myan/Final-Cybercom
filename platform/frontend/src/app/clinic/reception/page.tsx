"use client";

import { usePreferences } from "@/contexts/preferences";
import { useAuth } from "@/contexts/auth";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Interfaces (mirror real backend serializers) ──────────────────────────────
// clinic.reception.CheckInSerializer: id, patient, appointment, arrival_method,
// visit_reason, status, checkin_time, queue_ticket{id, ticket_number, status,
// priority}. status/arrival_method/visit_reason are FK ids to tenant-defined
// reference data, not fixed enums. No phone/specialty fields exist.

interface RefEntity { id: string; name: string; code: string; }
interface QueueTicketRaw { id: string; ticket_number: string; status: string; priority: string; }
interface CheckInRaw {
  id: string;
  patient: string;
  appointment: string | null;
  arrival_method: string;
  visit_reason: string;
  status: string;
  checkin_time: string;
  queue_ticket: QueueTicketRaw | null;
}
interface PatientRaw { id: string; first_name: string; last_name: string; mrn: string; dob: string; }
interface Paginated<T> { count: number; results: T[]; }

interface Row {
  id: string;
  patient_name: string;
  mrn: string;
  checkin_time: string;
  arrival_method: string;
  visit_reason: string;
  status: string;
  ticket: QueueTicketRaw | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ticketStatusBadge(st: string | undefined, lang: "en" | "ar") {
  const map: Record<string, { en: string; ar: string; bg: string; color: string }> = {
    waiting:   { en: "Waiting",   ar: "انتظار",       bg: "#fef3c7", color: "#92400e" },
    called:    { en: "Called",    ar: "تم الاستدعاء", bg: "#ede9fe", color: "#5b21b6" },
    active:    { en: "Active",    ar: "نشط",           bg: "#dbeafe", color: "#1e40af" },
    completed: { en: "Completed", ar: "مكتمل",         bg: "#d1fae5", color: "#065f46" },
    skipped:   { en: "Skipped",   ar: "تم التخطي",     bg: "#fee2e2", color: "#991b1b" },
  };
  const b = map[st ?? ""] ?? { en: "No ticket", ar: "بلا تذكرة", bg: "#f3f4f6", color: "#374151" };
  return { label: b[lang], bg: b.bg, color: b.color };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReceptionPage() {
  const { session, isAuthenticated } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [patients, setPatients] = useState<PatientRaw[]>([]);
  const [arrivalMethods, setArrivalMethods] = useState<RefEntity[]>([]);
  const [visitReasons, setVisitReasons] = useState<RefEntity[]>([]);
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [mrnInput, setMrnInput] = useState("");
  const [mrnLookupResult, setMrnLookupResult] = useState<string>("");
  const [lookedUpPatient, setLookedUpPatient] = useState<PatientRaw | null>(null);
  const [arrivalMethodInput, setArrivalMethodInput] = useState("");
  const [visitReasonInput, setVisitReasonInput] = useState("");
  const [checkInMsg, setCheckInMsg] = useState("");

  const [filterTicketStatus, setFilterTicketStatus] = useState<string>("all");
  const [actionMsg, setActionMsg] = useState("");

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [checkinsPage, patientsPage, arrivalPage, reasonPage, statusPage] = await Promise.all([
        apiFetch<Paginated<CheckInRaw>>("/api/v1/clinic/reception/checkins/", opts),
        apiFetch<Paginated<PatientRaw>>("/api/v1/patients/", opts),
        apiFetch<Paginated<RefEntity>>("/api/v1/clinic/reception/arrival-methods/", opts),
        apiFetch<Paginated<RefEntity>>("/api/v1/clinic/reception/visit-reasons/", opts),
        apiFetch<Paginated<RefEntity>>("/api/v1/clinic/reception/visit-statuses/", opts),
      ]);
      const patientById = new Map(patientsPage.results.map(p => [p.id, p]));
      const arrivalById = new Map(arrivalPage.results.map(a => [a.id, a]));
      const reasonById = new Map(reasonPage.results.map(r => [r.id, r]));
      const statusById = new Map(statusPage.results.map(s => [s.id, s]));

      const mapped: Row[] = checkinsPage.results.map(c => {
        const patient = patientById.get(c.patient);
        return {
          id: c.id,
          patient_name: patient ? `${patient.first_name} ${patient.last_name}` : "Unknown patient",
          mrn: patient?.mrn ?? "—",
          checkin_time: c.checkin_time ? new Date(c.checkin_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--",
          arrival_method: arrivalById.get(c.arrival_method)?.name ?? "—",
          visit_reason: reasonById.get(c.visit_reason)?.name ?? "—",
          status: statusById.get(c.status)?.name ?? "—",
          ticket: c.queue_ticket,
        };
      });
      setRows(mapped);
      setPatients(patientsPage.results);
      setArrivalMethods(arrivalPage.results);
      setVisitReasons(reasonPage.results);
      if (!arrivalMethodInput && arrivalPage.results[0]) setArrivalMethodInput(arrivalPage.results[0].id);
      if (!visitReasonInput && reasonPage.results[0]) setVisitReasonInput(reasonPage.results[0].id);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : "Failed to load reception data."));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleMrnLookup = () => {
    const found = patients.find(p => p.mrn.toLowerCase() === mrnInput.toLowerCase().trim());
    setLookedUpPatient(found ?? null);
    if (found) {
      setMrnLookupResult(lang === "en" ? `Found: ${found.first_name} ${found.last_name} · DOB: ${found.dob}` : `تم العثور على: ${found.first_name} ${found.last_name}`);
    } else {
      setMrnLookupResult(lang === "en" ? "No patient found with that MRN." : "لم يُعثر على مريض بهذا الرقم الطبي.");
    }
  };

  const handleCheckIn = async () => {
    if (!session) return;
    if (!lookedUpPatient) {
      setCheckInMsg(lang === "en" ? "Look up a valid patient MRN first." : "يرجى البحث عن رقم طبي صالح أولاً.");
      return;
    }
    if (!arrivalMethodInput || !visitReasonInput) {
      setCheckInMsg(lang === "en" ? "Select arrival method and visit reason." : "اختر طريقة الوصول وسبب الزيارة.");
      return;
    }
    try {
      await apiFetch("/api/v1/clinic/reception/checkins/", {
        method: "POST",
        body: JSON.stringify({ patient: lookedUpPatient.id, arrival_method: arrivalMethodInput, visit_reason: visitReasonInput }),
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      setCheckInMsg(lang === "en" ? `${lookedUpPatient.first_name} ${lookedUpPatient.last_name} checked in.` : `تم تسجيل وصول ${lookedUpPatient.first_name} ${lookedUpPatient.last_name}.`);
      setMrnInput("");
      setMrnLookupResult("");
      setLookedUpPatient(null);
      await loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setCheckInMsg(detail || (lang === "en" ? "Check-in failed." : "فشل تسجيل الوصول."));
    }
    setTimeout(() => setCheckInMsg(""), 4000);
  };

  const handleCall = async (row: Row) => {
    if (!session || !row.ticket) return;
    try {
      await apiFetch(`/api/v1/clinic/reception/tickets/${row.ticket.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: "called" }),
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      setRows(prev => prev.map(r => r.id === row.id && r.ticket ? { ...r, ticket: { ...r.ticket, status: "called" } } : r));
      setActionMsg(lang === "en" ? `${row.patient_name} called to the desk.` : `تم استدعاء ${row.patient_name} إلى المكتب.`);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setActionMsg(detail || (lang === "en" ? "Action failed." : "فشل الإجراء."));
    }
    setTimeout(() => setActionMsg(""), 3000);
  };

  const filtered = filterTicketStatus === "all" ? rows : rows.filter(r => (r.ticket?.status ?? "") === filterTicketStatus);
  const dir = lang === "ar" ? "rtl" : "ltr";

  const metrics = {
    waiting_now:  rows.filter(r => r.ticket?.status === "waiting").length,
    checked_in:   rows.length,
    called:       rows.filter(r => r.ticket?.status === "called").length,
    completed:    rows.filter(r => r.ticket?.status === "completed").length,
  };

  const fieldLabelCls = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink/50";
  const fieldInputCls = "w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink";

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">
          {lang === "en" ? "Unable to load reception data" : "تعذر تحميل بيانات الاستقبال"}
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
            {lang === "en" ? "Reception Desk" : "مكتب الاستقبال"}
          </h1>
          <p className="mt-1 text-sm text-ink/50">
            {lang === "en" ? "Patient check-in and queue management" : "تسجيل وصول المرضى وإدارة الطابور"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-sm text-ink/50">{lang === "en" ? "Syncing..." : "جارٍ التزامن..."}</span>}
          <button onClick={() => setLang(l => l === "en" ? "ar" : "en")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
            {lang === "en" ? "العربية" : "English"}
          </button>
        </div>
      </header>

      {/* Metrics */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: lang === "en" ? "Waiting Now"      : "في الانتظار",      value: metrics.waiting_now, color: "#f59e0b" },
          { label: lang === "en" ? "Checked In Today" : "المسجّلون اليوم",  value: metrics.checked_in,  color: "#22D3EE" },
          { label: lang === "en" ? "Called"           : "تم الاستدعاء",     value: metrics.called,      color: "#8b5cf6" },
          { label: lang === "en" ? "Completed"        : "مكتمل",            value: metrics.completed,   color: "#22c55e" },
        ].map(m => (
          <div key={m.label} className="cy-card p-5 text-center">
            <p className="text-3xl font-bold" style={{ color: m.color }}>{m.value}</p>
            <p className="mt-1 text-xs font-medium text-ink/50">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Main two-column layout */}
      <div className="grid grid-cols-[1fr_360px] items-start gap-6">

        {/* LEFT — Queue table */}
        <div>
          {actionMsg && (
            <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-400">
              {actionMsg}
            </div>
          )}

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              {lang === "en" ? "Waiting Queue" : "طابور الانتظار"}
            </h2>
            <div className="flex gap-2">
              {(["all", "waiting", "called", "active", "completed"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterTicketStatus(f)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold border ${filterTicketStatus === f ? "border-brand-400 bg-brand-500 text-white" : "border-ink/10 bg-surface text-ink hover:bg-ink/5"}`}
                >
                  {f === "all" ? (lang === "en" ? "All" : "الكل") : ticketStatusBadge(f, lang).label}
                </button>
              ))}
            </div>
          </div>

          <div className="cy-card overflow-hidden p-0">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-ink/10">
                  {[
                    lang === "en" ? "Check-in"  : "وقت الوصول",
                    lang === "en" ? "Patient"   : "المريض",
                    lang === "en" ? "MRN"       : "الرقم الطبي",
                    lang === "en" ? "Arrival"   : "الوصول",
                    lang === "en" ? "Reason"    : "السبب",
                    lang === "en" ? "Ticket"    : "التذكرة",
                    lang === "en" ? "Status"    : "الحالة",
                    lang === "en" ? "Actions"   : "إجراءات",
                  ].map(h => (
                    <th key={h} className={`px-3.5 py-3 text-xs font-bold uppercase tracking-wide text-ink/50 ${lang === "ar" ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                  const stb = ticketStatusBadge(row.ticket?.status, lang);
                  return (
                    <tr key={row.id} className="border-b border-ink/5">
                      <td className="px-3.5 py-3 text-sm font-bold text-brand-400">{row.checkin_time}</td>
                      <td className="px-3.5 py-3">
                        <div className="text-sm font-semibold">{row.patient_name}</div>
                        <div className="text-xs text-ink/50">{row.status}</div>
                      </td>
                      <td className="px-3.5 py-3 font-mono text-[13px] text-ink/50">{row.mrn}</td>
                      <td className="px-3.5 py-3 text-sm">{row.arrival_method}</td>
                      <td className="px-3.5 py-3 text-sm">{row.visit_reason}</td>
                      <td className="px-3.5 py-3 font-mono text-xs text-ink/50">{row.ticket?.ticket_number ?? "—"}</td>
                      <td className="px-3.5 py-3">
                        <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: stb.bg, color: stb.color }}>{stb.label}</span>
                      </td>
                      <td className="px-3.5 py-3">
                        {row.ticket?.status === "waiting" && (
                          <button onClick={() => { void handleCall(row); }} className="cy-btn cy-btn-primary !min-h-0 whitespace-nowrap !py-1.5 !px-2.5 text-xs">
                            {lang === "en" ? "Call" : "استدعاء"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-10 text-center text-sm text-ink/40">
                {lang === "en" ? "No patients in queue." : "لا يوجد مرضى في الطابور."}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Check-in form */}
        <div className="cy-card sticky top-4 p-6">
          <h2 className="mb-5 text-lg font-bold text-brand-400">
            {lang === "en" ? "Quick Check-in" : "تسجيل الوصول السريع"}
          </h2>

          {checkInMsg && (
            <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-400">
              {checkInMsg}
            </div>
          )}

          <div className="mb-4">
            <label className={fieldLabelCls}>
              {lang === "en" ? "Patient MRN" : "الرقم الطبي"}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={mrnInput}
                onChange={e => { setMrnInput(e.target.value); setMrnLookupResult(""); setLookedUpPatient(null); }}
                placeholder={lang === "en" ? "e.g. MRN-001234" : "مثال: MRN-001234"}
                className={`flex-1 ${fieldInputCls}`}
              />
              <button onClick={handleMrnLookup} className="cy-btn cy-btn-primary !min-h-0 whitespace-nowrap !py-2 !px-3 text-xs">
                {lang === "en" ? "Lookup" : "بحث"}
              </button>
            </div>
            {mrnLookupResult && (
              <p className={`mt-2 text-xs font-semibold ${lookedUpPatient ? "text-emerald-400" : "text-red-400"}`}>
                {mrnLookupResult}
              </p>
            )}
          </div>

          <div className="mb-4">
            <label className={fieldLabelCls}>
              {lang === "en" ? "Arrival Method" : "طريقة الوصول"}
            </label>
            <select value={arrivalMethodInput} onChange={e => setArrivalMethodInput(e.target.value)} className={fieldInputCls}>
              {arrivalMethods.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div className="mb-6">
            <label className={fieldLabelCls}>
              {lang === "en" ? "Visit Reason" : "سبب الزيارة"}
            </label>
            <select value={visitReasonInput} onChange={e => setVisitReasonInput(e.target.value)} className={fieldInputCls}>
              {visitReasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          <button onClick={() => { void handleCheckIn(); }} className="cy-btn cy-btn-primary w-full">
            {lang === "en" ? "Check In Patient" : "تسجيل وصول المريض"}
          </button>

          <div className="mt-5 rounded-lg border border-ink/10 bg-surface-overlay p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">
              {lang === "en" ? "Queue Summary" : "ملخص الطابور"}
            </p>
            {(["waiting", "called", "active", "completed", "skipped"] as const).map(st => {
              const count = rows.filter(r => r.ticket?.status === st).length;
              const stb = ticketStatusBadge(st, lang);
              return (
                <div key={st} className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: stb.color }}>{stb.label}</span>
                  <span className="text-sm font-bold">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-xs text-ink/50">
        CyMed Clinic · {lang === "en" ? "Reception Desk" : "مكتب الاستقبال"} · {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}
