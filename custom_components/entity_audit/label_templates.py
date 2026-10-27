"""Pojmenované šablony štítků sdílené mezi administrátorskými klienty.

Úložiště je oddělené od historie auditu. Ukládá pouze rozměr, typ tiskárny,
roli a rozložení; neukládá síťové adresy ani obsah jednotlivých štítků.
Zápis je atomický prostřednictvím HA Store a serializovaný zámkem. Po
restartu HA se načte poslední úspěšně uložený stav; při chybě zápisu se
změna neprohlásí za úspěšnou. Přístup kontroluje administrátorský WebSocket.
"""

from __future__ import annotations

import asyncio
import uuid

from homeassistant.helpers.storage import Store

from .printing import QL_ROLLS, VC_ROLLS

MAX_TEMPLATES = 50


def validate_template(data: dict) -> dict:
    """Ověř a normalizuj šablonu; délka je celočíselná hodnota v mm."""
    if not isinstance(data, dict):
        raise ValueError("Neplatná šablona.")
    name = data.get("name")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
        raise ValueError("Název musí mít 1 až 80 znaků.")
    model, roll, variant = data.get("model"), data.get("roll"), data.get("variant")
    length = data.get("length_mm")
    if model not in ("vc500w", "ql820nwb") or variant not in ("text", "text_qr", "qr"):
        raise ValueError("Neplatná tiskárna nebo rozložení.")
    rolls = VC_ROLLS if model == "vc500w" else QL_ROLLS
    if roll not in rolls or isinstance(length, bool) or not isinstance(length, int) or not 29 <= length <= 300:
        raise ValueError("Neplatná role nebo délka.")
    fixed = rolls[roll][1] if model == "ql820nwb" else 0
    if (fixed and length != fixed) or (not fixed and length < 30):
        raise ValueError("Délka neodpovídá vybrané roli.")
    width = rolls[roll][0] if model == "ql820nwb" else rolls[roll]
    if width < 25 and variant != "text":
        raise ValueError("Úzká role podporuje pouze text.")
    return {"name": name.strip(), "model": model, "roll": roll, "length_mm": length, "variant": variant}


class LabelTemplates:
    """Zachovej změny napříč restarty a souběžné zápisy vyřiď postupně."""

    def __init__(self, hass):
        self._store = Store(hass, 1, "entity_audit.label_templates")
        self._lock = asyncio.Lock()
        self._items: list[dict] = []

    async def async_load(self):
        """Načti seznam; poškozený záznam nesmí poškodit ostatní šablony."""
        saved = await self._store.async_load()
        if saved is None:
            return
        if not isinstance(saved, dict) or not isinstance(saved.get("templates"), list):
            raise ValueError("Úložiště šablon má neplatný formát.")
        items = []
        for item in saved["templates"][:MAX_TEMPLATES]:
            try:
                entry = validate_template(item)
                entry["id"] = str(uuid.UUID(item["id"]))
                items.append(entry)
            except (ValueError, KeyError, TypeError):
                continue
        self._items = items

    def list(self):
        """Vrať kopie, aby klient nemohl měnit interní stav."""
        return [dict(item) for item in self._items]

    async def save(self, data, template_id=None):
        """Vytvoř nebo přepiš šablonu; chybný zápis ponechá původní stav."""
        clean = validate_template(data)
        async with self._lock:
            items = self.list()
            if template_id is None:
                if len(items) >= MAX_TEMPLATES:
                    raise ValueError("Je dosažen limit 50 šablon.")
                clean["id"] = str(uuid.uuid4())
                items.append(clean)
            else:
                try:
                    index = next(i for i, item in enumerate(items) if item["id"] == template_id)
                except StopIteration:
                    raise ValueError("Šablona již neexistuje.") from None
                clean["id"] = template_id
                items[index] = clean
            await self._store.async_save({"templates": items})
            self._items = items
            return dict(clean)

    async def delete(self, template_id):
        """Smaž jednu existující šablonu, nikoli historii ani tiskové úlohy."""
        async with self._lock:
            items = [item for item in self._items if item["id"] != template_id]
            if len(items) == len(self._items):
                raise ValueError("Šablona již neexistuje.")
            await self._store.async_save({"templates": items})
            self._items = items
