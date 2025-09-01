import { state } from "../core/state";
import { serialLib } from "../core/serial";
import { dbg } from "./debug";
import { Transport } from "ffvr-esptool/index.js";

declare let Terminal;

let term: any;

export function getTerminal() {
  return term;
}

export function initTerminal() {
  term = new Terminal({ cols: 120, rows: 39, convertEol: true, scrollback: 5000 });
  const container = document.getElementById('terminal');
  term.open(container);
  try {
    const startBtn = document.getElementById('consoleStartButton');
    if (startBtn) { (startBtn as any).value = 'Start Monitoring'; (startBtn as any).textContent = 'Start Monitoring'; }
  } catch {}

  // Autoscroll support
  const getViewport = (): HTMLElement | null => {
    try {
      const container = document.getElementById('terminal');
      return (container?.querySelector('.xterm-viewport') as HTMLElement) || null;
    } catch { return null; }
  };
  let autoScroll = true;
  const isAtBottom = (): boolean => {
    const vp = getViewport();
    if (!vp) return true;
    return (vp.scrollTop + vp.clientHeight) >= (vp.scrollHeight - 2);
  };
  try {
    const vp = getViewport();
    if (vp) {
      vp.addEventListener('scroll', () => { autoScroll = isAtBottom(); });
    }
    // @ts-ignore
    term.onScroll?.(() => { autoScroll = isAtBottom(); });
  } catch {}
  try {
    // @ts-ignore
    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      const isCopy = (ev.ctrlKey || ev.metaKey) && (ev.key === 'c' || ev.key === 'C');
      if (isCopy) {
        const sel = (term as any).getSelection ? (term as any).getSelection() : '';
        if (sel && sel.length) {
          try { navigator.clipboard?.writeText(sel); } catch {}
          ev.preventDefault?.();
          return false;
        }
      }
      return true;
    });
  } catch {}

  // Adjust terminal size on section visibility and window resizes
  const adjustTerminalSize = () => {
    try {
      const wrap = document.getElementById('terminalWrapper');
      const isFull = wrap?.classList.contains('fullscreen');
      term.resize(120, isFull ? 39 : 20);
    } catch {}
  };
  (window as any).adjustTerminalSize = adjustTerminalSize;
  try {
    const consoleSection = document.getElementById('console');
    if (consoleSection) {
      const mo = new MutationObserver(() => {
        if ((consoleSection as HTMLElement).style.display !== 'none') {
          setTimeout(() => {
            adjustTerminalSize();
            try { autoScroll = isAtBottom(); if (autoScroll) term.scrollToBottom(); } catch {}
          }, 50);
        } else {
          try { (document.getElementById('consoleStopButton') as any)?.onclick?.(); } catch {}
        }
      });
      mo.observe(consoleSection, { attributes: true, attributeFilter: ['style'] });
    }
  } catch {}
  try { window.addEventListener('resize', () => { adjustTerminalSize(); }); } catch {}
}

export async function startConsole() {
  const startBtn = document.getElementById('consoleStartButton') as HTMLElement | null;
  const stopBtn = document.getElementById('consoleStopButton') as HTMLElement | null;
  const resetButton = document.getElementById('resetButton') as HTMLElement | null;
  const expandBtn = document.getElementById('terminalExpandBtn') as HTMLElement | null;
  try {
    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'initial';
    if (resetButton) resetButton.style.display = 'initial';
    if (expandBtn) expandBtn.style.display = 'initial';
  } catch {}
  try {
    if (state.device === null) {
      state.device = await serialLib.requestPort({});
    }
    if (state.transport) {
      try { await state.transport.disconnect(); } catch {}
      try { await state.transport.waitForUnlock(500); } catch {}
    }
  state.transport = new Transport(state.device, true);
    const baud = state.lastBaud || 115200;
    state.lastBaud = baud;
    await state.transport.connect(baud);
    dbg(`Console transport connected ${baud}`, 'info');
  } catch (e) {
    await new Promise(r => setTimeout(r, 100));
    try { await state.transport?.connect(state.lastBaud); } catch (e2) { console.warn('Console connect issue:', e2); }
  }
  state.isConsoleClosed = false;

  const dec = new TextDecoder();
  let consoleBuf = '';
  while (!state.isConsoleClosed) {
    try {
      const readLoop = (state.transport as any).rawRead();
      const { value, done } = await readLoop.next();
      if (done) break;
      if (!value || (value as any).length === 0) {
        await new Promise(r => setTimeout(r, 30));
        continue;
      }
      let text = '';
      try { text = dec.decode(value as any, { stream: true }); } catch {}
      if (text) {
        consoleBuf += text;
        let lineIdx = consoleBuf.lastIndexOf("\n");
        if (lineIdx !== -1) {
          const lines = consoleBuf.slice(0, lineIdx + 1);
          consoleBuf = consoleBuf.slice(lineIdx + 1);
          term?.write?.(lines.replace(/\r?\n/g, "\r\n"));
          dbg(`Console rx ${JSON.stringify(lines)}`, 'rx');
        }
      }
    } catch (_) {}
  }
}

export function stopConsole() {
  const startBtn = document.getElementById('consoleStartButton') as HTMLElement | null;
  const stopBtn = document.getElementById('consoleStopButton') as HTMLElement | null;
  const resetButton = document.getElementById('resetButton') as HTMLElement | null;
  const expandBtn = document.getElementById('terminalExpandBtn') as HTMLElement | null;
  try { dbg('Console stop requested', 'info'); } catch {}
  state.isConsoleClosed = true;
  if (startBtn) startBtn.style.display = 'initial';
  if (stopBtn) stopBtn.style.display = 'none';
  if (resetButton) resetButton.style.display = 'none';
  if (expandBtn) expandBtn.style.display = 'none';
}

// Wire Reset button: try toggling DTR/RTS for a soft reset; fallback to sending a BREAK-like sequence
(() => {
  const btn = document.getElementById('resetButton') as HTMLButtonElement | null;
  if (!btn) return;
  btn.onclick = async () => {
    try {
      const dev: any = (state.transport as any)?.device;
      // Try Web Serial controlSignals if available
      if (dev?.setSignals) {
        try { await dev.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch {}
        await new Promise(r => setTimeout(r, 120));
        try { await dev.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch {}
        dbg('Sent DTR/RTS toggle for reset', 'info');
        return;
      }
    } catch {}
    try {
      // Fallback: send a couple of newlines to poke the device
      const enc = new TextEncoder();
      const writer = (state.transport as any)?.device?.writable?.getWriter?.();
      if (writer) { await writer.write(enc.encode("\r\n")); try { writer.releaseLock(); } catch {} }
    } catch {}
  };
})();
