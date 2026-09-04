"""Entity Audit integration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import async_register_built_in_panel, async_remove_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import (
    CONF_MAX_EVENTS,
    CONF_RETENTION_DAYS,
    DEFAULT_MAX_EVENTS,
    DEFAULT_RETENTION_DAYS,
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_MODULE_URL,
    PANEL_URL,
)
from .manager import EntityAuditManager
from .websocket import async_register_websocket_commands


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload Entity Audit after its options change."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Entity Audit from a config entry."""
    values = {**entry.data, **entry.options}
    manager = EntityAuditManager(
        hass,
        values.get(CONF_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
        values.get(CONF_MAX_EVENTS, DEFAULT_MAX_EVENTS),
    )
    await manager.async_start()
    runtime = hass.data.setdefault(DOMAIN, {})
    runtime["manager"] = manager
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    if not runtime.get("api_registered"):
        frontend_path = Path(__file__).parent / "frontend"
        await hass.http.async_register_static_paths(
            [StaticPathConfig(PANEL_URL, str(frontend_path / "entity-audit-panel.js"), False)]
        )
        async_register_websocket_commands(hass)
        runtime["api_registered"] = True
    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title="Entity Audit",
        sidebar_icon="mdi:clipboard-text-clock-outline",
        frontend_url_path=DOMAIN,
        config={
            "_panel_custom": {
                "name": PANEL_ELEMENT,
                "embed_iframe": True,
                "trust_external": False,
                "js_url": PANEL_MODULE_URL,
            }
        },
        require_admin=True,
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Entity Audit."""
    runtime = hass.data[DOMAIN]
    manager: EntityAuditManager = runtime.pop("manager")
    await manager.async_stop()
    async_remove_panel(hass, DOMAIN)
    return True
