from products.cymed.imaging.views import ImagingModelViewSet

from .models import (
    ImagingOrder,
    ImagingOrderItem,
    ImagingOrderStatusHistory,
    ImagingProcedure,
    ImagingProtocol,
)
from .serializers import (
    ImagingOrderItemSerializer,
    ImagingOrderSerializer,
    ImagingOrderStatusHistorySerializer,
    ImagingProcedureSerializer,
    ImagingProtocolSerializer,
)


class ImagingProtocolViewSet(ImagingModelViewSet):
    queryset = ImagingProtocol.objects.all()
    serializer_class = ImagingProtocolSerializer
    required_feature = "imaging.orders"


class ImagingProcedureViewSet(ImagingModelViewSet):
    queryset = ImagingProcedure.objects.all()
    serializer_class = ImagingProcedureSerializer
    required_feature = "imaging.orders"


class ImagingOrderViewSet(ImagingModelViewSet):
    queryset = ImagingOrder.objects.select_related().prefetch_related("items", "status_history")
    serializer_class = ImagingOrderSerializer
    required_feature = "imaging.orders"


class ImagingOrderItemViewSet(ImagingModelViewSet):
    queryset = ImagingOrderItem.objects.select_related("order", "procedure")
    serializer_class = ImagingOrderItemSerializer
    required_feature = "imaging.orders"

    def perform_create(self, serializer):
        super().perform_create(serializer)
        item = serializer.instance
        from products.cymed.rcm.charge_capture.services import capture_and_invoice

        capture_and_invoice(
            tenant_id=item.tenant_id,
            patient_id=item.order.patient_id,
            encounter_id=item.order.encounter_id,
            facility_id=None,
            service_source="imaging",
            charge_category="imaging",
            service_code=item.procedure.code,
            service_description=item.procedure.name,
            source_order_id=item.order_id,
            source_module="ImagingOrder",
            rendering_provider_id=item.order.ordered_by,
        )


class ImagingOrderStatusHistoryViewSet(ImagingModelViewSet):
    queryset = ImagingOrderStatusHistory.objects.select_related("order")
    serializer_class = ImagingOrderStatusHistorySerializer
    required_feature = "imaging.orders"
    http_method_names = ["get", "head", "options"]
