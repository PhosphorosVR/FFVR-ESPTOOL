/* App orchestrator: wires UI controls to modules in core/, ui/, and features/ */

import { state } from "./core/state";
import { initDebugPanel } from "./ui/debug";
import { updateConnStatusDot, showConnectAlert } from "./ui/alerts";
import { el, setTabsEnabled } from "./ui/dom";
import { initTerminal, getTerminal, startConsole, stopConsole } from "./ui/terminal";
import { loadPrebuiltManifest, wireLegacyToggle } from "./features/firmwareManifest";
import { wireConnection } from "./features/connection";
import { wireWifiButtons } from "./features/wifi";
import { ensureTransportConnected } from "./core/serial";
import { sendAndExtract } from "./core/jsonClient";
import { addRow, performFlash } from "./features/flashing";

// Initialize debug panel visibility and prior flash success banner
initDebugPanel();
try {
	if (sessionStorage.getItem('flashReload')) {
		sessionStorage.removeItem('flashReload');
		const alertEl = el.connectAlert();
		if (alertEl) {
			alertEl.classList.add('success');
			alertEl.style.marginBottom = '24px';
		}
		showConnectAlert('Flashing successful');
	}
} catch {}

// Initial UI state
try {
	el.disconnectButton() && (el.disconnectButton()!.style.display = 'none');
	el.traceButton() && (el.traceButton()!.style.display = 'none');
	el.eraseButton() && (el.eraseButton()!.style.display = 'none');
	el.consoleStopButton() && (el.consoleStopButton()!.style.display = 'none');
	el.resetButton() && (el.resetButton()!.style.display = 'none');
	el.filesDiv() && (el.filesDiv()!.style.display = 'none');
} catch {}

// Demo mode wiring (optional)
const demoModeEl = el.demoMode();
function enterDemoMode() {
	state.isConnected = true; (window as any).isConnected = true; updateConnStatusDot(true);
	try {
		if (el.lblConnTo()) { el.lblConnTo()!.innerHTML = 'Connected: Demo device · 921600 baud'; el.lblConnTo()!.style.display = 'block'; }
		if (el.lblBaudrate()) el.lblBaudrate()!.style.display = 'none';
		if (el.baudrates()) (el.baudrates() as any).style.display = 'none';
		if (el.connectButton()) el.connectButton()!.style.display = 'none';
		if (el.disconnectButton()) el.disconnectButton()!.style.display = 'initial';
		if (el.traceButton()) el.traceButton()!.style.display = 'initial';
		if (el.eraseButton()) el.eraseButton()!.style.display = 'initial';
		if (el.filesDiv()) el.filesDiv()!.style.display = 'initial';
	} catch {}
	setTabsEnabled(true);
	const tabProgram = document.querySelector('#tabs .tab[data-target="program"]') as HTMLElement | null;
	if (tabProgram) tabProgram.click();
}
function exitDemoMode() {
	state.isConnected = false; (window as any).isConnected = false; updateConnStatusDot(false);
	try {
		if (el.lblBaudrate()) el.lblBaudrate()!.style.display = 'initial';
		if (el.baudrates()) (el.baudrates() as any).style.display = 'initial';
		if (el.connectButton()) el.connectButton()!.style.display = 'initial';
		if (el.disconnectButton()) el.disconnectButton()!.style.display = 'none';
		if (el.traceButton()) el.traceButton()!.style.display = 'none';
		if (el.eraseButton()) el.eraseButton()!.style.display = 'none';
		if (el.lblConnTo()) el.lblConnTo()!.style.display = 'none';
		if (el.filesDiv()) el.filesDiv()!.style.display = 'none';
		if (el.alertDiv()) el.alertDiv()!.style.display = 'none';
	} catch {}
	setTabsEnabled(false);
	['program','console','tools'].forEach(id => {
		const sec = document.getElementById(id);
		if (sec) (sec as HTMLElement).style.display = 'none';
	});
}
if (demoModeEl) {
	demoModeEl.addEventListener('change', () => { if (demoModeEl.checked) enterDemoMode(); else exitDemoMode(); });
	if (demoModeEl.checked) enterDemoMode();
}

// Terminal and feature wiring
initTerminal();
wireConnection(getTerminal());
wireWifiButtons();
loadPrebuiltManifest();
wireLegacyToggle();

// Console buttons
const consoleStartButton = el.consoleStartButton();
const consoleStopButton = el.consoleStopButton();
if (consoleStartButton) consoleStartButton.onclick = async () => { await startConsole(); };
if (consoleStopButton) consoleStopButton.onclick = () => { stopConsole(); };

// Program button
const programButton = el.programButton();
if (programButton) (programButton as any).onclick = async () => {
	const table = el.table();
	if (!table) return;
	await performFlash(table, el.prebuiltSelect(), el.alertDiv(), getTerminal());
};

