from products.cymed.clinic.triage.models import TriageAssessment, TriageRiskScore, TriageVitalSigns
from products.cymed.clinic.triage.serializers import (
    TriageAssessmentSerializer,
    TriageRiskScoreSerializer,
    TriageVitalSignsSerializer,
)
from products.cymed.clinic.views import ClinicModelViewSet

TRIAGE_CLINICAL_ROLES = {"physician", "nurse"}


class TriageAssessmentViewSet(ClinicModelViewSet):
    queryset = TriageAssessment.objects.all()
    serializer_class = TriageAssessmentSerializer
    action_required_roles = {
        "create": TRIAGE_CLINICAL_ROLES,
        "update": TRIAGE_CLINICAL_ROLES,
        "partial_update": TRIAGE_CLINICAL_ROLES,
    }


class TriageVitalSignsViewSet(ClinicModelViewSet):
    queryset = TriageVitalSigns.objects.all()
    serializer_class = TriageVitalSignsSerializer
    action_required_roles = {
        "create": TRIAGE_CLINICAL_ROLES,
        "update": TRIAGE_CLINICAL_ROLES,
        "partial_update": TRIAGE_CLINICAL_ROLES,
    }


class TriageRiskScoreViewSet(ClinicModelViewSet):
    queryset = TriageRiskScore.objects.all()
    serializer_class = TriageRiskScoreSerializer
    action_required_roles = {
        "create": TRIAGE_CLINICAL_ROLES,
        "update": TRIAGE_CLINICAL_ROLES,
        "partial_update": TRIAGE_CLINICAL_ROLES,
    }
