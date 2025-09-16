/* eslint-disable no-inner-declarations */
/* App orchestrator: wires UI controls to modules in core/, ui/, and features/ */

import { state } from "./core/state";
import { initDebugPanel } from "./ui/debug";
import { updateConnStatusDot, showConnectAlert } from "./ui/alerts";
import { el, setTabsEnabled } from "./ui/dom";
import { initTerminal, getTerminal, startConsole, stopConsole } from "./ui/terminal";
import { loadPrebuiltManifest, wireLegacyToggle } from "./features/firmwareManifest";
import { wireConnection } from "./features/connection";
import { wireWifiButtons } from "./features/wifi";
import { ensureTransportConnected, handlePortDisconnected } from "./core/serial";
import { sendAndExtract } from "./core/jsonClient";
import { findAssociatedUvc, startUvcPreview } from "./core/uvc";
import { addRow, performFlash } from "./features/flashing";
import { showPanelBusy, hidePanelBusy } from "./ui/utils";

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

// Advanced: toggle visibility of additional tools (WiFi, Name, LED)
function updateModeSegVisibility() {
	try {
		const seg = document.querySelector('#tool-mode #devModeSeg') as HTMLElement | null;
		if (!seg) return;
		const chk = document.getElementById('additionalTools') as HTMLInputElement | null;
		const showWifi = !chk || !!chk.checked;
		const wifiBtn = seg.querySelector('.seg[data-value="wifi"]') as HTMLElement | null;
		if (wifiBtn) wifiBtn.style.display = showWifi ? '' : 'none';
		// If active selection is now hidden, switch to a safe visible option
		const active = seg.querySelector('.seg.active') as HTMLButtonElement | null;
		if (!showWifi && active && active.dataset.value === 'wifi') {
			const repl = (seg.querySelector('.seg[data-value="uvc"]') as HTMLButtonElement | null)
					  || (seg.querySelector('.seg[data-value="setup"]') as HTMLButtonElement | null);
			const buttons = Array.from(seg.querySelectorAll('.seg') as NodeListOf<HTMLButtonElement>);
			buttons.forEach(b => b.classList.toggle('active', b === repl));
		}
	} catch {}
}

function ensureVisibleToolSubtabActive() {
	try {
		const subtabs = Array.from(document.querySelectorAll('#toolTabs .subtab')) as HTMLElement[];
		if (!subtabs.length) return;
		const isVisible = (el: HTMLElement) => el.style.display !== 'none';
		let active = subtabs.find(t => t.classList.contains('active')) || null;
		if (!active || !isVisible(active)) {
			const pref = ['tool-mode','tool-summary'];
			let target: HTMLElement | null = null;
			for (const id of pref) {
				const t = document.querySelector(`#toolTabs .subtab[data-target="${id}"]`) as HTMLElement | null;
				if (t && isVisible(t)) { target = t; break; }
			}
			if (!target) target = subtabs.find(isVisible) || null;
			target?.click();
		}
	} catch {}
}

function applyAdditionalToolsVisibility() {
	const chk = document.getElementById('additionalTools') as HTMLInputElement | null;
	const show = !chk || !!chk.checked;
	const ids = ['tool-wifi','tool-mdns','tool-pwm'];
	// Subtab elements
	ids.forEach(id => {
		const li = document.querySelector(`#toolTabs .subtab[data-target="${id}"]`) as HTMLElement | null;
		if (li) li.style.display = show ? '' : 'none';
		const panel = document.getElementById(id) as HTMLElement | null;
		if (panel) panel.style.display = show ? panel.style.display : 'none';
	});
	// Also update availability of WiFi option in Mode segmented control
	updateModeSegVisibility();
	// If current active subtab is hidden, switch to a safe one
	const active = document.querySelector('#toolTabs .subtab.active') as HTMLElement | null;
	if (active && ids.includes(active.getAttribute('data-target') || '')) {
		const fallback = (document.querySelector('#toolTabs .subtab[data-target="tool-mode"]') as HTMLElement | null)
					  || (document.querySelector('#toolTabs .subtab[data-target="tool-summary"]') as HTMLElement | null);
		fallback?.click();
	}
	// Ensure there is an active visible subtab
	ensureVisibleToolSubtabActive();
}

