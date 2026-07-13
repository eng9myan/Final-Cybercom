from django.db import models

from platform.common.models import BaseModel
from products.cymed.core.encounters.models import Encounter


class Consultation(BaseModel):
    data_classification = "phi"

    encounter = models.ForeignKey(
        Encounter, on_delete=models.CASCADE, related_name="clinic_consultations"
    )
    consulted_at = models.DateTimeField(auto_now_add=True)
    consulted_by = models.CharField(max_length=255)
    subjective = models.TextField(blank=True)
    objective = models.TextField(blank=True)
    assessment = models.TextField(blank=True)
    plan = models.TextField(blank=True)

    class Meta:
        db_table = "cymed_clinic_consultations"


class ConsultationDiagnosis(BaseModel):
    data_classification = "phi"

    consultation = models.ForeignKey(
        Consultation, on_delete=models.CASCADE, related_name="diagnoses"
    )
    code = models.CharField(max_length=100)
    system = models.CharField(max_length=50)  # icd11, snomed
    display = models.CharField(max_length=255)
    status = models.CharField(max_length=50, default="confirmed")

    class Meta:
        db_table = "cymed_clinic_consultation_diagnoses"


class ConsultationProcedure(BaseModel):
    data_classification = "phi"

    consultation = models.ForeignKey(
        Consultation, on_delete=models.CASCADE, related_name="procedures"
    )
    code = models.CharField(max_length=100)
    system = models.CharField(max_length=50)  # snomed, loinc
    display = models.CharField(max_length=255)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "cymed_clinic_consultation_procedures"


class ConsultationPlan(BaseModel):
    data_classification = "phi"

    consultation = models.OneToOneField(
        Consultation, on_delete=models.CASCADE, related_name="treatment_plan"
    )
    instructions = models.TextField(blank=True)
    prescriptions = models.JSONField(default=list)  # list of drug directives

    class Meta:
        db_table = "cymed_clinic_consultation_plans"


class ConsultationFollowUp(BaseModel):
    data_classification = "phi"

    consultation = models.ForeignKey(
        Consultation, on_delete=models.CASCADE, related_name="follow_ups"
    )
    follow_up_date = models.DateField()
    reason = models.TextField(blank=True)

    class Meta:
        db_table = "cymed_clinic_consultation_follow_ups"


class ConsultationAttachment(BaseModel):
    data_classification = "phi"

    consultation = models.ForeignKey(
        Consultation, on_delete=models.CASCADE, related_name="attachments"
    )
    title = models.CharField(max_length=255)
    file_url = models.URLField(max_length=500)

    class Meta:
        db_table = "cymed_clinic_consultation_attachments"
