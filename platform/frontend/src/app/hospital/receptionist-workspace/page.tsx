"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ClipboardCheck, UserPlus, CalendarDays, ClipboardList, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

type AppointmentStatus = "proposed" | "pending" | "booked" | "arrived" | "fulfilled" | "cancelled";
interface Appointment {
  id: string;
  status: AppointmentStatus;
  start_time: string;
}
interface Paginated<T> { count: number; results: T[]; }

const DEEP_LINKS = [
  { href: "/hospital/reception", label_en: "Reception", label_ar: "الاستقبال", icon: ClipboardCheck, desc_en: "Check-in and queue management", desc_ar: "تسجيل الوصول وإدارة الطابور" },
  { href: "/hospital/patients", label_en: "Patient Registration", label_ar: "تسجيل المرضى", icon: UserPlus, desc_en: "Register new and returning patients", desc_ar: "تسجيل المرضى الجدد والعائدين" },
  { href: "/hospital/appointments", label_en: "Appointment Calendar", label_ar: "تقويم المواعيد", icon: CalendarDays, desc_en: "Book and manage appointments", desc_ar: "حجز وإدارة المواعيد" },
  { href: "/hospital/adt", label_en: "Admissions (ADT)", label_ar: "القبول (ADT)", icon: ClipboardList, desc_en: "Admission/transfer status lookups", desc_ar: "الاستعلام عن حالة القبول والنقل" },
];

export default function ReceptionistWorkspace() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const page = await apiFetch<Paginated<Appointment>>("/api/v1/scheduling/", {
        token: session.accessToken, tenantId: session.tenantId,
      });
      setAppointments(page.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل المواعيد." : "Failed to load appointments."));
    }
  }, [session, isAr]);

  useEffect(() => { void loadAppointments(); }, [loadAppointments]);

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }

  const today = new Date().toDateString();
  const todayAppointments = (appointments || []).filter(a => new Date(a.start_time).toDateString() === today);
  const arrivedToday = todayAppointments.filter(a => a.status === "arrived");
  const bookedToday = todayAppointments.filter(a => a.status === "booked" || a.status === "pending");

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck size={24} /> {isAr ? "مساحة عمل موظف الاستقبال" : "Receptionist Workspace"}</h1>
          <p className="mt-1 text-sm text-white/50">{isAr ? "حالة مواعيد اليوم، مع وصول سريع لتسجيل الوصول والتسجيل" : "Today's appointment status, with quick access into check-in and registration"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      {fetchError && (
        <div role="alert" className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {isAr ? "تعذر تحميل ملخص المواعيد: " : "Unable to load appointment summary: "}{fetchError}
        </div>
      )}

      {!fetchError && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: isAr ? "مواعيد اليوم" : "Today's Appointments", value: appointments === null ? "..." : todayAppointments.length, color: "#22D3EE" },
            { label: isAr ? "وصلوا" : "Arrived", value: appointments === null ? "..." : arrivedToday.length, color: "#22c55e" },
            { label: isAr ? "بانتظار الوصول" : "Awaiting Arrival", value: appointments === null ? "..." : bookedToday.length, color: "#f59e0b" },
          ].map(m => (
            <div key={m.label} className="rounded-xl border border-white/10 bg-surface-raised p-5 text-center">
              <p className="text-3xl font-bold" style={{ color: m.color }}>{m.value}</p>
              <p className="mt-1 text-sm text-white/50">{m.label}</p>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">{isAr ? "أدوات مكتب الاستقبال" : "Front Desk Tools"}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {DEEP_LINKS.map(({ href, label_en, label_ar, icon: Icon, desc_en, desc_ar }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-surface-raised p-5 transition-colors hover:border-brand-400/50 hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                <Icon size={20} />
              </div>
              <div>
                <p className="font-semibold">{isAr ? label_ar : label_en}</p>
                <p className="text-sm text-white/50">{isAr ? desc_ar : desc_en}</p>
              </div>
            </div>
            <ArrowRight size={18} className={`text-white/30 ${isAr ? "rotate-180" : ""}`} />
          </Link>
        ))}
      </div>
    </div>
  );
}
