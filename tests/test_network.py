"""Tests for display-only IP address extraction."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


NETWORK_FILE = (
    Path(__file__).resolve().parents[1]
    / "custom_components"
    / "entity_audit"
    / "network.py"
)
SPEC = importlib.util.spec_from_file_location("entity_audit_network", NETWORK_FILE)
assert SPEC and SPEC.loader
NETWORK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(NETWORK)


class FindIpAddressTest(unittest.TestCase):
    """Verify that only existing literal IP addresses are exposed."""

    def test_prefers_ip_address_attribute(self) -> None:
        self.assertEqual(
            NETWORK.find_ip_address({"ip_address": "192.168.10.25"}, None),
            "192.168.10.25",
        )

    def test_accepts_literal_ip_from_configuration_url(self) -> None:
        self.assertEqual(
            NETWORK.find_ip_address({}, "http://192.168.10.26/status"),
            "192.168.10.26",
        )

    def test_does_not_resolve_hostnames_or_return_invalid_values(self) -> None:
        self.assertIsNone(NETWORK.find_ip_address({"host": "shelly.local"}, None))
        self.assertIsNone(
            NETWORK.find_ip_address({}, "http://device.example.invalid/status")
        )
