"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Check, XIcon, Download } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { usePreferences } from "@/contexts/preferences";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Department { id: string; name: string; code: string; }
interface Employee { id: string; first_name: string; last_name: string; department: string | null; job_title: string; hire_date: string; status: string; }
interface LeaveRequest { id: string; employee: string; leave_type: string; start_date: string; end_date: string; status: "pending" | "approved" | "rejected"; reason: string; }
interface PayrollRun { id: string; run_date: string; status: string; total_gross: string; total_deductions: string; total_net: string; }
interface ShiftTemplate { id: string; name: string; start_time: string; end_time: string; is_night_shift: boolean; differential_percent: string; }
interface ShiftAssignment { id: string; employee: string; employee_name: string; shift_template: string; shift_name: string; assigned_date: string; status: string; }
interface ShiftSwapRequest { id: string; original_assignment: string; covering_employee: string | null; reason: string; status: "pending" | "approved" | "rejected"; }
interface Paginated<T> { count: number; results: T[]; }

export default function HRPayroll() {
  const { session, isAuthenticated } = useAuth();
  const { locale: lang, setLocale: _setLangRaw } = usePreferences();
  const setLang = (updater: "en" | "ar" | ((prev: "en" | "ar") => "en" | "ar")) =>
    _setLangRaw(typeof updater === "function" ? (updater as (prev: "en" | "ar") => "en" | "ar")(lang) : updater);
  const isAr = lang === "ar";
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<ShiftAssignment[]>([]);
  const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;
    setFetchError(null);
    try {
      const opts = { token: session.accessToken, tenantId: session.tenantId };
      const [deptPage, empPage, leavePage, payrollPage, shiftTemplatePage, shiftAssignmentPage, swapPage] = await Promise.all([
        apiFetch<Paginated<Department>>("/api/v1/erp/hr/departments/", opts),
        apiFetch<Paginated<Employee>>("/api/v1/erp/hr/employees/", opts),
        apiFetch<Paginated<LeaveRequest>>("/api/v1/erp/hr/leave-requests/", opts),
        apiFetch<Paginated<PayrollRun>>("/api/v1/erp/payroll/runs/", opts),
        apiFetch<Paginated<ShiftTemplate>>("/api/v1/erp/hr/shift-templates/", opts),
        apiFetch<Paginated<ShiftAssignment>>("/api/v1/erp/hr/shift-assignments/", opts),
        apiFetch<Paginated<ShiftSwapRequest>>("/api/v1/erp/hr/shift-swap-requests/", opts),
      ]);
      setDepartments(deptPage.results);
      setEmployees(empPage.results);
      setLeaveRequests(leavePage.results);
      setPayrollRuns(payrollPage.results);
      setShiftTemplates(shiftTemplatePage.results);
      setShiftAssignments(shiftAssignmentPage.results);
      setSwapRequests(swapPage.results);
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل تحميل بيانات الموارد البشرية." : "Failed to load HR data."));
    }
  }, [session, isAr]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function decideSwap(id: string, decision: "approve" | "reject") {
    if (!session) return;
    try {
      await apiFetch(`/api/v1/erp/hr/shift-swap-requests/${id}/${decision}/`, {
        method: "POST", token: session.accessToken, tenantId: session.tenantId,
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      const decisionLabelAr = decision === "approve" ? "الموافقة على" : "رفض";
      setFetchError(detail || (isAr ? `فشل ${decisionLabelAr} طلب التبديل.` : `Failed to ${decision} swap request.`));
    }
  }

  const [payslipForm, setPayslipForm] = useState({ runId: "", employeeId: "", periodStart: "", periodEnd: "", allowances: "0" });
  const [generatingPayslip, setGeneratingPayslip] = useState(false);

  async function generatePayslip() {
    if (!session || !payslipForm.runId || !payslipForm.employeeId || !payslipForm.periodStart || !payslipForm.periodEnd) return;
    setGeneratingPayslip(true);
    try {
      await apiFetch(`/api/v1/erp/payroll/runs/${payslipForm.runId}/generate-payslip/`, {
        method: "POST",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({
          employee_id: payslipForm.employeeId,
          period_start: payslipForm.periodStart,
          period_end: payslipForm.periodEnd,
          allowances: payslipForm.allowances || "0",
        }),
      });
      setPayslipForm(f => ({ ...f, employeeId: "" }));
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (err instanceof Error ? err.message : isAr ? "فشل إنشاء قسيمة الراتب." : "Failed to generate payslip."));
    } finally {
      setGeneratingPayslip(false);
    }
  }

  async function exportWPS(runId: string, runDate: string) {
    if (!session) return;
    try {
      const resp = await fetch(`${API_BASE}/api/v1/erp/payroll/runs/${runId}/export-wps/`, {
        headers: { Authorization: `Bearer ${session.accessToken}`, "X-Tenant-ID": session.tenantId },
      });
      if (!resp.ok) throw new Error(`${isAr ? "فشل التصدير" : "Export failed"} (${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wps_${runDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : isAr ? "فشل تصدير ملف WPS." : "Failed to export WPS file.");
    }
  }

  async function decideLeave(id: string, status: "approved" | "rejected") {
    if (!session) return;
    try {
      await apiFetch(`/api/v1/erp/hr/leave-requests/${id}/`, {
        method: "PATCH",
        token: session.accessToken,
        tenantId: session.tenantId,
        body: JSON.stringify({ status }),
      });
      void loadData();
    } catch (err) {
      const detail = (err as { detail?: string })?.detail;
      setFetchError(detail || (isAr ? "فشل تحديث طلب الإجازة." : "Failed to update leave request."));
    }
  }

  if (!isAuthenticated) {
    return <div className="mx-auto mt-16 max-w-lg text-center"><h1 className="text-xl font-bold">Sign in required</h1></div>;
  }
  if (fetchError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-xl font-bold text-red-400">{isAr ? "تعذر تحميل بيانات الموارد البشرية" : "Unable to load HR data"}</h1>
        <p className="mt-2 text-white/50">{fetchError}</p>
      </div>
    );
  }
  if (employees === null) {
    return <div className="mt-16 text-center text-white/50">{isAr ? "جارٍ تحميل بيانات الموارد البشرية المباشرة..." : "Loading live HR data..."}</div>;
  }

  const departmentName = (id: string | null) => departments.find(d => d.id === id)?.name || (isAr ? "غير معيّن" : "Unassigned");
  const employeeName = (id: string) => {
    const e = employees.find(x => x.id === id);
    return e ? `${e.first_name} ${e.last_name}` : (isAr ? "موظف غير معروف" : "Unknown employee");
  };
  const pendingLeave = leaveRequests.filter(l => l.status === "pending");
  const recentHires = employees
    .filter(e => (Date.now() - new Date(e.hire_date).getTime()) / (1000 * 60 * 60 * 24) <= 30)
    .sort((a, b) => b.hire_date.localeCompare(a.hire_date));
  const latestPayrollRun = payrollRuns.slice().sort((a, b) => b.run_date.localeCompare(a.run_date))[0];
  const today = new Date().toISOString().slice(0, 10);
  const upcomingShifts = shiftAssignments
    .filter(a => a.assigned_date >= today && a.status === "scheduled")
    .sort((a, b) => a.assigned_date.localeCompare(b.assigned_date))
    .slice(0, 20);
  const pendingSwaps = swapRequests.filter(s => s.status === "pending");

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Users size={22} /> {isAr ? "الموارد البشرية والرواتب" : "HR & Payroll"}</h1>
          <p className="mt-1 text-sm text-white/50">{isAr ? "بيانات القوى العاملة المباشرة لهذا المستأجر" : "Live workforce data for this tenant"}</p>
        </div>
        <button onClick={() => setLang(isAr ? "en" : "ar")} className="cy-btn cy-btn-ghost !min-h-0 !py-2 !px-4 text-sm">
          {isAr ? "English" : "العربية"}
        </button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-surface-raised p-4">
          <p className="text-xs text-white/50">{isAr ? "الموظفون" : "Employees"}</p>
          <p className="mt-1 text-xl font-bold text-brand-300">{employees.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface-raised p-4">
          <p className="text-xs text-white/50">{isAr ? "الأقسام" : "Departments"}</p>
          <p className="mt-1 text-xl font-bold text-purple-400">{departments.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface-raised p-4">
          <p className="text-xs text-white/50">{isAr ? "إجازات معلقة" : "Pending Leave"}</p>
          <p className="mt-1 text-xl font-bold text-amber-400">{pendingLeave.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface-raised p-4">
          <p className="text-xs text-white/50">{isAr ? "صافي آخر رواتب" : "Latest Payroll Net"}</p>
          <p className="mt-1 text-xl font-bold text-green-400">
            {latestPayrollRun ? `SAR ${parseFloat(latestPayrollRun.total_net).toLocaleString()}` : "—"}
          </p>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">{isAr ? "طلبات الإجازة المعلقة" : "Pending Leave Requests"}</h2>
      <div className="mb-8 overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {(isAr ? ["الموظف", "النوع", "البداية", "النهاية", "السبب", "إجراء"] : ["Employee", "Type", "Start", "End", "Reason", "Action"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-white/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingLeave.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-white/50">{isAr ? "لا توجد طلبات إجازة معلقة." : "No pending leave requests."}</td></tr>
              )}
              {pendingLeave.map(l => (
                <tr key={l.id} className="border-b border-white/5">
                  <td className="px-4 py-3 font-medium">{employeeName(l.employee)}</td>
                  <td className="px-4 py-3 capitalize text-white/60">{l.leave_type}</td>
                  <td className="px-4 py-3 text-white/60">{l.start_date}</td>
                  <td className="px-4 py-3 text-white/60">{l.end_date}</td>
                  <td className="px-4 py-3 text-white/60">{l.reason || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => decideLeave(l.id, "approved")} className="rounded-md bg-green-500/15 p-1.5 text-green-400 hover:bg-green-500/25"><Check size={14} /></button>
                      <button onClick={() => decideLeave(l.id, "rejected")} className="rounded-md bg-red-500/15 p-1.5 text-red-400 hover:bg-red-500/25"><XIcon size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">{isAr ? "التعيينات الحديثة (آخر 30 يوماً)" : "Recently Hired (last 30 days)"}</h2>
      <div className="mb-8 overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {(isAr ? ["الاسم", "القسم", "المسمى الوظيفي", "تاريخ التعيين", "الحالة"] : ["Name", "Department", "Job Title", "Hire Date", "Status"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-white/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentHires.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-white/50">{isAr ? "لا يوجد موظفون جدد في آخر 30 يوماً." : "No new hires in the last 30 days."}</td></tr>
              )}
              {recentHires.map(e => (
                <tr key={e.id} className="border-b border-white/5">
                  <td className="px-4 py-3 font-medium">{e.first_name} {e.last_name}</td>
                  <td className="px-4 py-3 text-white/60">{departmentName(e.department)}</td>
                  <td className="px-4 py-3 text-white/60">{e.job_title}</td>
                  <td className="px-4 py-3 text-white/60">{e.hire_date}</td>
                  <td className="px-4 py-3 capitalize text-white/60">{e.status.replace("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">{isAr ? "دورات الرواتب" : "Payroll Runs"}</h2>
      <div className="mb-4 rounded-xl border border-white/10 bg-surface-raised p-4">
        <p className="mb-2 text-xs font-semibold text-white/50">{isAr ? "إنشاء قسيمة راتب (العمل الإضافي وبدل المناوبة محسوبان من بيانات الحضور/الجدول الفعلية)" : "Generate Payslip (overtime + shift differential calculated from real attendance/roster data)"}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <select value={payslipForm.runId} onChange={e => setPayslipForm(f => ({ ...f, runId: e.target.value }))} className="rounded-lg border border-white/10 bg-surface px-2 py-1.5 text-sm">
            <option value="">{isAr ? "دورة الرواتب…" : "Payroll run…"}</option>
            {payrollRuns.map(r => <option key={r.id} value={r.id}>{r.run_date}</option>)}
          </select>
          <select value={payslipForm.employeeId} onChange={e => setPayslipForm(f => ({ ...f, employeeId: e.target.value }))} className="rounded-lg border border-white/10 bg-surface px-2 py-1.5 text-sm">
            <option value="">{isAr ? "الموظف…" : "Employee…"}</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
          </select>
          <input type="date" value={payslipForm.periodStart} onChange={e => setPayslipForm(f => ({ ...f, periodStart: e.target.value }))} className="rounded-lg border border-white/10 bg-surface px-2 py-1.5 text-sm" />
          <input type="date" value={payslipForm.periodEnd} onChange={e => setPayslipForm(f => ({ ...f, periodEnd: e.target.value }))} className="rounded-lg border border-white/10 bg-surface px-2 py-1.5 text-sm" />
          <input type="number" value={payslipForm.allowances} onChange={e => setPayslipForm(f => ({ ...f, allowances: e.target.value }))} placeholder={isAr ? "البدلات" : "Allowances"} className="rounded-lg border border-white/10 bg-surface px-2 py-1.5 text-sm" />
          <button
            disabled={generatingPayslip || !payslipForm.runId || !payslipForm.employeeId || !payslipForm.periodStart || !payslipForm.periodEnd}
            onClick={generatePayslip}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {generatingPayslip ? (isAr ? "جارٍ الإنشاء…" : "Generating…") : (isAr ? "إنشاء" : "Generate")}
          </button>
        </div>
      </div>
      <div className="mb-8 overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {(isAr ? ["تاريخ الدورة", "الحالة", "الإجمالي", "الاستقطاعات", "الصافي", ""] : ["Run Date", "Status", "Gross", "Deductions", "Net", ""]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-white/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payrollRuns.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-white/50">{isAr ? "لا توجد دورات رواتب مسجلة بعد." : "No payroll runs recorded yet."}</td></tr>
              )}
              {payrollRuns.map(r => (
                <tr key={r.id} className="border-b border-white/5">
                  <td className="px-4 py-3 text-white/60">{r.run_date}</td>
                  <td className="px-4 py-3 capitalize text-white/60">{r.status}</td>
                  <td className="px-4 py-3">{parseFloat(r.total_gross).toLocaleString()}</td>
                  <td className="px-4 py-3">{parseFloat(r.total_deductions).toLocaleString()}</td>
                  <td className="px-4 py-3 font-semibold">{parseFloat(r.total_net).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => exportWPS(r.id, r.run_date)} className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-white/60 hover:bg-white/5">
                      <Download size={12} /> WPS
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">{isAr ? "جدول المناوبات — القادمة" : "Shift Roster — Upcoming"}</h2>
      <p className="mb-3 text-xs text-white/40">
        {isAr ? `${shiftTemplates.length} قالب (قوالب) مناوبة معرّف` : `${shiftTemplates.length} shift template(s) defined`}
        {shiftTemplates.some(t => t.is_night_shift) && (isAr
          ? ` (المناوبات الليلية تحمل بدل ${shiftTemplates.find(t => t.is_night_shift)?.differential_percent}%)`
          : ` (night shifts carry a ${shiftTemplates.find(t => t.is_night_shift)?.differential_percent}% differential)`)}
      </p>
      <div className="mb-8 overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {(isAr ? ["التاريخ", "الموظف", "المناوبة", "الحالة"] : ["Date", "Employee", "Shift", "Status"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-white/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {upcomingShifts.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-white/50">{isAr ? "لا توجد مناوبات قادمة مجدولة." : "No upcoming shifts scheduled."}</td></tr>
              )}
              {upcomingShifts.map(a => (
                <tr key={a.id} className="border-b border-white/5">
                  <td className="px-4 py-3 text-white/60">{a.assigned_date}</td>
                  <td className="px-4 py-3 font-medium">{a.employee_name}</td>
                  <td className="px-4 py-3 text-white/60">{a.shift_name}</td>
                  <td className="px-4 py-3 capitalize text-white/60">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">{isAr ? "طلبات تبديل المناوبات المعلقة" : "Pending Shift Swap Requests"}</h2>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {(isAr ? ["السبب", "الموظف البديل", "إجراء"] : ["Reason", "Covering Employee", "Action"]).map(h => (
                  <th key={h} className={`px-4 py-3 font-semibold text-white/50 ${isAr ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingSwaps.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-white/50">{isAr ? "لا توجد طلبات تبديل معلقة." : "No pending swap requests."}</td></tr>
              )}
              {pendingSwaps.map(s => (
                <tr key={s.id} className="border-b border-white/5">
                  <td className="px-4 py-3 text-white/60">{s.reason || "—"}</td>
                  <td className="px-4 py-3 text-white/60">{s.covering_employee ? employeeName(s.covering_employee) : (isAr ? "غير معيّن" : "Unassigned")}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => decideSwap(s.id, "approve")} className="rounded-md bg-green-500/15 p-1.5 text-green-400 hover:bg-green-500/25"><Check size={14} /></button>
                      <button onClick={() => decideSwap(s.id, "reject")} className="rounded-md bg-red-500/15 p-1.5 text-red-400 hover:bg-red-500/25"><XIcon size={14} /></button>
                    </div>
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
