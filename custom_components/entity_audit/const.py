"""Constants for Entity Audit."""

DOMAIN = "entity_audit"
STORAGE_KEY = f"{DOMAIN}.storage"
STORAGE_VERSION = 1

CONF_RETENTION_DAYS = "retention_days"
CONF_MAX_EVENTS = "max_events_per_entity"
DEFAULT_RETENTION_DAYS = 30
DEFAULT_MAX_EVENTS = 500

PROBLEM_STATES = {"unavailable", "unknown"}
PANEL_URL = "/entity_audit/entity-audit-panel.js"
PANEL_MODULE_URL = f"{PANEL_URL}?v=0.2.1"
PANEL_ELEMENT = "entity-audit-panel-v021"
