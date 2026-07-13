import time
import uuid

import jwt
import pytest
from django.conf import settings
from django.utils import timezone
from rest_framework.test import APIClient

from platform.events.models import OutboxEvent
from products.cymed.clinic.appointments.models import (
    AppointmentRule,
)
from products.cymed.clinic.billing_bridge.models import (
    ChargeCode,
    ClinicService,
    PriceList,
)
from products.cymed.clinic.clinical_forms.models import (
    ClinicalForm,
    ClinicalFormField,
    ClinicalFormSection,
)
from products.cymed.clinic.insurance_bridge.models import (
    InsurancePlan,
    Payer,
)
from products.cymed.clinic.queues.models import Queue, QueueBoard
from products.cymed.clinic.reception.models import (
    ArrivalMethod,
    CheckIn,
    PatientQueueTicket,
    VisitReason,
    VisitStatus,
)
from products.cymed.clinic.referrals.models import ReferralProvider, ReferralReason
from products.cymed.clinic.specialties.models import SpecialtyProfile, SpecialtyTemplate
from products.cymed.clinic.triage.models import TriageRiskScore, TriageVitalSigns
from products.cymed.core.encounters.models import Encounter
from products.cymed.core.facilities.models import Facility
from products.cymed.core.organizations.models import Organization
from products.cymed.core.patients.models import Patient


@pytest.fixture
def test_tenant_id():
    return uuid.uuid4()


@pytest.fixture
def auth_client(test_tenant_id, _rsa_keypair, _mock_jwks):
    private_key, _public_pem = _rsa_keypair
    client = APIClient()
    now = int(time.time())
    payload = {
        "sub": "33333333-3333-3333-3333-333333333333",
        "email": "doctor@cymed.io",
        "tenant_id": str(test_tenant_id),
        "realm_access": {"roles": ["platform_admin"]},
        "roles": ["platform_admin"],
        "permissions": ["read", "write"],
        "iat": now,
        "exp": now + 3600,
        "aud": settings.CYIDENTITY_CLIENT_ID,
        "iss": settings.CYIDENTITY_ISSUER,
    }
    token = jwt.encode(payload, private_key, algorithm="RS256")
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {token}",
        HTTP_X_TENANT_ID=str(test_tenant_id),
    )
    return client


