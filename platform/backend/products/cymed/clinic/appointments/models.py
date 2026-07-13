from django.db import models

from platform.common.models import BaseModel
from products.cymed.core.scheduling.models import Appointment


class ClinicAppointment(BaseModel):
    data_classification = "phi"

    appointment = models.OneToOneField(
        Appointment, on_delete=models.CASCADE, related_name="clinic_details"
    )
    specialty_code = models.CharField(max_length=100)
    checkin_status = models.CharField(
        max_length=50,
        choices=[("pending", "Pending"), ("checked_in", "Checked In"), ("missed", "Missed")],
        default="pending",
    )
    source = models.CharField(max_length=50, default="portal")  # portal, callcenter, walking

    class Meta:
        db_table = "cymed_clinic_appointments"


class AppointmentReminder(BaseModel):
    data_classification = "phi"

    clinic_appointment = models.ForeignKey(
        ClinicAppointment, on_delete=models.CASCADE, related_name="reminders"
    )
    channel = models.CharField(
        max_length=30, choices=[("sms", "SMS"), ("email", "Email"), ("whatsapp", "WhatsApp")]
    )
    scheduled_time = models.DateTimeField()
    sent_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=30,
        choices=[("pending", "Pending"), ("sent", "Sent"), ("failed", "Failed")],
        default="pending",
    )

    class Meta:
        db_table = "cymed_clinic_appointment_reminders"


class AppointmentWaitlist(BaseModel):
    data_classification = "phi"

    patient_id = models.UUIDField()
    provider_id = models.UUIDField()
    specialty_code = models.CharField(max_length=100)
    priority = models.IntegerField(default=0)  # higher value means higher priority
    requested_date = models.DateField()
    status = models.CharField(
        max_length=30,
        choices=[
            ("active", "Active"),
            ("offered", "Offered"),
            ("booked", "Booked"),
            ("cancelled", "Cancelled"),
        ],
        default="active",
    )

    class Meta:
        db_table = "cymed_clinic_appointment_waitlist"


class AppointmentTemplate(BaseModel):
    provider_id = models.UUIDField()
    day_of_week = models.PositiveSmallIntegerField()  # 0=Monday, 6=Sunday
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_duration_minutes = models.PositiveIntegerField(default=15)

    class Meta:
        db_table = "cymed_clinic_appointment_templates"


class AppointmentRule(BaseModel):
    name = models.CharField(max_length=255)
    specialty_code = models.CharField(max_length=100)
    max_duration_minutes = models.PositiveIntegerField(default=60)
    allow_conflicting_bookings = models.BooleanField(default=False)

    class Meta:
        db_table = "cymed_clinic_appointment_rules"
