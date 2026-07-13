from django.db import models

from platform.common.models import BaseModel
from products.cymed.core.encounters.models import Encounter


class ChargeCode(BaseModel):
    code = models.CharField(max_length=100, unique=True)
    display = models.CharField(max_length=255)
    category = models.CharField(
        max_length=50,
        choices=[
            ("consultation", "Consultation"),
            ("procedure", "Procedure"),
            ("service", "Service"),
        ],
    )

    class Meta:
        db_table = "cymed_clinic_charge_codes"

    def __str__(self) -> str:
        return f"{self.code} - {self.display}"


class PriceList(BaseModel):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    currency = models.CharField(max_length=10, default="USD")

    class Meta:
        db_table = "cymed_clinic_pricelists"

    def __str__(self) -> str:
        return self.name


class ClinicService(BaseModel):
    price_list = models.ForeignKey(PriceList, on_delete=models.CASCADE, related_name="services")
    charge_code = models.ForeignKey(ChargeCode, on_delete=models.PROTECT)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = "cymed_clinic_services"
        unique_together = [("price_list", "charge_code")]


class ChargeItem(BaseModel):
    data_classification = "phi"

    encounter = models.ForeignKey(Encounter, on_delete=models.CASCADE, related_name="charges")
    service = models.ForeignKey(ClinicService, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(default=1)
    posted_to_erp = models.BooleanField(default=False)
    erp_transaction_id = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "cymed_clinic_charge_items"
