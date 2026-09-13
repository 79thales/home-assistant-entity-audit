"""Regression tests for the backend/frontend panel contract."""

from __future__ import annotations

import hashlib
import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONST_FILE = ROOT / "custom_components" / "entity_audit" / "const.py"
FRONTEND_FILE = (
    ROOT
    / "custom_components"
    / "entity_audit"
    / "frontend"
    / "entity-audit-panel.js"
)
MANIFEST_FILE = ROOT / "custom_components" / "entity_audit" / "manifest.json"
INIT_FILE = ROOT / "custom_components" / "entity_audit" / "__init__.py"
QR_LIBRARY_FILE = ROOT / "custom_components" / "entity_audit" / "frontend" / "qrcode.js"
QR_READER_LIBRARY_FILE = (
    ROOT / "custom_components" / "entity_audit" / "frontend" / "jsQR.js"
)
QR_LICENSE_FILE = (
    ROOT / "custom_components" / "entity_audit" / "frontend" / "QRCODE-LICENSE.txt"
)
QR_READER_LICENSE_FILE = (
    ROOT / "custom_components" / "entity_audit" / "frontend" / "JSQR-LICENSE.txt"
)
MANAGER_FILE = ROOT / "custom_components" / "entity_audit" / "manager.py"
WEBSOCKET_FILE = ROOT / "custom_components" / "entity_audit" / "websocket.py"
BACKUP_FILE = ROOT / "custom_components" / "entity_audit" / "backup.py"
CONFIG_FLOW_FILE = ROOT / "custom_components" / "entity_audit" / "config_flow.py"
DIAGNOSTICS_FILE = ROOT / "custom_components" / "entity_audit" / "diagnostics.py"
STRINGS_FILE = ROOT / "custom_components" / "entity_audit" / "strings.json"
TRANSLATIONS_EN_FILE = (
    ROOT / "custom_components" / "entity_audit" / "translations" / "en.json"
)


