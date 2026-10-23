const qrcode = require("../custom_components/entity_audit/frontend/qrcode.js");
const jsQR = require("../custom_components/entity_audit/frontend/jsQR.js");

qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

global.window = global;
global.HTMLElement = class {
  attachShadow() {
    this.shadowRoot = {
      innerHTML: "",
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
    return this.shadowRoot;
  }
};
global.customElements = {
  define(_name, klass) { global.EntityAuditPanel = klass; },
  get() { return undefined; },
};
require("../custom_components/entity_audit/frontend/entity-audit-panel.js");

const labelData = {
  name: "Solar inverter",
  ip_address: "192.168.1.20",
  mac_address: "00:11:22:33:44:55",
  manufacturer: "GoodWe",
  area: "Utility room",
};
const panel = new global.EntityAuditPanel();
const payload = panel._labelQrPayload({
  device_name: labelData.name,
  ip_address: labelData.ip_address,
  mac_address: labelData.mac_address,
  manufacturer: labelData.manufacturer,
  area_name: labelData.area,
});
if (JSON.stringify(JSON.parse(payload)) !== JSON.stringify(labelData)) {
  throw new Error("QR payload does not contain the complete label data");
}

const textContext = {
  font: "700 24px Arial, sans-serif",
  measureText(value) {
    const size = Number(this.font.match(/(\d+)px/)?.[1] || 12);
    return { width: Array.from(String(value)).length * size * 0.55 };
  },
};
const longTitle = panel._fitTronicTitle(
  textContext,
  "Android_e9a3d16ba2834b5b_device_tracker",
  200,
  2,
  24,
  8
);
if (!longTitle.complete || longTitle.lines.length > 2 || longTitle.lines.join("") !== "Android_e9a3d16ba2834b5b_device_tracker") {
  throw new Error("Long thermal-label titles must wrap or reduce their font without truncation");
}

const code = qrcode(0, "M");
code.addData(payload, "Byte");
code.make();

if (code.getModuleCount() < 21) throw new Error("QR matrix is unexpectedly small");
if (![true, false].includes(code.isDark(0, 0))) throw new Error("QR matrix is invalid");

const quietZone = 4;
const moduleSize = 8;
const moduleCount = code.getModuleCount();
const imageSize = (moduleCount + (quietZone * 2)) * moduleSize;
const pixels = new Uint8ClampedArray(imageSize * imageSize * 4);
pixels.fill(255);
for (let row = 0; row < moduleCount; row += 1) {
  for (let column = 0; column < moduleCount; column += 1) {
    if (!code.isDark(row, column)) continue;
    for (let offsetY = 0; offsetY < moduleSize; offsetY += 1) {
      for (let offsetX = 0; offsetX < moduleSize; offsetX += 1) {
        const x = ((column + quietZone) * moduleSize) + offsetX;
        const y = ((row + quietZone) * moduleSize) + offsetY;
        const pixel = ((y * imageSize) + x) * 4;
        pixels[pixel] = 0;
        pixels[pixel + 1] = 0;
        pixels[pixel + 2] = 0;
      }
    }
  }
}

const decoded = jsQR(pixels, imageSize, imageSize, { inversionAttempts: "dontInvert" });
if (!decoded || decoded.data !== payload) {
  throw new Error("Generated Entity Audit QR label could not be decoded");
}

const parsed = panel._parseLabelQr(decoded.data);
if (JSON.stringify(parsed) !== JSON.stringify(labelData)) {
  throw new Error("Decoded virtual label does not preserve all label fields");
}

panel._entities = [
  {
    device_id: "device-1",
    device_name: labelData.name,
    ip_address: labelData.ip_address,
    mac_address: labelData.mac_address,
  },
  {
    device_id: "device-1",
    device_name: `${labelData.name} sensor`,
    ip_address: null,
    mac_address: labelData.mac_address.toLowerCase().replaceAll(":", "-"),
  },
];
if (panel._matchScannedDevice(parsed)?.device_id !== "device-1") {
  throw new Error("Scanned label was not matched to its Home Assistant device");
}

panel._entities = [
  { device_id: "device-2", ip_address: labelData.ip_address, mac_address: null },
  { device_id: "device-2", ip_address: null, mac_address: null },
];
if (panel._matchScannedDevice(parsed)?.device_id !== "device-2") {
  throw new Error("Scanned label did not fall back to a unique IP address match");
}

panel._entities.push({
  device_id: "device-3",
  ip_address: labelData.ip_address,
  mac_address: null,
});
if (panel._matchScannedDevice(parsed) !== null) {
  throw new Error("Ambiguous IP address was incorrectly matched to a device");
}

const catalogPanel = new global.EntityAuditPanel();
catalogPanel._category = "hacs";
catalogPanel._hacsAvailable = true;
catalogPanel._hacsRepositories = [{
  name: "Example HACS integration",
  repository: "example/home-assistant-integration",
  category: "integration",
  domain: "example",
  description: "An example repository",
  installed_version: "1.0.0",
  available_version: "1.1.0",
  update_available: true,
  restart_required: false,
}];
catalogPanel._renderSecondaryCategory();
if (!catalogPanel.shadowRoot.innerHTML.includes("Export HACS CSV")) {
  throw new Error("HACS category did not render its CSV export");
}
if (!catalogPanel.shadowRoot.innerHTML.includes("Example HACS integration")) {
  throw new Error("HACS category did not render repositories");
}

catalogPanel._category = "users";
catalogPanel._users = [{
  name: "Example administrator",
  role_key: "administrator",
  role: "Administrator",
  access: "Full access",
  groups: ["Administrators"],
  permission_policy: '[{"group":"Administrators","policy":{}}]',
  active: true,
  local_only: false,
  system_generated: false,
}];
catalogPanel._renderSecondaryCategory();
if (!catalogPanel.shadowRoot.innerHTML.includes("Export users CSV")) {
  throw new Error("Users category did not render its CSV export");
}
if (!catalogPanel.shadowRoot.innerHTML.includes("Example administrator")) {
  throw new Error("Users category did not render users");
}

catalogPanel._category = "automations";
catalogPanel._automationScripts = [{
  name: "Example automation",
  entity_id: "automation.example_automation",
  kind: "automation",
  state: "on",
  mode: "single",
  current: 0,
  max: 10,
  last_triggered: "2026-09-13T10:00:00+00:00",
  unique_id: "example-automation",
  edit_id: "example-automation",
  disabled: false,
  automation_enabled: true,
  status: "enabled",
  platform: "automation",
}, {
  name: "Example script",
  entity_id: "script.example_script",
  kind: "script",
  state: "off",
  mode: "restart",
  current: 0,
  max: 10,
  last_triggered: null,
  unique_id: "example_script",
  edit_id: "example_script",
  disabled: false,
  automation_enabled: null,
  status: "idle",
  platform: "script",
}];
catalogPanel._renderAutomationCategory();
if (!catalogPanel.shadowRoot.innerHTML.includes("Export automation YAML")) {
  throw new Error("Automations category did not render its YAML export");
}
if (!catalogPanel.shadowRoot.innerHTML.includes("Export configuration backup (ZIP)")) {
  throw new Error("Automations category did not render its configuration backup export");
}
if (!catalogPanel.shadowRoot.innerHTML.includes("Export configuration.yaml")) {
  throw new Error("Automations category did not render its configuration YAML export");
}
if (!catalogPanel.shadowRoot.innerHTML.includes("Example automation")) {
  throw new Error("Automations category did not render automations");
}

catalogPanel._category = "scripts";
catalogPanel._renderAutomationCategory();
if (!catalogPanel.shadowRoot.innerHTML.includes("Example script")) {
  throw new Error("Scripts category did not render scripts separately");
}

const sanitizedConfiguration = catalogPanel._redactConfiguration({
  alias: "Example",
  api_key: "must-not-export",
  nested: { access_token: "must-not-export" },
  webhook_id: "must-not-export",
  request_header: "Bearer very-secret-token",
  callback_url: "https://user:password@example.invalid/api",
});
if (sanitizedConfiguration.api_key !== "<REDACTED>" || sanitizedConfiguration.nested.access_token !== "<REDACTED>" || sanitizedConfiguration.webhook_id !== "<REDACTED>" || sanitizedConfiguration.request_header !== "<REDACTED>" || sanitizedConfiguration.callback_url !== "<REDACTED>") {
  throw new Error("Sensitive automation configuration values were not redacted");
}
const exportedYaml = catalogPanel._yamlValue([{ alias: "Example", token: "<REDACTED>" }]);
if (!exportedYaml.includes("token: \"<REDACTED>\"")) {
  throw new Error("Sanitized configuration could not be serialized as YAML");
}
const automationSnapshot = catalogPanel._automationYaml([{
  item: catalogPanel._automationScripts[0],
  config: {
    id: "1778438477010",
    alias: "Example automation",
    triggers: [{ trigger: "state", entity_id: "sensor.example_temperature" }],
    conditions: [],
    actions: [{ action: "switch.turn_on", target: { entity_id: "switch.example" } }],
    mode: "single",
  },
}]);
if (!automationSnapshot.includes("# Entity Audit status at export: enabled")) {
  throw new Error("Automation YAML does not identify the current enabled status");
}
if (!automationSnapshot.includes("-\n  id: \"1778438477010\"")) {
  throw new Error("Automation YAML does not use a restorable YAML list item");
}
const scriptSnapshot = catalogPanel._scriptYaml([{
  item: catalogPanel._automationScripts[1],
  config: { alias: "Example script", sequence: [{ action: "light.turn_on" }] },
}]);
if (!scriptSnapshot.includes("example_script:\n  alias: \"Example script\"")) {
  throw new Error("Script YAML does not use a restorable mapping keyed by script id");
}
if (catalogPanel._automationExportStatus({ kind: "automation", state: "off", automation_enabled: false }) !== "disabled") {
  throw new Error("Automation export status does not identify disabled automations");
}
const configurationInclude = catalogPanel._configurationIncludeYaml();
if (!configurationInclude.includes("automation: !include automations.yaml") || !configurationInclude.includes("script: !include scripts.yaml")) {
  throw new Error("Configuration YAML export is missing include directives");
}
const dependencies = catalogPanel._collectDependencies([{
  item: catalogPanel._automationScripts[0],
  config: {
    id: "1778438477010",
    alias: "Example automation",
    triggers: [{ trigger: "state", entity_id: "sensor.example_temperature" }],
    actions: [{ action: "switch.turn_on", target: { entity_id: "switch.example" } }],
    variables: { description: "{{ states('input_boolean.example_mode') }} {{ states(variable_entity) }}" },
  },
}]);
const dependencyEntityIds = dependencies.entities.map((entry) => entry.entity_id);
if (!dependencyEntityIds.includes("sensor.example_temperature") || !dependencyEntityIds.includes("switch.example") || !dependencyEntityIds.includes("input_boolean.example_mode")) {
  throw new Error("Dependency scan did not collect static entity references");
}
if (!dependencies.services.some((entry) => entry.service === "switch.turn_on")) {
  throw new Error("Dependency scan did not collect service references");
}
if (!dependencies.dynamic_references.some((entry) => entry.expression.includes("states(variable_entity"))) {
  throw new Error("Dependency scan did not identify a dynamic template reference");
}
const missingDependency = dependencies.entities.find((entry) => entry.entity_id === "switch.example");
if (!missingDependency || !missingDependency.referenced_by.some((reference) => reference.alias === "Example automation")) {
  throw new Error("Dependency scan did not retain the source of a missing entity reference");
}
if (catalogPanel._backupEntityState({ domain: "input_text", entity_id: "input_text.password", name: "Password", state: "secret" }) !== "<REDACTED>") {
  throw new Error("Sensitive helper state was not redacted from the backup inventory");
}

async function testZipPackage() {
  const archive = catalogPanel._createZip([
    { name: "entity-audit-backup-2026-09-13_16-20/README.md", content: "Backup\n" },
    { name: "entity-audit-backup-2026-09-13_16-20/manifest.json", content: "{}\n" },
    { name: "entity-audit-backup-2026-09-13_16-20/restore/automations.yaml", content: "[]\n" },
    { name: "entity-audit-backup-2026-09-13_16-20/restore/scripts.yaml", content: "{}\n" },
    { name: "entity-audit-backup-2026-09-13_16-20/diagnostics/validation.txt", content: "VALIDATION RESULT: PASS\n" },
  ]);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error("Automation export package is not a ZIP file");
  }
  const zipText = new TextDecoder().decode(bytes);
  for (const name of ["README.md", "manifest.json", "restore/automations.yaml", "restore/scripts.yaml", "diagnostics/validation.txt"]) {
    if (!zipText.includes(name)) throw new Error(`Configuration backup ZIP is missing ${name}`);
  }
}

