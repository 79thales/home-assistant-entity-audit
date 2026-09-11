"""Constants for Entity Audit."""

DOMAIN = "entity_audit"
STORAGE_KEY = f"{DOMAIN}.storage"
STORAGE_VERSION = 1

CONF_RETENTION_DAYS = "retention_days"
CONF_MAX_EVENTS = "max_events_per_entity"
DEFAULT_RETENTION_DAYS = 30
DEFAULT_MAX_EVENTS = 500
DEFAULT_ACTIVITY_LOG_ENABLED = True
MAX_ACTIVITY_EVENTS = 1000
ACTIVITY_EVENT_TYPES = frozenset(
    {
        "activity_log_enabled",
        "activity_log_disabled",
        "entity_audit_enabled",
        "entity_audit_disabled",
        "entity_audit_bulk_enabled",
        "entity_audit_bulk_disabled",
        "entity_history_opened",
        "entity_history_cleared",
        "entity_detail_opened",
        "inventory_refreshed",
        "csv_exported",
        "labels_pdf_created",
        "labels_pdf_failed",
        "labels_pdf_shared",
        "labels_pdf_share_failed",
        "qr_scanner_opened",
        "qr_camera_environment",
        "qr_camera_requested",
        "qr_camera_started",
        "qr_camera_failed",
        "qr_camera_timed_out",
        "qr_camera_wait_updated",
        "qr_reader_failed",
        "qr_label_scanned",
        "qr_label_rejected",
        "qr_photo_requested",
        "qr_photo_failed",
        "scanned_device_filtered",
        "scanned_device_page_opened",
    }
)

PROBLEM_STATES = {"unavailable", "unknown"}
PANEL_URL = "/entity_audit/entity-audit-panel.js"
QR_LIBRARY_URL = "/entity_audit/qrcode.js"
QR_READER_LIBRARY_URL = "/entity_audit/jsQR.js"
PANEL_MODULE_URL = f"{PANEL_URL}?v=0.3.16"
PANEL_ELEMENT = "entity-audit-panel-v0316"
