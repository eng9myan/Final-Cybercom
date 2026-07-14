class PortalAccountMiddleware:
    """
    Resolves request.account_id for Patient Portal endpoints (payments, wallet,
    insurance, messaging, notifications -- see patient_portal/*/views.py, all of
    which filter get_queryset() by request.account_id). Nothing set this
    attribute anywhere in the codebase, so every one of those endpoints raised
    AttributeError on every call. Scoped to /api/v1/patient-portal/ to avoid a
    lookup on every request elsewhere.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/api/v1/patient-portal/"):
            request.account_id = None
            claims = getattr(request, "auth_claims", None) or {}
            sub = claims.get("sub")
            tenant_id = getattr(request, "tenant_id", None)
            if sub and tenant_id:
                from products.cymed.patient_portal.accounts.models import PatientPortalAccount

                account = PatientPortalAccount.objects.filter(
                    tenant_id=tenant_id, cyidentity_user_id=sub
                ).only("id").first()
                if account:
                    request.account_id = account.id
        return self.get_response(request)
