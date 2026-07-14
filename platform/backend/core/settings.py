"""
CyberCom Platform — Django Settings
ADR-0001, ADR-0002, ADR-0009, ADR-0034 compliant.
"""

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent

# ---------------------------------------------------------------------------
# SECURITY
# ---------------------------------------------------------------------------
SECRET_KEY = (
    os.environ["DJANGO_SECRET_KEY"]
    if not os.environ.get("DJANGO_DEBUG", "False") == "True"
    else os.environ.get("DJANGO_SECRET_KEY", "dev-unsafe-secret-key-do-not-use-in-prod")
)

DEBUG = os.environ.get("DJANGO_DEBUG", "False") == "True"

ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = 0 if DEBUG else 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
# HIPAA Security Rule 164.312(e)(1) -- enforce TLS for all traffic in production.
# Gated on DEBUG (not a separate env var) so local/dev HTTP keeps working without
# extra config, matching the pattern already used for the other SECURE_* settings.
SECURE_SSL_REDIRECT = not DEBUG
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if not DEBUG else None

# ---------------------------------------------------------------------------
# APPLICATIONS
# ---------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
    "django_filters",
]

PLATFORM_APPS = [
    "platform.common",
    "platform.tenant",
    "platform.audit",
    "platform.cyidentity",
    "platform.api",
    "platform.events",
    "platform.notifications",
    "platform.cyintegrationhub",
    "platform.cydata",
    "platform.cyai",
    "platform.terminology",
]

