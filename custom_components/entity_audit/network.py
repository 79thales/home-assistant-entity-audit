"""Helpers for safe, display-only network metadata."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlparse


def _as_ip_address(value: object) -> str | None:
    """Return a normalized literal IP address, or ``None`` for other values."""
    if not isinstance(value, str):
        return None

    try:
        return str(ip_address(value.strip()))
    except ValueError:
        return None


def find_ip_address(
    attributes: Mapping[str, Any] | None, configuration_url: str | None
) -> str | None:
    """Return an IP address already supplied by Home Assistant, if available.

    No hostname lookup or network discovery is performed. The value is intended
    only for the current inventory response and is never written to audit history.
    """
    if attributes:
        for attribute in ("ip_address", "ip", "host"):
            if address := _as_ip_address(attributes.get(attribute)):
                return address

    if isinstance(configuration_url, str):
        return _as_ip_address(urlparse(configuration_url).hostname)

    return None


def find_mac_address(connections: Iterable[tuple[str, str]] | None) -> str | None:
    """Return the first normalized MAC address from device registry connections."""
    if not connections:
        return None

    mac_addresses = sorted(
        value
        for connection_type, value in connections
        if connection_type == "mac" and isinstance(value, str)
    )
    return mac_addresses[0] if mac_addresses else None
