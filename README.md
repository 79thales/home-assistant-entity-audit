<p align="center">
  <img src="brand/icon@2x.png" alt="Entity Audit icon" width="192">
</p>

# Entity Audit for Home Assistant

Entity Audit is a HACS-compatible custom integration that gives administrators one searchable view of all Home Assistant entities. Auditing is opt-in per entity: only selected state changes are stored by this integration.

## Features

- lists runtime and entity-registry entities, including disabled and missing entries;
- searches by friendly name, device, `entity_id`, or source integration;
- filters entities by their Home Assistant device, including entities without a device;
- exports the currently filtered entity list to a UTF-8 CSV file;
- opens the native Home Assistant entity detail by clicking its current state;
- flags current `unavailable`, `unknown`, and missing states;
- enables or disables audit logging separately for every entity;
- records state transitions, problem starts, and recoveries;
- shows a bounded per-entity timeline in a sidebar panel;
- stores data locally in Home Assistant `.storage` with configurable retention and event limits;
- includes Czech and English configuration text and panel labels.

Entity Audit complements Home Assistant's built-in Recorder, History, and Activity features. It is intended as a compact diagnostic audit, not a replacement for long-term statistics.

## Installation for testing

1. Copy `custom_components/entity_audit` into the same path under your Home Assistant configuration directory.
2. Restart Home Assistant.
3. Go to **Settings → Devices & services → Add integration** and choose **Entity Audit**.
4. Open **Entity Audit** in the sidebar and enable auditing only for the entities you need.

## Installation through HACS

Until the repository is accepted into the HACS default catalog, add `https://github.com/79thales/home-assistant-entity-audit` under **HACS → Integrations → Custom repositories**, choose the **Integration** category, and install it.

## Storage and privacy

The default retention is 30 days and 500 events per entity. Records contain the timestamp and old/new state, but no entity attributes. Disabling audit stops future recording; existing records remain until retention expires or the user deletes them from the panel.

## Existing alternatives

- [Home Assistant Activity](https://www.home-assistant.io/integrations/logbook/) displays state changes from Recorder.
- [Watchman](https://github.com/dummylabs/thewatchman) finds missing or unavailable entities referenced by YAML configuration.
- [Entity Availability](https://github.com/italo-lombardi/Home-Assistant-EntityAvailability) focuses on availability history and group health.
- [Hass Diagnostics](https://github.com/AlexxIT/HassDiagnostics) exposes diagnostic sensors and a smart log.

Those projects overlap with parts of Entity Audit, but have a different focus and workflow.

## Publishing status

The repository includes HACS and Hassfest validation workflows. Brand assets and submission to the default HACS catalog can be added after the integration has been tested on a live Home Assistant installation.

## Development checks

```bash
python -m compileall custom_components/entity_audit
python -m json.tool custom_components/entity_audit/manifest.json
```

## License

MIT
