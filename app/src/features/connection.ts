import { ESPLoader, LoaderOptions, Transport } from "ffvr-esptool/index.js";
import { state } from "../core/state";
import { serialLib, startPortPresenceMonitor, handlePortDisconnected } from "../core/serial";
import { el, applyTabMode } from "../ui/dom";
import { updateConnStatusDot, hideConnectAlert, showConnectAlert } from "../ui/alerts";
import { dbg } from "../ui/debug";

function cleanChipName(name: string): string {
  return typeof name === "string" ? name.replace(/\s*\(.*?\)/g, "").trim() : name as any;
}

function extractDeviceInfo(dev: any): { serial?: string; product?: string; manufacturer?: string; comName?: string } {
  const out: { serial?: string; product?: string; manufacturer?: string; comName?: string } = {};
  try {
    const usb = dev?.device || dev?.device_ || dev?.usbDevice || dev?._device || dev?.port_?.device;
    if (usb) {
      out.serial = usb.serialNumber || usb.serial || usb.sn || undefined;
      out.product = usb.productName || usb.product || undefined;
      out.manufacturer = usb.manufacturerName || usb.manufacturer || undefined;
    }
  } catch (_) {}
  return out;
}

export function wireConnection(term: any) {
  const connectButton = el.connectButton();
  const baudSel = el.baudrates();
  const disconnectButton = el.disconnectButton();
  const traceButton = el.traceButton();
  const eraseButton = el.eraseButton();

  if (connectButton) connectButton.onclick = async () => {
    try {
      dbg('Connect clicked', 'info');
      hideConnectAlert();
      updateConnStatusDot(false);
      state.isConsoleClosed = true;
  // Always prompt for a port on connect to allow choosing a different COM after disconnect
  state.device = null;
  state.device = await serialLib.requestPort({});
      state.lastBaud = parseInt((baudSel as any).value) || 115200;
      // Always create a fresh transport (raw). Boot attempt will use it.
      state.transport = new Transport(state.device, true);

      // Attempt bootloader handshake with timeout; if fails, fall back to runtime JSON mode
      const attemptBoot = async (): Promise<boolean> => {
        try {
          const flashOptions = {
            transport: state.transport,
            baudrate: state.lastBaud,
            terminal: { clean() { term?.clear?.(); }, writeLine(d) { term?.writeln?.(d); }, write(d) { term?.write?.(d); } },
            debugLogging: el.debugLogging()?.checked,
          } as unknown as LoaderOptions;
          state.esploader = new ESPLoader(flashOptions);
          const bootPromise = state.esploader.main();
          const chip = await Promise.race([
            bootPromise,
            new Promise<string>((_, rej) => setTimeout(() => rej(new Error('boot timeout')), 2500))
          ]) as string;
          state.chip = chip;
          try {
            state.deviceMac = await (state.esploader as any).chip.readMac(state.esploader);
          } catch (e) {
            dbg(`WARN: Could not read MAC: ${((e as any)?.message ?? e)}`, 'info');
            state.deviceMac = null;
          }
          state.connectionMode = 'boot';
          dbg(`Bootloader mode connected: ${state.chip}`, 'info');
          return true;
        } catch (e) {
          dbg(`Bootloader handshake failed (${(e as any)?.message || e}); trying runtime CDC...`, 'info');
          try { state.esploader = null; } catch {}
          return false;
        }
      };

      const successBoot = await attemptBoot();
      if (!successBoot) {
        // Runtime mode: just mark as connected; we can still use transport for JSON tools.
        state.connectionMode = 'runtime';
        state.chip = null;
        state.deviceMac = null;
      }

      // Compose label parts
      el.lblBaudrate() && (el.lblBaudrate()!.style.display = "none");
      const info = extractDeviceInfo((state.transport as any)?.device);
      const parts: string[] = [];
      if (state.connectionMode === 'runtime') parts.push('Runtime (CDC)');
      if (state.chip) parts.push(cleanChipName(state.chip));
      if ((info as any).serial && (info as any).product) parts.push(`${(info as any).product} (SN ${(info as any).serial})`);
      else if ((info as any).serial) parts.push(`SN ${(info as any).serial}`);
      else if ((info as any).product && (info as any).manufacturer) parts.push(`${(info as any).manufacturer} ${(info as any).product}`);
      if (state.deviceMac) parts.push(state.deviceMac.toUpperCase());
      if ((baudSel as any)?.value) parts.push(`${(baudSel as any).value} baud`);
      if (el.lblConnTo()) { el.lblConnTo()!.innerHTML = `Connected: ${parts.join(" · ")}`; el.lblConnTo()!.style.display = "block"; }
      if (baudSel) (baudSel as any).style.display = "none";
      if (connectButton) connectButton.style.display = "none";
      if (disconnectButton) disconnectButton.style.display = "initial";
      // Only allow trace / erase / file flashing in boot mode
      if (state.connectionMode === 'boot') {
        if (traceButton) traceButton.style.display = "initial";
        if (eraseButton) eraseButton.style.display = "initial";
        el.filesDiv() && (el.filesDiv()!.style.display = "initial");
      } else {
        if (traceButton) traceButton.style.display = "none";
        if (eraseButton) eraseButton.style.display = "none";
        el.filesDiv() && (el.filesDiv()!.style.display = "none");
      }
      state.isConnected = true;
      (window as any).isConnected = true;
      updateConnStatusDot(true);
      hideConnectAlert();
      applyTabMode(state.connectionMode);
  // Notify UI of connection for UVC preview, etc.
  try { document.dispatchEvent(new CustomEvent('ffvr-connected')); } catch {}
  // Always select Update tab initially (new UX)
  const tabUpdate = document.querySelector('#tabs .tab[data-target="update"]') as HTMLElement | null;
  tabUpdate?.click();
      startPortPresenceMonitor();
    } catch (e: any) {
  // Logged to UI debug panel and terminal already
      term?.writeln?.(`Error: ${e.message}`);
      state.isConnected = false;
      (window as any).isConnected = false;
      updateConnStatusDot(false);
      showConnectAlert(`Connection failed: ${e?.message || e}`);
      dbg(`Connect error ${e?.message || e}`, 'info');
    }
  };

  if (traceButton) traceButton.onclick = async () => {
    if (state.transport) {
      dbg('Trace requested', 'info');
      state.transport.returnTrace();
    }
  };

  if (eraseButton) eraseButton.onclick = async () => {
    try { dbg('Erase flash requested', 'info'); } catch {}
    (eraseButton as HTMLButtonElement).disabled = true;
    try {
      state.isConsoleClosed = true;
      try {
        const tabs = Array.from(document.querySelectorAll('#tabs .tab')) as HTMLElement[];
        const consoleTab = tabs.find(t => t.dataset.target === 'console');
        if (consoleTab && !consoleTab.classList.contains('disabled')) consoleTab.click();
      } catch {}
      await state.esploader?.eraseFlash();
      dbg('Erase flash done', 'info');
    } catch (e: any) {
  dbg(`Erase error ${e?.message || e}`, 'info');
      term?.writeln?.(`Error: ${e.message}`);
    } finally {
      (eraseButton as HTMLButtonElement).disabled = false;
    }
  };

  if (disconnectButton) disconnectButton.onclick = async () => {
    await handlePortDisconnected('Disconnected by user');
  };
}
