from products.cymed.clinic.referrals.models import (
    Referral,
    ReferralAttachment,
    ReferralProvider,
    ReferralReason,
)
from products.cymed.clinic.referrals.serializers import (
    ReferralAttachmentSerializer,
    ReferralProviderSerializer,
    ReferralReasonSerializer,
    ReferralSerializer,
)
from products.cymed.clinic.views import ClinicModelViewSet


class ReferralViewSet(ClinicModelViewSet):
    queryset = Referral.objects.all()
    serializer_class = ReferralSerializer
    action_required_roles = {
        "create": {"physician"},
        "update": {"physician"},
        "partial_update": {"physician"},
    }


class ReferralReasonViewSet(ClinicModelViewSet):
    queryset = ReferralReason.objects.all()
    serializer_class = ReferralReasonSerializer


class ReferralProviderViewSet(ClinicModelViewSet):
    queryset = ReferralProvider.objects.all()
    serializer_class = ReferralProviderSerializer


class ReferralAttachmentViewSet(ClinicModelViewSet):
    queryset = ReferralAttachment.objects.all()
    serializer_class = ReferralAttachmentSerializer
