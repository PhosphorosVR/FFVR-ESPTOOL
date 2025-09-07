import { requestPort, openPort, closePort, OpenPort } from './serial';
import { sendCommand, parseNetworks, parseWifiStatus, parseDeviceMode, parseMdnsName, parseLedDuty, parseLedCurrent, parseSerialInfo } from './api';

let portRef: OpenPort | null = null;
let debugEnabled = false;
let logActive = false;
let logLoopPromise: Promise<void> | null = null;

function qs<T extends HTMLElement = HTMLElement>(sel: string): T | null { return document.querySelector(sel); }
function log(msg: string) { const el = qs<HTMLPreElement>('#debugLog'); if (el) { el.textContent += msg + '\n'; el.scrollTop = el.scrollHeight; } }
function setConnStatus(txt: string) { const el = qs('#connStatus'); if (el) el.textContent = txt; }
function setEnabled(sel: string, en: boolean) { const el = qs<HTMLButtonElement>(sel); if (el) el.disabled = !en; }
function activePanel(id: string) { document.querySelectorAll('.panel').forEach(p => (p as HTMLElement).style.display = (p.id === id) ? 'block' : 'none'); }

async function connect() {
  if (!(navigator as any).serial) {
    setConnStatus('Web Serial API not available (use Chrome / Edge over HTTPS or localhost)');
    return;
  }
  if (portRef) { await disconnect(); }
  // List already granted ports for debugging
  try {
    const granted: any[] = await (navigator as any).serial.getPorts();
    if (debugEnabled) log(`Already granted ports: ${granted.length}`);
    if (granted.length === 1) {
      // Optionally auto-use if user previously granted permission
      const baudSel = qs<HTMLSelectElement>('#baudSelect');
      const baud = parseInt(baudSel?.value || '115200');
      try {
        portRef = await openPort(granted[0], baud);
        setConnStatus('Connected (existing permission)');
        qs('#actionsCard')!.setAttribute('style','display:block;');
        setEnabled('#btnDisconnect', true);
        setEnabled('#btnSelectPort', false);
        if (debugEnabled) log('Connected via previously granted port');
        return;
      } catch (e:any) {
        if (debugEnabled) log('Failed opening previously granted port: '+ (e.message||e));
      }
    }
  } catch {}
  try {
    const port = await requestPort();
    const baudSel = qs<HTMLSelectElement>('#baudSelect');
    const baud = parseInt(baudSel?.value || '115200');
    portRef = await openPort(port, baud);
    setConnStatus('Connected');
    qs('#actionsCard')!.setAttribute('style','display:block;');
    setEnabled('#btnDisconnect', true);
    setEnabled('#btnSelectPort', false);
    if (debugEnabled) log('Connected');
  } catch (e: any) {
    if (e && (e.name === 'NotFoundError' || e.message?.includes('No port selected'))) {
      setConnStatus('Keine Ports gewählt oder sichtbar. Hinweise: 1) Andere Programme (Python/Arduino) schließen 2) Gerät neu einstecken 3) Chrome/Edge verwenden 4) Treiber installiert? (USB Serial / CP210 / CH340) 5) Webseite über localhost/HTTPS öffnen');
    } else if (e && e.message?.includes('access')) {
      setConnStatus('Zugriff verweigert – Browser Permission prüfen / Seite neu laden');
    } else {
      setConnStatus('Failed: ' + (e.message || e));
    }
    if (debugEnabled) log('Connect error: ' + (e?.stack || e));
  }
}

async function disconnect() {
  if (logActive) stopLogs();
  await closePort(portRef); portRef = null;
  setConnStatus('Disconnected');
  setEnabled('#btnDisconnect', false);
  setEnabled('#btnSelectPort', true);
}

async function runCmd(cmd: string, data?: any, timeout?: number) {
  if (!portRef) throw new Error('Not connected');
  if (debugEnabled) log('> ' + cmd + (data ? (' ' + JSON.stringify(data)) : ''));
  const resp = await sendCommand(portRef, cmd, data, timeout);
  if (debugEnabled) log('< ' + JSON.stringify(resp));
  return resp;
}

