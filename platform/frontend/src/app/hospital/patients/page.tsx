"use client";

import { useState, useEffect, useCallback } from "react";
import { UserPlus, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  dob: string;
  gender: string;
  mrn: string;
  national_id: string | null;
  passport_number: string | null;
  is_active: boolean;
}

interface Paginated<T> {
  count: number;
  results: T[];
}

const emptyForm = { first_name: "", last_name: "", dob: "", gender: "unknown", national_id: "", passport_number: "" };

export default function PatientRegistration() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadPatients = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFetchError(null);
    try {
      const page = await apiFetch<Paginated<Patient>>("/api/v1/patients/", {
        token: session.accessToken,
        tenantId: session.tenantId,
      });
      setPatients(page.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل المرضى." : "Failed to load patients."));
    } finally {
      setLoading(false);
    }
  }, [session, isAr]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  async function submitRegistration() {
    if (!session) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await apiFetch("/api/v1/patients/", {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          first_name: form.first_name,
          last_name: form.last_name,
          dob: form.dob,
          gender: form.gender,
          national_id: form.national_id || null,
          passport_number: form.passport_number || null,
        }),
      });
      setForm(emptyForm);
      setShowForm(false);
      void loadPatients();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFormError(detail || (err instanceof Error ? err.message : isAr ? "فشل تسجيل المريض." : "Failed to register patient."));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold">Sign in required</h1>
        <p className="mt-2 text-white/50">Patient registration requires an authenticated session.</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل المرضى" : "Unable to load patients"}</h1>
        <p className="mt-2 text-white/50">{fetchError}</p>
      </div>
    );
  }

  const filtered = (patients || []).filter(p => {
    const q = search.toLowerCase();
    return !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) || p.mrn.toLowerCase().includes(q);
  });

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{isAr ? "تسجيل المرضى" : "Patient Registration"}</h1>
          <p className="mt-1 text-sm text-white/50">{isAr ? "سجلات هوية المرضى الفعلية لهذا المستأجر" : "Real patient identity records for this tenant"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold hover:bg-brand-600"
          >
            <UserPlus size={16} /> {isAr ? "تسجيل مريض" : "Register Patient"}
          </button>
          <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
            {isAr ? "English" : "العربية"}
          </button>
        </div>
      </header>

      <div className="relative mb-4 max-w-sm">
        <Search size={16} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-white/40 ${isAr ? "right-3" : "left-3"}`} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={isAr ? "البحث بالاسم أو رقم الملف الطبي..." : "Search by name or MRN..."}
          className={`w-full rounded-lg border border-white/10 bg-surface-overlay py-2 text-sm placeholder:text-white/40 focus:border-brand-400 focus:outline-none ${isAr ? "pr-9 pl-3" : "pl-9 pr-3"}`}
        />
      </div>

      {showForm && (
        <div className="mb-6 rounded-xl border border-white/10 bg-surface-raised p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">{isAr ? "تسجيل مريض جديد" : "New Patient Registration"}</h2>
            <button onClick={() => setShowForm(false)} className="text-white/50 hover:text-white">
              <X size={18} />
            </button>
          </div>
          {formError && <p className="mb-3 text-sm text-red-400">{formError}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input placeholder={isAr ? "الاسم الأول" : "First name"} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
            <input placeholder={isAr ? "اسم العائلة" : "Last name"} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
            <input type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} className="rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
            <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} className="rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm focus:border-brand-400 focus:outline-none">
              <option value="unknown">{isAr ? "غير معروف" : "Unknown"}</option>
              <option value="male">{isAr ? "ذكر" : "Male"}</option>
              <option value="female">{isAr ? "أنثى" : "Female"}</option>
              <option value="other">{isAr ? "آخر" : "Other"}</option>
            </select>
            <input placeholder={isAr ? "الرقم الوطني (اختياري)" : "National ID (optional)"} value={form.national_id} onChange={e => setForm({ ...form, national_id: e.target.value })} className="rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
            <input placeholder={isAr ? "رقم جواز السفر (اختياري)" : "Passport number (optional)"} value={form.passport_number} onChange={e => setForm({ ...form, passport_number: e.target.value })} className="rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
          </div>
          <button
            onClick={submitRegistration}
            disabled={submitting || !form.first_name || !form.last_name || !form.dob}
            className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold hover:bg-brand-600 disabled:opacity-40"
          >
            {submitting ? (isAr ? "جارٍ التسجيل..." : "Registering...") : (isAr ? "تسجيل المريض" : "Register Patient")}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {(isAr ? ["رقم الملف", "الاسم", "تاريخ الميلاد", "الجنس", "الحالة"] : ["MRN", "Name", "DOB", "Gender", "Status"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-white/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-white/50">{isAr ? "جارٍ تحميل بيانات المرضى المباشرة..." : "Loading live patient data..."}</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-white/50">{isAr ? "لا يوجد مرضى مسجلون لهذا المستأجر بعد — سجّل المريض الأول." : "No patients registered for this tenant yet — register the first patient."}</td></tr>
              )}
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-white/5">
                  <td className="px-4 py-3 font-mono text-brand-300">{p.mrn}</td>
                  <td className="px-4 py-3 font-medium">{p.first_name} {p.last_name}</td>
                  <td className="px-4 py-3 text-white/60">{p.dob}</td>
                  <td className="px-4 py-3 capitalize text-white/60">{p.gender}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.is_active ? "bg-green-500/15 text-green-400" : "bg-white/10 text-white/50"}`}>
                      {p.is_active ? (isAr ? "نشط" : "Active") : (isAr ? "غير نشط" : "Inactive")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
