class EntityAuditPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._entities = [];
    this._filter = "";
    this._device = "";
    this._manufacturer = "";
    this._model = "";
    this._platform = "";
    this._area = "";
    this._domain = "";
    this._audit = "";
    this._category = "entities";
    this._hacsRepositories = [];
    this._hacsAvailable = null;
    this._hacsLoaded = false;
    this._hacsLoading = false;
    this._hacsCategory = "";
    this._users = [];
    this._usersLoaded = false;
    this._usersLoading = false;
    this._userRole = "";
    this._automationScripts = [];
    this._automationScriptsLoaded = false;
    this._automationScriptsLoading = false;
    this._automationState = "";
    this._automationExporting = null;
    this._groupBy = "device";
    this._problemOnly = false;
    this._selected = null;
    this._history = [];
    this._loading = false;
    this._labelWidth = 60;
    this._labelHeight = 38;
    this._labelVariant = "text";
    this._brotherRoll = "dk_22205";
    this._brotherPrinter = "ql820nwb";
    this._brotherLength = 40;
    this._brotherPrinters = {};
    // Výběr páru zůstává zachován i při změně filtru; obsahuje ID a typ štítku.
    this._labelPair = new Map();
    this._labelEditor = null;
    this._labelTemplates = [];
    this._labelTemplateId = "";
    this._printingLabels = false;
    this._printStatus = "";
    this._stopPrintRun = false;
    this._filtersOpen = false;
    this._printOptionsOpen = false;
    this._brotherOptionsOpen = false;
    this._labelPdf = null;
    this._qrLibraryPromise = null;
    this._qrReaderLibraryPromise = null;
    this._buildingLabels = false;
    this._scannerOpen = false;
    this._scannerDialog = null;
    this._scannerStream = null;
    this._cameraWaitTimer = null;
    this._cameraWaitSeconds = 5;
    this._scannerTimedOut = false;
    this._scannerFrame = null;
    this._scannerCanvas = null;
    this._scannerError = null;
    this._scannerStarting = false;
    this._scannerReaderFailed = false;
    this._scanResult = null;
    this._scanMatchedDevice = null;
    this._scanningImage = false;
    this._lastScanTime = 0;
    this._activityEnabled = true;
    this._entityAuditVersion = "unknown";
    this._backupExportFormatVersion = 1;
  }

  set hass(value) {
    this._hass = value;
    if (!this._loaded) {
      this._loaded = true;
      this._load();
    }
  }

  set panel(value) { this._panel = value; }
  set narrow(value) {
    const narrow = Boolean(value);
    if (this._narrow === narrow) return;
    this._narrow = narrow;
    if (this._loaded) this._render();
  }

  connectedCallback() { this._render(); }

  disconnectedCallback() {
    this._stopPrintRun = true;
    this._stopScannerCamera();
    this._revokeLabelPdf();
  }

  async _load() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    this._error = null;
    this._render();
    try {
      const [entities, settings] = await Promise.all([
        this._hass.callWS({ type: "entity_audit/list_entities" }),
        this._hass.callWS({ type: "entity_audit/get_settings" }),
      ]);
      this._entities = entities;
      this._activityEnabled = settings.activity_log_enabled;
      this._cameraWaitSeconds = settings.camera_wait_seconds;
      this._labelWidth = settings.label_width_mm;
      this._labelHeight = settings.label_height_mm;
      this._labelVariant = settings.label_variant;
      this._brotherPrinters = settings.brother_printers || {};
      // Šablony jsou sdílené v HA. Nedostupnost API nesmí skrýt seznam entit.
      try { this._labelTemplates = await this._hass.callWS({ type: "entity_audit/list_label_templates" }); }
      catch (_error) { this._labelTemplates = []; }
      // Při prvním načtení zvolíme jedinou dostupnou tiskárnu; pozdější
      // uživatelský výběr už další obnovení seznamu nepřepisuje.
      if (!this._printerChoiceInitialized) {
        const configured = Object.keys(this._brotherPrinters).filter((model) => this._brotherPrinters[model]);
        if (configured.length === 1 && ["vc500w", "ql820nwb"].includes(configured[0])) {
          this._brotherPrinter = configured[0];
          this._brotherRoll = this._brotherRollOptions()[0].id;
        }
        this._printerChoiceInitialized = true;
      }
      this._entityAuditVersion = settings.integration_version || this._entityAuditVersion;
      this._backupExportFormatVersion = settings.backup_export_format_version || this._backupExportFormatVersion;
      if (this._selected) {
        this._selected = this._entities.find((e) => e.entity_id === this._selected.entity_id) || null;
      }
    } catch (err) {
      this._error = err.message || String(err);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _loadHacs(force = false) {
    if (!this._hass || this._hacsLoading || (!force && this._hacsLoaded)) return;
    this._hacsLoading = true;
    this._categoryError = null;
    this._render();
    try {
      const result = await this._hass.callWS({ type: "entity_audit/list_hacs_repositories" });
      this._hacsAvailable = Boolean(result.available);
      this._hacsRepositories = Array.isArray(result.repositories) ? result.repositories : [];
      this._hacsLoaded = true;
    } catch (error) {
      this._categoryError = error.message || String(error);
    } finally {
      this._hacsLoading = false;
      this._render();
    }
  }

  async _loadUsers(force = false) {
    if (!this._hass || this._usersLoading || (!force && this._usersLoaded)) return;
    this._usersLoading = true;
    this._categoryError = null;
    this._render();
    try {
      const result = await this._hass.callWS({ type: "entity_audit/list_users" });
      this._users = Array.isArray(result) ? result : [];
      this._usersLoaded = true;
    } catch (error) {
      this._categoryError = error.message || String(error);
    } finally {
      this._usersLoading = false;
      this._render();
    }
  }

  async _loadAutomationScripts(force = false) {
    if (!this._hass || this._automationScriptsLoading || (!force && this._automationScriptsLoaded)) return;
    this._automationScriptsLoading = true;
    this._categoryError = null;
    this._render();
    try {
      const result = await this._hass.callWS({ type: "entity_audit/list_automation_scripts" });
      this._automationScripts = Array.isArray(result) ? result : [];
      this._automationScriptsLoaded = true;
    } catch (error) {
      this._categoryError = error.message || String(error);
    } finally {
      this._automationScriptsLoading = false;
      this._render();
    }
  }

  async _setCategory(category) {
    if (category === this._category) return;
    this._category = category;
    this._filter = "";
    this._selected = null;
    this._filtersOpen = false;
    if (category === "automations" || category === "scripts") {
      this._automationState = "";
    }
    if (category === "hacs") {
      await this._loadHacs();
      return;
    }
    if (category === "users") {
      await this._loadUsers();
      return;
    }
    if (category === "automations" || category === "scripts") {
      await this._loadAutomationScripts();
      return;
    }
    this._render();
  }

  async _refreshCurrentCategory() {
    if (this._category === "hacs") {
      await this._loadHacs(true);
      return;
    }
    if (this._category === "users") {
      await this._loadUsers(true);
      return;
    }
    if (this._category === "automations" || this._category === "scripts") {
      await this._loadAutomationScripts(true);
      return;
    }
    this._recordActivity("inventory_refreshed");
    await this._load();
  }

  async _toggle(entity, enabled) {
    await this._hass.callWS({
      type: "entity_audit/set_logging",
      entity_id: entity.entity_id,
      enabled,
    });
    entity.logging = enabled;
    this._recordActivity(
      enabled ? "entity_audit_enabled" : "entity_audit_disabled",
      "info",
      entity.entity_id
    );
    this._render();
  }

  async _bulkSet(rows, enabled) {
    if (!rows.length) return;
    const action = enabled ? "enable" : "disable";
    if (!confirm(`Really ${action} auditing for ${rows.length} displayed entities?`)) return;
    await this._hass.callWS({
      type: "entity_audit/set_logging_bulk",
      entity_ids: rows.map((entity) => entity.entity_id),
      enabled,
    });
    rows.forEach((entity) => { entity.logging = enabled; });
    this._recordActivity(
      enabled ? "entity_audit_bulk_enabled" : "entity_audit_bulk_disabled",
      "info",
      String(rows.length)
    );
    this._render();
  }

  async _open(entity) {
    this._selected = entity;
    this._history = await this._hass.callWS({
      type: "entity_audit/get_history",
      entity_id: entity.entity_id,
      limit: 500,
    });
    this._recordActivity("entity_history_opened", "info", entity.entity_id);
    this._render();
  }

  async _clear() {
    if (!this._selected || !confirm("Delete stored history for this entity?")) return;
    await this._hass.callWS({
      type: "entity_audit/clear_history",
      entity_id: this._selected.entity_id,
    });
    this._history = [];
    this._selected.event_count = 0;
    this._recordActivity("entity_history_cleared", "info", this._selected.entity_id);
    this._render();
  }

  _showEntity(entityId) {
    this._recordActivity("entity_detail_opened", "info", entityId);
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }));
  }

  _csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  _downloadCsv(prefix, headers, rows) {
    const lines = [headers.map((value) => this._csvCell(value)).join(";")];
    for (const row of rows) lines.push(row.map((value) => this._csvCell(value)).join(";"));
    const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  _exportCsv(rows) {
    this._downloadCsv(
      "entity-audit",
      ["name", "entity_id", "domain", "device", "manufacturer", "model", "area", "ip_address", "mac_address", "integration", "state", "problem", "audited", "last_changed"],
      rows.map((entity) => [
        entity.name,
        entity.entity_id,
        entity.domain,
        entity.device_name,
        entity.manufacturer,
        entity.model,
        entity.area_name,
        entity.ip_address,
        entity.mac_address,
        entity.platform,
        entity.state,
        entity.problem,
        entity.logging ? "true" : "false",
        entity.last_changed,
      ])
    );
    this._recordActivity("csv_exported", "info", String(rows.length));
  }

  _exportHacsCsv(rows) {
    this._downloadCsv(
      "entity-audit-hacs",
      ["name", "repository", "category", "domain", "description", "installed_version", "available_version", "update_available", "restart_required"],
      rows.map((repository) => [
        repository.name,
        repository.repository,
        repository.category,
        repository.domain,
        repository.description,
        repository.installed_version,
        repository.available_version,
        repository.update_available ? "true" : "false",
        repository.restart_required ? "true" : "false",
      ])
    );
    this._recordActivity("hacs_csv_exported", "info", String(rows.length));
  }

  _exportUsersCsv(rows) {
    this._downloadCsv(
      "entity-audit-users",
      ["name", "role", "access", "groups", "permission_policy", "active", "local_only", "system_generated"],
      rows.map((user) => [
        user.name,
        user.role,
        user.access,
        (user.groups || []).join(" | "),
        user.permission_policy,
        user.active ? "true" : "false",
        user.local_only ? "true" : "false",
        user.system_generated ? "true" : "false",
      ])
    );
    this._recordActivity("users_csv_exported", "info", String(rows.length));
  }

  _automationExportStatus(item) {
    if (item.kind === "automation") {
      if (item.status) return item.status;
      if (item.disabled) return "registry_disabled";
      if (item.automation_enabled === true || item.state === "on") return "enabled";
      if (item.automation_enabled === false || item.state === "off") return "disabled";
    }
    if (item.disabled) return "registry_disabled";
    if (item.kind === "script") {
      if (item.state === "on") return "running";
      if (item.state === "off") return "idle";
    }
    return item.state || "missing";
  }

  _exportAutomationCsv(rows) {
    const kind = rows[0]?.kind || "automation";
    this._downloadCsv(
      `entity-audit-${kind === "automation" ? "automations" : "scripts"}`,
      ["name", "entity_id", "kind", "current_status", "automation_enabled", "state", "mode", "current_runs", "max_runs", "last_triggered", "unique_id", "registry_disabled", "platform"],
      rows.map((item) => [
        item.name,
        item.entity_id,
        item.kind,
        this._automationExportStatus(item),
        item.kind === "automation" && item.automation_enabled !== null && item.automation_enabled !== undefined ? String(item.automation_enabled) : "",
        item.state,
        item.mode,
        item.current,
        item.max,
        item.last_triggered,
        item.unique_id,
        item.disabled ? "true" : "false",
        item.platform,
      ])
    );
    this._recordActivity("automation_csv_exported", "info", String(rows.length));
  }

  _downloadBlob(prefix, extension, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.${extension}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  _downloadText(prefix, extension, text, type) {
    this._downloadBlob(prefix, extension, new Blob([text], { type }));
  }

  _configurationValueIsSensitive(value) {
    if (typeof value !== "string") return false;
    return /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/i.test(value)
      || /\b(?:bearer|basic)\s+[A-Za-z0-9._~+\/-]{8,}/i.test(value)
      || /https?:\/\/[^\s\/@:]+:[^\s\/@]+@/i.test(value)
      || /(?:^|[?&#\s])(?:password|passphrase|token|api[_-]?key|secret|access[_-]?token|refresh[_-]?token|webhook(?:[_-]?id)?)=[^&\s]+/i.test(value)
      || /\/(?:api\/)?webhook\/[A-Za-z0-9_-]{8,}/i.test(value);
  }

  _redactConfiguration(value) {
    if (Array.isArray(value)) return value.map((item) => this._redactConfiguration(item));
    if (!value || typeof value !== "object") {
      return this._configurationValueIsSensitive(value) ? "<REDACTED>" : value;
    }
    const result = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const normalizedKey = key.replace(/([a-z])([A-Z])/g, "$1_$2");
      result[key] = /(?:^|[_-])(password|passphrase|token|api[_-]?key|secret|authorization|cookie|session|credential|oauth|private[_-]?key|access[_-]?token|refresh[_-]?token|webhook(?:[_-]?id)?)(?:$|[_-])/i.test(normalizedKey)
        ? "<REDACTED>"
        : this._redactConfiguration(nestedValue);
    }
    return result;
  }

  _yamlKey(key) {
    return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
  }

  _yamlScalar(value) {
    if (value === null || value === undefined) return "null";
    if (typeof value === "boolean" || typeof value === "number") return String(value);
    return JSON.stringify(String(value));
  }

  _yamlValue(value, indent = 0) {
    const pad = " ".repeat(indent);
    if (value === null || value === undefined || typeof value !== "object") {
      return `${pad}${this._yamlScalar(value)}`;
    }
    if (Array.isArray(value)) {
      if (!value.length) return `${pad}[]`;
      return value.map((item) => {
        if (item && typeof item === "object") return `${pad}-\n${this._yamlValue(item, indent + 2)}`;
        return `${pad}- ${this._yamlScalar(item)}`;
      }).join("\n");
    }
    const entries = Object.entries(value);
    if (!entries.length) return `${pad}{}`;
    return entries.map(([key, nestedValue]) => {
      if (nestedValue && typeof nestedValue === "object") {
        return `${pad}${this._yamlKey(key)}:\n${this._yamlValue(nestedValue, indent + 2)}`;
      }
      return `${pad}${this._yamlKey(key)}: ${this._yamlScalar(nestedValue)}`;
    }).join("\n");
  }

  async _mapWithConcurrency(items, limit, worker) {
    const result = new Array(items.length);
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        result[index] = await worker(items[index]);
      }
    });
    await Promise.all(runners);
    return result;
  }

  async _getConfigurationSnapshots(items, kind) {
    return this._mapWithConcurrency(items, 4, async (item) => {
      const response = await this._hass.callWS({ type: `${kind}/config`, entity_id: item.entity_id });
      return { item, config: this._redactConfiguration(response.config) };
    });
  }

  _backupText(value) {
    return String(value ?? "").normalize("NFC").toLowerCase();
  }

  _compareBackupText(left, right) {
    const normalizedLeft = this._backupText(left);
    const normalizedRight = this._backupText(right);
    if (normalizedLeft < normalizedRight) return -1;
    if (normalizedLeft > normalizedRight) return 1;
    return 0;
  }

  _scriptKey(item) {
    return item.unique_id || item.edit_id || item.entity_id.slice("script.".length);
  }

  _sortedSnapshotConfigs(configs, kind) {
    return [...configs].sort((left, right) => {
      const leftPrimary = kind === "automation"
        ? (left.config.alias || left.item.name || left.config.id || left.item.entity_id)
        : this._scriptKey(left.item);
      const rightPrimary = kind === "automation"
        ? (right.config.alias || right.item.name || right.config.id || right.item.entity_id)
        : this._scriptKey(right.item);
      const primary = this._compareBackupText(leftPrimary, rightPrimary);
      if (primary) return primary;
      const leftSecondary = kind === "automation"
        ? (left.config.id || left.item.edit_id || left.item.entity_id)
        : left.item.entity_id;
      const rightSecondary = kind === "automation"
        ? (right.config.id || right.item.edit_id || right.item.entity_id)
        : right.item.entity_id;
      return this._compareBackupText(leftSecondary, rightSecondary);
    });
  }

  _configurationIncludeYaml() {
    return [
      "# Generated by Entity Audit.",
      "# Merge these include directives into your existing configuration.yaml.",
      "# This file is not a complete Home Assistant configuration.",
      "automation: !include automations.yaml",
      "script: !include scripts.yaml",
      "",
    ].join("\n");
  }

  _exportConfigurationYaml() {
    if (this._automationExporting) return;
    this._downloadText(
      "entity-audit-configuration",
      "yaml",
      this._configurationIncludeYaml(),
      "application/x-yaml;charset=utf-8"
    );
    const count = this._automationScripts.filter((item) => item.state !== "missing").length;
    this._recordActivity("configuration_yaml_exported", "info", String(count));
  }

  _configurationHeader() {
    return [
      "# Generated by Entity Audit.",
      "# This is a sanitized configuration snapshot of the selected items.",
      "# Values under sensitive keys (for example token, password, secret, or api_key) are replaced with <REDACTED>.",
      "# Review before using this snapshot in Home Assistant configuration.",
      "",
    ].join("\n");
  }

  _automationYaml(configs) {
    const snapshots = this._sortedSnapshotConfigs(configs, "automation").map(({ item, config }) => [
      `# Entity Audit status at export: ${this._automationExportStatus(item)}`,
      "# This point-in-time inventory marker is not applied as automation configuration.",
      this._yamlValue([config]),
    ].join("\n"));
    return `${this._configurationHeader()}${snapshots.length ? snapshots.join("\n\n") : "[]"}\n`;
  }

  _scriptYaml(configs) {
    const snapshots = this._sortedSnapshotConfigs(configs, "script").map(({ item, config }) => {
      const key = this._scriptKey(item);
      return `${this._yamlKey(key)}:\n${this._yamlValue(config, 2)}`;
    });
    return `${this._configurationHeader()}${snapshots.length ? snapshots.join("\n") : "{}"}\n`;
  }

  _backupReference(snapshot) {
    const type = snapshot.item.kind;
    const rawId = type === "automation"
      ? (snapshot.config?.id ?? snapshot.item.edit_id ?? null)
      : this._scriptKey(snapshot.item);
    return {
      type,
      id: rawId === null || rawId === undefined ? null : String(rawId),
      alias: String(snapshot.config?.alias || snapshot.item.name || snapshot.item.entity_id),
      entity_id: snapshot.item.entity_id,
      enabled: type === "automation" ? snapshot.item.automation_enabled : null,
      status: this._automationExportStatus(snapshot.item),
      source: null,
      managed_by: "unknown",
      source_reason: "The public Home Assistant runtime API does not expose the original configuration file or UI provenance.",
    };
  }

  _backupEntityIsSensitive(entity) {
    const identity = `${entity.entity_id || ""} ${entity.name || ""}`;
    return entity.domain === "input_text" || /password|passphrase|token|api[_-]?key|secret|authorization|cookie|session|private[_-]?key|access[_-]?token|refresh[_-]?token/i.test(identity);
  }

  _backupEntityState(entity) {
    return this._backupEntityIsSensitive(entity) ? "<REDACTED>" : entity.state;
  }

  _backupCsvText(headers, rows) {
    const lines = [headers.map((value) => this._csvCell(value)).join(",")];
    for (const row of rows) lines.push(row.map((value) => this._csvCell(value)).join(","));
    return `${lines.join("\n")}\n`;
  }

  _backupEntityInventory() {
    return [...this._entities]
      .sort((left, right) => this._compareBackupText(left.entity_id, right.entity_id))
      .map((entity) => ({
        entity_id: entity.entity_id,
        domain: entity.domain,
        name: entity.name,
        state: this._backupEntityState(entity),
        unit: entity.unit || "",
        device: entity.device_name || "",
        manufacturer: entity.manufacturer || "",
        model: entity.model || "",
        area: entity.area_name || "",
        integration: entity.platform || "",
        available: entity.available,
        last_changed: entity.last_changed || "",
        ip_address: entity.ip_address || "",
        mac_address: entity.mac_address || "",
      }));
  }

  _backupDeviceInventory(entities) {
    const devices = new Map();
    for (const entity of entities) {
      if (!entity.device_id) continue;
      if (!devices.has(entity.device_id)) {
        devices.set(entity.device_id, {
          device_id: entity.device_id,
          device: entity.device_name || "",
          manufacturer: entity.manufacturer || "",
          model: entity.model || "",
          area: entity.area_name || "",
          integrations: new Set(),
          entity_count: 0,
        });
      }
      const device = devices.get(entity.device_id);
      if (entity.platform) device.integrations.add(entity.platform);
      device.entity_count += 1;
    }
    return [...devices.values()]
      .map((device) => ({
        ...device,
        integrations: [...device.integrations].sort((a, b) => this._compareBackupText(a, b)).join(" | "),
      }))
      .sort((left, right) => this._compareBackupText(left.device_id, right.device_id));
  }

  _backupAreaInventory(entities) {
    const areas = new Map();
    for (const entity of entities) {
      if (!entity.area_id) continue;
      if (!areas.has(entity.area_id)) {
        areas.set(entity.area_id, {
          area_id: entity.area_id,
          area: entity.area_name || "",
          entity_count: 0,
          devices: new Set(),
        });
      }
      const area = areas.get(entity.area_id);
      area.entity_count += 1;
      if (entity.device_id) area.devices.add(entity.device_id);
    }
    return [...areas.values()]
      .map(({ devices, ...area }) => ({ ...area, device_count: devices.size }))
      .sort((left, right) => this._compareBackupText(left.area_id, right.area_id));
  }

  _backupIntegrationInventory(entities) {
    const integrations = new Map();
    for (const entity of entities) {
      if (!entity.platform) continue;
      integrations.set(entity.platform, (integrations.get(entity.platform) || 0) + 1);
    }
    return [...integrations.entries()]
      .map(([domain, entityCount]) => ({
        domain,
        title: "",
        version: "",
        source: "observed_entity_platform",
        entity_count: entityCount,
      }))
      .sort((left, right) => this._compareBackupText(left.domain, right.domain));
  }

  _backupHelpers(entities) {
    const helperDomains = new Set([
      "counter", "input_boolean", "input_datetime", "input_number", "input_select", "input_text", "schedule", "timer",
    ]);
    const grouped = {};
    for (const entity of entities.filter((candidate) => helperDomains.has(candidate.domain))) {
      if (!grouped[entity.domain]) grouped[entity.domain] = [];
      grouped[entity.domain].push({
        entity_id: entity.entity_id,
        name: entity.name,
        state: this._backupEntityState(entity),
        available: entity.available,
        attributes: this._backupEntityIsSensitive(entity) ? {} : this._redactConfiguration(entity.backup_attributes || {}),
        restorable: false,
        reason: "Original helper configuration is not available through the public runtime API.",
      });
    }
    return Object.fromEntries(Object.entries(grouped)
      .sort(([left], [right]) => this._compareBackupText(left, right))
      .map(([domain, helpers]) => [
        domain,
        helpers.sort((left, right) => this._compareBackupText(left.entity_id, right.entity_id)),
      ]));
  }

  _newDependencyCollector() {
    return {
      entities: new Map(),
      devices: new Map(),
      areas: new Map(),
      services: new Map(),
      dynamic: new Map(),
    };
  }

  _addDependency(collection, identifier, reference) {
    if (typeof identifier !== "string") return;
    const value = identifier.trim();
    if (!value || value.includes("{{") || value.includes("{%")) return;
    if (!collection.has(value)) collection.set(value, new Map());
    const referenceKey = `${reference.type}:${reference.id || reference.entity_id}`;
    collection.get(value).set(referenceKey, reference);
  }

  _addDependencyValues(collection, value, reference) {
    if (Array.isArray(value)) {
      value.forEach((item) => this._addDependencyValues(collection, item, reference));
      return;
    }
    this._addDependency(collection, value, reference);
  }

  _scanDynamicReferences(text, reference, collector) {
    const pattern = /\b(?:states|is_state|state_attr|expand)\(\s*([^,)]*)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const argument = match[1].trim();
      if (argument.startsWith("'") || argument.startsWith('"')) continue;
      const expression = match[0].slice(0, 240);
      const key = `${reference.type}:${reference.id || reference.entity_id}:${expression}`;
      collector.dynamic.set(key, { referenced_by: reference, expression });
    }
  }

  _scanBackupString(value, reference, collector, scanEntities = true) {
    if (typeof value !== "string") return;
    const templateLike = /\{\{|\{%|\b(?:states|is_state|state_attr|expand)\s*\(/.test(value);
    if (scanEntities && templateLike) {
      const entityIds = value.match(/\b[a-z][a-z0-9_]*\.[a-z0-9_]+\b/g) || [];
      [...new Set(entityIds)].forEach((entityId) => this._addDependency(collector.entities, entityId, reference));
    }
    if (templateLike) this._scanDynamicReferences(value, reference, collector);
  }

  _recordServiceValue(value, reference, collector) {
    if (Array.isArray(value)) {
      value.forEach((item) => this._recordServiceValue(item, reference, collector));
      return;
    }
    if (typeof value !== "string") return;
    const service = value.trim();
    if (/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(service)) {
      this._addDependency(collector.services, service, reference);
    } else {
      this._scanBackupString(service, reference, collector, false);
    }
  }

  _scanBackupConfig(value, reference, collector) {
    if (Array.isArray(value)) {
      value.forEach((item) => this._scanBackupConfig(item, reference, collector));
      return;
    }
    if (!value || typeof value !== "object") {
      this._scanBackupString(value, reference, collector);
      return;
    }
    for (const [rawKey, nestedValue] of Object.entries(value)) {
      const key = rawKey.toLowerCase();
      if (key === "entity_id" || key === "entity_ids") {
        this._addDependencyValues(collector.entities, nestedValue, reference);
        this._scanBackupConfig(nestedValue, reference, collector);
      } else if (key === "device_id" || key === "device_ids") {
        this._addDependencyValues(collector.devices, nestedValue, reference);
        this._scanBackupConfig(nestedValue, reference, collector);
      } else if (key === "area_id" || key === "area_ids") {
        this._addDependencyValues(collector.areas, nestedValue, reference);
        this._scanBackupConfig(nestedValue, reference, collector);
      } else if (key === "service" || key === "action") {
        this._recordServiceValue(nestedValue, reference, collector);
        if (typeof nestedValue !== "string") this._scanBackupConfig(nestedValue, reference, collector);
      } else {
        this._scanBackupConfig(nestedValue, reference, collector);
      }
    }
  }

  _dependencyEntries(collection, field) {
    return [...collection.entries()]
      .map(([value, references]) => ({
        [field]: value,
        referenced_by: [...references.values()].sort((left, right) => this._compareBackupText(
          `${left.type}:${left.alias}:${left.id || ""}`,
          `${right.type}:${right.alias}:${right.id || ""}`
        )),
      }))
      .sort((left, right) => this._compareBackupText(left[field], right[field]));
  }

  _collectDependencies(snapshots) {
    const collector = this._newDependencyCollector();
    snapshots.forEach((snapshot) => this._scanBackupConfig(snapshot.config, this._backupReference(snapshot), collector));
    const entities = this._dependencyEntries(collector.entities, "entity_id");
    const helpers = entities.filter((entry) => /^(counter|input_boolean|input_datetime|input_number|input_select|input_text|schedule|timer)\./.test(entry.entity_id));
    return {
      entities,
      helpers,
      services: this._dependencyEntries(collector.services, "service"),
      devices: this._dependencyEntries(collector.devices, "device_id"),
      areas: this._dependencyEntries(collector.areas, "area_id"),
      scripts: entities.filter((entry) => entry.entity_id.startsWith("script.")),
      scenes: entities.filter((entry) => entry.entity_id.startsWith("scene.")),
      automations: entities.filter((entry) => entry.entity_id.startsWith("automation.")),
      dynamic_references: [...collector.dynamic.values()].sort((left, right) => this._compareBackupText(
        `${left.referenced_by.alias}:${left.expression}`,
        `${right.referenced_by.alias}:${right.expression}`
      )),
    };
  }

  _backupObjectIndex(snapshots, kind) {
    return this._sortedSnapshotConfigs(snapshots, kind).map((snapshot) => {
      const dependencies = this._collectDependencies([snapshot]);
      return {
        ...this._backupReference(snapshot),
        entities: dependencies.entities.map((entry) => entry.entity_id),
        services: dependencies.services.map((entry) => entry.service),
        devices: dependencies.devices.map((entry) => entry.device_id),
        areas: dependencies.areas.map((entry) => entry.area_id),
        dynamic_references: dependencies.dynamic_references.map((entry) => entry.expression),
      };
    });
  }

  _possibleVersions(automationIndex) {
    const groups = new Map();
    for (const automation of automationIndex) {
      const match = automation.alias.match(/^(.*?)\s+v(?:ersion)?\s*(\d+(?:\.\d+)*)$/i);
      if (!match || !match[1].trim()) continue;
      const baseName = match[1].trim();
      if (!groups.has(baseName)) groups.set(baseName, []);
      groups.get(baseName).push(automation);
    }
    return {
      groups: [...groups.entries()]
        .filter(([, automations]) => automations.length > 1)
        .map(([baseName, automations]) => ({
          base_name: baseName,
          automations: automations.map(({ alias, id, enabled, status }) => ({ alias, id, enabled, status })),
        }))
        .sort((left, right) => this._compareBackupText(left.base_name, right.base_name)),
    };
  }

  _possibleConflicts(dependencies) {
    return {
      possible_conflicts: dependencies.entities
        .map((entry) => ({
          entity_id: entry.entity_id,
          automations: entry.referenced_by.filter((reference) => reference.type === "automation"),
        }))
        .filter((entry) => entry.automations.length > 1)
        .map((entry) => ({
          entity_id: entry.entity_id,
          automations: entry.automations.map(({ alias, id, enabled, status }) => ({ alias, id, enabled, status })),
          enabled_automations: entry.automations.filter((automation) => automation.enabled === true).length,
        }))
        .sort((left, right) => this._compareBackupText(left.entity_id, right.entity_id)),
    };
  }

  async _backupServices() {
    try {
      const result = await this._hass.callWS({ type: "get_services" });
      const services = [];
      for (const [domain, definitions] of Object.entries(result || {})) {
        for (const service of Object.keys(definitions || {})) services.push(`${domain}.${service}`);
      }
      return {
        services: [...new Set(services)].sort((left, right) => this._compareBackupText(left, right)),
        warning: null,
      };
    } catch (error) {
      return {
        services: [],
        warning: `Available service inventory could not be read (${error?.name || "service_inventory_unavailable"}).`,
      };
    }
  }

  async _getBackupConfigurationSnapshots(items, kind) {
    const results = await this._mapWithConcurrency(items, 4, async (item) => {
      try {
        const response = await this._hass.callWS({ type: `${kind}/config`, entity_id: item.entity_id });
        const config = this._redactConfiguration(response?.config);
        if (!config || typeof config !== "object" || Array.isArray(config)) {
          return { item, config: null, error: "invalid_configuration_response" };
        }
        return { item, config, error: null };
      } catch (error) {
        return { item, config: null, error: error?.name || "configuration_unavailable" };
      }
    });
    return {
      snapshots: results.filter((result) => result.config && typeof result.config === "object"),
      errors: results.filter((result) => result.error).map((result) => ({ entity_id: result.item.entity_id, error: result.error })),
    };
  }

  _homeAssistantVersion() {
    return this._hass?.config?.version || this._hass?.connection?.haVersion || null;
  }

  _backupValidationText(validation, content) {
    const result = validation.backup_valid ? (validation.warnings.length ? "WARNING" : "PASS") : "FAILED";
    return [
      `VALIDATION RESULT: ${result}`,
      `Automations: ${content.automations}`,
      `Scripts: ${content.scripts}`,
      `Duplicate automation IDs: ${validation.duplicate_automation_ids.length}`,
      `Duplicate automation aliases: ${validation.duplicate_automation_aliases.length}`,
      `Duplicate script keys: ${validation.duplicate_script_keys.length}`,
      `Missing entity references: ${validation.missing_entities}`,
      `Missing services: ${validation.missing_services}`,
      `YAML errors: ${validation.errors.length}`,
      `Warnings: ${validation.warnings.length}`,
      "",
      ...validation.errors.map((error) => `ERROR: ${error}`),
      ...validation.warnings.map((warning) => `WARNING: ${warning}`),
      "",
    ].join("\n");
  }

  _backupReadme(manifest, validationResult) {
    const { content, validation } = manifest;
    const result = validation.backup_valid ? (validation.warnings ? "WARNING" : "PASS") : "FAILED";
    return [
      "# Entity Audit Home Assistant Configuration Backup",
      "",
      `Created: ${manifest.created_at}`,
      `Home Assistant: ${manifest.home_assistant.version || "unknown"}`,
      `Entity Audit: ${manifest.entity_audit.version || "unknown"}`,
      `Automations: ${content.automations}`,
      `  Enabled: ${content.automations_enabled}`,
      `  Disabled: ${content.automations_disabled}`,
      `Scripts: ${content.scripts}`,
      `Missing entity references: ${validation.missing_entities}`,
      `Validation: ${result}`,
      "",
      "## Purpose",
      "",
      "This package is a read-only backup of available Home Assistant automation and script configuration and a diagnostic snapshot for audit and further configuration work.",
      "",
      "## Restorable content",
      "",
      "- restore/automations.yaml",
      "- restore/scripts.yaml",
      "- restore/configuration_include.yaml (an include example)",
      "",
      "Automation enabled/disabled state is stored in context/automation_states.json. Restore it deliberately after verifying the configuration; Entity Audit never changes states while exporting.",
      "",
      "## Informational content",
      "",
      "Entity, device, area, integration, service, helper, dependency, and diagnostic files describe the runtime snapshot. Helpers are informational unless explicitly marked restorable.",
      "",
      "## Restore guidance",
      "",
      "1. Make a full Home Assistant backup.",
      "2. Review diagnostics/validation.txt and diagnostics/missing_entities.yaml.",
      "3. Copy the restore YAML files into your chosen configuration layout and adapt the include paths.",
      "4. Check Home Assistant configuration before reloading or restarting.",
      "5. Restore automation enabled/disabled states deliberately from context/automation_states.json.",
      "",
      "## Important limits",
      "",
      "This package is not a replacement for a full Home Assistant backup.",
      "It does not contain dashboards, config entries, add-ons, databases, secret files, credential stores, or OAuth token stores.",
      "Known sensitive configuration values are replaced with <REDACTED>; review every file before sharing or restoring and provide redacted values separately.",
      "This is Backup mode and can contain real entity, device, area, IP, and MAC information. Do not share it publicly without reviewing it.",
      "",
      ...(validationResult.warnings || []).map((warning) => `Export warning: ${warning}`),
      "",
    ].join("\n");
  }

  _zipCrc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  _createZip(files) {
    const encoder = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      const crc = this._zipCrc32(data);
      const local = new Uint8Array(30 + name.length + data.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, dosTime, true);
      localView.setUint16(12, dosDate, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, name.length, true);
      localView.setUint16(28, 0, true);
      local.set(name, 30);
      local.set(data, 30 + name.length);
      localParts.push(local);

      const central = new Uint8Array(46 + name.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, dosTime, true);
      centralView.setUint16(14, dosDate, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      central.set(name, 46);
      centralParts.push(central);
      offset += local.length;
    }

    const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);
    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  }

  async _exportAutomationYaml(rows, kind) {
    const selected = rows.filter((item) => item.kind === kind && item.state !== "missing");
    if (!selected.length || this._automationExporting) return;
    this._automationExporting = kind;
    this._render();
    try {
      const configs = await this._getConfigurationSnapshots(selected, kind);
      const yaml = kind === "automation"
        ? this._automationYaml(configs)
        : this._scriptYaml(configs);
      this._downloadText(
        kind === "automation" ? "entity-audit-automations" : "entity-audit-scripts",
        "yaml",
        yaml,
        "application/x-yaml;charset=utf-8"
      );
      this._recordActivity(kind === "automation" ? "automation_yaml_exported" : "script_yaml_exported", "info", String(selected.length));
    } catch (error) {
      this._recordActivity("automation_export_failed", "error", error?.name || "export_failed");
      alert(`The ${kind} YAML export could not be created. Check that Home Assistant ${kind}s are loaded, then try again.`);
    } finally {
      this._automationExporting = null;
      this._render();
    }
  }

  async _exportConfigurationBackup() {
    if (this._automationExporting) return;
    this._automationExporting = "backup";
    this._render();
    try {
      await Promise.all([this._load(), this._loadAutomationScripts(true)]);
      const automationItems = this._automationScripts.filter((item) => item.kind === "automation" && item.state !== "missing");
      const scriptItems = this._automationScripts.filter((item) => item.kind === "script" && item.state !== "missing");
      const [automationResult, scriptResult, serviceResult] = await Promise.all([
        this._getBackupConfigurationSnapshots(automationItems, "automation"),
        this._getBackupConfigurationSnapshots(scriptItems, "script"),
        this._backupServices(),
      ]);
      const automationsYaml = this._automationYaml(automationResult.snapshots);
      const scriptsYaml = this._scriptYaml(scriptResult.snapshots);
      let parserValidation;
      try {
        parserValidation = await this._hass.callWS({
          type: "entity_audit/validate_configuration_export",
          automations_yaml: automationsYaml,
          scripts_yaml: scriptsYaml,
        });
      } catch (error) {
        parserValidation = {
          backup_valid: false,
          yaml_valid: false,
          automations_top_level_list: false,
          scripts_top_level_mapping: false,
          duplicate_automation_ids: [],
          duplicate_automation_aliases: [],
          duplicate_automation_yaml_keys: [],
          duplicate_script_keys: [],
          errors: [`Server-side YAML validation could not be completed (${error?.name || "validation_unavailable"}).`],
          warnings: [],
        };
      }

      const collectionErrors = [
        ...automationResult.errors.map((entry) => `Automation configuration unavailable: ${entry.entity_id} (${entry.error}).`),
        ...scriptResult.errors.map((entry) => `Script configuration unavailable: ${entry.entity_id} (${entry.error}).`),
      ];
      const allSnapshots = [...automationResult.snapshots, ...scriptResult.snapshots];
      const dependencies = this._collectDependencies(allSnapshots);
      const automationIndex = this._backupObjectIndex(automationResult.snapshots, "automation");
      const scriptIndex = this._backupObjectIndex(scriptResult.snapshots, "script");
      const knownEntityIds = new Set(this._entities.map((entity) => entity.entity_id));
      const missingEntities = dependencies.entities.filter((entry) => !knownEntityIds.has(entry.entity_id));
      const availableServices = new Set(serviceResult.services);
      const missingServices = serviceResult.warning
        ? []
        : dependencies.services.filter((entry) => !availableServices.has(entry.service));
      const warnings = [
        ...(Array.isArray(parserValidation.warnings) ? parserValidation.warnings : []),
        ...(serviceResult.warning ? [serviceResult.warning] : []),
        ...(missingEntities.length ? [`${missingEntities.length} referenced entities are not present in the current entity registry or state machine.`] : []),
        ...(missingServices.length ? [`${missingServices.length} referenced services are not currently available.`] : []),
      ];
      const errors = [
        ...(Array.isArray(parserValidation.errors) ? parserValidation.errors : []),
        ...collectionErrors,
      ];
      const validation = {
        backup_valid: Boolean(parserValidation.backup_valid) && !collectionErrors.length,
        yaml_valid: Boolean(parserValidation.yaml_valid),
        automations_top_level_list: Boolean(parserValidation.automations_top_level_list),
        scripts_top_level_mapping: Boolean(parserValidation.scripts_top_level_mapping),
        duplicate_automation_ids: parserValidation.duplicate_automation_ids || [],
        duplicate_automation_aliases: parserValidation.duplicate_automation_aliases || [],
        duplicate_automation_yaml_keys: parserValidation.duplicate_automation_yaml_keys || [],
        duplicate_script_keys: parserValidation.duplicate_script_keys || [],
        errors,
        warnings,
        missing_entities: missingEntities.length,
        missing_services: missingServices.length,
      };
      const content = {
        automations: automationResult.snapshots.length,
        scripts: scriptResult.snapshots.length,
        automations_enabled: automationIndex.filter((automation) => automation.enabled === true).length,
        automations_disabled: automationIndex.filter((automation) => automation.enabled === false).length,
        entities: this._entities.length,
        helpers: Object.values(this._backupHelpers(this._entities)).reduce((count, helpers) => count + helpers.length, 0),
      };
      const createdAt = new Date().toISOString();
      const manifest = {
        export_format: "entity-audit-backup",
        export_format_version: this._backupExportFormatVersion,
        created_at: createdAt,
        home_assistant: { version: this._homeAssistantVersion() },
        entity_audit: { version: this._entityAuditVersion },
        content,
        requested_content: {
          automations: automationItems.length,
          scripts: scriptItems.length,
        },
        validation: {
          backup_valid: validation.backup_valid,
          yaml_valid: validation.yaml_valid,
          automations_top_level_list: validation.automations_top_level_list,
          scripts_top_level_mapping: validation.scripts_top_level_mapping,
          duplicate_ids: validation.duplicate_automation_ids.length,
          duplicate_aliases: validation.duplicate_automation_aliases.length,
          duplicate_yaml_keys:
            validation.duplicate_automation_yaml_keys.length
            + validation.duplicate_script_keys.length,
          duplicate_script_keys: validation.duplicate_script_keys.length,
          missing_entities: validation.missing_entities,
          missing_services: validation.missing_services,
          warnings: validation.warnings.length,
          errors: validation.errors.length,
        },
      };
      const entityInventory = this._backupEntityInventory();
      const deviceInventory = this._backupDeviceInventory(this._entities);
      const areaInventory = this._backupAreaInventory(this._entities);
      const integrationInventory = this._backupIntegrationInventory(this._entities);
      const helpers = this._backupHelpers(this._entities);
      const stamp = createdAt.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}).*$/, "$1_$2-$3");
      const root = `entity-audit-backup-${stamp}/`;
      this._downloadBlob(
        "entity-audit-configuration-backup",
        "zip",
        this._createZip([
          { name: `${root}README.md`, content: this._backupReadme(manifest, validation) },
          { name: `${root}manifest.json`, content: `${JSON.stringify(manifest, null, 2)}\n` },
          { name: `${root}restore/automations.yaml`, content: automationsYaml },
          { name: `${root}restore/scripts.yaml`, content: scriptsYaml },
          { name: `${root}restore/helpers.yaml`, content: `${this._yamlValue(helpers)}\n` },
          { name: `${root}restore/configuration_include.yaml`, content: this._configurationIncludeYaml() },
          { name: `${root}inventory/entities.csv`, content: this._backupCsvText(
            ["entity_id", "domain", "name", "state", "unit", "device", "manufacturer", "model", "area", "integration", "available", "last_changed", "ip_address", "mac_address"],
            entityInventory.map((entity) => [entity.entity_id, entity.domain, entity.name, entity.state, entity.unit, entity.device, entity.manufacturer, entity.model, entity.area, entity.integration, entity.available, entity.last_changed, entity.ip_address, entity.mac_address])
          ) },
          { name: `${root}inventory/devices.csv`, content: this._backupCsvText(
            ["device_id", "device", "manufacturer", "model", "area", "integrations", "entity_count"],
            deviceInventory.map((device) => [device.device_id, device.device, device.manufacturer, device.model, device.area, device.integrations, device.entity_count])
          ) },
          { name: `${root}inventory/areas.csv`, content: this._backupCsvText(
            ["area_id", "area", "entity_count", "device_count"],
            areaInventory.map((area) => [area.area_id, area.area, area.entity_count, area.device_count])
          ) },
          { name: `${root}inventory/integrations.csv`, content: this._backupCsvText(
            ["domain", "title", "version", "source", "entity_count"],
            integrationInventory.map((integration) => [integration.domain, integration.title, integration.version, integration.source, integration.entity_count])
          ) },
          { name: `${root}inventory/services.csv`, content: this._backupCsvText(
            ["service"], serviceResult.services.map((service) => [service])
          ) },
          { name: `${root}context/dependencies.yaml`, content: `${this._yamlValue(dependencies)}\n` },
          { name: `${root}context/automations.json`, content: `${JSON.stringify(automationIndex, null, 2)}\n` },
          { name: `${root}context/scripts.json`, content: `${JSON.stringify(scriptIndex, null, 2)}\n` },
          { name: `${root}context/automation_states.json`, content: `${JSON.stringify(automationIndex.map(({ id, alias, entity_id, enabled, status, source, managed_by, source_reason }) => ({ id, alias, entity_id, enabled, status, source, managed_by, source_reason })), null, 2)}\n` },
          { name: `${root}context/home_assistant.json`, content: `${JSON.stringify({ version: this._homeAssistantVersion(), installation_type: null, supervisor: null, architecture: null, source: "Home Assistant frontend runtime" }, null, 2)}\n` },
          { name: `${root}diagnostics/validation.txt`, content: this._backupValidationText(validation, content) },
          { name: `${root}diagnostics/validation.json`, content: `${JSON.stringify(validation, null, 2)}\n` },
          { name: `${root}diagnostics/missing_entities.yaml`, content: `${this._yamlValue({ missing_entities: missingEntities })}\n` },
          { name: `${root}diagnostics/missing_services.yaml`, content: `${this._yamlValue({ missing_services: missingServices })}\n` },
          { name: `${root}diagnostics/possible_versions.yaml`, content: `${this._yamlValue(this._possibleVersions(automationIndex))}\n` },
          { name: `${root}diagnostics/possible_conflicts.yaml`, content: `${this._yamlValue(this._possibleConflicts(dependencies))}\n` },
        ])
      );
      this._recordActivity("configuration_backup_exported", "info", String(content.automations + content.scripts));
    } catch (error) {
      this._recordActivity("configuration_backup_failed", "error", error?.name || "backup_export_failed");
      alert("The configuration backup could not be created. Check the action and error history, then try again.");
    } finally {
      this._automationExporting = null;
      this._render();
    }
  }

  async _exportAutomationPackage() {
    await this._exportConfigurationBackup();
  }

  _openAutomationEditor(item) {
    if (!item.edit_id) {
      this._showEntity(item.entity_id);
      return;
    }
    this._recordActivity("automation_editor_opened", "info", item.entity_id);
    const path = `/config/${item.kind}/edit/${encodeURIComponent(item.edit_id)}`;
    window.history.pushState(null, "", path);
    const event = new Event("location-changed", { bubbles: true, composed: true });
    event.detail = { replace: false };
    window.dispatchEvent(event);
  }

  _recordActivity(eventType, level = "info", detail = null) {
    if (!this._hass || !this._activityEnabled) return;
    const payload = { type: "entity_audit/log_activity", event_type: eventType, level };
    if (detail) payload.detail = String(detail).slice(0, 240);
    this._hass.callWS(payload).catch(() => undefined);
  }

  _labelDevices(rows) {
    const devices = new Map();
    for (const entity of rows) {
      if (!entity.device_id || !entity.ip_address) continue;
      const existing = devices.get(entity.ip_address);
      if (!existing || (!existing.mac_address && entity.mac_address)) {
        devices.set(entity.ip_address, entity);
      }
    }
    return [...devices.values()].sort((a, b) =>
      (a.device_name || a.name).localeCompare(b.device_name || b.name)
    );
  }

  _isQrLibrary(value) {
    return typeof value === "function" && Boolean(value.stringToBytesFuncs?.["UTF-8"]);
  }

  _loadQrLibrary() {
    if (this._isQrLibrary(window.qrcode)) {
      window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs["UTF-8"];
      return Promise.resolve(window.qrcode);
    }
    if (this._qrLibraryPromise) return this._qrLibraryPromise;
    this._qrLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/entity_audit/qrcode.js?v=0.3.12";
      script.dataset.entityAuditQr = "true";
      script.addEventListener("load", () => {
        if (!this._isQrLibrary(window.qrcode)) {
          reject(new Error("QR library did not initialize"));
          return;
        }
        window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs["UTF-8"];
        resolve(window.qrcode);
      }, { once: true });
      script.addEventListener("error", () => reject(new Error("QR library could not be loaded")), { once: true });
      document.head.appendChild(script);
    }).catch((error) => {
      this._qrLibraryPromise = null;
      throw error;
    });
    return this._qrLibraryPromise;
  }

  _labelQrPayload(entity) {
    // Štítek entity obsahuje stabilní ID, aby fungoval i bez zařízení a IP.
    if (entity._entityLabel) return JSON.stringify({ name: entity.name, entity_id: entity.entity_id });
    return JSON.stringify({
      name: entity.device_name || entity.name,
      ip_address: entity.ip_address,
      mac_address: entity.mac_address || null,
      manufacturer: entity.manufacturer || null,
      area: entity.area_name || null,
    });
  }

  _loadQrReaderLibrary() {
    if (typeof window.jsQR === "function") return Promise.resolve(window.jsQR);
    if (this._qrReaderLibraryPromise) return this._qrReaderLibraryPromise;
    this._qrReaderLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/entity_audit/jsQR.js?v=0.3.12";
      script.dataset.entityAuditQrReader = "true";
      script.addEventListener("load", () => {
        if (typeof window.jsQR !== "function") {
          reject(new Error("QR reader library did not initialize"));
          return;
        }
        resolve(window.jsQR);
      }, { once: true });
      script.addEventListener("error", () => reject(new Error("QR reader library could not be loaded")), { once: true });
      document.head.appendChild(script);
    }).catch((error) => {
      this._qrReaderLibraryPromise = null;
      throw error;
    });
    return this._qrReaderLibraryPromise;
  }

  _parseLabelQr(rawValue) {
    if (typeof rawValue !== "string" || rawValue.length > 4096) {
      throw new Error("Invalid QR payload");
    }
    const value = JSON.parse(rawValue);
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error("Invalid QR payload");
    }
    const readField = (name, required = false) => {
      const field = value[name];
      if (field == null && !required) return null;
      if (typeof field !== "string") throw new Error("Invalid QR payload");
      const normalized = field.trim().slice(0, 256);
      if (required && !normalized) throw new Error("Invalid QR payload");
      return normalized || null;
    };
    if (value.entity_id != null) {
      const entityId = readField("entity_id", true);
      if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(entityId)) throw new Error("Invalid entity ID");
      return { name: readField("name", true), entity_id: entityId };
    }
    return {
      name: readField("name", true),
      ip_address: readField("ip_address", true),
      mac_address: readField("mac_address"),
      manufacturer: readField("manufacturer"),
      area: readField("area"),
    };
  }

  _matchScannedDevice(label) {
    if (label.entity_id) return null;
    const entitiesWithDevice = this._entities.filter((entity) => entity.device_id);
    const findUniqueDevice = (predicate) => {
      const matches = [...new Map(
        entitiesWithDevice.filter(predicate).map((entity) => [entity.device_id, entity])
      ).values()];
      return matches.length === 1 ? matches[0] : null;
    };
    const normalizeMac = (value) => String(value || "").toLocaleLowerCase().replace(/[^0-9a-f]/g, "");
    const scannedMac = normalizeMac(label.mac_address);
    if (scannedMac) {
      const byMac = findUniqueDevice((entity) => normalizeMac(entity.mac_address) === scannedMac);
      if (byMac) return byMac;
    }
    if (label.ip_address) {
      const byIp = findUniqueDevice((entity) => entity.ip_address === label.ip_address);
      if (byIp) return byIp;
    }
    return null;
  }

  _acceptScannedQr(rawValue) {
    try {
      const label = this._parseLabelQr(rawValue);
      this._scanResult = label;
      this._scanMatchedDevice = this._matchScannedDevice(label);
      this._scannerError = null;
      this._stopScannerCamera();
      navigator.vibrate?.(80);
      this._recordActivity(
        "qr_label_scanned",
        "info",
        this._scanMatchedDevice ? "matched" : "not_matched"
      );
      this._renderScannerDialog();
      return true;
    } catch (_error) {
      this._scannerError = "This QR code is not a label created by Entity Audit.";
      this._recordActivity("qr_label_rejected", "error");
      this._renderScannerDialog();
      return false;
    }
  }

  _decodeScannerCanvas(canvas, inversionAttempts = "dontInvert") {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return window.jsQR(image.data, image.width, image.height, { inversionAttempts });
  }

  _scanCameraFrame(timestamp = 0) {
    if (!this._scannerOpen || !this._scannerStream || this._scanResult) return;
    if (typeof window.jsQR !== "function") {
      this._scannerFrame = requestAnimationFrame((nextTimestamp) => this._scanCameraFrame(nextTimestamp));
      return;
    }
    const video = this.shadowRoot.querySelector("#scanner-video");
    if (video?.readyState >= 2 && timestamp - this._lastScanTime >= 200) {
      this._lastScanTime = timestamp;
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      const scale = Math.min(1, 960 / Math.max(sourceWidth, sourceHeight));
      const canvas = this._scannerCanvas || document.createElement("canvas");
      this._scannerCanvas = canvas;
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const code = this._decodeScannerCanvas(canvas);
      if (code?.data && this._acceptScannedQr(code.data)) return;
    }
    this._scannerFrame = requestAnimationFrame((nextTimestamp) => this._scanCameraFrame(nextTimestamp));
  }

  _attachScannerStream() {
    const video = this.shadowRoot.querySelector("#scanner-video");
    if (!video || !this._scannerStream) return;
    if (this._scannerFrame != null) cancelAnimationFrame(this._scannerFrame);
    this._scannerFrame = null;
    video.srcObject = this._scannerStream;
    video.play().then(() => {
      this._scannerFrame = requestAnimationFrame((timestamp) => this._scanCameraFrame(timestamp));
    }).catch((error) => {
      this._stopScannerCamera();
      this._scannerError = "The camera preview could not start. Use a photo instead.";
      this._recordActivity("qr_camera_failed", "error", error?.name || "preview_failed");
      this._renderScannerDialog();
    });
  }

  _cameraAccessMessage(error) {
    if (!window.isSecureContext) {
      return "Live camera access requires a secure HTTPS connection. Use HTTPS or scan a QR-code photo.";
    }
    if (error?.name === "NotAllowedError") {
      return "Camera access was denied. Allow camera access for the Home Assistant app in iOS Settings.";
    }
    if (error?.name === "NotReadableError") {
      return "Another app is using the camera. Close it and try again.";
    }
    if (error?.name === "NotFoundError") {
      return "No camera is available on this device.";
    }
    return "The camera cannot be opened. Allow camera access or use a photo.";
  }

  _hasLiveCameraApi() {
    return Boolean(
      window.isSecureContext
      && typeof navigator.mediaDevices?.getUserMedia === "function"
    );
  }

  _cameraWaitSecondsValue() {
    return Math.min(30, Math.max(1, Number(this._cameraWaitSeconds) || 5));
  }

  _clearCameraWaitTimer() {
    if (this._cameraWaitTimer !== null) clearTimeout(this._cameraWaitTimer);
    this._cameraWaitTimer = null;
  }

  _scheduleCameraWaitTimer() {
    this._clearCameraWaitTimer();
    const waitSeconds = this._cameraWaitSecondsValue();
    this._cameraWaitTimer = setTimeout(() => {
      this._cameraWaitTimer = null;
      if (!this._scannerOpen || !this._scannerStarting) return;
      this._scannerStarting = false;
      this._scannerTimedOut = true;
      this._scannerError = `The camera did not open within ${waitSeconds} seconds. Try again or scan a QR-code photo.`;
      this._recordActivity("qr_camera_timed_out", "error", `wait_seconds=${waitSeconds}`);
      this._renderScannerDialog();
    }, waitSeconds * 1000);
  }

  _scannerDialogContent() {
    const liveCameraAvailable = this._hasLiveCameraApi();
    const waitSeconds = this._cameraWaitSecondsValue();
    return `<div class="dialog-head"><div><h2>${"QR label scanner"}</h2><div class="entity-id">${"Scan a label created by Entity Audit"}</div></div><button id="close-scanner" aria-label="${"Close scanner"}">✕</button></div>
      <div class="scanner-body">
        ${this._scanResult ? `<section class="virtual-label">
          <h3>${this._escape(this._scanResult.name)}</h3>
          ${this._scanResult.entity_id ? `<dl class="label-detail"><dt>Entita</dt><dd>${this._escape(this._scanResult.entity_id)}</dd></dl>` : `<dl class="label-detail">
            <dt>${"IP address"}</dt><dd>${this._escape(this._scanResult.ip_address || "—")}</dd>
            <dt>${"MAC address"}</dt><dd>${this._escape(this._scanResult.mac_address || "—")}</dd>
            <dt>${"Manufacturer"}</dt><dd>${this._escape(this._scanResult.manufacturer || "—")}</dd>
            <dt>${"Area"}</dt><dd>${this._escape(this._scanResult.area || "—")}</dd>
          </dl>`}
        </section>
        ${this._scanResult.entity_id ? `<div class="${this._entities.some((item) => item.entity_id === this._scanResult.entity_id) ? "match-ok" : "match-missing"}">${this._entities.some((item) => item.entity_id === this._scanResult.entity_id) ? "Entita byla nalezena." : "Entita nebyla nalezena."}</div>` : `<div class="${this._scanMatchedDevice ? "match-ok" : "match-missing"}">${this._scanMatchedDevice
          ? "The device was found in the current inventory."
          : "The device could not be uniquely matched in the current inventory."}</div>`}
        <div class="scanner-actions">
          ${this._scanResult.entity_id && this._entities.some((item) => item.entity_id === this._scanResult.entity_id) ? `<button id="open-scanned-entity">Otevřít entitu</button>` : ""}
          ${this._scanMatchedDevice ? `<button id="filter-scanned-device">${"Show its entities"}</button><a id="open-scanned-device" class="primary-link" href="/config/devices/device/${this._escape(this._scanMatchedDevice.device_id)}">${"Open device page"}</a>` : ""}
          <button id="scan-again">${"Scan again"}</button>
        </div>` : `${liveCameraAvailable && !this._scannerTimedOut ? `<div class="camera-stage"><video id="scanner-video" muted playsinline></video><div class="camera-guide"></div><div class="camera-hint">${this._scannerStarting ? `Waiting for camera permission (up to ${waitSeconds} s)…` : "Place the QR code inside the frame"}</div></div>` : `<div class="scanner-note">${this._scannerTimedOut ? "The live camera did not open in the configured time. You can retry it or scan a QR-code photo." : "Live camera access is unavailable in this connection. Scan a QR-code photo or file instead."}</div>`}`}
          ${this._scannerError ? `<div class="scanner-error">${this._escape(this._scannerError)}</div>` : ""}
          ${!this._scanResult ? `<div class="scanner-actions">${this._scannerTimedOut ? `<button id="retry-camera">${"Try camera again"}</button>` : ""}<label class="file-button">${this._scanningImage ? "Processing image…" : "Take a QR-code photo"}<input id="scan-camera-image" type="file" accept="image/*" capture="environment" ${this._scanningImage ? "disabled" : ""}></label><label class="file-button">${"Select a QR-code file"}<input id="scan-image" type="file" accept="image/*" ${this._scanningImage ? "disabled" : ""}></label></div>` : ""}
      </div>`;
  }

  _renderScannerDialog() {
    if (!this._scannerOpen) return;
    if (!this._scannerDialog || !this._scannerDialog.isConnected) {
      this._scannerDialog = document.createElement("dialog");
      this._scannerDialog.className = "scanner-dialog";
      this.shadowRoot.appendChild(this._scannerDialog);
    }
    this._scannerDialog.innerHTML = this._scannerDialogContent();
    if (!this._scannerDialog.open) {
      try {
        this._scannerDialog.showModal();
      } catch (_error) {
        // The attribute remains a safe fallback for older embedded web views.
        this._scannerDialog.setAttribute("open", "");
      }
    }
    this._scannerDialog.querySelector("#close-scanner")?.addEventListener("click", () => this._closeScanner());
    this._scannerDialog.querySelector("#scan-again")?.addEventListener("click", () => this._startScanner());
    this._scannerDialog.querySelector("#retry-camera")?.addEventListener("click", () => this._startScanner());
    this._scannerDialog.querySelector("#filter-scanned-device")?.addEventListener("click", () => this._filterToScannedDevice());
    this._scannerDialog.querySelector("#open-scanned-entity")?.addEventListener("click", () => {
      const entityId = this._scanResult?.entity_id;
      this._closeScanner();
      if (entityId) this._showEntity(entityId);
    });
    this._scannerDialog.querySelector("#open-scanned-device")?.addEventListener("click", () => this._recordActivity("scanned_device_page_opened", "info", this._scanMatchedDevice?.device_id));
    this._scannerDialog.querySelector("#scan-camera-image")?.addEventListener("change", (event) => this._scanImageFile(event.target.files?.[0]));
    this._scannerDialog.querySelector("#scan-image")?.addEventListener("change", (event) => this._scanImageFile(event.target.files?.[0]));
    if (this._scannerStream && !this._scanResult && !this._scanningImage) this._attachScannerStream();
  }

  _removeScannerDialog() {
    if (this._scannerDialog?.open) this._scannerDialog.close();
    this._scannerDialog?.remove();
    this._scannerDialog = null;
  }

  async _startScanner() {
    this._stopScannerCamera();
    this._scannerOpen = true;
    this._scannerError = null;
    this._scanResult = null;
    this._scanMatchedDevice = null;
    this._scannerStarting = true;
    this._scannerReaderFailed = false;
    this._scannerTimedOut = false;

    // Request the camera before any rendering or async library loading. iOS may
    // require getUserMedia to run directly in the button's user gesture.
    let cameraRequest = null;
    if (this._hasLiveCameraApi()) {
      try {
        cameraRequest = navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
      } catch (error) {
        cameraRequest = Promise.reject(error);
      }
    }
    this._recordActivity("qr_scanner_opened");
    const cameraEnvironment = [
      `protocol=${window.location?.protocol || "unknown"}`,
      `secure_context=${Boolean(window.isSecureContext)}`,
      `media_devices=${Boolean(navigator.mediaDevices)}`,
      `get_user_media=${typeof navigator.mediaDevices?.getUserMedia === "function"}`,
      `visibility=${typeof document === "undefined" ? "unknown" : document.visibilityState}`,
    ].join(", ");
    this._recordActivity("qr_camera_environment", "info", cameraEnvironment);
    if (cameraRequest) this._recordActivity("qr_camera_requested");
    const readerRequest = this._loadQrReaderLibrary();
    this._renderScannerDialog();
    if (cameraRequest) this._scheduleCameraWaitTimer();

    readerRequest.catch((error) => {
      if (!this._scannerOpen) return;
      this._scannerReaderFailed = true;
      this._scannerStarting = false;
      this._clearCameraWaitTimer();
      this._stopScannerCamera();
      this._scannerError = "The QR reader could not be loaded. Reload the updated panel and try again.";
      this._recordActivity("qr_reader_failed", "error", error?.name || "load_failed");
      this._renderScannerDialog();
    });

    if (!cameraRequest) {
      this._scannerStarting = false;
      this._clearCameraWaitTimer();
      this._scannerError = this._cameraAccessMessage();
      this._recordActivity("qr_camera_failed", "error", "media_devices_unavailable");
      this._renderScannerDialog();
      return;
    }

    try {
      const stream = await cameraRequest;
      if (!this._scannerOpen || this._scannerTimedOut) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (this._scannerReaderFailed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this._scannerStream = stream;
      this._scannerStarting = false;
      this._clearCameraWaitTimer();
      this._recordActivity("qr_camera_started");
      this._renderScannerDialog();
    } catch (error) {
      if (!this._scannerOpen || this._scannerReaderFailed) return;
      this._scannerStarting = false;
      this._clearCameraWaitTimer();
      this._scannerError = this._cameraAccessMessage(error);
      this._recordActivity("qr_camera_failed", "error", error?.name || "unknown_error");
      this._renderScannerDialog();
    }
  }

  _stopScannerCamera() {
    this._clearCameraWaitTimer();
    if (this._scannerFrame != null) cancelAnimationFrame(this._scannerFrame);
    this._scannerFrame = null;
    if (this._scannerStream) {
      this._scannerStream.getTracks().forEach((track) => track.stop());
      this._scannerStream = null;
    }
  }

  _closeScanner() {
    this._stopScannerCamera();
    this._scannerOpen = false;
    this._scannerError = null;
    this._scannerStarting = false;
    this._scannerReaderFailed = false;
    this._scannerTimedOut = false;
    this._scanResult = null;
    this._scanMatchedDevice = null;
    this._removeScannerDialog();
    this._render();
  }

  async _scanImageFile(file) {
    if (!file) return;
    this._recordActivity("qr_photo_requested");
    this._clearCameraWaitTimer();
    this._scannerStarting = false;
    if ((file.type && !file.type.startsWith("image/")) || file.size > 20_000_000) {
      this._scannerError = "Select a QR-code image no larger than 20 MB.";
      this._renderScannerDialog();
      return;
    }
    this._scanningImage = true;
    this._scannerError = null;
    if (this._scannerFrame != null) cancelAnimationFrame(this._scannerFrame);
    this._scannerFrame = null;
    this._renderScannerDialog();
    try {
      await this._loadQrReaderLibrary();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(reader.result), { once: true });
        reader.addEventListener("error", () => reject(reader.error), { once: true });
        reader.readAsDataURL(file);
      });
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.addEventListener("load", () => resolve(element), { once: true });
        element.addEventListener("error", reject, { once: true });
        element.src = dataUrl;
      });
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const code = this._decodeScannerCanvas(canvas, "attemptBoth");
      if (!code?.data) {
        this._scannerError = "No readable QR code was found in the image.";
        this._recordActivity("qr_photo_failed", "error", "no_code_found");
      } else {
        this._acceptScannedQr(code.data);
      }
    } catch (error) {
      this._scannerError = "The image could not be loaded or processed.";
      this._recordActivity("qr_photo_failed", "error", error?.name || "processing_failed");
    } finally {
      this._scanningImage = false;
      this._renderScannerDialog();
    }
  }

  _filterToScannedDevice() {
    if (!this._scanMatchedDevice) return;
    this._recordActivity("scanned_device_filtered", "info", this._scanMatchedDevice.device_id);
    this._device = this._scanMatchedDevice.device_id;
    this._filter = "";
    this._manufacturer = "";
    this._model = "";
    this._platform = "";
    this._area = "";
    this._domain = "";
    this._audit = "";
    this._problemOnly = false;
    this._groupBy = "device";
    this._filtersOpen = true;
    this._closeScanner();
  }

  _drawQr(context, data, x, y, size) {
    const code = window.qrcode(0, "M");
    code.addData(data, "Byte");
    code.make();
    const moduleCount = code.getModuleCount();
    const quietZone = 4;
    // Kód větší než přidělená oblast by se nevešel ani při jednom pixelu
    // na modul. Selžeme před odesláním místo oříznutého nečitelného QR.
    if (moduleCount + quietZone * 2 > size) throw new Error("QR kód je příliš složitý pro vybranou velikost štítku.");
    const cellSize = Math.max(1, Math.floor(size / (moduleCount + (quietZone * 2))));
    const qrSize = cellSize * (moduleCount + (quietZone * 2));
    const left = Math.round(x + ((size - qrSize) / 2));
    const top = Math.round(y + ((size - qrSize) / 2));

    context.save();
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#ffffff";
    context.fillRect(left, top, qrSize, qrSize);
    context.fillStyle = "#000000";
    for (let row = 0; row < moduleCount; row += 1) {
      for (let column = 0; column < moduleCount; column += 1) {
        if (code.isDark(row, column)) {
          context.fillRect(
            left + ((column + quietZone) * cellSize),
            top + ((row + quietZone) * cellSize),
            cellSize,
            cellSize
          );
        }
      }
    }
    context.restore();
  }

  _revokeLabelPdf() {
    if (this._labelPdf?.url) URL.revokeObjectURL(this._labelPdf.url);
    this._labelPdf = null;
  }

  _dataUrlToBytes(dataUrl) {
    const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  _truncateCanvasText(context, value, maxWidth) {
    const text = String(value ?? "");
    if (context.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (truncated && context.measureText(`${truncated}…`).width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return `${truncated}…`;
  }

  _wrapCanvasText(context, value, maxWidth, maxLines) {
    const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || context.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(this._truncateCanvasText(context, line, maxWidth));
        line = word;
      }
      if (lines.length === maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(this._truncateCanvasText(context, line, maxWidth));
    if (!lines.length) lines.push("—");
    return lines.slice(0, maxLines);
  }

  _canvasTextLines(context, value, maxWidth, maxLines) {
    const text = String(value ?? "").trim();
    if (!text) return { lines: ["—"], complete: true };
    const lines = [];
    let line = "";
    for (const character of Array.from(text)) {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line.trimEnd());
        if (lines.length === maxLines) return { lines, complete: false };
        line = character.trimStart();
      } else {
        line = candidate;
      }
    }
    if (line || !lines.length) lines.push(line.trimEnd() || "—");
    return { lines: lines.slice(0, maxLines), complete: true };
  }

  // Přizpůsobí název šířce štítku: postupně zmenšuje písmo a zalamuje do zadaného počtu řádků; pokud se text nevejde, vrátí nejmenší velikost.
  _fitLabelTitle(context, value, maxWidth, maxLines, maximumSize, minimumSize) {
    for (let size = maximumSize; size >= minimumSize; size -= 1) {
      context.font = `700 ${size}px Arial, sans-serif`;
      const wrapped = this._canvasTextLines(context, value, maxWidth, maxLines);
      if (wrapped.complete) return { ...wrapped, size };
    }
    context.font = `700 ${minimumSize}px Arial, sans-serif`;
    return { ...this._canvasTextLines(context, value, maxWidth, maxLines), size: minimumSize };
  }

  _drawPdfLabel(context, x, y, width, height, entity, variant) {
    const padding = Math.max(10, Math.round(Math.min(width, height) * 0.06));
    const titleSize = Math.max(14, Math.min(28, Math.round(height * 0.105)));
    const textSize = Math.max(10, Math.min(18, Math.round(height * 0.058)));
    const lineHeight = Math.round(textSize * 1.38);
    const unavailable = "not available";
    const manufacturerLabel = "Manufacturer";
    const areaLabel = "Area";

    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, width, height);
    context.strokeStyle = "#111827";
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, width - 2, height - 2);
    if (variant === "qr") {
      const qrSize = Math.min(width, height) - (padding * 2);
      this._drawQr(
        context,
        this._labelQrPayload(entity),
        x + ((width - qrSize) / 2),
        y + ((height - qrSize) / 2),
        qrSize
      );
      context.restore();
      return;
    }

    const combinedQrSize = variant === "text_qr"
      ? Math.min(height - (padding * 2), Math.round(width * 0.38))
      : 0;
    const textWidth = width - (padding * 2) - (combinedQrSize ? combinedQrSize + padding : 0);
    context.fillStyle = "#111827";
    const title = this._fitLabelTitle(
      context,
      entity.device_name || entity.name,
      textWidth,
      2,
      titleSize,
      Math.max(10, Math.round(titleSize * 0.55))
    );
    let cursor = y + padding;
    context.font = `700 ${title.size}px Arial, sans-serif`;
    for (const line of title.lines) {
      cursor += title.size;
      context.fillText(line, x + padding, cursor);
      cursor += Math.round(title.size * 0.16);
    }
    cursor += Math.max(3, Math.round(height * 0.025));
    context.font = `600 ${textSize}px Arial, sans-serif`;
    const fields = [
      ["IP", entity.ip_address],
      ["MAC", entity.mac_address || unavailable],
      [manufacturerLabel, entity.manufacturer || unavailable],
      [areaLabel, entity.area_name || unavailable],
    ];
    for (const [label, value] of fields) {
      if (cursor > y + height - padding) break;
      context.fillText(
        this._truncateCanvasText(context, `${label}: ${value}`, textWidth),
        x + padding,
        cursor
      );
      cursor += lineHeight;
    }
    if (combinedQrSize) {
      this._drawQr(
        context,
        this._labelQrPayload(entity),
        x + width - padding - combinedQrSize,
        y + padding,
        combinedQrSize
      );
    }
    context.restore();
  }

  _buildLabelsPdf(devices, labelWidth, labelHeight) {
    const dpi = 150;
    const pageWidth = 1240;
    const pageHeight = 1754;
    const margin = Math.round((8 / 25.4) * dpi);
    const gap = Math.round((3 / 25.4) * dpi);
    const labelWidthPx = Math.round((labelWidth / 25.4) * dpi);
    const labelHeightPx = Math.round((labelHeight / 25.4) * dpi);
    const columns = Math.max(1, Math.floor((pageWidth - (margin * 2) + gap) / (labelWidthPx + gap)));
    const rows = Math.max(1, Math.floor((pageHeight - (margin * 2) + gap) / (labelHeightPx + gap)));
    const perPage = columns * rows;
    const pages = [];

    for (let start = 0; start < devices.length; start += perPage) {
      const canvas = document.createElement("canvas");
      canvas.width = pageWidth;
      canvas.height = pageHeight;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageWidth, pageHeight);
      devices.slice(start, start + perPage).forEach((entity, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        this._drawPdfLabel(
          context,
          margin + (column * (labelWidthPx + gap)),
          margin + (row * (labelHeightPx + gap)),
          labelWidthPx,
          labelHeightPx,
          entity,
          this._labelVariant
        );
      });
      pages.push(this._dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92)));
    }
    return this._assemblePdf(pages, pageWidth, pageHeight);
  }

  _brotherRollOptions() {
    // Dimensions are physical cross-roll width and feed length in millimetres.
    // Continuous rolls have no fixed length; PDF generation validates the
    // user-entered cut length independently of Home Assistant settings.
    if (this._brotherPrinter === "vc500w") {
      return [
        { id: "cz_1005", name: "CZ-1005 — 50 mm continuous", width: 50, length: null },
        { id: "cz_1004", name: "CZ-1004 — 25 mm continuous", width: 25, length: null },
        { id: "cz_1003", name: "CZ-1003 — 19 mm continuous", width: 19, length: null },
        { id: "cz_1002", name: "CZ-1002 — 12 mm continuous", width: 12, length: null },
        { id: "cz_1001", name: "CZ-1001 — 9 mm continuous", width: 9, length: null },
      ];
    }
    return [
      { id: "dk_22205", name: "DK-22205 — 62 mm continuous", width: 62, length: null },
      { id: "dk_22210", name: "DK-22210 — 29 mm continuous", width: 29, length: null },
      { id: "dk_11209", name: "DK-11209 — 62 × 29 mm", width: 62, length: 29 },
      { id: "dk_11201", name: "DK-11201 — 29 × 90 mm", width: 29, length: 90 },
      { id: "dk_11202", name: "DK-11202 — 62 × 100 mm", width: 62, length: 100 },
    ];
  }

  _brotherLabelFormat() {
    const roll = this._brotherRollOptions().find((item) => item.id === this._brotherRoll);
    if (!roll) throw new Error("Select a supported roll for this Brother printer.");
    const length = roll.length ?? Number(this._brotherLength);
    if (!Number.isInteger(length) || (roll.length === null && length < 30) || length > 300) {
      throw new Error("Enter a label length between 30 and 300 mm.");
    }
    if (roll.width < 25 && this._labelVariant !== "text") {
      throw new Error("Select text-only labels in integration settings for rolls narrower than 25 mm, or choose a wider roll for a readable QR code.");
    }
    return { ...roll, length, dpi: this._brotherPrinter === "vc500w" ? 313 : 300 };
  }

  _drawBrotherLabel(context, width, height, entity) {
    // Render in landscape for readable text, while keeping the PDF page in
    // physical roll orientation. Callers rotate portrait media before drawing.
    // The same full QR payload remains compatible with existing label scanning.
    const margin = Math.min(24, Math.round(height * 0.07));
    const variant = this._labelVariant;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    if (entity._entityLabel) {
      // ID entity se nesmí nahradit IP zařízení. Dlouhé hodnoty zalomíme a
      // zmenšíme, QR obsahuje úplné ID i v případě, že je text velmi dlouhý.
      const qrSize = variant === "text" ? 0 : variant === "qr"
        ? Math.min(width, height) - margin * 2 : Math.min(height - margin * 2, Math.floor(width * 0.44));
      if (variant !== "qr") {
        const textWidth = width - margin * 2 - (qrSize ? qrSize + margin : 0);
        let cursor = margin;
        for (const [text, weight, max] of [[entity.name, "700", 42], [entity.entity_id, "600", 27]]) {
          const fitted = this._fitLabelTitle(context, text, textWidth, 3, max, 11);
          context.fillStyle = "#000000";
          context.font = `${weight} ${fitted.size}px Arial, sans-serif`;
          for (const line of fitted.lines) {
            cursor += fitted.size;
            context.fillText(line, margin, cursor);
            cursor += 4;
          }
        }
      }
      if (qrSize) this._drawQr(context, this._labelQrPayload(entity),
        variant === "qr" ? (width - qrSize) / 2 : width - margin - qrSize,
        (height - qrSize) / 2, qrSize);
      return;
    }
    if (height < 240 && variant === "text") {
      // On narrow CZ tape, use the long axis and two columns for the four
      // fields. This preserves MAC, manufacturer and area within the height.
      const title = this._fitLabelTitle(context, entity.device_name || entity.name,
        width - margin * 2, 2, Math.min(34, Math.round(height * 0.18)), 12);
      context.fillStyle = "#000000";
      context.font = `700 ${title.size}px Arial, sans-serif`;
      let cursor = margin;
      for (const line of title.lines) {
        cursor += title.size;
        context.fillText(line, margin, cursor);
        cursor += 3;
      }
      const columns = [
        [`IP: ${entity.ip_address}`, `MAC: ${entity.mac_address || "not available"}`],
        [`Mfr: ${entity.manufacturer || "not available"}`, `Area: ${entity.area_name || "not available"}`],
      ];
      const fontSize = Math.min(24, Math.round(height * 0.14));
      const columnWidth = (width - margin * 3) / 2;
      context.font = `600 ${fontSize}px Arial, sans-serif`;
      for (const row of columns) {
        cursor += fontSize + 3;
        row.forEach((value, index) => context.fillText(
          this._truncateCanvasText(context, value, columnWidth),
          margin + index * (columnWidth + margin), cursor
        ));
      }
      return;
    }
    if (variant === "qr") {
      const size = Math.min(width, height) - margin * 2;
      this._drawQr(context, this._labelQrPayload(entity), (width - size) / 2, (height - size) / 2, size);
      return;
    }
    // Rozložení počítáme z celé tisknutelné plochy, nikoli z pevného počtu
    // pixelů. QR je větší a uprostřed výšky; čtyři řádky rozdělíme až ke
    // spodnímu okraji. Dlouhé hodnoty se přizpůsobí dostupné šířce.
    const qrSize = variant === "text_qr" ? Math.min(height - margin * 2, Math.floor(width * 0.44)) : 0;
    const textWidth = width - margin * 2 - (qrSize ? qrSize + margin : 0);
    const title = this._fitLabelTitle(context, entity.device_name || entity.name, textWidth, 2, Math.max(18, Math.floor(height * 0.15)), 18);
    context.fillStyle = "#000000";
    context.font = `700 ${title.size}px Arial, sans-serif`;
    let cursor = margin;
    for (const line of title.lines) {
      cursor += title.size;
      context.fillText(line, margin, cursor);
      cursor += 6;
    }
    const fields = [
      `IP: ${entity.ip_address}`,
      `MAC: ${entity.mac_address || "not available"}`,
      `Manufacturer: ${entity.manufacturer || "not available"}`,
      `Area: ${entity.area_name || "not available"}`,
    ];
    const rowHeight = Math.max(1, (height - margin - cursor) / fields.length);
    for (const field of fields) {
      let size = Math.max(14, Math.min(48, Math.floor(rowHeight * 0.72)));
      context.font = `600 ${size}px Arial, sans-serif`;
      while (size > 14 && context.measureText(field).width > textWidth) {
        size -= 1;
        context.font = `600 ${size}px Arial, sans-serif`;
      }
      cursor += rowHeight;
      context.fillText(this._truncateCanvasText(context, field, textWidth), margin, cursor);
    }
    if (qrSize) {
      this._drawQr(context, this._labelQrPayload(entity), width - margin - qrSize, (height - qrSize) / 2, qrSize);
    }
  }

  _buildBrotherLabelsPdf(devices, format) {
    // One raster per device at the printer's resolution (300 / 313 dpi);
    // PDF MediaBox uses exact millimetres
    // converted to points. No request is sent to the printer by this export.
    const width = Math.round(format.width / 25.4 * format.dpi);
    const height = Math.round(format.length / 25.4 * format.dpi);
    const pages = devices.map((entity) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.save();
      if (height > width) {
        context.translate(0, height);
        context.rotate(-Math.PI / 2);
        this._drawBrotherLabel(context, height, width, entity);
      } else {
        this._drawBrotherLabel(context, width, height, entity);
      }
      context.restore();
      return this._dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.96));
    });
    return this._assemblePdf(pages, width, height, format.width / 25.4 * 72, format.length / 25.4 * 72);
  }

  _packMonochrome(image) {
    // Packed MSB-first black pixels, one byte-aligned row at a time. Head
    // offsets and native commands are added by the server, not by the browser.
    const stride = Math.ceil(image.width / 8);
    const packed = new Uint8Array(stride * image.height);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const offset = (y * image.width + x) * 4;
        const brightness = image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114;
        if (brightness < 128 && image.data[offset + 3] >= 128) {
          packed[y * stride + Math.floor(x / 8)] |= 0x80 >> (x % 8);
        }
      }
    }
    let binary = "";
    for (let offset = 0; offset < packed.length; offset += 8192) {
      binary += String.fromCharCode(...packed.subarray(offset, offset + 8192));
    }
    return btoa(binary);
  }

  _brotherDirectImage(entity, format, model) {
    // QL uses its printable dot rectangle, excluding the native head/feed
    // margins; VC vivid mode uses 313 cross-web and 317 feed dots per inch.
    // Both renderers keep the same device fields and complete QR payload.
    const qlGeometry = {
      dk_22205: [696, Math.round(format.length / 25.4 * 300) - 70],
      dk_22210: [306, Math.round(format.length / 25.4 * 300) - 70],
      dk_11209: [696, 271], dk_11201: [306, 991], dk_11202: [696, 1109],
    };
    const [width, height] = model === "ql820nwb" ? qlGeometry[format.id] : [
      Math.round(format.width / 25.4 * 313), Math.round(format.length / 25.4 * 317),
    ];
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: model === "ql820nwb" });
    context.save();
    if (height > width) {
      context.translate(0, height);
      context.rotate(-Math.PI / 2);
      this._drawBrotherLabel(context, height, width, entity);
    } else {
      this._drawBrotherLabel(context, width, height, entity);
    }
    context.restore();
    return model === "ql820nwb"
      ? this._packMonochrome(context.getImageData(0, 0, width, height))
      : canvas.toDataURL("image/jpeg", 0.96).split(",")[1];
  }

  _brotherPairImage(items, format) {
    // Jediný JPEG pro 50mm CZ roli rozdělíme napříč páskou na dva pruhy.
    // Každý pruh má vlastní orientaci, QR a ochranný bílý předěl pro ruční
    // rozstřižení. Tiskárně se odešle jeden obrázek a jediný příkaz střihu.
    const width = Math.round(format.width / 25.4 * 313);
    const height = Math.round(format.length / 25.4 * 317);
    const gap = 6;
    const half = Math.floor((width - gap) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    items.forEach((item, index) => {
      context.save();
      context.translate(index ? width - half : 0, 0);
      context.beginPath();
      context.rect(0, 0, half, height);
      context.clip();
      if (height > half) {
        context.translate(0, height);
        context.rotate(-Math.PI / 2);
        this._drawBrotherLabel(context, height, half, item);
      } else {
        this._drawBrotherLabel(context, half, height, item);
      }
      context.restore();
    });
    return canvas.toDataURL("image/jpeg", 0.96).split(",")[1];
  }

  _setPairItem(entity, kind) {
    if (!kind) this._labelPair.delete(entity.entity_id);
    else if (!this._labelPair.has(entity.entity_id) && this._labelPair.size >= 2) {
      alert("V páru mohou být nejvýše dvě položky. Nejprve některou odeber.");
    } else if (kind === "entity" || (kind === "device" && entity.device_id && entity.ip_address)) {
      this._labelPair.set(entity.entity_id, kind);
    }
    this._render();
  }

  _openLabelEditor(selected) {
    // Pracovní kopie umožní změnit tištěný název bez změny entity ani
    // registru zařízení v HA. ID/IP zůstávají navázané na původní položku.
    this._labelEditor = selected.map(({ entity, kind }) => ({
      kind, entity: { ...entity },
      title: kind === "device" ? (entity.device_name || entity.name) : entity.name,
    }));
    this._render();
    this._refreshLabelPreview();
  }

  _editedLabelItems() {
    return this._labelEditor.map(({ entity, kind, title }) => ({
      ...entity, name: title.trim(), ...(kind === "device" ? { device_name: title.trim() } : { _entityLabel: true }),
    }));
  }

  async _refreshLabelPreview() {
    // Každá změna ruší starší asynchronní výsledek načítání QR knihovny.
    const sequence = this._previewSequence = (this._previewSequence || 0) + 1;
    const preview = this.shadowRoot.querySelector("#label-preview");
    const error = this.shadowRoot.querySelector("#label-preview-error");
    if (!preview || !this._labelEditor) return;
    try {
      if (this._labelEditor.some((item) => !item.title.trim())) throw new Error("Název štítku nesmí být prázdný.");
      const format = this._brotherLabelFormat();
      if (this._labelEditor.length === 2 && (this._brotherPrinter !== "vc500w" || format.id !== "cz_1005")) {
        throw new Error("Dvojice vyžaduje VC-500W a roli CZ-1005.");
      }
      if (this._labelVariant !== "text") await this._loadQrLibrary();
      const items = this._editedLabelItems();
      const data = items.length === 2 ? this._brotherPairImage(items, format)
        : this._brotherDirectImage(items[0], format, this._brotherPrinter);
      if (sequence !== this._previewSequence || !this._labelEditor) return;
      // QL používá binární rastrová data, proto JPEG náhled podporujeme jen
      // pro VC-500W; u QL zobrazíme jasné vysvětlení místo falešného náhledu.
      if (this._brotherPrinter !== "vc500w") {
        preview.removeAttribute("src");
        error.textContent = "Náhled obrázku je dostupný pro VC-500W.";
        return;
      }
      preview.src = `data:image/jpeg;base64,${data}`;
      error.textContent = "";
    } catch (exception) {
      if (sequence !== this._previewSequence) return;
      preview.removeAttribute("src");
      if (error) error.textContent = exception?.message || "Náhled nelze vytvořit.";
    }
  }

  async _saveLabelTemplate(overwrite = false) {
    const previous = this._labelTemplates.find((entry) => entry.id === this._labelTemplateId);
    if (overwrite && !previous) return;
    const name = prompt(overwrite ? "Název upravené šablony:" : "Název nové šablony:", previous?.name || "");
    if (name === null) return;
    try {
      const format = this._brotherLabelFormat();
      await this._hass.callWS({ type: "entity_audit/save_label_template",
        ...(overwrite ? { template_id: previous.id } : {}),
        template: { name, model: this._brotherPrinter, roll: format.id, length_mm: format.length, variant: this._labelVariant } });
      this._labelTemplates = await this._hass.callWS({ type: "entity_audit/list_label_templates" });
      this._render();
      this._refreshLabelPreview();
    } catch (error) { alert(error.message || "Šablonu nelze uložit."); }
  }

  async _deleteLabelTemplate() {
    const item = this._labelTemplates.find((entry) => entry.id === this._labelTemplateId);
    if (!item || !confirm(`Opravdu smazat šablonu „${item.name}“?`)) return;
    try {
      await this._hass.callWS({ type: "entity_audit/delete_label_template", template_id: item.id });
      this._labelTemplates = await this._hass.callWS({ type: "entity_audit/list_label_templates" });
      this._labelTemplateId = "";
      this._render();
      this._refreshLabelPreview();
    } catch (error) { alert(error.message || "Šablonu nelze smazat."); }
  }

  _applyLabelTemplate(id) {
    this._labelTemplateId = id;
    const item = this._labelTemplates.find((entry) => entry.id === id);
    if (item) {
      this._brotherPrinter = item.model;
      this._brotherRoll = item.roll;
      this._brotherLength = item.length_mm;
      this._labelVariant = item.variant;
    }
    this._render();
    this._refreshLabelPreview();
  }

  async _submitLabelEditor() {
    if (!this._labelEditor || this._labelEditor.some((item) => !item.title.trim())) {
      alert("Vyplň název každého štítku.");
      return;
    }
    const items = this._editedLabelItems();
    const selected = this._labelEditor;
    // Editor zůstává otevřený při zrušení potvrzení či chybě validace;
    // uzavře se až po potvrzení konkrétní tiskové úlohy.
    if (items.length === 2) await this._printBrotherPair(items);
    else await this._printRowLabel(items[0], selected[0].kind, true);
  }

  async _printBrotherPair(editedItems = null) {
    if (this._printingLabels || this._buildingLabels) return;
    const selected = [...this._labelPair].map(([id, kind]) => ({
      kind, entity: this._entities.find((item) => item.entity_id === id),
    }));
    if (selected.length !== 2 || selected.some(({ entity, kind }) => !entity || (kind === "device" && (!entity.device_id || !entity.ip_address)))) {
      alert("Vyber dvě dostupné entity nebo zařízení s IP adresou.");
      return;
    }
    if (!editedItems) {
      this._openLabelEditor(selected);
      return;
    }
    selected.forEach((item, index) => { item.entity = editedItems[index]; });
    if (this._brotherPrinter !== "vc500w" || this._brotherRoll !== "cz_1005" || !this._brotherPrinters.vc500w) {
      alert("Pro dvojici vyber nakonfigurovanou Brother VC-500W a 50mm roli CZ-1005.");
      return;
    }
    let format;
    try { format = this._brotherLabelFormat(); }
    catch (error) { alert(error.message); return; }
    const names = selected.map(({ entity, kind }) => kind === "entity"
      ? `Entita: ${entity.name} (${entity.entity_id})`
      : `Zařízení: ${entity.device_name || entity.name} (IP ${entity.ip_address})`);
    if (!confirm(`Vytisknout dva štítky vedle sebe na jednu pásku?\n\n${names.join("\n")}\nBrother VC-500W · CZ-1005 · délka ${format.length} mm\nŠtítky bude nutné rozstřihnout ručně.`)) return;
    this._labelEditor = null;
    const items = selected.map(({ entity, kind }) => kind === "entity" ? { ...entity, _entityLabel: true } : entity);
    this._printEntityId = null;
    this._printingLabels = true;
    this._printStatus = "Odesílám dvojici štítků…";
    this._render();
    try {
      if (this._labelVariant !== "text") await this._loadQrLibrary();
      const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) => v.toString(16).padStart(2, "0")).join("");
      const result = await this._hass.callWS({
        type: "entity_audit/print_label", request_id: requestId, model: "vc500w",
        roll: format.id, length_mm: format.length, image: this._brotherPairImage(items, format),
      });
      this._printStatus = result.state === "accepted"
        ? "Tiskárna přijala pásku se dvěma štítky. Zkontroluj tisk a odstřih."
        : result.state === "completed" ? "Tiskárna dokončila pásku se dvěma štítky."
        : result.message || "Výsledek není jistý. Před dalším tiskem zkontroluj tiskárnu.";
    } catch (error) {
      this._printStatus = `${error?.message || "Spojení se přerušilo."} Před dalším tiskem zkontroluj tiskárnu.`;
    } finally {
      // Při nejistém výsledku se nikdy automaticky neopakuje odeslání.
      this._printingLabels = false;
      this._render();
    }
  }

  async _printBrotherLabels(rows, singleEntity = false) {
    if (this._printingLabels || this._buildingLabels) return;
    const model = this._brotherPrinter;
    // Jednotlivá entita může existovat bez zařízení i IP; hromadný tisk
    // nadále deduplikuje zařízení podle IP a nemění své dosavadní chování.
    const devices = singleEntity ? rows.map((entity) => ({ ...entity, _entityLabel: true })) : this._labelDevices(rows);
    if (!devices.length) {
      this._printStatus = "None of the displayed devices has an available IP address.";
      this._render();
      return;
    }
    if (!this._brotherPrinters[model]) {
      this._printStatus = "Configure this printer's IP address in Entity Audit integration settings first.";
      this._render();
      return;
    }
    let completed = 0;
    let accepted = 0;
    let failure = "";
    this._printingLabels = true;
    this._stopPrintRun = false;
    try {
      const format = this._brotherLabelFormat();
      // One explicit click starts a run. Each label gets its own unique ID.
      // There is deliberately no reconnect/resend or automatic print retry.
      const runId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
      if (this._labelVariant !== "text") await this._loadQrLibrary();
      for (let index = 0; index < devices.length; index += 1) {
        if (this._stopPrintRun) break;
        this._printStatus = `Sending label ${index + 1} of ${devices.length}…`;
        this._render();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (this._stopPrintRun) break;
        const result = await this._hass.callWS({
          type: "entity_audit/print_label", request_id: `${runId}:${index}`,
          model, roll: format.id, length_mm: format.length,
          image: this._brotherDirectImage(devices[index], format, model),
        });
        if (result.state === "completed") completed += 1;
        else if (result.state === "accepted") accepted += 1;
        else {
          failure = result.message || "The print outcome is unknown. Check the printer before starting another run.";
          break;
        }
      }
    } catch (error) {
      failure = `${error?.message || "The print connection was interrupted."} Check the printer before starting another run.`;
    } finally {
      this._printingLabels = false;
      this._printStatus = `${completed} labels reported complete; ${accepted} labels accepted by printer.${this._stopPrintRun ? " Run stopped." : ""}${failure ? ` ${failure}` : ""}`;
      this._render();
    }
  }

  async _printRowLabel(entity, kind, edited = false) {
    if (this._printingLabels || this._buildingLabels) return;
    const model = this._brotherPrinter;
    if (kind === "device" && (!entity.device_id || !entity.ip_address)) {
      alert("Pro štítek zařízení chybí přiřazené zařízení nebo jeho IP adresa.");
      return;
    }
    if (!edited) {
      this._openLabelEditor([{ entity, kind }]);
      return;
    }
    if (!this._brotherPrinters[model]) {
      alert("Nejdříve nastav a vyber dostupnou tiskárnu Brother.");
      return;
    }
    let format;
    try { format = this._brotherLabelFormat(); }
    catch (error) { alert(error.message); return; }
    const printer = model === "vc500w" ? "Brother VC-500W" : "Brother QL-820NWB";
    const subject = kind === "entity" ? `entita: ${entity.name}\n${entity.entity_id}` : `zařízení: ${entity.device_name || entity.name}\nIP: ${entity.ip_address}`;
    if (!confirm(`Vytisknout jeden štítek?\n\n${subject}\nTiskárna: ${printer}\nRole: ${format.name}\nDélka: ${format.length} mm`)) return;
    this._labelEditor = null;
    this._printEntityId = entity.entity_id;
    await this._printBrotherLabels([entity], kind === "entity");
  }

  async _downloadBrotherLabelsPdf(rows) {
    if (this._buildingLabels) return;
    const devices = this._labelDevices(rows);
    if (!devices.length) {
      alert("None of the displayed devices has an available IP address.");
      return;
    }
    let format;
    try {
      format = this._brotherLabelFormat();
    } catch (error) {
      alert(error.message);
      return;
    }
    this._buildingLabels = true;
    this._render();
    try {
      if (this._labelVariant !== "text") await this._loadQrLibrary();
      const blob = this._buildBrotherLabelsPdf(devices, format);
      this._revokeLabelPdf();
      this._labelPdf = {
        blob,
        filename: `entity-audit-brother-${this._brotherPrinter}-${format.id}-${format.width}x${format.length}mm-${new Date().toISOString().slice(0, 10)}.pdf`,
        url: URL.createObjectURL(blob),
        readyMessage: `Brother label PDF ready: ${format.width} × ${format.length} mm, ${devices.length} devices.`,
        shareTitle: "Brother device labels",
      };
      this._recordActivity("labels_pdf_created", "info", `brother_${format.id}:${devices.length}`);
    } catch (error) {
      alert("The Brother label PDF could not be created. Try again after reloading the panel.");
      this._recordActivity("labels_pdf_failed", "error", error?.name || "brother_build_failed");
    } finally {
      this._buildingLabels = false;
      this._render();
    }
  }

  _assemblePdf(pageImages, imageWidth, imageHeight, pageWidthPoints = 595.28, pageHeightPoints = 841.89) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let length = 0;
    const appendText = (value) => {
      const bytes = encoder.encode(value);
      chunks.push(bytes);
      length += bytes.length;
    };
    const appendBytes = (bytes) => {
      chunks.push(bytes);
      length += bytes.length;
    };
    const appendObject = (number, value) => {
      offsets[number] = length;
      appendText(`${number} 0 obj\n${value}\nendobj\n`);
    };
    const objectCount = 2 + (pageImages.length * 3);
    const pageReferences = pageImages.map((_, index) => `${3 + (index * 3)} 0 R`).join(" ");

    appendText("%PDF-1.4\n%EntityAudit\n");
    appendObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
    appendObject(2, `<< /Type /Pages /Kids [${pageReferences}] /Count ${pageImages.length} >>`);
    pageImages.forEach((image, index) => {
      const pageObject = 3 + (index * 3);
      const contentObject = pageObject + 1;
      const imageObject = pageObject + 2;
      const content = `q\n${pageWidthPoints} 0 0 ${pageHeightPoints} 0 0 cm\n/Im0 Do\nQ\n`;
      appendObject(pageObject, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPoints} ${pageHeightPoints}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
      appendObject(contentObject, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
      offsets[imageObject] = length;
      appendText(`${imageObject} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`);
      appendBytes(image);
      appendText("\nendstream\nendobj\n");
    });
    const xrefOffset = length;
    appendText(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
    for (let number = 1; number <= objectCount; number += 1) {
      appendText(`${String(offsets[number]).padStart(10, "0")} 00000 n \n`);
    }
    appendText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return new Blob(chunks, { type: "application/pdf" });
  }

  async _downloadLabelsPdf(rows) {
    const devices = this._labelDevices(rows);
    if (!devices.length) {
      alert("None of the displayed devices has an available IP address.");
      return;
    }

    const labelWidth = Math.min(190, Math.max(20, Number(this._labelWidth) || 60));
    const labelHeight = Math.min(280, Math.max(20, Number(this._labelHeight) || 38));
    this._buildingLabels = true;
    this._render();
    try {
      if (this._labelVariant !== "text") await this._loadQrLibrary();
      const blob = this._buildLabelsPdf(devices, labelWidth, labelHeight);
      this._revokeLabelPdf();
      this._labelPdf = {
        blob,
        filename: `entity-audit-labels-${new Date().toISOString().slice(0, 10)}.pdf`,
        url: URL.createObjectURL(blob),
        readyMessage: "The label PDF is ready.",
        shareTitle: "Device labels",
      };
      this._recordActivity("labels_pdf_created", "info", String(devices.length));
    } catch (error) {
      alert("The PDF with QR codes could not be created.");
      this._recordActivity("labels_pdf_failed", "error", error?.name || "build_failed");
    } finally {
      this._buildingLabels = false;
      this._render();
    }
  }

  async _shareLabelPdf() {
    if (!this._labelPdf || !navigator.canShare || !navigator.share) return;
    const file = new File([this._labelPdf.blob], this._labelPdf.filename, { type: "application/pdf" });
    if (!navigator.canShare({ files: [file] })) return;
    try {
      await navigator.share({
        files: [file],
        title: this._labelPdf.shareTitle || "Device labels",
      });
      this._recordActivity("labels_pdf_shared");
    } catch (error) {
      if (error?.name !== "AbortError") {
        this._recordActivity("labels_pdf_share_failed", "error", error?.name || "share_failed");
        alert("The PDF could not be opened for sharing.");
      }
    }
  }

  _escape(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    }[c]));
  }

  _options(field, fallbackField = null) {
    const values = new Map();
    for (const entity of this._entities) {
      const value = entity[field];
      if (!value) continue;
      values.set(value, fallbackField ? (entity[fallbackField] || value) : value);
    }
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }

  _groupRows(rows) {
    if (this._groupBy === "none") return [{ key: "all", label: "", rows }];
    const definitions = {
      device: ["device_id", "device_name", "No device"],
      manufacturer: ["manufacturer", "manufacturer", "Unknown manufacturer"],
      model: ["model", "model", "Unknown model"],
      platform: ["platform", "platform", "Unknown integration"],
      area: ["area_id", "area_name", "No area"],
      domain: ["domain", "domain", "Unknown type"],
    };
    const [keyField, labelField, fallback] = definitions[this._groupBy];
    const groups = new Map();
    for (const entity of rows) {
      const key = entity[keyField] || "__none__";
      if (!groups.has(key)) groups.set(key, { key, label: entity[labelField] || fallback, rows: [] });
      groups.get(key).rows.push(entity);
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  _renderAutomationCategory() {
    const kind = this._category === "scripts" ? "script" : "automation";
    const title = kind === "script" ? "Scripts" : "Automations";
    const singular = kind === "script" ? "script" : "automation";
    const sourceRows = this._automationScripts.filter((item) => item.kind === kind);
    const query = this._filter.toLocaleLowerCase();
    const stateOptions = [...new Set(sourceRows.map((item) => item.state || "missing"))]
      .sort((a, b) => a.localeCompare(b));
    const rows = sourceRows.filter((item) => {
      const matches = !query || `${item.name || ""} ${item.entity_id || ""} ${item.kind || ""} ${item.state || ""} ${item.mode || ""} ${item.platform || ""}`.toLocaleLowerCase().includes(query);
      return matches && (!this._automationState || item.state === this._automationState);
    });
    const activeCount = sourceRows.filter((item) => kind === "automation"
      ? this._automationExportStatus(item) === "enabled"
      : this._automationExportStatus(item) === "running").length;
    const inactiveCount = sourceRows.length - activeCount;
    const exporting = this._automationExporting;
    const stateBadge = (item) => ({
      enabled: "Enabled",
      disabled: "Disabled",
      registry_disabled: "Registry disabled",
      running: "Running",
      idle: "Idle",
      missing: "Missing",
    }[this._automationExportStatus(item)] || this._automationExportStatus(item));

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; min-height:100vh; color:var(--primary-text-color); background:var(--primary-background-color); font-family:Roboto, "Noto Sans", Arial, sans-serif; color-scheme:light dark; }
        * { box-sizing:border-box; }
        ha-top-app-bar-fixed { display:block; height:100vh; }
        .system-title { font-size:inherit; font-weight:inherit; }
        .system-action { width:48px; min-width:48px; padding:0; border:0; color:var(--app-header-text-color, white); background:transparent; font-size:25px; }
        .system-sub-row, .ribbon-controls { display:flex; align-items:center; gap:10px; }
        .system-sub-row { width:100%; min-height:58px; padding:7px 16px; color:var(--primary-text-color); background:var(--primary-background-color); border-bottom:1px solid var(--divider-color); }
        button, input, select { font:inherit; }
        button { min-height:44px; border:1px solid var(--divider-color); border-radius:9px; padding:9px 13px; cursor:pointer; font-weight:600; color:var(--primary-text-color); background:var(--card-background-color); }
        button:disabled { cursor:default; opacity:.55; }
        button:focus-visible, input:focus-visible, select:focus-visible { outline:3px solid var(--primary-color); outline-offset:2px; }
        .search-wrap { flex:1; min-width:180px; min-height:44px; display:flex; align-items:center; gap:9px; padding:0 13px; border:1px solid var(--divider-color); border-radius:11px; color:var(--primary-text-color); background:var(--card-background-color); }
        .search-icon { font-size:24px; line-height:1; opacity:.9; }
        .search { width:100%; min-width:0; border:0; outline:0; color:inherit; background:transparent; font-size:16px; }
        .filter-toggle { white-space:nowrap; }
        .select-wrap { position:relative; min-width:200px; }
        .select-wrap select, .filters select { width:100%; min-height:44px; appearance:none; -webkit-appearance:none; border:1px solid var(--divider-color); border-radius:9px; padding:10px 38px 10px 13px; color:var(--primary-text-color); background-color:var(--card-background-color); background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='10' viewBox='0 0 16 10'%3E%3Cpath fill='%238fa4bf' d='m1 1 7 7 7-7' stroke='%238fa4bf' stroke-width='2'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 13px center; }
        main { max-width:1400px; margin:auto; padding:20px; }
        .stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:16px; }
        .stat, .card, .filter-panel { background:var(--card-background-color); border-radius:12px; box-shadow:var(--ha-card-box-shadow); padding:16px; }
        .stat b { font-size:28px; line-height:1.05; display:block; }
        .stat { font-size:14px; font-weight:500; }
        .filter-panel { margin-bottom:12px; }
        .toolbar { display:flex; gap:10px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
        .filters { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }
        .privacy-note { color:var(--secondary-text-color); font-size:13px; line-height:1.45; margin:12px 0 0; }
        .table-wrap { overflow:auto; background:var(--card-background-color); border-radius:12px; box-shadow:var(--ha-card-box-shadow); }
        table { width:100%; border-collapse:collapse; }
        th, td { padding:12px 13px; text-align:left; border-bottom:1px solid var(--divider-color); vertical-align:top; }
        th { font-size:12px; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.03em; position:sticky; top:0; background:var(--card-background-color); }
        tr:hover td { background:var(--secondary-background-color); }
        .name { font-size:15px; font-weight:700; overflow-wrap:anywhere; }
        .item-link { min-height:0; margin:0; padding:0; border:0; color:var(--primary-text-color); background:transparent; font-size:15px; font-weight:700; text-align:left; overflow-wrap:anywhere; }
        .muted { color:var(--secondary-text-color); font-size:13px; line-height:1.35; overflow-wrap:anywhere; }
        .badge { display:inline-block; border-radius:999px; padding:5px 9px; font-size:13px; font-weight:600; background:var(--secondary-background-color); white-space:nowrap; }
        .active { color:var(--primary-color); }
        .inactive { color:var(--error-color); }
        .empty { text-align:center; padding:35px; color:var(--secondary-text-color); }
        @media(max-width:700px) {
          .system-sub-row { display:grid; grid-template-columns:minmax(0,1fr) auto; padding:7px 10px; }
          .ribbon-controls { grid-column:1 / -1; overflow-x:auto; padding-bottom:1px; }
          .ribbon-controls .select-wrap { min-width:185px; }
          .stats { grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:12px; }
          .stat { min-height:78px; padding:12px 9px; font-size:12px; overflow-wrap:anywhere; }
          .stat b { font-size:24px; }
          main { padding:12px; }
          .filter-panel { padding:12px; }
          .filter-panel:not(.open) { display:none; }
          .toolbar button { width:100%; }
          .filters { grid-template-columns:1fr; }
          th:nth-child(4), td:nth-child(4), th:nth-child(5), td:nth-child(5), th:nth-child(6), td:nth-child(6) { display:none; }
        }
      </style>
      <ha-top-app-bar-fixed ${this._narrow ? "narrow" : ""}>
        <span slot="title" class="system-title">Entity Audit</span>
        <button slot="actionItems" id="refresh" class="system-action" title="Refresh ${title}" aria-label="Refresh ${title}">${this._automationScriptsLoading ? "…" : "↻"}</button>
        <div slot="subRow" class="system-sub-row">
          <label class="search-wrap"><span class="search-icon" aria-hidden="true">⌕</span><input id="search" class="search" type="search" placeholder="Search ${singular}…" value="${this._escape(this._filter)}" aria-label="Search ${title}"></label>
          <button id="toggle-filters" class="filter-toggle" aria-expanded="${this._filtersOpen}">☰ Filters</button>
          <div class="ribbon-controls">
            <label class="select-wrap"><select id="category" aria-label="Category">
              <option value="entities">Entities</option>
              <option value="hacs">HACS repositories</option>
              <option value="users">Users &amp; permissions</option>
              <option value="automations" ${kind === "automation" ? "selected" : ""}>Automations</option>
              <option value="scripts" ${kind === "script" ? "selected" : ""}>Scripts</option>
            </select></label>
          </div>
        </div>
        <main>
          ${this._categoryError ? `<div class="card inactive">${this._escape(this._categoryError)}</div>` : ""}
          <section class="stats">
            <div class="stat"><b>${sourceRows.length}</b>${title.toLocaleLowerCase()}</div>
            <div class="stat"><b>${activeCount}</b>${kind === "automation" ? "enabled" : "running"}</div>
            <div class="stat"><b>${inactiveCount}</b>${kind === "automation" ? "disabled" : "idle or unavailable"}</div>
          </section>
          <section class="filter-panel ${this._filtersOpen ? "open" : ""}">
            <div class="toolbar">
              <button id="export-automation-csv" ${rows.length ? "" : "disabled"}>Export CSV</button>
              <button id="export-category-yaml" ${rows.some((item) => item.state !== "missing") && !exporting ? "" : "disabled"}>${exporting === kind ? `Creating ${singular} YAML…` : `Export ${singular} YAML`}</button>
              <button id="export-configuration-yaml" ${exporting ? "disabled" : ""}>Export configuration.yaml</button>
              <button id="export-automation-package" ${exporting ? "disabled" : ""}>${exporting === "backup" ? "Creating configuration backup…" : "Export configuration backup (ZIP)"}</button>
            </div>
            <div class="filters">
              <select id="automation-state-filter" aria-label="Filter by state"><option value="">All states</option>${stateOptions.map((state) => `<option value="${this._escape(state)}" ${this._automationState === state ? "selected" : ""}>${this._escape(state)}</option>`).join("")}</select>
            </div>
            <p class="privacy-note">Click an item name to open its native Home Assistant editor. CSV includes the current enabled/disabled status for automations. YAML exports use Home Assistant's administrator-only configuration API for the displayed items. Export configuration.yaml downloads a safe include snippet, not the complete server configuration. The ZIP backup is read-only and contains sanitized automation and script YAML, runtime inventories, dependency diagnostics, and a validation report. It is not a replacement for a full Home Assistant backup. Known sensitive values are redacted before download.</p>
          </section>
          <div class="table-wrap"><table>
            <thead><tr><th>Name</th><th>State</th><th>Mode</th><th>Current runs</th><th>Last triggered</th></tr></thead>
            <tbody>${rows.map((item, index) => `<tr>
              <td><button class="item-link edit-automation" data-index="${index}" title="Open ${singular} editor">${this._escape(item.name)}</button><div class="muted">${this._escape(item.entity_id)}</div>${item.disabled ? `<div class="muted">Registry disabled</div>` : ""}</td>
              <td><span class="badge ${item.state === "on" ? "active" : (item.state === "unavailable" || item.state === "missing" ? "inactive" : "")}">${this._escape(stateBadge(item))}</span></td>
              <td>${this._escape(item.mode || "—")}</td>
              <td>${this._escape(item.current ?? "—")}</td>
              <td>${this._escape(item.last_triggered || "—")}</td>
            </tr>`).join("") || `<tr><td class="empty" colspan="5">${this._automationScriptsLoading ? `Loading ${title.toLocaleLowerCase()}…` : `No matching ${title.toLocaleLowerCase()}`}</td></tr>`}</tbody>
          </table></div>
        </main>
      </ha-top-app-bar-fixed>
    `;

    this.shadowRoot.querySelector("#refresh")?.addEventListener("click", () => this._refreshCurrentCategory());
    this.shadowRoot.querySelector("#toggle-filters")?.addEventListener("click", () => {
      this._filtersOpen = !this._filtersOpen;
      this._render();
    });
    this.shadowRoot.querySelector("#search")?.addEventListener("input", (event) => {
      this._filter = event.target.value;
      this._render();
      const search = this.shadowRoot.querySelector("#search");
      search?.focus();
      search?.setSelectionRange(this._filter.length, this._filter.length);
    });
    this.shadowRoot.querySelector("#category")?.addEventListener("change", (event) => this._setCategory(event.target.value));
    this.shadowRoot.querySelector("#automation-state-filter")?.addEventListener("change", (event) => { this._automationState = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#export-automation-csv")?.addEventListener("click", () => this._exportAutomationCsv(rows));
    this.shadowRoot.querySelector("#export-category-yaml")?.addEventListener("click", () => this._exportAutomationYaml(rows, kind));
    this.shadowRoot.querySelector("#export-configuration-yaml")?.addEventListener("click", () => this._exportConfigurationYaml());
    this.shadowRoot.querySelector("#export-automation-package")?.addEventListener("click", () => this._exportConfigurationBackup());
    this.shadowRoot.querySelectorAll(".edit-automation").forEach((button) => button.addEventListener("click", () => this._openAutomationEditor(rows[Number(button.dataset.index)])));
  }

  _renderSecondaryCategory() {
    if (this._category === "automations" || this._category === "scripts") {
      this._renderAutomationCategory();
      return;
    }
    const isHacs = this._category === "hacs";
    const query = this._filter.toLocaleLowerCase();
    const allRows = isHacs ? this._hacsRepositories : this._users;
    const loading = isHacs ? this._hacsLoading : this._usersLoading;
    const categoryOptions = isHacs
      ? [...new Set(this._hacsRepositories.map((item) => item.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
      : [];
    const rows = allRows.filter((item) => {
      const matches = !query || (isHacs
        ? `${item.name || ""} ${item.repository || ""} ${item.domain || ""} ${item.description || ""} ${item.category || ""}`
        : `${item.name || ""} ${item.role || ""} ${item.access || ""} ${(item.groups || []).join(" ")}`
      ).toLocaleLowerCase().includes(query);
      return matches && (isHacs
        ? (!this._hacsCategory || item.category === this._hacsCategory)
        : (!this._userRole || item.role_key === this._userRole));
    });
    const updateCount = this._hacsRepositories.filter((item) => item.update_available).length;
    const activeUsers = this._users.filter((item) => item.active).length;
    const administrators = this._users.filter((item) => item.role_key !== "user").length;
    const placeholder = isHacs
      ? "Search HACS repositories…"
      : "Search user, role or group…";
    const title = isHacs ? "HACS repositories" : "Users & permissions";
    const status = (repository) => [
      repository.update_available ? "Update available" : "Installed",
      repository.restart_required ? "Restart required" : "",
    ].filter(Boolean).join(" · ");
    const table = isHacs ? `
      <table>
        <thead><tr><th>Repository</th><th>Category</th><th>Domain</th><th>Installed</th><th>Available</th><th>Status</th></tr></thead>
        <tbody>${rows.map((repository) => `<tr>
          <td><div class="name">${this._escape(repository.name)}</div><div class="muted">${this._escape(repository.repository || "—")}</div>${repository.description ? `<div class="muted">${this._escape(repository.description)}</div>` : ""}</td>
          <td>${this._escape(repository.category || "—")}</td>
          <td>${this._escape(repository.domain || "—")}</td>
          <td>${this._escape(repository.installed_version || "—")}</td>
          <td>${this._escape(repository.available_version || "—")}</td>
          <td><span class="badge ${repository.update_available ? "update" : ""}">${this._escape(status(repository))}</span></td>
        </tr>`).join("") || `<tr><td class="empty" colspan="6">${this._hacsAvailable === false ? "HACS is not available or has not finished loading." : "No matching HACS repositories"}</td></tr>`}</tbody>
      </table>` : `
      <table>
        <thead><tr><th>User</th><th>Role</th><th>Access</th><th>Groups</th><th>Status</th><th>Scope</th></tr></thead>
        <tbody>${rows.map((user) => `<tr>
          <td><div class="name">${this._escape(user.name)}</div>${user.system_generated ? `<div class="muted">System-generated account</div>` : ""}</td>
          <td>${this._escape(user.role)}</td>
          <td>${this._escape(user.access)}</td>
          <td>${this._escape((user.groups || []).join(" · ") || "—")}</td>
          <td><span class="badge ${user.active ? "" : "inactive"}">${user.active ? "Active" : "Inactive"}</span></td>
          <td>${user.local_only ? "Local only" : "Network access"}</td>
        </tr>`).join("") || `<tr><td class="empty" colspan="6">No matching users</td></tr>`}</tbody>
      </table>`;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; min-height:100vh; color:var(--primary-text-color); background:var(--primary-background-color); font-family:Roboto, "Noto Sans", Arial, sans-serif; color-scheme:light dark; }
        * { box-sizing:border-box; }
        ha-top-app-bar-fixed { display:block; height:100vh; }
        .system-title { font-size:inherit; font-weight:inherit; }
        .system-action { width:48px; min-width:48px; padding:0; border:0; color:var(--app-header-text-color, white); background:transparent; font-size:25px; }
        .system-sub-row, .ribbon-controls { display:flex; align-items:center; gap:10px; }
        .system-sub-row { width:100%; min-height:58px; padding:7px 16px; color:var(--primary-text-color); background:var(--primary-background-color); border-bottom:1px solid var(--divider-color); }
        button, input, select { font:inherit; }
        button { min-height:44px; border:1px solid var(--divider-color); border-radius:9px; padding:9px 13px; cursor:pointer; font-weight:600; color:var(--primary-text-color); background:var(--card-background-color); }
        button:focus-visible, input:focus-visible, select:focus-visible { outline:3px solid var(--primary-color); outline-offset:2px; }
        .search-wrap { flex:1; min-width:180px; min-height:44px; display:flex; align-items:center; gap:9px; padding:0 13px; border:1px solid var(--divider-color); border-radius:11px; color:var(--primary-text-color); background:var(--card-background-color); }
        .search-icon { font-size:24px; line-height:1; opacity:.9; }
        .search { width:100%; min-width:0; border:0; outline:0; color:inherit; background:transparent; font-size:16px; }
        .filter-toggle { white-space:nowrap; }
        .select-wrap { position:relative; min-width:200px; }
        .select-wrap select, .filters select { width:100%; min-height:44px; appearance:none; -webkit-appearance:none; border:1px solid var(--divider-color); border-radius:9px; padding:10px 38px 10px 13px; color:var(--primary-text-color); background-color:var(--card-background-color); background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='10' viewBox='0 0 16 10'%3E%3Cpath fill='%238fa4bf' d='m1 1 7 7 7-7' stroke='%238fa4bf' stroke-width='2'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 13px center; }
        main { max-width:1400px; margin:auto; padding:20px; }
        .stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:16px; }
        .stat, .card, .filter-panel { background:var(--card-background-color); border-radius:12px; box-shadow:var(--ha-card-box-shadow); padding:16px; }
        .stat b { font-size:28px; line-height:1.05; display:block; }
        .stat { font-size:14px; font-weight:500; }
        .filter-panel { margin-bottom:12px; }
        .toolbar { display:flex; gap:10px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
        .filters { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }
        .privacy-note { color:var(--secondary-text-color); font-size:13px; line-height:1.45; margin:0; }
        .table-wrap { overflow:auto; background:var(--card-background-color); border-radius:12px; box-shadow:var(--ha-card-box-shadow); }
        table { width:100%; border-collapse:collapse; }
        th, td { padding:12px 13px; text-align:left; border-bottom:1px solid var(--divider-color); vertical-align:top; }
        th { font-size:12px; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.03em; position:sticky; top:0; background:var(--card-background-color); }
        tr:hover td { background:var(--secondary-background-color); }
        .name { font-size:15px; font-weight:700; overflow-wrap:anywhere; }
        .muted { color:var(--secondary-text-color); font-size:13px; line-height:1.35; overflow-wrap:anywhere; }
        .badge { display:inline-block; border-radius:999px; padding:5px 9px; font-size:13px; font-weight:600; background:var(--secondary-background-color); white-space:nowrap; }
        .update { color:var(--primary-color); }
        .inactive { color:var(--error-color); }
        .empty { text-align:center; padding:35px; color:var(--secondary-text-color); }
        @media(max-width:700px) {
          .system-sub-row { display:grid; grid-template-columns:minmax(0,1fr) auto; padding:7px 10px; }
          .ribbon-controls { grid-column:1 / -1; overflow-x:auto; padding-bottom:1px; }
          .ribbon-controls .select-wrap { min-width:185px; }
          .stats { grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:12px; }
          .stat { min-height:78px; padding:12px 9px; font-size:12px; overflow-wrap:anywhere; }
          .stat b { font-size:24px; }
          main { padding:12px; }
          .filter-panel { padding:12px; }
          .filter-panel:not(.open) { display:none; }
          .toolbar button { width:100%; }
          .filters { grid-template-columns:1fr; }
          th:nth-child(3), td:nth-child(3), th:nth-child(4), td:nth-child(4) { display:none; }
        }
      </style>
      <ha-top-app-bar-fixed ${this._narrow ? "narrow" : ""}>
        <span slot="title" class="system-title">Entity Audit</span>
        <button slot="actionItems" id="refresh" class="system-action" title="Refresh ${title}" aria-label="Refresh ${title}">${loading ? "…" : "↻"}</button>
        <div slot="subRow" class="system-sub-row">
          <label class="search-wrap"><span class="search-icon" aria-hidden="true">⌕</span><input id="search" class="search" type="search" placeholder="${placeholder}" value="${this._escape(this._filter)}" aria-label="Search ${title}"></label>
          <button id="toggle-filters" class="filter-toggle" aria-expanded="${this._filtersOpen}">☰ Filters</button>
          <div class="ribbon-controls">
            <label class="select-wrap"><select id="category" aria-label="Category">
              <option value="entities">Entities</option>
              <option value="hacs" ${isHacs ? "selected" : ""}>HACS repositories</option>
              <option value="users" ${!isHacs ? "selected" : ""}>Users &amp; permissions</option>
              <option value="automations">Automations</option>
              <option value="scripts">Scripts</option>
            </select></label>
          </div>
        </div>
        <main>
          ${this._categoryError ? `<div class="card inactive">${this._escape(this._categoryError)}</div>` : ""}
          <section class="stats">
            ${isHacs ? `<div class="stat"><b>${this._hacsRepositories.length}</b>installed repositories</div><div class="stat"><b>${categoryOptions.length}</b>HACS categories</div><div class="stat"><b>${updateCount}</b>updates available</div>` : `<div class="stat"><b>${this._users.length}</b>users</div><div class="stat"><b>${administrators}</b>owners and administrators</div><div class="stat"><b>${activeUsers}</b>active users</div>`}
          </section>
          <section class="filter-panel ${this._filtersOpen ? "open" : ""}">
            <div class="toolbar"><button id="export-category" ${rows.length ? "" : "disabled"}>${isHacs ? "Export HACS CSV" : "Export users CSV"}</button></div>
            <div class="filters">
              ${isHacs ? `<select id="hacs-category-filter" aria-label="Filter by HACS category"><option value="">All HACS categories</option>${categoryOptions.map((category) => `<option value="${this._escape(category)}" ${this._hacsCategory === category ? "selected" : ""}>${this._escape(category)}</option>`).join("")}</select>` : `<select id="user-role-filter" aria-label="Filter by role"><option value="">All roles</option><option value="owner" ${this._userRole === "owner" ? "selected" : ""}>Owners</option><option value="administrator" ${this._userRole === "administrator" ? "selected" : ""}>Administrators</option><option value="user" ${this._userRole === "user" ? "selected" : ""}>Users</option></select>`}
            </div>
            ${isHacs ? "" : `<p class="privacy-note">The export contains account status, role, and group membership only. It never includes passwords, tokens, or authentication credentials.</p>`}
          </section>
          <div class="table-wrap">${table}</div>
        </main>
      </ha-top-app-bar-fixed>
    `;

    this.shadowRoot.querySelector("#refresh")?.addEventListener("click", () => this._refreshCurrentCategory());
    this.shadowRoot.querySelector("#toggle-filters")?.addEventListener("click", () => {
      this._filtersOpen = !this._filtersOpen;
      this._render();
    });
    this.shadowRoot.querySelector("#search")?.addEventListener("input", (event) => {
      this._filter = event.target.value;
      this._render();
      const search = this.shadowRoot.querySelector("#search");
      search?.focus();
      search?.setSelectionRange(this._filter.length, this._filter.length);
    });
    this.shadowRoot.querySelector("#category")?.addEventListener("change", (event) => this._setCategory(event.target.value));
    this.shadowRoot.querySelector("#hacs-category-filter")?.addEventListener("change", (event) => { this._hacsCategory = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#user-role-filter")?.addEventListener("change", (event) => { this._userRole = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#export-category")?.addEventListener("click", () => {
      if (isHacs) this._exportHacsCsv(rows);
      else this._exportUsersCsv(rows);
    });
  }

  _render() {
    if (!this.shadowRoot) return;
    if (this._category !== "entities") {
      this._renderSecondaryCategory();
      return;
    }
    const query = this._filter.toLocaleLowerCase();
    const devices = [...new Map(
      this._entities
        .filter((entity) => entity.device_id)
        .map((entity) => [entity.device_id, [
          entity.device_name || entity.device_id,
          entity.manufacturer,
          entity.model,
          entity.area_name,
        ].filter(Boolean).join(" · ")])
    ).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const manufacturers = this._options("manufacturer");
    const models = this._options("model");
    const platforms = this._options("platform");
    const areas = this._options("area_id", "area_name");
    const domains = this._options("domain");
    const rows = this._entities.filter((entity) => {
      const matches = !query || `${entity.name} ${entity.entity_id} ${entity.device_name || ""} ${entity.manufacturer || ""} ${entity.model || ""} ${entity.area_name || ""} ${entity.ip_address || ""} ${entity.mac_address || ""} ${entity.platform || ""}`.toLocaleLowerCase().includes(query);
      const deviceMatches = !this._device
        || (this._device === "__none__" ? !entity.device_id : entity.device_id === this._device);
      const manufacturerMatches = !this._manufacturer
        || (this._manufacturer === "__none__" ? !entity.manufacturer : entity.manufacturer === this._manufacturer);
      const modelMatches = !this._model
        || (this._model === "__none__" ? !entity.model : entity.model === this._model);
      const platformMatches = !this._platform || entity.platform === this._platform;
      const areaMatches = !this._area
        || (this._area === "__none__" ? !entity.area_id : entity.area_id === this._area);
      const domainMatches = !this._domain || entity.domain === this._domain;
      const auditMatches = !this._audit
        || (this._audit === "enabled" ? entity.logging : !entity.logging);
      return matches && deviceMatches && manufacturerMatches && modelMatches && platformMatches
        && areaMatches && domainMatches && auditMatches
        && (!this._problemOnly || entity.problem);
    });
    const rowIndexes = new Map(rows.map((entity, index) => [entity.entity_id, index]));
    const groups = this._groupRows(rows);
    const problemCount = this._entities.filter((entity) => entity.problem).length;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; min-height:100vh; color:var(--primary-text-color); background:var(--primary-background-color); font-family:Roboto, "Noto Sans", Arial, sans-serif; color-scheme:light dark; }
        * { box-sizing:border-box; }
        ha-top-app-bar-fixed { display:block; height:100vh; }
        .system-title { font-size:inherit; font-weight:inherit; }
        .system-action { width:48px; min-width:48px; padding:0; border:0; color:var(--app-header-text-color, white); background:transparent; font-size:25px; }
        .system-sub-row, .ribbon-controls { display:flex; align-items:center; gap:10px; }
        .system-sub-row { width:100%; min-height:58px; padding:7px 16px; color:var(--primary-text-color); background:var(--primary-background-color); border-bottom:1px solid var(--divider-color); }
        button, input, select { font:inherit; }
        button { min-height:44px; border:1px solid var(--divider-color); border-radius:9px; padding:9px 13px; cursor:pointer; font-weight:600; color:var(--primary-text-color); background:var(--card-background-color); }
        button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline:3px solid var(--primary-color); outline-offset:2px; }
        .search-wrap { flex:1; min-width:180px; min-height:44px; display:flex; align-items:center; gap:9px; padding:0 13px; border:1px solid var(--divider-color); border-radius:11px; color:var(--primary-text-color); background:var(--card-background-color); }
        .search-icon { font-size:24px; line-height:1; opacity:.9; }
        .search { width:100%; min-width:0; border:0; outline:0; color:inherit; background:transparent; font-size:16px; }
        .search::placeholder { color:var(--secondary-text-color); opacity:1; }
        .filter-toggle { white-space:nowrap; }
        .ribbon-controls .filter { min-height:42px; padding:0 11px; border:1px solid var(--divider-color); border-radius:9px; }
        .select-wrap { position:relative; min-width:200px; }
        .select-wrap select, .filters select { width:100%; min-height:44px; appearance:none; -webkit-appearance:none; border:1px solid var(--divider-color); border-radius:9px; padding:10px 38px 10px 13px; color:var(--primary-text-color); background-color:var(--card-background-color); background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='10' viewBox='0 0 16 10'%3E%3Cpath fill='%238fa4bf' d='m1 1 7 7 7-7' stroke='%238fa4bf' stroke-width='2'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 13px center; }
        main { max-width:1400px; margin:auto; padding:20px; }
        .stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:16px; }
        .stat, .card, .filter-panel, .pdf-ready { background:var(--card-background-color); border-radius:12px; box-shadow:var(--ha-card-box-shadow); padding:16px; }
        .stat b { font-size:28px; line-height:1.05; display:block; }
        .stat { font-size:14px; font-weight:500; }
        .filter-panel { margin-bottom:12px; }
        .toolbar { display:flex; gap:10px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
        .filters { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }
        .device-filter { min-width:260px; max-width:460px; }
        label.filter { display:flex; gap:8px; align-items:center; white-space:nowrap; font-size:15px; font-weight:600; }
        input[type="checkbox"] { width:20px; height:20px; accent-color:var(--primary-color); }
        .pdf-ready { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px; border:1px solid var(--primary-color); font-size:15px; font-weight:600; }
        .pdf-ready a { display:inline-flex; align-items:center; min-height:42px; padding:8px 12px; border-radius:9px; color:var(--text-primary-color, white); background:var(--primary-color); text-decoration:none; }
        .brother-print { display:flex; flex-wrap:wrap; align-items:end; gap:12px; min-width:0; margin:12px 0; padding:12px; border:1px solid var(--divider-color); border-radius:9px; }
        .brother-print legend { padding:0 6px; font-weight:600; }
        .brother-print label { display:grid; gap:6px; flex:1 1 190px; min-width:0; font-size:14px; }
        .brother-print input { width:100%; min-height:44px; padding:10px 13px; border:1px solid var(--divider-color); border-radius:9px; color:var(--primary-text-color); background:var(--card-background-color); }
        .brother-print p { flex-basis:100%; margin:0; font-size:13px; line-height:1.45; color:var(--secondary-text-color); }
        .pdf-ready button { color:var(--primary-color); border-color:var(--primary-color); background:transparent; }
        .table-wrap { overflow:auto; background:var(--card-background-color); border-radius:12px; box-shadow:var(--ha-card-box-shadow); }
        table { width:100%; border-collapse:collapse; }
        th, td { padding:12px 13px; text-align:left; border-bottom:1px solid var(--divider-color); }
        th { font-size:12px; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.03em; position:sticky; top:0; background:var(--card-background-color); }
        tr:hover td { background:var(--secondary-background-color); }
        .group-row td { position:sticky; top:38px; z-index:1; background:var(--secondary-background-color); font-weight:700; }
        .group-summary { color:var(--secondary-text-color); font-size:12px; font-weight:400; margin-left:8px; }
        .name { font-size:15px; font-weight:700; }
        .entity-id, .muted { color:var(--secondary-text-color); font-size:13px; line-height:1.35; }
        .badge { display:inline-block; border-radius:999px; padding:5px 9px; font-size:13px; font-weight:600; background:var(--secondary-background-color); }
        .problem { background:var(--error-color); color:white; }
        .ok { color:var(--success-color); }
        .switch { width:20px; height:20px; }
        .link, .state-button { min-height:0; color:var(--primary-color); background:transparent; border:0; padding:5px; }
        .row-print-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
        .row-print-actions button { min-height:40px; padding:6px 9px; font-size:13px; }
        .row-print-actions select { min-height:40px; max-width:100%; font-size:13px; color:var(--primary-text-color); background:var(--card-background-color); }
        .print-options { margin:12px 0; background:var(--card-background-color); box-shadow:var(--ha-card-box-shadow); border:1px solid var(--divider-color); border-radius:9px; padding:12px; }
        .action-heading { margin:14px 0 8px; font-size:14px; font-weight:600; color:var(--secondary-text-color); }
        .brother-options { margin-top:12px; }
        .brother-options summary { cursor:pointer; font-weight:600; }
        .print-options summary { cursor:pointer; min-height:36px; font-weight:600; }
        .print-options[open] summary { margin-bottom:10px; }
        .pair-print { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:12px 0; padding:12px; border:1px solid var(--divider-color); border-radius:9px; }
        .pair-print p { width:100%; margin:0; overflow-wrap:anywhere; }
        .label-editor { width:min(620px, calc(100vw - 20px)); max-height:90vh; overflow:auto; }
        .label-editor-body { padding:16px; display:grid; gap:10px; }
        .label-editor-body label { display:grid; gap:4px; }
        .label-editor-body input, .label-editor-body select { width:100%; min-height:44px; padding:8px; color:var(--primary-text-color); background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:8px; }
        .label-editor-body img { max-width:100%; max-height:220px; object-fit:contain; background:white; border:1px solid var(--divider-color); }
        .state-button { text-align:left; }
        .empty { text-align:center; padding:35px; color:var(--secondary-text-color); }
        dialog { width:min(850px, calc(100vw - 24px)); max-height:85vh; border:0; border-radius:14px; color:var(--primary-text-color); background:var(--card-background-color); padding:0; box-shadow:0 14px 50px #0006; }
        dialog::backdrop { background:#0008; }
        .dialog-head { display:flex; gap:12px; align-items:start; padding:18px; border-bottom:1px solid var(--divider-color); }
        .dialog-head h2 { margin:0; flex:1; font-size:19px; }
        .dialog-body { overflow:auto; max-height:62vh; padding:0 18px 18px; }
        .history { display:grid; grid-template-columns:170px 100px 1fr; gap:10px; padding:10px 0; border-bottom:1px solid var(--divider-color); font-size:13px; }
        .event-problem { color:var(--error-color); font-weight:600; }
        .event-recovered { color:var(--success-color); font-weight:600; }
        .scanner-dialog { width:min(560px, calc(100vw - 20px)); }
        .scanner-body { padding:18px; display:grid; gap:14px; }
        .camera-stage { position:relative; min-height:260px; overflow:hidden; border-radius:12px; color:white; background:#111; }
        .camera-stage video { display:block; width:100%; height:min(52vh, 440px); object-fit:cover; }
        .camera-guide { position:absolute; inset:50% auto auto 50%; width:min(68%, 280px); aspect-ratio:1; transform:translate(-50%,-50%); border:3px solid white; border-radius:16px; box-shadow:0 0 0 999px #0005; pointer-events:none; }
        .camera-hint { position:absolute; left:12px; right:12px; bottom:12px; padding:8px; border-radius:8px; text-align:center; background:#000a; font-size:13px; }
        .scanner-error { padding:11px 13px; border-radius:9px; color:var(--error-color); background:var(--secondary-background-color); font-weight:600; }
        .scanner-note { padding:10px 12px; border-left:3px solid var(--primary-color); color:var(--secondary-text-color); background:var(--secondary-background-color); font-size:14px; line-height:1.4; }
        .scanner-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .file-button, .primary-link { display:inline-flex; min-height:44px; align-items:center; justify-content:center; border-radius:9px; padding:9px 13px; cursor:pointer; font-weight:600; text-decoration:none; }
        .file-button { border:1px solid var(--divider-color); color:var(--primary-text-color); background:var(--card-background-color); }
        .file-button input { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
        .primary-link { color:var(--text-primary-color, white); background:var(--primary-color); }
        .virtual-label { padding:18px; border:2px solid var(--divider-color); border-radius:12px; background:var(--primary-background-color); }
        .virtual-label h3 { margin:0 0 14px; font-size:22px; overflow-wrap:anywhere; }
        .label-detail { display:grid; grid-template-columns:120px minmax(0,1fr); gap:9px 12px; }
        .label-detail dt { color:var(--secondary-text-color); font-weight:600; }
        .label-detail dd { margin:0; overflow-wrap:anywhere; }
        .match-ok { color:var(--success-color); font-weight:600; }
        .match-missing { color:var(--warning-color, #f0a000); font-weight:600; }
        @media(max-width:700px) {
          .system-sub-row { display:grid; grid-template-columns:minmax(0,1fr) auto; padding:7px 10px; }
          .ribbon-controls { grid-column:1 / -1; overflow-x:auto; padding-bottom:1px; }
          .ribbon-controls .select-wrap { min-width:185px; }
          .stats { grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:12px; }
          .stat { min-height:78px; padding:12px 9px; font-size:12px; overflow-wrap:anywhere; }
          .stat b { font-size:24px; }
          main { padding:12px; }
          .filter-panel { padding:12px; }
          .filter-panel:not(.open) { display:none; }
          .toolbar { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-items:stretch; }
          .toolbar button { width:100%; }
          .filters { grid-template-columns:1fr; }
          .device-filter { min-width:0; max-width:none; }
          th:nth-child(3), td:nth-child(3), th:nth-child(4), td:nth-child(4) { display:none; }
          .group-row td { top:38px; }
          .history { grid-template-columns:1fr; }
          .pdf-ready { padding:12px; }
          .camera-stage { min-height:220px; }
          .label-detail { grid-template-columns:1fr; gap:3px; }
          .label-detail dd { margin-bottom:7px; }
          .scanner-actions > * { flex:1 1 auto; }
        }
      </style>
      <ha-top-app-bar-fixed ${this._narrow ? "narrow" : ""}>
        <span slot="title" class="system-title">${"Entity Audit"}</span>
        <button slot="actionItems" id="open-scanner" class="system-action" title="${"Scan QR label"}" aria-label="${"Scan QR label"}"><ha-icon icon="mdi:qrcode-scan"></ha-icon></button>
        <button slot="actionItems" id="refresh" class="system-action" title="${"Refresh entity list"}" aria-label="${"Refresh entity list"}">${this._loading ? "…" : "↻"}</button>
        <div slot="subRow" class="system-sub-row">
          <label class="search-wrap"><span class="search-icon" aria-hidden="true">⌕</span><input id="search" class="search" type="search" placeholder="${"Search name, device, entity_id or integration…"}" value="${this._escape(this._filter)}" aria-label="${"Search entities"}"></label>
          <button id="toggle-filters" class="filter-toggle" aria-expanded="${this._filtersOpen}">☰ ${"Filters"}</button>
          <div class="ribbon-controls">
            <label class="select-wrap"><select id="category" aria-label="Category">
              <option value="entities" selected>Entities</option>
              <option value="hacs">HACS repositories</option>
              <option value="users">Users &amp; permissions</option>
              <option value="automations">Automations</option>
              <option value="scripts">Scripts</option>
            </select></label>
            <label class="select-wrap"><select id="group-by" aria-label="${"Group by"}">
              <option value="none" ${this._groupBy === "none" ? "selected" : ""}>${"No grouping"}</option>
              <option value="device" ${this._groupBy === "device" ? "selected" : ""}>${"By device"}</option>
              <option value="manufacturer" ${this._groupBy === "manufacturer" ? "selected" : ""}>${"By manufacturer"}</option>
              <option value="model" ${this._groupBy === "model" ? "selected" : ""}>${"By model"}</option>
              <option value="platform" ${this._groupBy === "platform" ? "selected" : ""}>${"By integration"}</option>
              <option value="area" ${this._groupBy === "area" ? "selected" : ""}>${"By area"}</option>
              <option value="domain" ${this._groupBy === "domain" ? "selected" : ""}>${"By entity type"}</option>
            </select></label>
            <label class="filter"><input id="problems" type="checkbox" ${this._problemOnly ? "checked" : ""}> ${"Problems only"}</label>
          </div>
        </div>
      <main>
        ${this._error ? `<div class="card problem">${this._escape(this._error)}</div>` : ""}
        <section class="stats">
          <div class="stat"><b>${this._entities.length}</b>${"known entities"}</div>
          <div class="stat"><b>${this._entities.filter((e) => e.logging).length}</b>${"audited"}</div>
          <div class="stat"><b>${problemCount}</b>${"current problems"}</div>
        </section>
        ${this._labelPdf ? `<section class="pdf-ready"><span>${this._escape(this._labelPdf.readyMessage || "The label PDF is ready.")}</span><a id="download-label-pdf" href="${this._escape(this._labelPdf.url)}" download="${this._escape(this._labelPdf.filename)}">${"Open or save PDF"}</a>${navigator.canShare && navigator.share ? `<button id="share-label-pdf">${"Share PDF"}</button>` : ""}<button id="discard-label-pdf">✕</button></section>` : ""}
        <section class="filter-panel ${this._filtersOpen ? "open" : ""}">

          <div class="filters">
          <select id="device-filter" class="device-filter" aria-label="${"Filter by device"}">
            <option value="">${"All devices"}</option>
            <option value="__none__" ${this._device === "__none__" ? "selected" : ""}>${"No device"}</option>
            ${devices.map(([id, name]) => `<option value="${this._escape(id)}" ${this._device === id ? "selected" : ""}>${this._escape(name)}</option>`).join("")}
          </select>
          <select id="manufacturer-filter" aria-label="${"Filter by manufacturer"}">
            <option value="">${"All manufacturers"}</option>
            <option value="__none__" ${this._manufacturer === "__none__" ? "selected" : ""}>${"Unknown manufacturer"}</option>
            ${manufacturers.map(([value, label]) => `<option value="${this._escape(value)}" ${this._manufacturer === value ? "selected" : ""}>${this._escape(label)}</option>`).join("")}
          </select>
          <select id="model-filter" aria-label="${"Filter by model"}">
            <option value="">${"All models"}</option>
            <option value="__none__" ${this._model === "__none__" ? "selected" : ""}>${"Unknown model"}</option>
            ${models.map(([value, label]) => `<option value="${this._escape(value)}" ${this._model === value ? "selected" : ""}>${this._escape(label)}</option>`).join("")}
          </select>
          <select id="platform-filter" aria-label="${"Filter by integration"}">
            <option value="">${"All integrations"}</option>
            ${platforms.map(([value, label]) => `<option value="${this._escape(value)}" ${this._platform === value ? "selected" : ""}>${this._escape(label)}</option>`).join("")}
          </select>
          <select id="area-filter" aria-label="${"Filter by area"}">
            <option value="">${"All areas"}</option>
            <option value="__none__" ${this._area === "__none__" ? "selected" : ""}>${"No area"}</option>
            ${areas.map(([value, label]) => `<option value="${this._escape(value)}" ${this._area === value ? "selected" : ""}>${this._escape(label)}</option>`).join("")}
          </select>
          <select id="domain-filter" aria-label="${"Filter by entity type"}">
            <option value="">${"All entity types"}</option>
            ${domains.map(([value, label]) => `<option value="${this._escape(value)}" ${this._domain === value ? "selected" : ""}>${this._escape(label)}</option>`).join("")}
          </select>
          <select id="audit-filter" aria-label="${"Filter by audit"}">
            <option value="">${"All audit states"}</option>
            <option value="enabled" ${this._audit === "enabled" ? "selected" : ""}>${"Audit enabled"}</option>
            <option value="disabled" ${this._audit === "disabled" ? "selected" : ""}>${"Audit disabled"}</option>
          </select>
          </div>
        </section>
        <!-- Akce jsou samostatné, aby byly na mobilu dostupné i při zavřených filtrech. -->
          <details class="print-options" ${this._printOptionsOpen ? "open" : ""}><summary>Actions: audit, export and labels</summary>
          <p class="action-heading">Audit displayed entities</p>
          <div class="toolbar">
            <button id="bulk-enable">${"Audit displayed"}</button>
            <button id="bulk-disable">${"Disable audit"}</button>
          </div>
          <p class="action-heading">Export and labels</p>
          <div class="toolbar">
            <button id="export">${"Export CSV"}</button>
            <button id="download-labels" ${this._buildingLabels ? "disabled" : ""}>${this._buildingLabels ? "Creating PDF…" : "Create labels (PDF)"}</button>
          </div>
          <details class="brother-options" ${this._brotherOptionsOpen ? "open" : ""}><summary>Brother printer options</summary>
          <fieldset class="brother-print"><legend>Brother label printing</legend>
            <label class="select-wrap">Printer<select id="brother-printer" ${this._buildingLabels || this._printingLabels ? "disabled" : ""}><option value="ql820nwb" ${this._brotherPrinter === "ql820nwb" ? "selected" : ""}>Brother QL-820NWB</option><option value="vc500w" ${this._brotherPrinter === "vc500w" ? "selected" : ""}>Brother VC-500W</option></select></label>
            <label class="select-wrap">${this._brotherPrinter === "vc500w" ? "CZ roll" : "DK roll"}<select id="brother-roll" ${this._buildingLabels || this._printingLabels ? "disabled" : ""}>${this._brotherRollOptions().map((roll) => `<option value="${roll.id}" ${roll.id === this._brotherRoll ? "selected" : ""}>${roll.name}</option>`).join("")}</select></label>
            ${this._brotherRollOptions().find((roll) => roll.id === this._brotherRoll)?.length === null ? `<label>Cut length (mm)<input id="brother-length" type="number" min="30" max="300" step="1" value="${this._escape(this._brotherLength)}" ${this._buildingLabels || this._printingLabels ? "disabled" : ""}></label>` : ""}
            <button id="download-brother-labels" ${this._buildingLabels || this._printingLabels ? "disabled" : ""}>${this._buildingLabels ? "Creating PDF…" : "Create Brother label PDF"}</button>
            <button id="print-brother-labels" ${this._buildingLabels || this._printingLabels || !this._brotherPrinters[this._brotherPrinter] || !this._labelDevices(rows).length ? "disabled" : ""}>Print ${this._labelDevices(rows).length} devices</button>
            ${this._printingLabels ? `<button id="stop-brother-print">Stop after current label</button>` : ""}
            <p role="status" aria-live="polite">${this._escape(this._printStatus)}</p>
            ${!this._brotherPrinters[this._brotherPrinter] ? "<p>To enable direct printing, configure this printer's IP address or hostname in Settings → Devices &amp; services → Entity Audit → Configure.</p>" : ""}
            <p>One page per device. Uses the label variant selected in integration settings. Match the roll in the print dialog and print at actual size (100%). Open or share the PDF to print with AirPrint or a Brother driver. Rolls narrower than 25 mm require the text-only variant.</p>
          </fieldset>
          </details>
          </details>
        <section class="pair-print" aria-label="Dva štítky vedle sebe">
          <strong>Dva štítky vedle sebe (${this._labelPair.size}/2)</strong>
          <button id="print-pair" ${this._labelPair.size !== 2 || this._printingLabels || this._buildingLabels ? "disabled" : ""}>Vytisknout dvojici</button>
          <button id="clear-pair" ${!this._labelPair.size || this._printingLabels ? "disabled" : ""}>Vyprázdnit výběr</button>
          <p>${[...this._labelPair].map(([id, kind]) => `${kind === "entity" ? "Entita" : "Zařízení"}: ${this._escape(id)}`).join(" · ") || "U dvou řádků vyber položku do dvojice. Výběr zůstává i při změně filtru."}</p>
          ${this._printStatus ? `<p role="status" aria-live="polite">${this._escape(this._printStatus)}</p>` : ""}
        </section>
        <div class="table-wrap">
          <table>
            <thead><tr><th>${"Entity"}</th><th>${"State"}</th><th>${"Device"}</th><th>${"Integration"}</th><th>${"Audit"}</th><th>${"History"}</th></tr></thead>
            <tbody>${groups.map((group) => `${this._groupBy !== "none" ? `
              <tr class="group-row"><td colspan="6">${this._escape(group.label)}<span class="group-summary">${group.rows.length} ${"entities"} · ${group.rows.filter((entity) => entity.problem).length} ${"problems"} · ${group.rows.filter((entity) => entity.logging).length} ${"audited"}</span></td></tr>` : ""}
              ${group.rows.map((entity) => {
                const index = rowIndexes.get(entity.entity_id);
                return `<tr>
                  <td><div class="name">${this._escape(entity.name)}</div><div class="entity-id">${this._escape(entity.entity_id)}${entity.disabled ? ` · ${"disabled"}` : ""}</div>
                    <div class="row-print-actions"><select class="label-action" data-index="${index}" aria-label="Štítek pro ${this._escape(entity.entity_id)}" ${this._printingLabels || this._buildingLabels ? "disabled" : ""}><option value="">Štítek…</option><option value="print-entity">Vytisknout entitu</option><option value="print-device" ${!entity.device_id || !entity.ip_address ? "disabled" : ""}>Vytisknout zařízení</option><option value="pair-entity">Do dvojice: entita</option><option value="pair-device" ${!entity.device_id || !entity.ip_address ? "disabled" : ""}>Do dvojice: zařízení</option>${this._labelPair.has(entity.entity_id) ? '<option value="pair-remove">Odebrat z dvojice</option>' : ""}</select>${this._labelPair.has(entity.entity_id) ? `<span class="muted">Ve dvojici: ${this._labelPair.get(entity.entity_id) === "entity" ? "entita" : "zařízení"}</span>` : ""}</div>
                    ${this._printEntityId === entity.entity_id && this._printStatus ? `<div class="muted" role="status">${this._escape(this._printStatus)}</div>` : ""}
                  </td>
                  <td><button class="state-button" data-index="${index}" title="${"Show entity details"}">${entity.problem ? `<span class="badge problem">${this._escape(entity.problem)}</span>` : `<span class="badge">${this._escape(entity.state ?? "—")}</span>`}</button></td>
                  <td><div>${this._escape(entity.device_name || "No device")}</div><div class="muted">${this._escape([entity.manufacturer, entity.model, entity.area_name, entity.ip_address ? `IP: ${entity.ip_address}` : "", entity.mac_address ? `MAC: ${entity.mac_address}` : ""].filter(Boolean).join(" · "))}</div></td>
                  <td>${this._escape(entity.platform || "—")}</td>
                  <td><input class="switch toggle" data-index="${index}" type="checkbox" ${entity.logging ? "checked" : ""} aria-label="Audit ${this._escape(entity.entity_id)}"></td>
                  <td><button class="link history-button" data-index="${index}">${entity.event_count} ${"events"}</button></td>
                </tr>`;
              }).join("")}`).join("") || `<tr><td class="empty" colspan="6">${"No matching entities"}</td></tr>`}</tbody>
          </table>
        </div>
      </main>
      ${this._labelEditor ? `<dialog class="label-editor" aria-label="Návrh štítku">
        <div class="dialog-head"><h2>Návrh štítku</h2><button id="label-editor-close" aria-label="Zavřít">✕</button></div>
        <div class="label-editor-body">
          ${this._labelEditor.map((item, index) => `<label>Název ${index + 1} (${item.kind === "entity" ? "entita" : "zařízení"})<input class="label-title" data-index="${index}" maxlength="120" value="${this._escape(item.title)}"></label><small>${this._escape(item.kind === "entity" ? item.entity.entity_id : item.entity.ip_address || "")}</small>`).join("")}
          <label>Tiskárna<select id="editor-printer"><option value="vc500w" ${this._brotherPrinter === "vc500w" ? "selected" : ""}>Brother VC-500W</option><option value="ql820nwb" ${this._brotherPrinter === "ql820nwb" ? "selected" : ""}>Brother QL-820NWB</option></select></label>
          <label>Role<select id="editor-roll">${this._brotherRollOptions().map((roll) => `<option value="${roll.id}" ${roll.id === this._brotherRoll ? "selected" : ""}>${roll.name}</option>`).join("")}</select></label>
          ${this._brotherRollOptions().find((roll) => roll.id === this._brotherRoll)?.length === null ? `<label>Délka (mm)<input id="editor-length" type="number" min="30" max="300" value="${this._escape(this._brotherLength)}"></label>` : ""}
          <label>Obsah<select id="editor-variant"><option value="text" ${this._labelVariant === "text" ? "selected" : ""}>Text</option><option value="text_qr" ${this._labelVariant === "text_qr" ? "selected" : ""}>Text a QR</option><option value="qr" ${this._labelVariant === "qr" ? "selected" : ""}>Pouze QR</option></select></label>
          <label>Uložená šablona<select id="editor-template"><option value="">Bez šablony</option>${this._labelTemplates.map((item) => `<option value="${this._escape(item.id)}" ${item.id === this._labelTemplateId ? "selected" : ""}>${this._escape(item.name)}</option>`).join("")}</select></label>
          <div class="row-print-actions"><button id="template-save">Uložit novou</button><button id="template-update" ${!this._labelTemplateId ? "disabled" : ""}>Uložit změny</button><button id="template-delete" ${!this._labelTemplateId ? "disabled" : ""}>Smazat</button></div>
          <strong>Náhled</strong><img id="label-preview" alt="Náhled štítku"><div id="label-preview-error" role="status"></div>
          <small>Náhled nezaručuje přesnou fyzickou délku ani čitelnost po vytištění. ID entity a IP zařízení zůstávají původní.</small>
          <div class="row-print-actions"><button id="editor-print">Pokračovat k potvrzení tisku</button><button id="editor-cancel">Zrušit</button></div>
        </div></dialog>` : ""}
      ${this._selected ? `<dialog open>
        <div class="dialog-head"><div><h2>${this._escape(this._selected.name)}</h2><div class="entity-id">${this._escape(this._selected.entity_id)}</div></div><button id="clear">${"Clear history"}</button><button id="close">✕</button></div>
        <div class="dialog-body">
          ${this._history.map((event) => `<div class="history"><span>${this._escape(new Date(event.timestamp).toLocaleString())}</span><span class="event-${this._escape(event.type)}">${this._escape(event.type)}</span><span>${this._escape(event.old_state ?? "—")} → ${this._escape(event.new_state ?? "—")}</span></div>`).join("") || `<div class="empty">${"No records yet"}</div>`}
        </div>
      </dialog>` : ""}
      </ha-top-app-bar-fixed>
    `;

    this.shadowRoot.querySelector("#open-scanner")?.addEventListener("click", () => this._startScanner());
    this.shadowRoot.querySelector("#refresh")?.addEventListener("click", () => this._refreshCurrentCategory());
    this.shadowRoot.querySelector("#toggle-filters")?.addEventListener("click", () => {
      this._filtersOpen = !this._filtersOpen;
      this._render();
    });
    this.shadowRoot.querySelector(".print-options")?.addEventListener("toggle", (event) => { this._printOptionsOpen = event.target.open; });
    // Při překreslení panelu zachováme otevřené volby tiskárny i rozpracovaný tisk.
    this.shadowRoot.querySelector(".brother-options")?.addEventListener("toggle", (event) => { this._brotherOptionsOpen = event.target.open; });
    this.shadowRoot.querySelector("#search")?.addEventListener("input", (event) => {
      this._filter = event.target.value;
      this._render();
      const search = this.shadowRoot.querySelector("#search");
      search?.focus();
      search?.setSelectionRange(this._filter.length, this._filter.length);
    });
    this.shadowRoot.querySelector("#problems")?.addEventListener("change", (event) => { this._problemOnly = event.target.checked; this._render(); });
    this.shadowRoot.querySelector("#device-filter")?.addEventListener("change", (event) => { this._device = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#manufacturer-filter")?.addEventListener("change", (event) => { this._manufacturer = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#model-filter")?.addEventListener("change", (event) => { this._model = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#platform-filter")?.addEventListener("change", (event) => { this._platform = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#area-filter")?.addEventListener("change", (event) => { this._area = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#domain-filter")?.addEventListener("change", (event) => { this._domain = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#audit-filter")?.addEventListener("change", (event) => { this._audit = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#category")?.addEventListener("change", (event) => this._setCategory(event.target.value));
    this.shadowRoot.querySelector("#group-by")?.addEventListener("change", (event) => { this._groupBy = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#bulk-enable")?.addEventListener("click", () => this._bulkSet(rows, true));
    this.shadowRoot.querySelector("#bulk-disable")?.addEventListener("click", () => this._bulkSet(rows, false));
    this.shadowRoot.querySelector("#export")?.addEventListener("click", () => this._exportCsv(rows));
    this.shadowRoot.querySelector("#download-labels")?.addEventListener("click", () => this._downloadLabelsPdf(rows));
    this.shadowRoot.querySelector("#brother-roll")?.addEventListener("change", (event) => {
      this._brotherRoll = event.target.value;
      this._render();
    });
    this.shadowRoot.querySelector("#brother-printer")?.addEventListener("change", (event) => {
      this._brotherPrinter = event.target.value;
      this._brotherRoll = this._brotherRollOptions()[0].id;
      this._render();
    });
    this.shadowRoot.querySelector("#brother-length")?.addEventListener("input", (event) => {
      this._brotherLength = event.target.value;
    });
    this.shadowRoot.querySelector("#download-brother-labels")?.addEventListener("click", () => this._downloadBrotherLabelsPdf(rows));
    this.shadowRoot.querySelector("#print-brother-labels")?.addEventListener("click", () => {
      this._printEntityId = null;
      this._printBrotherLabels(rows);
    });
    this.shadowRoot.querySelector("#stop-brother-print")?.addEventListener("click", () => { this._stopPrintRun = true; });
    this.shadowRoot.querySelector("#share-label-pdf")?.addEventListener("click", () => this._shareLabelPdf());
    this.shadowRoot.querySelector("#discard-label-pdf")?.addEventListener("click", () => { this._revokeLabelPdf(); this._render(); });
    this.shadowRoot.querySelectorAll(".toggle").forEach((input) => input.addEventListener("change", () => this._toggle(rows[Number(input.dataset.index)], input.checked)));
    this.shadowRoot.querySelectorAll(".history-button").forEach((button) => button.addEventListener("click", () => this._open(rows[Number(button.dataset.index)])));
    this.shadowRoot.querySelectorAll(".state-button").forEach((button) => button.addEventListener("click", () => this._showEntity(rows[Number(button.dataset.index)].entity_id)));
    this.shadowRoot.querySelectorAll(".label-action").forEach((input) => input.addEventListener("change", () => {
      const entity = rows[Number(input.dataset.index)];
      const action = input.value;
      input.value = "";
      if (action === "print-entity" || action === "print-device") this._printRowLabel(entity, action.slice(6));
      else if (action === "pair-entity" || action === "pair-device") this._setPairItem(entity, action.slice(5));
      else if (action === "pair-remove") this._setPairItem(entity, "");
    }));
    this.shadowRoot.querySelector("#print-pair")?.addEventListener("click", () => this._printBrotherPair());
    this.shadowRoot.querySelector("#clear-pair")?.addEventListener("click", () => { this._labelPair.clear(); this._render(); });
    this.shadowRoot.querySelectorAll(".label-title").forEach((input) => input.addEventListener("input", () => {
      this._labelEditor[Number(input.dataset.index)].title = input.value;
      this._refreshLabelPreview();
    }));
    this.shadowRoot.querySelector("#editor-printer")?.addEventListener("change", (event) => {
      this._brotherPrinter = event.target.value;
      this._brotherRoll = this._brotherRollOptions()[0].id;
      this._render(); this._refreshLabelPreview();
    });
    this.shadowRoot.querySelector("#editor-roll")?.addEventListener("change", (event) => { this._brotherRoll = event.target.value; this._render(); this._refreshLabelPreview(); });
    this.shadowRoot.querySelector("#editor-length")?.addEventListener("input", (event) => { this._brotherLength = event.target.value; this._refreshLabelPreview(); });
    this.shadowRoot.querySelector("#editor-variant")?.addEventListener("change", (event) => { this._labelVariant = event.target.value; this._refreshLabelPreview(); });
    this.shadowRoot.querySelector("#editor-template")?.addEventListener("change", (event) => this._applyLabelTemplate(event.target.value));
    this.shadowRoot.querySelector("#template-save")?.addEventListener("click", () => this._saveLabelTemplate());
    this.shadowRoot.querySelector("#template-update")?.addEventListener("click", () => this._saveLabelTemplate(true));
    this.shadowRoot.querySelector("#template-delete")?.addEventListener("click", () => this._deleteLabelTemplate());
    this.shadowRoot.querySelector("#editor-print")?.addEventListener("click", () => this._submitLabelEditor());
    for (const id of ["#editor-cancel", "#label-editor-close"]) this.shadowRoot.querySelector(id)?.addEventListener("click", () => { this._labelEditor = null; this._render(); });
    const labelDialog = this.shadowRoot.querySelector(".label-editor");
    if (labelDialog && !labelDialog.open) {
      labelDialog.addEventListener("cancel", (event) => { event.preventDefault(); this._labelEditor = null; this._render(); });
      // Modální režim drží editor nad seznamem i po posunu na mobilu.
      try { labelDialog.showModal(); } catch (_error) { labelDialog.setAttribute("open", ""); }
    }
    this.shadowRoot.querySelector("#close")?.addEventListener("click", () => { this._selected = null; this._render(); });
    this.shadowRoot.querySelector("#clear")?.addEventListener("click", () => this._clear());
    if (this._scannerOpen && typeof document !== "undefined") this._renderScannerDialog();
  }
}

if (!customElements.get("entity-audit-panel-v0332")) {
  customElements.define("entity-audit-panel-v0332", EntityAuditPanel);
}
