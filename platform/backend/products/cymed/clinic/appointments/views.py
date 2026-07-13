from products.cymed.clinic.appointments.models import (
    AppointmentReminder,
    AppointmentRule,
    AppointmentTemplate,
    AppointmentWaitlist,
    ClinicAppointment,
)
from products.cymed.clinic.appointments.serializers import (
    AppointmentReminderSerializer,
    AppointmentRuleSerializer,
    AppointmentTemplateSerializer,
    AppointmentWaitlistSerializer,
    ClinicAppointmentSerializer,
)
from products.cymed.clinic.views import ClinicModelViewSet

CLINIC_STAFF_ROLES = {"physician", "nurse", "receptionist"}


class ClinicAppointmentViewSet(ClinicModelViewSet):
    queryset = ClinicAppointment.objects.all()
    serializer_class = ClinicAppointmentSerializer
    action_required_roles = {
        "create": CLINIC_STAFF_ROLES,
        "update": CLINIC_STAFF_ROLES,
        "partial_update": CLINIC_STAFF_ROLES,
        "destroy": CLINIC_STAFF_ROLES,
    }


class AppointmentReminderViewSet(ClinicModelViewSet):
    queryset = AppointmentReminder.objects.all()
    serializer_class = AppointmentReminderSerializer


class AppointmentWaitlistViewSet(ClinicModelViewSet):
    queryset = AppointmentWaitlist.objects.all().order_by("-priority")
    serializer_class = AppointmentWaitlistSerializer


class AppointmentTemplateViewSet(ClinicModelViewSet):
    queryset = AppointmentTemplate.objects.all()
    serializer_class = AppointmentTemplateSerializer


class AppointmentRuleViewSet(ClinicModelViewSet):
    queryset = AppointmentRule.objects.all()
    serializer_class = AppointmentRuleSerializer
