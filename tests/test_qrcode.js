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

testCameraWaitTimeout();
testCameraRequestUsesTheOriginalTap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
