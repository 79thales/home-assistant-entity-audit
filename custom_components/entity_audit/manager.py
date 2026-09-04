"""Audit storage and state-change tracking."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import PROBLEM_STATES, STORAGE_KEY, STORAGE_VERSION


class EntityAuditManager:
    """Track explicitly enabled entities and retain a bounded audit history."""

    def __init__(self, hass: HomeAssistant, retention_days: int, max_events: int) -> None:
        self.hass = hass
        self.retention_days = retention_days
        self.max_events = max_events
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._enabled: set[str] = set()
        self._history: dict[str, list[dict[str, Any]]] = {}
        self._unsub = None

    async def async_start(self) -> None:
        """Load persisted data and begin listening."""
        data = await self._store.async_load() or {}
        self._enabled = set(data.get("enabled", []))
        self._history = data.get("history", {})
        self._prune_all()
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
            device_name = None
            if device:
                device_name = device.name_by_user or device.name or device.model or device.id

            area_id = entry.area_id if entry and entry.area_id else None
            parent_device_id = getattr(device, "parent_device_id", None) if device else None
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
                    "state": state.state if state else None,
                    "disabled": disabled,
                    "logging": entity_id in self._enabled,
                    "problem": problem,
                    "event_count": len(self._history.get(entity_id, [])),
                    "last_changed": state.last_changed.isoformat() if state else None,
                }
            )
        return sorted(result, key=lambda item: (item["name"].casefold(), item["entity_id"]))

    def _data(self) -> dict[str, Any]:
        return {"enabled": sorted(self._enabled), "history": self._history}

    def _prune_all(self) -> None:
        for entity_id in list(self._history):
            self._prune(entity_id)

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
