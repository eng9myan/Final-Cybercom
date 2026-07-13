# Clinic (Product 2) — Enterprise Report

**Date:** 2026-07-13
**Product:** CyMed Clinic Edition
**Location:** `platform/backend/products/cymed/clinic/`
**Status:** Phase 2 gap-remediation pass — HIPAA-class gaps closed, frontend reconciled to real backend. Not yet pilot-certified (see External Requirements below).

---

## Why this report exists

The two prior Clinic documents in this repo (`platform/Clinic_Readiness_Report.md`, `platform/Phase3_1_Clinic_Edition_Report.md`, dated 2026-06-23/28) were templated boilerplate, not findings from code inspection. They claimed "RBAC: Complete," "Audit Framework: Complete," "Drug interaction check: Complete," "Break Glass: Complete," and "22 passed, 0 failed" tests. None of that was true at the time: the real test file had 11 tests, not 22; grepping the Clinic app for `data_classification`, `AuditService`, or role checks returned zero hits; drug-interaction/allergy/break-glass concepts don't exist anywhere in the Clinic codebase. Those two files are corrected in place with a pointer to this report — do not trust their historical content.

## What this pass actually did

### 1. PHI classification (was: zero coverage)
Added `data_classification = "phi"` to the 27 Clinic models that carry real patient-identifiable clinical data, mirroring the pattern already used in Hospital (`hospital/adt/models.py` etc.) — a plain class attribute, no migration needed. Left reference/config models (specialty templates, charge codes, price lists, visit-reason/arrival-method lookups) unmarked since they carry no PHI.

Marked: `ClinicAppointment`, `AppointmentReminder`, `AppointmentWaitlist` (appointments) · `ClinicalFormSubmission` (clinical_forms) · `Consultation`, `ConsultationDiagnosis`, `ConsultationProcedure`, `ConsultationPlan`, `ConsultationFollowUp`, `ConsultationAttachment` (consultations) · `TriageAssessment`, `TriageVitalSigns`, `TriageRiskScore` (triage) · `CheckIn`, `CheckOut`, `PatientQueueTicket` (reception) · `Referral`, `ReferralAttachment` (referrals) · `VirtualVisit`, `VirtualSession`, `VirtualRecording`, `VirtualConsent` (telemedicine) · `QueueEntry` (queues) · `EligibilityCheck`, `AuthorizationRequest`, `AuthorizationResponse` (insurance_bridge) · `ChargeItem` (billing_bridge).

### 2. Audit logging (was: zero coverage)
Clinic has no dedicated `services.py` layer the way Hospital does (business logic lives inline in serializer `create()` methods), so there was nowhere to hang Hospital's per-service `_write_audit()` calls. Instead, added `products/cymed/clinic/audit.py` (a standalone `write_audit()` mirroring `platform.audit.services.AuditService().record()`, same interface Hospital uses — not the broken `AuditService.log(...)` call that silently no-ops elsewhere in the codebase) and wired it into the shared `ClinicModelViewSet` base class (`products/cymed/clinic/views.py`). Every viewset that inherits from it — i.e. every Clinic endpoint — now audits `create`/`update`/`destroy`/`retrieve`/`list` automatically, scoped to `data_classification == "phi"` models only (a deliberate improvement over Hospital's base class, which audits every viewset indiscriminately including pure reference-data endpoints).

### 3. RBAC (was: `IsAuthenticated` only, no role dimension)
Ported Hospital's `action_required_roles` dict pattern into `ClinicModelViewSet`. Gated the highest-stakes write paths:
- `ConsultationViewSet` + its 4 sub-resources (diagnosis/procedure/plan/follow-up): `physician` only — clinical documentation.
- `ReferralViewSet`: `physician` only — clinical referral decision.
- `TriageAssessmentViewSet` + vitals + risk-score: `physician`/`nurse` — clinical assessment.
- `ClinicAppointmentViewSet`, `CheckInViewSet`/`CheckOutViewSet`/`PatientQueueTicketViewSet`: `physician`/`nurse`/`receptionist` — scheduling/front-desk staff.
- `ChargeItemViewSet`, `EligibilityCheckViewSet`/`AuthorizationRequestViewSet`/`AuthorizationResponseViewSet`: same staff set — billing/insurance staff.

Role vocabulary (`physician`, `nurse`, `receptionist`) matches the existing platform convention (confirmed via `hospital/blood_bank/views.py`, `hospital/dialysis/views.py`, and role-literal usage in `hospital/tests/test_dialysis.py`), not invented.

### 4. Frontend — was not a "sometimes falls back to mock data" bug, it never worked at all
The initial gap-analysis (Explore-agent pass) flagged Clinic pages for the same mock-fallback anti-pattern fixed across Hospital pages. Fixing it surfaced something worse: **every Clinic page called wrong API URLs and assumed field shapes that don't exist on any real serializer.** `/api/v1/clinic/appointments/` (used by 2 pages) isn't a real route — the real path is `/api/v1/clinic/appointments/bookings/`; `ClinicAppointmentSerializer` returns `{id, appointment, specialty_code, checkin_status, source}`, no patient name, no time, no status — that data lives on the separate `core.scheduling.Appointment` model the pages never fetched. Same story for consultations (`ConsultationSerializer` has `subjective/objective/assessment/plan` + nested `diagnoses`, not the `soap_subjective`/`diagnosis_code` shape assumed; no `chief_complaint`, no Arabic patient names, no `allergies` field exist anywhere in the backend), reception, triage, telemedicine, and the clinic dashboard.

