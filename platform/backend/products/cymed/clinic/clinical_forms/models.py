from django.db import models

from platform.common.models import BaseModel
from products.cymed.clinic.specialties.models import SpecialtyProfile


class ClinicalForm(BaseModel):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "cymed_clinic_clinical_forms"

    def __str__(self) -> str:
        return self.name


class ClinicalFormSection(BaseModel):
    form = models.ForeignKey(ClinicalForm, on_delete=models.CASCADE, related_name="sections")
    title = models.CharField(max_length=255)
    title_ar = models.CharField(max_length=255, blank=True)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "cymed_clinic_clinical_form_sections"


class ClinicalFormField(BaseModel):
    section = models.ForeignKey(
        ClinicalFormSection, on_delete=models.CASCADE, related_name="fields"
    )
    label = models.CharField(max_length=255)
    label_ar = models.CharField(max_length=255, blank=True)
    field_type = models.CharField(
        max_length=50,
        choices=[
            ("text", "Text"),
            ("number", "Number"),
            ("select", "Select"),
            ("date", "Date"),
            ("boolean", "Boolean"),
        ],
    )
    options_json = models.JSONField(default=list, blank=True)  # choices for select field
    required = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "cymed_clinic_clinical_form_fields"


class ClinicalFormTemplate(BaseModel):
    specialty = models.ForeignKey(
        SpecialtyProfile, on_delete=models.CASCADE, related_name="form_templates"
    )
    form = models.ForeignKey(ClinicalForm, on_delete=models.CASCADE, related_name="templates")
    name = models.CharField(max_length=255)

    class Meta:
        db_table = "cymed_clinic_clinical_form_templates"
        unique_together = [("specialty", "form")]


class ClinicalFormSubmission(BaseModel):
    data_classification = "phi"

    form = models.ForeignKey(ClinicalForm, on_delete=models.CASCADE, related_name="submissions")
    patient_id = models.UUIDField(db_index=True)
    encounter_id = models.UUIDField(db_index=True, null=True, blank=True)
    submitted_by = models.CharField(max_length=255)
    submitted_at = models.DateTimeField(auto_now_add=True)
    values_json = models.JSONField(default=dict)  # submitted form values

    class Meta:
        db_table = "cymed_clinic_clinical_form_submissions"
