"""Config flow for Entity Audit."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import (
    CONF_MAX_EVENTS,
    CONF_RETENTION_DAYS,
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
    def _schema(values):
        return vol.Schema(
            {
                vol.Required(
                    CONF_RETENTION_DAYS,
                    default=values.get(CONF_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
                ): vol.All(int, vol.Range(min=1, max=365)),
                vol.Required(
                    CONF_MAX_EVENTS,
                    default=values.get(CONF_MAX_EVENTS, DEFAULT_MAX_EVENTS),
                ): vol.All(int, vol.Range(min=10, max=5000)),
            }
        )


class EntityAuditOptionsFlow(config_entries.OptionsFlowWithReload):
    """Update retention settings."""

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)
        values = {**self.config_entry.data, **self.config_entry.options}
        return self.async_show_form(
            step_id="init", data_schema=EntityAuditConfigFlow._schema(values)
        )