// WiFi
async function wifiScan() {
  const msgEl = qs('#wifiScanMsg'); if (msgEl) msgEl.textContent = 'Scanning…';
  const table = qs<HTMLTableElement>('#wifiTable'); const body = qs<HTMLTableSectionElement>('#wifiTbody');
  if (body) body.innerHTML=''; if (table) table.style.display='none';
  try {
    const resp = await runCmd('scan_networks', undefined, 60000);
    const nets = parseNetworks(resp).sort((a,b) => b.rssi - a.rssi);
    if (nets.length) { if (table) table.style.display='table'; }
    nets.forEach((n,i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i+1}</td><td>${n.ssid || '<hidden>'}</td><td>${n.channel}</td><td>${n.rssi}</td><td>${n.auth_mode===0?'Open':'Sec'}</td>`;
      tr.addEventListener('click', () => selectNetwork(n));
      body?.appendChild(tr);
    });
    msgEl && (msgEl.textContent = nets.length ? `${nets.length} networks` : 'No networks');
  } catch (e: any) { msgEl && (msgEl.textContent = 'Error: '+ (e.message||e)); }
}

let selectedNet: any = null;
function selectNetwork(n: any) {
  selectedNet = n; const ssidInput = qs<HTMLInputElement>('#cfgSsid'); if (ssidInput) ssidInput.value = n.ssid;
  setEnabled('#btnApplyWifi', true); setEnabled('#btnWifiConfigure', true); setEnabled('#btnWifiConnect', true);
  const body = qs<HTMLTableSectionElement>('#wifiTbody'); if (body) Array.from(body.children).forEach(r => r.classList.remove('selected'));
  const rows = body?.querySelectorAll('tr') || [];
  rows.forEach(r => { if ((r as HTMLElement).innerText.includes(n.ssid)) r.classList.add('selected'); });
}

async function applyWifi() {
  const ssid = (qs<HTMLInputElement>('#cfgSsid')?.value || '').trim();
  const pwd = qs<HTMLInputElement>('#cfgPwd')?.value || '';
  const msg = qs('#wifiCfgMsg'); if (msg) msg.textContent='Applying…';
  try {
    await runCmd('set_wifi', { name:'main', ssid, password: pwd, channel:0, power:0 });
    msg && (msg.textContent = 'Credentials saved');
  } catch (e: any) { msg && (msg.textContent = 'Error: ' + (e.message||e)); }
}

async function wifiConnect() {
  const msg = qs('#wifiCfgMsg'); if (msg) msg.textContent='Connecting…';
  try { await runCmd('connect_wifi'); msg && (msg.textContent='Connect started'); }
  catch(e:any){ msg && (msg.textContent='Error: '+(e.message||e)); }
}

async function wifiStatus() {
  const msg = qs('#wifiCfgMsg'); if (msg) msg.textContent='Reading status…';
  try { const resp = await runCmd('get_wifi_status'); const st = parseWifiStatus(resp); msg && (msg.textContent = `Status: ${st.status} IP:${st.ip||'-'}`); }
  catch(e:any){ msg && (msg.textContent='Error: '+(e.message||e)); }
}

async function wifiAuto() {
  const msg = qs('#wifiCfgMsg'); if (msg) msg.textContent='Auto setup…';
  try {
    await wifiScan();
    if (!selectedNet) { msg && (msg.textContent='No networks'); return; }
    await applyWifi();
    await wifiConnect();
    const start = Date.now(); let ip: string | undefined; let last: any = null;
    while (Date.now() - start < 30000) { const resp = await runCmd('get_wifi_status'); const st = parseWifiStatus(resp); last = st; if (st.ip && st.ip !== '0.0.0.0') { ip = st.ip; break; } await new Promise(r=>setTimeout(r,500)); }
    msg && (msg.textContent = ip ? `Connected: ${ip}` : 'Not confirmed');
  } catch (e:any) { msg && (msg.textContent='Error: '+(e.message||e)); }
}

// Name
async function readName() {
  const msg = qs('#nameMsg'); if (msg) msg.textContent='Reading…';
  try { const resp = await runCmd('get_mdns_name'); const name = parseMdnsName(resp); (qs<HTMLInputElement>('#nameInput')!)!.value = name; msg && (msg.textContent='Current: '+name); }
  catch(e:any){ msg && (msg.textContent='Error: '+(e.message||e)); }
}
async function applyName() {
  const val = (qs<HTMLInputElement>('#nameInput')?.value || '').trim();
  const msg = qs('#nameMsg'); if (msg) msg.textContent='Saving…';
  try { await runCmd('set_mdns', { hostname: val }); msg && (msg.textContent='Saved (restart device to take effect)'); }
  catch(e:any){ msg && (msg.textContent='Error: '+(e.message||e)); }
}

// Mode
async function readMode() {
  const el = qs('#modeCurrent'); if (el) el.textContent='…';
  try { const resp = await runCmd('get_device_mode'); const mode = parseDeviceMode(resp); el && (el.textContent=mode); const radios = document.querySelectorAll('input[name="modeOpt"]') as NodeListOf<HTMLInputElement>; radios.forEach(r => { r.checked = r.value === mode; }); }
  catch(e:any){ el && (el.textContent='unknown'); }
}
async function applyMode() {
  const radios = document.querySelectorAll('input[name="modeOpt"]') as NodeListOf<HTMLInputElement>; let val = 'wifi'; radios.forEach(r=>{ if(r.checked) val=r.value; });
  const msg = qs('#modeMsg'); if (msg) msg.textContent='Saving…';
  try { await runCmd('switch_mode', { mode: val }); msg && (msg.textContent='Saved. Restart device.'); await readMode(); }
  catch(e:any){ msg && (msg.textContent='Error: '+(e.message||e)); }
}

// LED
async function ledRead() {
  const msg = qs('#ledMsg'); if (msg) msg.textContent='Reading…';
  try { const dutyResp = await runCmd('get_led_duty_cycle'); const duty = parseLedDuty(dutyResp); if (duty !== null) (qs<HTMLInputElement>('#ledDutyInput')!).value = String(duty); const curResp = await runCmd('get_led_current'); const cur = parseLedCurrent(curResp); msg && (msg.textContent=`Duty: ${duty ?? '-'}%  Current: ${cur ?? '-'} mA`); }
  catch(e:any){ msg && (msg.textContent='Error: '+(e.message||e)); }
}
async function ledApply() {
  const val = parseInt(qs<HTMLInputElement>('#ledDutyInput')?.value || '0');
  const msg = qs('#ledMsg'); if (msg) msg.textContent='Setting…';
  try { await runCmd('set_led_duty_cycle', { dutyCycle: val }); msg && (msg.textContent='Updated'); await ledRead(); }
  catch(e:any){ msg && (msg.textContent='Error: '+(e.message||e)); }
}

// Logs
async function startLogs() {
  if (!portRef) return; if (logActive) return; logActive = true; setEnabled('#btnStartLogs', false); setEnabled('#btnStopLogs', true);
  const logOut = qs<HTMLPreElement>('#logOutput');
  const decoder = new TextDecoder();
  async function loop() {
    if (!portRef) return; if (!portRef.reader) portRef.reader = portRef.port.readable?.getReader() || null; if (!portRef.reader) return;
    while (logActive) {
      try {
        const { value, done } = await portRef.reader.read(); if (done) break;
        if (value) {
          const text = decoder.decode(value, { stream: true });
          text.split(/\r?\n/).forEach(line => {
            if (!line) return;
            if (line.startsWith('{') && line.endsWith('}')) { if (line.includes('heartbeat')) return; }
            logOut && (logOut.textContent += line + '\n');
            logOut && (logOut.scrollTop = logOut.scrollHeight);
          });
        }
      } catch { break; }
    }
  }
  logLoopPromise = loop();
}
function stopLogs() { logActive = false; setEnabled('#btnStartLogs', true); setEnabled('#btnStopLogs', false); }

// Summary
async function summaryRefresh() {
  const out = qs<HTMLPreElement>('#summaryOutput'); if (out) out.textContent='Collecting...\n';
  try {
    const parts: string[] = [];
    const serialInfo = parseSerialInfo(await runCmd('get_serial'));
    parts.push('Serial: ' + (serialInfo.serial || 'n/a'));
    const name = parseMdnsName(await runCmd('get_mdns_name'));
    parts.push('Name: ' + name);
    const infoResp = await runCmd('get_who_am_i'); parts.push('WhoAmI: ' + JSON.stringify(infoResp));
    const mode = parseDeviceMode(await runCmd('get_device_mode')); parts.push('Mode: ' + mode);
    const wifiSt = parseWifiStatus(await runCmd('get_wifi_status')); parts.push('WiFi: ' + wifiSt.status + ' IP:' + (wifiSt.ip||'-'));
    const ledDutyResp = await runCmd('get_led_duty_cycle'); const duty = parseLedDuty(ledDutyResp); parts.push('LED Duty: ' + (duty ?? '-'));
    const ledCurResp = await runCmd('get_led_current'); const cur = parseLedCurrent(ledCurResp); parts.push('LED Current: ' + (cur ?? '-'));
    out && (out.textContent = parts.join('\n'));
  } catch (e:any) { out && (out.textContent += '\nError: '+(e.message||e)); }
}

// Tab handling
function wireTabs() {
  const tabs = document.querySelectorAll('#mainTabs .subtab');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(tt => tt.classList.remove('active'));
    t.classList.add('active');
    const target = (t as HTMLElement).dataset.target!;
    activePanel(target);
    if (target === 'tab-mode') readMode();
  }));
}

function wireUI() {
  qs('#btnSelectPort')?.addEventListener('click', connect);
  qs('#btnDisconnect')?.addEventListener('click', disconnect);
  qs('#chkDebug')?.addEventListener('change', (e: any) => { debugEnabled = !!e.target.checked; });
  qs('#btnWifiScan')?.addEventListener('click', wifiScan);
  qs('#btnWifiConfigure')?.addEventListener('click', applyWifi);
  qs('#btnWifiConnect')?.addEventListener('click', wifiConnect);
  qs('#btnWifiStatus')?.addEventListener('click', wifiStatus);
  qs('#btnWifiAuto')?.addEventListener('click', wifiAuto);
  qs('#btnApplyWifi')?.addEventListener('click', applyWifi);
  qs('#btnReadName')?.addEventListener('click', readName);
  qs('#btnApplyName')?.addEventListener('click', applyName);
  qs('#btnModeApply')?.addEventListener('click', applyMode);
  qs('#btnLedRead')?.addEventListener('click', ledRead);
  qs('#btnLedApply')?.addEventListener('click', ledApply);
  qs('#btnStartLogs')?.addEventListener('click', startLogs);
  qs('#btnStopLogs')?.addEventListener('click', stopLogs);
  qs('#btnSummary')?.addEventListener('click', summaryRefresh);
}

wireTabs();
wireUI();

// Expose for quick console debugging
(Object.assign(window as any, { readMode, readName, wifiScan, summaryRefresh }));
