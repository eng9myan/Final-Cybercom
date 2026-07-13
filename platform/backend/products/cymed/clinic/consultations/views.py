from products.cymed.clinic.consultations.models import (
    Consultation,
    ConsultationAttachment,
    ConsultationDiagnosis,
    ConsultationFollowUp,
    ConsultationPlan,
    ConsultationProcedure,
)
from products.cymed.clinic.consultations.serializers import (
    ConsultationAttachmentSerializer,
    ConsultationDiagnosisSerializer,
    ConsultationFollowUpSerializer,
    ConsultationPlanSerializer,
    ConsultationProcedureSerializer,
    ConsultationSerializer,
)
from products.cymed.clinic.views import ClinicModelViewSet

PHYSICIAN_ONLY = {"physician"}


class ConsultationViewSet(ClinicModelViewSet):
    queryset = Consultation.objects.all()
    serializer_class = ConsultationSerializer
    action_required_roles = {
        "create": PHYSICIAN_ONLY,
        "update": PHYSICIAN_ONLY,
        "partial_update": PHYSICIAN_ONLY,
    }


class ConsultationDiagnosisViewSet(ClinicModelViewSet):
    queryset = ConsultationDiagnosis.objects.all()
    serializer_class = ConsultationDiagnosisSerializer
    action_required_roles = {
        "create": PHYSICIAN_ONLY,
        "update": PHYSICIAN_ONLY,
        "partial_update": PHYSICIAN_ONLY,
    }


class ConsultationProcedureViewSet(ClinicModelViewSet):
    queryset = ConsultationProcedure.objects.all()
    serializer_class = ConsultationProcedureSerializer
    action_required_roles = {
        "create": PHYSICIAN_ONLY,
        "update": PHYSICIAN_ONLY,
        "partial_update": PHYSICIAN_ONLY,
    }


class ConsultationPlanViewSet(ClinicModelViewSet):
    queryset = ConsultationPlan.objects.all()
    serializer_class = ConsultationPlanSerializer
    action_required_roles = {
        "create": PHYSICIAN_ONLY,
        "update": PHYSICIAN_ONLY,
        "partial_update": PHYSICIAN_ONLY,
    }


class ConsultationFollowUpViewSet(ClinicModelViewSet):
    queryset = ConsultationFollowUp.objects.all()
    serializer_class = ConsultationFollowUpSerializer
    action_required_roles = {
        "create": PHYSICIAN_ONLY,
        "update": PHYSICIAN_ONLY,
        "partial_update": PHYSICIAN_ONLY,
    }


class ConsultationAttachmentViewSet(ClinicModelViewSet):
    queryset = ConsultationAttachment.objects.all()
    serializer_class = ConsultationAttachmentSerializer
