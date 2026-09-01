(function () {
	"use strict";

	/* =========================================================================
	 * Settings (localStorage-backed, so it survives across game versions)
	 * ========================================================================= */

	const SETTINGS_KEY = "buttplugSettings";

	const DEFAULT_SETTINGS = {
		enabled: 0,
		intifaceIP: "localhost:12345",
		vibrationIntensity: 0.3,
		vibrationClimax: 1,
		vibrationArousal: 1,
		vibrationArousalIntensity: 0.5,
		vibrationEnabled: {}
	};

	let settings = loadSettings();

	function loadSettings() {
		const merged = Object.assign({}, DEFAULT_SETTINGS);
		try {
			const raw = localStorage.getItem(SETTINGS_KEY);
			if (raw) Object.assign(merged, JSON.parse(raw));
		} catch (e) {
			/* corrupt or unavailable storage; fall back to defaults */
		}
		if (typeof merged.vibrationEnabled !== "object" || merged.vibrationEnabled === null) {
			merged.vibrationEnabled = {};
		}
		return merged;
	}

	function saveSettings() {
		try {
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
		} catch (e) {
			/* storage may be unavailable; ignore */
		}
	}

	function clamp(value, min, max) {
		return Math.min(Math.max(value, min), max);
	}

	/* =========================================================================
	 * Buttplug client state
	 * ========================================================================= */

	let client = null;
	let address = "ws://localhost:12345";
	let intensity = 0;
	let duration = 0;
	let pauseDuration = 0;
	let justEjaculated = false;
	let intifaceConnected = false;
	let toysActive = false;

	function isConnected() {
		intifaceConnected = !!(client && client.connected);
		return intifaceConnected;
	}

	async function ensureConnected() {
		if (!isConnected()) {
			await connectVibrationSocket();
		}
	}

	async function connectVibrationSocket() {
		if (settings.enabled !== 1 || isConnected()) return false;
		if (typeof buttplug === "undefined") {
			console.error("Buttplug library not loaded.");
			return false;
		}

		address = "ws://" + settings.intifaceIP;

		let connector;
		try {
			connector = new buttplug.ButtplugBrowserWebsocketClientConnector(address);
		} catch (error) {
			console.error("Failed to create connector:", error);
			return false;
		}

		client = new buttplug.ButtplugClient("Degrees of Lewdity");

		try {
			await client.connect(connector);
			console.log("Connected to Intiface Central server!");
		} catch (error) {
			console.error("Failed to connect:", error);
			client = null;
			return false;
		}

		client.addListener("deviceadded", (device) => {
			console.log(`Device Connected: ${device.name}`);
			ensureDeviceEntry(device.index);
			renderDeviceSection();
		});

		client.addListener("deviceremoved", (device) => {
			console.log(`Device Removed: ${device.name}`);
			renderDeviceSection();
		});

		vibrationCycle();
		intifaceConnected = true;
		renderConnectionStatus();
		renderDeviceSection();
		return true;
	}

	function ensureDeviceEntry(deviceIndex) {
		if (!settings.vibrationEnabled[deviceIndex]) {
			settings.vibrationEnabled[deviceIndex] = {};
		}
	}

	function isAttributeEnabled(deviceIndex, attributeIndex) {
		const device = settings.vibrationEnabled[deviceIndex];
		if (!device) return true;
		return device[attributeIndex] !== false;
	}

	async function sendVibrationCommand(intensityValue) {
		if (!isConnected()) {
			console.error("Client not connected. Call connectVibrationSocket() first.");
			return;
		}

		for (const device of client.devices) {
			if (device.vibrateAttributes.length > 0) {
				const intensityValues = [];
				for (let i = 0; i < device.vibrateAttributes.length; i++) {
					intensityValues.push(isAttributeEnabled(device.index, i) ? intensityValue : 0.0);
				}
				try {
					await device.vibrate(intensityValues);
				} catch (error) {
					console.error("Error sending vibration command:", error);
				}
			}
		}
	}

	function getDevices() {
		if (!isConnected()) return [];
		return client.devices.map((device) => ({
			name: device.name,
			index: device.index,
			vibrateAttributes: device.vibrateAttributes
		}));
	}

	async function stopDevices() {
		if (!isConnected()) return;
		for (const device of client.devices) {
			try {
				await device.stop();
			} catch (error) {
				console.error(`Error stopping device ${device.name}:`, error);
			}
		}
	}

	async function closeVibrationSocket() {
		if (client) {
			await stopDevices();
			try {
				await client.disconnect();
			} catch (error) {
				/* ignore disconnect errors */
			}
			intifaceConnected = false;
			console.log("Disconnected from Intiface Central server.");
			client = null;
			renderConnectionStatus();
			renderDeviceSection();
		}
	}

	function delayVibration(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function vibrateFor(intensityValue, durationMs) {
		await sendVibrationCommand(intensityValue);
		await delayVibration(durationMs);
		await stopDevices();
	}

	async function testVibration() {
		if (!isConnected()) {
			console.error("Client not connected. Call connectVibrationSocket() first.");
			return;
		}
		console.log("Testing vibration...");
		await vibrateFor(settings.vibrationIntensity * 0.5, 1000);
	}

	async function setVibrationParams() {
		ensureConnected();

		if (typeof V === "undefined") return;

		const inCombat = V.combat === 1;
		const masturbating = V.masturbating === 1;
		const arousalActive = V.arousal > 0 && settings.vibrationArousal === 1;

		if (inCombat || masturbating || justEjaculated || arousalActive) {
			let deviceIntensity, deviceRun, deviceWait;

			if (V.orgasmdown > 0 && (settings.vibrationClimax === 1 || !inCombat)) {
				deviceIntensity = 1;
				deviceRun = 300;
				deviceWait = 200;
			} else {
				let arousal = V.arousal;
				let arousalmax = V.arousalmax;
				if (inCombat || (justEjaculated && !["tentacles", "slime"].includes(V.enemytype))) {
					arousal = V.enemyarousal;
					arousalmax = V.enemyarousalmax;
				}

				deviceIntensity = clamp((arousal / arousalmax) || 0, 0.0, 1.0);
				deviceRun = clamp(Math.round(deviceIntensity * 1000), 50, 10000);
				deviceWait = clamp(Math.round(1500 - 1500 * (deviceIntensity - 0.134)), 200, 1500);
			}

			justEjaculated = false;
			toysActive = true;

			let mPenetration = false;
			let vPenetration = false;
			let aPenetration = false;
			try {
				mPenetration = typeof combat.isMouthPenetrated === "function" && combat.isMouthPenetrated();
				vPenetration = typeof combat.isVaginaPenetrated === "function" && combat.isVaginaPenetrated();
				aPenetration = typeof combat.isAnusPenetrated === "function" && combat.isAnusPenetrated();
			} catch (e) {
				/* combat helpers may change between versions */
			}

			let intensMult = 0.8;
			let waitMult = 1.0;
			let runMult = 1.0;

			if (mPenetration) {
				intensMult += 0.05;
				runMult += 0.1;
				waitMult -= 0.2;
			}
			if (vPenetration && aPenetration) {
				intensMult = 1.0;
				runMult += 0.3;
				waitMult -= 0.7;
			} else if (vPenetration || aPenetration) {
				intensMult += 0.1;
				runMult += 0.2;
				waitMult -= 0.5;
			}

			intensity = clamp(deviceIntensity * intensMult, 0.0, 1.0);
			duration = deviceRun * runMult;
			pauseDuration = clamp(deviceWait * waitMult, 200, 10000);
		} else if (toysActive) {
			toysActive = false;
			stopVibration();
		}
	}

	async function stopVibration() {
		intensity = 0;
		duration = 0;
		pauseDuration = 0;
		await stopDevices();
	}

	async function vibrationCycle() {
		console.log("Starting vibration cycle...");

		while (settings.enabled === 1) {
			if (!isConnected()) {
				console.error("Client not connected.");
				return;
			}

			if (intensity <= 0 || duration <= 0) {
				await delayVibration(1000);
				continue;
			}

			await vibrateFor(intensity * settings.vibrationIntensity, duration);

			if (pauseDuration > 0) {
				await delayVibration(pauseDuration);
			}
		}
		console.log("Vibration cycle stopped.");
		await closeVibrationSocket();
	}

	/* =========================================================================
	 * SugarCube integration hooks
	 * ========================================================================= */

	function addMacroCallback(name, callback) {
		try {
			const macro = SugarCube.Macro.get(name);
			if (!macro) return;
			(function (handler) {
				macro.handler = function (...args) {
					callback(this);
					return handler.apply(this, args);
				};
			})(macro.handler);
		} catch (e) {
			/* macro may not exist in future versions */
		}
	}

	function initHooks() {
		if (typeof $ === "undefined" || typeof SugarCube === "undefined" || typeof SugarCube.Macro === "undefined") {
			setTimeout(initHooks, 25);
			return;
		}

		$(document).on(":storyready", function () {
			addMacroCallback("set", function (that) {
				if (that.args && that.args.raw === "$ejaculating to 1") {
					justEjaculated = true;
				}
			});
		});

		$(document).on(":passageend", function () {
			if (settings.enabled === 1) {
				setVibrationParams();
			}
		});
	}

	/* =========================================================================
	 * Standalone settings panel
	 * ========================================================================= */

	let panel = null;
	let panelButton = null;

	function btnStyle(extra) {
		return "padding:6px 10px;font-size:12px;line-height:1.2;cursor:pointer;" +
			"background:#3a3a3a;color:#eee;border:1px solid #666;border-radius:4px;" +
			(extra || "");
	}

	function setPanelOpen(open) {
		panel.style.display = open ? "block" : "none";
		panelButton.textContent = open ? "Close" : "Buttplug";
		if (open) renderAll();
	}

	function buildPanel() {
		if (panel) return;

		panelButton = document.createElement("button");
		panelButton.type = "button";
		panelButton.textContent = "Buttplug";
		panelButton.style.cssText =
			"position:fixed;right:12px;bottom:12px;z-index:2147483000;" + btnStyle();
		panelButton.addEventListener("click", () => {
			setPanelOpen(panel.style.display === "none");
		});

		panel = document.createElement("div");
		panel.style.cssText =
			"position:fixed;right:12px;bottom:44px;z-index:2147483000;width:280px;max-height:70vh;" +
			"overflow-y:auto;background:#1e1e1e;color:#ddd;border:1px solid #555;border-radius:6px;" +
			"padding:12px;font-size:13px;display:none;box-sizing:border-box;";

		const header = el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;" });
		const title = el("div", { style: "font-weight:bold;color:#fff;" }, "Buttplug.io Integration");
		const close = el("button", { type: "button", style: btnStyle("padding:2px 7px;") }, "X");
		close.addEventListener("click", () => setPanelOpen(false));
		header.appendChild(title);
		header.appendChild(close);

		panel.appendChild(header);
		panel.appendChild(el("div", { id: "bp-status" }));
		panel.appendChild(el("div", { id: "bp-connect", style: "margin:6px 0;" }));
		panel.appendChild(el("div", { id: "bp-settings", style: "margin:6px 0;" }));
		panel.appendChild(el("div", { id: "bp-devices", style: "margin:6px 0;" }));
		panel.appendChild(el("div", { id: "bp-test", style: "margin:6px 0;" }));

		document.body.appendChild(panelButton);
		document.body.appendChild(panel);

		renderAll();
	}

	function renderAll() {
		renderConnectionStatus();
		renderConnectButtons();
		renderSettings();
		renderDeviceSection();
		renderTestButton();
	}

	function el(tag, attrs, text) {
		const node = document.createElement(tag);
		if (attrs) {
			for (const key in attrs) {
				if (key === "style") node.style.cssText = attrs[key];
				else if (key === "type") node.type = attrs[key];
				else if (key === "checked") node.checked = attrs[key];
				else node.setAttribute(key, attrs[key]);
			}
		}
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function renderConnectionStatus() {
		const container = panel && panel.querySelector("#bp-status");
		if (!container) return;
		container.innerHTML = "";
		const connected = isConnected();
		container.appendChild(
			el("div", { style: "color:" + (connected ? "#7bd88f" : "#e06c75") + ";" },
				connected ? "Connected to Intiface Central." : "Not connected to Intiface Central.")
		);
	}

	function renderConnectButtons() {
		const container = panel && panel.querySelector("#bp-connect");
		if (!container) return;
		container.innerHTML = "";

		const connect = el("button", { type: "button", style: btnStyle("margin-right:6px;") }, "Connect");
		connect.addEventListener("click", () => connectVibrationSocket());
		container.appendChild(connect);

		const disconnect = el("button", { type: "button", style: btnStyle() }, "Disconnect");
		disconnect.addEventListener("click", () => closeVibrationSocket());
		container.appendChild(disconnect);
	}

	function renderSettings() {
		const container = panel && panel.querySelector("#bp-settings");
		if (!container) return;
		container.innerHTML = "";

		/* Enable toggle */
		const enableLabel = el("label", { style: "display:block;margin-bottom:8px;" });
		const enableCheck = el("input", { type: "checkbox", checked: settings.enabled === 1 });
		enableCheck.addEventListener("change", () => {
			settings.enabled = enableCheck.checked ? 1 : 0;
			saveSettings();
			if (settings.enabled === 1) {
				connectVibrationSocket();
			} else {
				closeVibrationSocket();
			}
		});
		enableLabel.appendChild(enableCheck);
		enableLabel.appendChild(document.createTextNode(" Enable toy control"));
		container.appendChild(enableLabel);

		/* IP address */
		const ipLabel = el("label", { style: "display:block;margin-bottom:8px;" });
		ipLabel.appendChild(document.createTextNode("Websocket address: "));
		const ipInput = el("input", { type: "text", value: settings.intifaceIP, style: "width:100%;box-sizing:border-box;background:#111;color:#ddd;border:1px solid #444;border-radius:3px;padding:2px 4px;" });
		ipInput.addEventListener("change", () => {
			settings.intifaceIP = ipInput.value || "localhost:12345";
			saveSettings();
		});
		ipLabel.appendChild(ipInput);
		container.appendChild(ipLabel);

		/* Climax toggle */
		container.appendChild(toggleSetting("Special pattern on orgasm in combat", "vibrationClimax"));

		/* Arousal toggle */
		container.appendChild(toggleSetting("Arousal-based vibration outside combat", "vibrationArousal"));

		/* Max intensity slider */
		container.appendChild(sliderSetting("Max vibration intensity", "vibrationIntensity", 0, 1, 0.05));

		/* Arousal multiplier slider */
		container.appendChild(sliderSetting("Arousal intensity multiplier", "vibrationArousalIntensity", 0, 1, 0.05));
	}

	function toggleSetting(label, key) {
		const wrap = el("label", { style: "display:block;margin-bottom:6px;" });
		const box = el("input", { type: "checkbox", checked: settings[key] === 1 });
		box.addEventListener("change", () => {
			settings[key] = box.checked ? 1 : 0;
			saveSettings();
		});
		wrap.appendChild(box);
		wrap.appendChild(document.createTextNode(" " + label));
		return wrap;
	}

	function sliderSetting(label, key, min, max, step) {
		const wrap = el("div", { style: "margin-bottom:8px;" });
		wrap.appendChild(el("div", null, label + ": " + settings[key]));

		const slider = el("input", {
			type: "range",
			min: String(min),
			max: String(max),
			step: String(step),
			value: String(settings[key]),
			style: "width:100%;"
		});
		slider.addEventListener("input", () => {
			settings[key] = parseFloat(slider.value);
			slider.parentNode.querySelector("div").textContent = label + ": " + settings[key];
			saveSettings();
		});
		wrap.appendChild(slider);
		return wrap;
	}

	function renderTestButton() {
		const container = panel && panel.querySelector("#bp-test");
		if (!container) return;
		container.innerHTML = "";
		const test = el("button", { type: "button", style: btnStyle() }, "Test Vibration");
		test.addEventListener("click", () => testVibration());
		container.appendChild(test);
	}

	function renderDeviceSection() {
		const container = panel && panel.querySelector("#bp-devices");
		if (!container) return;
		container.innerHTML = "";

		const devices = getDevices();
		if (devices.length === 0) {
			container.appendChild(el("div", { style: "color:#e06c75;" }, "No devices connected."));
			return;
		}

		for (const device of devices) {
			ensureDeviceEntry(device.index);
			container.appendChild(el("div", { style: "color:#f0c674;margin-top:4px;" }, device.name));

			device.vibrateAttributes.forEach((attribute) => {
				const attrIndex = attribute.Index;
				const label = el("label", { style: "display:block;margin-left:8px;" });
				const box = el("input", { type: "checkbox", checked: isAttributeEnabled(device.index, attrIndex) });
				box.addEventListener("change", () => {
					ensureDeviceEntry(device.index);
					settings.vibrationEnabled[device.index][attrIndex] = box.checked;
					saveSettings();
				});
				label.appendChild(box);
				label.appendChild(document.createTextNode(" " + attribute.ActuatorType + " " + attrIndex));
				container.appendChild(label);
			});
		}
	}

	function initPanel() {
		if (!document.body) {
			setTimeout(initPanel, 25);
			return;
		}
		buildPanel();
	}

	/* =========================================================================
	 * Public API + boot
	 * ========================================================================= */

	window.buttplugMod = {
		isConnected,
		ensureConnected,
		connectVibrationSocket,
		sendVibrationCommand,
		stopDevices,
		closeVibrationSocket,
		getDevices,
		testVibration,
		setVibrationParams,
		stopVibration,
		getSettings: () => settings,
		saveSettings
	};

	initHooks();
	initPanel();
})();
