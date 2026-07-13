from django.db import models

from platform.common.models import BaseModel
from products.cymed.clinic.reception.models import PatientQueueTicket


class Queue(BaseModel):
    name = models.CharField(max_length=255)
    department_id = models.UUIDField()  # maps to facility Department
    code = models.CharField(max_length=50, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "cymed_clinic_queues"

    def __str__(self) -> str:
        return self.name


class QueueEntry(BaseModel):
    data_classification = "phi"

    queue = models.ForeignKey(Queue, on_delete=models.CASCADE, related_name="entries")
    ticket = models.ForeignKey(
        PatientQueueTicket, on_delete=models.CASCADE, related_name="queue_entries"
    )
    priority_level = models.IntegerField(default=0)  # higher is higher priority
    status = models.CharField(
        max_length=50,
        choices=[
            ("waiting", "Waiting"),
            ("called", "Called"),
            ("active", "Active"),
            ("skipped", "Skipped"),
            ("completed", "Completed"),
        ],
        default="waiting",
    )

    class Meta:
        db_table = "cymed_clinic_queue_entries"


class QueueBoard(BaseModel):
    queue = models.ForeignKey(Queue, on_delete=models.CASCADE, related_name="boards")
    board_name = models.CharField(max_length=255)
    layout_settings = models.JSONField(default=dict)  # TV layout settings

    class Meta:
        db_table = "cymed_clinic_queue_boards"


class ProviderQueue(BaseModel):
    provider_id = models.UUIDField()  # maps to practitioner Provider
    queue = models.ForeignKey(Queue, on_delete=models.CASCADE, related_name="provider_queues")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "cymed_clinic_provider_queues"