All 6 pages (`clinic/page.tsx`, `appointments`, `consultations`, `reception`, `triage`, `telemedicine`) were rewritten to:
- Fetch the real endpoints and join across them client-side (e.g. appointments now joins `core.scheduling.Appointment` + `clinic.appointments.ClinicAppointment` + `core.patients.Patient` + `core.providers.Provider`).
- Drop every field with no backend source (allergies, Arabic patient/specialty names, chief-complaint-as-a-field, the fabricated 4-type "Orders" tab with no backing model) rather than keep guessing at shapes.
- Show an honest error banner on fetch failure and an honest empty state on zero results — no silent mock-data fallback anywhere.
- Add a "Sign in required" branch (`!isAuthenticated`) matching the convention already established in `hospital/emergency/page.tsx`.
- Attach real bearer tokens (`session.accessToken`/`session.tenantId`) to every request — the old pages sent no auth headers at all, so even a correct URL would have 401'd.

Consultations' "Orders" tab (lab/imaging/medication/referral, 4 fake types) was replaced with real **Diagnoses** and **Procedures** tabs backed by `ConsultationDiagnosis`/`ConsultationProcedure`, the only clinical-order-adjacent models that actually exist. Triage's form now matches the real 5-level ESI-style `triage_category` (immediate/emergent/urgent/less_urgent/non_urgent) instead of a fabricated 3-tier urgent/semi_urgent/routine scheme, and no longer offers an "edit vitals after the fact" flow since the backend's `TriageAssessmentSerializer` has no `update()` override for nested vitals — an assessment is a single immutable record, matching its real clinical intent.

Two pre-existing test files (`appointments/page.test.tsx`, `reception/page.test.tsx`) literally asserted the fabricated mock data as correct behavior (`"shows mock patient Ahmed Al-Rashid from MOCK_APPOINTMENTS"`) — rewritten to mock `useAuth`/`apiFetch` and assert real joined data, an explicit error state, and no mock fallback, mirroring the pattern in `hospital/emergency/page.test.tsx`. Both also silently depended on `usePreferences()` without a provider, which throws — a second pre-existing bug in the same two files, now fixed with a stateful mock. All 10 tests pass; full workspace `tsc --noEmit` is clean except two pre-existing unrelated failures in `laboratory/results/page.test.tsx` and `pharmacy/prescriptions/page.test.tsx` (not touched this pass).

### 5. Tests added, not fully executable in this sandbox
Added `TestClinicActionRBAC` (nurse/receptionist blocked, physician allowed on consultation writes; physician blocked, receptionist allowed on check-in) and `TestClinicPHIAudit` (PHI-model create writes a real `AuditEvent`, non-PHI model create does not, PHI-model read is audited) to `products/cymed/clinic/tests/test_clinic.py`, mirroring `hospital/tests/test_hospital.py::TestHospitalActionRBAC`. Verified importable with no syntax errors and consistent with the real `AuditService().record()` signature. **Cannot be run end-to-end here**: `pytest-django`'s DB setup hits a pre-existing, unrelated bug — `products/cymed/core/patients/migrations/0002_*.py` does `import platform.common.security.encryption`, and this repo's own top-level `platform/` package name collides with Python's stdlib `platform` module depending on import order, producing `AttributeError: module 'platform' has no attribute 'common'`. Confirmed via `git stash` that this fails identically before any change in this session — it is not something introduced here, and it blocks `pytest` (not `manage.py check`, which passes) platform-wide, not just for Clinic. Same class of sandbox limitation Hospital's own Phase 1 report already documented for JWKS network calls.

## Highest-leverage gaps closed (was Critical/High in the original gap analysis)

- **Critical — PHI classification & audit logging**: closed, 27 models + base-class audit wiring.
- **Critical — fabricated readiness reports**: this report replaces them; the two stale files are corrected in place.
- **High — no RBAC**: closed for the highest-stakes write paths (consultations, referrals, triage, appointments, reception, billing, insurance).
- **High — frontend never actually worked against the real API**: closed for all 6 pages.

## What's still open (genuinely, not hand-waved)

- RBAC not extended to lower-risk endpoints (specialties, clinical form templates, queue boards) — same mechanical pattern as above, just not done yet.
- Thin business-logic layer: only `billing_bridge/services.py` (FHIR claim mapping) exists as a proper service; insurance eligibility/prior-auth/GL-posting logic still lives inline in serializer `create()` methods rather than a testable service layer like Hospital's.
- Test coverage is still narrow (11 original + 5 new = 16 tests; one happy path per module plus the new RBAC/audit tests — no negative-path coverage for most modules).
- RBAC/audit tests are written but unverified end-to-end in this sandbox (see above) — need a real Postgres-backed run before trusting them as passing.
- ~90 stray untracked `platform/*(2).md`/`.json` files (confirmed byte-identical to their canonical counterparts modulo CRLF line endings) are still sitting in the repo, unrelated to Clinic specifically — flagged, not deleted (bulk-delete requires explicit authorization).
- **Genuine external blockers, not fixable by more code**: clinical workflow validation by a medical director, telemedicine legal/compliance review per jurisdiction, insurance payer configuration per market, staff training, data migration from any existing clinic system — none of this is a code gap.
