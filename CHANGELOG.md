# Changelog

## 0.3.26 – 2026-10-07

### Čeština

- Instalační příloha `entity_audit.zip` pro HACS a odznaky celkových stažení i posledního vydání v README. Počítání začíná touto verzí a zahrnuje stažení balíčku a aktualizace, nikoli unikátní uživatele.
- ZIP obsahuje verzované soubory integrace včetně panelu, QR knihoven, jejich licencí, překladů a ikon. Neobsahuje místní exporty, auditní historii ani konfiguraci Home Assistantu.
- Automatické balíčkování nejdříve vytvoří koncept release s ověřeným ZIPem a českými i anglickými poznámkami. Zveřejněné přílohy nepřepisuje, aby zachoval jejich počítadla. Horní počet v HACS patří vybranému vydání; starší stažení, zdrojové archivy a instalace výchozí větve se nezapočítávají.
- Bez změn auditní logiky, entit, exportních formátů, oprávnění nebo uložených dat; bez nové telemetrie. Verze cache panelu je synchronizovaná s číslem vydání. Starší verze zůstávají instalovatelné původním způsobem.

### English

- A HACS installer asset, `entity_audit.zip`, and README badges for total and latest-release installer downloads. Counting starts with this version and includes downloads and updates, not unique users.
- The ZIP contains committed integration files, including the panel, QR libraries, their licenses, translations and icons. It does not contain local exports, audit history or Home Assistant configuration.
- The packaging workflow first creates a draft with a verified installer and Czech/English release notes. It never overwrites published assets, preserving their download counters. HACS's indicator covers the selected release; earlier downloads, source-code archives and default-branch installations are excluded.
- No changes to auditing behavior, entities, export formats, permissions or retained data, and no added telemetry. The panel cache version is synchronized with the release version. Older releases retain their original installation method.
