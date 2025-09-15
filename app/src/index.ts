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
import { findAssociatedUvc, startUvcPreview } from "./core/uvc";
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
// ----- Reworked unified tools panels matching openiris_setup.py capabilities -----
function initMdnsPanel() {
	const panel = document.getElementById('tool-mdns'); if (!panel) return;
	panel.innerHTML = `
		<div class="row">
			<label class="field">Advertised name (mDNS + UVC): <input type="text" id="mdnsNameInput" placeholder="my-device" /></label>
			<input class="btn btn-primary" type="button" id="mdnsReadBtn" value="Read" />
			<input class="btn btn-secondary" type="button" id="mdnsApplyBtn" value="Apply" />
		</div>
		<div class="row mt-8"><span id="mdnsMsg" class="muted"></span></div>
		<div class="row mt-8 small muted">Applies to both http://&lt;name&gt;.local/ and USB video descriptor (restart device after change).</div>
	`;
	const input = document.getElementById('mdnsNameInput') as HTMLInputElement | null;
	const readBtn = document.getElementById('mdnsReadBtn') as HTMLButtonElement | null;
	const applyBtn = document.getElementById('mdnsApplyBtn') as HTMLButtonElement | null;
	const msg = document.getElementById('mdnsMsg') as HTMLElement | null;
	if (readBtn) readBtn.onclick = async () => {
		msg && (msg.textContent = 'Reading…'); await ensureTransportConnected();
		const name = await sendAndExtract(state.transport!, 'get_mdns_name');
		if (typeof name === 'string' && input) input.value = name;
		msg && (msg.textContent = typeof name === 'string' ? `Current: ${name}` : 'Failed');
	};
	if (applyBtn) applyBtn.onclick = async () => {
		const val = (input?.value || '').trim(); if (!val) { msg && (msg.textContent = 'Enter a name'); return; }
		await ensureTransportConnected();
		const ok = await sendAndExtract(state.transport!, 'set_mdns', { hostname: val });
		msg && (msg.textContent = ok ? 'Saved. Restart device.' : 'Failed to save');
	};
}

function initDeviceModePanel() {
	const panel = document.getElementById('tool-mode'); if (!panel) return;
	panel.innerHTML = `
		<div class="row"><strong>Current:</strong>&nbsp;<span id="devModeCurrent">—</span></div>
		<div class="row mt-12 options-inline">
			<label><input type="radio" name="devModeOpt" value="wifi" /> WiFi</label>
			<label><input type="radio" name="devModeOpt" value="uvc" /> UVC</label>
			<label><input type="radio" name="devModeOpt" value="setup" /> Setup</label>
		</div>
		<div class="row mt-12">
			<input class="btn btn-secondary" type="button" id="devModeApplyBtn" value="Apply" />
		</div>
		<div class="row mt-8"><span id="devModeMsg" class="muted"></span></div>
	`;
	const currentEl = document.getElementById('devModeCurrent');
	const radios = Array.from(panel.querySelectorAll('input[name="devModeOpt"]')) as HTMLInputElement[];
	const applyBtn = document.getElementById('devModeApplyBtn') as HTMLButtonElement | null;
	const msg = document.getElementById('devModeMsg');
	async function refresh() {
		if (!(window as any).isConnected) return; try { currentEl && (currentEl.textContent = '…'); } catch {}
		await ensureTransportConnected(); const mode = await sendAndExtract(state.transport!, 'get_device_mode');
		currentEl && (currentEl.textContent = String(mode));
		radios.forEach(r => { r.checked = (r.value === mode); });
	}
	if (applyBtn) applyBtn.onclick = async () => {
		const checked = radios.find(r => r.checked) || radios[0];
		await ensureTransportConnected();
		const ok = await sendAndExtract(state.transport!, 'switch_mode', { mode: (checked?.value as any) || 'wifi' });
		msg && (msg.textContent = ok ? 'Saved. Restart device.' : 'Failed');
		if (ok) await refresh();
	};
	refresh();
	const devTab = document.querySelector('#toolTabs .subtab[data-target="tool-mode"]');
	devTab?.addEventListener('click', () => { refresh(); });
}