// Add file row
const addFileButton = el.addFileButton();
if (addFileButton) (addFileButton as any).onclick = () => { const t = el.table(); if (t) addRow(t); };

// Lightweight wiring for mDNS and Device Mode panels
function initMdnsPanel() {
	const panel = document.getElementById('tool-mdns');
	if (!panel) return;
	panel.innerHTML = `
		<div class="row">
			<label class="field">Device name (mDNS/UVC): <input type="text" id="mdnsNameInput" placeholder="my-device" /></label>
			<input class="btn btn-primary" type="button" id="mdnsReadBtn" value="Read" />
			<input class="btn btn-secondary" type="button" id="mdnsApplyBtn" value="Apply" />
		</div>
		<div class="row mt-8"><span id="mdnsMsg" class="muted"></span></div>
	`;
	const input = document.getElementById('mdnsNameInput') as HTMLInputElement | null;
	const readBtn = document.getElementById('mdnsReadBtn') as HTMLButtonElement | null;
	const applyBtn = document.getElementById('mdnsApplyBtn') as HTMLButtonElement | null;
	const msg = document.getElementById('mdnsMsg') as HTMLElement | null;
	if (readBtn) readBtn.onclick = async () => {
		try { msg && (msg.textContent = 'Reading…'); } catch {}
		await ensureTransportConnected();
		const name = await sendAndExtract(state.transport!, 'get_mdns_name');
		if (typeof name === 'string' && input) input.value = name;
		msg && (msg.textContent = typeof name === 'string' ? `Current: ${name}` : 'Unable to read');
	};
	if (applyBtn) applyBtn.onclick = async () => {
		const name = (input?.value || '').trim();
		if (!name) { msg && (msg.textContent = 'Enter a name first'); return; }
		await ensureTransportConnected();
		const ok = await sendAndExtract(state.transport!, 'set_mdns', { hostname: name });
		msg && (msg.textContent = ok ? 'Saved. Restart device to apply everywhere.' : 'Failed to save');
	};
}

function initDeviceModePanel() {
	const panel = document.getElementById('tool-mode');
	if (!panel) return;
	panel.innerHTML = `
		<div class="row">
			<strong>Current:</strong>&nbsp;<span id="devModeCurrent">—</span>
		</div>
			<div class="row mt-16">
			<label><input type="radio" name="devModeOpt" value="wifi" id="devModeWifi" /> WiFi</label>
		</div>
		<div class="row mt-4">
			<label><input type="radio" name="devModeOpt" value="uvc" id="devModeUvc" /> UVC</label>
		</div>
		<div class="row mt-4">
			<label><input type="radio" name="devModeOpt" value="auto" id="devModeAuto" /> Auto</label>
		</div>
		<div class="row mt-12">
			<input class="btn btn-secondary" type="button" id="devModeApplyBtn" value="Apply" />
		</div>
		<div class="row mt-8"><span id="devModeMsg" class="muted"></span></div>
	`;
	const currentEl = document.getElementById('devModeCurrent') as HTMLElement | null;
	const radios = Array.from(panel.querySelectorAll('input[name="devModeOpt"]')) as HTMLInputElement[];
	const applyBtn = document.getElementById('devModeApplyBtn') as HTMLButtonElement | null;
	const msg = document.getElementById('devModeMsg') as HTMLElement | null;
	async function refreshCurrent() {
		try {
			if (!(window as any).isConnected) return;
			msg && (msg.textContent = '');
			currentEl && (currentEl.textContent = '…');
			await ensureTransportConnected();
			const mode = await sendAndExtract(state.transport!, 'get_device_mode');
			currentEl && (currentEl.textContent = String(mode));
			const valid = mode === 'wifi' || mode === 'uvc' || mode === 'auto';
			if (valid) {
				const r = radios.find(x => x.value === mode);
				if (r) r.checked = true;
			}
		} catch {
			currentEl && (currentEl.textContent = 'unknown');
		}
	}
	if (applyBtn) applyBtn.onclick = async () => {
		const checked = radios.find(r => r.checked);
		const mode = ((checked?.value) || 'wifi') as 'wifi' | 'uvc' | 'auto';
		await ensureTransportConnected();
		const ok = await sendAndExtract(state.transport!, 'switch_mode', { mode });
		msg && (msg.textContent = ok ? 'Mode saved. Please restart device.' : 'Failed to save');
		if (ok) { currentEl && (currentEl.textContent = mode); }
	};
	// Auto-read on init
	refreshCurrent();
		// Refresh whenever the Device Mode tab is clicked
		const devTab = document.querySelector('#toolTabs .subtab[data-target="tool-mode"]') as HTMLElement | null;
		if (devTab) devTab.addEventListener('click', () => { refreshCurrent(); });
}

initMdnsPanel();
initDeviceModePanel();