async function testInvalidConfigurationResponseFailsCollection() {
  const backupPanel = new global.EntityAuditPanel();
  backupPanel._hass = {
    callWS: () => Promise.resolve({ config: null }),
  };
  const result = await backupPanel._getBackupConfigurationSnapshots([
    { entity_id: "automation.example", kind: "automation" },
  ], "automation");
  if (result.snapshots.length !== 0 || result.errors[0]?.error !== "invalid_configuration_response") {
    throw new Error("An invalid automation configuration response was silently accepted");
  }
}

async function testConfigurationBackupContainsValidatedSnapshot() {
  const backupPanel = new global.EntityAuditPanel();
  let downloaded = null;
  backupPanel._render = () => {};
  backupPanel._recordActivity = () => {};
  backupPanel._load = () => Promise.resolve();
  backupPanel._loadAutomationScripts = () => Promise.resolve();
  backupPanel._downloadBlob = (prefix, extension, blob) => { downloaded = { prefix, extension, blob }; };
  backupPanel._entities = [
    { entity_id: "sensor.example_temperature", domain: "sensor", name: "Temperature", state: "20", unit: "°C", available: true, device_id: "device-1", device_name: "Example device", manufacturer: "Example", model: "Model", area_id: "office", area_name: "Office", platform: "example", last_changed: "2026-09-13T10:00:00+00:00" },
    { entity_id: "switch.example", domain: "switch", name: "Example switch", state: "off", unit: null, available: true, device_id: "device-1", device_name: "Example device", manufacturer: "Example", model: "Model", area_id: "office", area_name: "Office", platform: "example", last_changed: "2026-09-13T10:00:00+00:00" },
    { entity_id: "light.example", domain: "light", name: "Example light", state: "off", unit: null, available: true, device_id: "device-1", device_name: "Example device", manufacturer: "Example", model: "Model", area_id: "office", area_name: "Office", platform: "example", last_changed: "2026-09-13T10:00:00+00:00" },
  ];
  backupPanel._automationScripts = [
    { entity_id: "automation.example_automation", kind: "automation", name: "Example automation", edit_id: "example-automation", unique_id: "example-automation", state: "on", disabled: false, automation_enabled: true, status: "enabled" },
    { entity_id: "script.example_script", kind: "script", name: "Example script", edit_id: "example_script", unique_id: "example_script", state: "off", disabled: false, automation_enabled: null, status: "idle" },
  ];
  backupPanel._hass = {
    config: { version: "2026.9.2" },
    callWS(message) {
      if (message.type === "automation/config") {
        return Promise.resolve({ config: {
          id: "1778438477010",
          alias: "Example automation",
          triggers: [{ trigger: "state", entity_id: "sensor.example_temperature" }],
          conditions: [],
          actions: [{ action: "switch.turn_on", target: { entity_id: "switch.example" } }],
          mode: "single",
        } });
      }
      if (message.type === "script/config") {
        return Promise.resolve({ config: {
          alias: "Example script",
          sequence: [{ action: "light.turn_on", target: { entity_id: "light.example" } }],
        } });
      }
      if (message.type === "get_services") {
        return Promise.resolve({ switch: { turn_on: {} }, light: { turn_on: {} } });
      }
      if (message.type === "entity_audit/validate_configuration_export") {
        return Promise.resolve({
          backup_valid: true,
          yaml_valid: true,
          automations_top_level_list: true,
          scripts_top_level_mapping: true,
          duplicate_automation_ids: [],
          duplicate_automation_aliases: [],
          duplicate_automation_yaml_keys: [],
          duplicate_script_keys: [],
          errors: [],
          warnings: [],
        });
      }
      throw new Error(`Unexpected WebSocket command: ${message.type}`);
    },
  };

  await backupPanel._exportConfigurationBackup();
  if (!downloaded || downloaded.prefix !== "entity-audit-configuration-backup" || downloaded.extension !== "zip") {
    throw new Error("Configuration backup was not downloaded as a ZIP");
  }
  const archiveText = new TextDecoder().decode(new Uint8Array(await downloaded.blob.arrayBuffer()));
  for (const path of [
    "README.md", "manifest.json", "restore/automations.yaml", "restore/scripts.yaml", "restore/helpers.yaml",
    "inventory/entities.csv", "inventory/devices.csv", "inventory/areas.csv", "inventory/integrations.csv", "inventory/services.csv",
    "context/dependencies.yaml", "context/automations.json", "context/scripts.json", "context/automation_states.json", "context/home_assistant.json",
    "diagnostics/validation.txt", "diagnostics/validation.json", "diagnostics/missing_entities.yaml", "diagnostics/missing_services.yaml",
  ]) {
    if (!archiveText.includes(path)) throw new Error(`Configuration backup is missing ${path}`);
  }
  if (!archiveText.includes('"export_format": "entity-audit-backup"') || !archiveText.includes('"automations_enabled": 1') || !archiveText.includes('"enabled": true')) {
    throw new Error("Configuration backup manifest does not preserve automation state");
  }
  if (!archiveText.includes('id: "1778438477010"') || !archiveText.includes('example_script:')) {
    throw new Error("Configuration backup did not preserve restorable automation and script identities");
  }
}

