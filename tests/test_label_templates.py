"""Regrese úložiště šablon bez běžícího Home Assistantu."""

import asyncio
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1] / "custom_components" / "entity_audit"
stubs = {name: types.ModuleType(name) for name in
         ("homeassistant", "homeassistant.helpers", "homeassistant.helpers.storage", "test_entity_audit")}
stubs["test_entity_audit"].__path__ = [str(ROOT)]


class FakeStore:
    def __init__(self, hass, version, key):
        self.hass = hass

    async def async_load(self):
        return self.hass.get("saved")

    async def async_save(self, data):
        await asyncio.sleep(0)
        if self.hass.get("fail"):
            raise OSError("simulované selhání disku")
        self.hass["saved"] = data


stubs["homeassistant.helpers.storage"].Store = FakeStore
spec = importlib.util.spec_from_file_location("test_entity_audit.label_templates", ROOT / "label_templates.py")
module = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, stubs):
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)


class TemplatesTest(unittest.IsolatedAsyncioTestCase):
    async def test_persistence_update_delete_and_failed_write(self):
        backing = {}
        store = module.LabelTemplates(backing)
        await store.async_load()
        example = {"name": "  Pár  ", "model": "vc500w", "roll": "cz_1005", "length_mm": 40, "variant": "text_qr"}
        saved = await store.save(example)
        self.assertEqual(saved["name"], "Pár")
        restarted = module.LabelTemplates(backing)
        await restarted.async_load()
        self.assertEqual(restarted.list(), [saved])
        updated = await restarted.save({**example, "name": "Změna"}, saved["id"])
        backing["fail"] = True
        with self.assertRaises(OSError):
            await restarted.delete(updated["id"])
        self.assertEqual(restarted.list(), [updated])
        backing["fail"] = False
        await restarted.delete(updated["id"])
        self.assertEqual(restarted.list(), [])

    async def test_concurrent_saves_and_validation(self):
        store = module.LabelTemplates({})
        example = {"name": "Test", "model": "vc500w", "roll": "cz_1005", "length_mm": 40, "variant": "text_qr"}
        first, second = await asyncio.gather(store.save(example), store.save(example))
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(len(store.list()), 2)
        for change in ({"roll": "dk_22205"}, {"length_mm": True}, {"variant": "bad"}, {"name": "  "}, {"roll": "cz_1001"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                await store.save({**example, **change})


if __name__ == "__main__":
    unittest.main()
