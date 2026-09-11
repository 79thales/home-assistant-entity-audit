"""Config flow for Entity Audit."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import (
    CONF_ACTIVITY_LOG_ENABLED,
    CONF_CAMERA_WAIT_SECONDS,
    CONF_CLEAR_ACTIVITY_HISTORY,
    CONF_LABEL_HEIGHT,
    CONF_LABEL_VARIANT,
    CONF_LABEL_WIDTH,
    CONF_MAX_EVENTS,
    CONF_RETENTION_DAYS,
    DEFAULT_ACTIVITY_LOG_ENABLED,
    DEFAULT_CAMERA_WAIT_SECONDS,
    DEFAULT_LABEL_HEIGHT,
    DEFAULT_LABEL_VARIANT,
    DEFAULT_LABEL_WIDTH,
    DEFAULT_MAX_EVENTS,
    DEFAULT_RETENTION_DAYS,
    DOMAIN,
)

class EntityAuditConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Configure Entity Audit."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Create the single integration entry."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Entity Audit", data=user_input)
        return self.async_show_form(step_id="user", data_schema=self._schema({}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return EntityAuditOptionsFlow()

    @staticmethod
    def _schema(values, include_clear_history: bool = False):
        schema = {
            vol.Required(
                CONF_RETENTION_DAYS,
                default=values.get(CONF_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
            ): vol.All(int, vol.Range(min=1, max=365)),
            vol.Required(
                CONF_MAX_EVENTS,
                default=values.get(CONF_MAX_EVENTS, DEFAULT_MAX_EVENTS),
            ): vol.All(int, vol.Range(min=10, max=5000)),
            vol.Required(
                CONF_ACTIVITY_LOG_ENABLED,
                default=values.get(
                    CONF_ACTIVITY_LOG_ENABLED, DEFAULT_ACTIVITY_LOG_ENABLED
                ),
            ): bool,
            vol.Required(
                CONF_CAMERA_WAIT_SECONDS,
                default=values.get(
                    CONF_CAMERA_WAIT_SECONDS, DEFAULT_CAMERA_WAIT_SECONDS
                ),
            ): vol.All(int, vol.Range(min=1, max=30)),
            vol.Required(
                CONF_LABEL_WIDTH,
                default=values.get(CONF_LABEL_WIDTH, DEFAULT_LABEL_WIDTH),
            ): vol.All(int, vol.Range(min=20, max=190)),
            vol.Required(
                CONF_LABEL_HEIGHT,
                default=values.get(CONF_LABEL_HEIGHT, DEFAULT_LABEL_HEIGHT),
            ): vol.All(int, vol.Range(min=20, max=280)),
            vol.Required(
                CONF_LABEL_VARIANT,
                default=values.get(CONF_LABEL_VARIANT, DEFAULT_LABEL_VARIANT),
            ): vol.In(["text", "text_qr", "qr"]),
        }
        if include_clear_history:
            schema[vol.Optional(CONF_CLEAR_ACTIVITY_HISTORY, default=False)] = bool
        return vol.Schema(schema)


class EntityAuditOptionsFlow(config_entries.OptionsFlow):
    """Update the integration settings."""

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            options = dict(user_input)
            if options.pop(CONF_CLEAR_ACTIVITY_HISTORY, False):
                manager = self.hass.data.get(DOMAIN, {}).get("manager")
                if manager:
                    manager.clear_activity()
            return self.async_create_entry(title="", data=options)
        values = {**self.config_entry.data, **self.config_entry.options}
        manager = self.hass.data.get(DOMAIN, {}).get("manager")
        if manager and CONF_ACTIVITY_LOG_ENABLED not in values:
            values[CONF_ACTIVITY_LOG_ENABLED] = manager.get_settings()[
                CONF_ACTIVITY_LOG_ENABLED
            ]
        return self.async_show_form(
            step_id="init",
            data_schema=EntityAuditConfigFlow._schema(
                values, include_clear_history=True
            ),
        )