class FrontendContractTest(unittest.TestCase):
    """Ensure Home Assistant loads the element registered by the frontend."""

    def test_custom_element_matches_backend_registration(self) -> None:
        constants = CONST_FILE.read_text(encoding="utf-8")
        frontend = FRONTEND_FILE.read_text(encoding="utf-8")
        match = re.search(r'^PANEL_ELEMENT = "([^"]+)"$', constants, re.MULTILINE)

        self.assertIsNotNone(match, "PANEL_ELEMENT must be a string constant")
        panel_element = match.group(1)
        self.assertIn(f'customElements.get("{panel_element}")', frontend)
        self.assertIn(
            f'customElements.define("{panel_element}", EntityAuditPanel)', frontend
        )

    def test_cache_version_matches_manifest_version(self) -> None:
        constants = CONST_FILE.read_text(encoding="utf-8")
        manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
        match = re.search(r'PANEL_MODULE_URL = .*\\?v=([0-9.]+)"$', constants, re.MULTILINE)

        self.assertIsNotNone(match, "PANEL_MODULE_URL must contain a cache version")
        self.assertEqual(manifest["version"], match.group(1))

    def test_label_pdf_export_is_limited_to_unique_ip_addresses(self) -> None:
        frontend = FRONTEND_FILE.read_text(encoding="utf-8")

        self.assertIn('id="download-labels"', frontend)
        self.assertIn("!entity.device_id || !entity.ip_address", frontend)
        self.assertIn("devices.get(entity.ip_address)", frontend)
        self.assertIn("devices.set(entity.ip_address, entity)", frontend)
        self.assertIn("manufacturerLabel", frontend)
        self.assertNotIn('id="label-width"', frontend)
        self.assertNotIn('id="label-height"', frontend)
        self.assertNotIn('id="label-variant"', frontend)
        self.assertIn("CONF_LABEL_WIDTH", CONFIG_FLOW_FILE.read_text(encoding="utf-8"))
        self.assertIn("CONF_LABEL_HEIGHT", CONFIG_FLOW_FILE.read_text(encoding="utf-8"))
        self.assertIn("CONF_LABEL_VARIANT", CONFIG_FLOW_FILE.read_text(encoding="utf-8"))
        self.assertIn("_labelQrPayload", frontend)
        self.assertIn('type: "application/pdf"', frontend)
        self.assertNotIn("window.open(", frontend)

    def test_qr_generator_is_bundled_and_served_locally(self) -> None:
        constants = CONST_FILE.read_text(encoding="utf-8")
        registration = INIT_FILE.read_text(encoding="utf-8")

        self.assertIn('QR_LIBRARY_URL = "/entity_audit/qrcode.js"', constants)
        self.assertIn("StaticPathConfig(\n                    QR_LIBRARY_URL", registration)
        self.assertTrue(QR_LIBRARY_FILE.is_file())
        self.assertIn("MIT License", QR_LICENSE_FILE.read_text(encoding="utf-8"))

    def test_qr_reader_is_bundled_and_served_locally(self) -> None:
        constants = CONST_FILE.read_text(encoding="utf-8")
        registration = INIT_FILE.read_text(encoding="utf-8")
        frontend = FRONTEND_FILE.read_text(encoding="utf-8")

        self.assertIn('QR_READER_LIBRARY_URL = "/entity_audit/jsQR.js"', constants)
        self.assertIn(
            "StaticPathConfig(\n                    QR_READER_LIBRARY_URL", registration
        )
        self.assertTrue(QR_READER_LIBRARY_FILE.is_file())
        self.assertEqual(
            hashlib.sha256(QR_READER_LIBRARY_FILE.read_bytes()).hexdigest(),
            "3325b0888fa4745c4e6940897d8c4f426fbaae76901fcbfe1871a04e90a51655",
        )
        self.assertIn(
            "Apache License",
            QR_READER_LICENSE_FILE.read_text(encoding="utf-8"),
        )
        self.assertIn('id="open-scanner"', frontend)
        self.assertIn("navigator.mediaDevices?.getUserMedia", frontend)
        self.assertIn("Request the camera before any rendering", frontend)
        self.assertIn("_cameraAccessMessage", frontend)
        self.assertIn("window.isSecureContext", frontend)
        self.assertIn(
            'id="scan-camera-image" type="file" accept="image/*" '
            'capture="environment"',
            frontend,
        )
        self.assertIn('id="scan-image" type="file" accept="image/*"', frontend)
        self.assertIn("_parseLabelQr", frontend)
        self.assertIn("_matchScannedDevice", frontend)
        self.assertIn('href="/config/devices/device/', frontend)
        self.assertIn("this._escape(this._scanResult.name)", frontend)

    def test_system_toolbar_keeps_search_and_filters_available(self) -> None:
        frontend = FRONTEND_FILE.read_text(encoding="utf-8")

        self.assertIn("<ha-top-app-bar-fixed", frontend)
        self.assertIn('slot="title"', frontend)
        self.assertIn('slot="actionItems"', frontend)
        self.assertIn('slot="subRow"', frontend)
        self.assertIn('id="search"', frontend)
        self.assertIn('id="toggle-filters"', frontend)
        self.assertIn(".filter-panel:not(.open)", frontend)

    def test_settings_and_action_history_use_the_integration_page(self) -> None:
        frontend = FRONTEND_FILE.read_text(encoding="utf-8")
        manager = MANAGER_FILE.read_text(encoding="utf-8")
        websocket = WEBSOCKET_FILE.read_text(encoding="utf-8")
        config_flow = CONFIG_FLOW_FILE.read_text(encoding="utf-8")
        diagnostics = DIAGNOSTICS_FILE.read_text(encoding="utf-8")

        self.assertNotIn('id="open-activity"', frontend)
        self.assertNotIn('id="activity-enabled"', frontend)
        self.assertNotIn('id="clear-activity"', frontend)
        self.assertIn("_recordActivity(\"qr_camera_failed\"", frontend)
        self.assertIn("_recordActivity(\"qr_camera_environment\"", frontend)
        self.assertNotIn("id=\"camera-wait\"", frontend)
        self.assertIn("id=\"retry-camera\"", frontend)
        self.assertIn("_scheduleCameraWaitTimer", frontend)
        self.assertIn("this._scannerDialog.showModal()", frontend)
        self.assertIn("MAX_ACTIVITY_EVENTS = 1000", CONST_FILE.read_text(encoding="utf-8"))
        self.assertIn("ACTIVITY_EVENT_TYPES", CONST_FILE.read_text(encoding="utf-8"))
        self.assertIn("def _prune_activity", manager)
        self.assertIn('"retention_days": self.retention_days', manager)
        self.assertIn("entity_audit/get_settings", frontend)
        self.assertIn('f"{DOMAIN}/get_settings"', websocket)
        self.assertIn("vol.In(ACTIVITY_EVENT_TYPES)", websocket)
        self.assertIn("@websocket_api.require_admin", websocket)
        self.assertIn("CONF_ACTIVITY_LOG_ENABLED", config_flow)
        self.assertIn("CONF_CAMERA_WAIT_SECONDS", config_flow)
        self.assertIn("CONF_CLEAR_ACTIVITY_HISTORY", config_flow)
        self.assertIn("async_get_config_entry_diagnostics", diagnostics)
        self.assertIn("manager.get_diagnostics()", diagnostics)
        self.assertIn('"action_and_error_history"', manager)

    def test_hacs_category_is_optional_and_has_a_filtered_csv_export(self) -> None:
        frontend = FRONTEND_FILE.read_text(encoding="utf-8")
        manager = MANAGER_FILE.read_text(encoding="utf-8")
        websocket = WEBSOCKET_FILE.read_text(encoding="utf-8")

        self.assertIn('value="hacs"', frontend)
        self.assertIn("HACS repositories", frontend)
        self.assertIn("_exportHacsCsv", frontend)
        self.assertIn("entity-audit-hacs", frontend)
        self.assertIn("hacs-category-filter", frontend)
        self.assertIn("def get_hacs_repositories", manager)
        self.assertIn('self.hass.data.get("hacs")', manager)
        self.assertIn("repositories.list_downloaded", manager)
        self.assertNotIn("import hacs", manager)
        self.assertIn('f"{DOMAIN}/list_hacs_repositories"', websocket)

    def test_users_category_uses_supported_auth_api_without_secrets(self) -> None:
        frontend = FRONTEND_FILE.read_text(encoding="utf-8")
        manager = MANAGER_FILE.read_text(encoding="utf-8")
        websocket = WEBSOCKET_FILE.read_text(encoding="utf-8")

        self.assertIn('value="users"', frontend)
        self.assertIn("Users & permissions", frontend)
        self.assertIn("_exportUsersCsv", frontend)
        self.assertIn("entity-audit-users", frontend)
        self.assertIn("user-role-filter", frontend)
        self.assertIn("permission_policy", frontend)
        self.assertIn("async def async_get_users", manager)
        self.assertIn("await self.hass.auth.async_get_users()", manager)
        self.assertIn('"permission_policy": json.dumps(', manager)
        self.assertIn('"policy": getattr(group, "policy", {})', manager)
        self.assertNotIn("user.credentials", manager)
        self.assertNotIn("user.refresh_tokens", manager)
        self.assertIn('f"{DOMAIN}/list_users"', websocket)

    def test_automations_category_uses_runtime_inventory_and_native_exports(self) -> None:
        frontend = FRONTEND_FILE.read_text(encoding="utf-8")
        manager = MANAGER_FILE.read_text(encoding="utf-8")
        websocket = WEBSOCKET_FILE.read_text(encoding="utf-8")

        self.assertIn('value="automations"', frontend)
        self.assertIn(">Automations</option>", frontend)
        self.assertIn(">Scripts</option>", frontend)
        self.assertIn("_exportAutomationCsv", frontend)
        self.assertIn("_exportAutomationYaml", frontend)
        self.assertIn("_exportConfigurationYaml", frontend)
        self.assertIn("_configurationIncludeYaml", frontend)
        self.assertIn("_exportConfigurationBackup", frontend)
        self.assertIn("entity-audit-backup", frontend)
        self.assertIn("restore/automations.yaml", frontend)
        self.assertIn("inventory/entities.csv", frontend)
        self.assertIn("diagnostics/validation.txt", frontend)
        self.assertIn("context/dependencies.yaml", frontend)
        self.assertIn("context/automation_states.json", frontend)
        self.assertIn("_exportAutomationPackage", frontend)
        self.assertIn("_createZip", frontend)
        self.assertIn("_openAutomationEditor", frontend)
        self.assertIn('type: `${kind}/config`', frontend)
        self.assertIn("_redactConfiguration", frontend)
        self.assertIn("REDACTED", frontend)
        self.assertIn("entity-audit-automations", frontend)
        self.assertIn("entity-audit-scripts", frontend)
        self.assertIn("entity-audit-configuration", frontend)
        self.assertIn("entity-audit-configuration-backup", frontend)
        self.assertIn("# Entity Audit status at export", frontend)
        self.assertIn("configuration_yaml_exported", CONST_FILE.read_text(encoding="utf-8"))
        self.assertIn("configuration_backup_exported", CONST_FILE.read_text(encoding="utf-8"))
        self.assertIn("configuration_backup_failed", CONST_FILE.read_text(encoding="utf-8"))
        self.assertIn("def get_automation_scripts", manager)
        self.assertIn('self.hass.states.async_entity_ids(kind)', manager)
        self.assertIn('"edit_id": str(edit_id)', manager)
        self.assertIn('"automation_enabled": automation_enabled', manager)
        self.assertIn('"status": status', manager)
        self.assertIn('"backup_attributes":', manager)
        self.assertIn('"available":', manager)
        self.assertNotIn("automation.storage", manager)
        self.assertIn('f"{DOMAIN}/list_automation_scripts"', websocket)
        self.assertIn('f"{DOMAIN}/validate_configuration_export"', websocket)
        self.assertIn("validate_configuration_snapshot", websocket)
        self.assertTrue(BACKUP_FILE.is_file())

    def test_panel_and_config_flow_are_english_only(self) -> None:
        frontend = FRONTEND_FILE.read_text(encoding="utf-8")
        translations = json.loads(TRANSLATIONS_EN_FILE.read_text(encoding="utf-8"))
        strings = json.loads(STRINGS_FILE.read_text(encoding="utf-8"))

        self.assertNotIn("this._t(", frontend)
        self.assertFalse(
            (ROOT / "custom_components" / "entity_audit" / "translations" / "cs.json").exists()
        )
        self.assertIn("options", translations)
        self.assertEqual(strings, translations)
        self.assertEqual(
            translations["options"]["step"]["init"]["data"]["camera_wait_seconds"],
            "Camera startup timeout (seconds)",
        )

    def test_panel_runs_in_home_assistant_dom_for_system_toolbar(self) -> None:
        registration = INIT_FILE.read_text(encoding="utf-8")

        self.assertIn('"embed_iframe": False', registration)
        self.assertIn('"handle_safe_area": True', registration)


if __name__ == "__main__":
    unittest.main()
