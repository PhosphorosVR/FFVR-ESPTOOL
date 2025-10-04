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
		// Modified: do not auto-activate any subtab; wait for user interaction.
		// If an active tab exists but became hidden, just remove its active state.
		const active = subtabs.find(t => t.classList.contains('active'));
		if (active && !vis(active)) active.classList.remove('active');
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
				if (who?.version) {
					if (sumVersion) sumVersion.textContent = String(who.version);
					try { sessionStorage.setItem('ffvr_device_version', String(who.version)); } catch {}
					try { localStorage.setItem('ffvr_device_version', String(who.version)); } catch {}
				}
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
	// No default auto-load now; summary refresh occurs when user clicks the tab.
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
		<div class="row mt-8" id="updateModeRow"><span class="small muted">Mode:</span><span class="v" id="updateModeLabel">—</span></div>
		<div class="row mt-12 small" id="runtimeUpgradeStatusRow" style="display:none;">
			<span id="runtimeUpgradeStatus" class="upgrade-flag flag-pending">—</span>
		</div>
		<div class="row mt-28" id="updateActionsRuntime" style="display:none; gap: 8px;">
			<input class="btn btn-switch-boot" type="button" id="btnSwitchToBoot" value="Switch to boot mode & Upgrade" title="Switch to boot mode and start upgrade" />
		</div>
		<div class="row mt-12" id="updateActionsBoot" style="display:none; flex-direction:column; align-items:flex-start; gap:12px;">
			<div class="upgrade-meta small" style="display:flex; flex-direction:column; gap:8px;">
				<div>Board: <span class="v" id="upgradeBoard">—</span></div>
				<div>Your version: <span class="v" id="upgradeCurrent">—</span></div>
				<div>Latest version: <span class="v" id="upgradeLatest">—</span></div>
				<div id="upgradeStatus" class="small" style="opacity:.85;">—</div>
			</div>
			<input class="btn btn-switch-boot" type="button" id="btnDoUpgrade" value="Upgrade" />
			<input class="btn btn-switch-boot" type="button" id="btnReturnStream" value="Return to stream mode" style="display:none;" title="Switch device back to UVC (runtime)" />
			<!-- Advanced flashing removed per request -->
		</div>
	`;
	const lbl = document.getElementById('updateModeLabel');
	const actRuntime = document.getElementById('updateActionsRuntime');
	const actBoot = document.getElementById('updateActionsBoot');
	const btnSwitch = document.getElementById('btnSwitchToBoot') as HTMLInputElement | null;
	const btnUpgrade = document.getElementById('btnDoUpgrade') as HTMLInputElement | null;
	const btnReturnStream = document.getElementById('btnReturnStream') as HTMLInputElement | null;
	const upBoard = document.getElementById('upgradeBoard') as HTMLElement | null;
	const upCurrent = document.getElementById('upgradeCurrent') as HTMLElement | null;
	const upLatest = document.getElementById('upgradeLatest') as HTMLElement | null;
	const upStatus = document.getElementById('upgradeStatus') as HTMLElement | null;
	const runtimeStatusRow = document.getElementById('runtimeUpgradeStatusRow') as HTMLElement | null;
	const runtimeStatus = document.getElementById('runtimeUpgradeStatus') as HTMLElement | null;
	// Automatic discovery now integrated into switch-to-boot; button removed.

	async function autoDiscoverBoard(): Promise<string | null> {
		try {
			if (!(window as any).isConnected) return null;
			if ((state as any).connectionMode !== 'runtime') return sessionStorage.getItem('ffvr_detected_board');
			// Skip if already detected in this session
			const existing = sessionStorage.getItem('ffvr_detected_board');
			if (existing) return existing;
			await ensureTransportConnected();
			let board: string | null = null;
			try {
				const who = await sendAndExtract(state.transport!, 'get_who_am_i');
				if (who?.who_am_i) board = String(who.who_am_i).toLowerCase();
				if (who?.version) { try { sessionStorage.setItem('ffvr_device_version', String(who.version)); } catch {} try { localStorage.setItem('ffvr_device_version', String(who.version)); } catch {} }
			} catch {}
			if (!board) { try { const name = await sendAndExtract(state.transport!, 'get_mdns_name'); if (name) board = String(name).toLowerCase(); } catch {} }
			if (board) {
				if (/eye[_-]?l/.test(board)) board = 'facefocusvr_eye_l';
				else if (/eye[_-]?r/.test(board)) board = 'facefocusvr_eye_r';
				else if (/face/.test(board)) board = 'facefocusvr_face';
			}
			if (!board) {
				try { const { showConnectAlert } = await import('./ui/alerts'); showConnectAlert('Could not auto-detect device type. You can still flash manually.','error'); } catch {}
				return null;
			}
			try { sessionStorage.setItem('ffvr_detected_board', board); } catch {}
			try { const { dbg } = await import('./ui/debug'); dbg(`Auto-discovered board: ${board}`,'info'); } catch {}
			// Preload manifest & attempt early selection (runtime view not critical but sets state)
			try { const { loadPrebuiltManifest } = await import('./features/firmwareManifest'); await loadPrebuiltManifest(); } catch {}
			return board;
		} catch { return null; }
	}

	function mapBoardLabel(id: string | null): string {
		if (!id) return '—';
		if (id === 'facefocusvr_face') return 'FFVR Face';
		if (id === 'facefocusvr_eye_l') return 'FFVR Eye L';
		if (id === 'facefocusvr_eye_r') return 'FFVR Eye R';
		return id;
	}

	function parseVersionFromLabel(label: string | null): string | null {
		if (!label) return null;
		const m = label.match(/\[(\d+\.\d+\.\d+)\]/);
		return m ? m[1] : null;
	}

	function compareSemver(a: string | null, b: string | null): number {
		if (!a || !b) return 0;
		const pa = a.split('.').map(n=>parseInt(n,10));
		const pb = b.split('.').map(n=>parseInt(n,10));
		for (let i=0;i<3;i++) { const da = pa[i]||0, db = pb[i]||0; if (da>db) return 1; if (da<db) return -1; }
		return 0;
	}

	function deriveLatestForBoard(board: string | null): { version: string | null; optionValue: string | null } {
		try {
			const sel = document.getElementById('prebuiltSelect') as HTMLSelectElement | null;
			if (!sel) return { version: null, optionValue: null };
			const group = sel.querySelector('optgroup[label="FFVR"]') as HTMLOptGroupElement | null;
			if (!group) return { version: null, optionValue: null };
			let best: { v: string; opt: HTMLOptionElement } | null = null;
			const want = board;
			const opts = Array.from(group.querySelectorAll('option')) as HTMLOptionElement[];
			for (const o of opts) {
				const lbl = o.textContent || '';
				// Determine board mapping from text
				let mapped: string | null = null;
				if (/face/i.test(lbl)) mapped = 'facefocusvr_face';
				else if (/eye\s*L/i.test(lbl)) mapped = 'facefocusvr_eye_l';
				else if (/eye\s*R/i.test(lbl)) mapped = 'facefocusvr_eye_r';
				if (mapped && mapped === want) {
					const ver = parseVersionFromLabel(lbl);
					if (ver) {
						if (!best || compareSemver(ver, best.v) > 0) best = { v: ver, opt: o };
					}
				}
			}
			return best ? { version: best.v, optionValue: best.opt.value } : { version: null, optionValue: null };
		} catch { return { version: null, optionValue: null }; }
	}

	async function refresh() {
		try {
			const isBoot = (state as any).connectionMode === 'boot';
			if (lbl) lbl.textContent = isBoot ? 'Boot mode' : 'Runtime mode';
				if (isBoot) {
				if (actRuntime) actRuntime.style.display = 'none';
				if (actBoot) actBoot.style.display = 'flex';
					// Hide runtime status row in boot mode to avoid duplicate upgrade status
					if ((runtimeStatusRow)) runtimeStatusRow.style.display = 'none';
				try {
					const boardId = sessionStorage.getItem('ffvr_detected_board');
					let currentVer = sessionStorage.getItem('ffvr_device_version');
					if (!currentVer) { try { currentVer = localStorage.getItem('ffvr_device_version'); } catch {} }
					// If no board detected, gray out tab & button
					const updateTab = document.querySelector('#tabs .tab[data-target="update"]') as HTMLElement | null;
					if (!boardId) {
						if (updateTab) updateTab.classList.add('disabled');
						if (btnUpgrade) { btnUpgrade.disabled = true; btnUpgrade.title = 'No board detected'; }
						if (upBoard) upBoard.textContent = '—';
						if (upCurrent) upCurrent.textContent = '—';
						if (upLatest) upLatest.textContent = '—';
						if (upStatus) { upStatus.textContent = 'Detect board in runtime first'; upStatus.className = 'upgrade-flag flag-pending'; }
						return;
					} else if (updateTab) {
						updateTab.classList.remove('disabled');
					}
					// Derive latest from manifest
					const latest = deriveLatestForBoard(boardId);
					if (latest.optionValue) { sessionStorage.setItem('ffvr_recommended_value', latest.optionValue); }
					if (latest.version) { sessionStorage.setItem('ffvr_latest_version', latest.version); }
					if (upBoard) upBoard.textContent = mapBoardLabel(boardId);
					if (upCurrent) upCurrent.textContent = currentVer || '—';
					if (upLatest) upLatest.textContent = latest.version || '—';
						if (upStatus) {
							if (currentVer && latest.version) {
								const cmp = compareSemver(latest.version, currentVer);
								if (cmp > 0) {
									upStatus.textContent = `Upgrade available (${currentVer} → ${latest.version})`;
									upStatus.className = 'upgrade-flag flag-upgrade';
									if (btnUpgrade) { btnUpgrade.disabled = false; btnUpgrade.title = 'Flash latest firmware'; btnUpgrade.classList.add('upgrade-ready'); btnUpgrade.style.display = 'inline-flex'; }
									if (btnReturnStream) btnReturnStream.style.display = 'none';
								} else if (cmp === 0) {
									upStatus.textContent = 'Up to date';
									upStatus.className = 'upgrade-flag flag-ok';
									if (btnUpgrade) { btnUpgrade.disabled = true; btnUpgrade.title = 'Already latest version'; btnUpgrade.classList.remove('upgrade-ready'); btnUpgrade.style.display = 'none'; }
									if (btnReturnStream) { btnReturnStream.style.display = 'inline-flex'; }
								} else {
									upStatus.textContent = 'Development build';
									upStatus.className = 'upgrade-flag flag-dev';
									if (btnUpgrade) { btnUpgrade.disabled = false; btnUpgrade.title = 'Flash anyway'; btnUpgrade.classList.remove('upgrade-ready'); btnUpgrade.style.display = 'inline-flex'; }
									if (btnReturnStream) btnReturnStream.style.display = 'none';
								}
							} else {
								upStatus.textContent = '—';
								upStatus.className = 'upgrade-flag flag-pending';
								if (btnUpgrade) { btnUpgrade.disabled = !latest.optionValue; btnUpgrade.classList.remove('upgrade-ready'); btnUpgrade.style.display = latest.optionValue ? 'inline-flex' : 'none'; }
								if (btnReturnStream) btnReturnStream.style.display = 'none';
							}
						}
				} catch {}
				} else {
				if (actRuntime) actRuntime.style.display = 'flex';
				if (actBoot) actBoot.style.display = 'none';
				// NEW: In runtime mode already check if an upgrade is available
				try {
					if (btnSwitch) { btnSwitch.disabled = true; btnSwitch.title = 'Connect or detect device…'; }
					if (runtimeStatusRow) runtimeStatusRow.style.display = 'none';
					// Nur wenn verbunden & im Runtime-Modus versuchen wir Board + Version zu ermitteln
					if ((window as any).isConnected && (state as any).connectionMode === 'runtime') {
						// Falls noch kein Board ermittelt wurde: jetzt versuchen (einmalig pro Session)
						let boardId = sessionStorage.getItem('ffvr_detected_board');
						if (!boardId) {
							try { boardId = await autoDiscoverBoard(); } catch {}
						}
						// Aktuelle Version ermitteln / aus Cache holen
						let currentVer = sessionStorage.getItem('ffvr_device_version');
						if (!currentVer) { try { currentVer = localStorage.getItem('ffvr_device_version'); } catch {} }
						if (!currentVer) {
							// Versuche direkt auszulesen (who_am_i)
							try {
								await ensureTransportConnected();
								const who = await sendAndExtract(state.transport!, 'get_who_am_i');
								if (who?.version) { currentVer = String(who.version); sessionStorage.setItem('ffvr_device_version', currentVer); }
							} catch {}
						}
						// Manifest muss geladen sein, deriveLatestForBoard liefert sonst null
						const latest = deriveLatestForBoard(boardId);
						if (latest.version) { sessionStorage.setItem('ffvr_latest_version', latest.version); }
						if (boardId && latest.version && currentVer) {
							const cmp = compareSemver(latest.version, currentVer);
							if (cmp > 0) {
								// Upgrade available -> enable button
								if (btnSwitch) { btnSwitch.disabled = false; btnSwitch.title = `Upgrade available (${currentVer} → ${latest.version})`; btnSwitch.classList.add('upgrade-ready'); }
								if (runtimeStatusRow && runtimeStatus) {
									runtimeStatusRow.style.display = 'flex';
									runtimeStatus.textContent = `Upgrade available (${currentVer} → ${latest.version})`;
									runtimeStatus.className = 'upgrade-flag flag-upgrade';
								}
							} else if (cmp === 0) {
								if (btnSwitch) { btnSwitch.disabled = true; btnSwitch.title = 'Already latest version'; btnSwitch.classList.remove('upgrade-ready'); }
								if (runtimeStatusRow && runtimeStatus) {
									runtimeStatusRow.style.display = 'flex';
									runtimeStatus.textContent = 'Up to date';
									runtimeStatus.className = 'upgrade-flag flag-ok';
								}
							} else { // current > latest (dev build)
								if (btnSwitch) { btnSwitch.disabled = true; btnSwitch.title = 'Firmware is newer than release'; btnSwitch.classList.remove('upgrade-ready'); }
								if (runtimeStatusRow && runtimeStatus) {
									runtimeStatusRow.style.display = 'flex';
									runtimeStatus.textContent = 'Development build';
									runtimeStatus.className = 'upgrade-flag flag-dev';
								}
							}
						} else {
							// Unvollständige Daten – Button deaktivieren
							if (btnSwitch) {
								btnSwitch.disabled = true;
								btnSwitch.title = boardId ? 'No version data available' : 'Board not detected';
								btnSwitch.classList.remove('upgrade-ready');
							}
							if (runtimeStatusRow && runtimeStatus) {
								runtimeStatusRow.style.display = 'flex';
								runtimeStatus.textContent = boardId ? '—' : 'Board not detected';
								runtimeStatus.className = 'upgrade-flag flag-pending';
							}
						}
					}
				} catch {}
			}
		} catch {}
	}

	btnSwitch && (btnSwitch.onclick = async () => {
		try {
			if (!(window as any).isConnected) return;
			await ensureTransportConnected();
			// Perform automatic board discovery before requesting boot mode
			const discovered = await autoDiscoverBoard();
			if (discovered) {
				try { const { showConnectAlert } = await import('./ui/alerts'); showConnectAlert(`Detected board: ${discovered}. Switching to boot…`,'success'); } catch {}
			}
			const ok = await sendAndExtract(state.transport!, 'switch_mode', { mode: 'setup' });
			if (ok) {
				// Show same overlay as device mode panel
				const ov = document.getElementById('powerCycleOverlay') as HTMLElement | null;
				const btn = document.getElementById('powerCycleConfirm') as HTMLButtonElement | null;
				if (ov && btn) {
					ov.style.display = 'flex';
					btn.addEventListener('click', async () => {
						btn.disabled = true;
						try {
							const { handlePortDisconnected } = await import('./core/serial');
							await handlePortDisconnected('Restart to boot mode');
							ov.style.display = 'none';
							// Begin auto-reconnect sequence (no user re-click required)
							await autoReconnectBoot();
						} catch {}
						finally { btn.disabled = false; }
					}, { once: true });
				}
			}
		} catch {}
	});

	btnUpgrade && (btnUpgrade.onclick = async () => {
		try {
			if ((state as any).connectionMode !== 'boot') return;
			const sel = document.getElementById('prebuiltSelect') as HTMLSelectElement | null;
			let recommended = sessionStorage.getItem('ffvr_recommended_value');
			if (sel) {
				if (!recommended) {
					const board = sessionStorage.getItem('ffvr_detected_board');
					if (board) {
						const ffvrGroup = sel.querySelector('optgroup[label="FFVR"]') as HTMLOptGroupElement | null;
						if (ffvrGroup) {
							const opt = ffvrGroup.querySelector(`option[data-board="${board}"]`) as HTMLOptionElement | null;
							if (opt) recommended = opt.value;
						}
					}
				}
				if (!recommended) {
					const first = sel.querySelector('optgroup[label="FFVR"] option') as HTMLOptionElement | null;
					if (first) recommended = first.value;
				}
				if (!recommended) {
					try { const { showConnectAlert } = await import('./ui/alerts'); showConnectAlert('No firmware recommendation available. Use advanced flashing.','error'); } catch {}
					return;
				}
				if (sel.value !== recommended) {
					sel.value = recommended;
					sel.dispatchEvent(new Event('change'));
				}
				// Update versions if missing
				try {
					const opt = sel.querySelector(`option[value="${recommended}"]`) as HTMLOptionElement | null;
					if (opt) {
						const latestVer = parseVersionFromLabel(opt.textContent || '') || sessionStorage.getItem('ffvr_latest_version');
						if (latestVer) { sessionStorage.setItem('ffvr_latest_version', latestVer); if (upLatest) upLatest.textContent = latestVer; }
					}
				} catch {}
			}
			const programBtn = el.programButton() as HTMLButtonElement | null;
			if (!programBtn) return;
			programBtn.disabled = true;
			try {
				if ((state as any).connectionMode === 'boot' && state.esploader) {
					// Immediately switch to console/monitor tab so user sees erase & flash progress without delay
					try {
						const tabs = Array.from(document.querySelectorAll('#tabs .tab')) as HTMLElement[];
						const consoleTab = tabs.find(t => t.dataset.target === 'console');
						if (consoleTab && !consoleTab.classList.contains('disabled')) consoleTab.click();
					} catch {}
					try { dbg('Auto erase before upgrade', 'info'); } catch {}
					try { await state.esploader.eraseFlash(); } catch (e:any) { dbg(`Auto erase failed: ${e?.message || e}`,'info'); return; }
				}
				await performFlash(el.table()!, el.prebuiltSelect(), el.alertDiv(), getTerminal());
			} finally { programBtn.disabled = false; }
		} catch {}
	});

	btnReturnStream && (btnReturnStream.onclick = async () => {
		try {
			if ((state as any).connectionMode !== 'boot') return;
			await ensureTransportConnected();
			// Switch to UVC runtime mode
			const ok = await sendAndExtract(state.transport!, 'switch_mode', { mode: 'uvc' });
			if (ok) {
				// Show power cycle overlay (reuse existing) then attempt reconnect in runtime
				const ov = document.getElementById('powerCycleOverlay') as HTMLElement | null;
				const btn = document.getElementById('powerCycleConfirm') as HTMLButtonElement | null;
				if (ov && btn) {
					ov.style.display = 'flex';
					btn.addEventListener('click', async () => {
						btn.disabled = true;
						try {
							const { handlePortDisconnected } = await import('./core/serial');
							await handlePortDisconnected('Restart to runtime mode');
							ov.style.display = 'none';
							await autoReconnectRuntime();
						} catch {}
						finally { btn.disabled = false; }
					}, { once: true });
				}
			}
		} catch {}
	});

	document.addEventListener('ffvr-connected', () => { refresh(); });
	// Fix: stale upgrade status when switching between different devices within one session.
	// When a new runtime connection is established, previously cached board/version info from another device
	// could incorrectly show "Up to date". We clear the cache so detection + manifest mapping re-run fresh.
	document.addEventListener('ffvr-connected', () => {
		try {
			if ((state as any).connectionMode === 'runtime') {
				sessionStorage.removeItem('ffvr_detected_board');
				sessionStorage.removeItem('ffvr_device_version');
				sessionStorage.removeItem('ffvr_latest_version');
				sessionStorage.removeItem('ffvr_recommended_value');
				// Trigger a second refresh after clearing so runtime panel re-populates with new detection
				setTimeout(() => { try { refresh(); } catch {} }, 0);
			}
		} catch {}
	}, { once: false });
	refresh();
}

initUpdatePanel();

// Automatically attempt to reconnect in boot mode after user power-cycled when switching from runtime.
async function autoReconnectRuntime() {
	try {
		const connectBtn = document.getElementById('connectButton') as HTMLButtonElement | null;
		if (!connectBtn) return;
		let indicator = document.getElementById('autoReconnectIndicatorRuntime') as HTMLElement | null;
		if (!indicator) {
			indicator = document.createElement('div');
			indicator.id = 'autoReconnectIndicatorRuntime';
			indicator.style.display = 'flex';
			indicator.style.alignItems = 'center';
			indicator.style.gap = '6px';
			indicator.style.fontSize = '12px';
			indicator.style.color = 'var(--muted)';
			indicator.style.marginTop = '6px';
			indicator.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" stroke-width="3"/><path d="M22 12a10 10 0 0 0-10-10" stroke="var(--accent)" stroke-width="3"/></svg><span>Reconnecting (runtime)…</span>`;
			const parentSection = document.getElementById('connect');
			const adv = parentSection?.querySelector('details.advanced');
			if (adv && adv.parentElement) adv.parentElement.insertBefore(indicator, document.getElementById('connectAlert'));
		}
		indicator.style.display = 'flex';
		connectBtn.disabled = true;
		let cleaned = false;
		const cleanup = () => { if (cleaned) return; cleaned = true; try { connectBtn.disabled = false; } catch {}; try { indicator!.style.display = 'none'; } catch {}; };
		const serAny: any = (navigator as any).serial;
		let picked: any = null;
		for (let attempt = 0; attempt < 6 && !picked; attempt++) {
			await new Promise(r => setTimeout(r, 350 + attempt * 170));
			try {
				const ports = await serAny?.getPorts?.();
				if (Array.isArray(ports) && ports.length) {
					picked = ports.find((p: any) => /esp|usb/i.test(String(p?.device?.productName || ''))) || ports[0];
				}
			} catch {}
		}
		if (!picked) { try { const { showConnectAlert } = await import('./ui/alerts'); showConnectAlert('Reconnect (runtime) failed. Please press Connect.','error'); } catch {}; cleanup(); return; }
		try { const { state } = await import('./core/state'); state.device = picked; (window as any)._ffvr_autoReconnectRuntimePending = true; } catch {}
		const onAutoConnected = async () => {
			try {
				if (!(window as any)._ffvr_autoReconnectRuntimePending) return;
				(window as any)._ffvr_autoReconnectRuntimePending = false;
				// Open Tools tab (UVC / summary) after runtime reconnect
				const toolsTab = document.querySelector('#tabs .tab[data-target="tools"]') as HTMLElement | null; toolsTab?.click();
				try { const { showConnectAlert } = await import('./ui/alerts'); showConnectAlert('Reconnected (runtime mode).','success'); } catch {}
			} finally { cleanup(); }
		};
		document.addEventListener('ffvr-connected', onAutoConnected, { once: true });
		connectBtn.disabled = false;
		connectBtn.click();
	} catch {}
}
async function autoReconnectBoot() {
	try {
		const connectBtn = document.getElementById('connectButton') as HTMLButtonElement | null;
		if (!connectBtn) return;
		// Show inline spinner + text (non-blocking layout under buttons row)
		let indicator = document.getElementById('autoReconnectIndicator') as HTMLElement | null;
		if (!indicator) {
			indicator = document.createElement('div');
			indicator.id = 'autoReconnectIndicator';
			indicator.style.display = 'flex';
			indicator.style.alignItems = 'center';
			indicator.style.gap = '6px';
			indicator.style.fontSize = '12px';
			indicator.style.color = 'var(--muted)';
			indicator.style.marginTop = '6px';
			indicator.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" stroke-width="3"/><path d="M22 12a10 10 0 0 0-10-10" stroke="var(--accent)" stroke-width="3"/></svg><span>Auto‑reconnecting…</span>`;
			const parentSection = document.getElementById('connect');
			const adv = parentSection?.querySelector('details.advanced');
			if (adv && adv.parentElement) adv.parentElement.insertBefore(indicator, document.getElementById('connectAlert'));
		}
		indicator.style.display = 'flex';
		connectBtn.disabled = true;
		let cleaned = false;
		const cleanup = () => { if (cleaned) return; cleaned = true; try { connectBtn.disabled = false; } catch {}; try { indicator!.style.display = 'none'; } catch {}; };
		// Probe for new port
		const serAny: any = (navigator as any).serial;
		let picked: any = null;
		for (let attempt = 0; attempt < 6 && !picked; attempt++) {
			await new Promise(r => setTimeout(r, 350 + attempt * 170));
			try {
				const ports = await serAny?.getPorts?.();
				if (Array.isArray(ports) && ports.length) {
					picked = ports.find((p: any) => /esp|boot|jtag|usb/i.test(String(p?.device?.productName || ''))) || ports[0];
				}
			} catch {}
		}
		if (!picked) { try { const { showConnectAlert } = await import('./ui/alerts'); showConnectAlert('Auto-reconnect failed. Please press Connect.','error'); } catch {}; cleanup(); return; }
		try { const { state } = await import('./core/state'); state.device = picked; (window as any)._ffvr_autoReconnectPending = true; } catch {}
		const onAutoConnected = async () => {
			try {
				if (!(window as any)._ffvr_autoReconnectPending) return;
				(window as any)._ffvr_autoReconnectPending = false;
				const programTab = document.querySelector('#tabs .tab[data-target="program"]') as HTMLElement | null; programTab?.click();
				try { const { showConnectAlert } = await import('./ui/alerts'); showConnectAlert('Auto-reconnected (boot mode). Ready to flash.','success'); } catch {}
			} finally { cleanup(); }
		};
		document.addEventListener('ffvr-connected', onAutoConnected, { once: true });
		// Must re-enable for click handler
		connectBtn.disabled = false;
		connectBtn.click();
	} catch {}
}

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

