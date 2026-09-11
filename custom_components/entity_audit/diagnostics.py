"""Diagnostics support for Entity Audit."""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN


TO_REDACT = {
    "access_token",
    "api_key",
    "authorization",
    "cookie",
    "cookies",
    "password",
    "session_id",
    "token",
}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    """Return local configuration and bounded action/error history."""
    manager = hass.data[DOMAIN]["manager"]
    return async_redact_data(
        {
            "config_entry": entry.as_dict(),
            "entity_audit": manager.get_diagnostics(),
        },
        TO_REDACT,
    )