function testEditorNavigation() {
  const previousHistory = global.history;
  const previousDispatchEvent = global.dispatchEvent;
  let path = null;
  global.history = { pushState(_state, _title, value) { path = value; } };
  global.dispatchEvent = () => {};
  try {
    catalogPanel._openAutomationEditor({
      entity_id: "automation.example_automation",
      kind: "automation",
      edit_id: "example-automation",
    });
    if (path !== "/config/automation/edit/example-automation") {
      throw new Error("Automation item did not navigate to its native editor");
    }
  } finally {
    global.history = previousHistory;
    global.dispatchEvent = previousDispatchEvent;
  }
}

for (const invalidPayload of ["not-json", "{}", '{"name":"Only a name"}']) {
  let rejected = false;
  try {
    panel._parseLabelQr(invalidPayload);
  } catch (_error) {
    rejected = true;
  }
  if (!rejected) throw new Error("Invalid QR payload was accepted");
}

panel._scannerOpen = true;
panel._scanResult = { ...parsed, name: "<script>alert(1)</script>" };
panel._scanMatchedDevice = { device_id: "device-1" };
const virtualLabelHtml = panel._scannerDialogContent();
if (!virtualLabelHtml.includes("&lt;script&gt;alert(1)&lt;/script&gt;")) {
  throw new Error("Virtual label did not escape scanned text");
}
if (virtualLabelHtml.includes("<script>alert(1)</script>")) {
  throw new Error("Virtual label rendered untrusted QR content as markup");
}
if (!virtualLabelHtml.includes('href="/config/devices/device/device-1"')) {
  throw new Error("Matched virtual label does not link to the Home Assistant device page");
}

