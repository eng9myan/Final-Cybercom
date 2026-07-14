"""
Data migration: seeds FeatureFlag rows for Laboratory, Imaging, and Pharmacy.

0002_seed_flags only ever covered Clinic and Hospital (plus a handful of
platform/cyai flags). Lab/Imaging/Pharmacy views.py files reference 31
distinct required_feature codes across the three products, but not one of
them was ever seeded -- FeatureFlagService.is_enabled() does a bare
FeatureFlag.objects.get(code=...) with no fallback, so a missing row means
False unconditionally. Every Lab/Imaging/Pharmacy endpoint gated by
required_feature has been permanently inaccessible, for every tenant, since
each of those apps' views.py files were written -- not a tenant-provisioning
gap, a missing catalog entry.

Core day-to-day operational codes are seeded default_enabled=True (mirrors
Clinic/Hospital's "Starter" tier in 0002); reporting/automation/premium-tier
codes are seeded False, same tiering convention as hospital.icu etc there.
"""

import uuid

from django.db import migrations

PLATFORM_TENANT = uuid.UUID("00000000-0000-0000-0000-000000000001")

FLAGS = [
    # Laboratory — core
    {"code": "lab.orders", "name": "Lab Orders", "module": "lab.orders", "default": True},
    {"code": "lab.specimens", "name": "Specimen Tracking", "module": "lab.specimens", "default": True},
    {"code": "lab.worklists", "name": "Worklists", "module": "lab.worklists", "default": True},
    {"code": "lab.results", "name": "Results", "module": "lab.results", "default": True},
    {"code": "lab.accessioning", "name": "Accessioning", "module": "lab.accessioning", "default": True},
    # Laboratory — advanced
    {"code": "lab.microbiology", "name": "Microbiology", "module": "lab.microbiology", "default": False},
    {"code": "lab.histopathology", "name": "Histopathology", "module": "lab.histopathology", "default": False},
    {"code": "lab.pathology", "name": "Pathology", "module": "lab.pathology", "default": False},
    {"code": "lab.reference_lab", "name": "Reference Lab Routing", "module": "lab.reference_lab", "default": False},
    {"code": "lab.quality", "name": "Quality Management", "module": "lab.quality", "default": False},
    {"code": "lab.analytics", "name": "Lab Analytics", "module": "lab.analytics", "default": False},
    # Imaging — core
    {"code": "imaging.orders", "name": "Imaging Orders", "module": "imaging.orders", "default": True},
    {"code": "imaging.worklist", "name": "Modality Worklist", "module": "imaging.worklist", "default": True},
    {"code": "imaging.dicom", "name": "DICOM", "module": "imaging.dicom", "default": True},
    {"code": "imaging.results", "name": "Imaging Results", "module": "imaging.results", "default": True},
    {"code": "imaging.reporting", "name": "Structured Reporting", "module": "imaging.reporting", "default": True},
    {"code": "imaging.scheduling", "name": "Imaging Scheduling", "module": "imaging.scheduling", "default": True},
    # Imaging — advanced
    {"code": "imaging.pacs", "name": "PACS", "module": "imaging.pacs", "default": False},
    {"code": "imaging.quality", "name": "Imaging Quality Management", "module": "imaging.quality", "default": False},
    {"code": "imaging.teleradiology", "name": "Teleradiology", "module": "imaging.teleradiology", "default": False},
    {"code": "imaging.second_opinion", "name": "Second Opinion", "module": "imaging.second_opinion", "default": False},
    {"code": "imaging.analytics", "name": "Imaging Analytics", "module": "imaging.analytics", "default": False},
    # Pharmacy — core
    {"code": "pharmacy.prescriptions", "name": "Prescriptions", "module": "pharmacy.prescriptions", "default": True},
    {"code": "pharmacy.dispensing", "name": "Dispensing", "module": "pharmacy.dispensing", "default": True},
    {"code": "pharmacy.formulary", "name": "Formulary", "module": "pharmacy.formulary", "default": True},
    {"code": "pharmacy.interactions", "name": "Drug Interaction Checking", "module": "pharmacy.interactions", "default": True},
    {"code": "pharmacy.inventory", "name": "Pharmacy Inventory", "module": "pharmacy.inventory", "default": True},
    {"code": "pharmacy.hospital", "name": "Inpatient Medication Orders", "module": "pharmacy.hospital", "default": True},
    # Pharmacy — advanced
    {"code": "pharmacy.clinical", "name": "Clinical Pharmacy", "module": "pharmacy.clinical", "default": False},
    {"code": "pharmacy.reconciliation", "name": "Medication Reconciliation", "module": "pharmacy.reconciliation", "default": False},
    {"code": "pharmacy.procurement", "name": "Pharmacy Procurement", "module": "pharmacy.procurement", "default": False},
    {"code": "pharmacy.automation", "name": "Pharmacy Automation", "module": "pharmacy.automation", "default": False},
    {"code": "pharmacy.analytics", "name": "Pharmacy Analytics", "module": "pharmacy.analytics", "default": False},
]


def seed_flags(apps, schema_editor):
    FeatureFlag = apps.get_model("commercial_feature_flags", "FeatureFlag")
    for f in FLAGS:
        FeatureFlag.objects.get_or_create(
            code=f["code"],
            defaults={
                "id": uuid.uuid4(),
                "tenant_id": PLATFORM_TENANT,
                "name": f["name"],
                "scope": "edition",
                "module_code": f["module"],
                "default_enabled": f["default"],
            },
        )


def unseed_flags(apps, schema_editor):
    FeatureFlag = apps.get_model("commercial_feature_flags", "FeatureFlag")
    FeatureFlag.objects.filter(code__in=[f["code"] for f in FLAGS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("commercial_feature_flags", "0003_seed_blood_bank_flag"),
    ]

    operations = [
        migrations.RunPython(seed_flags, unseed_flags),
    ]
