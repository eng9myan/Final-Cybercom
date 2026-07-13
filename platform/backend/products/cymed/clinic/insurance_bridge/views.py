from products.cymed.clinic.insurance_bridge.models import (
    AuthorizationRequest,
    AuthorizationResponse,
    EligibilityCheck,
    InsurancePlan,
    Payer,
)
from products.cymed.clinic.insurance_bridge.serializers import (
    AuthorizationRequestSerializer,
    AuthorizationResponseSerializer,
    EligibilityCheckSerializer,
    InsurancePlanSerializer,
    PayerSerializer,
)
from products.cymed.clinic.views import ClinicModelViewSet

INSURANCE_STAFF_ROLES = {"physician", "nurse", "receptionist"}


class PayerViewSet(ClinicModelViewSet):
    queryset = Payer.objects.all()
    serializer_class = PayerSerializer


class InsurancePlanViewSet(ClinicModelViewSet):
    queryset = InsurancePlan.objects.all()
    serializer_class = InsurancePlanSerializer


class EligibilityCheckViewSet(ClinicModelViewSet):
    queryset = EligibilityCheck.objects.all()
    serializer_class = EligibilityCheckSerializer
    action_required_roles = {"create": INSURANCE_STAFF_ROLES}


class AuthorizationRequestViewSet(ClinicModelViewSet):
    queryset = AuthorizationRequest.objects.all()
    serializer_class = AuthorizationRequestSerializer
    action_required_roles = {
        "create": INSURANCE_STAFF_ROLES,
        "update": INSURANCE_STAFF_ROLES,
        "partial_update": INSURANCE_STAFF_ROLES,
    }


class AuthorizationResponseViewSet(ClinicModelViewSet):
    queryset = AuthorizationResponse.objects.all()
    serializer_class = AuthorizationResponseSerializer
    action_required_roles = {
        "create": INSURANCE_STAFF_ROLES,
        "update": INSURANCE_STAFF_ROLES,
        "partial_update": INSURANCE_STAFF_ROLES,
    }
