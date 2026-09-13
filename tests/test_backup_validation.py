"""Regression coverage for the read-only configuration backup validator."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
BACKUP_FILE = ROOT / "custom_components" / "entity_audit" / "backup.py"
SPEC = importlib.util.spec_from_file_location("entity_audit_backup", BACKUP_FILE)
assert SPEC is not None and SPEC.loader is not None
BACKUP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BACKUP)


class BackupValidationTest(unittest.TestCase):
    """Validate stable, restorable automation and script YAML shapes."""

    def test_automations_are_a_yaml_list_with_preserved_ids(self) -> None:
        automations_yaml = """\
- id: "1778438477010"
  alias: "Boiler 64"
  description: ""
  triggers:
    - trigger: state
      entity_id: sensor.boiler_temperature
  actions:
    - action: switch.turn_on
      target:
        entity_id: switch.boiler
  mode: single
- id: "1746963291317"
  alias: "Cooling"
  description: ""
  triggers: []
  conditions: []
  actions: []
  mode: single
"""
        scripts_yaml = """\
example_script:
  alias: "Example script"
  sequence:
    - action: light.turn_on
      target:
        entity_id: light.example
"""

        parsed = yaml.safe_load(automations_yaml)
        self.assertIsInstance(parsed, list)
        self.assertEqual(
            [item["id"] for item in parsed], ["1778438477010", "1746963291317"]
        )

        validation = BACKUP.validate_configuration_snapshot(
            automations_yaml, scripts_yaml
        )
        self.assertTrue(validation["backup_valid"])
        self.assertTrue(validation["yaml_valid"])
        self.assertTrue(validation["automations_top_level_list"])
        self.assertTrue(validation["scripts_top_level_mapping"])
        self.assertEqual(validation["automations"], 2)
        self.assertEqual(validation["scripts"], 1)

    def test_status_comments_do_not_change_the_automation_list_shape(self) -> None:
        automations_yaml = """\
# Entity Audit status at export: disabled
# This point-in-time inventory marker is not applied as automation configuration.
-
  id: "1778438477010"
  alias: "Boiler 64"
  triggers: []
  conditions: []
  actions: []
  mode: single
"""
        parsed = yaml.safe_load(automations_yaml)

        self.assertIsInstance(parsed, list)
        self.assertEqual(parsed[0]["id"], "1778438477010")
        self.assertTrue(
            BACKUP.validate_configuration_snapshot(automations_yaml, "{}\n")[
                "backup_valid"
            ]
        )

    def test_missing_or_duplicate_automation_ids_fail_validation(self) -> None:
        automations_yaml = """\
- alias: "Missing ID"
  triggers: []
  actions: []
- id: "same"
  alias: "First"
  triggers: []
  actions: []
- id: "same"
  alias: "Second"
  triggers: []
  actions: []
"""
        validation = BACKUP.validate_configuration_snapshot(automations_yaml, "{}\n")

        self.assertFalse(validation["backup_valid"])
        self.assertEqual(validation["missing_automation_ids"], 1)
        self.assertEqual(validation["duplicate_automation_ids"], ["same"])

    def test_duplicate_aliases_are_reported_without_rewriting_entries(self) -> None:
        automations_yaml = """\
- id: "first"
  alias: "Same name"
  triggers: []
  actions: []
- id: "second"
  alias: "Same name"
  triggers: []
  actions: []
"""
        validation = BACKUP.validate_configuration_snapshot(automations_yaml, "{}\n")

        self.assertTrue(validation["backup_valid"])
        self.assertEqual(validation["duplicate_automation_aliases"], ["Same name"])
        self.assertTrue(validation["warnings"])

    def test_duplicate_yaml_keys_are_not_silently_accepted(self) -> None:
        automations_yaml = """\
id: "1"
alias: "First"
id: "2"
alias: "Second"
"""
        validation = BACKUP.validate_configuration_snapshot(
            automations_yaml, "{}\n"
        )

        self.assertFalse(validation["backup_valid"])
        self.assertFalse(validation["yaml_valid"])
        self.assertTrue(validation["duplicate_automation_yaml_keys"])

    def test_duplicate_script_keys_are_not_silently_accepted(self) -> None:
        scripts_yaml = """\
same_script:
  sequence: []
same_script:
  sequence: []
"""
        validation = BACKUP.validate_configuration_snapshot("[]\n", scripts_yaml)

        self.assertFalse(validation["backup_valid"])
        self.assertFalse(validation["yaml_valid"])
        self.assertTrue(validation["duplicate_script_keys"])


if __name__ == "__main__":
    unittest.main()