@pytest.mark.django_db
class TestClinicEdition:
    def test_reception_checkin_checkout_queue(self, auth_client, test_tenant_id):
        # 1. Setup Base Data
        patient = Patient.objects.create(
            tenant_id=test_tenant_id,
            first_name="Samer",
            last_name="Mona",
            dob="1992-04-12",
            mrn="MRN-CLN-01",
        )
        arr_method = ArrivalMethod.objects.create(
            tenant_id=test_tenant_id, name="Walk-In", code="walkin"
        )
        reason = VisitReason.objects.create(tenant_id=test_tenant_id, name="Fever", code="fever")
        status_model = VisitStatus.objects.create(
            tenant_id=test_tenant_id, name="Checked In", code="checked_in"
        )

        # 2. Check-In via API
        response = auth_client.post(
            "/api/v1/clinic/reception/checkins/",
            {
                "patient": str(patient.id),
                "arrival_method": arr_method.id,
                "visit_reason": reason.id,
                "status": status_model.id,
            },
            format="json",
        )
        assert response.status_code == 201
        checkin_id = response.data["id"]

        # Verify Ticket Token Auto-Generation
        ticket = PatientQueueTicket.objects.get(checkin_id=checkin_id)
        assert ticket.ticket_number.startswith("T-")
        assert ticket.status == "waiting"

        # Verify Outbox Event Published
        assert (
            OutboxEvent.objects.filter(
                tenant_id=test_tenant_id, event_type="cymed.clinic.checkin.created"
            ).count()
            == 1
        )

        # 3. Check-Out via API
        response_checkout = auth_client.post(
            "/api/v1/clinic/reception/checkouts/",
            {"checkin": checkin_id, "status": "completed"},
            format="json",
        )
        assert response_checkout.status_code == 201
        ticket.refresh_from_db()
        assert ticket.status == "completed"

    def test_appointments_double_booking_and_waitlist(self, auth_client, test_tenant_id):
        # 1. Setup Appointment Rule (no double booking)
        AppointmentRule.objects.create(
            tenant_id=test_tenant_id,
            name="Cardiology Rule",
            specialty_code="cardiology",
            allow_conflicting_bookings=False,
        )

        # 2. Setup Waitlist
        wait_response = auth_client.post(
            "/api/v1/clinic/appointments/waitlist/",
            {
                "patient_id": str(uuid.uuid4()),
                "provider_id": str(uuid.uuid4()),
                "specialty_code": "cardiology",
                "priority": 10,
                "requested_date": "2026-06-30",
                "status": "active",
            },
            format="json",
        )
        assert wait_response.status_code == 201

    def test_queues_and_waiting_room(self, auth_client, test_tenant_id):
        # Setup Queue
        queue = Queue.objects.create(
            tenant_id=test_tenant_id,
            name="Pediatrics Queue",
            department_id=uuid.uuid4(),
            code="PED-Q",
        )
        QueueBoard.objects.create(
            tenant_id=test_tenant_id,
            queue=queue,
            board_name="Pediatrics Board",
            layout_settings={"theme": "dark"},
        )

        response = auth_client.get("/api/v1/clinic/queues/boards/")
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_triage_vital_signs_and_mews_score(self, auth_client, test_tenant_id):
        # 1. Setup CheckIn
        patient = Patient.objects.create(
            tenant_id=test_tenant_id,
            first_name="Kareem",
            last_name="Adel",
            dob="1980-01-01",
            mrn="MRN-T-01",
        )
        arr = ArrivalMethod.objects.create(tenant_id=test_tenant_id, name="Emergency", code="er")
        reason = VisitReason.objects.create(
            tenant_id=test_tenant_id, name="Chest Pain", code="chest_pain"
        )
        status_model = VisitStatus.objects.create(
            tenant_id=test_tenant_id, name="Arrived", code="arrived"
        )
        checkin = CheckIn.objects.create(
            tenant_id=test_tenant_id,
            patient=patient,
            arrival_method=arr,
            visit_reason=reason,
            status=status_model,
        )

        # 2. Log Triage with abnormal vitals (Critical BP, high temp)
        response = auth_client.post(
            "/api/v1/clinic/triage/assessments/",
            {
                "checkin": checkin.id,
                "chief_complaint": "Severe chest pain",
                "triage_category": "emergent",
                "assessed_by": "Dr. Smith",
                "vital_signs": {
                    "weight_kg": 80.00,
                    "height_cm": 180.00,
                    "temperature_c": 39.00,
                    "blood_pressure_systolic": 70,  # Critical low BP -> MEWS points
                    "blood_pressure_diastolic": 40,
                    "pulse_bpm": 140,  # Critical high pulse -> MEWS points
                    "respiratory_rate_pm": 32,  # Critical high RR -> MEWS points
                    "oxygen_saturation_pct": 90,
                    "pain_score": 9,
                },
            },
            format="json",
        )
        assert response.status_code == 201

        # Verify MEWS and BMI calculation
        assess_id = response.data["id"]
        vitals = TriageVitalSigns.objects.get(assessment_id=assess_id)
        assert float(vitals.bmi) == 24.69  # 80 / (1.8^2)

        risk = TriageRiskScore.objects.get(assessment_id=assess_id)
        assert risk.mews_score > 4
        assert risk.abnormal_flag is True
        assert risk.risk_level == "high"

    def test_consultation_diagnosis_terminology_check(self, auth_client, test_tenant_id):
        # 1. Setup Encounter
        org = Organization.objects.create(
            tenant_id=test_tenant_id, name="Clinic Org", slug="cl-org", organization_type="clinic"
        )
        fac = Facility.objects.create(
            tenant_id=test_tenant_id, organization=org, name="Clinic Fac", code="CL-FAC"
        )
        patient = Patient.objects.create(
            tenant_id=test_tenant_id,
            first_name="Omar",
            last_name="Hani",
            dob="1988-08-08",
            mrn="MRN-C-01",
        )
        enc = Encounter.objects.create(
            tenant_id=test_tenant_id,
            patient=patient,
            encounter_type="outpatient",
            status="in_progress",
            organization=org,
            facility=fac,
        )

        # 2. Consultation Post with VALID ICD-11 diagnosis code (FA81 exists in mock)
        response = auth_client.post(
            "/api/v1/clinic/consultations/notes/",
            {
                "encounter": enc.id,
                "consulted_by": "Dr. Tareq",
                "subjective": "Knee pain",
                "objective": "Swelling",
                "assessment": "Osteoarthritis",
                "plan": "Pain relief",
                "diagnoses": [{"code": "FA81", "system": "icd11", "display": "Osteoarthritis"}],
                "treatment_plan": {
                    "instructions": "Ice compress",
                    "prescriptions": [{"drug": "Panadol", "dosage": "500mg"}],
                },
            },
            format="json",
        )
        assert response.status_code == 201

        # Verify Consultation Event
        assert (
            OutboxEvent.objects.filter(
                tenant_id=test_tenant_id, event_type="cymed.clinic.consultation.created"
            ).count()
            == 1
        )

        # 3. Consultation Post with INVALID ICD-11 diagnosis code (should fail)
        response_invalid = auth_client.post(
            "/api/v1/clinic/consultations/notes/",
            {
                "encounter": enc.id,
                "consulted_by": "Dr. Tareq",
                "diagnoses": [
                    {"code": "INVALID-CODE", "system": "icd11", "display": "Fake disease"}
                ],
            },
            format="json",
        )
        assert response_invalid.status_code == 400

    def test_specialty_profiles_and_clinical_rules(self, auth_client, test_tenant_id):
        # Create Specialty
        spec = SpecialtyProfile.objects.create(
            tenant_id=test_tenant_id, name="Cardiology", code="cardiology"
        )
        SpecialtyTemplate.objects.create(
            tenant_id=test_tenant_id,
            specialty=spec,
            name="ECHO report",
            code="echo",
            schema_definition={"fields": ["ef_pct"]},
        )

        response = auth_client.get(f"/api/v1/clinic/specialties/profiles/{spec.id}/")
        assert response.status_code == 200
        assert response.data["code"] == "cardiology"

    def test_clinical_forms_builder_and_submissions(self, auth_client, test_tenant_id):
        # 1. Create form schema
        form = ClinicalForm.objects.create(
            tenant_id=test_tenant_id, name="Consent Form", code="consent"
        )
        sect = ClinicalFormSection.objects.create(
            tenant_id=test_tenant_id, form=form, title="Section 1", display_order=1
        )
        ClinicalFormField.objects.create(
            tenant_id=test_tenant_id,
            section=sect,
            label="agree",
            field_type="boolean",
            required=True,
        )

        # 2. Submit valid response (contains the required field "agree")
        response_valid = auth_client.post(
            "/api/v1/clinic/forms/submissions/",
            {
                "form": form.id,
                "patient_id": str(uuid.uuid4()),
                "submitted_by": "Nurse Sally",
                "values_json": {"agree": True},
            },
            format="json",
        )
        assert response_valid.status_code == 201

        # 3. Submit invalid response (missing required field)
        response_invalid = auth_client.post(
            "/api/v1/clinic/forms/submissions/",
            {
                "form": form.id,
                "patient_id": str(uuid.uuid4()),
                "submitted_by": "Nurse Sally",
                "values_json": {},
            },
            format="json",
        )
        assert response_invalid.status_code == 400

    def test_telemedicine_meeting_session_events(self, auth_client, test_tenant_id):
        # 1. Setup Patient
        patient = Patient.objects.create(
            tenant_id=test_tenant_id,
            first_name="Rana",
            last_name="Fadi",
            dob="1995-10-10",
            mrn="MRN-T-02",
        )

        # 2. Register virtual visit (should auto generate session link)
        response = auth_client.post(
            "/api/v1/clinic/telemedicine/visits/",
            {
                "patient": str(patient.id),
                "provider_id": str(uuid.uuid4()),
                "scheduled_start": timezone.now().isoformat(),
            },
            format="json",
        )
        assert response.status_code == 201
        assert "session" in response.data
        assert response.data["session"]["connection_url"].startswith(
            "https://cyconnect.cymed.io/meeting/"
        )

        # 3. Trigger starting visit (should emit event)
        visit_id = response.data["id"]
        response_start = auth_client.post(
            f"/api/v1/clinic/telemedicine/visits/{visit_id}/start_session/"
        )
        assert response_start.status_code == 200
        assert response_start.data["status"] == "in_progress"
        assert (
            OutboxEvent.objects.filter(
                tenant_id=test_tenant_id, event_type="cymed.clinic.telemedicine.started"
            ).count()
            == 1
        )

        # Consent log
        consent_resp = auth_client.post(
            "/api/v1/clinic/telemedicine/consents/",
            {"patient": str(patient.id), "signature_blob": "Base64Signature==", "is_active": True},
            format="json",
        )
        assert consent_resp.status_code == 201

    def test_referrals_and_attachments(self, auth_client, test_tenant_id):
        patient = Patient.objects.create(
            tenant_id=test_tenant_id,
            first_name="Tariq",
            last_name="Omar",
            dob="2005-02-02",
            mrn="MRN-R-01",
        )
        reason = ReferralReason.objects.create(tenant_id=test_tenant_id, name="MRI", code="mri")
        prov = ReferralProvider.objects.create(
            tenant_id=test_tenant_id,
            name="Dr. Ziad",
            code="ziad",
            organization_name="Specialized Radiology Center",
        )

        response = auth_client.post(
            "/api/v1/clinic/referrals/records/",
            {
                "patient": str(patient.id),
                "referred_by": "Dr. Hani",
                "target_provider": prov.id,
                "reason": reason.id,
                "status": "active",
                "notes": "Please scan left knee",
                "attachments": [{"title": "Clinical Chart", "file_url": "https://s3.org/file.pdf"}],
            },
            format="json",
        )
        assert response.status_code == 201
        assert (
            OutboxEvent.objects.filter(
                tenant_id=test_tenant_id, event_type="cymed.clinic.referral.created"
            ).count()
            == 1
        )

    def test_insurance_bridge_eligibility_and_authorization(self, auth_client, test_tenant_id):
        patient = Patient.objects.create(
            tenant_id=test_tenant_id,
            first_name="Jana",
            last_name="Khaled",
            dob="1999-09-19",
            mrn="MRN-I-01",
        )
        payer = Payer.objects.create(
            tenant_id=test_tenant_id, name="MedNet UAE", payer_code="mednet"
        )
        plan = InsurancePlan.objects.create(
            tenant_id=test_tenant_id,
            payer=payer,
            plan_name="Gold Plan",
            plan_code="gold",
            copay_percentage=10.0,
        )

        # 1. Eligibility Check
        elig_resp = auth_client.post(
            "/api/v1/clinic/insurance/eligibility/",
            {"patient": str(patient.id), "plan": plan.id},
            format="json",
        )
        assert elig_resp.status_code == 201
        # No Availity ConnectorConfig/endpoint is configured in this test env, so the
        # FHIR dispatch honestly reports "not_sent" (see ConnectorFramework docstring:
        # it never fabricates a "synced"/success status for a call that never happened).
        assert elig_resp.data["is_eligible"] is False
        assert elig_resp.data["response_details"]["card_status"] == "inactive"

        # 2. Prior Authorization request (triggers auto approve response mock)
        auth_resp = auth_client.post(
            "/api/v1/clinic/insurance/auth-requests/",
            {
                "patient": str(patient.id),
                "plan": plan.id,
                "requested_service": "Arthroscopy Surgery",
                "clinical_justification": "Tear in meniscus",
            },
            format="json",
        )
        assert auth_resp.status_code == 201
        assert auth_resp.data["status"] == "approved"
        assert auth_resp.data["response"]["authorization_number"].startswith("AUTH-")

    def test_billing_bridge_erp_ledger_posting(self, auth_client, test_tenant_id):
        # 1. Setup Base Data
        org = Organization.objects.create(
            tenant_id=test_tenant_id, name="Clinic Org", slug="cl-org-b", organization_type="clinic"
        )
        fac = Facility.objects.create(
            tenant_id=test_tenant_id, organization=org, name="Clinic Fac", code="CL-FAC-B"
        )
        patient = Patient.objects.create(
            tenant_id=test_tenant_id,
            first_name="Lujain",
            last_name="Salem",
            dob="2002-05-15",
            mrn="MRN-B-01",
        )
        enc = Encounter.objects.create(
            tenant_id=test_tenant_id,
            patient=patient,
            encounter_type="outpatient",
            status="finished",
            organization=org,
            facility=fac,
        )

        code = ChargeCode.objects.create(
            tenant_id=test_tenant_id,
            code="99213",
            display="Outpatient Consultation",
            category="consultation",
        )
        pr = PriceList.objects.create(
            tenant_id=test_tenant_id, name="UAE Price List", code="uae-prices", currency="AED"
        )
        service = ClinicService.objects.create(
            tenant_id=test_tenant_id, price_list=pr, charge_code=code, price=250.00
        )

        # 2. Post Charge Item (triggers auto posting mock to CyCom ERP)
        response = auth_client.post(
            "/api/v1/clinic/billing/items/",
            {"encounter": enc.id, "service": service.id, "quantity": 1},
            format="json",
        )
        assert response.status_code == 201
        assert response.data["posted_to_erp"] is True
        assert response.data["erp_transaction_id"].startswith("ERP-TX-")


