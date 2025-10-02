/* App orchestrator: wires UI controls to modules in core/, ui/, and features/ */

import { state } from "./core/state";
import { initDebugPanel, dbg } from "./ui/debug";
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

// Additional tools (WiFi, Name, LED) visibility toggle & confirmation
function updateModeSegVisibility() {
	try {
		const seg = document.querySelector('#tool-mode #devModeSeg') as HTMLElement | null;
		if (!seg) return;
		const chk = document.getElementById('additionalTools') as HTMLInputElement | null;
		const showExtra = !chk || chk.checked;
		const wifiBtn = seg.querySelector('.seg[data-value="wifi"]') as HTMLElement | null;
		if (wifiBtn) wifiBtn.style.display = showExtra ? '' : 'none';
		// If active hidden, switch
		const active = seg.querySelector('.seg.active') as HTMLElement | null;
		if (active && wifiBtn && wifiBtn.style.display === 'none' && active.dataset.value === 'wifi') {
			const fallback = seg.querySelector('.seg[data-value="uvc"]') as HTMLElement | null
				|| seg.querySelector('.seg[data-value="setup"]') as HTMLElement | null;
			if (fallback) {
				seg.querySelectorAll('.seg').forEach(b => b.classList.remove('active'));
				fallback.classList.add('active');
			}
		}
	} catch {}
}

function ensureVisibleToolSubtabActive() {
	try {
		const subtabs = Array.from(document.querySelectorAll('#toolTabs .subtab')) as HTMLElement[];
		const vis = (el: HTMLElement) => el.style.display !== 'none';
		let active = subtabs.find(t => t.classList.contains('active'));
		if (!active || !vis(active)) {
			const pref = ['tool-mode','tool-summary'];
			let target: HTMLElement | null = null;
			for (const id of pref) {
				const t = document.querySelector(`#toolTabs .subtab[data-target="${id}"]`) as HTMLElement | null;
				if (t && vis(t)) { target = t; break; }
			}
			if (!target) target = subtabs.find(vis) || null;
			target?.click();
		}
	} catch {}
}

function applyAdditionalToolsVisibility() {
	try {
		const chk = document.getElementById('additionalTools') as HTMLInputElement | null;
		const show = !chk || chk.checked;
		const ids = ['tool-wifi','tool-mdns','tool-pwm'];
		ids.forEach(id => {
			const li = document.querySelector(`#toolTabs .subtab[data-target="${id}"]`) as HTMLElement | null;
			if (li) li.style.display = show ? '' : 'none';
			const panel = document.getElementById(id) as HTMLElement | null;
			if (panel && !show) panel.style.display = 'none';
		});
		updateModeSegVisibility();
		ensureVisibleToolSubtabActive();
	} catch {}
}

