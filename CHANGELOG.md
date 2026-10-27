# Changelog

## 0.3.33 – 2026-10-27

### English

- Removes the TRONIC 30 × 14 mm PDF preset and its panel controls. Existing A4 and Brother label options remain available.
- Separates audit, export and label actions from filters, making them available on mobile while filters are closed. Brother printer controls are grouped in a separate expandable section.
- Preserves expanded action and printer sections when the panel refreshes its display. No audit records, entity settings or saved label templates are removed.

### Čeština

- Odstraňuje formát PDF pro štítky TRONIC 30 × 14 mm a jeho ovládání. Štítky A4 a možnosti tiskáren Brother zůstávají dostupné.
- Odděluje audit, export a štítky od filtrů, takže jsou na mobilu dostupné i při zavřených filtrech. Volby tiskárny Brother sdružuje do samostatné rozbalovací části.
- Při překreslení panelu zachovává rozbalenou nabídku akcí a tiskárny. Auditní záznamy, nastavení entit a uložené šablony štítků nemaže.

## 0.3.32 – 2026-10-27

### English

- Fixes VC-500W replies containing a NUL separator, firmware model name Wedge and nominal CZ roll widths. A real printer accepted and physically printed a test label; physical cut length and other firmware variants remain unverified.
- Adds per-entity and per-device direct printing with a label editor, editable title, printer and media choices, preview for VC-500W and confirmation before submission.
- Adds two labels across a single 50 mm VC-500W roll, with a gap for manual separation and a single print submission. Verify actual size, legibility and QR scanning on your printer before regular use.
- Adds up to 50 named label-layout templates stored in Home Assistant and available to administrators across devices, plus entity-label QR scanning.
- Compacts mobile filter and print controls and improves use of available label space. Printing never retries automatically after an uncertain response.

### Čeština

- Opravuje načítání odpovědi VC-500W s nulovým oddělovačem, označením Wedge a šířkou CZ role v palcích. Jedna skutečná tiskárna přijala a vytiskla zkušební štítek; přesná délka odstřihu a jiné verze firmwaru nejsou ověřeny.
- Přidává tisk entity nebo zařízení, úpravu názvu, výběr tiskárny a role, náhled VC-500W a potvrzení před odesláním.
- Umožňuje umístit dva štítky vedle sebe na 50mm pásku VC-500W s mezerou pro ruční rozstřižení a jedním tiskovým požadavkem. Skutečnou velikost, čitelnost a skenování QR ověřte na své tiskárně.
- Přidává až 50 pojmenovaných šablon rozložení uložených v Home Assistantu pro administrátory a čtení QR štítků entit.
- Zpřehledňuje mobilní nabídku a využití plochy štítku. Při nejistém výsledku se tisk automaticky neopakuje.

## 0.3.31 – 2026-10-25

### English

- Fixes setup and options forms introduced in v0.3.30. A custom printer-address validator could not be serialized by Home Assistant, preventing the form from opening and leaving a setup flow in progress.
- Validates printer addresses after submission and shows field-specific errors while preserving entered values. Optional unused printer addresses can remain empty.
- Prevents invalid submissions from clearing activity history or saving options.
- Adds regression coverage for real form-schema serialization, initial setup, options, invalid addresses, and empty addresses. The real Home Assistant compatibility check now also serializes both forms.

## 0.3.30 – 2026-10-24

### English

- Adds Brother QL-820NWB DK and VC-500W CZ label profiles, with exact-size PDF pages and selectable cut lengths for continuous rolls.
- Adds direct network label printing from the Home Assistant panel, including iOS. Configure each printer's IP address or hostname in the integration options, then select its loaded roll before printing.
- Checks printer identity and loaded media before submitting data. Processes batches sequentially, supports stopping after the current label, and avoids automatic retries after interrupted or uncertain submissions.
- Distinguishes printer-reported completion from data acceptance. VC-500W acceptance does not claim that a physical print or cut has completed.
- Adds bounded timeouts, in-memory request deduplication, administrator-only print commands, and redaction of printer addresses from diagnostics. Label images are not persisted by the printing service.
- Adds regression tests using simulated printer peers. Physical output, feeding and cutting still require an initial test on the actual printers.
- Updates HACS installation documentation following the merge of submission #10585 and allows English-only release notes while preserving historical releases.

## 0.3.29 – 2026-10-12

### Čeština

- Licence projektu změněna z MIT na GNU GPL v3.0 (GPL-3.0-only). Dříve vydané verze zůstávají dostupné pod licencí, pod kterou byly původně zveřejněny.
- Plný text licence a oznámení jsou také součástí instalačního ZIPu HACS.

### English

- Changed project license from MIT to GNU GPL v3.0 (GPL-3.0-only). Previously released versions remain available under the license under which they were originally published.
- The full license text and notices are also included in the HACS installer ZIP.

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
