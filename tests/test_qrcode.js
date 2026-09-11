const qrcode = require("../custom_components/entity_audit/frontend/qrcode.js");

qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

global.window = global;
global.HTMLElement = class {
  attachShadow() { return {}; }
};
global.customElements = {
  define(_name, klass) { global.EntityAuditPanel = klass; },
  get() { return undefined; },
};
require("../custom_components/entity_audit/frontend/entity-audit-panel.js");

const labelData = {
  name: "Střídač FVE",
  ip_address: "192.168.1.20",
  mac_address: "00:11:22:33:44:55",
  manufacturer: "GoodWe",
  area: "Technická místnost",
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

const code = qrcode(0, "M");
code.addData(payload, "Byte");
code.make();

if (code.getModuleCount() < 21) throw new Error("QR matrix is unexpectedly small");
if (![true, false].includes(code.isDark(0, 0))) throw new Error("QR matrix is invalid");
