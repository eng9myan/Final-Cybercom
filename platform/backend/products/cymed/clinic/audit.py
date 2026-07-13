"""
CyMed Clinic Edition -- audit trail helper.

Mirrors products.cymed.hospital.services._write_audit -- writes to the
platform's real, tamper-evident audit trail (platform.audit.services.AuditService,
hash-chained per tenant, ADR-0028), not the broken AuditService.log(...) call.
Clinic has no dedicated services.py layer (business logic lives inline in
serializers/views), so this lives standalone and is called from
ClinicModelViewSet (see views.py) rather than per-service like Hospital.
"""

from __future__ import annotations

import logging
import uuid

logger = logging.getLogger(__name__)


def write_audit(
    tenant_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    actor_user_id: str,
    action_verb: str = "CREATE",
    outcome_description: str = "",
    data_classification: str = "phi",
) -> None:
    try:
        from platform.audit.services import AuditService

        AuditService().record(
            action=action,
            action_verb=action_verb,
            resource_type=resource_type,
            resource_id=str(resource_id),
            tenant_id=uuid.UUID(str(tenant_id)),
            actor_user_id=str(actor_user_id),
            category="clinical",
            data_classification=data_classification,
            outcome_description=outcome_description,
        )
    except Exception as exc:
        logger.error(f"Failed to write audit record for {action} on {resource_type}: {exc}")
