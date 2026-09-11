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
    this._labelWidth = 60;
    this._labelHeight = 38;
    this._labelVariant = "text";
    this._filtersOpen = false;
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

  _exportCsv(rows) {
    const headers = ["name", "entity_id", "domain", "device", "manufacturer", "model", "area", "ip_address", "mac_address", "integration", "state", "problem", "audited", "last_changed"];
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
        entity.ip_address,
        entity.mac_address,
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
    this._recordActivity("csv_exported", "info", String(rows.length));
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
    return {
      name: readField("name", true),
      ip_address: readField("ip_address", true),
      mac_address: readField("mac_address"),
      manufacturer: readField("manufacturer"),
      area: readField("area"),
    };
  }

  _matchScannedDevice(label) {
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
          <dl class="label-detail">
            <dt>${"IP address"}</dt><dd>${this._escape(this._scanResult.ip_address || "—")}</dd>
            <dt>${"MAC address"}</dt><dd>${this._escape(this._scanResult.mac_address || "—")}</dd>
            <dt>${"Manufacturer"}</dt><dd>${this._escape(this._scanResult.manufacturer || "—")}</dd>
            <dt>${"Area"}</dt><dd>${this._escape(this._scanResult.area || "—")}</dd>
          </dl>
        </section>
        <div class="${this._scanMatchedDevice ? "match-ok" : "match-missing"}">${this._scanMatchedDevice
          ? "The device was found in the current inventory."
          : "The device could not be uniquely matched in the current inventory."}</div>
        <div class="scanner-actions">
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
    context.font = `700 ${titleSize}px Arial, sans-serif`;
    const titleLines = this._wrapCanvasText(context, entity.device_name || entity.name, textWidth, 2);
    let cursor = y + padding + titleSize;
    for (const line of titleLines) {
      context.fillText(line, x + padding, cursor);
      cursor += Math.round(titleSize * 1.16);
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
        y + ((height - combinedQrSize) / 2),
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

  _assemblePdf(pageImages, imageWidth, imageHeight) {
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
      const content = `q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n`;
      appendObject(pageObject, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
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
        title: "Device labels",
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
        ${this._labelPdf ? `<section class="pdf-ready"><span>${"The label PDF is ready."}</span><a id="download-label-pdf" href="${this._escape(this._labelPdf.url)}" download="${this._escape(this._labelPdf.filename)}">${"Open or save PDF"}</a>${navigator.canShare && navigator.share ? `<button id="share-label-pdf">${"Share PDF"}</button>` : ""}<button id="discard-label-pdf">✕</button></section>` : ""}
        <section class="filter-panel ${this._filtersOpen ? "open" : ""}">
          <div class="toolbar">
            <button id="bulk-enable">${"Audit displayed"}</button>
            <button id="bulk-disable">${"Disable audit"}</button>
            <button id="export">${"Export CSV"}</button>
            <button id="download-labels" ${this._buildingLabels ? "disabled" : ""}>${this._buildingLabels ? "Creating PDF…" : "Create labels (PDF)"}</button>
          </div>
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
        <div class="table-wrap">
          <table>
            <thead><tr><th>${"Entity"}</th><th>${"State"}</th><th>${"Device"}</th><th>${"Integration"}</th><th>${"Audit"}</th><th>${"History"}</th></tr></thead>
            <tbody>${groups.map((group) => `${this._groupBy !== "none" ? `
              <tr class="group-row"><td colspan="6">${this._escape(group.label)}<span class="group-summary">${group.rows.length} ${"entities"} · ${group.rows.filter((entity) => entity.problem).length} ${"problems"} · ${group.rows.filter((entity) => entity.logging).length} ${"audited"}</span></td></tr>` : ""}
              ${group.rows.map((entity) => {
                const index = rowIndexes.get(entity.entity_id);
                return `<tr>
                  <td><div class="name">${this._escape(entity.name)}</div><div class="entity-id">${this._escape(entity.entity_id)}${entity.disabled ? ` · ${"disabled"}` : ""}</div></td>
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
      ${this._selected ? `<dialog open>
        <div class="dialog-head"><div><h2>${this._escape(this._selected.name)}</h2><div class="entity-id">${this._escape(this._selected.entity_id)}</div></div><button id="clear">${"Clear history"}</button><button id="close">✕</button></div>
        <div class="dialog-body">
          ${this._history.map((event) => `<div class="history"><span>${this._escape(new Date(event.timestamp).toLocaleString())}</span><span class="event-${this._escape(event.type)}">${this._escape(event.type)}</span><span>${this._escape(event.old_state ?? "—")} → ${this._escape(event.new_state ?? "—")}</span></div>`).join("") || `<div class="empty">${"No records yet"}</div>`}
        </div>
      </dialog>` : ""}
      </ha-top-app-bar-fixed>
    `;

    this.shadowRoot.querySelector("#open-scanner")?.addEventListener("click", () => this._startScanner());
    this.shadowRoot.querySelector("#refresh")?.addEventListener("click", () => { this._recordActivity("inventory_refreshed"); this._load(); });
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
    this.shadowRoot.querySelector("#download-labels")?.addEventListener("click", () => this._downloadLabelsPdf(rows));
    this.shadowRoot.querySelector("#share-label-pdf")?.addEventListener("click", () => this._shareLabelPdf());
    this.shadowRoot.querySelector("#discard-label-pdf")?.addEventListener("click", () => { this._revokeLabelPdf(); this._render(); });
    this.shadowRoot.querySelectorAll(".toggle").forEach((input) => input.addEventListener("change", () => this._toggle(rows[Number(input.dataset.index)], input.checked)));
    this.shadowRoot.querySelectorAll(".history-button").forEach((button) => button.addEventListener("click", () => this._open(rows[Number(button.dataset.index)])));
    this.shadowRoot.querySelectorAll(".state-button").forEach((button) => button.addEventListener("click", () => this._showEntity(rows[Number(button.dataset.index)].entity_id)));
    this.shadowRoot.querySelector("#close")?.addEventListener("click", () => { this._selected = null; this._render(); });
    this.shadowRoot.querySelector("#clear")?.addEventListener("click", () => this._clear());
    if (this._scannerOpen && typeof document !== "undefined") this._renderScannerDialog();
  }
}

if (!customElements.get("entity-audit-panel-v0317")) {
  customElements.define("entity-audit-panel-v0317", EntityAuditPanel);
}
