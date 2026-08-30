# Entity Audit for Home Assistant

Entity Audit is a HACS-compatible custom integration that gives administrators one searchable view of all Home Assistant entities. Auditing is opt-in per entity: only selected state changes are stored by this integration.

## Features

- lists runtime and entity-registry entities, including disabled and missing entries;
- searches by friendly name, `entity_id`, or source integration;
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

Until the repository is accepted into the HACS default catalog, add its GitHub URL under **HACS → Integrations → Custom repositories**, choose the **Integration** category, and install it. A public GitHub repository and release are required before this route can be used by others.

## Storage and privacy

The default retention is 30 days and 500 events per entity. Records contain the timestamp and old/new state, but no entity attributes. Disabling audit stops future recording; existing records remain until retention expires or the user deletes them from the panel.

## Existing alternatives

- [Home Assistant Activity](https://www.home-assistant.io/integrations/logbook/) displays state changes from Recorder.
- [Watchman](https://github.com/dummylabs/thewatchman) finds missing or unavailable entities referenced by YAML configuration.
- [Entity Availability](https://github.com/italo-lombardi/Home-Assistant-EntityAvailability) focuses on availability history and group health.
- [Hass Diagnostics](https://github.com/AlexxIT/HassDiagnostics) exposes diagnostic sensors and a smart log.

Those projects overlap with parts of Entity Audit, but have a different focus and workflow.

## Before publishing

Replace `OWNER` in `custom_components/entity_audit/manifest.json` with the GitHub account or organization, add at least one `@codeowner`, add brand assets, enable Issues, and create a GitHub release. The included workflows validate the repository with HACS and Hassfest.

## Development checks

```bash
python -m compileall custom_components/entity_audit
python -m json.tool custom_components/entity_audit/manifest.json
```

## License

MIT

