from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated


class ClinicModelViewSet(viewsets.ModelViewSet):
    """
    Base ViewSet for CyMed Clinic Edition.
    Edition- and feature-gate enforcement: subclasses declare
    `required_feature` (str) to activate per-endpoint feature checks.
    All feature evaluation delegates to FeatureFlagService — no
    hardcoded logic in application code.

    Role gating: subclasses declare `action_required_roles` (dict mapping
    action name -> set of acceptable realm roles) to restrict specific
    actions to specific clinical roles, mirroring
    products.cymed.hospital.views.HospitalModelViewSet. Previously every
    Clinic endpoint only required IsAuthenticated -- any authenticated user
    of any role could book/cancel appointments, post consultation notes, or
    post billing charges for their tenant.

    PHI auditing: mutating actions (create/update/destroy) and reads
    (retrieve/list) on PHI-classified models are written to the platform's
    tamper-evident audit trail (see audit.py). Scoped to models where
    `data_classification == "phi"` -- unlike Hospital's base class, which
    audits every viewset indiscriminately including pure reference-data
    endpoints (admission types, discharge reasons, etc).
    """

    permission_classes = [IsAuthenticated]
    required_feature: str = ""
    action_required_roles: dict = {}

    def get_queryset(self):
        tenant_id = getattr(self.request, "tenant_id", None)
        if tenant_id:
            return self.queryset.filter(tenant_id=tenant_id)
        return self.queryset.none()

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if self.required_feature:
            self._check_feature(request, self.required_feature)
        required_roles = self.action_required_roles.get(self.action)
        if required_roles:
            self._check_roles(request, required_roles)

    def _check_feature(self, request, feature_code: str) -> None:
        from products.cymed.commercial.feature_flags.services import FeatureFlagService

        tenant_id = getattr(request, "tenant_id", None)
        if not FeatureFlagService.is_enabled(
            feature_code, tenant_id=str(tenant_id) if tenant_id else None
        ):
            raise PermissionDenied(
                detail=f"Feature '{feature_code}' is not enabled for your edition."
            )

    def _check_roles(self, request, required_roles: set) -> None:
        claims = getattr(request, "auth_claims", {}) or {}
        user_roles = set(claims.get("realm_access", {}).get("roles", []))
        if "platform_admin" in user_roles:
            return
        if not (user_roles & required_roles):
            raise PermissionDenied(
                detail=(
                    f"This action requires one of the following roles: "
                    f"{', '.join(sorted(required_roles))}."
                )
            )

    def _is_phi(self) -> bool:
        return getattr(self.queryset.model, "data_classification", "internal") == "phi"

    def _actor_user_id(self) -> str:
        claims = getattr(self.request, "auth_claims", {}) or {}
        return claims.get("sub", "")

    def _audit(self, action_verb: str, resource_id: str, outcome_description: str = "") -> None:
        if not self._is_phi():
            return
        tenant_id = getattr(self.request, "tenant_id", None)
        actor_user_id = self._actor_user_id()
        if not tenant_id or not actor_user_id:
            return
        from products.cymed.clinic.audit import write_audit

        model_name = self.queryset.model.__name__
        verb_past = {"CREATE": "created", "UPDATE": "updated", "DELETE": "deleted"}.get(
            action_verb, action_verb.lower()
        )
        write_audit(
            tenant_id,
            f"{model_name.lower()}.{verb_past}",
            model_name,
            resource_id,
            actor_user_id,
            action_verb=action_verb,
            outcome_description=outcome_description,
        )

    def perform_create(self, serializer):
        tenant_id = getattr(self.request, "tenant_id", None)
        serializer.save(tenant_id=tenant_id)
        self._audit("CREATE", str(serializer.instance.id))

    def perform_update(self, serializer):
        serializer.save()
        self._audit("UPDATE", str(serializer.instance.id))

    def perform_destroy(self, instance):
        resource_id = str(instance.id)
        instance.delete()
        self._audit("DELETE", resource_id)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        if response.status_code == 200:
            self._audit("READ", str(kwargs.get("pk", "")), outcome_description="viewed")
        return response

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if response.status_code == 200:
            count = response.data.get("count") if isinstance(response.data, dict) else None
            self._audit(
                "READ", "bulk",
                outcome_description=f"list, count={count}" if count is not None else "list",
            )
        return response
