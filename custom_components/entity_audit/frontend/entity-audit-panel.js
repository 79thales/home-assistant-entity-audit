class EntityAuditPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._entities = [];
    this._filter = "";
    this._device = "";
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
    const headers = ["name", "entity_id", "device", "integration", "state", "problem", "audited", "last_changed"];
    const lines = [headers.map((value) => this._csvCell(value)).join(";")];
    for (const entity of rows) {
      lines.push([
        entity.name,
        entity.entity_id,
        entity.device_name,
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

  _render() {
    if (!this.shadowRoot) return;
    const query = this._filter.toLocaleLowerCase();
    const devices = [...new Map(
      this._entities
        .filter((entity) => entity.device_id)
        .map((entity) => [entity.device_id, entity.device_name || entity.device_id])
    ).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const rows = this._entities.filter((entity) => {
      const matches = !query || `${entity.name} ${entity.entity_id} ${entity.device_name || ""} ${entity.platform || ""}`.toLocaleLowerCase().includes(query);
      const deviceMatches = !this._device
        || (this._device === "__none__" ? !entity.device_id : entity.device_id === this._device);
      return matches && deviceMatches && (!this._problemOnly || entity.problem);
    });
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
        .toolbar { display:flex; gap:12px; align-items:center; margin-bottom:12px; }
        .search { flex:1; }
        .search, .device-filter { border:1px solid var(--divider-color); border-radius:9px; padding:11px 13px; color:var(--primary-text-color); background:var(--card-background-color); }
        .device-filter { max-width:320px; }
        label.filter { display:flex; gap:7px; align-items:center; white-space:nowrap; }
        .table-wrap { overflow:auto; background:var(--card-background-color); border-radius:12px; box-shadow:var(--ha-card-box-shadow); }
        table { width:100%; border-collapse:collapse; }
        th, td { padding:11px 13px; text-align:left; border-bottom:1px solid var(--divider-color); }
        th { font-size:12px; color:var(--secondary-text-color); text-transform:uppercase; position:sticky; top:0; background:var(--card-background-color); }
        tr:hover td { background:var(--secondary-background-color); }
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
        @media(max-width:700px) { .stats { grid-template-columns:1fr; } .toolbar { align-items:stretch; flex-direction:column; } th:nth-child(4), td:nth-child(4) { display:none; } .history { grid-template-columns:1fr; } }
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
          <select id="device-filter" class="device-filter" aria-label="${this._t("Filtrovat podle zařízení", "Filter by device")}">
            <option value="">${this._t("Všechna zařízení", "All devices")}</option>
            <option value="__none__" ${this._device === "__none__" ? "selected" : ""}>${this._t("Bez zařízení", "No device")}</option>
            ${devices.map(([id, name]) => `<option value="${this._escape(id)}" ${this._device === id ? "selected" : ""}>${this._escape(name)}</option>`).join("")}
          </select>
          <label class="filter"><input id="problems" type="checkbox" ${this._problemOnly ? "checked" : ""}> ${this._t("Jen problémy", "Problems only")}</label>
          <button id="export">${this._t("Export CSV", "Export CSV")}</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>${this._t("Entita", "Entity")}</th><th>${this._t("Stav", "State")}</th><th>${this._t("Zařízení", "Device")}</th><th>${this._t("Integrace", "Integration")}</th><th>${this._t("Auditovat", "Audit")}</th><th>${this._t("Historie", "History")}</th></tr></thead>
            <tbody>${rows.map((entity, index) => `
              <tr>
                <td><div class="name">${this._escape(entity.name)}</div><div class="entity-id">${this._escape(entity.entity_id)}${entity.disabled ? ` · ${this._t("vypnuto", "disabled")}` : ""}</div></td>
                <td><button class="state-button" data-index="${index}" title="${this._t("Zobrazit detail entity", "Show entity details")}">${entity.problem ? `<span class="badge problem">${this._escape(entity.problem)}</span>` : `<span class="badge">${this._escape(entity.state ?? "—")}</span>`}</button></td>
                <td>${this._escape(entity.device_name || this._t("Bez zařízení", "No device"))}</td>
                <td>${this._escape(entity.platform || "—")}</td>
                <td><input class="switch toggle" data-index="${index}" type="checkbox" ${entity.logging ? "checked" : ""} aria-label="Audit ${this._escape(entity.entity_id)}"></td>
                <td><button class="link history-button" data-index="${index}">${entity.event_count} ${this._t("záznamů", "events")}</button></td>
              </tr>`).join("") || `<tr><td class="empty" colspan="6">${this._t("Žádné odpovídající entity", "No matching entities")}</td></tr>`}</tbody>
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
    this.shadowRoot.querySelector("#export")?.addEventListener("click", () => this._exportCsv(rows));
    this.shadowRoot.querySelectorAll(".toggle").forEach((input) => input.addEventListener("change", () => this._toggle(rows[Number(input.dataset.index)], input.checked)));
    this.shadowRoot.querySelectorAll(".history-button").forEach((button) => button.addEventListener("click", () => this._open(rows[Number(button.dataset.index)])));
    this.shadowRoot.querySelectorAll(".state-button").forEach((button) => button.addEventListener("click", () => this._showEntity(rows[Number(button.dataset.index)].entity_id)));
    this.shadowRoot.querySelector("#close")?.addEventListener("click", () => { this._selected = null; this._render(); });
    this.shadowRoot.querySelector("#clear")?.addEventListener("click", () => this._clear());
  }
}

if (!customElements.get("entity-audit-panel-v021")) {
  customElements.define("entity-audit-panel-v021", EntityAuditPanel);
}
