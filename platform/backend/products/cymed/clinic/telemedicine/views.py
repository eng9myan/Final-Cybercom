from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from platform.events.models import OutboxEvent
from products.cymed.clinic.telemedicine.models import (
    VirtualConsent,
    VirtualRecording,
    VirtualSession,
    VirtualVisit,
)
from products.cymed.clinic.telemedicine.serializers import (
    VirtualConsentSerializer,
    VirtualRecordingSerializer,
    VirtualSessionSerializer,
    VirtualVisitSerializer,
)
from products.cymed.clinic.views import ClinicModelViewSet


class VirtualVisitViewSet(ClinicModelViewSet):
    queryset = VirtualVisit.objects.all()
    serializer_class = VirtualVisitSerializer

    @action(detail=True, methods=["post"])
    def start_session(self, request, pk=None):
        visit = self.get_object()
        tenant_id = getattr(request, "tenant_id", None)

        if not tenant_id:
            return Response(
                {"detail": "Tenant context required"}, status=status.HTTP_400_BAD_REQUEST
            )

        visit.status = "in_progress"
        visit.save()

        session = visit.session
        session.started_at = timezone.now()
        session.save()

        # Publish Event
        OutboxEvent.objects.create(
            tenant_id=tenant_id,
            topic="cymed.clinic.events",
            event_type="cymed.clinic.telemedicine.started",
            payload={
                "visit_id": str(visit.id),
                "patient_id": str(visit.patient.id),
                "provider_id": str(visit.provider_id),
                "started_at": session.started_at.isoformat(),
            },
        )

        self._audit("UPDATE", str(visit.id), outcome_description="telemedicine session started")

        return Response(self.get_serializer(visit).data, status=status.HTTP_200_OK)


class VirtualSessionViewSet(ClinicModelViewSet):
    queryset = VirtualSession.objects.all()
    serializer_class = VirtualSessionSerializer


class VirtualRecordingViewSet(ClinicModelViewSet):
    queryset = VirtualRecording.objects.all()
    serializer_class = VirtualRecordingSerializer


class VirtualConsentViewSet(ClinicModelViewSet):
    queryset = VirtualConsent.objects.all()
    serializer_class = VirtualConsentSerializer
