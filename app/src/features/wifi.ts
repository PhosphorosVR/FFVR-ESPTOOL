import { state } from "../core/state";
import { ensureTransportConnected } from "../core/serial";
import { sendCommand, extractNetworks, sendAndExtract, WifiStatus } from "../core/jsonClient";
import { escapeHtml, startStatusAnimation, showPanelBusy, hidePanelBusy } from "../ui/utils";
import { dbg } from "../ui/debug";

export const parseNetworksFromResults = extractNetworks;

// Scan for available WiFi networks and render the table
export async function wifiScanAndDisplay() {
  const statusEl = document.getElementById('wifiStatusMsg') as HTMLElement | null;
  const panel = document.getElementById('tool-wifi') as HTMLElement | null;
  try {
    if (panel) showPanelBusy(panel, 'Scanning WiFi…');
    statusEl && (statusEl.textContent = 'Scanning...');
    const pauseResp = await sendCommand(state.transport!, 'pause', { pause: true }, 5000);
    try {
      if (pauseResp && (pauseResp as any).error === 'Command timeout') {
        dbg('Device pause command sent (startup logs may have obscured response)', 'info');
      }
    } catch {}
  statusEl && (statusEl.textContent = 'Scanning...');
  const raw = await sendAndExtract(state.transport!, 'scan_networks', undefined, 60000);
    const bestBySsid = new Map<string, {ssid: string; rssi: number; channel: number; auth_mode: number; mac_address?: string}>();
    for (const n of raw) {
      const ssidName = (typeof (n as any)?.ssid === 'string') ? (n as any).ssid : '';
      const key = ssidName;
      const prev = bestBySsid.get(key);
      if (!prev || (((n as any)?.rssi ?? -999) > ((prev as any)?.rssi ?? -999))) {
        bestBySsid.set(key, n as any);
      }
    }
    const nets = Array.from(bestBySsid.values()).filter(n => typeof (n as any).ssid === 'string' && (n as any).ssid.length > 0);
    nets.sort((a: any, b: any) => ((b as any).rssi || -999) - ((a as any).rssi || -999));
    dbg(`Scan parsed: ${nets.length} networks`, 'info');
    const names = nets.map((n: any) => String((n as any).ssid));
    dbg(`Scan SSIDs: ${JSON.stringify(names)}`, 'info');

    const tableEl = document.getElementById('wifiTable') as HTMLElement | null;
    const body = document.getElementById('wifiTableBody') as HTMLElement | null;
    const hintEl = document.getElementById('wifiHint') as HTMLElement | null;
    if (body) body.innerHTML = '';
    const selBox = document.getElementById('wifiSelectionBox') as HTMLElement | null;
    const ssidLabel = document.getElementById('wifiSelectedSsidLabel') as HTMLElement | null;
    const pwdField = document.getElementById('wifiPwdField') as HTMLElement | null;
    if (nets.length === 0) {
      statusEl && (statusEl.textContent = 'No networks found');
      if (tableEl) tableEl.style.display = 'none';
      if (hintEl) hintEl.style.display = 'none';
      if (selBox) selBox.style.display = 'none';
      if (pwdField) pwdField.style.display = 'none';
      if (ssidLabel) ssidLabel.textContent = '';
  if (panel) hidePanelBusy(panel);
  return;
    }
    if (tableEl) tableEl.style.display = 'table';
    // Hide the hint once scan results are shown
    if (hintEl) hintEl.style.display = 'none';
    nets.forEach((n: any, idx: number) => {
      const tr = document.createElement('tr');
      const open = ((n as any).auth_mode === 0);
      const radioId = `wifiSel_${idx}`;
      const lockIcon = open ? '🔓' : '🔒';
      const label = (typeof (n as any).ssid === 'string' && (n as any).ssid.length > 0) ? (n as any).ssid : '<hidden>';
      const labelEsc = escapeHtml(label);
      tr.innerHTML = `
        <td class="col-select"><input type="radio" name="wifiNet" id="${radioId}" /></td>
        <td><label for="${radioId}" class="wifi-ssid">${lockIcon} ${labelEsc}</label></td>
        <td>${(n as any).rssi} dBm</td>
      `;
      const radio = tr.querySelector('input[type="radio"]') as HTMLInputElement;
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        Array.from((body as HTMLElement).children).forEach((row) => row.classList.remove('active'));
        tr.classList.add('active');
        if (ssidLabel) ssidLabel.textContent = label;
        if (selBox) selBox.style.display = 'flex';
        if (pwdField) pwdField.style.display = open ? 'none' : 'inline-block';
        (ssidLabel as any)._auth_mode = (n as any).auth_mode;
        (ssidLabel as any)._ssid = (n as any).ssid || '';
        try { if (statusEl) statusEl.textContent = ''; } catch {}
      });
      body?.appendChild(tr);
    });
  // We omit a verbose status like "Found N networks" since the table shows results
  statusEl && (statusEl.textContent = '');
  if (panel) hidePanelBusy(panel);
  } catch (e: any) {
    statusEl && (statusEl.textContent = `Scan failed: ${e.message || e}`);
    if (panel) hidePanelBusy(panel);
  }
}

