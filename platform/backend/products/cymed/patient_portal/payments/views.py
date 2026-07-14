import uuid
from decimal import Decimal, InvalidOperation

from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import InstallmentPlan, PatientInvoice, PaymentMethod, PaymentTransaction
from .serializers import (
    InstallmentPlanSerializer,
    PatientInvoiceSerializer,
    PaymentMethodSerializer,
    PaymentTransactionSerializer,
)


class PatientInvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = PatientInvoiceSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "invoice_type", "currency"]
    ordering_fields = ["created_at", "due_date", "amount_total", "service_date"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return PatientInvoice.objects.filter(
            tenant_id=self.request.tenant_id,
            account_id=self.request.account_id,
        )

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        """
        Records a real payment against this invoice: creates a real
        PaymentTransaction row and updates the invoice's amount_paid/status
        accordingly. This is an internal payment ledger, not a live card/
        gateway integration -- payment_method is a record of how the patient
        says they paid (cash at front desk, bank transfer, etc.), not a
        charge run through Stripe/Moyasar/etc. No external gateway is wired
        here; `payment_gateway` is recorded as "internal_ledger" so nothing
        downstream mistakes this for a real processor confirmation.
        """
        invoice = self.get_object()
        if invoice.status in ("paid", "cancelled", "refunded"):
            raise ValidationError({"detail": f"Invoice is already {invoice.status}; cannot pay."})

        try:
            amount = Decimal(str(request.data.get("amount", invoice.amount_patient_due - invoice.amount_paid)))
        except InvalidOperation:
            raise ValidationError({"amount": "Must be a valid decimal amount."})
        if amount <= 0:
            raise ValidationError({"amount": "Must be greater than zero."})

        remaining = invoice.amount_patient_due - invoice.amount_paid
        if amount > remaining:
            raise ValidationError({"amount": f"Exceeds remaining balance due ({remaining})."})

        payment_method = request.data.get("payment_method", "cash")
        valid_methods = {c for c, _ in PaymentTransaction.PAYMENT_METHOD_CHOICES}
        if payment_method not in valid_methods:
            raise ValidationError({"payment_method": f"Must be one of {sorted(valid_methods)}."})

        transaction = PaymentTransaction.objects.create(
            tenant_id=invoice.tenant_id,
            account_id=invoice.account_id,
            patient_id=invoice.patient_id,
            invoice=invoice,
            transaction_reference=f"PMT-{uuid.uuid4().hex[:10].upper()}",
            payment_method=payment_method,
            payment_gateway="internal_ledger",
            amount=amount,
            currency=invoice.currency,
            status="completed",
            paid_at=timezone.now(),
        )

        invoice.amount_paid = invoice.amount_paid + amount
        invoice.status = "paid" if invoice.amount_paid >= invoice.amount_patient_due else "partially_paid"
        invoice.save(update_fields=["amount_paid", "status", "updated_at"])

        return Response(
            {
                "invoice": PatientInvoiceSerializer(invoice).data,
                "transaction": PaymentTransactionSerializer(transaction).data,
            },
            status=status.HTTP_200_OK,
        )


class PaymentTransactionViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "payment_method", "currency"]
    ordering_fields = ["created_at", "paid_at", "amount"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return PaymentTransaction.objects.filter(
            tenant_id=self.request.tenant_id,
            account_id=self.request.account_id,
        )


class PaymentMethodViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentMethodSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["method_type", "is_active", "is_default"]
    ordering_fields = ["created_at"]
    ordering = ["-is_default", "-created_at"]

    def get_queryset(self):
        return PaymentMethod.objects.filter(
            tenant_id=self.request.tenant_id,
            account_id=self.request.account_id,
        )


class InstallmentPlanViewSet(viewsets.ModelViewSet):
    serializer_class = InstallmentPlanSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "frequency"]
    ordering_fields = ["created_at", "first_payment_date", "next_payment_date"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return InstallmentPlan.objects.filter(
            tenant_id=self.request.tenant_id,
            account_id=self.request.account_id,
        )