function initLedPanel() {
	const panel = document.getElementById('tool-pwm'); if (!panel) return;
	panel.innerHTML = `
		<div class="row">
			<label class="field">Duty (0-100): <input type="number" id="ledDutyInput" min="0" max="100" value="0" style="width:80px;" /></label>
			<input class="btn btn-primary" type="button" id="ledReadBtn" value="Read" />
			<input class="btn btn-secondary" type="button" id="ledApplyBtn" value="Apply" />
		</div>
		<div class="row mt-8"><span id="ledMsg" class="muted"></span></div>
	`;
	const dutyInput = document.getElementById('ledDutyInput') as HTMLInputElement | null;
	const readBtn = document.getElementById('ledReadBtn') as HTMLButtonElement | null;
	const applyBtn = document.getElementById('ledApplyBtn') as HTMLButtonElement | null;
	const msg = document.getElementById('ledMsg');
	// No explicit start button; we'll auto-start on tab open
	async function readAll() {
		if (!(window as any).isConnected) return; msg && (msg.textContent = 'Reading…');
		await ensureTransportConnected();
		const duty = await sendAndExtract(state.transport!, 'get_led_duty_cycle');
		const cur = await sendAndExtract(state.transport!, 'get_led_current');
		if (typeof duty === 'number' && dutyInput) dutyInput.value = String(duty);
		msg && (msg.textContent = `Duty: ${duty ?? '-'}%  Current: ${cur ?? '-'} mA`);
	}
	readBtn && (readBtn.onclick = readAll);
	applyBtn && (applyBtn.onclick = async () => {
		const val = parseInt(dutyInput?.value || '0', 10);
		msg && (msg.textContent = 'Setting…');
		await ensureTransportConnected();
		await sendAndExtract(state.transport!, 'set_led_duty_cycle', { dutyCycle: val });
		await readAll();
	});
	const tab = document.querySelector('#toolTabs .subtab[data-target="tool-pwm"]');
	tab?.addEventListener('click', async () => {
		await readAll();
	});
}

function initStreamingPanel() {
	const panel = document.getElementById('tool-stream'); if (!panel) return;
	panel.innerHTML = `
		<div class="row">
			<input class="btn btn-primary" type="button" id="startStreamBtn" value="Start streaming" />
		</div>
		<div class="row mt-8"><span id="streamMsg" class="muted"></span></div>
	`;
	const btn = document.getElementById('startStreamBtn') as HTMLButtonElement | null;
	const msg = document.getElementById('streamMsg');
	btn && (btn.onclick = async () => {
		msg && (msg.textContent = 'Starting…'); await ensureTransportConnected();
		const ok = await sendAndExtract(state.transport!, 'start_streaming');
		msg && (msg.textContent = ok ? 'Started. Switch to appropriate mode if needed.' : 'Failed');
	});
}

function initLogsPanel() {
	const panel = document.getElementById('tool-logs'); if (!panel) return;
	panel.innerHTML = `
		<div class="row">
			<input class="btn btn-primary" type="button" id="logsStartBtn" value="Start log monitor" />
			<input class="btn btn-secondary" type="button" id="logsStopBtn" value="Stop" disabled />
		</div>
		<div class="row mt-8"><pre id="logsOutput" class="small" style="max-height:200px; overflow:auto; background:#0a0f18; padding:8px; border:1px solid var(--border); border-radius:8px;"></pre></div>
	`;
	const startBtn = document.getElementById('logsStartBtn') as HTMLButtonElement | null;
	const stopBtn = document.getElementById('logsStopBtn') as HTMLButtonElement | null;
	const out = document.getElementById('logsOutput') as HTMLElement | null;
		let reading = false;
	const dec = new TextDecoder();
	async function loop() {
		if (!state.transport) return; // rely on rawRead if available
		try {
			while (reading) {
				const r = (state.transport as any).rawRead();
				const { value, done } = await r.next(); if (done) break; if (!value) continue;
				const txt = dec.decode(value, { stream: true });
				txt.split(/\r?\n/).forEach(line => {
					if (!line) return; if (line.startsWith('{') && line.endsWith('}') && line.includes('heartbeat')) return;
					if (out) { out.textContent += line + '\n'; out.scrollTop = out.scrollHeight; }
				});
			}
		} catch {}
	}
	startBtn && (startBtn.onclick = async () => { if (reading) return; reading = true; startBtn.disabled = true; stopBtn && (stopBtn.disabled = false); loop(); });
	stopBtn && (stopBtn.onclick = () => { reading = false; startBtn && (startBtn.disabled = false); stopBtn && (stopBtn.disabled = true); });
}

