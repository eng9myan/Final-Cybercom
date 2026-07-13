from products.cymed.clinic.billing_bridge.models import (
    ChargeCode,
    ChargeItem,
    ClinicService,
    PriceList,
)
from products.cymed.clinic.billing_bridge.serializers import (
    ChargeCodeSerializer,
    ChargeItemSerializer,
    ClinicServiceSerializer,
    PriceListSerializer,
)
from products.cymed.clinic.views import ClinicModelViewSet

BILLING_STAFF_ROLES = {"physician", "nurse", "receptionist"}


class ChargeCodeViewSet(ClinicModelViewSet):
    queryset = ChargeCode.objects.all()
    serializer_class = ChargeCodeSerializer


class PriceListViewSet(ClinicModelViewSet):
    queryset = PriceList.objects.all()
    serializer_class = PriceListSerializer


class ClinicServiceViewSet(ClinicModelViewSet):
    queryset = ClinicService.objects.all()
    serializer_class = ClinicServiceSerializer


class ChargeItemViewSet(ClinicModelViewSet):
    queryset = ChargeItem.objects.all()
    serializer_class = ChargeItemSerializer
    action_required_roles = {
        "create": BILLING_STAFF_ROLES,
        "update": BILLING_STAFF_ROLES,
        "partial_update": BILLING_STAFF_ROLES,
        "destroy": BILLING_STAFF_ROLES,
    }