PRODUCT_APPS = [
    # CyCom ERP Foundation
    "products.cycom.crm.accounts",
    "products.cycom.finance.gl",
    "products.cycom.finance.ap",
    "products.cycom.finance.ar",
    "products.cycom.procurement.purchase_orders",
    "products.cycom.procurement.vendors",
    "products.cycom.procurement.requisitions",
    "products.cycom.procurement.invoices",
    "products.cycom.hr",
    "products.cycom.payroll",
    "products.cycom.inventory",
    "products.cycom.assets",
    "products.cycom.bi",
    "products.cymed.core.patients",
    "products.cymed.core.providers",
    "products.cymed.core.organizations",
    "products.cymed.core.facilities",
    "products.cymed.core.encounters",
    "products.cymed.core.clinical",
    "products.cymed.core.documents",
    "products.cymed.core.careplans",
    "products.cymed.core.orders",
    "products.cymed.core.scheduling",
    "products.cymed.core.consents",
    "products.cymed.core.registries",
    # CyMed Commercial Foundation (Program 3.C0)
    "products.cymed.commercial.licensing",
    "products.cymed.commercial.editions",
    "products.cymed.commercial.feature_flags",
    "products.cymed.commercial.subscriptions",
    "products.cymed.commercial.branding",
    "products.cymed.commercial.deployment_profiles",
    "products.cymed.commercial.product_catalog",
    "products.cymed.commercial.usage_metering",
    "products.cymed.commercial.customer_management",
    "products.cymed.commercial.partner_management",
    "products.cymed.commercial.compliance_settings",
    # CyMed Clinic Edition (Program 3.1)
    "products.cymed.clinic.reception",
    "products.cymed.clinic.appointments",
    "products.cymed.clinic.consultations",
    "products.cymed.clinic.triage",
    "products.cymed.clinic.telemedicine",
    "products.cymed.clinic.referrals",
    "products.cymed.clinic.queues",
    "products.cymed.clinic.specialties",
    "products.cymed.clinic.clinical_forms",
    "products.cymed.clinic.billing_bridge",
    "products.cymed.clinic.insurance_bridge",
    # CyMed Hospital Edition (Program 3.2)
    "products.cymed.hospital.adt",
    "products.cymed.hospital.bed_management",
    "products.cymed.hospital.emergency",
    "products.cymed.hospital.inpatient",
    "products.cymed.hospital.nursing",
    "products.cymed.hospital.icu",
    "products.cymed.hospital.operating_room",
    "products.cymed.hospital.anesthesia",
    "products.cymed.hospital.maternity",
    "products.cymed.hospital.transfer_center",
    "products.cymed.hospital.discharge",
    "products.cymed.hospital.clinical_command_center",
    "products.cymed.hospital.capacity_management",
    "products.cymed.hospital.cssd",
    "products.cymed.hospital.blood_bank",
    "products.cymed.hospital.housekeeping",
    "products.cymed.hospital.incident_reporting",
    "products.cymed.hospital.infection_control",
    "products.cymed.hospital.quality_management",
    "products.cymed.hospital.research",
    "products.cymed.hospital.rehabilitation",
    "products.cymed.hospital.dialysis",
    "products.cymed.hospital.dietary",
    "products.cymed.hospital.mortuary",
    "products.cymed.hospital.linen_services",
    "products.cymed.hospital.waste_management",
    # CyMed Laboratory Edition (Program 3.3)
    "products.cymed.laboratory.orders",
    "products.cymed.laboratory.specimens",
    "products.cymed.laboratory.accessioning",
    "products.cymed.laboratory.worklists",
    "products.cymed.laboratory.results",
    "products.cymed.laboratory.microbiology",
    "products.cymed.laboratory.pathology",
    "products.cymed.laboratory.histopathology",
    "products.cymed.laboratory.quality",
    "products.cymed.laboratory.analytics",
    "products.cymed.laboratory.reference_lab",
    # CyMed Imaging Edition (Program 3.4)
    "products.cymed.imaging.orders",
    "products.cymed.imaging.modality_worklist",
    "products.cymed.imaging.scheduling",
    "products.cymed.imaging.radiology_reporting",
    "products.cymed.imaging.results",
    "products.cymed.imaging.pacs_gateway",
    "products.cymed.imaging.dicom_registry",
    "products.cymed.imaging.teleradiology",
    "products.cymed.imaging.quality",
    "products.cymed.imaging.analytics",
    # CyMed Pharmacy Edition (Program 3.5)
    "products.cymed.pharmacy.prescriptions",
    "products.cymed.pharmacy.dispensing",
    "products.cymed.pharmacy.administration",
    "products.cymed.pharmacy.clinical_pharmacy",
    "products.cymed.pharmacy.medication_reconciliation",
    "products.cymed.pharmacy.drug_interactions",
    "products.cymed.pharmacy.formulary",
    "products.cymed.pharmacy.automation",
    "products.cymed.pharmacy.analytics",
    "products.cymed.pharmacy.inventory_bridge",
    "products.cymed.pharmacy.procurement_bridge",
    "products.cymed.pharmacy.pos",
    # CyMed Population Health Edition (Program 3.9)
    "products.cymed.population_health.registries",
    "products.cymed.population_health.public_health",
    "products.cymed.population_health.surveillance",
    "products.cymed.population_health.quality",
    "products.cymed.population_health.care_gaps",
    "products.cymed.population_health.risk_management",
    "products.cymed.population_health.cohorts",
    "products.cymed.population_health.epidemiology",
    "products.cymed.population_health.national_programs",
    "products.cymed.population_health.analytics",
    "products.cymed.population_health.reporting",
    "products.cymed.population_health.digital_health",
    # CyMed Patient Portal (Program 3.6)
    "products.cymed.patient_portal.accounts",
    "products.cymed.patient_portal.directory",
    "products.cymed.patient_portal.appointments",
    "products.cymed.patient_portal.telemedicine",
    "products.cymed.patient_portal.medical_records",
    "products.cymed.patient_portal.laboratory_results",
    "products.cymed.patient_portal.imaging_results",
    "products.cymed.patient_portal.prescriptions",
    "products.cymed.patient_portal.payments",
    "products.cymed.patient_portal.insurance",
    "products.cymed.patient_portal.messaging",
    "products.cymed.patient_portal.notifications",
    "products.cymed.patient_portal.family_accounts",
    "products.cymed.patient_portal.consents",
    "products.cymed.patient_portal.wallet",
    "products.cymed.patient_portal.health_journey",
    # CyMed Provider Portal (Program 3.7)
    "products.cymed.provider_portal.workspace",
    "products.cymed.provider_portal.patient_lists",
    "products.cymed.provider_portal.clinical_tasks",
    "products.cymed.provider_portal.clinical_messaging",
    "products.cymed.provider_portal.workforce",
    "products.cymed.provider_portal.rounding",
    "products.cymed.provider_portal.orders",
    "products.cymed.provider_portal.results",
    "products.cymed.provider_portal.clinical_documentation",
    "products.cymed.provider_portal.telemedicine",
    "products.cymed.provider_portal.care_team",
    "products.cymed.provider_portal.approvals",
    "products.cymed.provider_portal.analytics",
    "products.cymed.provider_portal.mobile",
    # CyMed RCM & Insurance Platform (Program 3.8)
    "products.cymed.rcm.eligibility",
    "products.cymed.rcm.insurance",
    "products.cymed.rcm.preauthorization",
    "products.cymed.rcm.billing",
    "products.cymed.rcm.charge_capture",
    "products.cymed.rcm.claims",
    "products.cymed.rcm.denials",
    "products.cymed.rcm.collections",
    "products.cymed.rcm.contracts",
    "products.cymed.rcm.pricing",
    "products.cymed.rcm.revenue_analytics",
    "products.cymed.rcm.payer_portal",
    # CyMed Healthcare Workforce Management (Program 3.10)
    "products.cymed.workforce_management.workforce_profiles",
    "products.cymed.workforce_management.scheduling",
    "products.cymed.workforce_management.shift_swaps",
    "products.cymed.workforce_management.float_pool",
    "products.cymed.workforce_management.acuity",
    "products.cymed.workforce_management.oncall",
    "products.cymed.workforce_management.compliance",
    "products.cymed.workforce_management.fatigue",
    "products.cymed.workforce_management.forecasting",
    "products.cymed.workforce_management.analytics",
    # CyberCom Sales Demo Platform (Program 3.11)
    "products.demo",
    # CyberCom Deployment Platform (Program 3.12)
    "products.deployment",
    # CyberCom Implementation Methodology (Program 3.13)
    "products.implementation",
    # CyberCom Academy (Program 3.14)
    "products.academy",
    # CyberCom Commercial Readiness (Program 3.15)
    "products.commercial_readiness",
    # CyberCom Partner Ecosystem (Program 3.16)
    "products.partner_ecosystem",
    # Website Public APIs & CMS Backend
    "products.website",
]