try {
	const addToggle = document.getElementById('additionalTools') as HTMLInputElement | null;
	if (addToggle) {
		try {
			const pref = localStorage.getItem('additionalTools');
			if (pref === '0') addToggle.checked = false;
			else if (pref === '1') addToggle.checked = true;
		} catch {}
		addToggle.addEventListener('change', () => {
			if (addToggle.checked) {
				const ov = document.getElementById('additionalToolsOverlay') as HTMLElement | null;
				const ok = document.getElementById('additionalToolsConfirm') as HTMLButtonElement | null;
				const cancel = document.getElementById('additionalToolsCancel') as HTMLButtonElement | null;
				if (ov && ok && cancel) {
					ov.style.display = 'flex';
					cancel.addEventListener('click', () => {
						ov.style.display = 'none';
						addToggle.checked = false;
						try { localStorage.setItem('additionalTools','0'); } catch {}
						applyAdditionalToolsVisibility();
					}, { once: true });
					ok.addEventListener('click', () => {
						ov.style.display = 'none';
						try { localStorage.setItem('additionalTools','1'); } catch {}
						applyAdditionalToolsVisibility();
					}, { once: true });
				} else {
					// fallback no overlay
					addToggle.checked = false;
					try { localStorage.setItem('additionalTools','0'); } catch {}
					applyAdditionalToolsVisibility();
				}
			} else {
				try { localStorage.setItem('additionalTools','0'); } catch {}
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

// Program button (now: auto erase before flashing)
const programButton = el.programButton();
if (programButton) (programButton as any).onclick = async () => {
	const table = el.table();
	if (!table) return;
	const btn = programButton as HTMLButtonElement;
	btn.disabled = true;
	const alertDiv = el.alertDiv();
	const alertMsg = document.getElementById('programAlertMsg');
	try {
		// Auto erase sequence (only if bootloader / esploader available)
		if ((state as any).connectionMode === 'boot' && state.esploader) {
			try { dbg('Auto erase before flash', 'info'); } catch {}
			try {
				// Switch to console tab so user sees progress (same logic as manual erase)
				try {
					const tabs = Array.from(document.querySelectorAll('#tabs .tab')) as HTMLElement[];
					const consoleTab = tabs.find(t => t.dataset.target === 'console');
					if (consoleTab && !consoleTab.classList.contains('disabled')) consoleTab.click();
				} catch {}
				await state.esploader.eraseFlash();
				try { dbg('Erase flash done (auto)', 'info'); } catch {}
			} catch (e: any) {
				try { dbg(`Auto erase failed: ${e?.message || e}`, 'info'); } catch {}
				if (alertDiv && alertMsg) {
					(alertMsg as any).textContent = 'Erase failed – aborting flash.';
					(alertDiv as any).style.display = 'block';
				}
				return; // Abort flashing if erase fails
			}
		}
		await performFlash(table, el.prebuiltSelect(), alertDiv, getTerminal());
	} finally {
		btn.disabled = false;
	}
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
	async function refresh() {
		if (!(window as any).isConnected) { currentEl && (currentEl.textContent = '—'); return; }
		currentEl && (currentEl.textContent = '…'); await ensureTransportConnected();
		const name = await sendAndExtract(state.transport!, 'get_mdns_name');
		currentEl && (currentEl.textContent = typeof name === 'string' ? name : '—');
	}
	if (applyBtn) applyBtn.onclick = async () => {
		const val = (input?.value || '').trim(); if (!val) { msg && (msg.textContent = 'Enter a name'); return; }
		await ensureTransportConnected();
		const ok = await sendAndExtract(state.transport!, 'set_mdns', { hostname: val });
		msg && (msg.textContent = ok ? 'Saved. Restart device.' : 'Failed to save');
		if (ok) await refresh();
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
	async function refresh() {
		if (!(window as any).isConnected) return; try { currentEl && (currentEl.textContent = '…'); } catch {}
		await ensureTransportConnected(); const mode = await sendAndExtract(state.transport!, 'get_device_mode');
		currentEl && (currentEl.textContent = String(mode));
		updateModeSegVisibility();
		const buttons = Array.from((seg?.querySelectorAll('.seg') || []) as NodeListOf<HTMLButtonElement>);
		const chk = document.getElementById('additionalTools') as HTMLInputElement | null;
		const wifiHidden = chk && !chk.checked;
		const targetValue = (wifiHidden && mode === 'wifi') ? 'uvc' : String(mode);
		buttons.forEach(b => b.classList.toggle('active', b.dataset.value === targetValue));
	}
	if (seg) seg.addEventListener('click', (e) => {
		const t = e.target as HTMLElement; if (!t || !t.classList.contains('seg')) return;
		const buttons = Array.from((seg?.querySelectorAll('.seg') || []) as NodeListOf<HTMLButtonElement>);
		buttons.forEach(b => b.classList.toggle('active', b === t));
	});
	if (applyBtn) applyBtn.onclick = async () => {
		const active = seg?.querySelector('.seg.active') as HTMLElement | null;
		let value = (active?.getAttribute('data-value') as any) || '';
		if (!value) {
			const buttons = Array.from((seg?.querySelectorAll('.seg') || []) as NodeListOf<HTMLButtonElement>);
			const firstVisible = buttons.find(b => (b as HTMLElement).style.display !== 'none');
			value = (firstVisible?.dataset.value as any) || 'setup';
		}
		await ensureTransportConnected();
		const ok = await sendAndExtract(state.transport!, 'switch_mode', { mode: value });
		msg && (msg.textContent = ok ? 'Saved.' : 'Failed');
		if (ok) {
			await refresh();
			if (value === 'setup') {
				try {
					const ov = document.getElementById('powerCycleOverlay') as HTMLElement | null;
					const btn = document.getElementById('powerCycleConfirm') as HTMLButtonElement | null;
					if (ov && btn) {
						ov.style.display = 'flex';
						btn.addEventListener('click', async () => {
							btn.disabled = true;
							try {
								const { handlePortDisconnected } = await import('./core/serial');
								await handlePortDisconnected('Restart to boot mode');
							} catch {}
							finally {
								ov.style.display = 'none';
								btn.disabled = false;
							}
						}, { once: true });
					}
				} catch {}
			}
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
	async function readAll() {
		if (!(window as any).isConnected) { dutyCur && (dutyCur.textContent = '—'); curMaEl && (curMaEl.textContent = '—'); return; }
		dutyCur && (dutyCur.textContent = '…');
		await ensureTransportConnected();
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
	}
	function syncInputs(from: 'slider' | 'input') {
		const v = from === 'slider' ? parseInt(slider?.value || '0',10) : parseInt(dutyInput?.value || '0',10);
		if (slider && from !== 'slider') slider.value = String(v);
		if (dutyInput && from !== 'input') dutyInput.value = String(v);
		latestUserValue = v;
		scheduleApply();
	}
	slider && slider.addEventListener('input', () => syncInputs('slider'));
	dutyInput && dutyInput.addEventListener('input', () => syncInputs('input'));
	function scheduleApply() {
		// If change >= 10% from last applied, apply immediately; else debounce 1s
		const diff = Math.abs(latestUserValue - (currentDutyApplied ?? 0));
		if (diff >= 10) { clearTimer(); void applyNow(); return; }
		clearTimer();
		applyTimer = setTimeout(() => { void applyNow(); }, 1000);
	}
	function clearTimer() { if (applyTimer) { try { clearTimeout(applyTimer); } catch {} applyTimer = null; } }
	async function applyNow() {
		if (applying) return; applying = true; try {
			const val = parseInt(String(latestUserValue || 0), 10);
			// Avoid redundant set
			if (Math.abs(val - (currentDutyApplied ?? 0)) < 1) return;
			await ensureTransportConnected();
			await sendAndExtract(state.transport!, 'set_led_duty_cycle', { dutyCycle: val });
			currentDutyApplied = val;
			if (dutyCur) dutyCur.textContent = `${val}%`;
			// Refresh current draw after apply
			try {
				const cur = await sendAndExtract(state.transport!, 'get_led_current');
				if (curMaEl) curMaEl.textContent = `${cur ?? '—'} mA`;
			} catch {}
		} finally { applying = false; }
	}
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
	async function refreshSummary() {
		if (!(window as any).isConnected) return;
		await ensureTransportConnected();
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
			const mode = await sendAndExtract(state.transport!, 'get_device_mode');
			if (sumMode) sumMode.textContent = String(mode);
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
	}
	// Auto-load on show + persist last active tool subtab
	;(window as any).autoLoadSummary = refreshSummary;
	const isActive = (document.querySelector('#toolTabs .subtab.active') as HTMLElement | null)?.dataset.target === 'tool-summary';
	if (isActive) refreshSummary();
}

initMdnsPanel();
initDeviceModePanel();
initLedPanel();
initSummaryPanel();

// Update panel (unified entry for switching to boot and proceeding to flashing)
function initUpdatePanel() {
	const panel = document.getElementById('update'); if (!panel) return;
	const body = panel.querySelector('.card-body') as HTMLElement | null;
	if (!body) return;
	body.innerHTML = `
		<div class="row mt-8" id="updateModeRow"><span class="small muted">Device:</span><span class="v" id="updateModeLabel">—</span></div>
		<div class="row mt-12 small muted" id="updateHintRuntime" style="display:none;">Switch to boot mode to flash firmware.</div>
		<div class="row mt-12" id="updateActionsRuntime" style="display:none; gap: 8px;">
			<input class="btn btn-secondary" type="button" id="btnSwitchToBoot" value="Switch to boot mode" />
		</div>
		<div class="row mt-12" id="updateActionsBoot" style="display:none;">
			<input class="btn btn-primary" type="button" id="btnGoToFlash" value="Continue to flashing" />
		</div>
		<div class="row mt-24 small muted" style="opacity:.85;" id="updateFooterNote">After flashing, power‑cycle the device to return to runtime mode.</div>
	`;
	const lbl = document.getElementById('updateModeLabel');
	const hintRuntime = document.getElementById('updateHintRuntime');
	const actRuntime = document.getElementById('updateActionsRuntime');
	const actBoot = document.getElementById('updateActionsBoot');
	const btnSwitch = document.getElementById('btnSwitchToBoot') as HTMLInputElement | null;
	const btnFlash = document.getElementById('btnGoToFlash') as HTMLInputElement | null;

	async function refresh() {
		try {
			const isBoot = (state as any).connectionMode === 'boot';
			if (lbl) lbl.textContent = isBoot ? 'Boot mode' : 'Runtime mode';
			if (isBoot) {
				if (hintRuntime) hintRuntime.style.display = 'none';
				if (actRuntime) actRuntime.style.display = 'none';
				if (actBoot) actBoot.style.display = 'flex';
			} else {
				if (hintRuntime) { hintRuntime.style.display = 'flex'; }
				if (actRuntime) actRuntime.style.display = 'flex';
				if (actBoot) actBoot.style.display = 'none';
			}
		} catch {}
	}

	btnSwitch && (btnSwitch.onclick = async () => {
		try {
			if (!(window as any).isConnected) return;
			await ensureTransportConnected();
			const ok = await sendAndExtract(state.transport!, 'switch_mode', { mode: 'setup' });
			if (ok) {
				// Show same overlay as device mode panel
				const ov = document.getElementById('powerCycleOverlay') as HTMLElement | null;
				const btn = document.getElementById('powerCycleConfirm') as HTMLButtonElement | null;
				if (ov && btn) {
					ov.style.display = 'flex';
					btn.addEventListener('click', async () => {
						btn.disabled = true;
						try { const { handlePortDisconnected } = await import('./core/serial'); await handlePortDisconnected('Restart to boot mode'); } catch {}
						finally { ov.style.display = 'none'; btn.disabled = false; }
					}, { once: true });
				}
			}
		} catch {}
	});

	btnFlash && (btnFlash.onclick = () => {
		// Navigate to flashing tab
		const tabProgram = document.querySelector('#tabs .tab[data-target="program"]') as HTMLElement | null;
		tabProgram?.click();
	});

	document.addEventListener('ffvr-connected', () => { refresh(); });
	refresh();
}

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
		function isUvcEnabled() { return !!(uvcToggle && uvcToggle.checked); }
		const startIfConnected = async () => {
			if (!(window as any).isConnected) { box.style.display = 'none'; return; }
			if (!isUvcEnabled()) { box.style.display = 'none'; if (info) info.textContent = 'Aktiviere "Enable UVC preview" im Advanced Menü.'; return; }
			if ((state as any).connectionMode !== 'runtime') { box.style.display = 'none'; if (info) info.textContent = 'UVC preview only in runtime mode.'; return; }
			const assoc = await findAssociatedUvc();
			if (!assoc.deviceId) { if (info) info.textContent = 'Keine passende UVC-Kamera gefunden.'; box.style.display = 'none'; return; }
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

