from django.db import models

from platform.common.models import BaseModel
from products.cymed.core.patients.models import Patient
from products.cymed.core.scheduling.models import Appointment


class ArrivalMethod(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)

    class Meta:
        db_table = "cymed_clinic_arrival_methods"

    def __str__(self) -> str:
        return self.name


class VisitReason(BaseModel):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=100, unique=True)

    class Meta:
        db_table = "cymed_clinic_visit_reasons"

    def __str__(self) -> str:
        return self.name


class VisitStatus(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)

    class Meta:
        db_table = "cymed_clinic_visit_statuses"

    def __str__(self) -> str:
        return self.name


class CheckIn(BaseModel):
    data_classification = "phi"

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="clinic_checkins")
    appointment = models.ForeignKey(
        Appointment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_checkins",
    )
    arrival_method = models.ForeignKey(ArrivalMethod, on_delete=models.PROTECT)
    visit_reason = models.ForeignKey(VisitReason, on_delete=models.PROTECT)
    status = models.ForeignKey(VisitStatus, on_delete=models.PROTECT)
    checkin_time = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cymed_clinic_checkins"


class CheckOut(BaseModel):
    data_classification = "phi"

    checkin = models.OneToOneField(CheckIn, on_delete=models.CASCADE, related_name="checkout")
    checkout_time = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=50, default="completed")

    class Meta:
        db_table = "cymed_clinic_checkouts"


class PatientQueueTicket(BaseModel):
    data_classification = "phi"

    checkin = models.OneToOneField(CheckIn, on_delete=models.CASCADE, related_name="queue_ticket")
    ticket_number = models.CharField(max_length=50)
    status = models.CharField(
        max_length=50,
        choices=[
            ("waiting", "Waiting"),
            ("called", "Called"),
            ("active", "Active"),
            ("completed", "Completed"),
            ("skipped", "Skipped"),
        ],
        default="waiting",
    )
    priority = models.CharField(
        max_length=30,
        choices=[("routine", "Routine"), ("priority", "Priority"), ("emergency", "Emergency")],
        default="routine",
    )

    class Meta:
        db_table = "cymed_clinic_queue_tickets"