async function testCameraRequestUsesTheOriginalTap() {
  const originalNavigator = Object.getOwnPropertyDescriptor(global, "navigator");
  const originalSecureContext = global.isSecureContext;
  let rendered = false;
  let fullRenders = 0;
  let cameraRequests = 0;
  const stream = { getTracks: () => [] };
  Object.defineProperty(global, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia() {
          if (rendered) throw new Error("Camera was requested after rendering");
          cameraRequests += 1;
          return Promise.resolve(stream);
        },
      },
    },
  });
  global.isSecureContext = true;
  global.window.jsQR = jsQR;
  const scanner = new global.EntityAuditPanel();
  scanner._render = () => { fullRenders += 1; };
  scanner._renderScannerDialog = () => { rendered = true; };
  const activityMessages = [];
  scanner._hass = {
    callWS(message) {
      activityMessages.push(message);
      return Promise.resolve({ success: true });
    },
  };

  try {
    await scanner._startScanner();
    if (cameraRequests !== 1) throw new Error("Camera was not requested exactly once");
    if (scanner._scannerStream !== stream) throw new Error("Camera stream was not retained");
    if (fullRenders !== 0) throw new Error("Opening the scanner rebuilt the entity inventory");
    if (!activityMessages.some((message) => message.event_type === "qr_camera_requested")) {
      throw new Error("Camera request was not written to the local action log");
    }
    const environmentMessage = activityMessages.find((message) => message.event_type === "qr_camera_environment");
    if (!environmentMessage?.detail?.includes("get_user_media=true")) {
      throw new Error("Camera environment was not written to the local action log");
    }
    if (scanner._cameraWaitSecondsValue() !== 5) {
      throw new Error("Camera wait time does not default to five seconds");
    }
  } finally {
    if (originalNavigator) Object.defineProperty(global, "navigator", originalNavigator);
    else delete global.navigator;
    global.isSecureContext = originalSecureContext;
  }
}