# "channels" must precede django.contrib.staticfiles for Channels' runserver
# override (ASGI-serving dev server) to take effect -- see Channels docs.
INSTALLED_APPS = ["channels"] + DJANGO_APPS + THIRD_PARTY_APPS + PLATFORM_APPS + PRODUCT_APPS

# ---------------------------------------------------------------------------
# MIDDLEWARE (order matters — tenant before audit)
# ---------------------------------------------------------------------------
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "shared.auth.auth_middleware.CyIdentityAuthMiddleware",
    "core.middleware.tenant.TenantIsolationMiddleware",
    "core.middleware.portal_account.PortalAccountMiddleware",
    "core.middleware.branding.BrandingMiddleware",
    "core.middleware.feature_flags.FeatureFlagMiddleware",
    "core.middleware.audit.AuditMiddleware",
]

ROOT_URLCONF = "core.urls"

WSGI_APPLICATION = "core.wsgi.application"
ASGI_APPLICATION = "core.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# DATABASE — PostgreSQL 16 with RLS (ADR-0002)
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "cybercom_dev"),
        "USER": os.environ.get("DB_USER", "postgres"),
        "PASSWORD": os.environ.get("DB_PASSWORD", "postgres"),
        "HOST": os.environ.get("DB_HOST", "127.0.0.1"),
        "PORT": os.environ.get("DB_PORT", "5432"),
        "OPTIONS": {
            "connect_timeout": 10,
            "options": "-c search_path=public",
            # HIPAA Security Rule 164.312(e)(1) -- encrypt DB connections in
            # transit. "disable" only for local dev containers without a
            # cert; production must set DB_SSL_MODE=require (or verify-full
            # once a CA cert is provisioned).
            "sslmode": os.environ.get("DB_SSL_MODE", "disable" if DEBUG else "require"),
        },
        "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "60")),
        "CONN_HEALTH_CHECKS": True,
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# CACHE — Redis (ADR-0001)
# ---------------------------------------------------------------------------
REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        "KEY_PREFIX": "cybercom",
        "TIMEOUT": 300,
    }
}

# ---------------------------------------------------------------------------
# CHANNELS — real-time WebSocket push (Command Center KPI streaming)
# ---------------------------------------------------------------------------
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}

# ---------------------------------------------------------------------------
# CELERY (ADR-0001)
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", REDIS_URL)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = int(os.environ.get("CELERY_TASK_TIME_LIMIT", "300"))
CELERY_WORKER_MAX_TASKS_PER_CHILD = 100

