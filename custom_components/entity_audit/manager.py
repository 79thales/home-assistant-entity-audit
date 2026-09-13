"""Audit storage and state-change tracking."""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

from homeassistant.const import EVENT_STATE_CHANGED, STATE_OFF, STATE_ON
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    DEFAULT_ACTIVITY_LOG_ENABLED,
    MAX_ACTIVITY_EVENTS,
    PROBLEM_STATES,
    STORAGE_KEY,
    STORAGE_VERSION,
)
from .network import find_ip_address, find_mac_address


class EntityAuditManager:
    """Track explicitly enabled entities and retain a bounded audit history."""

    def __init__(
        self,
        hass: HomeAssistant,
        retention_days: int,
        max_events: int,
        activity_log_enabled: bool | None,
        camera_wait_seconds: int,
        label_width: int,
        label_height: int,
        label_variant: str,
    ) -> None:
        self.hass = hass
        self.retention_days = retention_days
        self.max_events = max_events
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._enabled: set[str] = set()
        self._history: dict[str, list[dict[str, Any]]] = {}
        self._activity_enabled = DEFAULT_ACTIVITY_LOG_ENABLED
        self._configured_activity_log_enabled = activity_log_enabled
        self.camera_wait_seconds = camera_wait_seconds
        self.label_width = label_width
        self.label_height = label_height
        self.label_variant = label_variant
        self._activity: list[dict[str, str]] = []
        self._unsub = None

    async def async_start(self) -> None:
        """Load persisted data and begin listening."""
        data = await self._store.async_load() or {}
        self._enabled = set(data.get("enabled", []))
        self._history = data.get("history", {})
        stored_activity_enabled = bool(
            data.get("activity_enabled", DEFAULT_ACTIVITY_LOG_ENABLED)
        )
        self._activity_enabled = (
            stored_activity_enabled
            if self._configured_activity_log_enabled is None
            else self._configured_activity_log_enabled
        )
        self._activity = [
            record
            for record in data.get("activity", [])
            if isinstance(record, dict)
        ]
        self._prune_all()
        self._prune_activity()
        self._unsub = self.hass.bus.async_listen(EVENT_STATE_CHANGED, self._state_changed)

    async def async_stop(self) -> None:
        """Stop listening and persist immediately."""
        if self._unsub:
            self._unsub()
            self._unsub = None
        await self._store.async_save(self._data())

    @callback
    def _state_changed(self, event: Event) -> None:
        entity_id = event.data.get("entity_id")
        new_state = event.data.get("new_state")
        old_state = event.data.get("old_state")
        if entity_id not in self._enabled:
            return

        old_value = old_state.state if old_state else None
        new_value = new_state.state if new_state else "missing"
        problem_values = PROBLEM_STATES | {"missing"}
        if new_value in problem_values and old_value not in problem_values:
            event_type = "problem"
        elif old_value in problem_values and new_value not in problem_values:
            event_type = "recovered"
        else:
            event_type = "state_change"

        records = self._history.setdefault(entity_id, [])
        records.append(
            {
                "timestamp": (
                    new_state.last_updated.isoformat()
                    if new_state
                    else event.time_fired.isoformat()
                ),
                "type": event_type,
                "old_state": old_value,
                "new_state": new_value,
            }
        )
        self._prune(entity_id)
        self._store.async_delay_save(self._data, 2)

    @callback
    def set_logging(self, entity_id: str, enabled: bool) -> None:
        """Enable or disable future audit records for an entity."""
        if enabled:
            self._enabled.add(entity_id)
        else:
            self._enabled.discard(entity_id)
        self._store.async_delay_save(self._data, 1)

    @callback
    def set_logging_bulk(self, entity_ids: list[str], enabled: bool) -> None:
        """Enable or disable future audit records for multiple entities."""
        if enabled:
            self._enabled.update(entity_ids)
        else:
            self._enabled.difference_update(entity_ids)
        self._store.async_delay_save(self._data, 1)

    @callback
    def clear_history(self, entity_id: str) -> None:
        """Delete stored audit records for one entity."""
        self._history.pop(entity_id, None)
        self._store.async_delay_save(self._data, 1)

    @callback
    def get_activity(self, limit: int) -> dict[str, Any]:
        """Return newest action and error records with their local settings."""
        self._prune_activity()
        return {
            "enabled": self._activity_enabled,
            "retention_days": self.retention_days,
            "count": len(self._activity),
            "events": list(reversed(self._activity[-limit:])),
        }

    @callback
    def get_settings(self) -> dict[str, Any]:
        """Return administrator-configured panel settings."""
        return {
            "activity_log_enabled": self._activity_enabled,
            "retention_days": self.retention_days,
            "max_events_per_entity": self.max_events,
            "camera_wait_seconds": self.camera_wait_seconds,
            "label_width_mm": self.label_width,
            "label_height_mm": self.label_height,
            "label_variant": self.label_variant,
        }

    @callback
    def get_diagnostics(self) -> dict[str, Any]:
        """Return bounded local settings and action/error records."""
        return {
            "settings": self.get_settings(),
            "action_and_error_history": self.get_activity(MAX_ACTIVITY_EVENTS),
        }

    @callback
    def clear_activity(self) -> None:
        """Delete the locally stored action and error records."""
        self._activity = []
        self._store.async_delay_save(self._data, 1)

    @callback
    def log_activity(
        self, event_type: str, level: str = "info", detail: str | None = None
    ) -> None:
        """Store a bounded, non-sensitive panel action or error record."""
        if not self._activity_enabled:
            return
        record: dict[str, str] = {
            "timestamp": dt_util.utcnow().isoformat(),
            "type": event_type,
            "level": level,
        }
        if detail:
            record["detail"] = detail
        self._activity.append(record)
        self._prune_activity()
        self._store.async_delay_save(self._data, 2)

    @callback
    def get_history(self, entity_id: str, limit: int) -> list[dict[str, Any]]:
        """Return newest records first."""
        self._prune(entity_id)
        return list(reversed(self._history.get(entity_id, [])[-limit:]))

    @callback
    def get_entities(self) -> list[dict[str, Any]]:
        """Return registry and runtime entities, including registry-only entries."""
        registry = er.async_get(self.hass)
        device_registry = dr.async_get(self.hass)
        area_registry = ar.async_get(self.hass)
        registry_entries = {entry.entity_id: entry for entry in registry.entities.values()}
        entity_ids = set(registry_entries) | set(self.hass.states.async_entity_ids())
        config_entry_data: dict[str, Any] = {}
        result: list[dict[str, Any]] = []

        for entity_id in entity_ids:
            state = self.hass.states.get(entity_id)
            entry = registry_entries.get(entity_id)
            disabled = bool(entry and entry.disabled)
            if state:
                problem = state.state if state.state in PROBLEM_STATES else None
                name = state.attributes.get("friendly_name")
            else:
                problem = None if disabled else "missing"
                name = None
            if not name and entry:
                full_name = getattr(er, "async_get_full_entity_name", None)
                name = full_name(self.hass, entry) if full_name else None
                name = name or entry.name or entry.original_name

            device_id = entry.device_id if entry else None
            device = device_registry.async_get(device_id) if device_id else None
            entry_config_data = None
            config_entry_id = entry.config_entry_id if entry else None
            if config_entry_id:
                if config_entry_id not in config_entry_data:
                    config_entry = self.hass.config_entries.async_get_entry(
                        config_entry_id
                    )
                    config_entry_data[config_entry_id] = (
                        config_entry.data if config_entry else None
                    )
                entry_config_data = config_entry_data[config_entry_id]
            device_name = None
            if device:
                device_name = device.name_by_user or device.name or device.model or device.id

            area_id = entry.area_id if entry and entry.area_id else None
            parent_device_id = None
            if device:
                parent_device_id = getattr(
                    device, "parent_device_id", None
                ) or getattr(device, "via_device_id", None)
            parent_device = (
                device_registry.async_get(parent_device_id) if parent_device_id else None
            )
            hardware_device = parent_device or device
            if area_id is None and device:
                area_id = device.area_id or (
                    parent_device.area_id if parent_device else None
                )
            area = area_registry.async_get_area(area_id) if area_id else None

            result.append(
                {
                    "entity_id": entity_id,
                    "name": name or entity_id,
                    "domain": entity_id.partition(".")[0],
                    "platform": entry.platform if entry else None,
                    "device_id": device_id,
                    "device_name": device_name,
                    "manufacturer": (
                        getattr(hardware_device, "manufacturer", None)
                        if hardware_device
                        else None
                    ),
                    "model": (
                        getattr(hardware_device, "model", None)
                        if hardware_device
                        else None
                    ),
                    "area_id": area_id,
                    "area_name": area.name if area else None,
                    "ip_address": find_ip_address(
                        state.attributes if state else None,
                        getattr(device, "configuration_url", None) if device else None,
                        entry_config_data,
                    ),
                    "mac_address": find_mac_address(
                        getattr(device, "connections", None) if device else None
                    ),
                    "state": state.state if state else None,
                    "disabled": disabled,
                    "logging": entity_id in self._enabled,
                    "problem": problem,
                    "event_count": len(self._history.get(entity_id, [])),
                    "last_changed": state.last_changed.isoformat() if state else None,
                }
            )
        return sorted(result, key=lambda item: (item["name"].casefold(), item["entity_id"]))

    @callback
    def get_hacs_repositories(self) -> dict[str, Any]:
        """Return installed HACS repositories when HACS is available.

        HACS is optional, so this uses only the already-loaded HACS runtime data
        and never imports HACS or reads its private storage files.
        """
        hacs = self.hass.data.get("hacs")
        repositories = getattr(hacs, "repositories", None)
        if repositories is None:
            return {"available": False, "repositories": []}

        try:
            downloaded = repositories.list_downloaded
        except (AttributeError, TypeError):
            return {"available": False, "repositories": []}

        result: list[dict[str, Any]] = []
        for repository in downloaded:
            data = getattr(repository, "data", None)
            if data is None:
                continue
            category = getattr(data, "category", "unknown")
            category = str(getattr(category, "value", category))
            manifest = getattr(repository, "repository_manifest", None)
            title = (
                getattr(manifest, "name", None)
                or getattr(data, "manifest_name", None)
                or getattr(data, "domain", None)
                or getattr(data, "full_name", None)
                or "Unknown repository"
            )
            result.append(
                {
                    "name": str(title),
                    "repository": getattr(data, "full_name", None),
                    "category": category,
                    "domain": getattr(data, "domain", None),
                    "description": getattr(data, "description", None),
                    "installed_version": getattr(data, "installed_version", None)
                    or getattr(data, "installed_commit", None),
                    "available_version": getattr(data, "last_version", None)
                    or getattr(data, "selected_tag", None),
                    "update_available": bool(getattr(data, "new", False)),
                    "restart_required": bool(
                        getattr(repository, "pending_restart", False)
                    ),
                }
            )
        return {
            "available": True,
            "repositories": sorted(
                result,
                key=lambda item: (item["name"].casefold(), item["repository"] or ""),
            ),
        }

    async def async_get_users(self) -> list[dict[str, Any]]:
        """Return administrator-safe user role and group information.

        Passwords, access tokens, refresh tokens, credential data, and detailed
        auth-provider data are deliberately excluded.
        """
        users = await self.hass.auth.async_get_users()
        result: list[dict[str, Any]] = []
        for user in users:
            group_details = [
                {
                    "group": str(getattr(group, "name", None) or group.id),
                    "policy": getattr(group, "policy", {}),
                }
                for group in user.groups
            ]
            group_details.sort(key=lambda item: item["group"].casefold())
            groups = [item["group"] for item in group_details]
            if user.is_owner:
                role_key = "owner"
                role = "Owner"
                access = "Full access"
            elif user.is_admin:
                role_key = "administrator"
                role = "Administrator"
                access = "Full access"
            elif groups:
                role_key = "user"
                role = "User"
                access = "Custom group policy"
            else:
                role_key = "user"
                role = "User"
                access = "Standard user access"
            result.append(
                {
                    "name": str(user.name or "Unnamed user"),
                    "role_key": role_key,
                    "role": role,
                    "access": access,
                    "groups": groups,
                    "permission_policy": json.dumps(
                        group_details,
                        ensure_ascii=False,
                        sort_keys=True,
                        separators=(",", ":"),
                        default=str,
                    ),
                    "active": user.is_active,
                    "local_only": user.local_only,
                    "system_generated": user.system_generated,
                }
            )
        return sorted(result, key=lambda item: item["name"].casefold())

    @callback
    def get_automation_scripts(self) -> list[dict[str, Any]]:
        """Return the current Home Assistant automations and scripts.

        This is deliberately an inventory of runtime state plus public entity
        registry metadata.  Full configurations are requested by the panel
        through Home Assistant's administrator-only ``automation/config`` and
        ``script/config`` WebSocket commands when an administrator explicitly
        exports YAML.  Entity Audit therefore does not read configuration YAML
        or the UI automation storage files itself.
        """
        registry = er.async_get(self.hass)
        result: list[dict[str, Any]] = []

        for kind in ("automation", "script"):
            registry_ids = {
                entry.entity_id
                for entry in registry.entities.values()
                if entry.entity_id.partition(".")[0] == kind
            }
            entity_ids = registry_ids | set(self.hass.states.async_entity_ids(kind))
            for entity_id in entity_ids:
                state = self.hass.states.get(entity_id)
                entry = registry.async_get(entity_id)
                attributes = state.attributes if state else {}
                name = attributes.get("friendly_name") if state else None
                if not name and entry:
                    full_name = getattr(er, "async_get_full_entity_name", None)
                    name = full_name(self.hass, entry) if full_name else None
                    name = name or entry.name or entry.original_name

                last_triggered = attributes.get("last_triggered")
                if hasattr(last_triggered, "isoformat"):
                    last_triggered = last_triggered.isoformat()
                edit_id = attributes.get("id") or (
                    entry.unique_id if entry else None
                )
                if kind == "script" and not edit_id:
                    edit_id = entity_id.partition(".")[2]
                registry_disabled = bool(entry and entry.disabled)
                automation_enabled: bool | None = None
                status = state.state if state else "missing"
                if kind == "automation":
                    if registry_disabled:
                        status = "registry_disabled"
                        automation_enabled = False
                    elif state and state.state == STATE_ON:
                        status = "enabled"
                        automation_enabled = True
                    elif state and state.state == STATE_OFF:
                        status = "disabled"
                        automation_enabled = False
                result.append(
                    {
                        "entity_id": entity_id,
                        "name": str(name or entity_id),
                        "kind": kind,
                        "state": state.state if state else "missing",
                        "mode": attributes.get("mode"),
                        "current": attributes.get("current"),
                        "max": attributes.get("max"),
                        "last_triggered": last_triggered,
                        "unique_id": entry.unique_id if entry else None,
                        "edit_id": str(edit_id) if edit_id else None,
                        "disabled": registry_disabled,
                        "automation_enabled": automation_enabled,
                        "status": status,
                        "platform": entry.platform if entry else kind,
                    }
                )

        return sorted(
            result,
            key=lambda item: (item["kind"], item["name"].casefold(), item["entity_id"]),
        )

    def _data(self) -> dict[str, Any]:
        return {
            "enabled": sorted(self._enabled),
            "history": self._history,
            "activity_enabled": self._activity_enabled,
            "activity": self._activity,
        }

    def _prune_all(self) -> None:
        for entity_id in list(self._history):
            self._prune(entity_id)

    def _prune_activity(self) -> None:
        """Apply the normal audit retention period and a hard activity limit."""
        cutoff = dt_util.utcnow() - timedelta(days=self.retention_days)
        kept: list[dict[str, str]] = []
        for record in self._activity:
            timestamp = dt_util.parse_datetime(str(record.get("timestamp", "")))
            if timestamp is not None and timestamp >= cutoff:
                kept.append(record)
        self._activity = kept[-MAX_ACTIVITY_EVENTS:]

    def _prune(self, entity_id: str) -> None:
        cutoff = dt_util.utcnow() - timedelta(days=self.retention_days)
        records = self._history.get(entity_id, [])
        kept = []
        for record in records:
            timestamp = dt_util.parse_datetime(record.get("timestamp", ""))
            if timestamp is not None and timestamp >= cutoff:
                kept.append(record)
        self._history[entity_id] = kept[-self.max_events :]
        if not self._history[entity_id] and entity_id not in self._enabled:
            self._history.pop(entity_id, None)