function testCameraWaitTimeout() {
  const originalNavigator = Object.getOwnPropertyDescriptor(global, "navigator");
  const originalSecureContext = global.isSecureContext;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let timeoutCallback;
  let requestedDelay;
  Object.defineProperty(global, "navigator", {
    configurable: true,
    value: {
      mediaDevices: { getUserMedia: () => new Promise(() => {}) },
    },
  });
  global.isSecureContext = true;
  global.setTimeout = (callback, delay) => {
    timeoutCallback = callback;
    requestedDelay = delay;
    return 1;
  };
  global.clearTimeout = () => {};
  const scanner = new global.EntityAuditPanel();
  scanner._renderScannerDialog = () => {};

  try {
    scanner._startScanner();
    if (requestedDelay !== 5000) throw new Error("Camera wait is not five seconds by default");
    timeoutCallback();
    if (!scanner._scannerTimedOut) throw new Error("Camera timeout was not retained");
    if (!scanner._scannerError?.includes("5")) throw new Error("Camera timeout did not explain the wait duration");
  } finally {
    if (originalNavigator) Object.defineProperty(global, "navigator", originalNavigator);
    else delete global.navigator;
    global.isSecureContext = originalSecureContext;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
}

async function testBrotherLabelMedia() {
  // Validate physical PDF page sizes separately from landscape artwork.
  // Portrait rolls must rotate content, and text-with-QR must retain every
  // visible device field. No real printer is contacted by these checks.
  const originalDocument = global.document;
  const brotherPanel = new global.EntityAuditPanel();
  const drawn = [];
  const rotations = [];
  const qrPayloads = [];
  brotherPanel._drawQr = (_context, data) => qrPayloads.push(JSON.parse(data));
  const context = {
    font: "26px Arial",
    save() {}, restore() {}, fillRect() {}, translate() {},
    rotate(angle) { rotations.push(angle); },
    fillText(value) { drawn.push(value); },
    measureText(value) { return { width: Array.from(String(value)).length * Number(this.font.match(/(\d+)px/)?.[1] || 12) * 0.5 }; },
  };
  global.document = {
    createElement() {
      return { getContext: () => context, toDataURL: () => "data:image/jpeg;base64,/9j/2Q==" };
    },
  };
  const device = {
    device_name: "Test device", ip_address: "192.0.2.4", mac_address: "00:11:22:33:44:55",
    manufacturer: "Example", area_name: "Office",
  };
  try {
    const expectedMedia = {
      dk_22205: [62, 40], dk_22210: [29, 40], dk_11209: [62, 29],
      dk_11201: [29, 90], dk_11202: [62, 100],
    };
    for (const [id, [width, length]] of Object.entries(expectedMedia)) {
      brotherPanel._brotherRoll = id;
      const format = brotherPanel._brotherLabelFormat();
      if (format.width !== width || format.length !== length) throw new Error(`Incorrect media: ${id}`);
      const pdf = await brotherPanel._buildBrotherLabelsPdf([device, device], format).text();
      const mediaBoxes = [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
      if (mediaBoxes.length !== 2 || mediaBoxes.some((match) =>
        Math.abs(Number(match[1]) * 25.4 / 72 - width) > 0.001 ||
        Math.abs(Number(match[2]) * 25.4 / 72 - length) > 0.001)) {
        throw new Error(`PDF page does not match the physical roll size: ${id}`);
      }
    }
    if (!rotations.includes(-Math.PI / 2)) throw new Error("Portrait label artwork was not rotated");
    brotherPanel._brotherPrinter = "vc500w";
    for (const [id, width] of Object.entries({ cz_1001: 9, cz_1002: 12, cz_1003: 19, cz_1004: 25, cz_1005: 50 })) {
      brotherPanel._brotherRoll = id;
      const format = brotherPanel._brotherLabelFormat();
      if (format.width !== width || format.dpi !== 313) throw new Error(`Incorrect VC-500W media or resolution: ${id}`);
      const pdf = await brotherPanel._buildBrotherLabelsPdf([device], format).text();
      const box = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
      if (!box || Math.abs(Number(box[1]) * 25.4 / 72 - width) > 0.001) {
        throw new Error(`VC-500W PDF width does not match CZ tape: ${id}`);
      }
    }
    brotherPanel._brotherRoll = "cz_1001";
    brotherPanel._labelVariant = "text_qr";
    let narrowQrRejected = false;
    try { brotherPanel._brotherLabelFormat(); } catch (_error) { narrowQrRejected = true; }
    if (!narrowQrRejected) throw new Error("Narrow tape accepted an unreadable full-payload QR layout");
    brotherPanel._brotherPrinter = "ql820nwb";
    brotherPanel._labelVariant = "text_qr";
    brotherPanel._drawBrotherLabel(context, 732, 472, device);
    for (const expected of ["IP: 192.0.2.4", "MAC: 00:11:22:33:44:55", "Manufacturer: Example", "Area: Office"]) {
      if (!drawn.includes(expected)) throw new Error(`Missing printed label field: ${expected}`);
    }
    if (qrPayloads.length !== 1 || qrPayloads[0].mac_address !== device.mac_address) {
      throw new Error("Brother text-with-QR did not preserve the QR payload");
    }
    drawn.length = 0;
    brotherPanel._labelVariant = "qr";
    brotherPanel._drawBrotherLabel(context, 732, 472, device);
    if (drawn.length || qrPayloads.length !== 2) throw new Error("Brother QR-only variant was not respected");
    brotherPanel._brotherRoll = "dk_22205";
    brotherPanel._brotherLength = 75;
    if (brotherPanel._brotherLabelFormat().length !== 75) throw new Error("Custom cut length was ignored");
    for (const invalid of ["", "invalid", 29, 301, 40.5]) {
      brotherPanel._brotherLength = invalid;
      let rejected = false;
      try { brotherPanel._brotherLabelFormat(); } catch (_error) { rejected = true; }
      if (!rejected) throw new Error(`Invalid continuous label length was accepted: ${invalid}`);
    }
  } finally {
    global.document = originalDocument;
  }
}

async function testDirectBrotherPrint() {
  // Exercise a real packed image byte boundary and verify a lost/unknown
  // result stops the batch. The test does not contact a real Home Assistant.
  const printPanel = new global.EntityAuditPanel();
  const image = { width: 9, height: 2, data: new Uint8ClampedArray(9 * 2 * 4).fill(255) };
  for (const pixel of [0, 8, 10]) {
    image.data[pixel * 4] = 0;
    image.data[pixel * 4 + 1] = 0;
    image.data[pixel * 4 + 2] = 0;
  }
  const packed = Buffer.from(printPanel._packMonochrome(image), "base64");
  if (!packed.equals(Buffer.from([128, 128, 64, 0]))) {
    throw new Error("Direct QL raster packing changed bit order or crossed row boundaries");
  }
  const originalAnimationFrame = global.requestAnimationFrame;
  global.requestAnimationFrame = (callback) => callback();
  const calls = [];
  printPanel._render = () => {};
  printPanel._brotherPrinters = { ql820nwb: true };
  printPanel._brotherDirectImage = () => "packed-label";
  printPanel._hass = { callWS: async (message) => {
    calls.push(message);
    return { state: "unknown", submitted: true, message: "Check the printer." };
  } };
  try {
    await printPanel._printBrotherLabels([
      { device_id: "one", name: "Device one", ip_address: "192.0.2.1" },
      { device_id: "one", name: "Device one sensor", ip_address: "192.0.2.1" },
      { device_id: "two", name: "Device two", ip_address: "192.0.2.2" },
    ]);
    if (calls.length !== 1 || calls[0].type !== "entity_audit/print_label" || printPanel._printingLabels) {
      throw new Error("An uncertain print result was retried or the batch continued");
    }
    if (!/^[a-f0-9]{32}:0$/.test(calls[0].request_id) || !printPanel._printStatus.includes("Check the printer")) {
      throw new Error("Print request identity or failure feedback is missing");
    }
  } finally {
    global.requestAnimationFrame = originalAnimationFrame;
  }
}

testCameraWaitTimeout();
testEditorNavigation();
testZipPackage().then(testInvalidConfigurationResponseFailsCollection).then(testConfigurationBackupContainsValidatedSnapshot).then(testCameraRequestUsesTheOriginalTap).then(testBrotherLabelMedia).then(testDirectBrotherPrint).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
