"""Import Entity Audit and serialize both forms with a real HA runtime."""

from __future__ import annotations

from importlib import import_module
from importlib.metadata import version
import json

if __name__ == "__main__":
    # Absence of HA is an error in this dedicated CI job, never a skipped test.
    print(f"Home Assistant {version('homeassistant')}")
    # Run HA's package bootstrap first, just as the real application does.
    # Recent releases install the voluptuous compatibility alias here; the
    # integration must not install a process-wide alias itself.
    import_module("homeassistant")
    for module in (
        "custom_components.entity_audit",
        "custom_components.entity_audit.backup",
        "custom_components.entity_audit.config_flow",
        "custom_components.entity_audit.const",
        "custom_components.entity_audit.diagnostics",
        "custom_components.entity_audit.manager",
        "custom_components.entity_audit.label_templates",
        "custom_components.entity_audit.network",
        "custom_components.entity_audit.websocket",
    ):
        import_module(module)
        print(f"Imported {module}")

    # Import checks alone do not exercise the HTTP form response. Use the
    # exact converter/custom serializer that HA uses for setup and options;
    # arbitrary callables in data_schema otherwise fail only when opened.
    from homeassistant.helpers import config_validation as cv
    ha_flow = import_module("homeassistant.helpers.data_entry_flow")
    if hasattr(ha_flow, "probatio"):
        convert = ha_flow.probatio.to_field_list
    else:
        # Older supported HA versions use the original form serializer.
        convert = import_module("voluptuous_serialize").convert

    flow = import_module("custom_components.entity_audit.config_flow")
    for include_clear_history in (False, True):
        schema = flow.EntityAuditConfigFlow._schema({}, include_clear_history)
        converted = convert(schema, custom_serializer=cv.custom_serializer)
        json.dumps(converted)
        fields = {field["name"]: field for field in converted}
        for name in ("brother_ql_host", "brother_vc_host"):
            assert fields[name]["type"] == "string", name
        print(f"Serialized {'options' if include_clear_history else 'setup'} form with real Home Assistant")
