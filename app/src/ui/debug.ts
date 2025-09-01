import { el } from "./dom";

export function initDebugPanel() {
  try {
    const panel = el.debugPanel();
    const toggle = el.debugLogging();
    const apply = () => {
      if (!panel || !toggle) return;
      panel.style.display = toggle.checked ? '' : 'none';
    };
    toggle?.addEventListener('change', apply);
    apply();
  } catch {}
}

export function dbg(msg: string, dir: 'tx'|'rx'|'info' = 'info') {
  try {
    const out = el.debugLog();
    const toggle = el.debugLogging();
    if (!out) return;
    if (dir !== 'info' && toggle && !toggle.checked) return;
    const ts = new Date().toISOString().split('T')[1].replace('Z','');
    let prefix = '--';
    if (dir === 'tx') prefix = '📤';
    else if (dir === 'rx') prefix = '📡';
    out.textContent += `[${ts}] ${prefix} ${msg}\n`;
    out.scrollTop = out.scrollHeight;
  } catch {}
}
