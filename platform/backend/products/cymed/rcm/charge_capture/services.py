"""
Charge capture — turns a real clinical order (Lab/Imaging/Pharmacy) into a
real billable Charge, and, when the patient has a Patient Portal account,
a real payable PatientInvoice. Wired from the actual order-creation points
(LabOrderItemViewSet, ImagingOrderItemViewSet, PrescriptionItemViewSet,
Pharmacy POS checkout) rather than only the CPOE fan-out, so both
CPOE-originated and department-self-originated orders get billed the same
way.

Pricing comes from rcm.pricing.ServicePrice (the real chargemaster, keyed by
service_code + service_category) -- never fabricated. If no active price
exists for a service_code, no Charge is created; the clinical order still
succeeds (pricing gaps are a billing-config problem, not a reason to block
care), matching the "hold with reason, don't fabricate" convention used
elsewhere in this codebase (see provider_portal.orders.signals._hold).
"""
from __future__ import annotations

import logging
import uuid
from datetime import date
from decimal import Decimal

from django.utils import timezone

logger = logging.getLogger(__name__)


def _find_unit_price(tenant_id, service_category: str, service_code: str) -> Decimal | None:
    from products.cymed.rcm.pricing.models import ServicePrice

    price = (
        ServicePrice.objects.filter(
            tenant_id=tenant_id,
            service_category=service_category,
            service_code=service_code,
            is_active=True,
            price_list__is_active=True,
        )
        .order_by("-price_list__is_default", "-price_list__effective_date")
        .first()
    )
    return price.unit_price if price else None


def _default_facility_id(tenant_id):
    """
    Lab/Imaging/Pharmacy orders carry no facility_id of their own (checked:
    none of LabOrder/ImagingOrder/Prescription have the field), but
    Charge.facility_id is required. Falls back to the tenant's first real
    Facility row rather than fabricating an id -- most tenants in this
    system are single-facility.
    """
    from products.cymed.core.facilities.models import Facility

    return Facility.objects.filter(tenant_id=tenant_id).values_list("id", flat=True).first()


def _find_or_create_invoice(
    *,
    tenant_id,
    patient_id,
    invoice_type: str,
    amount_total: Decimal,
    provider_name: str,
    service_date_value: date,
    notes: str,
):
    """
    Only creates a PatientInvoice if the patient already has a Patient Portal
    account (PatientPortalAccount.cyidentity_user_id is a real Keycloak user
    id -- there is no legitimate way to fabricate one for a patient who has
    never registered). Returns None, not a fake invoice, when no account
    exists; the Charge itself is still created and billable through
    rcm/billing regardless.
    """
    from products.cymed.patient_portal.accounts.models import PatientPortalAccount
    from products.cymed.patient_portal.payments.models import PatientInvoice

    account = (
        PatientPortalAccount.objects.filter(tenant_id=tenant_id, patient_id=patient_id)
        .only("id")
        .first()
    )
    if account is None:
        return None

    return PatientInvoice.objects.create(
        tenant_id=tenant_id,
        account_id=account.id,
        patient_id=patient_id,
        cycom_invoice_id="",
        invoice_number=f"INV-{uuid.uuid4().hex[:10].upper()}",
        invoice_type=invoice_type,
        provider_name=provider_name,
        service_date=service_date_value,
        amount_total=amount_total,
        amount_patient_due=amount_total,
        status="pending",
        notes=notes,
    )


def capture_and_invoice(
    *,
    tenant_id,
    patient_id,
    encounter_id,
    facility_id,
    service_source: str,
    charge_category: str,
    service_code: str,
    service_description: str,
    quantity: Decimal | int = 1,
    source_order_id=None,
    source_module: str = "",
    rendering_provider_id=None,
    rendering_provider_name: str = "",
):
    """
    Looks up a real unit price for service_code, and if found, creates a real
    rcm.charge_capture.Charge plus (when the patient has a portal account) a
    real patient_portal.payments.PatientInvoice. Returns (charge, invoice) --
    invoice may be None -- or (None, None) if no price exists for this code.
    """
    from products.cymed.rcm.charge_capture.models import Charge

    facility_id = facility_id or _default_facility_id(tenant_id)
    if not encounter_id or not facility_id:
        logger.info(
            "Charge.encounter_id/facility_id are required (non-nullable) -- "
            "no encounter/facility context for %s/%s (tenant=%s), charge not captured.",
            service_source, service_code, tenant_id,
        )
        return None, None

    unit_price = _find_unit_price(tenant_id, service_source, service_code)
    if unit_price is None:
        logger.info(
            "No active ServicePrice for %s/%s (tenant=%s) -- charge not captured.",
            service_source, service_code, tenant_id,
        )
        return None, None

    quantity = Decimal(quantity)
    total_amount = (unit_price * quantity).quantize(Decimal("0.01"))

    charge = Charge.objects.create(
        tenant_id=tenant_id,
        patient_id=patient_id,
        encounter_id=encounter_id,
        charge_date=timezone.now().date(),
        service_source=service_source,
        charge_category=charge_category,
        service_code=service_code,
        service_description=service_description,
        quantity=quantity,
        unit_price=unit_price,
        total_amount=total_amount,
        status="pending",
        is_billable=True,
        source_order_id=source_order_id,
        source_module=source_module,
        rendering_provider_id=rendering_provider_id,
        facility_id=facility_id,
    )

    invoice_type_map = {
        "lab_test": "lab",
        "imaging": "imaging",
        "medication": "pharmacy",
        "consultation": "consultation",
        "procedure": "procedure",
        "admission": "admission",
    }
    invoice = _find_or_create_invoice(
        tenant_id=tenant_id,
        patient_id=patient_id,
        invoice_type=invoice_type_map.get(charge_category, "other"),
        amount_total=total_amount,
        provider_name=rendering_provider_name or service_source.title(),
        service_date_value=charge.charge_date,
        notes=f"{service_description} ({service_code})",
    )
    return charge, invoice
