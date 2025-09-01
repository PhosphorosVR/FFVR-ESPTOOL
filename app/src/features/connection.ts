import { ESPLoader, LoaderOptions, Transport } from "ffvr-esptool/index.js";
import { state } from "../core/state";
import { serialLib, startPortPresenceMonitor, handlePortDisconnected } from "../core/serial";
import { el } from "../ui/dom";
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
      if (state.device === null) {
        state.device = await serialLib.requestPort({});
      }
      state.transport = new Transport(state.device, true);
      const flashOptions = {
        transport: state.transport,
        baudrate: parseInt((baudSel as any).value),
        terminal: { clean() { term?.clear?.(); }, writeLine(d) { term?.writeln?.(d); }, write(d) { term?.write?.(d); } },
        debugLogging: el.debugLogging()?.checked,
      } as unknown as LoaderOptions;
      state.lastBaud = parseInt((baudSel as any).value) || 115200;
      state.esploader = new ESPLoader(flashOptions);

      state.chip = await state.esploader.main();
      try {
        state.deviceMac = await (state.esploader as any).chip.readMac(state.esploader);
      } catch (e) {
        console.warn("Could not read MAC:", e);
        state.deviceMac = null;
      }
      dbg(`Connected to chip ${state.chip}${state.deviceMac ? ' MAC ' + state.deviceMac : ''}`, 'info');
      console.log("Settings done for :" + state.chip);
      el.lblBaudrate() && (el.lblBaudrate()!.style.display = "none");
      const info = extractDeviceInfo((state.transport as any)?.device);
      const parts: string[] = [];
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
      if (traceButton) traceButton.style.display = "initial";
      if (eraseButton) eraseButton.style.display = "initial";
      el.filesDiv() && (el.filesDiv()!.style.display = "initial");
      state.isConnected = true;
      (window as any).isConnected = true;
      updateConnStatusDot(true);
      hideConnectAlert();
      const tabProgram = document.querySelector('#tabs .tab[data-target="program"]') as HTMLElement | null;
      if (tabProgram) tabProgram.click();
      startPortPresenceMonitor();
    } catch (e: any) {
      console.error(e);
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
      console.error(e);
      term?.writeln?.(`Error: ${e.message}`);
      dbg(`Erase error ${e?.message || e}`, 'info');
    } finally {
      (eraseButton as HTMLButtonElement).disabled = false;
    }
  };

  if (disconnectButton) disconnectButton.onclick = async () => {
    await handlePortDisconnected('Disconnected by user');
  };
}
