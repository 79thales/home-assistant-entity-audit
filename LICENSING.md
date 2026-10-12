# Licenční audit – home-assistant-entity-audit

Audit dne 2026-10-12, výchozí commit `a806821601f949c95d8cb34243acb4eaae7fc843`, změna 0.3.28 → 0.3.29.

## Autorství a rozsah

Kontrola všech lokálně stažených větví a tagů (`git shortlog -sne --all`, autorů a committerů) a GitHub contributors našla pouze Jiřího Dvořáka / 79thales; e-mailové varianty se liší velikostí písmen. GitHub je pouze committer webových změn, nikoli další autor. Kontrola hlaviček a odkazů ve zdrojích neodhalila dalšího uvedeného autora vlastního kódu.

Kontrolovány byly LICENSE, README, changelog, manifest, HACS metadata, balicí skripty, workflows, případná Python/JS metadata, zdrojové hlavičky, frontend a evidence brand PNG v historii. Nebyly nalezeny vložené fonty ani další knihovny mimo níže uvedené. Brand soubory mají v dostupné historii autora projektu a nemají zvláštní oznámení cizí licence. Samotná historie nemůže doložit původ mimo repozitář; nebyla nalezena konkrétní indicie nejasného vlastnictví významné části.

## Cizí obsah a závislosti

Vložené `frontend/qrcode.js` (qrcode-generator, MIT, Kazuhiko Arase) a `frontend/jsQR.js` (jsQR, Apache-2.0) zůstávají beze změny včetně `QRCODE-LICENSE.txt` a `JSQR-LICENSE.txt`. Licence jsou kompatibilní s GPLv3; přelicencování vlastního projektu nemění jejich autorství.

Manifest neuvádí žádné samostatně instalované Python balíčky. Importy z Home Assistantu, jeho prostředí a standardní knihovny nemění licence těchto závislostí. Python balíčky se do ZIPu nevkládají.

Kompatibilita MIT/Expat, BSD-3-Clause a Apache-2.0 s GPLv3 byla ověřena v [přehledu GNU](https://www.gnu.org/licenses/license-list.html). Nebyla nalezena licenční překážka přechodu vlastního projektu.

## Nová distribuce

Kořenový i instalační LICENSE obsahují nezměněný [oficiální text GPLv3](https://www.gnu.org/licenses/gpl-3.0.txt). Volbu **GPL-3.0-only** a copyright stanoví README a NOTICE.txt; příklady v závěru oficiálního textu licence tuto volbu nenahrazují. NOTICE.txt uvádí i zdroj konkrétního tagu. Existující balicí skripty automaticky zahrnou oba soubory z adresáře integrace.

Staré commity, tagy, release, jejich instalační soubory a původní licence se nemění. Provozní logika, API, entity a dashboardy se neupravují. Do manifestu ani hacs.json se nepřidává pole licence. Projekt nemá zavedené plošné SPDX hlavičky; nové se nevkládají.
