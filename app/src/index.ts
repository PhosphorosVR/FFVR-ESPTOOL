/* App orchestrator: wires UI controls to modules in core/, ui/, and features/ */

import { state } from "./core/state";
import { initDebugPanel } from "./ui/debug";
import { updateConnStatusDot, showConnectAlert } from "./ui/alerts";
import { el, setTabsEnabled } from "./ui/dom";
import { initTerminal, getTerminal, startConsole, stopConsole } from "./ui/terminal";
import { loadPrebuiltManifest, wireLegacyToggle } from "./features/firmwareManifest";
import { wireConnection } from "./features/connection";
import { wireWifiButtons } from "./features/wifi";
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

