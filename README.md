<p align="center">
  <img src="brand/icon@2x.png" alt="Entity Audit icon" width="192">
</p>

# Entity Audit for Home Assistant

Entity Audit is a HACS-compatible custom integration that gives administrators one searchable view of all Home Assistant entities. Auditing is opt-in per entity: only selected state changes are stored by this integration.

## Features

- lists runtime entities and entries from the entity registry, including disabled and registry-only entries;
- searches by friendly name, device, manufacturer, model, area, IP or MAC address when Home Assistant provides one, `entity_id`, or source integration;
- groups entities by device, manufacturer (for example Shelly), model, integration, area, or entity domain;
- filters by device, manufacturer, model, integration, area, entity domain, problem, and audit status;
- enables or disables auditing in bulk for the currently filtered entities;
- exports the currently filtered entity list to a UTF-8 CSV file, including available IP and MAC addresses;
- creates a downloadable A4 PDF label sheet for the currently filtered devices with an IP address, deduplicated by IP address, including manufacturer, area, IP, and MAC address; set the label width and height in millimeters, then open, save, print, or share the generated PDF;
- offers text-only, text-with-QR, and QR-only label variants; QR payloads contain the complete label data and are generated locally in the browser;
- scans Entity Audit QR labels with the device camera or an existing photo, displays a virtual label, and matches it to the current inventory by MAC or IP address;
- opens the matched Home Assistant device page directly or filters the inventory to that device;
- opens the native Home Assistant entity detail by clicking its current state;
- uses Home Assistant's system app bar with native sidebar navigation and mobile safe-area handling;
- flags current `unavailable` and `unknown` states, plus active entity-registry entries that are missing from the runtime state machine;
- enables or disables audit logging separately for every entity;
- records state transitions, problem starts, and recoveries;
- shows a bounded per-entity timeline in an administrator-only sidebar panel;
- stores data locally in Home Assistant `.storage` with configurable retention and event limits;
- includes Czech and English configuration text and panel labels.

Entity Audit complements Home Assistant's built-in Recorder, History, and Activity features. Its opt-in timeline is stored independently and starts only after auditing is enabled for an entity; it does not query or backfill Recorder data. It is intended as a compact diagnostic audit, not a replacement for long-term statistics.

Device grouping uses the direct device assigned to an entity in the entity registry. For manufacturer and model metadata, a parent device takes precedence when one exists. The effective area is resolved in this order: entity override, direct device, then parent device. Entities without the selected metadata remain visible in an explicit fallback group.

## Installation for testing

1. Copy `custom_components/entity_audit` into the same path under your Home Assistant configuration directory.
2. Restart Home Assistant.
3. Go to **Settings → Devices & services → Add integration** and choose **Entity Audit**.
4. Open **Entity Audit** in the sidebar and enable auditing only for the entities you need.

## Installation through HACS

Until the repository is accepted into the HACS default catalog, add `https://github.com/79thales/home-assistant-entity-audit` under **HACS → Integrations → Custom repositories**, choose the **Integration** category, and install it.

## Storage and privacy

The default retention is 30 days and 500 events per entity. The enabled-entity list and audit history are stored locally in Home Assistant's `.storage/entity_audit.storage` file. Each audit record contains a timestamp, event category, and old/new state values; entity attributes are not stored in audit history. For the current inventory display only, an IP address may be shown when Home Assistant already supplies a literal IP in an entity attribute, a device configuration URL, or one of the common address fields (`ip_address`, `ip`, `host`, or `address`) in the integration's config entry. A MAC address may be shown when it exists in the device registry. No hostname lookup or network discovery is performed. The integration does not send inventory data to an external service.

QR labels are generated entirely in the browser with the bundled MIT-licensed `qrcode-generator` library. Scanning uses the bundled Apache-2.0-licensed `jsQR` decoder. Generation and decoding are local: label images and decoded label data are not sent to a QR-code service. Camera access is requested only when the administrator opens the scanner; a photo capture/file option is available when live camera access is unavailable.

Live camera access uses the browser media API. For dependable scanning on iPhone, access Home Assistant over HTTPS and allow Camera access for the Home Assistant Companion app in iOS Settings. The scanner always retains its photo capture and image-selection fallback.

Disabling auditing stops future recording without deleting existing history. Stored records remain subject to the configured age and per-entity limits and can also be deleted manually from the panel.

## Existing alternatives

- [Home Assistant Activity](https://www.home-assistant.io/integrations/logbook/) displays state changes from Recorder.
- [Watchman](https://github.com/dummylabs/thewatchman) finds missing or unavailable entities referenced by YAML configuration.
- [Entity Availability](https://github.com/italo-lombardi/Home-Assistant-EntityAvailability) focuses on availability history and group health.
- [Hass Diagnostics](https://github.com/AlexxIT/HassDiagnostics) exposes diagnostic sensors and a smart log.

Those projects overlap with parts of Entity Audit, but have a different focus and workflow.

## Publishing status

The repository includes local brand assets and automated HACS and Hassfest validation. Entity Audit has been submitted to the HACS default catalog in [hacs/default#10585](https://github.com/hacs/default/pull/10585). Until that pull request is accepted, install the integration as a HACS custom repository as described above.

## Development checks

```bash
python -m compileall custom_components/entity_audit
python -m json.tool custom_components/entity_audit/manifest.json
node --check custom_components/entity_audit/frontend/entity-audit-panel.js
node tests/test_qrcode.js
```

## License

MIT
