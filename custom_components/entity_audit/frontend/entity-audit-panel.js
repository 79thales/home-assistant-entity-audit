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
    this._groupBy = "device";
    this._problemOnly = false;
    this._selected = null;
    this._history = [];
    this._loading = false;
  }

  set hass(value) {
    this._hass = value;
    if (!this._loaded) {
      this._loaded = true;
      this._load();
    }
  }

  set panel(value) { this._panel = value; }
  set narrow(value) { this._narrow = value; }

  connectedCallback() { this._render(); }

  _t(cs, en) {
    return this._hass?.language === "cs" ? cs : en;
  }

  async _load() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    this._error = null;
    this._render();
    try {
      this._entities = await this._hass.callWS({ type: "entity_audit/list_entities" });
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

  async _toggle(entity, enabled) {
    await this._hass.callWS({
      type: "entity_audit/set_logging",
      entity_id: entity.entity_id,
      enabled,
    });
    entity.logging = enabled;
    this._render();
  }

  async _bulkSet(rows, enabled) {
    if (!rows.length) return;
    const action = enabled ? this._t("zapnout", "enable") : this._t("vypnout", "disable");
    if (!confirm(this._t(
      `Opravdu ${action} audit pro ${rows.length} zobrazených entit?`,
      `Really ${action} auditing for ${rows.length} displayed entities?`
    ))) return;
    await this._hass.callWS({
      type: "entity_audit/set_logging_bulk",
      entity_ids: rows.map((entity) => entity.entity_id),
      enabled,
    });
    rows.forEach((entity) => { entity.logging = enabled; });
    this._render();
  }

  async _open(entity) {
    this._selected = entity;
    this._history = await this._hass.callWS({
      type: "entity_audit/get_history",
      entity_id: entity.entity_id,
      limit: 500,
    });
    this._render();
  }

  async _clear() {
    if (!this._selected || !confirm(this._t("Opravdu smazat uloženou historii této entity?", "Delete stored history for this entity?"))) return;
    await this._hass.callWS({
      type: "entity_audit/clear_history",
      entity_id: this._selected.entity_id,
    });
    this._history = [];
    this._selected.event_count = 0;
    this._render();
  }

  _showEntity(entityId) {
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

  _exportCsv(rows) {
    const headers = ["name", "entity_id", "domain", "device", "manufacturer", "model", "area", "integration", "state", "problem", "audited", "last_changed"];
    const lines = [headers.map((value) => this._csvCell(value)).join(";")];
    for (const entity of rows) {
      lines.push([
        entity.name,
        entity.entity_id,
        entity.domain,
        entity.device_name,
        entity.manufacturer,
        entity.model,
        entity.area_name,
        entity.platform,
        entity.state,
        entity.problem,
        entity.logging ? "true" : "false",
        entity.last_changed,
      ].map((value) => this._csvCell(value)).join(";"));
    }
    const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `entity-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
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
      device: ["device_id", "device_name", this._t("Bez zařízení", "No device")],
      manufacturer: ["manufacturer", "manufacturer", this._t("Neznámý výrobce", "Unknown manufacturer")],
      model: ["model", "model", this._t("Neznámý model", "Unknown model")],
      platform: ["platform", "platform", this._t("Neznámá integrace", "Unknown integration")],
      area: ["area_id", "area_name", this._t("Bez oblasti", "No area")],
      domain: ["domain", "domain", this._t("Neznámý typ", "Unknown type")],
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

  _render() {
    if (!this.shadowRoot) return;
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
      const matches = !query || `${entity.name} ${entity.entity_id} ${entity.device_name || ""} ${entity.manufacturer || ""} ${entity.model || ""} ${entity.area_name || ""} ${entity.platform || ""}`.toLocaleLowerCase().includes(query);
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
        :host { display:block; color:var(--primary-text-color); background:var(--primary-background-color); min-height:100vh; }
        * { box-sizing:border-box; }
        header { padding:20px 24px; background:var(--app-header-background-color, var(--primary-color)); color:var(--app-header-text-color, white); display:flex; align-items:center; gap:14px; }
        h1 { margin:0; font-size:22px; flex:1; }
        button, input, select { font:inherit; }
        button { border:0; border-radius:8px; padding:9px 13px; cursor:pointer; color:var(--primary-text-color); background:var(--secondary-background-color); }
        header button { background:rgba(255,255,255,.16); color:inherit; }
        main { max-width:1400px; margin:auto; padding:20px; }
        .stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:16px; }
        .stat, .card { background:var(--card-background-color); border-radius:12px; box-shadow:var(--ha-card-box-shadow); padding:16px; }
        .stat b { font-size:26px; display:block; }
        .toolbar { display:flex; gap:12px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
        .filters { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; margin-bottom:12px; }
        .search { flex:1; }
        .search, select { border:1px solid var(--divider-color); border-radius:9px; padding:11px 13px; color:var(--primary-text-color); background:var(--card-background-color); min-width:0; }
        .device-filter { min-width:260px; max-width:460px; }
        label.filter { display:flex; gap:7px; align-items:center; white-space:nowrap; }
        .table-wrap { overflow:auto; background:var(--card-background-color); border-radius:12px; box-shadow:var(--ha-card-box-shadow); }
        table { width:100%; border-collapse:collapse; }
        th, td { padding:11px 13px; text-align:left; border-bottom:1px solid var(--divider-color); }
        th { font-size:12px; color:var(--secondary-text-color); text-transform:uppercase; position:sticky; top:0; background:var(--card-background-color); }
        tr:hover td { background:var(--secondary-background-color); }
        .group-row td { position:sticky; top:38px; z-index:1; background:var(--secondary-background-color); font-weight:700; }
        .group-summary { color:var(--secondary-text-color); font-size:12px; font-weight:400; margin-left:8px; }
        .name { font-weight:600; }
        .entity-id, .muted { color:var(--secondary-text-color); font-size:12px; }
        .badge { display:inline-block; border-radius:999px; padding:4px 8px; font-size:12px; background:var(--secondary-background-color); }
        .problem { background:var(--error-color); color:white; }
        .ok { color:var(--success-color); }
        .switch { width:18px; height:18px; }
        .link, .state-button { color:var(--primary-color); background:transparent; padding:4px; }
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
        @media(max-width:700px) { .stats { grid-template-columns:1fr; } .toolbar { align-items:stretch; flex-direction:column; } .device-filter { min-width:0; max-width:none; } th:nth-child(4), td:nth-child(4) { display:none; } .history { grid-template-columns:1fr; } }
      </style>
      <header>
        <h1>${this._t("Audit entit", "Entity Audit")}</h1>
        <button id="refresh">${this._loading ? this._t("Načítám…", "Loading…") : this._t("Obnovit", "Refresh")}</button>
      </header>
      <main>
        ${this._error ? `<div class="card problem">${this._escape(this._error)}</div>` : ""}
        <section class="stats">
          <div class="stat"><b>${this._entities.length}</b>${this._t("známých entit", "known entities")}</div>
          <div class="stat"><b>${this._entities.filter((e) => e.logging).length}</b>${this._t("auditovaných", "audited")}</div>
          <div class="stat"><b>${problemCount}</b>${this._t("aktuálních problémů", "current problems")}</div>
        </section>
        <div class="toolbar">
          <input id="search" class="search" type="search" placeholder="${this._t("Hledat název, zařízení, entity_id nebo integraci…", "Search name, device, entity_id or integration…")}" value="${this._escape(this._filter)}">
          <select id="group-by" aria-label="${this._t("Seskupit podle", "Group by")}">
            <option value="none" ${this._groupBy === "none" ? "selected" : ""}>${this._t("Bez seskupení", "No grouping")}</option>
            <option value="device" ${this._groupBy === "device" ? "selected" : ""}>${this._t("Podle zařízení", "By device")}</option>
            <option value="manufacturer" ${this._groupBy === "manufacturer" ? "selected" : ""}>${this._t("Podle výrobce", "By manufacturer")}</option>
            <option value="model" ${this._groupBy === "model" ? "selected" : ""}>${this._t("Podle modelu", "By model")}</option>
            <option value="platform" ${this._groupBy === "platform" ? "selected" : ""}>${this._t("Podle integrace", "By integration")}</option>
            <option value="area" ${this._groupBy === "area" ? "selected" : ""}>${this._t("Podle oblasti", "By area")}</option>
            <option value="domain" ${this._groupBy === "domain" ? "selected" : ""}>${this._t("Podle typu entity", "By entity type")}</option>
          </select>
          <label class="filter"><input id="problems" type="checkbox" ${this._problemOnly ? "checked" : ""}> ${this._t("Jen problémy", "Problems only")}</label>
          <button id="bulk-enable">${this._t("Auditovat zobrazené", "Audit displayed")}</button>
          <button id="bulk-disable">${this._t("Vypnout audit", "Disable audit")}</button>
          <button id="export">${this._t("Export CSV", "Export CSV")}</button>
        </div>
        <div class="filters">
          <select id="device-filter" class="device-filter" aria-label="${this._t("Filtrovat podle zařízení", "Filter by device")}">
            <option value="">${this._t("Všechna zařízení", "All devices")}</option>
            <option value="__none__" ${this._device === "__none__" ? "selected" : ""}>${this._t("Bez zařízení", "No device")}</option>
            ${devices.map(([id, name]) => `<option value="${this._escape(id)}" ${this._device === id ? "selected" : ""}>${this._escape(name)}</option>`).join("")}
          </select>
          <select id="manufacturer-filter" aria-label="${this._t("Filtrovat podle výrobce", "Filter by manufacturer")}">
            <option value="">${this._t("Všichni výrobci", "All manufacturers")}</option>
            <option value="__none__" ${this._manufacturer === "__none__" ? "selected" : ""}>${this._t("Neznámý výrobce", "Unknown manufacturer")}</option>
            ${manufacturers.map(([value, label]) => `<option value="${this._escape(value)}" ${this._manufacturer === value ? "selected" : ""}>${this._escape(label)}</option>`).join("")}
          </select>
          <select id="model-filter" aria-label="${this._t("Filtrovat podle modelu", "Filter by model")}">
            <option value="">${this._t("Všechny modely", "All models")}</option>
            <option value="__none__" ${this._model === "__none__" ? "selected" : ""}>${this._t("Neznámý model", "Unknown model")}</option>
            ${models.map(([value, label]) => `<option value="${this._escape(value)}" ${this._model === value ? "selected" : ""}>${this._escape(label)}</option>`).join("")}
          </select>
          <select id="platform-filter" aria-label="${this._t("Filtrovat podle integrace", "Filter by integration")}">
            <option value="">${this._t("Všechny integrace", "All integrations")}</option>
            ${platforms.map(([value, label]) => `<option value="${this._escape(value)}" ${this._platform === value ? "selected" : ""}>${this._escape(label)}</option>`).join("")}
          </select>
          <select id="area-filter" aria-label="${this._t("Filtrovat podle oblasti", "Filter by area")}">
            <option value="">${this._t("Všechny oblasti", "All areas")}</option>
            <option value="__none__" ${this._area === "__none__" ? "selected" : ""}>${this._t("Bez oblasti", "No area")}</option>
            ${areas.map(([value, label]) => `<option value="${this._escape(value)}" ${this._area === value ? "selected" : ""}>${this._escape(label)}</option>`).join("")}
          </select>
          <select id="domain-filter" aria-label="${this._t("Filtrovat podle typu entity", "Filter by entity type")}">
            <option value="">${this._t("Všechny typy entit", "All entity types")}</option>
            ${domains.map(([value, label]) => `<option value="${this._escape(value)}" ${this._domain === value ? "selected" : ""}>${this._escape(label)}</option>`).join("")}
          </select>
          <select id="audit-filter" aria-label="${this._t("Filtrovat podle auditu", "Filter by audit")}">
            <option value="">${this._t("Audit zapnutý i vypnutý", "All audit states")}</option>
            <option value="enabled" ${this._audit === "enabled" ? "selected" : ""}>${this._t("Audit zapnutý", "Audit enabled")}</option>
            <option value="disabled" ${this._audit === "disabled" ? "selected" : ""}>${this._t("Audit vypnutý", "Audit disabled")}</option>
          </select>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>${this._t("Entita", "Entity")}</th><th>${this._t("Stav", "State")}</th><th>${this._t("Zařízení", "Device")}</th><th>${this._t("Integrace", "Integration")}</th><th>${this._t("Auditovat", "Audit")}</th><th>${this._t("Historie", "History")}</th></tr></thead>
            <tbody>${groups.map((group) => `${this._groupBy !== "none" ? `
              <tr class="group-row"><td colspan="6">${this._escape(group.label)}<span class="group-summary">${group.rows.length} ${this._t("entit", "entities")} · ${group.rows.filter((entity) => entity.problem).length} ${this._t("problémů", "problems")} · ${group.rows.filter((entity) => entity.logging).length} ${this._t("auditovaných", "audited")}</span></td></tr>` : ""}
              ${group.rows.map((entity) => {
                const index = rowIndexes.get(entity.entity_id);
                return `<tr>
                  <td><div class="name">${this._escape(entity.name)}</div><div class="entity-id">${this._escape(entity.entity_id)}${entity.disabled ? ` · ${this._t("vypnuto", "disabled")}` : ""}</div></td>
                  <td><button class="state-button" data-index="${index}" title="${this._t("Zobrazit detail entity", "Show entity details")}">${entity.problem ? `<span class="badge problem">${this._escape(entity.problem)}</span>` : `<span class="badge">${this._escape(entity.state ?? "—")}</span>`}</button></td>
                  <td><div>${this._escape(entity.device_name || this._t("Bez zařízení", "No device"))}</div><div class="muted">${this._escape([entity.manufacturer, entity.model, entity.area_name].filter(Boolean).join(" · "))}</div></td>
                  <td>${this._escape(entity.platform || "—")}</td>
                  <td><input class="switch toggle" data-index="${index}" type="checkbox" ${entity.logging ? "checked" : ""} aria-label="Audit ${this._escape(entity.entity_id)}"></td>
                  <td><button class="link history-button" data-index="${index}">${entity.event_count} ${this._t("záznamů", "events")}</button></td>
                </tr>`;
              }).join("")}`).join("") || `<tr><td class="empty" colspan="6">${this._t("Žádné odpovídající entity", "No matching entities")}</td></tr>`}</tbody>
          </table>
        </div>
      </main>
      ${this._selected ? `<dialog open>
        <div class="dialog-head"><div><h2>${this._escape(this._selected.name)}</h2><div class="entity-id">${this._escape(this._selected.entity_id)}</div></div><button id="clear">${this._t("Smazat historii", "Clear history")}</button><button id="close">✕</button></div>
        <div class="dialog-body">
          ${this._history.map((event) => `<div class="history"><span>${this._escape(new Date(event.timestamp).toLocaleString())}</span><span class="event-${this._escape(event.type)}">${this._escape(event.type)}</span><span>${this._escape(event.old_state ?? "—")} → ${this._escape(event.new_state ?? "—")}</span></div>`).join("") || `<div class="empty">${this._t("Zatím bez záznamů", "No records yet")}</div>`}
        </div>
      </dialog>` : ""}
    `;

    this.shadowRoot.querySelector("#refresh")?.addEventListener("click", () => this._load());
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
    this.shadowRoot.querySelector("#group-by")?.addEventListener("change", (event) => { this._groupBy = event.target.value; this._render(); });
    this.shadowRoot.querySelector("#bulk-enable")?.addEventListener("click", () => this._bulkSet(rows, true));
    this.shadowRoot.querySelector("#bulk-disable")?.addEventListener("click", () => this._bulkSet(rows, false));
    this.shadowRoot.querySelector("#export")?.addEventListener("click", () => this._exportCsv(rows));
    this.shadowRoot.querySelectorAll(".toggle").forEach((input) => input.addEventListener("change", () => this._toggle(rows[Number(input.dataset.index)], input.checked)));
    this.shadowRoot.querySelectorAll(".history-button").forEach((button) => button.addEventListener("click", () => this._open(rows[Number(button.dataset.index)])));
    this.shadowRoot.querySelectorAll(".state-button").forEach((button) => button.addEventListener("click", () => this._showEntity(rows[Number(button.dataset.index)].entity_id)));
    this.shadowRoot.querySelector("#close")?.addEventListener("click", () => { this._selected = null; this._render(); });
    this.shadowRoot.querySelector("#clear")?.addEventListener("click", () => this._clear());
  }
}

if (!customElements.get("entity-audit-panel-v031")) {
  customElements.define("entity-audit-panel-v031", EntityAuditPanel);
}
