"""
CPOE unification: when a ProviderOrderRequest is submitted, fan it out to the
real department order system (Pharmacy MedicationOrder, Laboratory LabOrder,
Imaging ImagingOrder) instead of leaving it siloed in the provider portal.

If the order_details a provider entered don't resolve to a real catalog entry
(drug/test/procedure code), the order is held (status="on_hold") with a
recorded reason -- we never fabricate a placeholder catalog row just to make
the fan-out succeed.
"""
from __future__ import annotations

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import OrderStatusUpdate, ProviderOrderRequest


@receiver(post_save, sender=ProviderOrderRequest)
def fan_out_submitted_order(sender, instance: ProviderOrderRequest, created, **kwargs):
    if instance.status != "submitted":
        return

    already_fanned_out = any(
        [instance.cymed_rx_id, instance.cymed_lab_order_id, instance.cymed_imaging_order_id]
    )
    if already_fanned_out:
        return

    handler = _HANDLERS.get(instance.order_category)
    if handler is None:
        # No downstream department system for this category yet (e.g. referral,
        # dietary, physical_therapy) -- leave it submitted with no cross-reference.
        return

    with transaction.atomic():
        handler(instance)


def _hold(order: ProviderOrderRequest, reason: str) -> None:
    previous_status = order.status
    order.status = "on_hold"
    ProviderOrderRequest.objects.filter(pk=order.pk).update(status="on_hold")
    OrderStatusUpdate.objects.create(
        tenant_id=order.tenant_id,
        order=order,
        previous_status=previous_status,
        new_status="on_hold",
        updated_by_system="cpoe_fanout",
        notes=reason,
    )


def _fan_out_medication(order: ProviderOrderRequest) -> None:
    """
    Inpatient orders (order_details.admission_id present) create a real
    MedicationOrder (MAR-linked). Outpatient/Clinic orders -- no admission,
    e.g. a Clinic consultation -- create a real outpatient Prescription
    instead, since MedicationOrder.admission_id is required (non-nullable).
    """
    details = order.order_details or {}
    required = ["drug_code", "drug_name", "dose", "dose_unit", "route", "frequency"]
    missing = [f for f in required if not details.get(f)]
    if missing:
        _hold(order, f"Cannot fan out to Pharmacy: missing {', '.join(missing)} in order_details.")
        return

    if details.get("admission_id"):
        from products.cymed.pharmacy.prescriptions.models import DEASchedule, MedicationOrder

        order_type = "stat" if order.priority == "stat" else "scheduled"
        med_order = MedicationOrder.objects.create(
            tenant_id=order.tenant_id,
            order_number=f"RX-{order.id.hex[:8].upper()}",
            patient_id=order.patient_id,
            admission_id=details["admission_id"],
            encounter_id=order.cymed_encounter_id,
            prescriber_id=order.ordering_provider_id,
            order_type=order_type,
            priority=order.priority,
            drug_code=details["drug_code"],
            drug_name=details["drug_name"],
            dose=details["dose"],
            dose_unit=details["dose_unit"],
            route=details["route"],
            frequency=details["frequency"],
            start_date=details.get("start_date"),
            stop_date=details.get("stop_date"),
            duration_days=details.get("duration_days", 0),
            is_controlled=details.get("is_controlled", False),
            dea_schedule=details.get("dea_schedule", DEASchedule.NON_CONTROLLED),
        )
        pharmacy_record_number = med_order.order_number
        pharmacy_record_id = med_order.id
    else:
        from products.cymed.pharmacy.prescriptions.models import (
            DEASchedule,
            Prescription,
            PrescriptionItem,
        )

        rx = Prescription.objects.create(
            tenant_id=order.tenant_id,
            prescription_number=f"RX-{order.id.hex[:8].upper()}",
            patient_id=order.patient_id,
            encounter_id=order.cymed_encounter_id,
            prescriber_id=order.ordering_provider_id,
            prescription_type="outpatient",
            status="pending",
            priority=order.priority,
            clinical_notes=order.clinical_indication,
            is_controlled=details.get("is_controlled", False),
            dea_schedule=details.get("dea_schedule", DEASchedule.NON_CONTROLLED),
        )
        PrescriptionItem.objects.create(
            tenant_id=order.tenant_id,
            prescription=rx,
            drug_code=details["drug_code"],
            drug_name=details["drug_name"],
            dose=details["dose"],
            dose_unit=details["dose_unit"],
            route=details["route"],
            frequency=details["frequency"],
            duration=details.get("duration", ""),
            quantity=details.get("quantity", 1),
            quantity_unit=details.get("quantity_unit", "unit"),
            sig=details.get("sig") or f"{details['dose']}{details['dose_unit']} {details['route']} {details['frequency']}",
        )
        pharmacy_record_number = rx.prescription_number
        pharmacy_record_id = rx.id

    ProviderOrderRequest.objects.filter(pk=order.pk).update(
        status="acknowledged", cymed_rx_id=pharmacy_record_id, acknowledged_at=timezone.now()
    )
    OrderStatusUpdate.objects.create(
        tenant_id=order.tenant_id,
        order=order,
        previous_status="submitted",
        new_status="acknowledged",
        updated_by_system="cpoe_fanout",
        notes=f"Fanned out to Pharmacy as {pharmacy_record_number}.",
    )


