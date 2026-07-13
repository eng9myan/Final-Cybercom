from django.db import models

from platform.common.models import BaseModel
from products.cymed.clinic.reception.models import CheckIn


class TriageAssessment(BaseModel):
    data_classification = "phi"

    checkin = models.ForeignKey(
        CheckIn, on_delete=models.CASCADE, related_name="triage_assessments"
    )
    assessed_at = models.DateTimeField(auto_now_add=True)
    assessed_by = models.CharField(max_length=255)
    chief_complaint = models.TextField()
    triage_category = models.CharField(
        max_length=50,
        choices=[
            ("immediate", "Immediate (Level 1)"),
            ("emergent", "Emergent (Level 2)"),
            ("urgent", "Urgent (Level 3)"),
            ("less_urgent", "Less Urgent (Level 4)"),
            ("non_urgent", "Non Urgent (Level 5)"),
        ],
        default="non_urgent",
    )

    class Meta:
        db_table = "cymed_clinic_triage_assessments"


class TriageVitalSigns(BaseModel):
    data_classification = "phi"

    assessment = models.OneToOneField(
        TriageAssessment, on_delete=models.CASCADE, related_name="vital_signs"
    )
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    height_cm = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    bmi = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    temperature_c = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    blood_pressure_systolic = models.PositiveIntegerField(null=True, blank=True)
    blood_pressure_diastolic = models.PositiveIntegerField(null=True, blank=True)
    pulse_bpm = models.PositiveIntegerField(null=True, blank=True)
    respiratory_rate_pm = models.PositiveIntegerField(null=True, blank=True)
    oxygen_saturation_pct = models.PositiveIntegerField(null=True, blank=True)
    pain_score = models.PositiveIntegerField(default=0)  # 0 to 10 scale

    class Meta:
        db_table = "cymed_clinic_triage_vitals"


class TriageRiskScore(BaseModel):
    data_classification = "phi"

    assessment = models.OneToOneField(
        TriageAssessment, on_delete=models.CASCADE, related_name="risk_score"
    )
    mews_score = models.PositiveIntegerField(default=0)  # Modified Early Warning Score
    abnormal_flag = models.BooleanField(default=False)
    risk_level = models.CharField(max_length=50, default="low")  # low, medium, high
    ai_risk_assessment = models.TextField(blank=True)  # suggestions via CyAI

    class Meta:
        db_table = "cymed_clinic_triage_risk_scores"
