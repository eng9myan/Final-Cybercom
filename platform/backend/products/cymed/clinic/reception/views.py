from products.cymed.clinic.reception.models import (
    ArrivalMethod,
    CheckIn,
    CheckOut,
    PatientQueueTicket,
    VisitReason,
    VisitStatus,
)
from products.cymed.clinic.reception.serializers import (
    ArrivalMethodSerializer,
    CheckInSerializer,
    CheckOutSerializer,
    PatientQueueTicketSerializer,
    VisitReasonSerializer,
    VisitStatusSerializer,
)
from products.cymed.clinic.views import ClinicModelViewSet

RECEPTION_STAFF_ROLES = {"physician", "nurse", "receptionist"}


class ArrivalMethodViewSet(ClinicModelViewSet):
    queryset = ArrivalMethod.objects.all()
    serializer_class = ArrivalMethodSerializer


class VisitReasonViewSet(ClinicModelViewSet):
    queryset = VisitReason.objects.all()
    serializer_class = VisitReasonSerializer


class VisitStatusViewSet(ClinicModelViewSet):
    queryset = VisitStatus.objects.all()
    serializer_class = VisitStatusSerializer


class CheckInViewSet(ClinicModelViewSet):
    queryset = CheckIn.objects.all()
    serializer_class = CheckInSerializer
    action_required_roles = {
        "create": RECEPTION_STAFF_ROLES,
        "update": RECEPTION_STAFF_ROLES,
        "partial_update": RECEPTION_STAFF_ROLES,
    }


class CheckOutViewSet(ClinicModelViewSet):
    queryset = CheckOut.objects.all()
    serializer_class = CheckOutSerializer
    action_required_roles = {
        "create": RECEPTION_STAFF_ROLES,
        "update": RECEPTION_STAFF_ROLES,
        "partial_update": RECEPTION_STAFF_ROLES,
    }


class PatientQueueTicketViewSet(ClinicModelViewSet):
    queryset = PatientQueueTicket.objects.all()
    serializer_class = PatientQueueTicketSerializer
    action_required_roles = {
        "create": RECEPTION_STAFF_ROLES,
        "update": RECEPTION_STAFF_ROLES,
        "partial_update": RECEPTION_STAFF_ROLES,
    }