# HIPAA 164.312(a)(2)(iii): automatic session termination after inactivity.
# platform/cyidentity/services.py's SessionService.enforce_idle_timeout()
# and its Celery task (cyidentity.enforce_idle_timeout) already existed but
# were never scheduled anywhere -- real logic with zero real callers.
CELERY_BEAT_SCHEDULE = {
    "cyidentity-enforce-idle-timeout": {
        "task": "cyidentity.enforce_idle_timeout",
        "schedule": 300.0,  # every 5 minutes; threshold itself is 30 min (SessionService.IDLE_THRESHOLD_SECONDS)
    },
    "cycom-hr-expire-clinical-credentials": {
        "task": "cycom_hr.expire_clinical_credentials",
        "schedule": 86400.0,  # once a day
    },
    "lab-escalate-critical-results": {
        "task": "lab_results.escalate_critical_results",
        "schedule": 300.0,  # every 5 minutes; thresholds are 30/15 min (see tasks.py)
    },
    "imaging-escalate-critical-findings": {
        "task": "img_reporting.escalate_critical_findings",
        "schedule": 300.0,
    },
    "hospital-broadcast-command-center-kpis": {
        "task": "hospital_command_center.broadcast_kpis",
        "schedule": 10.0,
    },
    # Phase 7 (Hybrid Edge): retries ZATCA/JoFotara invoice submissions that
    # were queued because the hospital's internet was down at the moment of
    # the original attempt. See products/cymed/rcm/billing/hybrid_sync_worker.py.
    "rcm-billing-retry-offline-tax-queue": {
        "task": "rcm_billing.retry_offline_tax_queue",
        "schedule": 300.0,  # every 5 minutes
    },
    # FEFO/SFDA compliance: flags medical stock batches expiring within 60
    # days so pharmacy can dispense them before they expire on the shelf.
    "inventory-notify-expiring-batches": {
        "task": "inventory.notify_expiring_batches",
        "schedule": 86400.0,  # once a day
    },
}

# ---------------------------------------------------------------------------
# KAFKA (ADR-0004)
# ---------------------------------------------------------------------------
KAFKA_BOOTSTRAP_SERVERS = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_SECURITY_PROTOCOL = os.environ.get("KAFKA_SECURITY_PROTOCOL", "PLAINTEXT")
KAFKA_SASL_MECHANISM = os.environ.get("KAFKA_SASL_MECHANISM", "")
KAFKA_SASL_USERNAME = os.environ.get("KAFKA_SASL_USERNAME", "")
KAFKA_SASL_PASSWORD = os.environ.get("KAFKA_SASL_PASSWORD", "")
KAFKA_SCHEMA_REGISTRY_URL = os.environ.get("KAFKA_SCHEMA_REGISTRY_URL", "http://localhost:8081")

# ---------------------------------------------------------------------------
# TERMINOLOGY API CONFIGURATION
# ---------------------------------------------------------------------------
# ICD-11 (WHO) — Bearer token from https://icdaccessmanagement.who.int/
# Leave empty to use fallback hardcoded codes (safe at launch).
ICD11_API_TOKEN = os.environ.get("ICD11_API_TOKEN", "")

# FHIR Terminology Server — used by FHIRTerminologyProvider for $lookup / $expand.
# Public tx.fhir.org is the default; set to an internal server in production.
FHIR_TERMINOLOGY_SERVER = os.environ.get("FHIR_TERMINOLOGY_SERVER", "https://tx.fhir.org/r4")

# Timeout (seconds) applied to all outbound terminology HTTP calls.
TERMINOLOGY_REQUESTS_TIMEOUT = int(os.environ.get("TERMINOLOGY_REQUESTS_TIMEOUT", "10"))

# ---------------------------------------------------------------------------
# IDENTITY — CyIdentity / Keycloak (ADR-0005)
# ---------------------------------------------------------------------------
CYIDENTITY_ISSUER = os.environ.get("CYIDENTITY_ISSUER", "http://localhost:8080/realms/cybercom")
CYIDENTITY_JWKS_URI = os.environ.get(
    "CYIDENTITY_JWKS_URI", f"{CYIDENTITY_ISSUER}/protocol/openid-connect/certs"
)
CYIDENTITY_CLIENT_ID = os.environ.get("CYIDENTITY_CLIENT_ID", "cybercom-backend")
JWT_SIGNING_KEY = os.environ.get("JWT_PUBLIC_KEY", "")
JWT_ALGORITHMS = ["RS256"]
JWT_ACCESS_TOKEN_LIFETIME_MINUTES = int(os.environ.get("JWT_ACCESS_TOKEN_LIFETIME", "15"))

# ---------------------------------------------------------------------------
# DRF — Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "platform.api.authentication.CyIdentityAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": int(os.environ.get("API_PAGE_SIZE", "25")),
    "EXCEPTION_HANDLER": "platform.api.exceptions.cybercom_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {
        # Website public API throttle buckets (per IP)
        "website_public_read": os.environ.get("THROTTLE_WEBSITE_READ", "600/hour"),
        "website_public_write": os.environ.get("THROTTLE_WEBSITE_WRITE", "20/hour"),
        "website_demo_request": os.environ.get("THROTTLE_DEMO_REQUEST", "5/hour"),
        "website_contact": os.environ.get("THROTTLE_CONTACT", "10/hour"),
        "website_partner_application": os.environ.get("THROTTLE_PARTNER_APP", "3/hour"),
        "website_newsletter": os.environ.get("THROTTLE_NEWSLETTER", "5/hour"),
    },
}

