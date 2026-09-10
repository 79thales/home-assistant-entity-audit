"""Regression tests for the backend/frontend panel contract."""

from __future__ import annotations

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

    def test_print_labels_are_limited_to_unique_ip_addresses(self) -> None:
        frontend = FRONTEND_FILE.read_text(encoding="utf-8")

        self.assertIn('id="print-labels"', frontend)
        self.assertIn("!entity.device_id || !entity.ip_address", frontend)
        self.assertIn("devices.get(entity.ip_address)", frontend)
        self.assertIn("devices.set(entity.ip_address, entity)", frontend)
        self.assertIn("manufacturerLabel", frontend)
        self.assertIn('id="label-width"', frontend)
        self.assertIn('id="label-height"', frontend)


if __name__ == "__main__":
    unittest.main()
