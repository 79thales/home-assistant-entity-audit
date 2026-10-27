// Ověření volby štítku, potvrzení a QR bez tiskárny či Home Assistantu.
const assert = require("node:assert/strict");
global.window = global;
global.HTMLElement = class {
  attachShadow() { this.shadowRoot = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] }; }
};
global.customElements = { define: (_name, klass) => { global.Panel = klass; }, get: () => undefined };
require("../custom_components/entity_audit/frontend/entity-audit-panel.js");

(async () => {
  const panel = new global.Panel();
  panel._brotherPrinter = "vc500w";
  panel._brotherRoll = "cz_1005";
  panel._brotherLength = 40;
  panel._labelVariant = "text_qr";
  panel._brotherPrinters = { vc500w: true };
  const entity = { entity_id: "sensor.test", name: "Test čidla" };
  const payload = panel._labelQrPayload({ ...entity, _entityLabel: true });
  assert.deepEqual(panel._parseLabelQr(payload), { entity_id: entity.entity_id, name: entity.name });
  assert.throws(() => panel._parseLabelQr('{"name":"X","entity_id":"invalid"}'));
  let sent = [];
  panel._printBrotherLabels = async (rows, isEntity) => sent.push({ rows, isEntity });
  let prompt = "";
  global.confirm = (message) => { prompt = message; return false; };
  global.alert = () => {};
  await panel._printRowLabel(entity, "entity", true);
  assert.equal(sent.length, 0, "Zrušení nesmí odeslat tisk");
  assert.match(prompt, /sensor\.test/);
  assert.match(prompt, /VC-500W/);
  global.confirm = () => true;
  await panel._printRowLabel(entity, "entity", true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].isEntity, true);
  assert.equal(sent[0].rows[0].entity_id, entity.entity_id);
  await panel._printRowLabel(entity, "device");
  assert.equal(sent.length, 1, "Zařízení bez IP se nesmí odeslat");
  const withDevice = { ...entity, device_id: "device", device_name: "Test zařízení", ip_address: "192.0.2.10" };
  await panel._printRowLabel(withDevice, "device", true);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].isEntity, false);
  // Skutečný tok jednotlivé entity předá jeden obrázek a ID požadavku i bez IP.
  const real = new global.Panel();
  real._brotherPrinter = "vc500w";
  real._brotherRoll = "cz_1005";
  real._brotherLength = 40;
  real._labelVariant = "text_qr";
  real._brotherPrinters = { vc500w: true };
  real._render = () => {};
  real._loadQrLibrary = async () => {};
  real._brotherDirectImage = (item) => {
    assert.equal(item.entity_id, "sensor.test");
    assert.equal(item._entityLabel, true);
    return "fixture";
  };
  global.requestAnimationFrame = (callback) => callback();
  let calls = 0;
  real._hass = { callWS: async (message) => {
    calls += 1;
    assert.equal(message.type, "entity_audit/print_label");
    assert.equal(message.model, "vc500w");
    assert.equal(message.roll, "cz_1005");
    return { state: "accepted" };
  } };
  await real._printBrotherLabels([entity], true);
  assert.equal(calls, 1);
  assert.match(real._printStatus, /1 labels accepted/);
  // Na kazetě 50 × 40 mm se údaje rozloží až ke spodnímu okraji a QR
  // zůstává uvnitř tiskové plochy. Geometrie nedokazuje fyzický odstřih.
  const layout = new global.Panel();
  layout._labelVariant = "text_qr";
  const drawn = [];
  let qr;
  layout._drawQr = (_ctx, _payload, x, y, size) => { qr = { x, y, size }; };
  const ctx = {
    font: "",
    fillRect() {},
    fillText(text, x, y) { drawn.push({ text, x, y }); },
    measureText(text) {
      const size = Number(this.font.match(/(\d+)px/)?.[1] || 12);
      return { width: String(text).length * size * 0.55 };
    },
  };
  layout._drawBrotherLabel(ctx, 616, 499, {
    name: "3D printer", device_name: "3D printer",
    ip_address: "192.168.68.79", mac_address: "d4:8a:fc:57:96:10",
    manufacturer: "Shelly", area_name: "66 – Ložnice",
  });
  assert.ok(drawn.at(-1).y > 499 * 0.88);
  assert.ok(qr.size > 616 * 0.40);
  assert.ok(qr.x >= 0 && qr.y >= 0 && qr.x + qr.size <= 616 && qr.y + qr.size <= 499);
  // Dvě položky se vykreslí do oddělených polovin jednoho 50mm JPEG.
  const regions = [];
  const fakeContext = {
    fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
    beginPath() {}, rect(x, y, w, h) { regions.push({ x, y, w, h }); }, clip() {},
  };
  global.document = { createElement: () => ({
    getContext: () => fakeContext,
    toDataURL: () => "data:image/jpeg;base64,fixture",
  }) };
  let drawings = [];
  real._drawBrotherLabel = (_context, w, h, item) => drawings.push({ w, h, item });
  assert.equal(real._brotherPairImage([entity, withDevice], { width: 50, length: 40 }), "fixture");
  assert.equal(drawings.length, 2);
  assert.deepEqual(drawings.map(({ w, h }) => [w, h]), [[499, 305], [499, 305]]);
  assert.deepEqual(regions.map(({ w, h }) => [w, h]), [[305, 499], [305, 499]]);
  // Zrušení společného potvrzení nesmí nic poslat; potvrzení odešle jediný job.
  const secondDevice = { ...withDevice, entity_id: "switch.test" };
  real._entities = [entity, secondDevice];
  real._labelPair = new Map([[entity.entity_id, "entity"], [secondDevice.entity_id, "device"]]);
  real._brotherPairImage = (items) => {
    assert.equal(items.length, 2);
    assert.equal(items[0]._entityLabel, true);
    assert.equal(items[1].device_id, "device");
    return "fixture";
  };
  global.confirm = () => false;
  await real._printBrotherPair([entity, secondDevice]);
  assert.equal(calls, 1);
  global.confirm = () => true;
  await real._printBrotherPair([entity, secondDevice]);
  assert.equal(calls, 2);
  assert.match(real._printStatus, /dvěma štítky/);
  // Panel musí po změně filtrů stále vykreslit sbalené volby i vybraný pár.
  const view = new global.Panel();
  view._entities = [entity, secondDevice];
  view._labelPair = new Map([[entity.entity_id, "entity"], [secondDevice.entity_id, "device"]]);
  view._render();
  assert.match(view.shadowRoot.innerHTML, /Tisk, export a hromadné akce/);
  assert.match(view.shadowRoot.innerHTML, /Dva štítky vedle sebe \(2\/2\)/);
  assert.match(view.shadowRoot.innerHTML, /Do dvojice: entita/);
  // Editor mění pracovní kopii, QR identita i původní entita zůstávají.
  view._refreshLabelPreview = () => {};
  await view._printRowLabel(entity, "entity");
  assert.equal(view._labelEditor.length, 1);
  view._labelEditor[0].title = "Můj popis";
  const draft = view._editedLabelItems()[0];
  assert.equal(draft.name, "Můj popis");
  assert.equal(draft.entity_id, "sensor.test");
  assert.equal(entity.name, "Test čidla");
  assert.match(view.shadowRoot.innerHTML, /Návrh štítku/);
  assert.match(view.shadowRoot.innerHTML, /Uložená šablona/);
  // Vygeneruj QR entity a dekóduj jej skutečnou lokální čtečkou; stejný
  // text pak použije živá kamera i skenování z fotografie.
  const qrcode = require("../custom_components/entity_audit/frontend/qrcode.js");
  const jsQR = require("../custom_components/entity_audit/frontend/jsQR.js");
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  global.qrcode = qrcode;
  const pixels = new Uint8ClampedArray(220 * 220 * 4).fill(255);
  const qrCanvas = {
    fillStyle: "#fff", save() {}, restore() {},
    fillRect(x, y, w, h) {
      const black = this.fillStyle === "#000000";
      for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) {
        const off = (py * 220 + px) * 4;
        pixels[off] = pixels[off + 1] = pixels[off + 2] = black ? 0 : 255;
      }
    },
  };
  view._drawQr(qrCanvas, payload, 0, 0, 220);
  const decoded = jsQR(pixels, 220, 220, { inversionAttempts: "dontInvert" });
  assert.equal(decoded.data, payload);
  view._scannerOpen = true;
  view._renderScannerDialog = () => {};
  view._stopScannerCamera = () => {};
  global.navigator.vibrate = () => {};
  assert.equal(view._acceptScannedQr(decoded.data), true);
  assert.equal(view._scanResult.entity_id, entity.entity_id);
  assert.match(view._scannerDialogContent(), /Otevřít entitu/);
  console.log("Přímý tisk entity a zařízení: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
