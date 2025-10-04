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
  // If auto-reconnect preselected a device reuse it, else prompt.
  if (!state.device) {
    state.device = await serialLib.requestPort({});
  }
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
      } else {
        // Try to fetch version info via who_am_i (if available through runtime JSON? skip if not)
        try {
          // Bootloader may not expose JSON; leave placeholder for future if available
          // sessionStorage.setItem('ffvr_device_version', <value>) if retrievable
        } catch {}
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
  // Open flashing tab automatically in boot mode; otherwise go to Update tab
  try {
    const tabProgram = document.querySelector('#tabs .tab[data-target="program"]') as HTMLElement | null;
    const tabUpdate = document.querySelector('#tabs .tab[data-target="update"]') as HTMLElement | null;
    if (state.connectionMode === 'boot') {
      // Prefer showing update tab for Upgrade workflow
      if (tabUpdate && !tabUpdate.classList.contains('disabled')) tabUpdate.click(); else tabProgram?.click();
      // Apply previously detected board firmware selection if stored
      try {
        const saved = sessionStorage.getItem('ffvr_detected_board');
        if (saved) {
          // Debug log about previously detected board
          try { const { dbg } = await import('../ui/debug'); dbg(`Previously detected board: ${saved} (attempting auto firmware select)`, 'info'); } catch {}
          // Ensure manifest loaded (idempotent) then select
          try {
            const { loadPrebuiltManifest } = await import('../features/firmwareManifest');
            await loadPrebuiltManifest();
          } catch {}
          // Delay a tick to allow select rendering
          const attemptSelect = (tries: number): void => {
            try {
              const sel = document.getElementById('prebuiltSelect') as HTMLSelectElement | null;
              if (!sel) { if (tries > 0) return void setTimeout(() => attemptSelect(tries-1), 120); return; }
              // Aggregated visible group is 'FFVR'; hidden board groups were merged. We map via option[data-board]
              const ffvrGroup = sel.querySelector('optgroup[label="FFVR"]') as HTMLOptGroupElement | null;
              if (!ffvrGroup) { if (tries > 0) return void setTimeout(() => attemptSelect(tries-1), 120); return; }
              let targetOpt: HTMLOptionElement | null = ffvrGroup.querySelector(`option[data-board="${saved}"]`);
              if (!targetOpt) {
                // Fallback heuristic by label patterns
                const opts = Array.from(ffvrGroup.querySelectorAll('option')) as HTMLOptionElement[];
                const lc = saved.toLowerCase();
                if (/face/.test(lc)) targetOpt = opts.find(o => /face/i.test(o.textContent || '')) || null;
                else if (/eye.*l/.test(lc)) targetOpt = opts.find(o => /eye\s*L/i.test(o.textContent || '')) || null;
                else if (/eye.*r/.test(lc)) targetOpt = opts.find(o => /eye\s*R/i.test(o.textContent || '')) || null;
              }
              let applied = false;
              if (targetOpt) {
                try { sessionStorage.setItem('ffvr_recommended_value', targetOpt.value); } catch {}
                applied = true;
              }
              (async () => {
                try {
                  const { showConnectAlert } = await import('../ui/alerts');
                  if (applied) showConnectAlert(`Detected board ${saved}.`, 'success');
                  else showConnectAlert(`Detected board ${saved} – no matching firmware found in FFVR list.`, 'error');
                } catch {}
              })();
              if (!applied && tries > 0) setTimeout(() => attemptSelect(tries-1), 160);
            } catch { if (tries > 0) { setTimeout(() => attemptSelect(tries-1), 160); } }
          };
          setTimeout(() => attemptSelect(5), 150);
        } else {
          try { const { dbg } = await import('../ui/debug'); dbg('No previously detected board in sessionStorage.', 'info'); } catch {}
        }
      } catch {}
    } else {
      tabUpdate?.click();
    }
  } catch {}
      startPortPresenceMonitor();
    } catch (e: any) {
  // Logged to UI debug panel and terminal already
      term?.writeln?.(`Error: ${e.message}`);
      state.isConnected = false;
      (window as any).isConnected = false;
      updateConnStatusDot(false);
  showConnectAlert(`Connection failed: ${e?.message || e}`,'error');
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
