"""
CyMed Pharmacy — Prescription Management Views
"""

import uuid

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from platform.events.models import OutboxEvent

from ..views import PharmacyModelViewSet
from .models import (
    MedicationHistory,
    MedicationOrder,
    MedicationRefill,
    MedicationRenewal,
    Prescription,
    PrescriptionAttachment,
    PrescriptionItem,
    PrescriptionStatus,
)
from .serializers import (
    MedicationHistorySerializer,
    MedicationOrderSerializer,
    MedicationRefillSerializer,
    MedicationRenewalSerializer,
    PrescriptionAttachmentSerializer,
    PrescriptionItemSerializer,
    PrescriptionSerializer,
)


class PrescriptionViewSet(PharmacyModelViewSet):
    queryset = Prescription.objects.prefetch_related(
        "items", "attachments", "renewals", "refills"
    ).select_related()
    serializer_class = PrescriptionSerializer
    required_feature = "pharmacy.prescriptions"
    filterset_fields = ["prescription_type", "status", "priority", "is_controlled"]
    search_fields = ["prescription_number", "fhir_medication_request_id"]

    def perform_create(self, serializer):
        tenant_id = getattr(self.request, "tenant_id", None)
        rx_number = f"RX-{str(uuid.uuid4()).upper()[:12]}"
        obj = serializer.save(tenant_id=tenant_id, prescription_number=rx_number)
        OutboxEvent.objects.create(
            tenant_id=str(tenant_id) if tenant_id else None,
            topic="cymed.pharmacy.prescription.created",
            event_type="cymed.pharmacy.prescription.created",
            payload={
                "prescription_id": str(obj.id),
                "prescription_number": obj.prescription_number,
                "patient_id": str(obj.patient_id),
                "type": obj.prescription_type,
                "is_controlled": obj.is_controlled,
            },
        )

    @action(detail=True, methods=["post"], url_path="verify")
    def verify(self, request, pk=None):
        """Pharmacist verification of prescription."""
        prescription = self.get_object()
        if prescription.status not in (PrescriptionStatus.PENDING, PrescriptionStatus.DRAFT):
            return Response(
                {"detail": "Prescription is not in a verifiable state."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        prescription.status = PrescriptionStatus.ACTIVE
        prescription.verified_by = request.user.id if hasattr(request, "user") else None
        import django.utils.timezone as tz

        prescription.verified_at = tz.now()
        prescription.save(update_fields=["status", "verified_by", "verified_at", "updated_at"])
        OutboxEvent.objects.create(
            tenant_id=str(prescription.tenant_id) if prescription.tenant_id else None,
            topic="cymed.pharmacy.prescription.verified",
            event_type="cymed.pharmacy.prescription.verified",
            payload={"prescription_id": str(prescription.id)},
        )
        return Response(PrescriptionSerializer(prescription).data)

    @action(detail=True, methods=["get"], url_path="medication-history")
    def medication_history(self, request, pk=None):
        """Patient's full medication history."""
        prescription = self.get_object()
        history = MedicationHistory.objects.filter(
            tenant_id=prescription.tenant_id, patient_id=prescription.patient_id
        ).order_by("-start_date")
        return Response(MedicationHistorySerializer(history, many=True).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        """Cancel prescription."""
        prescription = self.get_object()
        reason = request.data.get("reason", "")
        prescription.status = PrescriptionStatus.CANCELLED
        prescription.save(update_fields=["status", "updated_at"])
        return Response({"status": "cancelled", "reason": reason})


class PrescriptionItemViewSet(PharmacyModelViewSet):
    queryset = PrescriptionItem.objects.select_related("prescription")
    serializer_class = PrescriptionItemSerializer
    required_feature = "pharmacy.prescriptions"
    filterset_fields = ["prescription", "is_active", "dispense_as_written"]

    def perform_create(self, serializer):
        super().perform_create(serializer)
        item = serializer.instance
        from products.cymed.rcm.charge_capture.services import capture_and_invoice

        capture_and_invoice(
            tenant_id=item.tenant_id,
            patient_id=item.prescription.patient_id,
            encounter_id=item.prescription.encounter_id,
            facility_id=None,
            service_source="pharmacy",
            charge_category="medication",
            service_code=item.drug_code,
            service_description=item.drug_name,
            quantity=item.quantity,
            source_order_id=item.prescription_id,
            source_module="Prescription",
            rendering_provider_id=item.prescription.prescriber_id,
        )


class MedicationOrderViewSet(PharmacyModelViewSet):
    queryset = MedicationOrder.objects.prefetch_related("status_history").select_related()
    serializer_class = MedicationOrderSerializer
    required_feature = "pharmacy.hospital"
    filterset_fields = ["order_type", "status", "priority", "is_controlled"]
    search_fields = ["order_number", "drug_name", "drug_code"]

    def perform_create(self, serializer):
        tenant_id = getattr(self.request, "tenant_id", None)
        order_number = f"MO-{str(uuid.uuid4()).upper()[:12]}"
        order = serializer.save(tenant_id=tenant_id, order_number=order_number)
        self._run_dosing_check(order, tenant_id)

    def _run_dosing_check(self, order: MedicationOrder, tenant_id):
        from products.cymed.pharmacy.drug_interactions.services import DosingCheckService

        patient_weight_kg = None
        try:
            from products.cymed.core.clinical.models import Observation

            weight_obs = (
                Observation.objects.filter(
                    tenant_id=tenant_id, patient_id=order.patient_id, code="29463-7"
                )
                .order_by("-created_at")
                .first()
            )
            if weight_obs and weight_obs.value_quantity and weight_obs.unit == "kg":
                patient_weight_kg = weight_obs.value_quantity
        except Exception:
            patient_weight_kg = None

        DosingCheckService.check_dose(
            drug_code=order.drug_code,
            drug_name=order.drug_name,
            dose=order.dose,
            dose_unit=order.dose_unit,
            patient_id=order.patient_id,
            medication_order_id=order.id,
            patient_weight_kg=patient_weight_kg,
            tenant_id=tenant_id,
        )

    @action(detail=True, methods=["post"], url_path="verify")
    def verify(self, request, pk=None):
        """Pharmacist verification of medication order."""
        import django.utils.timezone as tz

        from .models import MedicationOrderStatus

        order = self.get_object()

        from products.cymed.pharmacy.drug_interactions.models import DoseRangeAlert

        open_critical_alerts = DoseRangeAlert.objects.filter(
            medication_order_id=order.id, severity="critical", status="open"
        )
        if open_critical_alerts.exists():
            return Response(
                {
                    "detail": "Cannot verify: unresolved critical dose-range alert(s) on this order.",
                    "alerts": [str(a.id) for a in open_critical_alerts],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        previous_status = order.status
        order.status = "verified"
        order.verified_by = request.user.id if hasattr(request, "user") else None
        order.verified_at = tz.now()
        order.save(update_fields=["status", "verified_by", "verified_at", "updated_at"])
        MedicationOrderStatus.objects.create(
            tenant_id=order.tenant_id,
            order=order,
            from_status=previous_status,
            to_status="verified",
            changed_by=order.verified_by,
        )
        OutboxEvent.objects.create(
            tenant_id=str(order.tenant_id) if order.tenant_id else None,
            topic="cymed.pharmacy.prescription.verified",
            event_type="cymed.pharmacy.prescription.verified",
            payload={"order_id": str(order.id), "order_number": order.order_number},
        )
        return Response(MedicationOrderSerializer(order).data)


class MedicationRenewalViewSet(PharmacyModelViewSet):
    queryset = MedicationRenewal.objects.select_related("prescription")
    serializer_class = MedicationRenewalSerializer
    required_feature = "pharmacy.prescriptions"
    filterset_fields = ["status"]


class MedicationRefillViewSet(PharmacyModelViewSet):
    queryset = MedicationRefill.objects.select_related("prescription")
    serializer_class = MedicationRefillSerializer
    required_feature = "pharmacy.prescriptions"
    filterset_fields = ["status", "pickup_method"]


class PrescriptionAttachmentViewSet(PharmacyModelViewSet):
    queryset = PrescriptionAttachment.objects.select_related("prescription")
    serializer_class = PrescriptionAttachmentSerializer
    required_feature = "pharmacy.prescriptions"
    filterset_fields = ["attachment_type"]


class MedicationHistoryViewSet(PharmacyModelViewSet):
    queryset = MedicationHistory.objects.all()
    serializer_class = MedicationHistorySerializer
    required_feature = "pharmacy.prescriptions"
    filterset_fields = ["patient_id", "is_active", "source"]
    search_fields = ["drug_name", "drug_code"]