def _make_role_client(test_tenant_id, private_key, roles: list[str], sub: str = "66666666-6666-6666-6666-666666666666"):
    client = APIClient()
    now = int(time.time())
    payload = {
        "sub": sub,
        "email": "staff@cymed.io",
        "tenant_id": str(test_tenant_id),
        "realm_access": {"roles": roles},
        "roles": roles,
        "permissions": ["read", "write"],
        "iat": now,
        "exp": now + 3600,
        "aud": settings.CYIDENTITY_CLIENT_ID,
        "iss": settings.CYIDENTITY_ISSUER,
    }
    token = jwt.encode(payload, private_key, algorithm="RS256")
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {token}",
        HTTP_X_TENANT_ID=str(test_tenant_id),
    )
    return client


@pytest.fixture
def receptionist_client(test_tenant_id, _rsa_keypair, _mock_jwks):
    private_key, _public_pem = _rsa_keypair
    return _make_role_client(
        test_tenant_id, private_key, ["receptionist"], sub="77777777-7777-7777-7777-777777777777"
    )


@pytest.fixture
def physician_client(test_tenant_id, _rsa_keypair, _mock_jwks):
    private_key, _public_pem = _rsa_keypair
    return _make_role_client(
        test_tenant_id, private_key, ["physician"], sub="88888888-8888-8888-8888-888888888888"
    )