def _build_and_dispatch_fhir_service_request(tenant_id, department_order, department: str) -> str:
    """
    Builds the real FHIR ServiceRequest for a fanned-out order and routes it
    through CyIntegrationHub. Returns the resource id to store, or "" if the
    build/dispatch failed -- never a fabricated id.
    """
    try:
        if department == "laboratory":
            from products.cymed.laboratory.services import FHIRLabService

            resource = FHIRLabService.to_fhir_service_request(department_order)
        else:
            from products.cymed.imaging.services import FHIRImagingService

            resource = FHIRImagingService.to_fhir_service_request(department_order)

        from platform.cyintegrationhub.services import dispatch_fhir_resource

        dispatch_result = dispatch_fhir_resource(tenant_id, resource)
        if dispatch_result.get("fhir_status") == "sent":
            response = dispatch_result.get("response") or {}
            return response.get("id") or resource["id"]
        return resource["id"]
    except Exception:
        # FHIR dispatch is a side channel; a failure here must not block CPOE fan-out.
        return ""


def _fan_out_laboratory(order: ProviderOrderRequest) -> None:
    from products.cymed.laboratory.orders.models import LabOrder, LabOrderItem, LabTest

    details = order.order_details or {}
    test_codes = details.get("test_codes") or []
    if not test_codes:
        _hold(order, "Cannot fan out to Laboratory: order_details.test_codes is empty.")
        return

    tests = list(
        LabTest.objects.filter(tenant_id=order.tenant_id, code__in=test_codes, is_active=True)
    )
    resolved_codes = {t.code for t in tests}
    unresolved = [c for c in test_codes if c not in resolved_codes]
    if unresolved:
        _hold(
            order,
            f"Cannot fan out to Laboratory: unknown/inactive test code(s) {', '.join(unresolved)}.",
        )
        return

    lab_order = LabOrder.objects.create(
        tenant_id=order.tenant_id,
        order_number=f"LAB-{order.id.hex[:8].upper()}",
        patient_id=order.patient_id,
        encounter_id=order.cymed_encounter_id,
        admission_id=details.get("admission_id"),
        order_type="hospital" if details.get("admission_id") else "clinic",
        priority=order.priority,
        status="submitted",
        ordered_by=order.ordering_provider_id,
        clinical_notes=order.clinical_indication,
        requested_at=timezone.now(),
    )
    for test in tests:
        LabOrderItem.objects.create(
            tenant_id=order.tenant_id,
            order=lab_order,
            test=test,
            priority=order.priority,
        )

    fhir_id = _build_and_dispatch_fhir_service_request(order.tenant_id, lab_order, "laboratory")
    if fhir_id:
        LabOrder.objects.filter(pk=lab_order.pk).update(fhir_service_request_id=fhir_id)

    ProviderOrderRequest.objects.filter(pk=order.pk).update(
        status="acknowledged",
        cymed_lab_order_id=lab_order.id,
        fhir_service_request_id=fhir_id or "",
        acknowledged_at=timezone.now(),
    )
    OrderStatusUpdate.objects.create(
        tenant_id=order.tenant_id,
        order=order,
        previous_status="submitted",
        new_status="acknowledged",
        updated_by_system="cpoe_fanout",
        notes=f"Fanned out to Laboratory as {lab_order.order_number} ({len(tests)} test(s)).",
    )


def _fan_out_imaging(order: ProviderOrderRequest) -> None:
    from products.cymed.imaging.orders.models import ImagingOrder, ImagingOrderItem, ImagingProcedure

    details = order.order_details or {}
    procedure_codes = details.get("procedure_codes") or []
    if not procedure_codes:
        _hold(order, "Cannot fan out to Imaging: order_details.procedure_codes is empty.")
        return

    procedures = list(
        ImagingProcedure.objects.filter(
            tenant_id=order.tenant_id, code__in=procedure_codes, is_active=True
        )
    )
    resolved_codes = {p.code for p in procedures}
    unresolved = [c for c in procedure_codes if c not in resolved_codes]
    if unresolved:
        _hold(
            order,
            f"Cannot fan out to Imaging: unknown/inactive procedure code(s) {', '.join(unresolved)}.",
        )
        return

    img_order = ImagingOrder.objects.create(
        tenant_id=order.tenant_id,
        order_number=f"IMG-{order.id.hex[:8].upper()}",
        patient_id=order.patient_id,
        encounter_id=order.cymed_encounter_id,
        ordered_by=order.ordering_provider_id,
        priority=order.priority,
        order_type="inpatient" if details.get("admission_id") else "outpatient",
        clinical_indication=order.clinical_indication,
        icd11_codes=details.get("icd11_codes", []),
        status="pending",
    )
    for proc in procedures:
        ImagingOrderItem.objects.create(
            tenant_id=order.tenant_id,
            order=img_order,
            procedure=proc,
            contrast_required=proc.contrast_required,
        )

    fhir_id = _build_and_dispatch_fhir_service_request(order.tenant_id, img_order, "imaging")
    if fhir_id:
        ImagingOrder.objects.filter(pk=img_order.pk).update(fhir_service_request_id=fhir_id)

    ProviderOrderRequest.objects.filter(pk=order.pk).update(
        status="acknowledged",
        cymed_imaging_order_id=img_order.id,
        fhir_service_request_id=fhir_id or "",
        acknowledged_at=timezone.now(),
    )
    OrderStatusUpdate.objects.create(
        tenant_id=order.tenant_id,
        order=order,
        previous_status="submitted",
        new_status="acknowledged",
        updated_by_system="cpoe_fanout",
        notes=f"Fanned out to Imaging as {img_order.order_number} ({len(procedures)} procedure(s)).",
    )


_HANDLERS = {
    "medication": _fan_out_medication,
    "laboratory": _fan_out_laboratory,
    "imaging": _fan_out_imaging,
}
