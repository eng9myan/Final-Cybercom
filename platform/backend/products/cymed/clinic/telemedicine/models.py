from django.db import models

from platform.common.models import BaseModel
from products.cymed.core.patients.models import Patient


class VirtualVisit(BaseModel):
    data_classification = "phi"

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="virtual_visits")
    provider_id = models.UUIDField()  # references Provider
    scheduled_start = models.DateTimeField()
    status = models.CharField(
        max_length=50,
        choices=[
            ("scheduled", "Scheduled"),
            ("in_progress", "In Progress"),
            ("completed", "Completed"),
            ("cancelled", "Cancelled"),
        ],
        default="scheduled",
    )

    class Meta:
        db_table = "cymed_clinic_virtual_visits"


class VirtualSession(BaseModel):
    data_classification = "phi"

    visit = models.OneToOneField(VirtualVisit, on_delete=models.CASCADE, related_name="session")
    session_token = models.CharField(max_length=255)
    connection_url = models.URLField(max_length=500)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "cymed_clinic_virtual_sessions"


class VirtualRecording(BaseModel):
    data_classification = "phi"

    session = models.ForeignKey(VirtualSession, on_delete=models.CASCADE, related_name="recordings")
    recording_url = models.URLField(max_length=500)
    duration_seconds = models.PositiveIntegerField()

    class Meta:
        db_table = "cymed_clinic_virtual_recordings"


class VirtualConsent(BaseModel):
    data_classification = "phi"

    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name="telemedicine_consents"
    )
    consented_at = models.DateTimeField(auto_now_add=True)
    signature_blob = models.TextField()  # Base64 signature
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "cymed_clinic_virtual_consents"