try {
	const addToggle = document.getElementById('additionalTools') as HTMLInputElement | null;
	if (addToggle) {
		// Restore persisted preference
		try {
			const pref = localStorage.getItem('additionalTools');
			if (pref === '0') addToggle.checked = false;
			else if (pref === '1') addToggle.checked = true;
		} catch {}
		addToggle.addEventListener('change', () => {
			if (addToggle.checked) {
				// If enabling, require explicit confirmation once
				const ov = document.getElementById('additionalToolsOverlay') as HTMLElement | null;
				const ok = document.getElementById('additionalToolsConfirm') as HTMLButtonElement | null;
				const cancel = document.getElementById('additionalToolsCancel') as HTMLButtonElement | null;
				const showOverlay = () => { if (ov) ov.style.display = 'flex'; };
				const hideOverlay = () => { if (ov) ov.style.display = 'none'; };
				const onCancel = () => { if (cancel) cancel.disabled = true; try { hideOverlay(); } finally { addToggle.checked = false; localStorage.setItem('additionalTools','0'); cancel && (cancel.disabled = false); applyAdditionalToolsVisibility(); } };
				const onConfirm = () => { if (ok) ok.disabled = true; try { hideOverlay(); } finally { localStorage.setItem('additionalTools','1'); applyAdditionalToolsVisibility(); ok && (ok.disabled = false); } };
				if (ov && ok && cancel) {
					showOverlay();
					cancel.addEventListener('click', onCancel, { once: true });
					ok.addEventListener('click', onConfirm, { once: true });
				} else {
					// Fallback: no overlay found -> revert
					addToggle.checked = false; localStorage.setItem('additionalTools','0'); applyAdditionalToolsVisibility();
				}
			} else {
				try { localStorage.setItem('additionalTools', '0'); } catch {}
				applyAdditionalToolsVisibility();
			}
		});
		applyAdditionalToolsVisibility();
	}
} catch {}

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
		<div class="row current-line"><span class="small muted">Current:</span><span class="v" id="mdnsCurrent">—</span></div>
		<div class="row mt-24">
			<label class="field">New advertise name:&nbsp;<input type="text" id="mdnsNameInput" placeholder="my-device" /></label>
			<input class="btn btn-secondary" type="button" id="mdnsApplyBtn" value="Apply" />
		</div>
		<div class="row mt-8"><span id="mdnsMsg" class="muted"></span></div>
		<div class="row mt-8 small muted">Applies to both http://&lt;name&gt;.local/ and USB UVC descriptor (restart device after change).</div>
	`;
	const input = document.getElementById('mdnsNameInput') as HTMLInputElement | null;
	const currentEl = document.getElementById('mdnsCurrent') as HTMLElement | null;
	const applyBtn = document.getElementById('mdnsApplyBtn') as HTMLButtonElement | null;
	const msg = document.getElementById('mdnsMsg') as HTMLElement | null;
	const refresh = async () => {
		if (!(window as any).isConnected) { currentEl && (currentEl.textContent = '—'); return; }
		currentEl && (currentEl.textContent = '…'); await ensureTransportConnected();
		showPanelBusy(panel, 'Reading name…');
		const name = await sendAndExtract(state.transport!, 'get_mdns_name');
		currentEl && (currentEl.textContent = typeof name === 'string' ? name : '—');
		hidePanelBusy(panel);
	};
	if (applyBtn) applyBtn.onclick = async () => {
		const val = (input?.value || '').trim(); if (!val) { msg && (msg.textContent = 'Enter a name'); return; }
		await ensureTransportConnected();
		showPanelBusy(panel, 'Saving name…');
		const ok = await sendAndExtract(state.transport!, 'set_mdns', { hostname: val });
		msg && (msg.textContent = ok ? 'Saved. Restart device.' : 'Failed to save');
		if (ok) await refresh();
		hidePanelBusy(panel);
	};
	// Auto-load current when tab is opened or if already active
	refresh();
	const nameTab = document.querySelector('#toolTabs .subtab[data-target="tool-mdns"]');
	nameTab?.addEventListener('click', () => { refresh(); });
}

function initDeviceModePanel() {
	const panel = document.getElementById('tool-mode'); if (!panel) return;
	panel.innerHTML = `
		<div class="row current-line"><span class="small muted">Current:</span><span class="v" id="devModeCurrent">—</span></div>
		<div class="row mt-24">
			<div class="segmented" id="devModeSeg">
				<button class="seg" data-value="wifi">WiFi</button>
				<button class="seg" data-value="uvc">UVC</button>
				<button class="seg" data-value="setup">Setup</button>
			</div>
		</div>
        <div class="row mt-24">
			<input class="btn btn-secondary" type="button" id="devModeApplyBtn" value="Apply" />
		</div>
		<div class="row mt-8"><span id="devModeMsg" class="muted"></span></div>
	`;
	const currentEl = document.getElementById('devModeCurrent');
	const seg = panel.querySelector('#devModeSeg') as HTMLElement | null;
	const applyBtn = document.getElementById('devModeApplyBtn') as HTMLButtonElement | null;
	const msg = document.getElementById('devModeMsg');
	// Ensure WiFi option follows Additional Tools visibility
	updateModeSegVisibility();
	const addToggle = document.getElementById('additionalTools') as HTMLInputElement | null;
	addToggle?.addEventListener('change', () => { updateModeSegVisibility(); });
	const refresh = async () => {
		if (!(window as any).isConnected) return; try { currentEl && (currentEl.textContent = '…'); } catch {}
		await ensureTransportConnected();
		showPanelBusy(panel, 'Reading device mode…');
		const mode = await sendAndExtract(state.transport!, 'get_device_mode');
		currentEl && (currentEl.textContent = String(mode));
		const buttons = Array.from((seg?.querySelectorAll('.seg') || []) as NodeListOf<HTMLButtonElement>);
		// If WiFi option is hidden, avoid activating it visually
		const chk = document.getElementById('additionalTools') as HTMLInputElement | null;
		const wifiHidden = chk && !chk.checked;
		const targetValue = (wifiHidden && mode === 'wifi') ? 'uvc' : String(mode);
		buttons.forEach(b => b.classList.toggle('active', b.dataset.value === targetValue));
		hidePanelBusy(panel);
	};
	if (seg) seg.addEventListener('click', (e) => {
		const t = e.target as HTMLElement; if (!t || !t.classList.contains('seg')) return;
		const buttons = Array.from((seg?.querySelectorAll('.seg') || []) as NodeListOf<HTMLButtonElement>);
		buttons.forEach(b => b.classList.toggle('active', b === t));
	});
	// When Tools main tab is opened and Mode subtab is the active one, refresh
	const toolsTab = document.querySelector('#tabs .tab[data-target="tools"]') as HTMLElement | null;
	toolsTab?.addEventListener('click', () => {
		// Make sure a visible subtab is active
		ensureVisibleToolSubtabActive();
		const activeSub = (document.querySelector('#toolTabs .subtab.active') as HTMLElement | null)?.dataset.target;
		if (activeSub === 'tool-mode') { void refresh(); }
	});
	// Also refresh right after a successful connection event
	document.addEventListener('ffvr-connected', () => { void refresh(); });
	if (applyBtn) applyBtn.onclick = async () => {
		const buttons = Array.from((seg?.querySelectorAll('.seg') || []) as NodeListOf<HTMLButtonElement>);
		const active = seg?.querySelector('.seg.active') as HTMLButtonElement | null;
		let value = (active?.getAttribute('data-value') as any) || '';
		if (!value) {
			const firstVisible = buttons.find(b => (b as HTMLElement).style.display !== 'none');
			value = (firstVisible?.dataset.value as any) || 'setup';
		}
		await ensureTransportConnected();
		showPanelBusy(panel, 'Applying mode…');
		try {
			const ok = await sendAndExtract(state.transport!, 'switch_mode', { mode: value });
			msg && (msg.textContent = ok ? 'Saved.' : 'Failed');
			if (ok) {
				await refresh();
				// If switched to setup mode, prompt user to power-cycle and allow confirming to auto-disconnect
				if (value === 'setup') {
					try {
						const ov = document.getElementById('powerCycleOverlay') as HTMLElement | null;
						const btn = document.getElementById('powerCycleConfirm') as HTMLButtonElement | null;
						if (ov && btn) {
							ov.style.display = 'flex';
							const onClick = async () => {
								btn.disabled = true;
								try { await handlePortDisconnected('Restart to boot mode'); } finally {
									ov.style.display = 'none'; btn.disabled = false;
									btn.removeEventListener('click', onClick);
								}
							};
							btn.addEventListener('click', onClick);
						}
					} catch {}
				}
			}
		} finally {
			hidePanelBusy(panel);
		}
	};
	refresh();
	const devTab = document.querySelector('#toolTabs .subtab[data-target="tool-mode"]');
	devTab?.addEventListener('click', () => { refresh(); });
}

function initLedPanel() {
	const panel = document.getElementById('tool-pwm'); if (!panel) return;
	panel.innerHTML = `
	<div class="row current-line"><span class="small muted">Current:</span><span class="v" id="ledDutyCur">—</span></div>
	<div class="row mt-4 small muted" id="ledCurRow" style="opacity:.9;">Current draw: <span id="ledCurMa">—</span></div>
	<div class="row mt-24">
			<label class="field">Duty:&nbsp;<input type="range" id="ledDutySlider" min="0" max="100" value="0" class="slider" />
				<input type="number" id="ledDutyInput" min="0" max="100" value="0" style="width:80px;" />%</label>
		</div>
		<div class="row mt-8 small muted">Adjust LED duty cycle; values auto-apply (debounced).</div>
	`;
	const dutyInput = document.getElementById('ledDutyInput') as HTMLInputElement | null;
	const slider = document.getElementById('ledDutySlider') as HTMLInputElement | null;
	const dutyCur = document.getElementById('ledDutyCur') as HTMLElement | null;
	const curMaEl = document.getElementById('ledCurMa') as HTMLElement | null;
	let currentDutyApplied: number = 0;
	let latestUserValue: number = 0;
	let applyTimer: any = null;
	let applying = false;
	const readAll = async () => {
		if (!(window as any).isConnected) { dutyCur && (dutyCur.textContent = '—'); curMaEl && (curMaEl.textContent = '—'); return; }
		dutyCur && (dutyCur.textContent = '…');
		await ensureTransportConnected();
		showPanelBusy(panel, 'Reading LED settings…');
		const duty = await sendAndExtract(state.transport!, 'get_led_duty_cycle');
		const cur = await sendAndExtract(state.transport!, 'get_led_current');
		if (typeof duty === 'number') {
			currentDutyApplied = duty;
			latestUserValue = duty;
			if (dutyInput) dutyInput.value = String(duty);
			if (slider) slider.value = String(duty);
			if (dutyCur) dutyCur.textContent = `${duty}%`;
		} else {
			if (dutyCur) dutyCur.textContent = '—';
		}
	if (curMaEl) curMaEl.textContent = `${cur ?? '—'} mA`;
	hidePanelBusy(panel);
	};
	const syncInputs = (from: 'slider' | 'input') => {
		const v = from === 'slider' ? parseInt(slider?.value || '0',10) : parseInt(dutyInput?.value || '0',10);
		if (slider && from !== 'slider') slider.value = String(v);
		if (dutyInput && from !== 'input') dutyInput.value = String(v);
		latestUserValue = v;
		scheduleApply();
	};
	slider && slider.addEventListener('input', () => syncInputs('slider'));
	dutyInput && dutyInput.addEventListener('input', () => syncInputs('input'));
	const scheduleApply = () => {
		// If change >= 10% from last applied, apply immediately; else debounce 1s
		const diff = Math.abs(latestUserValue - (currentDutyApplied ?? 0));
		if (diff >= 10) { clearTimer(); void applyNow(); return; }
		clearTimer();
		applyTimer = setTimeout(() => { void applyNow(); }, 1000);
	};
	const clearTimer = () => { if (applyTimer) { try { clearTimeout(applyTimer); } catch {} applyTimer = null; } };
	const applyNow = async () => {
		if (applying) return; applying = true; try {
			const val = parseInt(String(latestUserValue || 0), 10);
			// Avoid redundant set
			if (Math.abs(val - (currentDutyApplied ?? 0)) < 1) return;
			await ensureTransportConnected();
			showPanelBusy(panel, 'Setting LED duty…');
			await sendAndExtract(state.transport!, 'set_led_duty_cycle', { dutyCycle: val });
			currentDutyApplied = val;
			if (dutyCur) dutyCur.textContent = `${val}%`;
			// Refresh current draw after apply
			try {
				const cur = await sendAndExtract(state.transport!, 'get_led_current');
				if (curMaEl) curMaEl.textContent = `${cur ?? '—'} mA`;
			} catch {}
		} finally { applying = false; }
		hidePanelBusy(panel);
	};
	const tab = document.querySelector('#toolTabs .subtab[data-target="tool-pwm"]');
	tab?.addEventListener('click', async () => { await readAll(); });
	readAll();
}

// Streaming and Logs tabs removed

function initSummaryPanel() {
	const panel = document.getElementById('tool-summary'); if (!panel) return;
	panel.innerHTML = `
	<div class="row mt-8"><strong>Device summary</strong></div>
	<div class="kv-list compact mt-8" id="summaryList">
			<div class="kv"><div class="k">Serial</div><div class="v" id="sumSerial">—</div></div>
			<div class="kv"><div class="k">Name</div><div class="v" id="sumName">—</div></div>
			<div class="kv"><div class="k">Device</div><div class="v" id="sumDevice">—</div></div>
			<div class="kv"><div class="k">Version</div><div class="v" id="sumVersion">—</div></div>
			<div class="kv"><div class="k">Mode</div><div class="v" id="sumMode">—</div></div>
			<div class="kv"><div class="k">WiFi</div><div class="v" id="sumWifi">—</div></div>
			<div class="kv"><div class="k">LED Duty</div><div class="v" id="sumDuty">—</div></div>
			<div class="kv"><div class="k">LED Current</div><div class="v" id="sumCurrent">—</div></div>
		</div>
	`;
	const sumSerial = document.getElementById('sumSerial');
	const sumName = document.getElementById('sumName');
	const sumDevice = document.getElementById('sumDevice');
	const sumVersion = document.getElementById('sumVersion');
	const sumMode = document.getElementById('sumMode');
	const sumWifi = document.getElementById('sumWifi');
	const sumDuty = document.getElementById('sumDuty');
	const sumCurrent = document.getElementById('sumCurrent');
	const refreshSummary = async () => {
		if (!(window as any).isConnected) return;
		await ensureTransportConnected();
		showPanelBusy(panel, 'Reading device summary…');
		try {
			const serialInfo = await sendAndExtract(state.transport!, 'get_serial');
			if (serialInfo?.serial && sumSerial) sumSerial.textContent = String(serialInfo.serial);
		} catch {}
		try {
			const name = await sendAndExtract(state.transport!, 'get_mdns_name');
			if (sumName) sumName.textContent = String(name || '—');
		} catch {}
		try {
			const who = await sendAndExtract(state.transport!, 'get_who_am_i');
			if (who?.who_am_i && sumDevice) sumDevice.textContent = String(who.who_am_i);
			if (who?.version && sumVersion) sumVersion.textContent = String(who.version);
		} catch {}
		try {
			// If connection just switched to boot, we already know the effective mode
			let modeStr: string | null = null;
			if ((state as any).connectionMode === 'boot') {
				modeStr = 'setup';
			} else {
				const mode = await sendAndExtract(state.transport!, 'get_device_mode');
				modeStr = String(mode);
			}
			if (sumMode && modeStr) sumMode.textContent = modeStr;
		} catch {}
		try {
			const wifi = await sendAndExtract(state.transport!, 'get_wifi_status');
			if (wifi && typeof wifi === 'object' && sumWifi) sumWifi.textContent = `${wifi.status}${wifi.ip_address ? ' · ' + wifi.ip_address : ''}`;
		} catch {}
		try {
			const duty = await sendAndExtract(state.transport!, 'get_led_duty_cycle');
			const cur = await sendAndExtract(state.transport!, 'get_led_current');
			if (sumDuty) sumDuty.textContent = `${duty ?? '—'}%`;
			if (sumCurrent) sumCurrent.textContent = `${cur ?? '—'} mA`;
		} catch {}
		hidePanelBusy(panel);
	};
	// Expose to index.html subtabs handler to auto-load when switching
	;(window as any).autoLoadSummary = refreshSummary;
	// Also refresh immediately if Summary tab is already active
	const isActive = (document.querySelector('#toolTabs .subtab.active') as HTMLElement | null)?.dataset.target === 'tool-summary';
	if (isActive) refreshSummary();
}

initMdnsPanel();
initDeviceModePanel();
initLedPanel();
initSummaryPanel();
initUpdatePanel();

// Start/stop UVC preview in the main connect block when connection state changes
document.addEventListener('DOMContentLoaded', () => {
	try {
		const video = document.getElementById('uvcPreviewVideo') as HTMLVideoElement | null;
		const box = document.getElementById('uvcPreviewBox') as HTMLElement | null;
		const info = document.getElementById('uvcPreviewInfo') as HTMLElement | null;
		const uvcToggle = document.getElementById('uvcEnable') as HTMLInputElement | null;
		if (!video || !box) return;
		// Restore persisted preference
		try {
			const pref = localStorage.getItem('uvcEnable');
			if (uvcToggle && (pref === '1' || pref === 'true')) { uvcToggle.checked = true; }
		} catch {}
		const isUvcEnabled = () => !!(uvcToggle && uvcToggle.checked);
		const startIfConnected = async () => {
			if (!(window as any).isConnected) { box.style.display = 'none'; return; }
			if (!isUvcEnabled()) { box.style.display = 'none'; if (info) info.textContent = 'Enable "UVC preview" in the Advanced menu.'; return; }
			if ((state as any).connectionMode !== 'runtime') { box.style.display = 'none'; if (info) info.textContent = 'UVC preview only in runtime mode.'; return; }
			const assoc = await findAssociatedUvc();
			if (!assoc.deviceId) { if (info) info.textContent = 'No matching UVC camera found.'; box.style.display = 'none'; return; }
			box.style.display = 'flex'; if (info) info.textContent = `UVC: ${assoc.label || 'camera'}`;
			await startUvcPreview(video, info || undefined);
		};
		// When tabs enabled after connect, try starting preview
		document.addEventListener('ffvr-connected', startIfConnected as any);
		// Fallback: attempt shortly after load and after connect button hides
		setTimeout(startIfConnected, 300);
		// Handle toggle changes
		if (uvcToggle) {
			uvcToggle.addEventListener('change', async () => {
				try { localStorage.setItem('uvcEnable', uvcToggle.checked ? '1' : '0'); } catch {}
				await startIfConnected();
			});
		}
	} catch {}
});

function initUpdatePanel() {
	const body = document.getElementById('updateBody'); if (!body) return;
	const lbl = document.getElementById('updateModeLabel') as HTMLElement | null;
	const hintRuntime = document.getElementById('updateHintRuntime') as HTMLElement | null;
	const actRuntime = document.getElementById('updateActionsRuntime') as HTMLElement | null;
	const actBoot = document.getElementById('updateActionsBoot') as HTMLElement | null;
	const btnSwitch = document.getElementById('btnSwitchToBoot') as HTMLInputElement | null;
	const btnGo = document.getElementById('btnGoToFlash') as HTMLInputElement | null;
	const msg = document.getElementById('updateMsg') as HTMLElement | null;
	const refresh = async () => {
		if (!(window as any).isConnected) {
			if (lbl) lbl.textContent = '—';
			hintRuntime && (hintRuntime.style.display = 'none');
			actRuntime && (actRuntime.style.display = 'none');
			actBoot && (actBoot.style.display = 'none');
			return;
		}
		// Always compute UI from known connection mode first
		const isBoot = (state as any).connectionMode === 'boot';
		if (lbl) lbl.textContent = isBoot ? 'Boot mode' : 'Not boot mode';
		if (isBoot) {
			hintRuntime && (hintRuntime.style.display = 'none');
			actRuntime && (actRuntime.style.display = 'none');
			actBoot && (actBoot.style.display = 'flex');
		} else {
			hintRuntime && (hintRuntime.style.display = 'flex');
			actRuntime && (actRuntime.style.display = 'flex');
			actBoot && (actBoot.style.display = 'none');
		}
		// Optionally try to ping device for side-effects; ignore failures
		try {
			await ensureTransportConnected();
			showPanelBusy(body, 'Reading status…');
			await sendAndExtract(state.transport!, 'get_device_mode');
		} catch { /* ignore */ } finally { hidePanelBusy(body); }
	};
	btnSwitch && (btnSwitch.onclick = async () => {
		try {
			btnSwitch.disabled = true; msg && (msg.textContent = 'Switching to setup mode…');
			await ensureTransportConnected();
			showPanelBusy(body, 'Switching to boot mode…');
			const ok = await sendAndExtract(state.transport!, 'switch_mode', { mode: 'setup' });
			if (!ok) { msg && (msg.textContent = 'Switch failed'); return; }
			// Show full-screen power-cycle prompt; on confirm, auto-disconnect
			try {
				const ov = document.getElementById('powerCycleOverlay') as HTMLElement | null;
				const btn = document.getElementById('powerCycleConfirm') as HTMLButtonElement | null;
				if (ov && btn) {
					ov.style.display = 'flex';
					const onClick = async () => {
						btn.disabled = true;
						try { await handlePortDisconnected('Restart to boot mode'); } finally {
							ov.style.display = 'none'; btn.disabled = false;
							btn.removeEventListener('click', onClick);
						}
					};
					btn.addEventListener('click', onClick);
				}
			} catch {}
		} finally { hidePanelBusy(body); btnSwitch.disabled = false; }
	});
	btnGo && (btnGo.onclick = () => {
		const tab = document.querySelector('#tabs .tab[data-target="program"]') as HTMLElement | null;
		tab?.click();
	});
	document.addEventListener('ffvr-connected', refresh as any);
	refresh();
}

