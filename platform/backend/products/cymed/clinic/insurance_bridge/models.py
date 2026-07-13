from django.db import models

from platform.common.models import BaseModel
from products.cymed.core.patients.models import Patient


class Payer(BaseModel):
    name = models.CharField(max_length=255)
    payer_code = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "cymed_clinic_insurance_payers"

    def __str__(self) -> str:
        return self.name


class InsurancePlan(BaseModel):
    payer = models.ForeignKey(Payer, on_delete=models.CASCADE, related_name="plans")
    plan_name = models.CharField(max_length=255)
    plan_code = models.CharField(max_length=100)
    copay_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0.0)

    class Meta:
        db_table = "cymed_clinic_insurance_plans"
        unique_together = [("payer", "plan_code")]


class EligibilityCheck(BaseModel):
    data_classification = "phi"

    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name="eligibility_checks"
    )
    plan = models.ForeignKey(InsurancePlan, on_delete=models.CASCADE)
    checked_at = models.DateTimeField(auto_now_add=True)
    is_eligible = models.BooleanField(default=False)
    response_details = models.JSONField(default=dict)

    class Meta:
        db_table = "cymed_clinic_insurance_eligibility"


class AuthorizationRequest(BaseModel):
    data_classification = "phi"

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE)
    plan = models.ForeignKey(InsurancePlan, on_delete=models.CASCADE)
    requested_service = models.CharField(max_length=255)
    clinical_justification = models.TextField()
    status = models.CharField(
        max_length=50,
        choices=[("pending", "Pending"), ("approved", "Approved"), ("denied", "Denied")],
        default="pending",
    )

    class Meta:
        db_table = "cymed_clinic_insurance_auth_requests"


class AuthorizationResponse(BaseModel):
    data_classification = "phi"

    request = models.OneToOneField(
        AuthorizationRequest, on_delete=models.CASCADE, related_name="response"
    )
    decision_date = models.DateTimeField(auto_now_add=True)
    authorization_number = models.CharField(max_length=100, blank=True)
    denial_reason = models.TextField(blank=True)

    class Meta:
        db_table = "cymed_clinic_insurance_auth_responses"
