"""Read-only validation helpers for Entity Audit configuration exports."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import yaml
from yaml.nodes import MappingNode, Node, ScalarNode, SequenceNode


def _node_key(node: Node) -> str:
    """Return a readable YAML mapping key without evaluating custom tags."""
    if isinstance(node, ScalarNode):
        return str(node.value)
    return "<complex-key>"


def _duplicate_mapping_keys(node: Node | None, path: str = "$") -> list[str]:
    """Find duplicate YAML mapping keys before safe_load can overwrite them."""
    if node is None:
        return []

    duplicates: list[str] = []
    if isinstance(node, MappingNode):
        seen: set[str] = set()
        for key_node, value_node in node.value:
            key = _node_key(key_node)
            key_path = f"{path}.{key}"
            if key in seen:
                duplicates.append(key_path)
            else:
                seen.add(key)
            duplicates.extend(_duplicate_mapping_keys(value_node, key_path))
    elif isinstance(node, SequenceNode):
        for index, value_node in enumerate(node.value):
            duplicates.extend(_duplicate_mapping_keys(value_node, f"{path}[{index}]"))
    return duplicates


def _parse_document(document: str) -> tuple[Any | None, list[str], list[str]]:
    """Parse one generated YAML document and reject duplicate keys."""
    try:
        root = yaml.compose(document, Loader=yaml.SafeLoader)
        duplicate_keys = _duplicate_mapping_keys(root)
        if duplicate_keys:
            return None, ["Duplicate YAML mapping keys detected."], duplicate_keys
        return yaml.safe_load(document), [], []
    except yaml.YAMLError as err:
        return None, [str(err)], []


def _duplicates(values: list[str]) -> list[str]:
    """Return unique duplicates in first-seen order."""
    seen: set[str] = set()
    duplicates: list[str] = []
    for value in values:
        if value in seen and value not in duplicates:
            duplicates.append(value)
        seen.add(value)
    return duplicates


def validate_configuration_snapshot(
    automations_yaml: str, scripts_yaml: str
) -> dict[str, Any]:
    """Validate the YAML shape and identities of a generated snapshot.

    This intentionally checks serialization only. Home Assistant has already
    validated loaded runtime automations and scripts; Entity Audit never reloads
    or changes them while exporting.
    """
    automations, automation_errors, automation_duplicate_keys = _parse_document(
        automations_yaml
    )
    scripts, script_errors, script_duplicate_keys = _parse_document(scripts_yaml)
    errors = [
        *(f"automations.yaml: {error}" for error in automation_errors),
        *(f"scripts.yaml: {error}" for error in script_errors),
    ]

    automations_is_list = isinstance(automations, list)
    scripts_is_mapping = isinstance(scripts, Mapping)
    if not automations_is_list:
        errors.append("automations.yaml must have a YAML list at the top level.")
    if not scripts_is_mapping:
        errors.append("scripts.yaml must have a YAML mapping at the top level.")

    automation_items = automations if automations_is_list else []
    malformed_automations = [
        index
        for index, automation in enumerate(automation_items)
        if not isinstance(automation, Mapping)
    ]
    if malformed_automations:
        errors.append("Every automation entry must be a YAML mapping.")

    valid_automations = [
        automation
        for automation in automation_items
        if isinstance(automation, Mapping)
    ]
    automation_ids = [
        str(automation["id"])
        for automation in valid_automations
        if automation.get("id") not in (None, "")
    ]
    missing_automation_ids = sum(
        1 for automation in valid_automations if automation.get("id") in (None, "")
    )
    duplicate_automation_ids = _duplicates(automation_ids)
    aliases = [
        str(automation["alias"])
        for automation in valid_automations
        if automation.get("alias") not in (None, "")
    ]
    duplicate_aliases = _duplicates(aliases)
    if missing_automation_ids:
        errors.append("One or more automation entries are missing an id.")
    if duplicate_automation_ids:
        errors.append("Duplicate automation ids detected.")

    warnings: list[str] = []
    if duplicate_aliases:
        warnings.append("Duplicate automation aliases detected.")
    if automation_duplicate_keys:
        errors.append("Duplicate YAML keys detected in automations.yaml.")
    if script_duplicate_keys:
        errors.append("Duplicate YAML keys detected in scripts.yaml.")

    yaml_valid = not automation_errors and not script_errors
    backup_valid = not errors
    return {
        "backup_valid": backup_valid,
        "yaml_valid": yaml_valid,
        "automations_top_level_list": automations_is_list,
        "scripts_top_level_mapping": scripts_is_mapping,
        "automations": len(automation_items),
        "scripts": len(scripts) if scripts_is_mapping else 0,
        "missing_automation_ids": missing_automation_ids,
        "duplicate_automation_ids": duplicate_automation_ids,
        "duplicate_automation_aliases": duplicate_aliases,
        "duplicate_automation_yaml_keys": automation_duplicate_keys,
        "duplicate_script_keys": script_duplicate_keys,
        "errors": errors,
        "warnings": warnings,
    }
