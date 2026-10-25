"""Exercise the actual form schema with Home Assistant's JSON serializer.

The lightweight suite loads the integration's real schema and step functions
without importing an entire HA runtime. FlowHarness supplies only the public
flow callbacks; the dedicated real-HA CI job also serializes these schemas
with Home Assistant's own custom_serializer.
"""

from __future__ import annotations

import ast
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import voluptuous as vol
import voluptuous_serialize

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "entity_audit"


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, COMPONENT / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CONSTANTS = load_module("entity_audit_flow_constants", "const.py")
PRINTING = load_module("entity_audit_flow_printing", "printing.py")
SOURCE = ast.parse((COMPONENT / "config_flow.py").read_text(encoding="utf-8"))
FUNCTIONS = []
for node in ast.walk(SOURCE):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in {
        "_schema", "_printer_host", "_validate_printer_hosts", "async_step_user", "async_step_init"
    }:
        node.decorator_list = []
        FUNCTIONS.append(node)
NAMESPACE = {
    **vars(CONSTANTS), "vol": vol, "PrintError": PRINTING.PrintError,
    "printer_host": PRINTING.printer_host,
}
exec(compile(ast.Module(body=FUNCTIONS, type_ignores=[]), "config_flow.py", "exec"), NAMESPACE)


class FlowHarness:
    _schema = staticmethod(NAMESPACE["_schema"])
    async_step_user = NAMESPACE["async_step_user"]
    async_step_init = NAMESPACE["async_step_init"]

    def __init__(self):
        self.config_entry = SimpleNamespace(data={}, options={})
        self.manager = SimpleNamespace(clear_count=0)
        self.manager.clear_activity = lambda: setattr(self.manager, "clear_count", self.manager.clear_count + 1)
        self.manager.get_settings = lambda: {"activity_log_enabled": True}
        self.hass = SimpleNamespace(data={"entity_audit": {"manager": self.manager}})

    async def async_set_unique_id(self, _unique_id):
        pass

    def _abort_if_unique_id_configured(self):
        pass

    def async_show_form(self, **kwargs):
        return {"type": "form", **kwargs}

    def async_create_entry(self, **kwargs):
        return {"type": "create_entry", **kwargs}


NAMESPACE["EntityAuditConfigFlow"] = FlowHarness


class ConfigFlowFormsTest(unittest.IsolatedAsyncioTestCase):
    def test_setup_and_options_schemas_are_json_serializable(self):
        for options in (False, True):
            with self.subTest(options=options):
                schema = FlowHarness._schema({}, include_clear_history=options)
                serialized = voluptuous_serialize.convert(schema)
                json.dumps(serialized)
                fields = {field["name"]: field for field in serialized}
                for key in ("brother_ql_host", "brother_vc_host"):
                    self.assertEqual(fields[key]["type"], "string")
                    self.assertFalse(fields[key]["required"])

    async def test_setup_opens_and_accepts_unused_printers(self):
        flow = FlowHarness()
        form = await flow.async_step_user()
        self.assertEqual(form["type"], "form")
        submitted = form["data_schema"]({})
        result = await flow.async_step_user(submitted)
        self.assertEqual(result["type"], "create_entry")
        self.assertEqual(result["data"]["brother_ql_host"], "")
        self.assertEqual(result["data"]["brother_vc_host"], "")

    async def test_bad_address_shows_serializable_form_with_preserved_values(self):
        flow = FlowHarness()
        form = await flow.async_step_user()
        submitted = form["data_schema"]({})
        submitted.update(brother_ql_host="http://printer.local", retention_days=16)
        result = await flow.async_step_user(submitted)
        self.assertEqual(result["type"], "form")
        self.assertEqual(result["errors"], {"brother_ql_host": "invalid_printer_host"})
        fields = {field["name"]: field for field in voluptuous_serialize.convert(result["data_schema"])}
        self.assertEqual(fields["brother_ql_host"]["default"], "http://printer.local")
        self.assertEqual(fields["retention_days"]["default"], 16)
        self.assertEqual(submitted["brother_ql_host"], "http://printer.local")

    async def test_valid_addresses_are_normalized_before_saving(self):
        flow = FlowHarness()
        form = await flow.async_step_user()
        submitted = form["data_schema"]({})
        submitted.update(brother_ql_host=" PRINTER.Local ", brother_vc_host="192.0.2.25")
        result = await flow.async_step_user(submitted)
        self.assertEqual(result["type"], "create_entry")
        self.assertEqual(result["data"]["brother_ql_host"], "printer.local")
        self.assertEqual(result["data"]["brother_vc_host"], "192.0.2.25")

    async def test_options_open_with_existing_values(self):
        flow = FlowHarness()
        flow.config_entry.options = {"brother_ql_host": "printer.local", "retention_days": 8}
        form = await flow.async_step_init()
        self.assertEqual(form["type"], "form")
        fields = {field["name"]: field for field in voluptuous_serialize.convert(form["data_schema"])}
        self.assertEqual(fields["brother_ql_host"]["default"], "printer.local")
        self.assertEqual(fields["retention_days"]["default"], 8)

    async def test_invalid_options_do_not_clear_history(self):
        flow = FlowHarness()
        form = await flow.async_step_init()
        submitted = form["data_schema"]({})
        submitted.update(brother_vc_host="printer:9100", clear_activity_history=True)
        result = await flow.async_step_init(submitted)
        self.assertEqual(result["type"], "form")
        self.assertEqual(result["errors"], {"brother_vc_host": "invalid_printer_host"})
        self.assertEqual(flow.manager.clear_count, 0)
        self.assertTrue(submitted["clear_activity_history"])
        json.dumps(voluptuous_serialize.convert(result["data_schema"]))
        submitted["brother_vc_host"] = ""
        result = await flow.async_step_init(submitted)
        self.assertEqual(result["type"], "create_entry")
        self.assertEqual(flow.manager.clear_count, 1)
        self.assertNotIn("clear_activity_history", result["data"])

    def test_all_invalid_hosts_are_reported_without_mutating_input(self):
        submitted = {"brother_ql_host": "user:password@printer", "brother_vc_host": "https://printer.local"}
        original = dict(submitted)
        _data, errors = NAMESPACE["_validate_printer_hosts"](submitted)
        self.assertEqual(set(errors), {"brother_ql_host", "brother_vc_host"})
        self.assertEqual(submitted, original)


if __name__ == "__main__":
    unittest.main()
