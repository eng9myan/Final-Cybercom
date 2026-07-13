from django.db import models

from platform.common.models import BaseModel
from products.cymed.core.patients.models import Patient


class ReferralReason(BaseModel):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=100, unique=True)

    class Meta:
        db_table = "cymed_clinic_referral_reasons"

    def __str__(self) -> str:
        return self.name


class ReferralProvider(BaseModel):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=100, unique=True)
    organization_name = models.CharField(max_length=255)

    class Meta:
        db_table = "cymed_clinic_referral_providers"

    def __str__(self) -> str:
        return f"{self.name} ({self.organization_name})"


class Referral(BaseModel):
    data_classification = "phi"

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="referrals")
    referred_by = models.CharField(max_length=255)
    target_provider = models.ForeignKey(ReferralProvider, on_delete=models.PROTECT)
    reason = models.ForeignKey(ReferralReason, on_delete=models.PROTECT)
    status = models.CharField(
        max_length=50,
        choices=[
            ("draft", "Draft"),
            ("active", "Active"),
            ("accepted", "Accepted"),
            ("completed", "Completed"),
            ("cancelled", "Cancelled"),
        ],
        default="active",
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cymed_clinic_referrals"


class ReferralAttachment(BaseModel):
    data_classification = "phi"

    referral = models.ForeignKey(Referral, on_delete=models.CASCADE, related_name="attachments")
    title = models.CharField(max_length=255)
    file_url = models.URLField(max_length=500)

    class Meta:
        db_table = "cymed_clinic_referral_attachments"
