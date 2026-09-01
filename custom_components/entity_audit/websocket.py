"""WebSocket API for the Entity Audit panel."""

from __future__ import annotations

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .manager import EntityAuditManager


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register panel commands."""
    websocket_api.async_register_command(hass, ws_list_entities)
    websocket_api.async_register_command(hass, ws_get_history)
    websocket_api.async_register_command(hass, ws_set_logging)
    websocket_api.async_register_command(hass, ws_set_logging_bulk)
    websocket_api.async_register_command(hass, ws_clear_history)


def _manager(hass: HomeAssistant) -> EntityAuditManager:
    """Return the currently loaded manager."""
    return hass.data[DOMAIN]["manager"]


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list_entities"})
@websocket_api.async_response
async def ws_list_entities(hass, connection, msg) -> None:
    """List all known entities."""
    connection.send_result(msg["id"], _manager(hass).get_entities())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/get_history",
        vol.Required("entity_id"): str,
        vol.Optional("limit", default=200): vol.All(int, vol.Range(min=1, max=500)),
    }
)
@websocket_api.async_response
async def ws_get_history(hass, connection, msg) -> None:
    """Return an entity's audit history."""
    connection.send_result(
        msg["id"], _manager(hass).get_history(msg["entity_id"], msg["limit"])
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/set_logging",
        vol.Required("entity_id"): str,
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def ws_set_logging(hass, connection, msg) -> None:
    """Toggle auditing for an entity."""
    _manager(hass).set_logging(msg["entity_id"], msg["enabled"])
    connection.send_result(msg["id"], {"success": True})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/set_logging_bulk",
        vol.Required("entity_ids"): vol.All([str], vol.Length(min=1, max=10000)),
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def ws_set_logging_bulk(hass, connection, msg) -> None:
    """Toggle auditing for multiple entities."""
    entity_ids = list(dict.fromkeys(msg["entity_ids"]))
    _manager(hass).set_logging_bulk(entity_ids, msg["enabled"])
    connection.send_result(msg["id"], {"success": True, "count": len(entity_ids)})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/clear_history",
        vol.Required("entity_id"): str,
    }
)
@websocket_api.async_response
async def ws_clear_history(hass, connection, msg) -> None:
    """Clear an entity's records."""
    _manager(hass).clear_history(msg["entity_id"])
    connection.send_result(msg["id"], {"success": True})