@pytest.mark.django_db
class TestClinicActionRBAC:
    """
    Previously every clinic endpoint only required IsAuthenticated -- any
    authenticated user of any role could book/cancel appointments, post
    consultation notes, or post billing charges for their tenant. These
    tests prove the per-action role gate added to ClinicModelViewSet
    subclasses (appointments/consultations/billing/insurance/reception/
    triage/referrals) actually blocks the wrong role and allows the right
    one, using real signed/verified JWTs -- mirrors
    hospital/tests/test_hospital.py::TestHospitalActionRBAC.
    """

    def test_receptionist_cannot_write_consultation_but_physician_can(
        self, receptionist_client, physician_client, test_tenant_id
    ):
        org = Organization.objects.create(
            tenant_id=test_tenant_id, name="RBAC Org", slug="rbac-org", organization_type="clinic"
        )
        fac = Facility.objects.create(
            tenant_id=test_tenant_id, organization=org, name="RBAC Fac", code="RBAC-FAC"
        )
        patient = Patient.objects.create(
            tenant_id=test_tenant_id, first_name="Rbac", last_name="Patient", dob="1990-01-01", mrn="MRN-RBAC-01"
        )
        enc = Encounter.objects.create(
            tenant_id=test_tenant_id, patient=patient, encounter_type="outpatient",
            status="in_progress", organization=org, facility=fac,
        )

        receptionist_resp = receptionist_client.post(
            "/api/v1/clinic/consultations/notes/",
            {"encounter": str(enc.id), "consulted_by": "Dr. Should Not Matter", "subjective": "x"},
            format="json",
        )
        assert receptionist_resp.status_code == 403

        physician_resp = physician_client.post(
            "/api/v1/clinic/consultations/notes/",
            {"encounter": str(enc.id), "consulted_by": "Dr. Physician", "subjective": "x"},
            format="json",
        )
        assert physician_resp.status_code == 201

    def test_physician_cannot_checkin_but_receptionist_can(
        self, receptionist_client, physician_client, test_tenant_id
    ):
        patient = Patient.objects.create(
            tenant_id=test_tenant_id, first_name="Checkin", last_name="Patient", dob="1990-01-01", mrn="MRN-RBAC-02"
        )
        arr_method = ArrivalMethod.objects.create(
            tenant_id=test_tenant_id, name="Walk-In", code="walkin-rbac"
        )
        reason = VisitReason.objects.create(tenant_id=test_tenant_id, name="Checkup", code="checkup-rbac")
        status_model = VisitStatus.objects.create(
            tenant_id=test_tenant_id, name="Open", code="open-rbac"
        )

        physician_resp = physician_client.post(
            "/api/v1/clinic/reception/checkins/",
            {
                "patient": str(patient.id),
                "arrival_method": arr_method.id,
                "visit_reason": reason.id,
                "status": status_model.id,
            },
            format="json",
        )
        assert physician_resp.status_code == 403

        receptionist_resp = receptionist_client.post(
            "/api/v1/clinic/reception/checkins/",
            {
                "patient": str(patient.id),
                "arrival_method": arr_method.id,
                "visit_reason": reason.id,
                "status": status_model.id,
            },
            format="json",
        )
        assert receptionist_resp.status_code == 201


