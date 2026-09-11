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
        self.assertIn('id="label-width"', frontend)
        self.assertIn('id="label-height"', frontend)
        self.assertIn('id="label-variant"', frontend)
        self.assertIn('value="text_qr"', frontend)
        self.assertIn('value="qr"', frontend)
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

    def test_panel_runs_in_home_assistant_dom_for_system_toolbar(self) -> None:
        registration = INIT_FILE.read_text(encoding="utf-8")

        self.assertIn('"embed_iframe": False', registration)
        self.assertIn('"handle_safe_area": True', registration)


if __name__ == "__main__":
    unittest.main()
