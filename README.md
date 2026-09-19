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
- adds separate HACS repositories and users & permissions categories, each with independent filters and a UTF-8 CSV export;
- adds separate Automations and Scripts categories with runtime status and state filters; item names open their native Home Assistant editor;
- exports the currently filtered automation or script inventory as UTF-8 CSV or sanitized YAML; automation exports identify the current enabled, disabled, unavailable, or registry-disabled status;
- exports a safe `configuration.yaml` include snippet separately and can create a read-only configuration-backup ZIP with validated `automations.yaml` and `scripts.yaml`, machine-readable automation states, dependency diagnostics, and runtime inventories;
- creates a downloadable A4 PDF label sheet for the currently filtered devices with an IP address, deduplicated by IP address, including manufacturer, area, IP, and MAC address; configure the label dimensions and variant in the integration settings, then open, save, print, or share the generated PDF;
- provides a TRONIC/Lidl 30 × 14 mm label PDF preset, with one compact page per device for the matching 14 × 30 mm roll; it includes the device name, IP address, MAC address, and area, and can be opened, saved, or shared to the printer app;
- offers text-only, text-with-QR, and QR-only label variants; QR payloads contain the complete label data and are generated locally in the browser;
- scans Entity Audit QR labels with the device camera or an existing photo/file, displays a virtual label, and matches it to the current inventory by MAC or IP address; live-camera startup waits up to an editable 5-second default before offering the photo/file fallback;
- opens the matched Home Assistant device page directly or filters the inventory to that device;
- opens the native Home Assistant entity detail by clicking its current state;
- keeps an optional local action and error history for panel actions, exports, label generation, and QR scanner diagnostics; manage it and download it from the integration page;
- uses Home Assistant's system app bar with native sidebar navigation and mobile safe-area handling;
- flags current `unavailable` and `unknown` states, plus active entity-registry entries that are missing from the runtime state machine;
- enables or disables audit logging separately for every entity;
- records state transitions, problem starts, and recoveries;
- shows a bounded per-entity timeline in an administrator-only sidebar panel;
- stores data locally in Home Assistant `.storage` with configurable retention and event limits;
- uses English-only integration configuration and panel labels.

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

The action and error history is enabled by default and is also stored locally. It uses the same configurable age retention as entity auditing and keeps at most 1,000 records. Each record contains a timestamp, a fixed action/error type, a severity, and—where useful—an entity ID, device ID, count, browser error name, or non-identifying camera-environment flags (protocol, secure-context/API availability, and visibility). It does not retain state attributes, QR payloads, photos, camera video, server address, IP or MAC addresses, tokens, or credentials.

The optional HACS category reads only the installed repository list that HACS has already loaded in memory; it does not import HACS, access its storage, or expose its GitHub token. The administrator-only users & permissions category and its CSV export include user name, account status, owner/administrator role, access summary, group membership, and the associated Home Assistant group policy. They never include passwords, authentication credentials, access tokens, refresh tokens, or detailed auth-provider data.

The administrator-only Automations and Scripts categories list current runtime state and entity-registry metadata. Clicking an item name opens its native Home Assistant editor when Home Assistant provides an editor ID; registry-only entries fall back to the entity detail dialog. Automation CSV exports include a point-in-time enabled/disabled status. YAML exports explicitly request the displayed items through Home Assistant's own administrator-only `automation/config` and `script/config` WebSocket commands. Entity Audit does not read `configuration.yaml`, included YAML files, or Home Assistant's private automation storage. Before configuration is exported, values under sensitive keys such as `password`, `token`, `secret`, `api_key`, `authorization`, `cookie`, `session`, `credential`, `oauth`, or `webhook_id` are replaced with `<REDACTED>`. Obvious credential-bearing strings such as Basic/Bearer headers, private-key blocks, webhook URLs, and URL credentials are also redacted. Review an export before using it as configuration or sharing it.

## Configuration backup export

**Export configuration backup (ZIP)** creates one administrator-only, read-only snapshot. It refreshes the runtime inventory and then produces a stable, UTF-8 ZIP layout such as:

```text
entity-audit-backup-YYYY-MM-DD_HH-MM/
├── README.md
├── manifest.json
├── restore/
│   ├── automations.yaml
│   ├── scripts.yaml
│   ├── helpers.yaml
│   └── configuration_include.yaml
├── inventory/
│   ├── entities.csv
│   ├── devices.csv
│   ├── areas.csv
│   ├── integrations.csv
│   └── services.csv
├── context/
│   ├── dependencies.yaml
│   ├── automations.json
│   ├── scripts.json
│   ├── automation_states.json
│   └── home_assistant.json
└── diagnostics/
    ├── validation.txt
    ├── validation.json
    ├── missing_entities.yaml
    ├── missing_services.yaml
    ├── possible_versions.yaml
    └── possible_conflicts.yaml
```

`restore/automations.yaml` has a YAML list at its top level and preserves the configuration IDs returned by Home Assistant. `restore/scripts.yaml` is a YAML mapping keyed by script ID. The export validates YAML parsing, the top-level structures, duplicate YAML keys, duplicate automation IDs, duplicate aliases, and duplicate script keys before creating the ZIP. `manifest.json` records format version, versions, content counts, and the validation outcome. A validation failure is recorded as `backup_valid: false`; the ZIP is still created when possible so that diagnostics are available.

`context/automation_states.json` is the machine-readable point-in-time record of enabled and disabled automations. The YAML status comments are informational only and do not alter Home Assistant configuration. The export preserves the original configuration values delivered by the public Home Assistant API, except for the explicit sensitive-value redaction described above; Jinja templates are never evaluated or rewritten.

`context/dependencies.yaml`, per-object indexes, and the diagnostics files identify static entity, service, device, area, script, scene, automation, and helper references. The scanner also records dynamic template references that cannot safely be resolved statically. Missing entity and service reports are therefore diagnostics, not automatic fixes. Possible version and conflict reports are informational and never disable, enable, delete, reload, or otherwise change configuration.

The public runtime API does not reliably identify whether an automation or script came from the UI, `automations.yaml`, a package, or another included YAML file. For that reason, the object indexes use `managed_by: unknown` and `source: null` when provenance is unavailable; Entity Audit does not guess. `helpers.yaml` contains an informational runtime inventory and explicitly marks helpers as non-restorable unless original helper configuration is available through a supported API.

The ZIP is intended for careful manual recovery and configuration review. It never reloads configuration, changes an entity, turns an automation on or off, edits a registry, or reads private Home Assistant storage. Restore only after making a full Home Assistant backup, reviewing `diagnostics/validation.txt`, adapting `restore/configuration_include.yaml` to your own layout, checking configuration, and deliberately applying the enabled/disabled states in `context/automation_states.json`.

This package is an **Entity Audit Configuration Backup & Diagnostic Snapshot**, not a complete Home Assistant backup. It does not include dashboards, config entries, add-ons, databases, secret files, credential stores, OAuth token stores, or arbitrary configuration files. Known sensitive values are redacted, but Backup mode can still contain real entity IDs, names, areas, IP addresses, MAC addresses, and non-sensitive current states. Do not share it publicly without reviewing its contents.

## Settings and logs

Open **Settings → Devices & services → Entity Audit → Configure** to manage retention, audit event limits, action/error logging, QR camera startup timeout, and device-label dimensions and variant. Use **Clear action and error history now** to erase the local action/error history.

Use the integration's three-dot menu and select **Download diagnostics** to download the configured settings and the bounded local action/error history. The diagnostics file applies Home Assistant's standard sensitive-value redaction.

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
