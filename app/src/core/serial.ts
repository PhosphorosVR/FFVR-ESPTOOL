import { Transport } from "ffvr-esptool/index.js";
import { state } from "./state";
import { el, setTabsEnabled } from "../ui/dom";
import { updateConnStatusDot, showConnectAlert } from "../ui/alerts";
import { dbg } from "../ui/debug";
import { serial as serialPoly } from "web-serial-polyfill";

const hasSerial = typeof (navigator as any).serial !== 'undefined';
const hasUsb = typeof (navigator as any).usb !== 'undefined';
export const serialLib: any = (!hasSerial && hasUsb) ? serialPoly : (navigator as any).serial;

let serialEventsAttached = false;
let portMonitorTimer: any = null;

export function attachSerialEventHandlers() {
  const serAny = serialLib as any;
  if (serialEventsAttached || !(serAny && serAny.addEventListener)) return;
  try {
    serAny.addEventListener('disconnect', async (event: any) => {
      const evPort = (event && (event.target || event.port || event.detail?.port)) || null;
      if (state.device && (!evPort || evPort === state.device)) {
        await handlePortDisconnected('Device disconnected');
      }
    });
  } catch {}
  serialEventsAttached = true;
}

export function startPortPresenceMonitor() {
  if (portMonitorTimer) return;
  portMonitorTimer = setInterval(async () => {
    try {
      const ports = await (serialLib as any)?.getPorts?.();
      if (!state.device) return;
      if (Array.isArray(ports) && ports.indexOf(state.device) === -1) {
        await handlePortDisconnected('Device disconnected');
      }
    } catch {}
  }, 2000);
}

export function stopPortPresenceMonitor() {
  if (portMonitorTimer) {
    try { clearInterval(portMonitorTimer); } catch {}
    portMonitorTimer = null;
  }
}

export async function handlePortDisconnected(reason: string = 'Device disconnected') {
  try { dbg(`Port disconnected: ${reason}`, 'info'); } catch {}
  try { stopPortPresenceMonitor(); } catch {}
  try { state.isConsoleClosed = true; } catch {}
  try {
    if (state.transport) {
      try { await state.transport.disconnect(); } catch {}
      try { await state.transport.waitForUnlock(500); } catch {}
    }
  } catch {}
  try {
    state.isConnected = false;
    (window as any).isConnected = false;
  updateConnStatusDot(false);
  const lblConn = el.lblConnTo(); if (lblConn && lblConn.style) lblConn.style.display = 'none';
  const lblBaud = el.lblBaudrate(); if (lblBaud && lblBaud.style) lblBaud.style.display = 'initial';
  const baudSel = el.baudrates(); if (baudSel && (baudSel as any).style) (baudSel as any).style.display = 'initial';
  const btnConnect = el.connectButton(); if (btnConnect) btnConnect.style.display = 'initial';
  const btnDisconnect = el.disconnectButton(); if (btnDisconnect) btnDisconnect.style.display = 'none';
  const btnTrace = el.traceButton(); if (btnTrace) btnTrace.style.display = 'none';
  const btnErase = el.eraseButton(); if (btnErase) btnErase.style.display = 'none';
  const files = el.filesDiv(); if (files) files.style.display = 'none';
    try {
      setTabsEnabled(false);
      const tabs = el.tabs();
      tabs.forEach(t => t.classList.remove('active'));
      ['program','console','tools','update'].forEach((id) => {
        const section = document.getElementById(id);
        if (section) (section as HTMLElement).style.display = 'none';
      });
    } catch {}
    showConnectAlert(reason);
  } catch {}
}

export async function ensureTransportConnected(baud?: number) {
  if (state.device === null) {
    state.device = await serialLib.requestPort({});
  }
  if (state.transport) {
    try { await state.transport.disconnect(); } catch {}
    try { await state.transport.waitForUnlock(500); } catch {}
  }
  state.transport = new Transport(state.device, true);
  const sel = el.baudrates();
  const b = baud || state.lastBaud || parseInt((sel as any)?.value || '115200');
  state.lastBaud = b;
  await state.transport.connect(b);
}

attachSerialEventHandlers();