# ---------------------------------------------------------------------------
# OPENAPI / SPECTACULAR (ADR-0003)
# ---------------------------------------------------------------------------
SPECTACULAR_SETTINGS = {
    "TITLE": "CyberCom Platform API",
    "DESCRIPTION": "CyberCom multi-tenant enterprise platform REST API. OAuth2/OIDC secured.",
    "VERSION": os.environ.get("APP_VERSION", "0.1.0"),
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SWAGGER_UI_SETTINGS": {
        "persistAuthorization": True,
    },
    "SECURITY": [{"bearerAuth": []}],
    "SERVERS": [
        {"url": "/api/v1", "description": "Platform API v1"},
    ],
}

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001"
).split(",")
CORS_ALLOW_CREDENTIALS = True
# Previously `CORS_ALLOW_ALL_ORIGINS = DEBUG` -- any environment run with
# DEBUG=True (a genuinely easy misconfiguration, e.g. this whole session's
# own dev-server export block sets DJANGO_DEBUG=True) silently opened CORS
# to every origin, completely bypassing CORS_ALLOWED_ORIGINS above. DEBUG
# controls error-page verbosity, not CORS policy -- they're unrelated
# concerns that got tied together. Now explicit and opt-in only, defaulting
# closed regardless of DEBUG.
CORS_ALLOW_ALL_ORIGINS = os.environ.get("CORS_ALLOW_ALL_ORIGINS", "False").lower() == "true"

# django-cors-headers' default_headers doesn't include our custom X-Tenant-ID
# header (required on every request by TenantIsolationMiddleware and sent by
# the frontend's apiFetch on every call) -- without this, the browser's CORS
# preflight silently rejects it and every real frontend request fails with a
# generic "Failed to fetch", never reaching Django at all.
from corsheaders.defaults import default_headers as _cors_default_headers  # noqa: E402

CORS_ALLOW_HEADERS = [*_cors_default_headers, "x-tenant-id"]

# ---------------------------------------------------------------------------
# INTERNATIONALIZATION (Arabic + English, ADR-0032)
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

LANGUAGES = [
    ("en", "English"),
    ("ar", "Arabic"),
]

LOCALE_PATHS = [BASE_DIR / "locale"]

# ---------------------------------------------------------------------------
# STATIC & MEDIA
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# ---------------------------------------------------------------------------
# LOGGING — structured JSON for OTel collector (ADR-0009)
# ---------------------------------------------------------------------------
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(asctime)s %(name)s %(levelname)s %(message)s %(trace_id)s %(span_id)s",
        },
        "simple": {
            "format": "[%(asctime)s] %(levelname)s %(name)s: %(message)s",
        },
    },
    "filters": {
        "require_debug_false": {
            "()": "django.utils.log.RequireDebugFalse",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": sys.stdout,
            "formatter": "json" if not DEBUG else "simple",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
    "loggers": {
        "django": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
        "cybercom": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
        "cybercom.audit": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

# ---------------------------------------------------------------------------
# OPENTELEMETRY (ADR-0009)
# ---------------------------------------------------------------------------
OTEL_ENABLED = os.environ.get("OTEL_ENABLED", "False") == "True"
OTEL_SERVICE_NAME = os.environ.get("OTEL_SERVICE_NAME", "cybercom-platform")
OTEL_SERVICE_VERSION = os.environ.get("APP_VERSION", "0.1.0")
OTEL_EXPORTER_OTLP_ENDPOINT = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
OTEL_EXPORTER_OTLP_PROTOCOL = os.environ.get("OTEL_EXPORTER_OTLP_PROTOCOL", "grpc")

# ---------------------------------------------------------------------------
# MULTI-TENANCY (ADR-0002) — RLS GUC name
# ---------------------------------------------------------------------------
TENANT_GUC_SETTING = "app.current_tenant_id"
TENANT_HEADER = "X-Tenant-ID"
TENANT_BYPASS_PATHS = [
    "/health",
    "/health/liveness",
    "/health/readiness",
    "/api/schema/",
    "/api/docs/",
    "/admin/",
]

# ---------------------------------------------------------------------------
# PASSWORD VALIDATION
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# ENVIRONMENT
# ---------------------------------------------------------------------------
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
APP_VERSION = os.environ.get("APP_VERSION", "0.1.0")