export async function wifiConnectSelected() {
  const statusEl = document.getElementById('wifiStatusMsg') as HTMLElement | null;
  const ssidLabel = document.getElementById('wifiSelectedSsidLabel') as HTMLElement | null;
  const pwdEl = document.getElementById('wifiPassword') as HTMLInputElement | null;
  const selBox = document.getElementById('wifiSelectionBox') as HTMLElement | null;
  const pwdField = document.getElementById('wifiPwdField') as HTMLElement | null;
  const ssid = (ssidLabel as any)?._ssid?.trim();
  const authMode = (ssidLabel as any)?._auth_mode ?? 1;
  if (!ssid) { statusEl && (statusEl.textContent = 'Please select a network first'); return; }
  const open = authMode === 0;
  const password = open ? '' : (pwdEl?.value || '');

  const panel = document.getElementById('tool-wifi') as HTMLElement | null;
  try {
    if (panel) showPanelBusy(panel, 'Saving WiFi settings…');
    try {
      if (panel) { hidePanelBusy(panel); showPanelBusy(panel, 'Connecting…'); }
      if (selBox) selBox.style.display = 'none';
      if (pwdField) pwdField.style.display = 'none';
    } catch {}
    const stopApplyAnim = startStatusAnimation(statusEl, 'Applying WiFi settings');
    let setResp: any;
    try {
  setResp = await sendCommand(state.transport!, 'set_wifi', { name: 'main', ssid, password, channel: 0, power: 0 }, 15000);
    } finally {
      try { stopApplyAnim(); } catch {}
    }
    if (setResp?.error) throw new Error(setResp.error);

    const stopConnectAnim = startStatusAnimation(statusEl, 'Connecting');
    try {
      await sendCommand(state.transport!, 'connect_wifi', {}, 10000);
      const start = Date.now();
      let ip: string | null = null;
      while (Date.now() - start < 30000) {
  const st: WifiStatus = await sendAndExtract(state.transport!, 'get_wifi_status', undefined, 5000);
        if (st.status === 'error') {
          try {
            if (selBox) selBox.style.display = 'flex';
            if (pwdField) pwdField.style.display = open ? 'none' : 'inline-block';
          } catch {}
          statusEl && (statusEl.textContent = 'Connection not confirmed - you probably entered the wrong password');
          return;
        }
        if (st.status === 'connected' && st.ip_address && st.ip_address !== '0.0.0.0') {
          ip = st.ip_address;
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      statusEl && (statusEl.textContent = ip ? `Connected: ${ip}` : 'Connection not confirmed');
  } finally {
      try { stopConnectAnim(); } catch {}
    }
  if (panel) hidePanelBusy(panel);
  } catch (e: any) {
    try {
      if (selBox) selBox.style.display = 'flex';
      if (pwdField) pwdField.style.display = open ? 'none' : 'inline-block';
    } catch {}
  statusEl && (statusEl.textContent = `Error: ${e.message || e}`);
  if (panel) hidePanelBusy(panel);
  }
}

// Wire WiFi scan/connect buttons
export function wireWifiButtons() {
  const wifiScanButton = document.getElementById('wifiScanButton') as HTMLButtonElement | null;
  const wifiConnectButton = document.getElementById('wifiConnectButton') as HTMLButtonElement | null;
  if (wifiScanButton) {
    wifiScanButton.onclick = async () => {
      const body = document.getElementById('wifiTableBody') as HTMLElement | null;
      const tableEl = document.getElementById('wifiTable') as HTMLElement | null;
      const hintEl = document.getElementById('wifiHint') as HTMLElement | null;
      const statusEl = document.getElementById('wifiStatusMsg') as HTMLElement | null;
  const selBox = document.getElementById('wifiSelectionBox') as HTMLElement | null;
  const pwdField = document.getElementById('wifiPwdField') as HTMLElement | null;
  const ssidLabel = document.getElementById('wifiSelectedSsidLabel') as HTMLElement | null;
      if (body) body.innerHTML = '';
      if (tableEl) tableEl.style.display = 'none';
      if (hintEl) hintEl.style.display = 'none';
  if (selBox) selBox.style.display = 'none';
  if (pwdField) pwdField.style.display = 'none';
  if (ssidLabel) ssidLabel.textContent = '';
      let dots = 0;
      const maxDots = 5;
      let scanActive = true;
      if (statusEl) statusEl.textContent = 'Scanning';
      const anim = setInterval(() => {
        if (!scanActive) return;
        dots = (dots + 1) % (maxDots + 1);
        let txt = 'Scanning';
        txt += '.'.repeat(dots);
        if (statusEl) statusEl.textContent = txt;
        if (dots === maxDots) dots = 0;
      }, 300);
      await ensureTransportConnected();
      await wifiScanAndDisplay();
      scanActive = false;
      clearInterval(anim);
    };
  }
  if (wifiConnectButton) {
    wifiConnectButton.onclick = async () => {
      await ensureTransportConnected();
      await wifiConnectSelected();
    };
  }
}
