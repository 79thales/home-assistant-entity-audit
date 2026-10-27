"""WebSocket API for the Entity Audit panel."""

from __future__ import annotations

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .backup import validate_configuration_snapshot
from .const import ACTIVITY_EVENT_TYPES, DOMAIN
from .manager import EntityAuditManager
from .printing import PrintError, PrintService, prepare_label


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register panel commands."""
    websocket_api.async_register_command(hass, ws_list_entities)
    websocket_api.async_register_command(hass, ws_get_history)
    websocket_api.async_register_command(hass, ws_set_logging)
    websocket_api.async_register_command(hass, ws_set_logging_bulk)
    websocket_api.async_register_command(hass, ws_clear_history)
    websocket_api.async_register_command(hass, ws_list_hacs_repositories)
    websocket_api.async_register_command(hass, ws_list_users)
    websocket_api.async_register_command(hass, ws_list_automation_scripts)
    websocket_api.async_register_command(hass, ws_validate_configuration_export)
    websocket_api.async_register_command(hass, ws_get_settings)
    websocket_api.async_register_command(hass, ws_log_activity)
    websocket_api.async_register_command(hass, ws_print_label)
    websocket_api.async_register_command(hass, ws_list_label_templates)
    websocket_api.async_register_command(hass, ws_save_label_template)
    websocket_api.async_register_command(hass, ws_delete_label_template)


def _manager(hass: HomeAssistant) -> EntityAuditManager:
    """Return the currently loaded manager."""
    return hass.data[DOMAIN]["manager"]


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list_label_templates"})
@websocket_api.async_response
async def ws_list_label_templates(hass, connection, msg):
    """Vrať pojmenované šablony pouze přihlášenému administrátorovi."""
    connection.send_result(msg["id"], hass.data[DOMAIN]["label_templates"].list())


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/save_label_template",
    vol.Required("template"): {
        vol.Required("name"): str, vol.Required("model"): str,
        vol.Required("roll"): str, vol.Required("length_mm"): int,
        vol.Required("variant"): str,
    },
    vol.Optional("template_id"): str,
})
@websocket_api.async_response
async def ws_save_label_template(hass, connection, msg):
    """Ulož ověřené rozměry a rozložení; obsah štítku se neukládá."""
    try:
        result = await hass.data[DOMAIN]["label_templates"].save(msg["template"], msg.get("template_id"))
    except ValueError as error:
        connection.send_error(msg["id"], "invalid_template", str(error))
        return
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/delete_label_template",
    vol.Required("template_id"): str,
})
@websocket_api.async_response
async def ws_delete_label_template(hass, connection, msg):
    """Smaž konkrétní šablonu po výslovné akci v editoru."""
    try:
        await hass.data[DOMAIN]["label_templates"].delete(msg["template_id"])
    except ValueError as error:
        connection.send_error(msg["id"], "invalid_template", str(error))
        return
    connection.send_result(msg["id"], {"success": True})


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


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/list_hacs_repositories"}
)
@websocket_api.async_response
async def ws_list_hacs_repositories(hass, connection, msg) -> None:
    """List installed repositories tracked by HACS when it is available."""
    connection.send_result(msg["id"], _manager(hass).get_hacs_repositories())


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list_users"})
@websocket_api.async_response
async def ws_list_users(hass, connection, msg) -> None:
    """List Home Assistant users without authentication secrets."""
    connection.send_result(msg["id"], await _manager(hass).async_get_users())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/list_automation_scripts"}
)
@websocket_api.async_response
async def ws_list_automation_scripts(hass, connection, msg) -> None:
    """List current automation and script entities."""
    connection.send_result(msg["id"], _manager(hass).get_automation_scripts())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/validate_configuration_export",
        vol.Required("automations_yaml"): vol.All(str, vol.Length(max=10_000_000)),
        vol.Required("scripts_yaml"): vol.All(str, vol.Length(max=10_000_000)),
    }
)
@websocket_api.async_response
async def ws_validate_configuration_export(hass, connection, msg) -> None:
    """Validate generated YAML without changing Home Assistant configuration."""
    result = await hass.async_add_executor_job(
        validate_configuration_snapshot,
        msg["automations_yaml"],
        msg["scripts_yaml"],
    )
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get_settings"})
@websocket_api.async_response
async def ws_get_settings(hass, connection, msg) -> None:
    """Return administrator-configured panel settings."""
    settings = _manager(hass).get_settings()
    settings["brother_printers"] = hass.data[DOMAIN]["printing"].configured()
    connection.send_result(msg["id"], settings)


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/print_label",
    vol.Required("request_id"): vol.All(str, vol.Length(min=16, max=96), vol.Match(r"^[A-Za-z0-9:_-]+$")),
    vol.Required("model"): vol.In(["ql820nwb", "vc500w"]),
    vol.Required("roll"): vol.All(str, vol.Length(max=24)),
    vol.Required("length_mm"): vol.All(int, vol.Range(min=29, max=300)),
    vol.Required("image"): vol.All(str, vol.Length(min=1, max=2_700_000)),
})
@websocket_api.async_response
async def ws_print_label(hass: HomeAssistant, connection, msg) -> None:
    """Print one image to a configured printer, never to an arbitrary endpoint.

    Bitmap validation and QL encoding run in the HA executor; network reads and
    writes are asynchronous. Responses distinguish acceptance from completion
    and from an uncertain outcome. Activity records contain no label contents.
    """
    service: PrintService = hass.data[DOMAIN]["printing"]
    try:
        label = await hass.async_add_executor_job(
            prepare_label, msg["model"], msg["roll"], msg["length_mm"], msg["image"]
        )
        result = await service.submit(msg["request_id"], label)
    except PrintError as error:
        _manager(hass).log_activity("labels_network_failed", "error", msg["model"])
        connection.send_error(msg["id"], "print_failed", str(error))
        return
    event = {
        "completed": "labels_network_completed", "accepted": "labels_network_accepted",
    }.get(result["state"], "labels_network_failed")
    _manager(hass).log_activity(event, "info" if result["state"] in ("accepted", "completed") else "error", msg["model"])
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/log_activity",
        vol.Required("event_type"): vol.In(ACTIVITY_EVENT_TYPES),
        vol.Optional("level", default="info"): vol.In(["info", "error"]),
        vol.Optional("detail"): vol.All(str, vol.Length(min=1, max=240)),
    }
)
@websocket_api.async_response
async def ws_log_activity(hass, connection, msg) -> None:
    """Append one non-sensitive panel activity record."""
    _manager(hass).log_activity(
        msg["event_type"], msg["level"], msg.get("detail")
    )
    connection.send_result(msg["id"], {"success": True})
