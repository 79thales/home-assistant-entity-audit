"""Import Entity Audit against an installed real Home Assistant runtime."""

from __future__ import annotations

from importlib import import_module
from importlib.metadata import version

if __name__ == "__main__":
    # Absence of HA is an error in this dedicated CI job, never a skipped test.
    print(f"Home Assistant {version('homeassistant')}")
    for module in (
        "custom_components.entity_audit",
        "custom_components.entity_audit.backup",
        "custom_components.entity_audit.config_flow",
        "custom_components.entity_audit.const",
        "custom_components.entity_audit.diagnostics",
        "custom_components.entity_audit.manager",
        "custom_components.entity_audit.network",
        "custom_components.entity_audit.websocket",
    ):
        import_module(module)
        print(f"Imported {module}")