function initSummaryPanel() {
	const panel = document.getElementById('tool-summary'); if (!panel) return;
	panel.innerHTML = `
		<div class="row">
			<strong>Device summary</strong>
		</div>
		<div class="row mt-8"><pre id="summaryOutput" class="small" style="background:#0a0f18; padding:12px; border:1px solid var(--border); border-radius:10px; max-height:260px; overflow:auto;"></pre></div>
	`;
	const out = document.getElementById('summaryOutput') as HTMLElement | null;
	async function refreshSummary() {
		if (!out) return; out.textContent = 'Collecting...\n';
		await ensureTransportConnected();
		const lines: string[] = [];
		try {
			const serialInfo = await sendAndExtract(state.transport!, 'get_serial');
			if (serialInfo?.serial) lines.push(`Serial: ${serialInfo.serial}`);
		} catch {}
		try {
			const name = await sendAndExtract(state.transport!, 'get_mdns_name');
			lines.push(`Name: ${name || '-'}`);
		} catch {}
		try {
			const who = await sendAndExtract(state.transport!, 'get_who_am_i');
			if (who?.who_am_i) lines.push(`Device: ${who.who_am_i}`);
			if (who?.version) lines.push(`Version: ${who.version}`);
		} catch {}
		try {
			const mode = await sendAndExtract(state.transport!, 'get_device_mode');
			lines.push(`Mode: ${mode}`);
		} catch {}
		try {
			const wifi = await sendAndExtract(state.transport!, 'get_wifi_status');
			if (wifi && typeof wifi === 'object') lines.push(`WiFi: ${wifi.status} IP:${wifi.ip_address || '-'}`);
		} catch {}
		try {
			const duty = await sendAndExtract(state.transport!, 'get_led_duty_cycle');
			const cur = await sendAndExtract(state.transport!, 'get_led_current');
			lines.push(`LED Duty: ${duty ?? '-'}%`);
			lines.push(`LED Current: ${cur ?? '-'} mA`);
		} catch {}
		out.textContent = lines.join('\n');
	}
	// Expose to index.html subtabs handler to auto-load when switching
	;(window as any).autoLoadSummary = refreshSummary;
	// Also refresh immediately if Summary tab is already active
	const isActive = (document.querySelector('#toolTabs .subtab.active') as HTMLElement | null)?.dataset.target === 'tool-summary';
	if (isActive) refreshSummary();
}

initMdnsPanel();
initDeviceModePanel();
initLedPanel();
initStreamingPanel();
initLogsPanel();
initSummaryPanel();

// Start/stop UVC preview in the main connect block when connection state changes
document.addEventListener('DOMContentLoaded', () => {
	try {
		const video = document.getElementById('uvcPreviewVideo') as HTMLVideoElement | null;
		const box = document.getElementById('uvcPreviewBox') as HTMLElement | null;
		const info = document.getElementById('uvcPreviewInfo') as HTMLElement | null;
		if (!video || !box) return;
		const startIfConnected = async () => {
			if (!(window as any).isConnected) { box.style.display = 'none'; return; }
			const assoc = await findAssociatedUvc();
			if (!assoc.deviceId) { if (info) info.textContent = 'Keine passende UVC-Kamera gefunden.'; box.style.display = 'none'; return; }
			box.style.display = 'flex'; if (info) info.textContent = `UVC: ${assoc.label || 'camera'}`;
			await startUvcPreview(video, info || undefined);
		};
		// When tabs enabled after connect, try starting preview
		document.addEventListener('ffvr-connected', startIfConnected as any);
		// Fallback: attempt shortly after load and after connect button hides
		setTimeout(startIfConnected, 300);
	} catch {}
});

