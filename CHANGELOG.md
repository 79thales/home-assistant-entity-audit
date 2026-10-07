# Changelog

## 0.3.28 – 2026-10-07

### Čeština

- Jednotné odznaky Home Assistant, HACS, Release, Downloads total, Downloads latest a Validation jsou nyní součástí vydaného tagu, nejen hlavní větve.
- Absolutní odkazy na loga a jednotná šířka 180 px pro správné zobrazení README v HACS.
- HACS zobrazuje dokumentaci nainstalované verze. Pro nový vzhled aktualizujte integraci na toto vydání; samotné obnovení cache staré README nezmění.
- Regresní kontrola úplné hlavičky README v release CI a kontrola kompatibility s přesně zjištěnou nejnovější stabilní verzí Home Assistantu. Výslovně zapnuté render_readme v HACS a synchronizovaná verze cache panelu.
- Bez změn funkční logiky, ID entit, nastavení nebo uložených dat. Staré tagy a ZIPy zůstávají zachované včetně počtů stažení.

### English

- The unified Home Assistant, HACS, Release, Downloads total, Downloads latest and Validation badges are now included in the release tag, not only the default branch.
- Absolute logo URLs and a consistent 180 px width fix README rendering in HACS.
- HACS displays documentation for the installed version. Update to this release to see the new header; refreshing the cache alone does not change an older release's README.
- Added a release CI regression for the complete README header and a compatibility check against the exact latest stable Home Assistant version. Explicitly enabled render_readme in HACS and synchronized the panel cache version.
- No changes to functional behavior, entity IDs, configuration or retained data. Existing tags and ZIP assets remain intact, preserving their download counts.

## 0.3.27 – 2026-10-07

### Čeština

- Instalační příloha `entity_audit.zip` pro HACS a odznaky celkových stažení i posledního vydání v README. Počítání začíná touto verzí a zahrnuje stažení balíčku a aktualizace, nikoli unikátní uživatele.
- ZIP obsahuje verzované soubory integrace včetně panelu, QR knihoven, jejich licencí, překladů a ikon. Neobsahuje místní exporty, auditní historii ani konfiguraci Home Assistantu.
- Automatické balíčkování nejdříve vytvoří koncept release s ověřeným ZIPem a českými i anglickými poznámkami. Zveřejněné přílohy nepřepisuje, aby zachoval jejich počítadla. Horní počet v HACS patří vybranému vydání; starší stažení, zdrojové archivy a instalace výchozí větve se nezapočítávají.
- Bez změn auditní logiky, entit, exportních formátů, oprávnění nebo uložených dat; bez nové telemetrie. Verze cache panelu je synchronizovaná s číslem vydání. Starší verze zůstávají instalovatelné původním způsobem.
- Balíčkovací workflow výslovně instaluje PyYAML pro stávající testy validace záloh; závislosti samotné integrace zůstávají beze změny. Přípravný tag v0.3.26 nebyl vydán a není přepisován.

### English

- A HACS installer asset, `entity_audit.zip`, and README badges for total and latest-release installer downloads. Counting starts with this version and includes downloads and updates, not unique users.
- The ZIP contains committed integration files, including the panel, QR libraries, their licenses, translations and icons. It does not contain local exports, audit history or Home Assistant configuration.
- The packaging workflow first creates a draft with a verified installer and Czech/English release notes. It never overwrites published assets, preserving their download counters. HACS's indicator covers the selected release; earlier downloads, source-code archives and default-branch installations are excluded.
- No changes to auditing behavior, entities, export formats, permissions or retained data, and no added telemetry. The panel cache version is synchronized with the release version. Older releases retain their original installation method.
- The packaging workflow explicitly installs PyYAML for the existing backup-validation tests; integration dependencies remain unchanged. The preparatory v0.3.26 tag was not released and is not rewritten.