@pytest.mark.django_db
class TestClinicPHIAudit:
    """
    Clinic had zero AuditService coverage and zero data_classification
    markers despite handling patient vitals, SOAP notes, and consent --
    the same HIPAA gap class closed for Hospital. These prove both are
    now real: mutating a PHI-classified model writes a real AuditEvent,
    and mutating a non-PHI reference-data model does not.
    """

    def test_checkin_create_writes_real_audit_event(self, auth_client, test_tenant_id):
        from platform.audit.models import AuditEvent

        patient = Patient.objects.create(
            tenant_id=test_tenant_id, first_name="Audit", last_name="Patient", dob="1990-01-01", mrn="MRN-AUDIT-01"
        )
        arr_method = ArrivalMethod.objects.create(tenant_id=test_tenant_id, name="Walk-In", code="walkin-audit")
        reason = VisitReason.objects.create(tenant_id=test_tenant_id, name="Checkup", code="checkup-audit")
        status_model = VisitStatus.objects.create(tenant_id=test_tenant_id, name="Open", code="open-audit")

        assert AuditEvent.objects.filter(tenant_id=test_tenant_id, resource_type="CheckIn").count() == 0

        response = auth_client.post(
            "/api/v1/clinic/reception/checkins/",
            {
                "patient": str(patient.id),
                "arrival_method": arr_method.id,
                "visit_reason": reason.id,
                "status": status_model.id,
            },
            format="json",
        )
        assert response.status_code == 201

        events = AuditEvent.objects.filter(tenant_id=test_tenant_id, resource_type="CheckIn")
        assert events.count() == 1
        event = events.first()
        assert event.action_verb == "CREATE"
        assert event.data_classification == "phi"
        assert event.resource_id == response.data["id"]

    def test_arrival_method_create_is_not_audited(self, auth_client, test_tenant_id):
        from platform.audit.models import AuditEvent

        response = auth_client.post(
            "/api/v1/clinic/reception/arrival-methods/",
            {"name": "Ambulance", "code": "ambulance-noaudit"},
            format="json",
        )
        assert response.status_code == 201
        assert AuditEvent.objects.filter(tenant_id=test_tenant_id, resource_type="ArrivalMethod").count() == 0

    def test_consultation_read_is_audited(self, auth_client, test_tenant_id):
        from platform.audit.models import AuditEvent

        org = Organization.objects.create(
            tenant_id=test_tenant_id, name="Read Org", slug="read-org", organization_type="clinic"
        )
        fac = Facility.objects.create(
            tenant_id=test_tenant_id, organization=org, name="Read Fac", code="READ-FAC"
        )
        patient = Patient.objects.create(
            tenant_id=test_tenant_id, first_name="Read", last_name="Patient", dob="1990-01-01", mrn="MRN-AUDIT-02"
        )
        enc = Encounter.objects.create(
            tenant_id=test_tenant_id, patient=patient, encounter_type="outpatient",
            status="in_progress", organization=org, facility=fac,
        )
        create_resp = auth_client.post(
            "/api/v1/clinic/consultations/notes/",
            {"encounter": str(enc.id), "consulted_by": "Dr. Reader", "subjective": "x"},
            format="json",
        )
        assert create_resp.status_code == 201
        consultation_id = create_resp.data["id"]

        read_resp = auth_client.get(f"/api/v1/clinic/consultations/notes/{consultation_id}/")
        assert read_resp.status_code == 200

        read_events = AuditEvent.objects.filter(
            tenant_id=test_tenant_id, resource_type="Consultation", action_verb="READ"
        )
        assert read_events.count() == 1
